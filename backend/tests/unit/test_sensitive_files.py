"""Tests for the tracked-sensitive-file guard.

The guard is exercised as a subprocess against throwaway git repositories, because its
contract is a command-line exit code, not a Python API. Testing the real invocation is
the only way to prove CI will actually fail.

Each repository is created with `git init` and `git add` only: no commit, no identity,
no network.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

GUARD = Path(__file__).resolve().parents[3] / "scripts" / "check_sensitive_files.py"


def _repo(tmp_path: Path, *files: str) -> Path:
    """Build a git repository whose index contains exactly ``files``."""
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    for name in files:
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("placeholder\n", encoding="utf-8")
        # -f: the guard must catch a force-added file, which is exactly the case
        # .gitignore cannot protect against.
        subprocess.run(["git", "add", "-f", "--", name], cwd=tmp_path, check=True)
    return tmp_path


def _run(cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GUARD)],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )


class TestGuardAccepts:
    def test_clean_repository_passes(self, tmp_path: Path) -> None:
        result = _run(_repo(tmp_path, "README.md", "backend/app/main.py"))
        assert result.returncode == 0
        assert "OK" in result.stdout

    def test_env_example_is_allowed(self, tmp_path: Path) -> None:
        """The committed template is the one permitted match."""
        result = _run(_repo(tmp_path, ".env.example"))
        assert result.returncode == 0

    def test_unrelated_docs_are_allowed(self, tmp_path: Path) -> None:
        result = _run(_repo(tmp_path, "docs/07-security/audit.md"))
        assert result.returncode == 0


class TestGuardRejects:
    @pytest.mark.parametrize(
        "path",
        [
            ".env",
            ".env.production",
            "certs/server.pem",
            "certs/server.key",
            "signing/upload.p12",
            "signing/upload.pfx",
            "signing/release.jks",
            "signing/release.keystore",
            "design/Xspeeria.fig",
            "docs/references/figma/Xspeeria.fig",
            "docs/references/notes.pdf",
        ],
    )
    def test_sensitive_path_fails(self, tmp_path: Path, path: str) -> None:
        result = _run(_repo(tmp_path, path))
        assert result.returncode == 1
        assert path in result.stderr

    @pytest.mark.parametrize(
        "path",
        [".gitleaksignore", "backend/.gitleaksignore", "docs/07-security/.gitleaksignore"],
    )
    def test_scanner_suppression_file_is_rejected_anywhere_in_the_tree(
        self, tmp_path: Path, path: str
    ) -> None:
        """A repository able to silence its own secret scanner is not scanned.

        `gitleaks git` honours `.gitleaksignore` fingerprints wherever the file sits, so
        committing one retires a real finding without touching CI. The scan closes the
        inline `gitleaks:allow` channel with a flag; this guard closes the file channel.
        """
        result = _run(_repo(tmp_path, path))
        assert result.returncode == 1
        assert path in result.stderr
        assert "suppress secret-scanner findings" in result.stderr

    def test_suppression_file_is_not_excused_by_the_allowlist(self, tmp_path: Path) -> None:
        """`.env.example` is the only allowed path; nothing else inherits that exemption."""
        result = _run(_repo(tmp_path, ".env.example", ".gitleaksignore"))
        assert result.returncode == 1
        assert ".gitleaksignore" in result.stderr
        assert ".env.example" not in result.stderr

    def test_reports_every_violation_not_just_the_first(self, tmp_path: Path) -> None:
        repo = _repo(tmp_path, ".env", "certs/server.key", "docs/references/a.fig")
        result = _run(repo)
        assert result.returncode == 1
        for expected in (".env", "certs/server.key", "docs/references/a.fig"):
            assert expected in result.stderr

    def test_never_prints_file_contents(self, tmp_path: Path) -> None:
        """A guard that echoes a leaked credential is worse than no guard."""
        repo = tmp_path
        subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
        (repo / ".env").write_text("SECRET_TOKEN=do-not-print-me\n", encoding="utf-8")
        subprocess.run(["git", "add", "-f", "--", ".env"], cwd=repo, check=True)
        result = _run(repo)
        assert result.returncode == 1
        assert "do-not-print-me" not in result.stdout + result.stderr


class TestGuardMatching:
    """Unit-level checks on the matching rules themselves."""

    def test_denied_patterns_are_matched_case_sensitively_by_suffix(self) -> None:
        sys.path.insert(0, str(GUARD.parent))
        try:
            from check_sensitive_files import violations
        finally:
            sys.path.pop(0)

        assert violations(["a/b/c.pem"]) == [("a/b/c.pem", "matches *.pem")]
        assert violations([".env.example"]) == []
        assert violations(["environment.md"]) == []
        assert violations(["docs/references/x"]) == [
            ("docs/references/x", "inside docs/references/")
        ]

    def test_result_is_sorted_and_deterministic(self) -> None:
        sys.path.insert(0, str(GUARD.parent))
        try:
            from check_sensitive_files import violations
        finally:
            sys.path.pop(0)

        unordered = ["z.key", "a.pem", "docs/references/m"]
        assert [path for path, _ in violations(unordered)] == [
            "a.pem",
            "docs/references/m",
            "z.key",
        ]
