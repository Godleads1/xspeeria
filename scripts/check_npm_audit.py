#!/usr/bin/env python3
"""Fail CI on any high/critical npm advisory that is not a current, approved exception.

Replaces a bare ``npm audit --audit-level=high`` (ADR-017). The threshold is unchanged:
every high or critical advisory fails the build unless it is listed, by advisory ID and
package, in ``.github/npm-audit-exceptions.json`` with an unexpired, human-approved entry.

Usage (CI):
    npm audit --omit=dev --json > audit.json || true
    python3 scripts/check_npm_audit.py audit.json

Rules:
  * The audit report must be a real npm v2 report. An error report, or a report with no
    dependency count, fails: the gate must never pass by auditing nothing.
  * A high/critical advisory not in the exceptions file fails.
  * An exception matches only the same advisory ID **and** package. If npm now reports a
    higher severity than the exception approved, it fails.
  * An expired exception fails. An exception may run at most 31 days from approval.
  * An exception that no longer matches any finding fails, so resolved entries are
    removed instead of lingering as a silent future allowance.
  * Moderate and low advisories are reported but never fail (same as before).

``--today YYYY-MM-DD`` overrides the date (tests only).
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path
from typing import Any

EXCEPTIONS = Path(__file__).resolve().parents[1] / ".github" / "npm-audit-exceptions.json"
BLOCKING = {"high": 3, "critical": 4}
RANK = {"info": 0, "low": 1, "moderate": 2, "high": 3, "critical": 4}
MAX_DAYS = 31
REQUIRED = ("id", "package", "severity", "reason", "approved_by", "approved", "expires")


def _advisories(report: dict[str, Any]) -> dict[tuple[str, str], str]:
    """(advisory id, package) -> severity, from the leaf advisory objects in `via`."""
    found: dict[tuple[str, str], str] = {}
    for vuln in report.get("vulnerabilities", {}).values():
        for via in vuln.get("via", []):
            if isinstance(via, dict):
                adv_id = str(via.get("url", "")).rstrip("/").rsplit("/", 1)[-1]
                found[(adv_id, str(via.get("name", "")))] = str(via.get("severity", "")).lower()
    return found


def _date(value: object, field: str, errors: list[str], where: str) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(value))
    except ValueError:
        errors.append(f"{where}: '{field}' is not a YYYY-MM-DD date")
        return None


def check(report: dict[str, Any], exceptions: list[dict[str, Any]], today: dt.date) -> list[str]:
    errors: list[str] = []

    if "error" in report or report.get("auditReportVersion") != 2:
        return ["npm audit did not produce a valid v2 report; refusing to pass"]
    total = report.get("metadata", {}).get("dependencies", {}).get("total", 0)
    if not isinstance(total, int) or total <= 0:
        return ["npm audit report lists no dependencies; refusing to pass"]

    allowed: dict[tuple[str, str], dict[str, Any]] = {}
    for i, exc in enumerate(exceptions):
        where = f"exception #{i + 1} ({exc.get('id', '?')})"
        missing = [k for k in REQUIRED if not str(exc.get(k, "")).strip()]
        if missing:
            errors.append(f"{where}: missing {', '.join(missing)}")
            continue
        approved = _date(exc["approved"], "approved", errors, where)
        expires = _date(exc["expires"], "expires", errors, where)
        if approved is None or expires is None:
            continue
        if (expires - approved).days > MAX_DAYS:
            errors.append(f"{where}: runs more than {MAX_DAYS} days from approval")
        if today > expires:
            errors.append(f"{where}: expired on {expires.isoformat()}; fix or re-approve")
        if str(exc["severity"]).lower() not in RANK:
            errors.append(f"{where}: unknown severity '{exc['severity']}'")
        allowed[(str(exc["id"]), str(exc["package"]))] = exc

    found = _advisories(report)
    for (adv_id, pkg), sev in sorted(found.items()):
        if sev not in BLOCKING:
            print(f"note: {sev} {pkg} {adv_id} (below the high threshold)")
            continue
        match = allowed.get((adv_id, pkg))
        if match is None:
            errors.append(f"{sev} advisory {adv_id} in {pkg} is not an approved exception")
        elif RANK[sev] > RANK.get(str(match["severity"]).lower(), 0):
            errors.append(f"{adv_id} in {pkg} is now {sev}; exception approved {match['severity']}")
        else:
            print(f"accepted until {match['expires']}: {sev} {pkg} {adv_id}")

    for key in allowed:
        if key not in found:
            errors.append(f"exception {key[0]} ({key[1]}) no longer matches a finding; remove it")

    return errors


def main(argv: list[str]) -> int:
    args = list(argv)
    today = dt.datetime.now(dt.UTC).date()
    if "--today" in args:
        i = args.index("--today")
        today = dt.date.fromisoformat(args[i + 1])
        del args[i : i + 2]
    if len(args) != 1:
        print("usage: check_npm_audit.py AUDIT_JSON [--today YYYY-MM-DD]", file=sys.stderr)
        return 2
    try:
        report = json.loads(Path(args[0]).read_text(encoding="utf-8"))
        exceptions = json.loads(EXCEPTIONS.read_text(encoding="utf-8")).get("exceptions", [])
    except (OSError, ValueError) as exc:
        print(f"npm audit gate: cannot read input: {exc}", file=sys.stderr)
        return 1
    if not isinstance(report, dict) or not isinstance(exceptions, list):
        print("npm audit gate: unexpected input shape", file=sys.stderr)
        return 1

    errors = check(report, exceptions, today)
    for err in errors:
        print(f"FAIL: {err}", file=sys.stderr)
    if errors:
        return 1
    print("npm audit gate: passed")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
