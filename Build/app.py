from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import yt_dlp
import asyncio

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/dl")
async def get_dl(vid: str = Query(..., min_length=5, max_length=20)):
    url = f"https://www.youtube.com/watch?v={vid}"
    
    # Try multiple client strategies
    strategies = [
        {"extractor_args": {"youtube": {"player_client": ["android_vr"]}}},
        {"extractor_args": {"youtube": {"player_client": ["android"]}}},
        {"extractor_args": {"youtube": {"player_client": ["tv_embedded"]}}},
        {},  # default
    ]
    
    opts_base = {
        "format": "best[ext=mp4][height<=720]/best[ext=mp4]/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "socket_timeout": 20,
    }
    
    last_err = None
    for strategy in strategies:
        opts = {**opts_base, **strategy}
        try:
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(None, lambda o=opts: _ex(url, o))
            if not info:
                continue
            
            direct_url = None
            for f in reversed(info.get("formats") or []):
                if f.get("url") and f.get("vcodec","") != "none" and f.get("acodec","") != "none" and f.get("ext") == "mp4":
                    direct_url = f["url"]
                    break
            if not direct_url:
                direct_url = info.get("url") or (info.get("formats") or [{}])[-1].get("url")
            
            if direct_url:
                return JSONResponse({"url": direct_url, "title": info.get("title",""), "ext": "mp4"})
        except Exception as e:
            last_err = str(e)
            continue
    
    raise HTTPException(status_code=400, detail=f"All strategies failed: {last_err}")

def _ex(url, opts):
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)
