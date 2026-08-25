#!/usr/bin/env python3
"""Fail if the approved Gitleaks configuration can suppress a finding.

Both CI scans -- the artifact canary and the real repository scan -- load exactly one
configuration, `.github/gitleaks.toml`, passed explicitly with `--config`. That file is
version-controlled, so it can be edited as easily as a rogue drop-in `.gitleaks.toml`
could have replaced it. This guard is what stops an edit from quietly turning a green
job into a job that is looking for nothing.

The previous guard was a pair of `grep` lines: one requiring `useDefault = true`, one
rejecting a literal `[allowlist]` header. That rejected exactly one of several
suppression channels Gitleaks 8.30.1 accepts. `[[allowlists]]` and rule-scoped
`[[rules.allowlists]]` are equally effective at silencing a finding and neither matches
that pattern, so a suppression could land while `useDefault = true` still stood and the
canary still fired. Widening the regex would have been guesswork about TOML surface
syntax -- `[ allowlist ]`, an inline table, a dotted key and a multi-line array all
express the same thing and none of them look alike to `grep`.

So the file is parsed as TOML with the standard library and the parsed *structure* is
checked. Syntax stops mattering: an allowlist written any way TOML permits arrives here
as the same key, and the recursive walk finds it wherever it is nested.

The rules enforced:

  * `[extend]` must be exactly ``useDefault = true`` -- nothing else. `disabledRules`
    would switch off default rules by name; `path` and `url` would pull in a second
    configuration whose contents this guard never sees.
  * No `allowlist` / `allowlists` key anywhere, at any depth, global or rule-scoped.
  * No baseline or stopword suppression key anywhere.
  * **No custom rules at all.** `useDefault = true` loads the default rule set, but a
    `[[rules]]` entry reusing a default rule's `id` *replaces* that default rather than
    adding to it. A config could therefore keep `useDefault = true`, redefine
    `private-key` with a regex matching only the canary's planted value, and pass both
    this guard's earlier form and the canary -- which asserts the `private-key` rule
    fired, and it would have. Every real private key would then walk through a green
    scan. Narrowing a rule is suppression wearing a different hat, so Phase 1 permits no
    custom rule definitions, and the approved config declares none.
  * Top-level keys limited to `title` and `extend`, so a future suppression mechanism has
    to be added here deliberately before it can take effect.

The guard reads one file and parses it. No network call, no third-party dependency, and
nothing from the file is printed except the *names* of the offending keys.

Exit codes:
    0  the configuration matches the approved structure
    1  the configuration could suppress a finding
    2  the guard could not run (file missing, unreadable, or not valid TOML)
"""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path
from typing import Any

__all__ = ["DEFAULT_CONFIG", "main", "violations"]

#: The single approved configuration. Both CI scans pass this exact path to `--config`,
#: and `check_sensitive_files.py` rejects every other tracked gitleaks config, so this is
#: the only configuration that can be in play.
DEFAULT_CONFIG = ".github/gitleaks.toml"

#: `[extend]` in full. Any other key under it is a suppression channel: `disabledRules`
#: turns default rules off by name, `path`/`url` chain in a configuration this guard
#: cannot inspect.
REQUIRED_EXTEND: dict[str, Any] = {"useDefault": True}

#: Keys that suppress findings, rejected at every depth. Compared lower-cased, so a
#: differently-cased spelling cannot slip past.
DENIED_KEYS: frozenset[str] = frozenset(
    {
        "allowlist",
        "allowlists",
        "baseline",
        "baselinepath",
        "disabledrules",
        "rules",
        "stopwords",
    }
)

#: Everything the approved configuration is permitted to declare. A key outside this set
#: is refused rather than assumed harmless. `rules` was permitted until 2026-08-24; the
#: custom-rules note in the module docstring says why it no longer is.
ALLOWED_TOP_LEVEL: frozenset[str] = frozenset({"title", "extend"})


def _denied_key_paths(node: Any, trail: str = "") -> list[str]:
    """Return the dotted path of every denied key reachable from ``node``."""
    found: list[str] = []
    if isinstance(node, dict):
        for key, value in node.items():
            where = f"{trail}.{key}" if trail else str(key)
            if str(key).lower() in DENIED_KEYS:
                found.append(where)
            found.extend(_denied_key_paths(value, where))
    elif isinstance(node, list):
        for index, item in enumerate(node):
            found.extend(_denied_key_paths(item, f"{trail}[{index}]"))
    return found


def violations(config: dict[str, Any]) -> list[str]:
    """Return one message per way ``config`` could suppress a finding."""
    found: list[str] = []

    extend = config.get("extend")
    if extend != REQUIRED_EXTEND:
        found.append(
            f"[extend] must be exactly {REQUIRED_EXTEND!r}, found {extend!r} "
            "-- the default rule set is no longer guaranteed"
        )

    for key in sorted(set(config) - ALLOWED_TOP_LEVEL):
        found.append(f"unexpected top-level key {key!r}: not part of the approved structure")

    for path in sorted(set(_denied_key_paths(config))):
        found.append(
            f"suppression key at {path}: allowlists, baselines, disabled default rules "
            "and custom rule definitions are not permitted"
        )

    return found


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    path = Path(args[0]) if args else Path(DEFAULT_CONFIG)

    try:
        with path.open("rb") as handle:
            config = tomllib.load(handle)
    except OSError as exc:
        print(f"check_gitleaks_config: cannot read {path}: {exc}", file=sys.stderr)
        return 2
    except tomllib.TOMLDecodeError as exc:
        print(f"check_gitleaks_config: {path} is not valid TOML: {exc}", file=sys.stderr)
        return 2

    found = violations(config)
    if not found:
        print(f"check_gitleaks_config: OK - {path} extends the defaults and suppresses nothing")
        return 0

    print(f"check_gitleaks_config: FAIL - {path} could suppress a finding", file=sys.stderr)
    for message in found:
        print(f"  {message}", file=sys.stderr)
    print(
        "\nThis configuration exists to guarantee coverage. Anything that narrows "
        "coverage -- an allowlist, a baseline, a disabled default rule, a custom rule "
        "that replaces an inherited one, a chained config -- does not belong in it. "
        "Resolve the finding instead of retiring it.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
