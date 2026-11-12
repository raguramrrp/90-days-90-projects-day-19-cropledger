from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.api.routes import router as api_router
from src.config import BASE_DIR, get_settings
from src.data.demo_dataset import seed_demo_data_if_empty
from src.database import get_session_factory, init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    init_db()
    if settings.seed_demo_on_empty:
        db = get_session_factory()()
        try:
            seed_demo_data_if_empty(db)
        finally:
            db.close()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="CropLedger API",
        description="Agricultural Market Intelligence & Selling Decision Platform",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:8000",
            "http://localhost:8000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    frontend_dist = BASE_DIR / "frontend" / "dist"
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found.")
        index_html = frontend_dist / "index.html"
        if index_html.exists():
            candidate = (frontend_dist / full_path).resolve()
            if full_path and candidate.is_file() and frontend_dist.resolve() in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(index_html)
        return {
            "app": "CropLedger API",
            "docs": "/docs",
            "message": "Frontend production bundle not built yet. Run npm --prefix frontend run build.",
        }

    return app


app = create_app()
