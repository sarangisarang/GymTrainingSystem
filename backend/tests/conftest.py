"""Pytest fixtures: in-memory SQLite + TestClient with a fresh authenticated user per test.

Tests do not touch the dev `gym.db` — the `get_db` dependency is overridden to a
shared in-memory engine (StaticPool so connections see the same data).
"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

# Make the `backend/` directory importable (so `from main import app` works).
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from data_base_sql.database import Base, get_db
from main import app

# A single shared in-memory database for the whole test session.
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)
Base.metadata.create_all(bind=test_engine)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth_client(client: TestClient) -> tuple[TestClient, str]:
    """TestClient + JWT for a freshly registered user (data isolation per test)."""
    email = f"tester_{uuid.uuid4().hex[:10]}@example.com"
    password = "TestPass123!"
    client.post("/auth/register", json={"name": "Tester", "email": email, "password": password})
    r = client.post("/auth/login", json={"email": email, "password": password})
    return client, r.json()["access_token"]
