#!/usr/bin/env python3
"""Weekly dependency report (ADR-093): every known advisory in every npm and Python package.

Usage: weekly_dependency_report.py NPM_AUDIT_JSON PIP_AUDIT_JSON

Prints a Markdown report (for the GitHub run summary). Exit code 1 if any package has a high
or critical advisory, or if a report is missing or unreadable (a broken scan is never a pass);
0 otherwise. Moderates and lows are listed only.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

BLOCKING = {"high", "critical"}


def _load(path: str) -> Any:
    text = Path(path).read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"{path} is empty")
    return json.loads(text)


def npm_rows(report: dict[str, Any]) -> list[tuple[str, str, str]]:
    """(package, severity, advisory titles) for each package with its own advisory."""
    if "vulnerabilities" not in report or "metadata" not in report:
        raise ValueError("npm report has no vulnerabilities section")
    rows = []
    for name, v in sorted(report["vulnerabilities"].items()):
        titles = [x.get("title", "") for x in v.get("via", []) if isinstance(x, dict)]
        if titles:  # skip packages that are listed only because they depend on one
            rows.append((name, str(v.get("severity", "unknown")), "; ".join(titles)))
    return rows


def pip_rows(report: dict[str, Any]) -> list[tuple[str, str, str]]:
    if "dependencies" not in report:
        raise ValueError("pip-audit report has no dependencies section")
    rows = []
    for dep in report["dependencies"]:
        for vuln in dep.get("vulns", []):
            fixed = ", ".join(vuln.get("fix_versions", [])) or "no fix yet"
            rows.append(
                (f"{dep['name']} {dep.get('version', '')}", vuln["id"], f"fixed in {fixed}")
            )
    return rows


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    lines = ["# Weekly dependency report", ""]
    failed = False
    try:
        npm = npm_rows(_load(argv[0]))
        counts = _load(argv[0])["metadata"]["vulnerabilities"]
    except (OSError, ValueError, KeyError) as exc:
        lines.append(f"**npm audit did not produce a usable report:** {exc}")
        npm, counts, failed = [], {}, True
    try:
        pip = pip_rows(_load(argv[1]))
    except (OSError, ValueError, KeyError) as exc:
        lines.append(f"**pip-audit did not produce a usable report:** {exc}")
        pip, failed = [], True

    lines += ["## npm (app, console, developer tools)", ""]
    if counts:
        lines.append(
            ", ".join(f"{k}: {counts.get(k, 0)}" for k in ("critical", "high", "moderate", "low"))
        )
        lines.append("")
    if npm:
        lines += ["| Package | Severity | Advisory |", "|---|---|---|"]
        lines += [f"| {p} | {s} | {t} |" for p, s, t in npm]
    else:
        lines.append("No advisories.")
    blocking_npm = [r for r in npm if r[1] in BLOCKING]

    lines += ["", "## Python (server, developer tools)", ""]
    if pip:
        lines += ["| Package | Advisory | Fix |", "|---|---|---|"]
        lines += [f"| {p} | {i} | {f} |" for p, i, f in pip]
    else:
        lines.append("No known vulnerabilities.")

    # pip-audit doesn't give a severity, so any Python finding is treated as blocking: the
    # per-pull-request gate (ci.yml, `pip-audit --strict`) already fails on every one.
    if blocking_npm or pip:
        failed = True
        lines += ["", "**Action needed:** a high or critical npm advisory, or any Python one."]
    print("\n".join(lines))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
