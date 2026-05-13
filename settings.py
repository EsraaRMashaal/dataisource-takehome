"""
Module: app.settings

Responsibility:
    Declares and validates all application configuration via
    Pydantic BaseSettings, reading values from environment variables
    and the .env file at startup.

Why it exists:
    Externalising configuration follows the 12-factor app principle.
    A single, typed settings object prevents scattered os.getenv()
    calls and gives early failure on missing required values.

Architecture fit:
    Imported by server.py, database.py, gdelt_service.py, and any
    module that needs runtime configuration (ports, DB path, API keys,
    polling intervals, GDELT query terms, log level).
    Should never import from other app modules to avoid circular deps.
"""

from pathlib import Path

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve env file paths relative to this file so they are found correctly
# regardless of the working directory uvicorn is launched from.
_HERE = Path(__file__).parent


class Settings(BaseSettings):
    # ── Application ───────────────────────────────────────────────────────
    app_env: str = "local"
    port: int = 8000
    log_level: str = "INFO"

    # Comma-separated origins accepted by CORS middleware.
    # Set CORS_ORIGINS='["https://app.example.com"]' in production.
    cors_origins: list[str] = ["*"]

    # ── Database ──────────────────────────────────────────────────────────
    # Full path to the SQLite file; overridden in Docker via SQLITE_DB_PATH env var.
    sqlite_db_path: str = "/app/data/DataISource-takehome.sqlite3"

    # ── GDELT monitoring ──────────────────────────────────────────────────
    monitor_source: str = "gdelt"
    gdelt_query: str = "manufacturing supply chain disruption"
    poll_interval_seconds: int = 300

    # ── Confidence scoring weights ─────────────────────────────────────────
    confidence_weight_pattern:    float = 0.5
    confidence_weight_validation: float = 0.3
    confidence_weight_context:    float = 0.2

    model_config = SettingsConfigDict(
        # app/.env is the primary config file (resolved relative to this module).
        # env vars set in the shell or Docker always take precedence over file values.
        env_file=(_HERE / ".env",),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @computed_field
    @property
    def database_url(self) -> str:
        """SQLAlchemy async connection string derived from sqlite_db_path."""
        return f"sqlite+aiosqlite:///{self.sqlite_db_path}"


# Module-level singleton — import `settings` everywhere instead of re-instantiating.
settings = Settings()
