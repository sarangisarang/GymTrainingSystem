import os
import logging
from contextlib import asynccontextmanager
from sqlalchemy import text
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from data_base_sql.database import Base, engine
from fastAPI_functions.auth import router as auth_router
from fastAPI_functions.users import router as users_router
from fastAPI_functions.exercises import router as exercises_router
from fastAPI_functions.workout import router as workout_router
from fastAPI_functions.workout_exercises import router as workout_exercises_router
from fastAPI_functions.programs import router as programs_router
from fastAPI_functions.ai_coach import router as ai_coach_router
from fastAPI_functions.reports import router as reports_router
from fastAPI_functions.coach_dashboard import router as coach_router
from fastAPI_functions.achievements import router as achievements_router
from fastAPI_functions.search import router as search_router
from fastAPI_functions.handoff import router as handoff_router


Base.metadata.create_all(bind=engine)


def ensure_sqlite_schema():
    """Leichte SQLite-Migration für nachträglich hinzugefügte Felder."""
    if engine.dialect.name != "sqlite":
        return

    workout_exercise_columns = {
        "rest_seconds": "ALTER TABLE workout_exercises ADD COLUMN rest_seconds INTEGER NOT NULL DEFAULT 30",
        "rest_limit_seconds": "ALTER TABLE workout_exercises ADD COLUMN rest_limit_seconds INTEGER NOT NULL DEFAULT 45",
        "order_index": "ALTER TABLE workout_exercises ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0",
    }
    program_item_columns = {
        "rest_seconds": "ALTER TABLE training_program_items ADD COLUMN rest_seconds INTEGER NOT NULL DEFAULT 90",
        "concentric_seconds": "ALTER TABLE training_program_items ADD COLUMN concentric_seconds INTEGER NOT NULL DEFAULT 1",
        "pause_seconds": "ALTER TABLE training_program_items ADD COLUMN pause_seconds INTEGER NOT NULL DEFAULT 0",
        "eccentric_seconds": "ALTER TABLE training_program_items ADD COLUMN eccentric_seconds INTEGER NOT NULL DEFAULT 2",
        "estimated_set_duration_seconds": "ALTER TABLE training_program_items ADD COLUMN estimated_set_duration_seconds INTEGER NOT NULL DEFAULT 0",
        "estimated_total_duration_seconds": "ALTER TABLE training_program_items ADD COLUMN estimated_total_duration_seconds INTEGER NOT NULL DEFAULT 0",
    }

    workout_columns = {
        "status": "ALTER TABLE workouts ADD COLUMN status TEXT NOT NULL DEFAULT 'PLANNED'",
        "duration_seconds": "ALTER TABLE workouts ADD COLUMN duration_seconds INTEGER",
        "completed_at": "ALTER TABLE workouts ADD COLUMN completed_at DATETIME",
    }

    with engine.begin() as conn:
        workout_existing = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(workout_exercises)"))
        }
        for column_name, ddl in workout_exercise_columns.items():
            if column_name not in workout_existing:
                conn.execute(text(ddl))

        workouts_existing = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(workouts)"))
        }
        for column_name, ddl in workout_columns.items():
            if column_name not in workouts_existing:
                conn.execute(text(ddl))

        program_existing = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(training_program_items)"))
        }
        for column_name, ddl in program_item_columns.items():
            if column_name not in program_existing:
                conn.execute(text(ddl))

        users_existing = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(users)"))
        }
        if "role" not in users_existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'athlete'"))
        if "leaderboard_opt_in" not in users_existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN leaderboard_opt_in INTEGER NOT NULL DEFAULT 0"))


ensure_sqlite_schema()


def check_startup_config() -> None:
    missing = []
    if not os.getenv("GEMINI_API_KEY"):
        missing.append("GEMINI_API_KEY")
    if missing:
        logging.warning(
            "⚠️  Missing environment variables: %s — "
            "AI Coach will return errors at runtime. "
            "Load .env before starting: set -a && source .env && set +a",
            ", ".join(missing),
        )


check_startup_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Re-index existing exercises on every startup so the semantic-search
    collection is warm even when Render's ephemeral disk wiped chroma_db on
    the latest deploy. Wrapped in try/except so a Chroma failure never blocks
    boot. Using the lifespan API (not the deprecated @app.on_event) so the
    hook also fires under `with TestClient(app) as c:` in tests."""
    try:
        from data_base_sql.database import SessionLocal
        from data_base_sql.vector_store import bootstrap_exercise_index

        db = SessionLocal()
        try:
            count = bootstrap_exercise_index(db)
            if count:
                logging.info("Vector index bootstrapped: %d exercises", count)
        finally:
            db.close()
    except Exception as exc:
        logging.warning("Vector index bootstrap failed: %s", exc)
    yield


app = FastAPI(title="TEAM3 Gym API", lifespan=lifespan)

# Local dev origins plus any extra ones supplied at runtime via ALLOWED_ORIGINS
# (comma-separated). The regex additionally allows any Render *.onrender.com
# deployment, so the hosted frontend works without hardcoding its random URL.
_default_origins = [
    "http://3.70.203.212",
    "http://3.70.203.212:3000",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
]
_env_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _env_origins,
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(os.path.join(STATIC_DIR, "exercises"), exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(exercises_router)
app.include_router(workout_router)
app.include_router(workout_exercises_router)
app.include_router(programs_router)
app.include_router(ai_coach_router)
app.include_router(reports_router)
app.include_router(coach_router)
app.include_router(achievements_router)
app.include_router(search_router)
app.include_router(handoff_router)


@app.get("/")
def root():
    return {"message": "Welcome", "docs": "/docs"}
