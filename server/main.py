import json
from pathlib import Path

import filelock
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).parent
CACHE_DIR = BASE_DIR / ".cache"
SETTINGS_FILE = BASE_DIR / "settings.json"
LOCK_FILE = str(SETTINGS_FILE) + ".lock"
CLIENT_DIR = BASE_DIR.parent / "client"

AUDIO_EXTENSIONS = {".mp3", ".flac", ".ogg", ".wav", ".m4a", ".opus"}

DEFAULT_SETTINGS: dict = {
    "volume": 1.0,
    "current_index": 0,
}


def get_tracks() -> list[Path]:
    """Return a sorted list of audio files found in .cache/."""
    CACHE_DIR.mkdir(exist_ok=True)
    return sorted(
        f
        for f in CACHE_DIR.iterdir()
        if f.is_file() and f.suffix.lower() in AUDIO_EXTENSIONS
    )


def read_settings() -> dict:
    with filelock.FileLock(LOCK_FILE):
        if not SETTINGS_FILE.exists():
            SETTINGS_FILE.write_text(json.dumps(DEFAULT_SETTINGS, indent=2))
            return DEFAULT_SETTINGS.copy()
        return json.loads(SETTINGS_FILE.read_text())


def write_settings(data: dict) -> None:
    with filelock.FileLock(LOCK_FILE):
        SETTINGS_FILE.write_text(json.dumps(data, indent=2))


def merge_settings(updates: dict) -> dict:
    """Read > merge > write in a single lock acquisition to avoid TOCTOU."""
    with filelock.FileLock(LOCK_FILE):
        current = (
            json.loads(SETTINGS_FILE.read_text())
            if SETTINGS_FILE.exists()
            else DEFAULT_SETTINGS.copy()
        )
        current.update(updates)
        SETTINGS_FILE.write_text(json.dumps(current, indent=2))
        return current


app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/tracks")
def list_tracks():
    """Return the sorted list of track filenames in .cache/."""
    return [t.name for t in get_tracks()]


@app.get("/api/tracks/{filename}")
def stream_track(filename: str, request: Request):
    """
    Stream an audio file from .cache/ with full Range-request support.
    Starlette's FileResponse handles 206 Partial Content automatically,
    which is required for the browser's <audio> seek bar to work correctly.
    """
    # Prevent directory traversal
    path = (CACHE_DIR / filename).resolve()
    if not path.is_relative_to(CACHE_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not path.exists() or path.suffix.lower() not in AUDIO_EXTENSIONS:
        raise HTTPException(status_code=404, detail="Track not found")
    return FileResponse(path)


@app.get("/api/current")
def current_track():
    """
    Return the track at current_index WITHOUT advancing the index.
    Call this on page load so a refresh doesn't skip a song.
    """
    tracks = get_tracks()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks in .cache/")
    settings = read_settings()
    idx = settings.get("current_index", 0) % len(tracks)
    return {"filename": tracks[idx].name, "index": idx, "total": len(tracks)}


@app.post("/api/next")
def next_track():
    """
    Advance current_index by 1 and return the new track.
    Extend this endpoint to implement shuffle / priority logic.
    """
    tracks = get_tracks()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks in .cache/")
    settings = read_settings()
    next_idx = (settings.get("current_index", 0) + 1) % len(tracks)
    settings["current_index"] = next_idx
    write_settings(settings)
    return {"filename": tracks[next_idx].name, "index": next_idx, "total": len(tracks)}


@app.get("/api/settings")
def get_settings():
    return read_settings()


@app.post("/api/settings")
async def update_settings(request: Request):
    """
    Merge a partial settings object into settings.json.
    The read-modify-write happens inside a single lock acquisition.
    """
    body = await request.json()
    return merge_settings(body)


# Mount last to ensure no api paths blocked
app.mount("/", StaticFiles(directory=str(CLIENT_DIR), html=True), name="client")
