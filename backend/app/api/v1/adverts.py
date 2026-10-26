"""The advert the app shows in its advert slot (ADR-067; ADR-056 decision 2).

Signed-in users only. The app gets the advert showing now (or nothing) and its picture; it never
sees adverts that are scheduled, ended or switched off, or who added them.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import CurrentPrincipal, get_auth_runtime, get_db_session
from app.services.adverts import AdvertService, current_advert
from app.services.auth import AuthRuntime

__all__ = ["router"]

router = APIRouter(prefix="/api/v1/adverts", tags=["adverts"])


@router.get("/current", summary="The advert to show now, or null")
async def current(
    principal: CurrentPrincipal,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> Any:
    del principal  # signed-in users only
    a = await current_advert(db, runtime.clock())
    out = (
        None
        if a is None
        else {
            "id": str(a.id),
            "name": a.name,
            "link_url": a.link_url,
            "width": a.width,
            "height": a.height,
            "image_path": f"/api/v1/adverts/{a.id}/image",
        }
    )
    await db.rollback()
    return out


@router.get("/{advert_id}/image", summary="The picture of the advert showing now")
async def image(
    advert_id: uuid.UUID,
    principal: CurrentPrincipal,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> Response:
    del principal
    found = await AdvertService(db, runtime.clock, runtime.object_store).picture(None, advert_id)
    if found is None:
        return Response(status_code=status.HTTP_404_NOT_FOUND)
    data, content_type = found
    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        },
    )
