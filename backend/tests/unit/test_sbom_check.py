"""SEC-033: the SBOM check fails on an empty or broken SBOM, passes on a real one."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "check_sbom.py"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("check_sbom", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


check = _load()
GOOD = {"bomFormat": "CycloneDX", "components": [{"name": "fastapi", "version": "0.115.0"}]}


def test_a_real_sbom_passes(tmp_path: Path) -> None:
    f = tmp_path / "sbom.json"
    f.write_text(json.dumps(GOOD))
    assert check.main([str(f)]) == 0


@pytest.mark.parametrize(
    "doc",
    [
        {},
        {"bomFormat": "SPDX", "components": GOOD["components"]},
        {"bomFormat": "CycloneDX"},
        {"bomFormat": "CycloneDX", "components": []},
        {"bomFormat": "CycloneDX", "components": [{"name": "x"}]},
        [],
    ],
)
def test_an_empty_or_broken_sbom_fails(tmp_path: Path, doc: object) -> None:
    f = tmp_path / "sbom.json"
    f.write_text(json.dumps(doc))
    assert check.main([str(f)]) == 1


def test_unreadable_input_fails(tmp_path: Path) -> None:
    f = tmp_path / "sbom.json"
    f.write_text("not json")
    assert check.main([str(f)]) == 1
    assert check.main([str(tmp_path / "missing.json")]) == 1
