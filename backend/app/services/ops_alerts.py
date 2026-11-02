"""Operations alerts for Super Admins (ADR-074; owner 2026-11-01). Meets SEC-037.

Rules over data Xspeeria already records, checked by a background sweep once a minute:

=========================  ====  ==========================================================
Rule                       Sev.  Raised when
=========================  ====  ==========================================================
``customer_sign_in_attack`` P2   30 or more wrong-PIN sign-ins across all customers in
                                 15 minutes (``customer_activity``)
``staff_sign_in_attack``    P2   10 or more failed staff sign-ins in 15 minutes
                                 (``staff_audit_log``)
``staff_access_changed``    P2   a staff account is created, or its role or status changes,
                                or a security key is added or removed (ADR-081);
                                 a role is created, changed or deleted (one per audit entry)
``emergency_control_used``  P1   deals were paused or resumed, or sessions were ended
                                 (ADR-075; one per audit entry)
``unusual_deal_volume``     P2   20 or more deals in the last hour and 3 times the hourly
                                 average of the 7 days before
``money_at_risk``           P1   a deal reaches RECOVERY_REQUIRED or CLOSED_WITH_LOSS
``high_fraud_alert``        P2   a high-severity fraud alert opens (ADR-068)
``webhook_rejected``        P2   5 or more webhooks refused (4xx: bad signature, too old,
                                 malformed) in 15 minutes (``api_metrics``)
``webhook_failing``         P1   a webhook we receive answered 5xx in 15 minutes
``api_failing``             P1   more than 1% of calls to one of our APIs failed (ADR-072 red)
``outside_failing``         P2   an outside service (Didit, push, SMS, email, bank) failed
``job_failing``             P2   a background job's last run failed
``escrow_stalled``          P1   escrow processing has not worked for 3 of its intervals, or
                                 escrow messages to the bank failed
=========================  ====  ==========================================================

The thresholds are starting values set in this file; changing them is an owner decision.

A rule that keeps firing updates the alert that is still open (``last_seen_at``,
``occurrences``) instead of opening another; once resolved, the next firing opens a new one.
An alert about a single event (an audit entry, a deal, a fraud alert) is raised once, ever.
New P1 and P2 alerts are emailed to every active Super Admin when an email sender exists;
until then they show in the console only. Details hold counts and references only: never a
customer's name, phone, email, account number, PIN or code.

An alert never blocks, moves or reverses anything by itself. Super Admins act through the
existing screens and the incident plan (``docs/07-security/INCIDENT_RESPONSE_PLAN.md``).

Permissions (from the database role, on every call): ``monitoring.read`` lists alerts;
``monitoring.update`` acknowledges and resolves them. Both are Super Admin only (ADR-072).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import status
from sqlalchemy import func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.domain.staff_rules import SUPER_ADMIN
from app.models.activity import CustomerActivity
from app.models.fraud import FraudAlert
from app.models.marketplace import Match
from app.models.ops_alerts import OpsAlert
from app.models.settlement import Settlement
from app.models.staff import StaffAccount, StaffAuditEntry, StaffRole
from app.providers.email import EmailSender
from app.services.staff import RequestInfo, StaffPrincipal, forbidden
from app.services.system_health import SystemHealthService

__all__ = ["RULES", "TITLES", "OpsAlertService", "Raised", "ref"]

_logger = get_logger(__name__)

#: Starting values (ADR-074); changing them is an owner decision.
WINDOW = timedelta(minutes=15)
CUSTOMER_SIGN_IN_FAILURES = 30
STAFF_SIGN_IN_FAILURES = 10
DEAL_VOLUME_MIN = 20
DEAL_VOLUME_FACTOR = 3
WEBHOOK_REJECTED = 5
#: Event rules look this far back; older events were seen by earlier sweeps.
EVENT_LOOKBACK = timedelta(days=1)
ESCROW_JOB = "Escrow processing"

RULES: dict[str, str] = {
    "customer_sign_in_attack": "P2",
    "staff_sign_in_attack": "P2",
    "staff_access_changed": "P2",
    "emergency_control_used": "P1",
    "unusual_deal_volume": "P2",
    "money_at_risk": "P1",
    "high_fraud_alert": "P2",
    "webhook_rejected": "P2",
    "webhook_failing": "P1",
    "api_failing": "P1",
    "outside_failing": "P2",
    "job_failing": "P2",
    "escrow_stalled": "P1",
}

#: English titles for the email subject. The console shows its own translated text.
TITLES: dict[str, str] = {
    "customer_sign_in_attack": "Many failed customer sign-ins",
    "staff_sign_in_attack": "Many failed staff sign-ins",
    "staff_access_changed": "A staff account or role was changed",
    "emergency_control_used": "Deals were paused or resumed, or sessions were ended",
    "unusual_deal_volume": "Unusually many deals",
    "money_at_risk": "A deal needs money recovered",
    "high_fraud_alert": "A high-severity fraud alert opened",
    "webhook_rejected": "Webhooks are being refused",
    "webhook_failing": "A webhook is failing",
    "api_failing": "An Xspeeria API is failing",
    "outside_failing": "An outside service is failing",
    "job_failing": "A background job is failing",
    "escrow_stalled": "Escrow processing has stopped",
}

#: ADR-072 warning codes that become alerts (red ones only; amber stays on the page).
_FROM_WARNING = {
    "server_errors": "api_failing",
    "outside_failing": "outside_failing",
    "job_failed": "job_failing",
    "escrow_messages_failed": "escrow_stalled",
}

_STAFF_ACCESS_ACTIONS = (
    "staff_created",
    "role_created",
    "role_updated",
    "role_deleted",
    # ADR-081: adding or removing a Super Admin security key.
    "security_key_added",
    "security_key_removed",
)
#: ADR-075: the emergency controls; each use tells the other Super Admins.
_EMERGENCY_ACTIONS = ("deals_paused", "deals_resumed", "sessions_ended")
_MONEY_AT_RISK = ("RECOVERY_REQUIRED", "CLOSED_WITH_LOSS")
_SEVERITY_ORDER = {"P1": 0, "P2": 1, "P3": 2, "P4": 3}


@dataclass(frozen=True)
class Raised:
    """A new alert, as the sweep reports it."""

    id: uuid.UUID
    rule: str
    severity: str


def ref(alert_id: uuid.UUID) -> str:
    return "#" + str(alert_id).split("-")[0].upper()


def _err(code: str, message: str, http: int) -> AppError:
    return AppError(code, message, status_code=http)


def _view(a: OpsAlert) -> dict[str, Any]:
    return {
        "id": a.id,
        "ref": ref(a.id),
        "rule": a.rule,
        "severity": a.severity,
        "status": a.status,
        "subject": a.subject,
        "details": a.details,
        "occurrences": a.occurrences,
        "first_seen_at": a.first_seen_at,
        "last_seen_at": a.last_seen_at,
        "notified_at": a.notified_at,
        "acknowledged_at": a.acknowledged_at,
        "acknowledged_by": a.acknowledged_by,
        "resolved_at": a.resolved_at,
        "resolved_by": a.resolved_by,
        "resolution_note": a.resolution_note,
    }


class OpsAlertService:
    def __init__(
        self,
        db: AsyncSession,
        clock: Callable[[], datetime],
        settings: Settings | None = None,
        email: EmailSender | None = None,
    ) -> None:
        self._db = db
        self._clock = clock
        self._settings = settings
        self._email = email

    # --- raising ---------------------------------------------------------------------------

    async def _condition(self, rule: str, subject: str, details: dict[str, Any]) -> OpsAlert | None:
        """A condition that is true now: open an alert, or update the one still live.
        Returns the alert only when it is new."""
        now = self._clock()
        base = insert(OpsAlert).values(
            id=uuid.uuid4(),
            rule=rule,
            severity=RULES[rule],
            status="open",
            subject=subject[:160],
            details=details,
            occurrences=1,
            first_seen_at=now,
            last_seen_at=now,
        )
        stmt = base.on_conflict_do_update(
            index_elements=["rule", "subject"],
            index_where=text("status <> 'resolved'"),
            set_={
                "details": base.excluded.details,
                "last_seen_at": func.greatest(OpsAlert.last_seen_at, base.excluded.last_seen_at),
                "occurrences": OpsAlert.occurrences + 1,
            },
        ).returning(OpsAlert.id, OpsAlert.occurrences)
        alert_id, occurrences = (await self._db.execute(stmt)).one()
        return await self._db.get(OpsAlert, alert_id) if occurrences == 1 else None

    async def _event(self, rule: str, subject: str, details: dict[str, Any]) -> OpsAlert | None:
        """One event: raised once, ever (a resolved alert about it is not raised again)."""
        seen = await self._db.scalar(
            select(OpsAlert.id).where(OpsAlert.rule == rule, OpsAlert.subject == subject[:160])
        )
        if seen is not None:
            return None
        now = self._clock()
        result = await self._db.execute(
            insert(OpsAlert)
            .values(
                id=uuid.uuid4(),
                rule=rule,
                severity=RULES[rule],
                status="open",
                subject=subject[:160],
                details=details,
                occurrences=1,
                first_seen_at=now,
                last_seen_at=now,
            )
            .on_conflict_do_nothing(
                index_elements=["rule", "subject"], index_where=text("status <> 'resolved'")
            )
            .returning(OpsAlert.id)
        )
        alert_id = result.scalar()
        return await self._db.get(OpsAlert, alert_id) if alert_id is not None else None

    async def scan(self) -> list[Raised]:
        """Apply every rule once; returns the alerts that are new. Idempotent between servers:
        the database keeps one live alert per rule and subject."""
        # Read the system figures first: System Health ends its own read with a rollback.
        system = await self._system_figures() if self._settings is not None else None
        now = self._clock()
        since = now - WINDOW
        new: list[OpsAlert | None] = []

        # Repeated sign-in failures (customers and staff).
        failures, accounts = (
            await self._db.execute(
                select(func.count(), func.count(func.distinct(CustomerActivity.user_id))).where(
                    CustomerActivity.action == "sign_in_failed", CustomerActivity.at >= since
                )
            )
        ).one()
        if failures >= CUSTOMER_SIGN_IN_FAILURES:
            new.append(
                await self._condition(
                    "customer_sign_in_attack",
                    "all customers",
                    {"failures": int(failures), "accounts": int(accounts), "minutes": 15},
                )
            )
        staff_failures, staff_locked = (
            await self._db.execute(
                select(
                    func.count(),
                    func.count().filter(StaffAuditEntry.action == "login_locked"),
                ).where(
                    StaffAuditEntry.action.in_(("login_failed", "login_locked")),
                    StaffAuditEntry.at >= since,
                )
            )
        ).one()
        if staff_failures >= STAFF_SIGN_IN_FAILURES:
            new.append(
                await self._condition(
                    "staff_sign_in_attack",
                    "all staff",
                    {"failures": int(staff_failures), "locked": int(staff_locked), "minutes": 15},
                )
            )

        # Privilege changes: every one, so a second Super Admin sees it.
        changes = (
            await self._db.execute(
                select(
                    StaffAuditEntry.id,
                    StaffAuditEntry.action,
                    StaffAuditEntry.staff_id,
                    StaffAuditEntry.target_type,
                    StaffAuditEntry.target_id,
                    StaffAuditEntry.detail,
                )
                .where(
                    StaffAuditEntry.at >= now - EVENT_LOOKBACK,
                    or_(
                        StaffAuditEntry.action.in_(_STAFF_ACCESS_ACTIONS),
                        (StaffAuditEntry.action == "staff_updated")
                        & (
                            StaffAuditEntry.detail.has_key("role")
                            | StaffAuditEntry.detail.has_key("status")
                        ),
                    ),
                )
                .order_by(StaffAuditEntry.id)
            )
        ).all()
        for entry_id, action, by, target_type, target_id, detail in changes:
            what = {
                k: detail[k] for k in ("role", "status", "added", "removed") if k in (detail or {})
            }
            new.append(
                await self._event(
                    "staff_access_changed",
                    f"audit:{entry_id}",
                    {
                        "action": action,
                        "by_staff_id": str(by) if by else None,
                        "target": f"{target_type}:{target_id}" if target_type else None,
                        **what,
                    },
                )
            )

        # Emergency controls (ADR-075): every use, so the other Super Admins know at once.
        for entry_id, action, by, detail in (
            await self._db.execute(
                select(
                    StaffAuditEntry.id,
                    StaffAuditEntry.action,
                    StaffAuditEntry.staff_id,
                    StaffAuditEntry.detail,
                )
                .where(
                    StaffAuditEntry.at >= now - EVENT_LOOKBACK,
                    StaffAuditEntry.action.in_(_EMERGENCY_ACTIONS),
                )
                .order_by(StaffAuditEntry.id)
            )
        ).all():
            counts = {
                k: detail[k]
                for k in ("who", "customer_sessions", "staff_sessions", "paused_seconds")
                if k in (detail or {})
            }
            new.append(
                await self._event(
                    "emergency_control_used",
                    f"audit:{entry_id}",
                    {"action": action, "by_staff_id": str(by) if by else None, **counts},
                )
            )

        # Unusual transaction activity.
        last_hour = await self._db.scalar(
            select(func.count(Match.id)).where(Match.accepted_at >= now - timedelta(hours=1))
        )
        week = await self._db.scalar(
            select(func.count(Match.id)).where(
                Match.accepted_at >= now - timedelta(days=7, hours=1),
                Match.accepted_at < now - timedelta(hours=1),
            )
        )
        hourly = (week or 0) / (7 * 24)
        if (last_hour or 0) >= DEAL_VOLUME_MIN and (last_hour or 0) >= DEAL_VOLUME_FACTOR * hourly:
            new.append(
                await self._condition(
                    "unusual_deal_volume",
                    "deals",
                    {"last_hour": int(last_hour or 0), "hourly_average": round(hourly, 1)},
                )
            )
        for settlement_id, phase in (
            await self._db.execute(
                select(Settlement.id, Settlement.phase).where(
                    Settlement.phase.in_(_MONEY_AT_RISK),
                    Settlement.updated_at >= now - EVENT_LOOKBACK,
                )
            )
        ).all():
            new.append(
                await self._event(
                    "money_at_risk",
                    f"settlement:{settlement_id}:{phase}",
                    {"settlement_id": str(settlement_id), "phase": phase},
                )
            )
        for fraud_id, fraud_rule in (
            await self._db.execute(
                select(FraudAlert.id, FraudAlert.rule).where(
                    FraudAlert.severity == "high",
                    FraudAlert.status == "open",
                    FraudAlert.created_at >= now - EVENT_LOOKBACK,
                )
            )
        ).all():
            new.append(
                await self._event(
                    "high_fraud_alert",
                    f"fraud:{fraud_id}",
                    {"fraud_alert_id": str(fraud_id), "fraud_rule": fraud_rule},
                )
            )

        # The running system: webhooks, APIs, outside services, jobs (ADR-072 figures).
        if system is not None:
            new.extend(await self._system(*system))

        made = [Raised(a.id, a.rule, a.severity) for a in new if a is not None]
        await self._db.commit()
        if made:
            _logger.warning("ops_alerts_raised", extra={"rules": sorted({a.rule for a in made})})
            await self._notify(made)
        return made

    async def _system_figures(self) -> tuple[int, int, list[dict[str, Any]]]:
        """Webhooks refused and failing in the window, and System Health's warnings."""
        if self._settings is None:  # pragma: no cover - scan() only calls this with settings
            return 0, 0, []
        real_now = datetime.now(UTC)  # the figures are filed under the real minute
        rejected, failed = (
            await self._db.execute(
                text(
                    "SELECT coalesce(sum(client_errors), 0), "
                    "coalesce(sum(server_errors + network_errors), 0) FROM api_metrics "
                    "WHERE kind = 'webhook' AND minute >= :since"
                ),
                {"since": real_now - WINDOW},
            )
        ).one()
        health = SystemHealthService(self._db, self._settings)
        warnings = await health.current_warnings(WINDOW, webhooks=False)
        return int(rejected), int(failed), warnings

    async def _system(
        self, rejected: int, failed: int, warnings: list[dict[str, Any]]
    ) -> list[OpsAlert | None]:
        out: list[OpsAlert | None] = []
        if int(rejected) >= WEBHOOK_REJECTED:
            out.append(
                await self._condition(
                    "webhook_rejected", "webhooks", {"refused": int(rejected), "minutes": 15}
                )
            )
        if int(failed):
            out.append(
                await self._condition(
                    "webhook_failing", "webhooks", {"failed": int(failed), "minutes": 15}
                )
            )
        for w in warnings:
            rule = _FROM_WARNING.get(w["code"])
            if w["code"] == "job_late" and w["name"] == ESCROW_JOB:
                rule = "escrow_stalled"
            if rule is None:
                continue
            value = w["value"]
            out.append(
                await self._condition(
                    rule,
                    w["name"] or w["code"],
                    {
                        "warning": w["code"],
                        "value": value if isinstance(value, (int, float, str)) else None,
                    },
                )
            )
        return out

    async def _notify(self, alerts: list[Raised]) -> None:
        """Email new P1/P2 alerts to every active Super Admin, once. Never raises: a failed
        email leaves ``notified_at`` empty and the alert is still on the console."""
        urgent = [a for a in alerts if a.severity in ("P1", "P2")]
        if not urgent or self._email is None:
            return
        try:
            to = (
                await self._db.scalars(
                    select(StaffAccount.email)
                    .join(StaffRole, StaffRole.id == StaffAccount.role_id)
                    .where(StaffRole.name == SUPER_ADMIN, StaffAccount.status == "active")
                )
            ).all()
            for a in sorted(urgent, key=lambda x: _SEVERITY_ORDER[x.severity]):
                for address in to:
                    await self._email.send_ops_alert(address, a.severity, TITLES[a.rule], ref(a.id))
            await self._db.execute(
                update(OpsAlert)
                .where(OpsAlert.id.in_([a.id for a in urgent]))
                .values(notified_at=self._clock())
            )
            await self._db.commit()
        except Exception as exc:  # noqa: BLE001 - the console still shows the alert
            await self._db.rollback()
            _logger.error("ops_alert_email_failed", extra={"error": type(exc).__name__})

    # --- staff ----------------------------------------------------------------------------

    async def alerts(self, principal: StaffPrincipal, which: str = "live") -> dict[str, Any]:
        if not principal.can("monitoring.read"):
            raise forbidden()
        stmt = select(OpsAlert)
        if which == "live":
            stmt = stmt.where(OpsAlert.status != "resolved")
        rows = (
            await self._db.scalars(stmt.order_by(OpsAlert.last_seen_at.desc()).limit(200))
        ).all()
        items = sorted(
            (_view(a) for a in rows),
            key=lambda v: (v["status"] == "resolved", _SEVERITY_ORDER[v["severity"]]),
        )
        counts: dict[str, int] = {
            str(sev): int(n)
            for sev, n in (
                await self._db.execute(
                    select(OpsAlert.severity, func.count())
                    .where(OpsAlert.status != "resolved")
                    .group_by(OpsAlert.severity)
                )
            ).all()
        }
        await self._db.rollback()
        return {"items": items, "live": {k: counts.get(k, 0) for k in _SEVERITY_ORDER}}

    async def _held(self, principal: StaffPrincipal, alert_id: uuid.UUID) -> OpsAlert:
        if not principal.can("monitoring.update"):
            raise forbidden()
        a = await self._db.get(OpsAlert, alert_id, with_for_update=True)
        if a is None:
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That alert was not found.", status.HTTP_404_NOT_FOUND)
        if a.status == "resolved":
            await self._db.rollback()
            raise _err(
                "RES_409_ALERT_RESOLVED",
                "This alert is already resolved.",
                status.HTTP_409_CONFLICT,
            )
        return a

    def _audit(
        self, principal: StaffPrincipal, info: RequestInfo, action: str, a: OpsAlert
    ) -> None:
        self._db.add(
            StaffAuditEntry(
                at=self._clock(),
                staff_id=principal.staff_id,
                action=action,
                target_type="ops_alert",
                target_id=str(a.id),
                detail={"rule": a.rule, "severity": a.severity},
                ip_address=info.ip_address,
                user_agent=info.user_agent,
            )
        )

    async def acknowledge(
        self, principal: StaffPrincipal, info: RequestInfo, alert_id: uuid.UUID
    ) -> dict[str, Any]:
        """Someone is looking at it. Repeating it changes nothing."""
        a = await self._held(principal, alert_id)
        if a.status == "open":
            a.status = "acknowledged"
            a.acknowledged_at = self._clock()
            a.acknowledged_by = principal.staff_id
            self._audit(principal, info, "ops_alert_acknowledged", a)
        out = _view(a)
        await self._db.commit()
        return out

    async def resolve(
        self, principal: StaffPrincipal, info: RequestInfo, alert_id: uuid.UUID, note: str
    ) -> dict[str, Any]:
        """Done, with what was found and done (5 to 1000 characters). Final."""
        note = note.strip()
        if not 5 <= len(note) <= 1000:
            raise _err(
                "VAL_422_MISSING_FIELD",
                "Say what was found and what was done (at least 5 characters).",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        a = await self._held(principal, alert_id)
        now = self._clock()
        if a.acknowledged_at is None:
            a.acknowledged_at, a.acknowledged_by = now, principal.staff_id
        a.status, a.resolved_at, a.resolved_by, a.resolution_note = (
            "resolved",
            now,
            principal.staff_id,
            note,
        )
        self._audit(principal, info, "ops_alert_resolved", a)
        out = _view(a)
        await self._db.commit()
        return out
