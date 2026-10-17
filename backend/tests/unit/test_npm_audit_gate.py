"""Tests for the npm audit gate (scripts/check_npm_audit.py, ADR-017).

The gate replaces ``npm audit --audit-level=high``. These tests prove it still fails on
every high/critical advisory that is not a current, exact, approved exception, and that
it can never pass by auditing nothing.
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[3]
GATE = ROOT / "scripts" / "check_npm_audit.py"
TODAY = dt.date(2026, 10, 20)


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("check_npm_audit", GATE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gate = _load()


def _report(*advisories: tuple[str, str, str]) -> dict[str, Any]:
    vulns: dict[str, Any] = {}
    for adv_id, pkg, sev in advisories:
        via = {"name": pkg, "severity": sev, "url": f"https://github.com/advisories/{adv_id}"}
        vulns.setdefault(pkg, {"via": []})["via"].append(via)
        # A dependent package lists the leaf by name only; it must not count twice.
        vulns[f"parent-of-{pkg}"] = {"via": [pkg]}
    return {
        "auditReportVersion": 2,
        "vulnerabilities": vulns,
        "metadata": {"dependencies": {"total": 100}},
    }


def _exc(adv_id: str = "GHSA-aaaa", pkg: str = "braces", **over: str) -> dict[str, str]:
    base = {
        "id": adv_id,
        "package": pkg,
        "severity": "high",
        "reason": "no patched version",
        "approved_by": "owner",
        "approved": "2026-10-17",
        "expires": "2026-11-16",
    }
    base.update(over)
    return base


def test_clean_report_passes() -> None:
    assert gate.check(_report(), [], TODAY) == []


def test_moderate_never_blocks() -> None:
    assert gate.check(_report(("GHSA-m", "uuid", "moderate")), [], TODAY) == []


@pytest.mark.parametrize("sev", ["high", "critical"])
def test_unlisted_high_or_critical_fails(sev: str) -> None:
    errors = gate.check(_report(("GHSA-x", "lib", sev)), [], TODAY)
    assert len(errors) == 1 and "GHSA-x" in errors[0]


def test_listed_high_passes() -> None:
    assert gate.check(_report(("GHSA-aaaa", "braces", "high")), [_exc()], TODAY) == []


def test_exception_is_bound_to_the_package() -> None:
    errors = gate.check(_report(("GHSA-aaaa", "other-lib", "high")), [_exc()], TODAY)
    assert any("other-lib" in e for e in errors)


def test_exception_does_not_cover_a_different_advisory() -> None:
    errors = gate.check(_report(("GHSA-bbbb", "braces", "high")), [_exc()], TODAY)
    assert any("GHSA-bbbb" in e for e in errors)


def test_escalation_to_critical_fails() -> None:
    errors = gate.check(_report(("GHSA-aaaa", "braces", "critical")), [_exc()], TODAY)
    assert any("now critical" in e for e in errors)


def test_expired_exception_fails() -> None:
    late = dt.date(2026, 11, 17)
    errors = gate.check(_report(("GHSA-aaaa", "braces", "high")), [_exc()], late)
    assert any("expired" in e for e in errors)


def test_last_day_still_valid() -> None:
    last = dt.date(2026, 11, 16)
    assert gate.check(_report(("GHSA-aaaa", "braces", "high")), [_exc()], last) == []


def test_exception_longer_than_31_days_fails() -> None:
    errors = gate.check(
        _report(("GHSA-aaaa", "braces", "high")), [_exc(expires="2027-10-17")], TODAY
    )
    assert any("31 days" in e for e in errors)


@pytest.mark.parametrize("field", ["reason", "approved_by", "expires", "id"])
def test_incomplete_exception_fails(field: str) -> None:
    exc = _exc()
    exc[field] = ""
    errors = gate.check(_report(("GHSA-aaaa", "braces", "high")), [exc], TODAY)
    assert any("missing" in e for e in errors)


def test_bad_date_fails() -> None:
    errors = gate.check(_report(), [_exc(expires="soon")], TODAY)
    assert any("not a YYYY-MM-DD" in e for e in errors)


def test_stale_exception_fails() -> None:
    errors = gate.check(_report(), [_exc()], TODAY)
    assert any("no longer matches" in e for e in errors)


@pytest.mark.parametrize(
    "report",
    [
        {"error": {"code": "ENOAUDIT"}},
        {"auditReportVersion": 1},
        {"auditReportVersion": 2, "vulnerabilities": {}, "metadata": {}},
        {"auditReportVersion": 2, "metadata": {"dependencies": {"total": 0}}},
    ],
)
def test_never_passes_on_an_empty_or_broken_report(report: dict[str, Any]) -> None:
    assert gate.check(report, [], TODAY) != []


def test_checked_in_exceptions_are_well_formed() -> None:
    data = json.loads((ROOT / ".github" / "npm-audit-exceptions.json").read_text("utf-8"))
    for exc in data["exceptions"]:
        assert all(str(exc.get(k, "")).strip() for k in gate.REQUIRED)
        approved = dt.date.fromisoformat(exc["approved"])
        expires = dt.date.fromisoformat(exc["expires"])
        assert 0 <= (expires - approved).days <= gate.MAX_DAYS


def _run(tmp_path: Path, payload: str, *extra: str) -> subprocess.CompletedProcess[str]:
    path = tmp_path / "audit.json"
    path.write_text(payload, encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(GATE), str(path), *extra],
        capture_output=True,
        text=True,
        check=False,
    )


def test_cli_fails_on_unparseable_report(tmp_path: Path) -> None:
    assert _run(tmp_path, "not json").returncode == 1


def test_cli_fails_on_unlisted_high(tmp_path: Path) -> None:
    result = _run(
        tmp_path, json.dumps(_report(("GHSA-new", "lib", "high"))), "--today", "2026-10-20"
    )
    assert result.returncode == 1
    assert "GHSA-new" in result.stderr
