import logging
import time
from datetime import datetime, timezone
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware

from data_base_sql.mongo import get_log_collection

logger = logging.getLogger(__name__)


class MongoRequestLoggingMiddleware(BaseHTTPMiddleware):
    async def _write_log(self, request, trace_id: str, status_code: int, duration_ms: float, error_message: str | None):
        collection = get_log_collection()
        if collection is None:
            return

        log_doc = {
            "ts": datetime.now(timezone.utc),
            "event_type": "HTTP_REQUEST",
            "trace_id": trace_id,
            "method": request.method,
            "path": request.url.path,
            "query": str(request.url.query),
            "status_code": status_code,
            "duration_ms": duration_ms,
            "client_host": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "error": error_message,
        }

        try:
            await collection.insert_one(log_doc)
        except Exception as log_exc:
            logger.warning("MongoDB request log failed: %s", log_exc)

    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        trace_id = request.headers.get("x-request-id", str(uuid4()))

        try:
            response = await call_next(request)
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            await self._write_log(
                request=request,
                trace_id=trace_id,
                status_code=500,
                duration_ms=duration_ms,
                error_message=str(exc),
            )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        await self._write_log(
            request=request,
            trace_id=trace_id,
            status_code=response.status_code,
            duration_ms=duration_ms,
            error_message=None,
        )

        response.headers["x-request-id"] = trace_id
        return response
