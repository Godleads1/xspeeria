"""Check that a CycloneDX SBOM is real before CI keeps it (SEC-033).

    python3 scripts/check_sbom.py path/to/sbom.cdx.json

Fails (exit 1) unless the file is CycloneDX JSON listing at least one component, each with a
name and a version. An empty or broken SBOM would look like evidence while proving nothing.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def problems(doc: object) -> list[str]:
    if not isinstance(doc, dict) or doc.get("bomFormat") != "CycloneDX":
        return ["not a CycloneDX document"]
    components = doc.get("components")
    if not isinstance(components, list) or not components:
        return ["no components listed"]
    missing = [
        i
        for i, c in enumerate(components)
        if not isinstance(c, dict) or not c.get("name") or not c.get("version")
    ]
    if missing:
        return [f"{len(missing)} components without a name or version"]
    return []


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: check_sbom.py SBOM_JSON", file=sys.stderr)
        return 2
    try:
        doc = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"SBOM check: cannot read it ({type(exc).__name__})", file=sys.stderr)
        return 1
    found = problems(doc)
    if found:
        for p in found:
            print(f"SBOM check: FAIL - {p}", file=sys.stderr)
        return 1
    print(f"SBOM check: OK - {len(doc['components'])} components")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
