"""
Module: app.services.gdelt_service

HTTP client for the GDELT Document 2.0 API.

Responsibilities:
    - Build monitoring queries from the configured topic list
    - Fetch and normalize article payloads
    - Deduplicate results by URL across topics
    - Retry on transient network errors and 429 rate-limits
    - Provide an is_healthy() probe for health-check endpoints

No persistence, no WebSocket, and no alert logic live here.
"""

import asyncio
import logging
import random
from datetime import UTC, datetime
from typing import Any

import httpx

from app.settings import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_DEFAULT_TOPICS = [
    "shipping delays", "factory shutdown",
    "raw material shortage", "manufacturing delays",
]

def _monitor_topics() -> list[str]:
    raw = (settings.gdelt_query or "").strip()
    if not raw:
        return _DEFAULT_TOPICS
    return [t.strip() for t in raw.split(",") if t.strip()]


GDELT_API_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

REQUEST_TIMEOUT = httpx.Timeout(connect=10.0, read=15.0, write=8.0, pool=8.0)

# Per-topic retry budget
MAX_RETRIES = 3

# Exponential backoff base for transient network errors:  1 s → 2 s → 4 s
RETRY_BASE_SECS = 1.0

# Exponential backoff base for 429 responses (longer):  3 s → 6 s → 12 s
RATE_LIMIT_BASE_SECS = 3.0

# How many topics to sample per poll run
TOPICS_PER_POLL = 3

# Maximum concurrent topic fetches (must be ≤ TOPICS_PER_POLL)
CONCURRENCY = 3

# Stagger within a batch to avoid hitting GDELT at the exact same millisecond
SLOT_STAGGER_SECS = 0.4


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def poll(max_records: int = 3) -> list[dict[str, Any]]:
    """
    Poll GDELT for a random sample of configured monitoring topics.

    Up to CONCURRENCY topics are fetched concurrently, staggered by
    SLOT_STAGGER_SECS.  Results are deduplicated by URL.  The first topic
    that returns articles sets a done_event that allows queued tasks to
    skip early (short-circuit optimisation).

    Returns:
        Flat list of normalized article payloads, deduplicated by URL.

    Raises:
        RuntimeError: if every sampled topic failed and no articles were collected.
    """
    errors: list[str] = []
    all_topics = _monitor_topics()
    topics = random.sample(all_topics, k=min(TOPICS_PER_POLL, len(all_topics)))
    sem = asyncio.Semaphore(CONCURRENCY)
    done_event = asyncio.Event()

    logger.info(
        "Poll starting — topics=%d/%d selected=%s",
        len(topics), len(all_topics), topics,
    )

    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        verify=True,
        http2=False,
        headers={"User-Agent": "DataISourceMonitor/1.0"},
    ) as client:

        async def _bounded(index: int, topic: str) -> tuple[str, list[dict[str, Any]]]:
            if done_event.is_set():
                return topic, []
            async with sem:
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

    logger.info("GDELT polling complete — total_articles=%d", len(results))

    if not results and errors:
        raise RuntimeError("All GDELT polling attempts failed: " + " | ".join(errors))

    return results


async def fetch_single_topic(
    topic: str,
    max_records: int = 5,
) -> list[dict[str, Any]]:
    """
    Fetch articles for a single topic and return normalized results.
    Useful for targeted searches and testing individual queries.
    """
    errors: list[str] = []
    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        verify=True,
        http2=False,
        headers={"User-Agent": "DataISourceMonitor/1.0"},
    ) as client:
        articles = await _fetch_topic(client, topic, max_records, errors)

    if errors:
        logger.warning("fetch_single_topic errors: %s", errors)

    return [_normalize(a, topic) for a in articles]


async def is_healthy() -> bool:
    """
    Probe GDELT reachability with a minimal request.
    Returns True if the API responds with a 2xx or 4xx (server is up),
    False on connection/timeout errors.
    """
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0), http2=False) as client:
            response = await client.get(
                GDELT_API_URL,
                params={"query": "test", "maxrecords": 1, "mode": "artlist", "format": "json"},
            )
            return response.status_code < 500
    except (httpx.ConnectError, httpx.TimeoutException):
        return False


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
    Fetch articles for *topic* with retry logic.
    Returns article list (may be empty). Appends to *errors* on failure.
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

        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            logger.warning(
                "Non-JSON response topic='%s' content_type='%s'", topic, content_type
            )
            return []

        payload = response.json()
        articles = payload.get("articles") or []
        logger.info("GDELT returned %d article(s) topic='%s'", len(articles), topic)
        return articles

    msg = f"Exhausted retries for topic='{topic}'"
    errors.append(msg)
    if last_exc:
        logger.exception("Network failure topic='%s'", topic)
    else:
        logger.error("%s", msg)
    return []


def _rate_limit_wait(response: httpx.Response, attempt: int) -> float:
    """Return wait seconds after a 429, preferring Retry-After over backoff."""
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
        "source_name":    "gdelt",
        "source_item_id": article.get("url"),
        "title":          article.get("title") or "Untitled",
        "url":            article.get("url", ""),
        "published_at":   _parse_gdelt_datetime(article.get("seendate")),
        "query":          topic,
        "matched_terms":  [topic],
        "raw_payload":    article,
    }


def _parse_gdelt_datetime(value: str | None) -> datetime | None:
    """
    Convert a GDELT seendate string to a UTC datetime.

    Example input: ``20260513T011200Z``
    """
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
    except ValueError:
        logger.warning("Failed parsing GDELT datetime value='%s'", value)
        return None
