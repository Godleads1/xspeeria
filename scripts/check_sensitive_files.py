#!/usr/bin/env python3
"""Fail if a sensitive file has been committed to the repository.

`.gitignore` prevents an accidental `git add`; it does nothing about a file that is
already tracked, and `--force` bypasses it entirely. This guard closes that gap by
inspecting what git actually tracks, so the check cannot be satisfied by an ignore rule
that was added after the fact.

It also rejects files that would suppress the secret scanner itself -- see
`DENIED_SUPPRESSION_NAMES`. A repository able to silence its own scanner is not scanned.

It reads `git ls-files` only. It never opens a tracked file, so a matched path is
reported by name and its contents are never printed, logged, or sent anywhere. There is
no network call and no third-party dependency.

`git ls-files` emits forward slashes on every platform, so the matching below is
identical on Windows and Linux.

Exit codes:
    0  no tracked file matches a sensitive pattern
    1  at least one tracked file matches
    2  the guard could not run (not a git repository, git missing)
"""

from __future__ import annotations

import subprocess
import sys
from fnmatch import fnmatch

__all__ = ["main", "tracked_files", "violations"]

#: Basename globs that must never be tracked.
DENIED_NAMES: tuple[str, ...] = (
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.jks",
    "*.keystore",
    "*.fig",
)

#: Path prefixes that must never be tracked. Compared against the full repo-relative
#: path, so `docs/references/` covers every descendant.
DENIED_PREFIXES: tuple[str, ...] = ("docs/references/",)

#: Exact repo-relative paths that are allowed despite matching a denied pattern.
#: `.env.example` is the committed template and contains only placeholders.
ALLOWED_PATHS: frozenset[str] = frozenset({".env.example"})

#: Basenames that would let the repository silence its own secret scanner. These are not
#: secrets; they are the channel through which a real finding gets quietly retired.
#: `gitleaks git` honours `.gitleaksignore` fingerprints wherever they sit in the tree,
#: so committing one suppresses findings without touching CI. The scan itself passes
#: `--ignore-gitleaks-allow` to close the inline `gitleaks:allow` channel; this guard
#: closes the file channel. Neither may be reintroduced as an allowlist or a baseline.
DENIED_SUPPRESSION_NAMES: tuple[str, ...] = (".gitleaksignore",)


def tracked_files() -> list[str]:
    """Return every tracked path, repo-relative, with forward slashes."""
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        capture_output=True,
        text=True,
        check=True,
    )
    return [path for path in result.stdout.split("\0") if path]


def violations(paths: list[str]) -> list[tuple[str, str]]:
    """Return ``(path, reason)`` for every tracked path that must not be tracked."""
    found: list[tuple[str, str]] = []
    for path in paths:
        if path in ALLOWED_PATHS:
            continue
        name = path.rsplit("/", 1)[-1]
        if name in DENIED_SUPPRESSION_NAMES:
            found.append((path, f"{name} would suppress secret-scanner findings"))
            continue
        for prefix in DENIED_PREFIXES:
            if path.startswith(prefix):
                found.append((path, f"inside {prefix}"))
                break
        else:
            for pattern in DENIED_NAMES:
                if fnmatch(name, pattern):
                    found.append((path, f"matches {pattern}"))
                    break
    return sorted(found)


def main() -> int:
    try:
        paths = tracked_files()
    except FileNotFoundError:
        print("check_sensitive_files: git is not available", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as exc:
        print(f"check_sensitive_files: git ls-files failed: {exc}", file=sys.stderr)
        return 2

    found = violations(paths)
    if not found:
        print(f"check_sensitive_files: OK - {len(paths)} tracked files, no sensitive paths")
        return 0

    print("check_sensitive_files: FAIL - sensitive files are tracked by git", file=sys.stderr)
    for path, reason in found:
        print(f"  {path}  ({reason})", file=sys.stderr)
    print(
        "\nRemove each file from the index (`git rm --cached <path>`), confirm it is "
        "ignored, and rotate anything that was a real credential: removing it from the "
        "index does not remove it from history. A scanner-suppression file is not fixed "
        "by rotating anything: delete it and resolve the finding it was hiding.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
