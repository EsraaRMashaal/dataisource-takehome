"""
Package: app.workers

Responsibility:
    Background workers and their scheduler. Responsible for time-driven
    or event-driven tasks that run independently of HTTP request cycles.

Why it exists:
    Background polling must survive request/response boundaries.
    Grouping worker concerns here keeps them decoupled from the API
    layer and independently startable (e.g. as a separate container
    or thread in local dev).

Architecture fit:
    Workers are started and stopped in the FastAPI lifespan hook
    defined in server.py. They call into app.services.* for
    business logic and never touch the database directly.
"""
