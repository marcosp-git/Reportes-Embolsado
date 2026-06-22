#!/usr/bin/env python3
"""Build dashboard data from current Embolsado Excel reports.

The output is a local browser payload. It can contain commercial data, so it is
ignored by git through public/dashboard-data.js.
"""

from __future__ import annotations

import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import openpyxl


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "Archivos de Trabajo" / "Informes Iñaqui"
AUDIT = ROOT / "outputs" / "commercial-audit"
OUT = ROOT / "public" / "dashboard-data.js"


def clean(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip())


def norm(value: Any) -> str:
    text = unicodedata.normalize("NFD", clean(value).upper())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^A-Z0-9]+", " ", text).strip()


def number(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = clean(value)
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return 0.0


def pct(value: Any) -> float:
    return number(value)


def read_sheet(path: Path, sheet: str) -> list[list[Any]]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        ws = wb[sheet]
        return [list(row) for row in ws.iter_rows(values_only=True)]
    finally:
        wb.close()


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def team_key(name: Any) -> str:
    text = norm(name)
    if "GUS" in text or "GUSTAVO" in text:
        return "GUSTAVO"
    if "PABLO" in text:
        return "PABLO"
    if "JOSE" in text:
        return "JOSE"
    if "MOSTRADOR" in text:
        return "MOSTRADOR"
    return clean(name).upper()


def seller_key(name: Any) -> str:
    text = norm(name)
    aliases = {
        "P JORGE": "PATRICIO JORGE",
        "J JORGE": "JAVIER JORGE",
        "INSUA": "JORGE INSUA",
        "CHIARADIA": "GUSTAVO CHIARADIA",
        "VD MDQ": "VD MDQ",
    }
    return aliases.get(text, text)


def compact_name(value: Any) -> str:
    return clean(value).upper()


def projected_summary() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows = read_sheet(WORK / "16. PROYECTADO DIARIO JUNIO.xlsx", "PROY ")
    month_days = int(number(rows[2][1])) if len(rows) > 2 else 0
    counted_days = int(number(rows[3][1])) if len(rows) > 3 else 0
    progress = number(rows[3][2]) if len(rows) > 3 else 0

    sections = [
        ("HAE", 8, 12, 1),
        ("PREMEZCLAS", 37, 41, 0),
    ]
    metrics: list[dict[str, Any]] = []
    for category, start, end, team_col in sections:
        for row in rows[start:end + 1]:
            team = team_key(row[team_col])
            if not team:
                continue
            metrics.append(
                {
                    "category": category,
                    "team": team,
                    "objective": round(number(row[2]), 2),
                    "dailyObjective": round(number(row[3]), 2),
                    "objectiveToDate": round(number(row[4]), 2),
                    "actual": round(number(row[5]), 2),
                    "vsToDate": round(pct(row[6]), 4),
                    "vsMonth": round(pct(row[7]), 4),
                    "lastYear": round(number(row[8]), 2),
                    "vsLastYear": round(pct(row[9]), 4),
                }
            )

    return metrics, {"monthDays": month_days, "countedDays": counted_days, "monthProgress": round(progress, 4)}


def daily_sales() -> list[dict[str, Any]]:
    rows = read_sheet(WORK / "16. PROYECTADO DIARIO JUNIO.xlsx", "PROY ")
    daily: list[dict[str, Any]] = []
    for category, header_idx, start, end in (("HAE", 18, 20, 25), ("PREMEZCLAS", 45, 47, 52)):
        labels = [clean(value) for value in rows[header_idx][1:22]]
        for row in rows[start:end + 1]:
            team = team_key(row[0])
            if not team:
                continue
            for idx, label in enumerate(labels, start=1):
                value = number(row[idx])
                daily.append({"category": category, "team": team, "day": label, "value": round(value, 2)})
    return daily


def seller_daily() -> dict[str, dict[str, Any]]:
    rows = read_sheet(WORK / "16. PROYECTADO DIARIO JUNIO.xlsx", "H1")
    sellers: dict[str, dict[str, Any]] = {}
    for row in rows:
        if len(row) < 4:
            continue
        jefe = clean(row[1])
        vendedor = clean(row[2])
        actual = number(row[3])
        if not jefe or not vendedor or vendedor == "VENDEDOR":
            continue
        if actual <= 0 and not norm(vendedor):
            continue
        key = seller_key(vendedor)
        entry = sellers.setdefault(
            key,
            {
                "seller": compact_name(vendedor),
                "teamCode": jefe,
                "haeActual": 0.0,
                "totalTn": 0.0,
                "importe": 0.0,
                "ppxKg": 0.0,
                "newObjective": 0.0,
                "newActual": 0.0,
                "recoveredObjective": 0.0,
                "recoveredActual": 0.0,
                "lostClients": 0.0,
                "activeClients": 0,
                "inactiveClients": 0,
            },
        )
        entry["haeActual"] += actual
    return sellers


def current_price_by_seller(sellers: dict[str, dict[str, Any]]) -> None:
    rows = read_sheet(WORK / "PP2SJ 1.xlsx", "POR VENDEDOR")
    current_team = ""
    for row in rows:
        if any("JF" in clean(cell) or "GC" in clean(cell) for cell in row[:1]):
            current_team = clean(row[0])
        if len(row) < 7:
            continue
        name = clean(row[1])
        if not name or name == "Vendedor":
            continue
        if norm(name) == "TOTAL":
            continue
        key = seller_key(name)
        entry = sellers.setdefault(
            key,
            {
                "seller": compact_name(name),
                "teamCode": current_team,
                "haeActual": 0.0,
                "totalTn": 0.0,
                "importe": 0.0,
                "ppxKg": 0.0,
                "newObjective": 0.0,
                "newActual": 0.0,
                "recoveredObjective": 0.0,
                "recoveredActual": 0.0,
                "lostClients": 0.0,
                "activeClients": 0,
                "inactiveClients": 0,
            },
        )
        tn = number(row[5])
        importe = number(row[3])
        entry["totalTn"] += tn
        entry["importe"] += importe
        entry["ppxKg"] = number(row[4])


def new_and_recovered(sellers: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    team_summary: dict[str, dict[str, Any]] = defaultdict(lambda: defaultdict(float))

    rows = read_sheet(WORK / "Clientes Nuevos y Recuperados 2.xlsx", "Clientes Nuevos")
    for row in rows[3:]:
        name = clean(row[0])
        if not name:
            continue
        objective = number(row[1])
        actual = number(row[2])
        key = team_key(name)
        if key in {"GUSTAVO", "PABLO", "JOSE"}:
            team_summary[key]["newObjective"] += objective
            team_summary[key]["newActual"] += actual
            continue
        entry = sellers.setdefault(seller_key(name), {"seller": compact_name(name)})
        entry["newObjective"] = objective
        entry["newActual"] = actual

    rows = read_sheet(WORK / "Clientes Nuevos y Recuperados 2.xlsx", "Clientes Recuperados")
    for row in rows[3:]:
        name = clean(row[0])
        if not name:
            continue
        objective = number(row[1])
        recovered = number(row[3])
        lost = number(row[4])
        key = team_key(name)
        if key in {"GUSTAVO", "PABLO", "JOSE"}:
            team_summary[key]["recoveredObjective"] += objective
            team_summary[key]["recoveredActual"] += recovered
            team_summary[key]["lostClients"] += lost
            continue
        entry = sellers.setdefault(seller_key(name), {"seller": compact_name(name)})
        entry["recoveredObjective"] = objective
        entry["recoveredActual"] = recovered
        entry["lostClients"] = lost

    return {team: dict(values) for team, values in team_summary.items()}


def activity_by_seller(sellers: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    rows = read_sheet(WORK / "ACTIVIDAD JUNIO 1.xlsx", "ACTIVIDAD DE CLIENTES")
    team_activity: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows[2:]:
        for offset in (0, 11):
            seller = clean(row[offset + 1]) if len(row) > offset + 9 else ""
            june = norm(row[offset + 9]) if len(row) > offset + 9 else ""
            if not seller or seller == "VENDEDOR":
                continue
            key = seller_key(seller)
            entry = sellers.setdefault(key, {"seller": compact_name(seller)})
            if june == "ACTIVO":
                entry["activeClients"] = entry.get("activeClients", 0) + 1
                team_activity[team_key(row[offset])]["activeClients"] += 1
            elif june == "INACTIVO":
                entry["inactiveClients"] = entry.get("inactiveClients", 0) + 1
                team_activity[team_key(row[offset])]["inactiveClients"] += 1
    return {team: dict(values) for team, values in team_activity.items()}


def client_ranking() -> list[dict[str, Any]]:
    rows = read_sheet(WORK / "Ránking de Clientes 1.xlsx", "Tabla No Formulada")
    clients = []
    for row in rows[1:]:
        client_id = clean(row[0])
        if not client_id or client_id == "CLIENTE":
            continue
        total = number(row[8])
        clients.append(
            {
                "id": client_id,
                "name": clean(row[1]),
                "seller": compact_name(row[2]),
                "category": clean(row[3]),
                "total": round(total, 2),
                "maxMonth": round(number(row[10]), 2),
                "objective35": round(number(row[11]), 2),
            }
        )
    return sorted(clients, key=lambda item: item["total"], reverse=True)[:80]


def monthly_bags_by_client() -> dict[str, float]:
    rows = read_sheet(WORK / "PP2SJ 1.xlsx", "GEN")
    by_client: dict[str, float] = defaultdict(float)
    excluded_families = {"SUB", "VAR"}
    for row in rows[1:]:
        family = norm(row[1]) if len(row) > 1 else ""
        client_id = clean(row[4]) if len(row) > 4 else ""
        if not family or family in excluded_families or not client_id:
            continue
        by_client[client_id] += number(row[5]) / 25
    return by_client


def zone_volume() -> list[dict[str, Any]]:
    rows = read_csv_rows(AUDIT / "clients_normalized.csv")
    clients_by_id = {clean(row.get("client_id")): row for row in rows if clean(row.get("client_id"))}
    by_zone: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"zone": "", "clients": 0, "mappedClients": 0, "volume": 0.0, "unmappedVolume": 0.0}
    )

    for client_id, volume in monthly_bags_by_client().items():
        row = clients_by_id.get(client_id)
        if not row or not row.get("lat") or not row.get("lon"):
            zone = "Sin coordenadas"
        else:
            zone = row.get("zone_name") or "Interior"
        item = by_zone[zone]
        item["zone"] = zone
        item["clients"] += 1
        if row and row.get("lat") and row.get("lon"):
            item["mappedClients"] += 1
            item["volume"] += volume
        else:
            item["unmappedVolume"] += volume
            item["volume"] += volume

    for item in by_zone.values():
        item["volume"] = round(item["volume"], 2)
        item["unmappedVolume"] = round(item["unmappedVolume"], 2)
    return sorted(by_zone.values(), key=lambda item: item["volume"], reverse=True)


def main() -> None:
    sellers = seller_daily()
    current_price_by_seller(sellers)
    team_new_recovered = new_and_recovered(sellers)
    team_activity = activity_by_seller(sellers)
    projected, period = projected_summary()
    daily = daily_sales()

    seller_rows = []
    for key, entry in sellers.items():
        seller_rows.append(
            {
                "seller": entry.get("seller", key),
                "teamCode": entry.get("teamCode", ""),
                "haeActual": round(number(entry.get("haeActual")), 2),
                "totalTn": round(number(entry.get("totalTn")), 2),
                "importe": round(number(entry.get("importe")), 2),
                "ppxKg": round(number(entry.get("ppxKg")), 2),
                "newObjective": round(number(entry.get("newObjective")), 2),
                "newActual": round(number(entry.get("newActual")), 2),
                "recoveredObjective": round(number(entry.get("recoveredObjective")), 2),
                "recoveredActual": round(number(entry.get("recoveredActual")), 2),
                "lostClients": round(number(entry.get("lostClients")), 2),
                "activeClients": int(number(entry.get("activeClients"))),
                "inactiveClients": int(number(entry.get("inactiveClients"))),
            }
        )

    totals = {
        "haeObjective": sum(item["objective"] for item in projected if item["category"] == "HAE" and item["team"] == "TOTAL"),
        "haeActual": sum(item["actual"] for item in projected if item["category"] == "HAE" and item["team"] == "TOTAL"),
        "premezclasObjective": sum(item["objective"] for item in projected if item["category"] == "PREMEZCLAS" and item["team"] == "TOTAL"),
        "premezclasActual": sum(item["actual"] for item in projected if item["category"] == "PREMEZCLAS" and item["team"] == "TOTAL"),
    }
    totals["haeVsToDate"] = next((item["vsToDate"] for item in projected if item["category"] == "HAE" and item["team"] == "TOTAL"), 0)
    totals["premezclasVsToDate"] = next((item["vsToDate"] for item in projected if item["category"] == "PREMEZCLAS" and item["team"] == "TOTAL"), 0)

    payload = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "period": period,
        "totals": totals,
        "projected": projected,
        "daily": daily,
        "sellers": sorted(seller_rows, key=lambda item: item["haeActual"], reverse=True),
        "teamNewRecovered": team_new_recovered,
        "teamActivity": team_activity,
        "clientRanking": client_ranking(),
        "zoneVolume": zone_volume(),
        "sources": [
            "16. PROYECTADO DIARIO JUNIO.xlsx",
            "Clientes Nuevos y Recuperados 2.xlsx",
            "ACTIVIDAD JUNIO 1.xlsx",
            "PP2SJ 1.xlsx",
            "Ránking de Clientes 1.xlsx",
        ],
    }

    OUT.write_text("window.EMBOLSADO_DASHBOARD_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"Wrote {OUT} with {len(seller_rows)} sellers")


if __name__ == "__main__":
    main()
