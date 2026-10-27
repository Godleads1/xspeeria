"""Demo customers, staff, pretend escrow banks and market offers for testing on THIS computer.

    cd backend
    uv run python -m app.cli.seed_demo

Owner, 2026-10-27: "put demo users in the phone and web admin, use demo escrow accounts too,
i want to test the app from start to finish". **Refused unless APP_ENV=local.** Safe to run
again: anything already there is left alone. Start over with ``app.cli.reset_local_data``
(customers) and run this again.

Everything here is clearly fake: demo names, fiction-range phone numbers, ``example.com``
emails, the published demo PIN and passwords below, and the pretend banks (ADR-037, no real
money). Identity checks are recorded as approved without Didit, which only makes sense on a
developer's computer.
"""

from __future__ import annotations

import asyncio
import hashlib
import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.cli.currency_definitions import ensure_currency_definitions
from app.cli.pretend_bank import ensure_pretend_partners
from app.core.config import get_settings
from app.db.session import build_engine
from app.models.identity import User
from app.models.kyc import KycCase
from app.models.marketplace import Offer
from app.models.payouts import Beneficiary
from app.models.staff import StaffAccount, StaffRole
from app.services.auth import Principal
from app.services.offers import OfferService
from app.services.payouts import PayoutAccountService
from app.services.staff import RequestInfo, StaffService

__all__ = ["DEMO_PIN", "DEMO_STAFF_PASSWORD", "CUSTOMERS", "STAFF", "seed"]

#: The same for every demo customer. Never use it for a real account.
DEMO_PIN = "482613"
#: The same for every demo staff member (at least 12 characters, ADR-060).
DEMO_STAFF_PASSWORD = "Xspeeria demo 2026!"


@dataclass(frozen=True)
class DemoCustomer:
    key: str
    phone: str
    email: str
    #: (country, legal name, date of birth, gender, ID type, issuing country) per approved check.
    checks: tuple[tuple[str, str, date, str, str, str], ...]
    #: (currency, bank, account number, sort code or routing number) payout accounts: one in
    #: every currency the person may receive, so any demo deal can be finished.
    accounts: tuple[tuple[str, str, str, str | None], ...]
    #: (source currency, target currency, amount, rate) live offers.
    offers: tuple[tuple[str, str, str, str], ...]


# Phone numbers come from ranges reserved for fiction/drama where they exist (UK 07700 900xxx,
# US 555-01xx); the Nigerian ones are made up.
CUSTOMERS: tuple[DemoCustomer, ...] = (
    DemoCustomer(
        key="ada",
        phone="+2348030000001",
        email="ada.demo@example.com",
        checks=(("NG", "Ada Obi", date(1990, 5, 17), "F", "passport", "NGA"),),
        accounts=(
            ("NGN", "Access Bank", "0123456781", None),
            ("USD", "Chase", "223456781", "021000021"),
            ("GBP", "Barclays", "22345671", "200000"),
        ),
        offers=(("NGN", "USD", "500000", "1300"),),
    ),
    DemoCustomer(
        key="ben",
        phone="+447700900001",
        email="ben.demo@example.com",
        checks=(
            ("GB", "Ben Carter", date(1987, 11, 2), "M", "passport", "GBR"),
            ("NG", "Ben Carter", date(1987, 11, 2), "M", "drivers_license", "NGA"),
        ),
        accounts=(("GBP", "Barclays", "12345678", "200000"), ("NGN", "GTBank", "0123456782", None)),
        offers=(("GBP", "NGN", "200", "1750"),),
    ),
    DemoCustomer(
        key="chloe",
        phone="+12025550101",
        email="chloe.demo@example.com",
        checks=(("US", "Chloe Adams", date(1993, 3, 9), "F", "passport", "USA"),),
        accounts=(
            ("USD", "Chase", "123456789", "021000021"),
            ("NGN", "Zenith Bank", "0123456783", None),
        ),
        offers=(("USD", "NGN", "300", "1320"),),
    ),
    # Not verified yet: to try sign-in, the Market's "verify first" and the country choice.
    DemoCustomer(
        key="dan",
        phone="+2348030000004",
        email="dan.demo@example.com",
        checks=(),
        accounts=(),
        offers=(),
    ),
)

#: (email, name, role) — one of each built-in role (ADR-060).
STAFF: tuple[tuple[str, str, str], ...] = (
    ("boss.demo@example.com", "Demo Boss", "super_admin"),
    ("compliance.demo@example.com", "Demo Compliance", "compliance_officer"),
    ("ops.demo@example.com", "Demo Ops", "ops_admin"),
    ("support.demo@example.com", "Demo Support", "support_agent"),
)


def _identity_key(phone: str, country: str) -> str:
    """Stand-in for the keyed ID-document hash (ADR-041); unique per demo person and country."""
    return hashlib.sha256(f"xspeeria-demo:{phone}:{country}".encode()).hexdigest()


