"""
Module: app.workers.polling_worker

Responsibility:
    Implements the async coroutine that executes a single GDELT
    polling cycle on each scheduled tick. Calls news_processor to
    run the full fetch → deduplicate → persist pipeline and logs
    the outcome (items fetched, new alerts created, errors).

Why it exists:
    Separating the worker coroutine from the scheduler lets the
    polling logic be invoked both on schedule (via scheduler.py)
    and on demand (via the REST trigger endpoint) with identical
    behaviour.

Architecture fit:
    Instantiated and managed by scheduler.py. Calls
    app.services.news_processor.run_poll_cycle(). Structured log
    output here feeds monitoring dashboards and alerting rules.
"""
