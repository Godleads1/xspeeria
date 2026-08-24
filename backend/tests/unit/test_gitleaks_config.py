"""Tests for the approved-Gitleaks-configuration guard.

The guard is exercised as a subprocess against throwaway TOML files, because its
contract is a command-line exit code: that is what CI acts on, and a guard that returns
the right value from a Python call while exiting 0 from the shell protects nothing.

The regression these tests exist for: the previous guard was a `grep` for a literal
`[allowlist]` header, so `[[allowlists]]` and `[[rules.allowlists]]` -- both accepted by
Gitleaks 8.30.1, both able to silence a real finding -- passed it untouched while
`useDefault = true` still stood and the canary still fired. Each suppression shape below
is asserted separately, and each asserts *which* rule rejected it, so a case cannot pass
for the wrong reason and a future rewrite cannot quietly drop one.

Every fixture is a complete configuration rather than a fragment appended to a shared
prefix. TOML assigns a bare key to whichever table precedes it, so an appended
`stopwords = [...]` would land inside `[extend]` and be caught by the wrong check --
still a failure, but not the failure the test claims to be making.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
GUARD = REPO_ROOT / "scripts" / "check_gitleaks_config.py"
APPROVED_CONFIG = REPO_ROOT / ".github" / "gitleaks.toml"

TITLE = 'title = "test configuration"\n'
EXTEND = '\n[extend]\nuseDefault = true\n'
APPROVED = TITLE + EXTEND


def _run(config: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GUARD), str(config)],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )


def _config(tmp_path: Path, body: str) -> Path:
    target = tmp_path / "gitleaks.toml"
    target.write_text(body, encoding="utf-8")
    return target


class TestApprovedConfiguration:
    def test_the_approved_shape_passes(self, tmp_path: Path) -> None:
        assert _run(_config(tmp_path, APPROVED)).returncode == 0

    def test_the_real_repository_configuration_passes(self) -> None:
        """The file both CI scans actually load must satisfy its own guard."""
        assert _run(APPROVED_CONFIG).returncode == 0

    def test_the_guard_defaults_to_the_approved_path(self) -> None:
        """No argument means `.github/gitleaks.toml`: CI passes none."""
        result = subprocess.run(
            [sys.executable, str(GUARD)], capture_output=True, text=True, cwd=REPO_ROOT
        )
        assert result.returncode == 0
        assert ".github" in result.stdout


class TestSuppressionIsRejected:
    """Every allowlist shape Gitleaks accepts, including the two `grep` missed."""

    @pytest.mark.parametrize(
        ("label", "body"),
        [
            (
                "[allowlist] global table",
                APPROVED + '\n[allowlist]\ndescription = "quiet"\nregexes = [\'\'\'.\'\'\']\n',
            ),
            (
                "[[allowlists]] global array of tables",
                APPROVED + '\n[[allowlists]]\ndescription = "quiet"\nregexes = [\'\'\'.\'\'\']\n',
            ),
            (
                "[[rules.allowlists]] rule-scoped array of tables",
                APPROVED
                + '\n[[rules]]\nid = "r"\nregex = \'\'\'x\'\'\'\n'
                + "\n[[rules.allowlists]]\nregexes = ['''.''']\n",
            ),
            (
                "[rules.allowlist] rule-scoped table",
                APPROVED
                + '\n[[rules]]\nid = "r"\nregex = \'\'\'x\'\'\'\n'
                + "\n[rules.allowlist]\nregexes = ['''.''']\n",
            ),
            (
                "inline table",
                TITLE + "allowlist = { regexes = ['''.'''] }\n" + EXTEND,
            ),
            (
                "dotted key",
                TITLE + 'allowlist.description = "quiet"\n' + EXTEND,
            ),
            (
                "spaced header",
                APPROVED + '\n[ allowlist ]\ndescription = "quiet"\n',
            ),
            (
                "differently cased header",
                APPROVED + '\n[AllowList]\ndescription = "quiet"\n',
            ),
            (
                "stopwords",
                TITLE + 'stopwords = ["quiet"]\n' + EXTEND,
            ),
            (
                "baselinePath",
                TITLE + 'baselinePath = "baseline.json"\n' + EXTEND,
            ),
        ],
    )
    def test_suppression_shapes_are_rejected(
        self, tmp_path: Path, label: str, body: str
    ) -> None:
        result = _run(_config(tmp_path, body))
        assert result.returncode == 1, f"{label} was accepted: {result.stdout}"
        assert "suppression key" in result.stderr, f"{label} failed for the wrong reason"


class TestDefaultRulesMustSurvive:
    def test_use_default_false_is_rejected(self, tmp_path: Path) -> None:
        result = _run(_config(tmp_path, TITLE + "\n[extend]\nuseDefault = false\n"))
        assert result.returncode == 1
        assert "[extend]" in result.stderr

    def test_a_missing_extend_section_is_rejected(self, tmp_path: Path) -> None:
        result = _run(_config(tmp_path, TITLE))
        assert result.returncode == 1
        assert "[extend]" in result.stderr

    def test_disabled_default_rules_are_rejected(self, tmp_path: Path) -> None:
        body = TITLE + '\n[extend]\nuseDefault = true\ndisabledRules = ["private-key"]\n'
        result = _run(_config(tmp_path, body))
        assert result.returncode == 1
        assert "[extend]" in result.stderr

    def test_a_chained_configuration_is_rejected(self, tmp_path: Path) -> None:
        """`[extend].path` would pull in rules and allowlists this guard never sees."""
        body = TITLE + '\n[extend]\nuseDefault = true\npath = "other.toml"\n'
        result = _run(_config(tmp_path, body))
        assert result.returncode == 1
        assert "[extend]" in result.stderr


class TestUnknownStructureIsRefused:
    def test_an_unexpected_top_level_key_is_rejected(self, tmp_path: Path) -> None:
        result = _run(_config(tmp_path, TITLE + "redact = true\n" + EXTEND))
        assert result.returncode == 1
        assert "unexpected top-level key" in result.stderr


class TestTheGuardFailsClosed:
    def test_a_missing_file_exits_two(self, tmp_path: Path) -> None:
        assert _run(tmp_path / "absent.toml").returncode == 2

    def test_malformed_toml_exits_two(self, tmp_path: Path) -> None:
        result = _run(_config(tmp_path, "this is not = = toml\n"))
        assert result.returncode == 2
        assert "not valid TOML" in result.stderr
