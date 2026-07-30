#!/usr/bin/env python3
"""Verify the frozen Gate 3 ABI subset and its canonical Keccak-256 hash."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ABI_PATH = ROOT / "abi" / "TaskEscrow.createTask.json"
EXPECTED_HASH = "0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5"
FROZEN_ENTRIES = {("function", "createTask"), ("event", "TaskCreated")}


def run(*args: str) -> str:
    completed = subprocess.run(
        args,
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def main() -> int:
    committed: list[dict[str, Any]] = json.loads(ABI_PATH.read_text(encoding="utf-8"))
    compiler_abi: list[dict[str, Any]] = json.loads(run("forge", "inspect", "TaskEscrow", "abi", "--json"))
    compiler_subset = [
        entry
        for entry in compiler_abi
        if (entry.get("type"), entry.get("name")) in FROZEN_ENTRIES
    ]

    if compiler_subset != committed:
        print("ERROR: committed Gate 3 ABI does not match the compiler ABI subset", file=sys.stderr)
        return 1

    canonical = json.dumps(committed, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    actual_hash = run("cast", "keccak", canonical)
    if actual_hash != EXPECTED_HASH:
        print(
            f"ERROR: Gate 3 ABI hash changed: expected {EXPECTED_HASH}, got {actual_hash}",
            file=sys.stderr,
        )
        return 1

    print(f"Gate 3 ABI matches compiler output: {ABI_PATH.relative_to(ROOT)}")
    print(f"Canonical ABI hash: {actual_hash}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
