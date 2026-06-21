#!/usr/bin/env python3
"""Print selected spreadsheet rows for source inspection."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import openpyxl


def clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\n", " ").strip()


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: peek_sheet.py <xlsx> <sheet> [max_rows] [max_cols]")
    path = Path(sys.argv[1])
    sheet_name = sys.argv[2]
    max_rows = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    max_cols = int(sys.argv[4]) if len(sys.argv) > 4 else 30

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        ws = wb[sheet_name]
        for idx, row in enumerate(ws.iter_rows(min_row=1, max_row=max_rows, values_only=True), start=1):
            values = [clean(value) for value in row[:max_cols]]
            if any(values):
                print(f"{idx:03d}: " + " | ".join(values))
    finally:
        wb.close()


if __name__ == "__main__":
    main()