async def seed() -> list[str]:
    from app.main import build_auth_runtime

    settings = get_settings()
    if settings.app_env != "local":
        raise SystemExit("Demo data is for APP_ENV=local only. Nothing changed.")
    runtime = build_auth_runtime(settings)
    engine = build_engine(settings)
    report: list[str] = []
    try:
        async with engine.begin() as conn:
            added = await ensure_currency_definitions(conn)
            report.append("currencies: " + (", ".join(added) if added else "already there"))
            added = await ensure_pretend_partners(conn)
            report.append(
                "pretend escrow banks: " + (", ".join(added) if added else "already there")
            )

        maker = async_sessionmaker(engine, expire_on_commit=False)
        async with maker() as db:
            now = runtime.clock()
            for c in CUSTOMERS:
                user = await db.scalar(select(User).where(User.phone == c.phone))
                if user is not None:
                    report.append(f"customer {c.email}: already there")
                    continue
                user = User(
                    id=uuid.uuid4(),
                    phone=c.phone,
                    email=c.email,
                    pin_hash=runtime.hasher.hash(DEMO_PIN),
                    status="active",
                    failed_pin_attempts=0,
                    phone_verified_at=now,
                    created_at=now,
                )
                db.add(user)
                for country, name, born, gender, id_type, issued in c.checks:
                    db.add(
                        KycCase(
                            id=uuid.uuid4(),
                            user_id=user.id,
                            provider="didit",
                            country=country,
                            provider_session_id=f"demo-{c.key}-{country.lower()}",
                            provider_status="Approved",
                            status="approved",
                            legal_name=name,
                            date_of_birth=born,
                            gender=gender,
                            id_type=id_type,
                            issuing_country=issued,
                            identity_key=_identity_key(c.phone, country),
                            decided_at=now,
                            created_at=now,
                            updated_at=now,
                        )
                    )
                await db.commit()
                where = ", ".join(x[0] for x in c.checks) or "no country yet"
                report.append(f"customer {c.email} ({c.phone}): created, verified in {where}")

                principal = Principal(user_id=user.id, session_id=uuid.uuid4())
                if c.accounts and runtime.beneficiary_box is None:
                    report.append(
                        "  payout accounts skipped: add BENEFICIARY_ENCRYPTION_KEY to .env"
                    )
                elif c.accounts:
                    payouts = PayoutAccountService(
                        db, runtime.clock, runtime.beneficiary_box, runtime.name_check
                    )

                    async def no_step_up() -> None:
                        return None

                    for currency, bank, number, routing in c.accounts:
                        await payouts.add(
                            principal,
                            currency=currency,
                            bank_name=bank,
                            account_number=number,
                            routing_number=routing if currency == "USD" else None,
                            sort_code=routing if currency == "GBP" else None,
                            account_type="Checking" if currency == "USD" else None,
                            confirm_step_up=no_step_up,
                        )
                    # Demo accounts can be paid into straight away (no new-account wait), and
                    # carry the holder's name as a real bank check would report it (the local
                    # pretend check says "DEV ACCOUNT HOLDER", which the fraud rule for
                    # accounts in another name would flag, ADR-068).
                    await db.execute(
                        text(
                            "UPDATE beneficiaries SET payout_hold_until = :now, account_name = :n "
                            "WHERE user_id = :u"
                        ),
                        {"now": now - timedelta(seconds=1), "n": c.checks[0][1], "u": user.id},
                    )
                    await db.commit()
                    report.append(f"  payout accounts: {', '.join(a[0] for a in c.accounts)}")
                for source, target, amount, rate in c.offers:
                    await OfferService(db, runtime.clock).create(
                        principal, uuid.uuid4(), source, target, amount, rate
                    )
                    report.append(f"  offer: {amount} {source} for {target} at {rate}")

            staff_service = StaffService(db, runtime)
            for email, name, role_name in STAFF:
                if await db.scalar(select(StaffAccount.id).where(StaffAccount.email == email)):
                    report.append(f"staff {email}: already there")
                    continue
                role = await db.scalar(select(StaffRole).where(StaffRole.name == role_name))
                if role is None:
                    report.append(f"staff {email}: role {role_name} missing — run the migrations")
                    continue
                staff = StaffAccount(
                    id=uuid.uuid4(),
                    email=email,
                    name=name,
                    role_id=role.id,
                    status="active",
                    password_hash=runtime.hasher.hash(DEMO_STAFF_PASSWORD),
                    password_changed_at=now,
                    created_at=now,
                    updated_at=now,
                )
                db.add(staff)
                await db.flush()
                staff_service._audit(  # noqa: SLF001 - same audit row the console writes
                    RequestInfo(None, "command line (demo data)"),
                    None,
                    "staff_created",
                    target_type="staff",
                    target_id=staff.id,
                    detail={"role": role_name, "demo": True},
                )
                await db.commit()
                report.append(f"staff {email} ({role_name}): created")

            offers = await db.scalar(
                select(func.count(Offer.id)).where(Offer.status.in_(("open", "partially_matched")))
            )
            accounts = await db.scalar(select(func.count(Beneficiary.id)))
            report.append(f"live offers now: {offers}; payout accounts now: {accounts}")
    finally:
        await engine.dispose()
    return report


def _main() -> None:
    for line in asyncio.run(seed()):
        print(line)
    print()
    print(f"Demo customers sign in with their phone number and PIN {DEMO_PIN}.")
    print(f"Demo staff sign in at the console with password: {DEMO_STAFF_PASSWORD}")
    print("Codes print in the server window (DEV_SMS / DEV_EMAIL). Nothing here is real.")


if __name__ == "__main__":
    _main()
