from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import yt_dlp
import asyncio
import subprocess
import sys

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "Atlas Proxy running"}

@app.get("/dl")
async def get_download_link(vid: str = Query(..., min_length=5, max_length=20)):
    url = f"https://www.youtube.com/watch?v={vid}"

    ydl_opts = {
        "format": "best[ext=mp4][height<=720]/best[ext=mp4]/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "extractor_retries": 3,
        "socket_timeout": 30,
        # Use android client to bypass bot detection
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "web"],
                "player_skip": ["webpage"],
            }
        },
        "http_headers": {
            "User-Agent": "com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip",
        },
    }

    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, lambda: _extract(url, ydl_opts))

        if not info:
            raise HTTPException(status_code=404, detail="Video info not found")

        # Get best URL from formats
        direct_url = None
        formats = info.get("formats") or []
        # Try to find a combined mp4 format first
        for f in reversed(formats):
            if f.get("ext") == "mp4" and f.get("url") and f.get("vcodec") != "none" and f.get("acodec") != "none":
                direct_url = f["url"]
                break
        # Fallback to any format with URL
        if not direct_url:
            direct_url = info.get("url")
        if not direct_url and formats:
            direct_url = formats[-1].get("url")

        if not direct_url:
            raise HTTPException(status_code=404, detail="No downloadable URL found")

        return JSONResponse({
            "url": direct_url,
            "title": info.get("title", ""),
            "duration": info.get("duration", 0),
            "ext": "mp4"
        })

    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(status_code=400, detail=f"yt-dlp error: {str(e)[:300]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:300])


def _extract(url, opts):
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)
