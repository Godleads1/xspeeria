"""Error tracking with Sentry (ADR-074; owner 2026-11-01: "wire it in, off").

Off unless ``SENTRY_DSN`` is set. Sentry is an approved vendor "with strict scrubbing"
(Standing Standards, vendors): it must never receive passwords, PINs, codes, tokens, partner or
bank credentials, KYC documents, financial payloads or secrets. So only the error itself goes:
its type, message and stack (file, function, line), the environment and the release.

Removed from every event before it leaves the server (``scrub``):

* the request's headers, cookies, body, query string and client address;
* the user (Sentry is never told who was signed in);
* local variables in stack frames (they can hold any of the above);
* breadcrumbs' data and messages (only their category and time are kept);
* any ``extra`` or ``contexts`` other than the runtime and OS.

No performance tracing (``traces_sample_rate`` 0) and no profiling.
"""

from __future__ import annotations

from typing import Any

from app.core.config import Settings

__all__ = ["init_error_tracking", "scrub"]

_KEEP_CONTEXTS = {"runtime", "os", "trace"}
_KEEP_REQUEST = {"method", "url"}


def _strip_url(url: object) -> object:
    """The path only: no query string, no fragment."""
    if not isinstance(url, str):
        return None
    return url.split("?", 1)[0].split("#", 1)[0]


def scrub(event: dict[str, Any], _hint: dict[str, Any] | None = None) -> dict[str, Any]:
    """Remove everything but the error itself. Pure; used as Sentry's ``before_send``."""
    request = event.get("request")
    if isinstance(request, dict):
        kept = {k: v for k, v in request.items() if k in _KEEP_REQUEST}
        if "url" in kept:
            kept["url"] = _strip_url(kept["url"])
        event["request"] = kept
    event.pop("user", None)
    event.pop("extra", None)
    event.pop("server_name", None)
    contexts = event.get("contexts")
    if isinstance(contexts, dict):
        event["contexts"] = {k: v for k, v in contexts.items() if k in _KEEP_CONTEXTS}
    for exc in (event.get("exception") or {}).get("values") or []:
        for frame in ((exc or {}).get("stacktrace") or {}).get("frames") or []:
            frame.pop("vars", None)
    for thread in (event.get("threads") or {}).get("values") or []:
        for frame in ((thread or {}).get("stacktrace") or {}).get("frames") or []:
            frame.pop("vars", None)
    crumbs = event.get("breadcrumbs")
    if isinstance(crumbs, dict):
        crumbs["values"] = [
            {k: v for k, v in c.items() if k in ("category", "timestamp", "level", "type")}
            for c in crumbs.get("values") or []
            if isinstance(c, dict)
        ]
    return event


def init_error_tracking(settings: Settings) -> bool:
    """Start Sentry when a DSN is configured. Returns whether it started."""
    if not settings.sentry_dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        release=settings.sentry_release or None,
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        traces_sample_rate=0.0,
        before_send=scrub,  # type: ignore[arg-type]
        before_send_transaction=lambda _event, _hint: None,
    )
    return True
