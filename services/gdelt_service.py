"""
Module: app.services.gdelt_service

Responsibility:
    Handles outbound communication with the GDELT API.

    This module:
        - builds monitoring queries
        - fetches upstream news items
        - returns normalized dict payloads
        - deduplicates articles across topics

    Strategy:
        - Poll every configured topic per run
        - Deduplicate results by URL so the same article cannot
          appear twice even if matched by multiple topics
        - Inter-topic delay + jitter reduces burst pressure on GDELT
        - Per-topic retry with separate backoff curves for 429 vs
          transient network errors; honours Retry-After when present
        - Topics are shuffled on each run to distribute load evenly
          across the list over time instead of always hammering the
          same terms first

    No persistence or websocket logic lives here.
"""

import asyncio
import logging
import random
from datetime import UTC, datetime
from typing import Any

import httpx

logger = logging.getLogger(__name__)

MONITOR_TOPICS: list[str] = [
    "shipping delays",
    "factory shutdown",
    "steel shortage",
    "logistics crisis",
    "port congestion",
    "freight disruption",
    "raw material shortage",
    "manufacturing delays",
    "transport strike",
    "industrial shutdown",
]

GDELT_API_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

REQUEST_TIMEOUT = httpx.Timeout(connect=10.0, read=15.0, write=8.0, pool=8.0)

# Per-topic retry budget (applies to both 429 and network errors)
MAX_RETRIES = 3

# Backoff base for transient network errors:  1 s → 2 s → 4 s
RETRY_BASE_SECS = 1.0

# Backoff base for 429 responses (longer, since the server is overloaded):
# 3 s → 6 s → 12 s
RATE_LIMIT_BASE_SECS = 3.0

# How many topics to pick per poll run.
# Topics are chosen randomly each run, so the full list is covered over time.
TOPICS_PER_POLL = 3

# Maximum number of topics fetched concurrently (must be ≤ TOPICS_PER_POLL).
CONCURRENCY = 3

# Stagger between requests within the same concurrent batch (seconds).
# Prevents all CONCURRENCY slots from hitting GDELT at the exact same millisecond.
SLOT_STAGGER_SECS = 0.4


