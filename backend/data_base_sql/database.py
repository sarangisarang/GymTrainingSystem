import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker


# ============================================================
# Database configuration
# ============================================================
#
# The connection string is read from the DATABASE_URL environment
# variable so the same code runs unchanged in three setups:
#
#   1. Local dev      → unset → falls back to a local SQLite file
#   2. Docker Compose → postgresql://gym:gym@db:5432/gym
#   3. AWS (RDS)      → postgresql://<user>:<pass>@<rds-host>:5432/gym
#
# Defaulting to SQLite keeps "git clone && run" working with zero setup,
# while production simply injects a PostgreSQL URL via the environment.
# ------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./gym.db")

# SQLite needs `check_same_thread=False` because FastAPI serves requests
# from multiple threads and SQLite otherwise rejects cross-thread access.
# This argument is invalid for PostgreSQL, so only pass it for SQLite.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# `pool_pre_ping` transparently checks a pooled connection before handing it
# out, which prevents "server closed the connection" errors against managed
# databases (RDS) that drop idle connections. It is harmless for SQLite.
engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,
)


# ============================================================
# Session factory
# ============================================================
#
# SessionLocal produces a fresh database session per request.
#   autocommit=False → changes are persisted only on an explicit commit()
#   autoflush=False  → no implicit flush on every query, we control timing
# ------------------------------------------------------------

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


# ============================================================
# Declarative base for all ORM models
# ============================================================
#
# Every model subclasses this base, e.g.:
#   class User(Base):
#       __tablename__ = "users"
# ------------------------------------------------------------

Base = declarative_base()


# ============================================================
# FastAPI dependency
# ============================================================

def get_db():
    """Yield a database session and guarantee it is closed afterwards.

    FastAPI resolves this dependency once per request:
        @router.get("/example")
        def route(db: Session = Depends(get_db)):
            return db.query(User).all()

    Flow: open session → hand to the route → always close on completion,
    even if the route raises.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
