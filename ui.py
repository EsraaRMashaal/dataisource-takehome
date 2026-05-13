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

_NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"}


@router.get("/")
@router.get("/index.html")
async def home_ui() -> FileResponse:
    return FileResponse(_HOME_PAGE, media_type="text/html", headers=_NO_CACHE)

@router.get("/css/{filename}")
async def css_file(filename: str) -> FileResponse:
    path = _STATIC_DIR / "css" / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="text/css", headers=_NO_CACHE)


@router.get("/js/{filepath:path}")
async def js_file(filepath: str) -> FileResponse:
    path = (_STATIC_DIR / "js" / filepath).resolve()
    if not str(path).startswith(str((_STATIC_DIR / "js").resolve())):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="application/javascript", headers=_NO_CACHE)


@router.get("/partials/{filename}")
async def partial_file(filename: str) -> FileResponse:
    path = _STATIC_DIR / "partials" / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="text/html", headers=_NO_CACHE)