async def poll(max_records: int = 3) -> list[dict[str, Any]]:
    """
    Poll GDELT for all configured monitoring topics concurrently.

    Up to CONCURRENCY topics are fetched at the same time.  Within each
    concurrent batch, requests are staggered by SLOT_STAGGER_SECS to
    avoid hitting GDELT at the exact same millisecond.  Results are
    deduplicated by URL across topics.

    Returns:
        Flat list of normalized article payloads, deduplicated by URL.

    Raises:
        RuntimeError: If every topic failed and no articles were collected.
    """
    errors: list[str] = []
    topics = random.sample(MONITOR_TOPICS, k=TOPICS_PER_POLL)
    sem = asyncio.Semaphore(CONCURRENCY)
    done_event = asyncio.Event()  # set by the first topic that returns articles

    logger.info("Poll starting topics=%d/%d selected=%s",
                TOPICS_PER_POLL, len(MONITOR_TOPICS), topics)

    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        verify=True,
        http2=False,
        headers={"User-Agent": "DataISourceMonitor/1.0"},
    ) as client:

        async def _bounded(index: int, topic: str) -> tuple[str, list[dict[str, Any]]]:
            # Skip queued tasks once any topic has already produced results
            if done_event.is_set():
                return topic, []
            async with sem:
                # Re-check after acquiring the semaphore slot
                if done_event.is_set():
                    return topic, []
                await asyncio.sleep((index % CONCURRENCY) * SLOT_STAGGER_SECS)
                articles = await _fetch_topic(client, topic, max_records, errors)
                if articles:
                    done_event.set()
                return topic, articles

        raw = await asyncio.gather(
            *(_bounded(i, t) for i, t in enumerate(topics)),
            return_exceptions=True,
        )

    pairs: list[tuple[str, list[dict[str, Any]]]] = []
    for result in raw:
        if isinstance(result, BaseException):
            logger.error("Unexpected topic fetch failure: %s", result)
            errors.append(str(result))
        else:
            pairs.append(result)

    seen_urls: set[str] = set()
    results: list[dict[str, Any]] = []

    for topic, articles in pairs:
        new = 0
        for article in articles:
            url = article.get("url", "")
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            results.append(_normalize(article, topic))
            new += 1
        if new:
            logger.info(
                "Collected %d new article(s) topic='%s' (total=%d)",
                new, topic, len(results),
            )

    logger.info("Completed GDELT polling total_articles=%d", len(results))

    if not results and errors:
        raise RuntimeError(
            "All GDELT polling attempts failed: " + " | ".join(errors)
        )

    return results


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _fetch_topic(
    client: httpx.AsyncClient,
    topic: str,
    max_records: int,
    errors: list[str],
) -> list[dict[str, Any]]:
    """
    Fetch articles for a single *topic* with retry logic.

    Returns the list of raw article dicts (may be empty).
    Appends a human-readable message to *errors* on failure.
    """
    params = {
        "query": f'"{topic}" sourcelang:English',
        "timespan": "7days",
        "maxrecords": max_records,
        "mode": "artlist",
        "format": "json",
    }

    logger.info("Polling GDELT topic='%s'", topic)

    last_exc: Exception | None = None

    for attempt in range(MAX_RETRIES):

        try:
            response = await client.get(GDELT_API_URL, params=params)

            if response.status_code == 429:
                wait = _rate_limit_wait(response, attempt)
                logger.warning(
                    "GDELT rate limit topic='%s' attempt=%d retry_in=%.1fs",
                    topic, attempt + 1, wait,
                )
                if attempt == MAX_RETRIES - 1:
                    response.raise_for_status()
                await asyncio.sleep(wait)
                continue

            response.raise_for_status()

        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
            wait = RETRY_BASE_SECS * (2 ** attempt)
            logger.warning(
                "Network error topic='%s' attempt=%d retry_in=%.1fs error=%s",
                topic, attempt + 1, wait, exc,
            )
            last_exc = exc
            if attempt == MAX_RETRIES - 1:
                break
            await asyncio.sleep(wait)
            continue

        except httpx.HTTPStatusError as exc:
            logger.error("HTTP error topic='%s' status=%d", topic, exc.response.status_code)
            errors.append(f"HTTP {exc.response.status_code} for topic='{topic}'")
            return []

        # Successful response — parse it
        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            logger.warning("Non-JSON response topic='%s' content_type='%s'", topic, content_type)
            return []

        payload = response.json()
        articles = payload.get("articles") or []

        logger.info("GDELT returned %d article(s) topic='%s'", len(articles), topic)
        return articles

    # Exhausted retries
    msg = f"Exhausted retries for topic='{topic}'"
    errors.append(msg)
    if last_exc:
        logger.exception("Network failure topic='%s'", topic)
    else:
        logger.error("%s", msg)
    return []


def _rate_limit_wait(response: httpx.Response, attempt: int) -> float:
    """
    Return how long to wait after a 429 response.
    Prefers the Retry-After header; falls back to exponential backoff.
    """
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return max(1.0, float(retry_after))
        except ValueError:
            pass
    return RATE_LIMIT_BASE_SECS * (2 ** attempt)


def _normalize(article: dict[str, Any], topic: str) -> dict[str, Any]:
    """Convert a raw GDELT article dict into the shape expected by alert_service."""
    return {
        "source_name": "gdelt",
        "source_item_id": article.get("url"),
        "title": article.get("title"),
        "url": article.get("url"),
        "published_at": _parse_gdelt_datetime(article.get("seendate")),
        "query": topic,
        "matched_terms": [topic],
        "raw_payload": article,
    }


def _parse_gdelt_datetime(value: str | None) -> datetime | None:
    """
    Convert a GDELT seendate string to a Python datetime.

    Example input: ``20260513T011200Z``
    """
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
    except ValueError:
        logger.warning("Failed parsing GDELT datetime value='%s'", value)
        return None
