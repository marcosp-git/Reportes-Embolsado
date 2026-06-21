#!/usr/bin/env python3
"""Print a compact summary of the Excel inventory."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "outputs" / "commercial-audit" / "excel_inventory.json"


def main() -> None:
    data = json.loads(INVENTORY.read_text(encoding="utf-8"))
    for file_info in data:
        print(f"FILE {file_info['file']}")
        for sheet in sorted(file_info["sheets"], key=lambda item: item["score"], reverse=True)[:4]:
            print(f"  score={sheet['score']} sheet={sheet['sheet']} rows={sheet['rows']} cols={sheet['cols']}")
            for row in sheet["sample"][:3]:
                print("    " + " | ".join(row[:12]))
        print()


if __name__ == "__main__":
    main()
