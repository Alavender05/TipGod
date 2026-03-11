from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Mapping, Sequence

from yahoo_nba_config import DEFAULT_CONFIG
from yahoo_nba_normalized import find_games, load_raw_yahoo_json


def classify_prop_market(entry: Mapping[str, object], home_team: str | None = None, away_team: str | None = None) -> str:
    players = entry.get("players") or []
    if isinstance(players, list) and len(players) > 0:
        return "player_like"

    market_name = str(entry.get("name") or "")
    description = str(entry.get("description") or "")
    options = entry.get("options") or []
    option_names = " ".join(str(option.get("name") or "") for option in options if isinstance(option, dict))
    haystack = " ".join([market_name, description, option_names]).lower()
    if "player" in haystack:
        return "player_like"
    if home_team and away_team and (home_team.lower() in haystack or away_team.lower() in haystack):
        return "team_special"
    return "non_player_special"


def summarize_prop_entry(entry: Mapping[str, object], event_id: str, game_date: str | None, section: str, home_team: str | None, away_team: str | None) -> dict:
    options = entry.get("options") or []
    option_names = [str(option.get("name") or "") for option in options if isinstance(option, dict)]
    line_keys = sorted(
        {
            str(detail.get("key") or "")
            for option in options
            if isinstance(option, dict)
            for detail in (option.get("optionDetails") or [])
            if isinstance(detail, dict)
        }
    )
    has_american_odds = any(isinstance(option, dict) and option.get("americanOdds") is not None for option in options)
    has_decimal_odds = any(isinstance(option, dict) and option.get("decimalOdds") is not None for option in options)
    has_line_values = any(line_keys)
    players = entry.get("players") if isinstance(entry.get("players"), list) else []
    classification = classify_prop_market(entry, home_team=home_team, away_team=away_team)
    return {
        "event_id": event_id,
        "game_date": game_date,
        "section": section,
        "event_state": entry.get("eventState"),
        "market_id": entry.get("id"),
        "market_type_raw": entry.get("type"),
        "market_name": entry.get("name"),
        "market_description": entry.get("description"),
        "players_count": len(players),
        "players_sample": players[:3],
        "options_count": len(options),
        "option_names": option_names[:6],
        "has_american_odds": has_american_odds,
        "has_decimal_odds": has_decimal_odds,
        "has_line_values": has_line_values,
        "line_keys_seen": line_keys,
        "classification": classification,
        "raw_fragment": {
            "id": entry.get("id"),
            "type": entry.get("type"),
            "name": entry.get("name"),
            "description": entry.get("description"),
            "players": players[:3],
            "options": options[:3],
        },
    }


def discover_from_payload(payload: Mapping[str, object]) -> dict:
    samples = []
    field_report = defaultdict(lambda: {"market_types": Counter(), "line_keys": Counter(), "classifications": Counter()})

    for game in find_games(payload):
        event_id = game.get("gameId")
        game_date = game.get("startDate") or game.get("startTime")
        home_team = game.get("homeTeam", {}).get("displayName")
        away_team = game.get("awayTeam", {}).get("displayName")
        for section in DEFAULT_CONFIG.discovery_prop_sections:
            entries = game.get(section) or []
            if not isinstance(entries, list):
                continue
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                sample = summarize_prop_entry(entry, event_id, game_date, section, home_team, away_team)
                samples.append(sample)
                field_report[section]["market_types"][sample["market_type_raw"] or "unknown"] += 1
                field_report[section]["classifications"][sample["classification"]] += 1
                for key in sample["line_keys_seen"]:
                    field_report[section]["line_keys"][key] += 1

    summary = {
        "markets_found": len(samples),
        "sections": Counter(sample["section"] for sample in samples),
        "classifications": Counter(sample["classification"] for sample in samples),
        "market_types": Counter(sample["market_type_raw"] or "unknown" for sample in samples),
    }
    normalized_field_report = {
        section: {
            "market_types": dict(values["market_types"]),
            "line_keys": dict(values["line_keys"]),
            "classifications": dict(values["classifications"]),
        }
        for section, values in field_report.items()
    }
    return {"summary": summary, "samples": samples, "field_report": normalized_field_report}


def discover_from_files(paths: Sequence[str | Path]) -> dict:
    merged_summary = Counter()
    merged_samples = []
    merged_field_report = defaultdict(lambda: {"market_types": Counter(), "line_keys": Counter(), "classifications": Counter()})

    for path in paths:
        payload = load_raw_yahoo_json(path)
        result = discover_from_payload(payload)
        merged_summary.update(result["summary"]["sections"])
        for key, value in result["summary"]["classifications"].items():
            merged_summary[( "classification", key)] += value
        for key, value in result["summary"]["market_types"].items():
            merged_summary[( "market_type", key)] += value
        merged_samples.extend(result["samples"])
        for section, values in result["field_report"].items():
            merged_field_report[section]["market_types"].update(values["market_types"])
            merged_field_report[section]["line_keys"].update(values["line_keys"])
            merged_field_report[section]["classifications"].update(values["classifications"])

    summary = {
        "markets_found": len(merged_samples),
        "sections": {k: v for k, v in merged_summary.items() if isinstance(k, str)},
        "classifications": {k[1]: v for k, v in merged_summary.items() if isinstance(k, tuple) and k[0] == "classification"},
        "market_types": {k[1]: v for k, v in merged_summary.items() if isinstance(k, tuple) and k[0] == "market_type"},
    }
    field_report = {
        section: {
            "market_types": dict(values["market_types"]),
            "line_keys": dict(values["line_keys"]),
            "classifications": dict(values["classifications"]),
        }
        for section, values in merged_field_report.items()
    }
    return {"summary": summary, "samples": merged_samples, "field_report": field_report}


def write_discovery_artifacts(result: Mapping[str, object], output_dir: Path | str) -> None:
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    (output / "yahoo_nba_prop_discovery.summary.json").write_text(json.dumps(result["summary"], indent=2), encoding="utf-8")
    (output / "yahoo_nba_prop_discovery.samples.json").write_text(json.dumps(result["samples"], indent=2), encoding="utf-8")
    (output / "yahoo_nba_prop_discovery.field_report.json").write_text(json.dumps(result["field_report"], indent=2), encoding="utf-8")
