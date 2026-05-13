"""
Package: app

Root package for the FastAPI backend service.

Responsibility:
    Acts as the top-level namespace for the entire application.
    Importing from this package grants access to the app factory,
    settings, and all subpackages.

Why it exists:
    Python requires __init__.py to treat a directory as a package.
    Keeping this file minimal avoids circular imports at startup.

Architecture fit:
    Entry point for package resolution. All internal imports should
    flow downward from here (server → api → services → db), never upward.
"""
