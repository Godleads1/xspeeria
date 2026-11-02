"""Run the API: ``uv run python -m app.serve`` (ADR-079).

Use this instead of calling ``uvicorn`` directly. It turns off uvicorn's ``server: uvicorn``
response header, which would tell anyone which web server (and so which framework family)
runs Xspeeria. Host and port: ``--host``/``--port``, or ``HOST``/``PORT`` (defaults 127.0.0.1:8000).
Proxy headers stay untrusted (ADR-025 §4).
"""

from __future__ import annotations

import argparse
import os

import uvicorn

__all__ = ["main", "server_options"]


def server_options(argv: list[str] | None = None) -> dict[str, object]:
    parser = argparse.ArgumentParser(description="Run the Xspeeria API.")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    args = parser.parse_args(argv)
    return {
        "host": args.host,
        "port": args.port,
        "server_header": False,
        "proxy_headers": False,
        "access_log": False,  # the app logs each request itself, without query strings
    }


def main(argv: list[str] | None = None) -> None:
    uvicorn.run("app.main:app", **server_options(argv))  # type: ignore[arg-type]


if __name__ == "__main__":
    main()
