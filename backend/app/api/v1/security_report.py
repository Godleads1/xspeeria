"""The "this wasn't me" link in security emails — ADR-084 (owner 2026-11-02).

* ``GET /api/v1/security/not-me/{token}`` — a plain page asking the customer to confirm.
  It changes nothing: email scanners open links by themselves.
* ``POST /api/v1/security/not-me/{token}`` — the page's button: freeze the account.

No login: the one-time token in the link (made when the email was sent, 7 days, SHA-256 only
in the database) is what lets the person act, and all it can do is freeze the account. The
page shows no name, number or amount, never asks for a PIN or code, and is limited per
address like sign-in.
"""

from __future__ import annotations

import base64
import hashlib
import html
from typing import Annotated

from fastapi import APIRouter, Depends, Path
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import get_auth_runtime, get_db_session, limit_by_address
from app.services.auth import AuthRuntime
from app.services.security_notices import NotMeService, ReportOutcome

__all__ = ["router"]

router = APIRouter(
    prefix="/api/v1/security/not-me",
    tags=["security"],
    dependencies=[Depends(limit_by_address)],
    include_in_schema=False,
)

_CSS = (
    "body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:32rem;"
    "margin:3rem auto;padding:0 1rem;line-height:1.5;color:#111}"
    "h1{font-size:1.4rem}button{font-size:1rem;padding:.75rem 1.25rem;border:0;"
    "border-radius:.5rem;background:#b42318;color:#fff;cursor:pointer}"
    ".note{color:#555;font-size:.9rem}"
)
_CSS_HASH = base64.b64encode(hashlib.sha256(_CSS.encode()).digest()).decode()
_HEADERS = {
    "Cache-Control": "no-store",
    # The token is in the address: never send it on to another site.
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": (
        f"default-src 'none'; style-src 'sha256-{_CSS_HASH}'; form-action 'self'; "
        "frame-ancestors 'none'; base-uri 'none'"
    ),
}

_FROZEN = (
    "<h1>Your account is frozen</h1>"
    "<p>Every device is logged out. No one can log in, and no deals or payouts happen, until "
    "Xspeeria staff check the account with you and switch it back on.</p>"
    "<p>We have sent you an email to confirm. Please contact Xspeeria support.</p>"
    "<p class=note>Never share your PIN or codes with anyone, including Xspeeria staff.</p>"
)
_INVALID = (
    "<h1>This link doesn't work</h1>"
    "<p>It may have expired (links work for 7 days) or the account was already frozen from "
    "another email.</p>"
    "<p>If you think someone else is using your account, open the Xspeeria app, reset your "
    "PIN, and contact Xspeeria support.</p>"
)


def _ask(subject: str | None) -> str:
    what = html.escape(subject or "A change to your Xspeeria account")
    return (
        "<h1>Wasn't you?</h1>"
        f"<p>We emailed you about this: <strong>{what}</strong>.</p>"
        "<p>If you didn't do it, freeze your account now. Every device will be logged out, "
        "and no deals or payouts will happen until Xspeeria staff check the account with you "
        "and switch it back on.</p>"
        '<form method="post"><button type="submit">Freeze my account</button></form>'
        "<p class=note>This page never asks for your PIN or a code. If this was you, close "
        "this page; nothing has changed.</p>"
    )


def _page(body: str) -> HTMLResponse:
    page = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta name="robots" content="noindex">'
        f"<title>Xspeeria account security</title><style>{_CSS}</style></head>"
        f"<body>{body}</body></html>"
    )
    return HTMLResponse(page, headers=_HEADERS)


async def get_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> NotMeService:
    return NotMeService(db, runtime.clock)


Service = Annotated[NotMeService, Depends(get_service)]
Token = Annotated[str, Path(max_length=64)]

_PAGES: dict[ReportOutcome, str] = {"frozen": _FROZEN, "already": _FROZEN, "invalid": _INVALID}


@router.get("/{token}", response_class=HTMLResponse)
async def confirm_page(token: Token, service: Service) -> HTMLResponse:
    outcome, subject = await service.look(token)
    return _page(_ask(subject) if outcome == "ask" else _PAGES[outcome])


@router.post("/{token}", response_class=HTMLResponse)
async def report(token: Token, service: Service) -> HTMLResponse:
    outcome = await service.report(token)
    return _page(_PAGES["invalid" if outcome == "ask" else outcome])
