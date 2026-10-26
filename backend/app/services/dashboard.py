"""Admin Analytics Dashboard figures (ADR-051 A-3, ADR-061).

Read-only. Every figure comes from what the platform records; nothing is estimated or
invented (owner decision 2026-10-26: "Real numbers only"). Tiles the Figma shows but the
platform has no source for (NPS, cost per acquisition, card and advert figures, uptime) are
not returned.

Money stays in integer minor units per currency, sent as strings with their scale; never a
float. Escrow appears only as a record of customer money waiting at partner banks
(ADR-051 decision 3), never as Xspeeria revenue.

Periods are calendar periods in Lagos time. Each count also comes with the same figure for
the period before, so the console can show the change.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.staff import StaffPrincipal, forbidden

__all__ = ["DashboardService", "Period", "period_bounds"]

LAGOS = ZoneInfo("Africa/Lagos")
Period = Literal["today", "month", "year", "custom"]

#: Settlement phases that ended without the trade completing.
FAILED_PHASES = ("CLOSED_UNWOUND", "CLOSED_RECOVERED", "CLOSED_WITH_LOSS", "CANCELLED")
#: Settlement-time buckets, in seconds (upper bound exclusive; last is open-ended).
SPEED_BUCKETS = (("lt_1m", 0, 60), ("1_5m", 60, 300), ("5_10m", 300, 600), ("10_60m", 600, 3600))


@dataclass(frozen=True)
class Window:
    start: datetime
    end: datetime
    prev_start: datetime
    prev_end: datetime
    #: Chart bucket: hour (today), day (a month), month (year to date).
    bucket: Literal["hour", "day", "month"]


def _at(d: date) -> datetime:
    return datetime.combine(d, time(0), tzinfo=LAGOS).astimezone(UTC)


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _next_month(d: date) -> date:
    return (d.replace(day=28) + timedelta(days=4)).replace(day=1)


def period_bounds(period: Period, now: datetime, month: str | None = None) -> Window:
    """Calendar period in Lagos time, plus the period before it of the same kind.

    ``month`` (``YYYY-MM``) is required for ``custom`` and must not be in the future.
    """
    today = now.astimezone(LAGOS).date()
    bucket: Literal["hour", "day", "month"]
    if period == "today":
        first, before, end, bucket = today, today - timedelta(days=1), now, "hour"
    elif period == "month":
        first = _month_start(today)
        before, end, bucket = _month_start(first - timedelta(days=1)), now, "day"
    elif period == "year":
        first, before, end, bucket = (
            date(today.year, 1, 1),
            date(today.year - 1, 1, 1),
            now,
            "month",
        )
    else:
        if month is None:
            raise ValueError("month required")
        year_s, _, month_s = month.partition("-")
        first = date(int(year_s), int(month_s), 1)
        if first > today:
            raise ValueError("future month")
        before, bucket = _month_start(first - timedelta(days=1)), "day"
        end = min(_at(_next_month(first)), now)
    start, prev_start = _at(first), _at(before)
    # The same length of time from the start of the period before, never running into this one
    # (31 March compares with all of February, not with 3 March).
    prev_end = min(prev_start + (end - start), start)
    return Window(start, end, prev_start, prev_end, bucket)


def _change(cur: int, prev: int) -> dict[str, int]:
    return {"value": cur, "previous": prev}


class DashboardService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _one(self, sql: str, **params: Any) -> Any:
        return (await self._db.execute(text(sql), params)).scalar_one()

    async def _rows(self, sql: str, **params: Any) -> list[Any]:
        return list((await self._db.execute(text(sql), params)).all())

    async def figures(
        self, principal: StaffPrincipal, period: Period, now: datetime, month: str | None = None
    ) -> dict[str, Any]:
        if not principal.can("dashboard.read"):
            raise forbidden()
        w = period_bounds(period, now, month)
        try:
            return {
                "period": {"kind": period, "start": w.start, "end": w.end, "bucket": w.bucket},
                "overview": await self._overview(w),
                "customers": await self._customers(w, now),
                "transactions": await self._transactions(w),
                "revenue": await self._revenue(w),
                "corridors": await self._corridors(w),
                "operations": await self._operations(w),
            }
        finally:
            await self._db.rollback()

    # --- counts that compare with the period before ------------------------------------------

    async def _both(self, sql: str, w: Window) -> dict[str, int]:
        cur = int(await self._one(sql, s=w.start, e=w.end))
        prev = int(await self._one(sql, s=w.prev_start, e=w.prev_end))
        return _change(cur, prev)

    async def _overview(self, w: Window) -> dict[str, Any]:
        active = (
            "SELECT count(DISTINCT user_id) FROM auth_sessions "
            "WHERE last_active_at >= :s AND last_active_at < :e"
        )
        new = "SELECT count(*) FROM users WHERE created_at >= :s AND created_at < :e"
        trades = "SELECT count(*) FROM transactions WHERE created_at >= :s AND created_at < :e"
        completed = (
            "SELECT count(*) FROM (SELECT s.id FROM settlements s "
            "JOIN settlement_legs l ON l.settlement_id = s.id WHERE s.phase = 'COMPLETED' "
            "GROUP BY s.id HAVING max(l.paid_out_at) >= :s AND max(l.paid_out_at) < :e) x"
        )
        avg_seconds = await self._one(
            "SELECT avg(extract(epoch FROM done - started)) FROM ("
            " SELECT s.created_at AS started, max(l.paid_out_at) AS done FROM settlements s"
            " JOIN settlement_legs l ON l.settlement_id = s.id WHERE s.phase = 'COMPLETED'"
            " GROUP BY s.id HAVING max(l.paid_out_at) >= :s AND max(l.paid_out_at) < :e) x",
            s=w.start,
            e=w.end,
        )
        return {
            "series": await self._series(w),
            "value_by_time": await self._money_by_time(w, "amount"),
            "active_users": await self._both(active, w),
            "new_users": await self._both(new, w),
            "trades_started": await self._both(trades, w),
            "trades_completed": await self._both(completed, w),
            "value": await self._money_completed(w, "amount_minor"),
            "fees": await self._money_completed(w, "fee_minor"),
            "avg_settlement_seconds": None if avg_seconds is None else int(avg_seconds),
            "open_disputes": int(
                await self._one(
                    "SELECT count(*) FROM disputes WHERE kind = 'dispute' AND status <> 'resolved'"
                )
            ),
            "kyc_waiting": int(
                await self._one(
                    "SELECT count(*) FROM kyc_cases WHERE status IN ('pending_documents', "
                    "'under_review')"
                )
            ),
        }

    async def _per_bucket(self, sql: str, w: Window) -> dict[str, int]:
        """``sql`` selects (bucket, count) with :b, :s and :e; returns bucket ISO -> count."""
        rows = await self._rows(sql, b=w.bucket, s=w.start, e=w.end)
        return {t.isoformat(): int(n or 0) for t, n in rows}

    async def _series(self, w: Window) -> list[dict[str, Any]]:
        """One row per bucket (hour, day or month, Lagos time) for the tiles' trend lines.

        Only buckets with something in them are returned; the console fills the gaps with 0.
        """
        q = {
            "active_users": (
                "SELECT date_trunc(:b, last_active_at AT TIME ZONE 'Africa/Lagos') t,"
                " count(DISTINCT user_id) "
                "FROM auth_sessions WHERE last_active_at >= :s AND last_active_at < :e GROUP BY t"
            ),
            "new_users": (
                "SELECT date_trunc(:b, created_at AT TIME ZONE 'Africa/Lagos') t,"
                " count(*) FROM users "
                "WHERE created_at >= :s AND created_at < :e GROUP BY t"
            ),
            "trades_started": (
                "SELECT date_trunc(:b, created_at AT TIME ZONE 'Africa/Lagos') t,"
                " count(*) FROM transactions "
                "WHERE created_at >= :s AND created_at < :e GROUP BY t"
            ),
            "trades_completed": (
                "SELECT date_trunc(:b, done AT TIME ZONE 'Africa/Lagos') t,"
                " count(*) FROM ("
                " SELECT max(l.paid_out_at) AS done FROM settlements s JOIN settlement_legs l"
                " ON l.settlement_id = s.id WHERE s.phase = 'COMPLETED' GROUP BY s.id"
                " HAVING max(l.paid_out_at) >= :s AND max(l.paid_out_at) < :e) x GROUP BY t"
            ),
            "settlement_seconds": (
                "SELECT date_trunc(:b, done AT TIME ZONE 'Africa/Lagos') t,"
                " avg(extract(epoch FROM done - started))"
                " FROM (SELECT s.created_at AS started, max(l.paid_out_at) AS done"
                " FROM settlements s JOIN settlement_legs l ON l.settlement_id = s.id"
                " WHERE s.phase = 'COMPLETED' GROUP BY s.id"
                " HAVING max(l.paid_out_at) >= :s AND max(l.paid_out_at) < :e) x GROUP BY t"
            ),
            "disputes_opened": (
                "SELECT date_trunc(:b, created_at AT TIME ZONE 'Africa/Lagos') t,"
                " count(*) FROM disputes "
                "WHERE kind = 'dispute' AND created_at >= :s AND created_at < :e GROUP BY t"
            ),
            "kyc_started": (
                "SELECT date_trunc(:b, created_at AT TIME ZONE 'Africa/Lagos') t,"
                " count(*) FROM kyc_cases "
                "WHERE created_at >= :s AND created_at < :e GROUP BY t"
            ),
        }
        per = {name: await self._per_bucket(sql, w) for name, sql in q.items()}
        keys = sorted({k for counts in per.values() for k in counts})
        return [{"at": k, **{name: per[name].get(k, 0) for name in q}} for k in keys]

    async def _money_by_time(
        self, w: Window, which: Literal["amount", "fee"]
    ) -> list[dict[str, Any]]:
        rows = await self._rows(
            "SELECT date_trunc(:b, l.paid_out_at AT TIME ZONE 'Africa/Lagos') AS t, l.currency,"
            " l.scale, sum(CASE WHEN :col = 'fee' THEN l.fee_minor ELSE l.amount_minor END)"
            " FROM settlement_legs l JOIN settlements s ON s.id = l.settlement_id"
            " WHERE s.phase = 'COMPLETED' AND l.paid_out_at >= :s AND l.paid_out_at < :e"
            " GROUP BY t, l.currency, l.scale ORDER BY t",
            b=w.bucket,
            s=w.start,
            e=w.end,
            col=which,
        )
        return [
            {"at": t.isoformat(), "currency": c, "scale": sc, "minor": str(int(v))}
            for t, c, sc, v in rows
        ]

    async def _money_completed(
        self, w: Window, column: Literal["amount_minor", "fee_minor"]
    ) -> list[dict[str, Any]]:
        sql = (
            "SELECT l.currency, l.scale, sum(CASE WHEN :col = 'fee' THEN l.fee_minor"
            " ELSE l.amount_minor END) FROM settlement_legs l "
            "JOIN settlements s ON s.id = l.settlement_id "
            "WHERE s.phase = 'COMPLETED' AND l.paid_out_at >= :s AND l.paid_out_at < :e "
            "GROUP BY l.currency, l.scale ORDER BY l.currency"
        )
        col = "fee" if column == "fee_minor" else "amount"
        cur = {(c, sc): int(v) for c, sc, v in await self._rows(sql, s=w.start, e=w.end, col=col)}
        prev = {
            (c, sc): int(v)
            for c, sc, v in await self._rows(sql, s=w.prev_start, e=w.prev_end, col=col)
        }
        return [
            {
                "currency": c,
                "scale": sc,
                "minor": str(cur.get((c, sc), 0)),
                "previous_minor": str(prev.get((c, sc), 0)),
            }
            for c, sc in sorted(set(cur) | set(prev))
        ]

    # --- tabs --------------------------------------------------------------------------------

    async def _customers(self, w: Window, now: datetime) -> dict[str, Any]:
        rows = await self._rows(
            "SELECT date_trunc(:b, created_at AT TIME ZONE 'Africa/Lagos') AS t, count(*),"
            " count(*) FILTER (WHERE status = 'pending_verification')"
            " FROM users WHERE created_at >= :s AND created_at < :e GROUP BY t ORDER BY t",
            b=w.bucket,
            s=w.start,
            e=w.end,
        )
        active_total = int(await self._one("SELECT count(*) FROM users WHERE status = 'active'"))
        quiet = int(
            await self._one(
                "SELECT count(*) FROM users u WHERE u.status = 'active' AND NOT EXISTS ("
                " SELECT 1 FROM auth_sessions a WHERE a.user_id = u.id"
                " AND a.last_active_at >= :since)",
                since=now - timedelta(days=30),
            )
        )
        by_status = {
            st: int(n)
            for st, n in await self._rows("SELECT status, count(*) FROM users GROUP BY status")
        }
        return {
            # Every account, by status now (ADR-062): the "Customers by status" donut.
            "by_status": {
                st: by_status.get(st, 0)
                for st in ("active", "pending_verification", "suspended", "closed")
            },
            "growth": [
                {"at": t.isoformat(), "signed_up": int(n), "not_verified": int(p)}
                for t, n, p in rows
            ],
            "active_customers": active_total,
            "inactive_30_days": quiet,
        }

    async def _transactions(self, w: Window) -> dict[str, Any]:
        done = int(
            await self._one(
                "SELECT count(*) FROM (SELECT s.id FROM settlements s JOIN settlement_legs l"
                " ON l.settlement_id = s.id WHERE s.phase = 'COMPLETED' GROUP BY s.id"
                " HAVING max(l.paid_out_at) >= :s AND max(l.paid_out_at) < :e) x",
                s=w.start,
                e=w.end,
            )
        )
        not_done = int(
            await self._one(
                "SELECT count(*) FROM settlements WHERE phase = ANY(:failed)"
                " AND updated_at >= :s AND updated_at < :e",
                failed=list(FAILED_PHASES),
                s=w.start,
                e=w.end,
            )
        )
        speeds = await self._rows(
            "SELECT extract(epoch FROM max(l.paid_out_at) - s.created_at) FROM settlements s"
            " JOIN settlement_legs l ON l.settlement_id = s.id WHERE s.phase = 'COMPLETED'"
            " GROUP BY s.id HAVING max(l.paid_out_at) >= :s AND max(l.paid_out_at) < :e",
            s=w.start,
            e=w.end,
        )
        buckets = {name: 0 for name, _, _ in SPEED_BUCKETS} | {"gt_60m": 0}
        for (seconds,) in speeds:
            sec = float(seconds)
            for name, low, high in SPEED_BUCKETS:
                if low <= sec < high:
                    buckets[name] += 1
                    break
            else:
                buckets["gt_60m"] += 1
        return {"completed": done, "failed": not_done, "speed": buckets}

    async def _revenue(self, w: Window) -> dict[str, Any]:
        rows = await self._rows(
            "SELECT date_trunc(:b, l.paid_out_at AT TIME ZONE 'Africa/Lagos') AS t, l.currency,"
            " l.scale, sum(l.fee_minor) FROM settlement_legs l JOIN settlements s"
            " ON s.id = l.settlement_id WHERE s.phase = 'COMPLETED' AND l.paid_out_at >= :s"
            " AND l.paid_out_at < :e GROUP BY t, l.currency, l.scale ORDER BY t",
            b=w.bucket,
            s=w.start,
            e=w.end,
        )
        escrow = await self._rows(
            "SELECT currency, scale, sum(amount_minor), count(*) FROM settlement_legs"
            " WHERE state = 'FUNDED' GROUP BY currency, scale ORDER BY currency"
        )
        return {
            "fees_by_time": [
                {"at": t.isoformat(), "currency": c, "scale": sc, "minor": str(int(v))}
                for t, c, sc, v in rows
            ],
            "waiting_in_escrow": [
                {"currency": c, "scale": sc, "minor": str(int(v)), "legs": int(n)}
                for c, sc, v, n in escrow
            ],
        }

    async def _corridors(self, w: Window) -> list[dict[str, Any]]:
        sql = (
            "SELECT least(o.source_currency, o.target_currency) AS a,"
            " greatest(o.source_currency, o.target_currency) AS b, count(*),"
            " avg(m.agreed_rate) FROM transactions t JOIN matches m ON m.id = t.match_id"
            " JOIN offers o ON o.id = m.offer_id WHERE t.created_at >= :s AND t.created_at < :e"
            " GROUP BY a, b"
        )
        cur = {(a, b): (int(n), r) for a, b, n, r in await self._rows(sql, s=w.start, e=w.end)}
        prev = {
            (a, b): int(n) for a, b, n, _ in await self._rows(sql, s=w.prev_start, e=w.prev_end)
        }
        out = []
        for pair in sorted(set(cur) | set(prev)):
            n, rate = cur.get(pair, (0, None))
            out.append(
                {
                    "pair": list(pair),
                    "trades": n,
                    "previous_trades": prev.get(pair, 0),
                    # Decimal as text: rates are set by users (ADR-005), never floats.
                    "average_rate": None if rate is None else f"{rate:.4f}",
                }
            )
        return sorted(out, key=lambda c: -c["trades"])

    async def _operations(self, w: Window) -> dict[str, Any]:
        opened = (
            "SELECT count(*) FROM disputes WHERE kind = 'dispute' AND created_at >= :s"
            " AND created_at < :e"
        )
        resolved = (
            "SELECT count(*) FROM disputes WHERE kind = 'dispute' AND resolved_at >= :s"
            " AND resolved_at < :e"
        )
        mean = await self._one(
            "SELECT avg(extract(epoch FROM resolved_at - created_at)) FROM disputes"
            " WHERE kind = 'dispute' AND resolved_at >= :s AND resolved_at < :e",
            s=w.start,
            e=w.end,
        )
        sides = await self._rows(
            "SELECT source_currency = 'NGN', count(*) FROM offers"
            " WHERE status IN ('open', 'partially_matched') GROUP BY 1"
        )
        side = {bool(k): int(n) for k, n in sides}
        return {
            "disputes_opened": await self._both(opened, w),
            "disputes_resolved": await self._both(resolved, w),
            "mean_seconds_to_resolve": None if mean is None else int(mean),
            "reconciliation_open": int(
                await self._one(
                    "SELECT count(*) FROM reconciliation_exceptions WHERE status <> 'RESOLVED'"
                )
            ),
            # Open offers now: paying naira (buyers of foreign currency) vs paying foreign.
            "open_offers_paying_naira": side.get(True, 0),
            "open_offers_paying_foreign": side.get(False, 0),
        }
