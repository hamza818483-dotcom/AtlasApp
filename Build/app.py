from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import yt_dlp
import asyncio

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://atlasprep.pages.dev", "http://localhost"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "Atlas Proxy running"}

@app.get("/dl")
async def get_download_link(vid: str = Query(..., min_length=5, max_length=20)):
    """
    vid = YouTube video ID (e.g. dQw4w9WgXcQ)
    Returns best MP4 download URL (direct link, no redirect)
    """
    url = f"https://www.youtube.com/watch?v={vid}"

    ydl_opts = {
        "format": "bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best[ext=mp4]",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "extractor_retries": 2,
    }

    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, lambda: _extract(url, ydl_opts))
        
        if not info:
            raise HTTPException(status_code=404, detail="Video info not found")

        # Get direct URL
        direct_url = info.get("url") or (info.get("formats") or [{}])[-1].get("url")
        if not direct_url:
            raise HTTPException(status_code=404, detail="No downloadable URL found")

        return JSONResponse({
            "url": direct_url,
            "title": info.get("title", ""),
            "duration": info.get("duration", 0),
            "ext": "mp4"
        })

    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(status_code=400, detail=f"yt-dlp error: {str(e)[:200]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:200])


def _extract(url, opts):
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)
