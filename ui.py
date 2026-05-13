"""
Module: app.ui

Responsibility:
    Serves the static upload UI — HTML page and its CSS/JS assets.
    Kept separate from server.py to avoid cluttering the app factory.
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(include_in_schema=False)

_STATIC_DIR  = Path(__file__).parent / "static"
_HOME_PAGE   = _STATIC_DIR / "index.html"


@router.get("/")
@router.get("/index.html")
async def home_ui() -> FileResponse:
    return FileResponse(_HOME_PAGE, media_type="text/html")

@router.get("/css/{filename}")
async def css_file(filename: str) -> FileResponse:
    path = _STATIC_DIR / "css" / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="text/css")


@router.get("/js/{filename}")
async def js_file(filename: str) -> FileResponse:
    path = _STATIC_DIR / "js" / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="application/javascript")


@router.get("/partials/{filename}")
async def partial_file(filename: str) -> FileResponse:
    path = _STATIC_DIR / "partials" / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="text/html")

