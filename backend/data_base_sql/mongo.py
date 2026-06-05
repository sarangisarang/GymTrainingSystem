import os
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

mongo_client: Optional[AsyncIOMotorClient] = None
mongo_db: Optional[AsyncIOMotorDatabase] = None


def mongo_enabled() -> bool:
    return bool(os.getenv("MONGO_URL"))


async def init_mongo() -> None:
    """Initialize MongoDB connection if configured via MONGO_URL."""
    global mongo_client, mongo_db

    mongo_url = os.getenv("MONGO_URL")
    mongo_db_name = os.getenv("MONGO_DB", "ma_logs")

    if not mongo_url:
        mongo_client = None
        mongo_db = None
        return

    mongo_client = AsyncIOMotorClient(mongo_url)
    mongo_db = mongo_client[mongo_db_name]

    collection = get_log_collection()
    if collection is not None:
        await collection.create_index("ts")
        await collection.create_index("event_type")
        await collection.create_index("path")
        await collection.create_index("trace_id")


async def close_mongo() -> None:
    global mongo_client, mongo_db
    if mongo_client is not None:
        mongo_client.close()
    mongo_client = None
    mongo_db = None


def get_mongo_db() -> Optional[AsyncIOMotorDatabase]:
    return mongo_db


def get_log_collection() -> Optional[AsyncIOMotorCollection]:
    if mongo_db is None:
        return None
    return mongo_db[os.getenv("MONGO_LOG_COLLECTION", "request_logs")]
