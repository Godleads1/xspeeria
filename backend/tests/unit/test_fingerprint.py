"""ADR-079: answers don't name the framework or the web server."""

from __future__ import annotations

from typing import Literal

import httpx
import pytest
from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict

from app.core.config import Settings
from app.core.exceptions import install_exception_handlers
from app.main import create_app
from app.serve import server_options

pytestmark = pytest.mark.asyncio


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str
    age: int


_NAMES = ("fastapi", "starlette", "uvicorn", "pydantic", "python", "swagger", "field required")


def test_the_server_never_sends_its_name() -> None:
    opts = server_options([])
    assert opts["server_header"] is False
    assert opts["proxy_headers"] is False
    assert opts["host"] == "127.0.0.1"
    assert server_options(["--host", "0.0.0.0", "--port", "9000"])["port"] == 9000


async def _answers(app_env: Literal["development", "production"]) -> list[httpx.Response]:
    app = create_app(Settings(_env_file=None, app_env=app_env))  # type: ignore[call-arg]
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        return [
            await c.get("/nope"),
            await c.delete("/health"),
            await c.get("/docs"),
            await c.get("/openapi.json"),
            await c.get("/redoc"),
            await c.get("/health"),
        ]


async def test_production_answers_name_no_framework() -> None:
    answers = await _answers("production")
    assert [r.status_code for r in answers] == [404, 405, 404, 404, 404, 200]
    for r in answers:
        blob = (r.text + " " + " ".join(f"{k}: {v}" for k, v in r.headers.items())).lower()
        assert not any(n in blob for n in _NAMES), r.text
        assert "server" not in r.headers and "x-powered-by" not in r.headers


async def test_validation_errors_are_plain() -> None:
    app = FastAPI()
    install_exception_handlers(app)

    @app.post("/x")
    async def x(body: Body) -> dict[str, str]:  # pragma: no cover - never valid here
        return {}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/x", json={"age": "old", "role": "admin"})
    assert r.status_code == 422
    errors = r.json()["error"]["details"]["errors"]
    assert sorted(errors, key=lambda e: e["field"]) == [
        {"field": "age", "in": "body", "problem": "invalid"},
        {"field": "email", "in": "body", "problem": "missing"},
        {"field": "role", "in": "body", "problem": "not_allowed"},
    ]
    assert not any(n in r.text.lower() for n in _NAMES)
    assert "old" not in r.text  # the submitted value is never echoed
