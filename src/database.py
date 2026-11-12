from __future__ import annotations

from collections.abc import Generator
from typing import Any

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from src.config import get_settings


class Base(DeclarativeBase):
    pass


def create_db_engine(database_url: str | None = None):
    url = database_url or get_settings().database_url
    connect_args: dict[str, Any] = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = create_engine(
        url,
        connect_args=connect_args,
        pool_pre_ping=True,
        future=True,
    )

    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _enable_sqlite_fk(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_db_engine()
    return _engine


def get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=get_engine(),
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
    return _SessionLocal


def reset_engine(database_url: str | None = None) -> None:
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = create_db_engine(database_url)
    _SessionLocal = sessionmaker(
        bind=_engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )


def init_db(engine=None) -> None:
    import src.models  # noqa: F401

    target_engine = engine or get_engine()
    Base.metadata.create_all(bind=target_engine)


def get_db() -> Generator[Session, None, None]:
    factory = get_session_factory()
    db = factory()
    try:
        yield db
    finally:
        db.close()


def check_db_health(db: Session) -> dict[str, Any]:
    try:
        db.execute(text("SELECT 1"))
        dialect = db.bind.dialect.name if db.bind else "unknown"
        return {"connected": True, "engine": dialect}
    except Exception as exc:
        return {"connected": False, "engine": "unavailable", "error": str(exc)}
