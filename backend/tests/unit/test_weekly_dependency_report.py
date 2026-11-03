"""ADR-093: the weekly dependency report fails on high/critical and on a broken scan."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "weekly_dependency_report.py"


def _module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("weekly_dependency_report", SCRIPT)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _npm(sev: str | None) -> dict[str, object]:
    vulns = {}
    if sev:
        vulns = {
            "glob": {"severity": sev, "via": [{"title": "A real advisory"}]},
            "@expo/cli": {"severity": sev, "via": ["glob"]},  # only depends on it: not listed
        }
    counts = {"critical": 0, "high": 0, "moderate": 0, "low": 0}
    if sev:
        counts[sev] = 2
    return {"vulnerabilities": vulns, "metadata": {"vulnerabilities": counts}}


def _run(
    tmp_path: Path, npm: object, pip: object, capsys: pytest.CaptureFixture[str]
) -> tuple[int, str]:
    a, b = tmp_path / "npm.json", tmp_path / "pip.json"
    a.write_text(json.dumps(npm) if npm is not None else "")
    b.write_text(json.dumps(pip) if pip is not None else "")
    code = _module().main([str(a), str(b)])
    return code, capsys.readouterr().out


CLEAN_PIP = {"dependencies": [{"name": "fastapi", "version": "1", "vulns": []}]}


def test_moderates_are_listed_not_blocking(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out = _run(tmp_path, _npm("moderate"), CLEAN_PIP, capsys)
    assert code == 0
    assert "| glob | moderate | A real advisory |" in out
    assert "@expo/cli" not in out


@pytest.mark.parametrize("sev", ["high", "critical"])
def test_high_or_critical_in_any_package_fails(
    tmp_path: Path, sev: str, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out = _run(tmp_path, _npm(sev), CLEAN_PIP, capsys)
    assert code == 1
    assert "Action needed" in out


def test_any_python_finding_fails(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    pip = {
        "dependencies": [
            {"name": "x", "version": "1", "vulns": [{"id": "PYSEC-1", "fix_versions": ["2"]}]}
        ]
    }
    code, out = _run(tmp_path, _npm(None), pip, capsys)
    assert code == 1
    assert "PYSEC-1" in out and "fixed in 2" in out


def test_a_broken_scan_is_never_a_pass(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert _run(tmp_path, None, CLEAN_PIP, capsys)[0] == 1
    assert _run(tmp_path, _npm(None), {"oops": 1}, capsys)[0] == 1
    code, out = _run(tmp_path, _npm(None), CLEAN_PIP, capsys)
    assert code == 0 and "No advisories." in out
