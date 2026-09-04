import asyncio
import hmac
import os
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl

from aria2_client import Aria2Client


DB_PATH = Path(
    os.getenv(
        "DATABASE_PATH",
        "/data/ariahub.db",
    )
)

# API_KEY protects every /api/* route except /api/health. Set it via the
# API_KEY environment variable (docker-compose / .env). If it is left empty,
# auth is disabled -- fine for local/dev use, NOT recommended once the
# frontend port is exposed to the internet.
API_KEY = os.getenv("API_KEY", "")

# Only the frontend's own origin needs to call this API (nginx proxies
# /api/ same-origin), so CORS can stay locked down. Override via
# CORS_ALLOW_ORIGINS (comma-separated) if you serve the frontend from a
# different origin than the API.
_cors_origins_env = os.getenv("CORS_ALLOW_ORIGINS", "")
CORS_ALLOW_ORIGINS = (
    [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    if _cors_origins_env
    else []
)

app = FastAPI(
    title="AriaHub API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

aria2 = Aria2Client()


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    # Never gate CORS preflight requests -- browsers send OPTIONS without
    # custom headers like X-API-Key, so blocking it here would break CORS
    # for any cross-origin setup.
    if request.method == "OPTIONS":
        return await call_next(request)

    if API_KEY and request.url.path != "/api/health":
        provided = request.headers.get("x-api-key", "")
        if not hmac.compare_digest(provided, API_KEY):
            # IMPORTANT: return a JSONResponse here, not raise HTTPException.
            # Exceptions raised inside @app.middleware("http") are NOT
            # caught by FastAPI's JSON exception handlers -- they bubble
            # out as a plain-text "Internal Server Error" 500, which
            # breaks any client calling response.json().
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing API key"},
            )

    return await call_next(request)


class DownloadRequest(BaseModel):
    url: HttpUrl
    filename: Optional[str] = None


def get_db():
    DB_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    connection = sqlite3.connect(
        DB_PATH
    )

    connection.row_factory = sqlite3.Row

    return connection


def init_db():
    with closing(get_db()) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS downloads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gid TEXT UNIQUE NOT NULL,
                url TEXT NOT NULL,
                filename TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_status TEXT DEFAULT 'waiting'
            )
            """
        )

        conn.commit()


@app.on_event("startup")
def startup():
    init_db()
    if not API_KEY:
        print(
            "WARNING: API_KEY is not set - all /api/ endpoints are "
            "unauthenticated. Set API_KEY in .env before exposing this "
            "service publicly.",
            flush=True,
        )


@app.get("/api/health")
async def health():
    try:
        version = await aria2.get_version()

        return {
            "status": "ok",
            "aria2": version,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        )


@app.post("/api/downloads")
async def add_download(
    request: DownloadRequest,
):
    options = {}

    if request.filename:
        options["out"] = request.filename

    try:
        gid = await aria2.add_url(
            str(request.url),
            options,
        )

        with closing(get_db()) as conn:
            conn.execute(
                """
                INSERT INTO downloads
                    (gid, url, filename, last_status)
                VALUES (?, ?, ?, ?)
                """,
                (
                    gid,
                    str(request.url),
                    request.filename,
                    "waiting",
                ),
            )

            conn.commit()

        return {
            "success": True,
            "gid": gid,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )


async def _refresh_status(row: sqlite3.Row) -> dict:
    """Fetch live aria2 status for one row without blocking on the others."""
    item = dict(row)

    try:
        status = await aria2.get_status(row["gid"])
        item.update(status)
        new_status = status.get("status", row["last_status"])
    except Exception:
        item["status"] = row["last_status"]
        new_status = None

    return item, row["gid"], new_status


@app.get("/api/downloads")
async def get_downloads():
    with closing(get_db()) as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM downloads
            ORDER BY id DESC
            """
        ).fetchall()

    # Poll aria2 for every download's live status concurrently instead of
    # one RPC round-trip at a time -- this used to be O(n) sequential calls.
    refreshed = await asyncio.gather(*(_refresh_status(row) for row in rows))

    results = []
    updates = []

    for item, gid, new_status in refreshed:
        results.append(item)
        if new_status is not None:
            updates.append((new_status, gid))

    if updates:
        with closing(get_db()) as conn:
            conn.executemany(
                """
                UPDATE downloads
                SET last_status = ?
                WHERE gid = ?
                """,
                updates,
            )
            conn.commit()

    return {
        "downloads": results,
    }


@app.get("/api/downloads/{gid}")
async def get_download(gid: str):

    try:
        return await aria2.get_status(gid)

    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        )


@app.post("/api/downloads/{gid}/pause")
async def pause_download(gid: str):

    try:
        result = await aria2.pause(gid)

        with closing(get_db()) as conn:
            conn.execute(
                """
                UPDATE downloads
                SET last_status = 'paused'
                WHERE gid = ?
                """,
                (gid,),
            )

            conn.commit()

        return {
            "success": True,
            "gid": result,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )


@app.post("/api/downloads/{gid}/resume")
async def resume_download(gid: str):

    try:
        result = await aria2.resume(gid)

        with closing(get_db()) as conn:
            conn.execute(
                """
                UPDATE downloads
                SET last_status = 'active'
                WHERE gid = ?
                """,
                (gid,),
            )

            conn.commit()

        return {
            "success": True,
            "gid": result,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )


@app.delete("/api/downloads/{gid}")
async def remove_download(gid: str):

    current_status = None

    try:
        status = await aria2.get_status(gid)
        current_status = status.get("status")
    except Exception:
        pass

    try:
        if current_status in (
            "active",
            "waiting",
            "paused",
        ):
            await aria2.force_remove(gid)
        else:
            await aria2.remove_result(gid)

    except Exception:
        pass

    with closing(get_db()) as conn:
        conn.execute(
            """
            DELETE FROM downloads
            WHERE gid = ?
            """,
            (gid,),
        )

        conn.commit()

    return {
        "success": True,
        "gid": gid,
    }
