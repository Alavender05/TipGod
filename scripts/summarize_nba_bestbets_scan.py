import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AU_CONFIG_PATH = ROOT / "config" / "au_sportsbooks.json"
SOURCE_POLICY_PATH = ROOT / "config" / "source_policy.json"
AU_CONFIG = json.loads(AU_CONFIG_PATH.read_text(encoding="utf-8"))
SOURCE_POLICY = json.loads(SOURCE_POLICY_PATH.read_text(encoding="utf-8"))
VALID_BOOK_IDS = {book["id"] for book in AU_CONFIG["sportsbooks"]}
VALID_BOOK_NAMES = {book["name"] for book in AU_CONFIG["sportsbooks"]}
LEGACY_BOOK_NAMES = set(AU_CONFIG["legacy_sportsbook_names"])
LEGACY_MARKET_TERMS = set(AU_CONFIG["legacy_market_terms"])
NBA_TEAM_ALIASES = {
    alias.lower(): team["name"]
    for team in SOURCE_POLICY["official_nba_teams"]
    for alias in [team["name"], *team["aliases"]]
}


def normalize_text(value):
    return " ".join(str(value or "").split())


def sidecar_candidates(scan_path):
    stem = scan_path.stem
    return [
        scan_path.with_name(f"{stem}.run-summary.json"),
        scan_path.with_name(f"{stem}.summary.json"),
    ]


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_scan(scan_path):
    payload = load_json(scan_path)
    if isinstance(payload, dict) and "items" in payload:
        items = payload["items"]
        embedded = payload.get("run_summary") or payload.get("_meta") or {}
    elif isinstance(payload, list):
        items = payload
        embedded = {}
    else:
        raise ValueError(f"Unsupported scan payload shape in {scan_path}")

    sidecar = {}
    for candidate in sidecar_candidates(scan_path):
        if candidate.exists():
            sidecar = load_json(candidate)
            break

    return items, embedded, sidecar


def top_scan_paths(items, limit=5):
    counts = Counter(normalize_text(item.get("scan_path")) or "(root)" for item in items)
    return [{"scan_path": path, "unique_items": count} for path, count in counts.most_common(limit)]


def repeated_matchups(items, limit=10):
    counts = Counter(normalize_text(item.get("matchup")) for item in items if normalize_text(item.get("matchup")))
    return [{"matchup": matchup, "count": count} for matchup, count in counts.most_common(limit)]


def likely_issues(metadata):
    issues = []
    for entry in metadata.get("empty_states_after_interaction", [])[:10]:
        issues.append({
            "type": "empty_state_after_interaction",
            "scan_path": entry.get("scan_path"),
            "content_hash": entry.get("content_hash"),
        })
    for entry in metadata.get("repeated_content_paths", [])[:10]:
        issues.append({
            "type": "repeated_content_hash",
            "first_path": entry.get("first_path"),
            "repeated_path": entry.get("repeated_path"),
            "content_hash": entry.get("hash"),
        })
    for group, details in metadata.get("selector_activation_failures", {}).items():
        issues.append({
            "type": "selector_activation_failure",
            "group": group,
            "count": details.get("count", 0),
            "samples": details.get("samples", []),
        })
    if metadata.get("detail_modal_failures"):
        issues.append({
            "type": "detail_modal_failures",
            "count": metadata["detail_modal_failures"],
        })
    return issues


def is_decimal_odds(value):
    if value in (None, ""):
        return True
    text = normalize_text(value)
    if text.startswith("+") or text.startswith("-"):
        return False
    try:
        return float(text) >= 1.0
    except ValueError:
        return False


def canonical_team_name(value):
    return NBA_TEAM_ALIASES.get(normalize_text(value).lower())


def extract_matchup_teams(matchup):
    text = normalize_text(matchup)
    if not text:
        return []
    for sep in [r"\s+vs\s+", r"\s+@\s+", r"\s+v\s+", r"\s+versus\s+"]:
        parts = re.split(sep, text, flags=re.I)
        if len(parts) == 2:
            return [normalize_text(part) for part in parts if normalize_text(part)]
    return []


def collect_validation(items):
    non_au_sportsbooks = []
    non_decimal_odds = []
    legacy_references = []
    wrong_source_records = []
    non_nba_records = []
    invalid_team_matchups = []

    for item in items:
        sportsbook_id = item.get("sportsbook_id")
        sportsbook_name = item.get("sportsbook_name") or item.get("sportsbook")
        region = item.get("region")
        odds_decimal = item.get("odds_decimal")
        legacy_odds = item.get("odds")
        market_type = normalize_text(item.get("market_type")).lower()
        source_url = item.get("source_url")
        league_id = item.get("league_id")
        sport = item.get("sport")
        matchup = item.get("matchup")

        if sportsbook_id and sportsbook_id not in VALID_BOOK_IDS:
            non_au_sportsbooks.append({
                "sportsbook_id": sportsbook_id,
                "sportsbook_name": sportsbook_name,
                "selection": item.get("selection"),
            })
        if sportsbook_name and sportsbook_name not in VALID_BOOK_NAMES and sportsbook_name not in LEGACY_BOOK_NAMES:
            non_au_sportsbooks.append({
                "sportsbook_id": sportsbook_id,
                "sportsbook_name": sportsbook_name,
                "selection": item.get("selection"),
            })
        if region and region != "AU":
            non_au_sportsbooks.append({
                "sportsbook_id": sportsbook_id,
                "sportsbook_name": sportsbook_name,
                "region": region,
                "selection": item.get("selection"),
            })

        if not is_decimal_odds(odds_decimal):
            non_decimal_odds.append({
                "field": "odds_decimal",
                "value": odds_decimal,
                "selection": item.get("selection"),
            })
        if legacy_odds not in (None, "") and not is_decimal_odds(legacy_odds):
            non_decimal_odds.append({
                "field": "odds",
                "value": legacy_odds,
                "selection": item.get("selection"),
            })

        if sportsbook_name in LEGACY_BOOK_NAMES:
            legacy_references.append({
                "type": "legacy_sportsbook_name",
                "value": sportsbook_name,
                "selection": item.get("selection"),
            })
        if market_type in LEGACY_MARKET_TERMS:
            legacy_references.append({
                "type": "legacy_market_term",
                "value": market_type,
                "selection": item.get("selection"),
            })
        if source_url != SOURCE_POLICY["approved_source_url"]:
            wrong_source_records.append({
                "source_url": source_url,
                "selection": item.get("selection"),
            })
        if league_id != SOURCE_POLICY["league_id"] or sport != SOURCE_POLICY["sport"]:
            non_nba_records.append({
                "league_id": league_id,
                "sport": sport,
                "selection": item.get("selection"),
            })
        teams = extract_matchup_teams(matchup)
        if matchup and (len(teams) != 2 or not all(canonical_team_name(team) for team in teams)):
            invalid_team_matchups.append({
                "matchup": matchup,
                "selection": item.get("selection"),
            })

    return {
        "approved_source_only": len(wrong_source_records) == 0,
        "nba_only_records": len(non_nba_records) == 0,
        "valid_nba_matchups_only": len(invalid_team_matchups) == 0,
        "only_au_sportsbooks": len(non_au_sportsbooks) == 0,
        "decimal_odds_only": len(non_decimal_odds) == 0,
        "no_legacy_references": len(legacy_references) == 0,
        "wrong_source_records": wrong_source_records,
        "non_nba_records": non_nba_records,
        "invalid_team_matchups": invalid_team_matchups,
        "non_au_sportsbooks": non_au_sportsbooks,
        "non_decimal_odds": non_decimal_odds,
        "legacy_references": legacy_references,
    }


def build_summary(scan_path):
    items, embedded, sidecar = load_scan(scan_path)
    metadata = sidecar or embedded
    raw_count = int(metadata.get("raw_extracted_cards") or len(items))
    unique_count = len(items)
    duplicate_count = int(metadata.get("duplicate_items") or max(raw_count - unique_count, 0))
    duplicate_rate = (duplicate_count / raw_count) if raw_count else 0.0

    return {
        "scan_file": scan_path.name,
        "run_summary_file": next((candidate.name for candidate in sidecar_candidates(scan_path) if candidate.exists()), None),
        "scanner": metadata.get("scanner"),
        "runtime": metadata.get("runtime"),
        "started_at": metadata.get("started_at"),
        "finished_at": metadata.get("finished_at"),
        "total_extracted_items": unique_count,
        "raw_extracted_cards": raw_count,
        "duplicate_items": duplicate_count,
        "duplicate_rate": round(duplicate_rate, 4),
        "visited_states": metadata.get("visited_states"),
        "repeated_content_hashes": metadata.get("repeated_content_hashes"),
        "detail_modal_failures": metadata.get("detail_modal_failures"),
        "detected_control_groups": metadata.get("detected_control_groups", []),
        "strongest_scan_paths": top_scan_paths(items),
        "repeated_matchups": repeated_matchups(items),
        "selector_activation_failures": metadata.get("selector_activation_failures", {}),
        "likely_selector_or_traversal_issues": likely_issues(metadata),
        "approved_source_page_valid": metadata.get("approved_source_page_valid"),
        "rejected_wrong_source_records": metadata.get("rejected_wrong_source_records"),
        "rejected_non_nba_records": metadata.get("rejected_non_nba_records"),
        "rejected_ambiguous_records": metadata.get("rejected_ambiguous_records"),
        "validation": collect_validation(items),
    }


def write_summary(scan_path, summary):
    summary_path = scan_path.with_name(f"{scan_path.stem}.summary.json")
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary_path


def print_human_summary(summary, summary_path):
    print(f"summary_file: {summary_path.name}")
    print(f"total_extracted_items: {summary['total_extracted_items']}")
    print(f"raw_extracted_cards: {summary['raw_extracted_cards']}")
    print(f"duplicate_items: {summary['duplicate_items']}")
    print(f"duplicate_rate: {summary['duplicate_rate']:.4f}")
    if summary.get("visited_states") is not None:
        print(f"visited_states: {summary['visited_states']}")
    if summary.get("repeated_content_hashes") is not None:
        print(f"repeated_content_hashes: {summary['repeated_content_hashes']}")
    if summary.get("detail_modal_failures") is not None:
        print(f"detail_modal_failures: {summary['detail_modal_failures']}")
    if summary.get("approved_source_page_valid") is not None:
        print(f"approved_source_page_valid: {summary['approved_source_page_valid']}")
    if summary.get("rejected_wrong_source_records") is not None:
        print(f"rejected_wrong_source_records: {summary['rejected_wrong_source_records']}")
    if summary.get("rejected_non_nba_records") is not None:
        print(f"rejected_non_nba_records: {summary['rejected_non_nba_records']}")
    if summary.get("rejected_ambiguous_records") is not None:
        print(f"rejected_ambiguous_records: {summary['rejected_ambiguous_records']}")
    print(f"approved_source_only: {summary['validation']['approved_source_only']}")
    print(f"nba_only_records: {summary['validation']['nba_only_records']}")
    print(f"valid_nba_matchups_only: {summary['validation']['valid_nba_matchups_only']}")
    print(f"only_au_sportsbooks: {summary['validation']['only_au_sportsbooks']}")
    print(f"decimal_odds_only: {summary['validation']['decimal_odds_only']}")
    print(f"no_legacy_references: {summary['validation']['no_legacy_references']}")
    print("strongest_scan_paths:")
    for entry in summary["strongest_scan_paths"]:
        print(f"- {entry['scan_path']}: {entry['unique_items']}")
    print("repeated_matchups:")
    for entry in summary["repeated_matchups"]:
        print(f"- {entry['matchup']}: {entry['count']}")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 scripts/summarize_nba_bestbets_scan.py <scan-json-path>")

    scan_path = Path(sys.argv[1]).resolve()
    summary = build_summary(scan_path)
    summary_path = write_summary(scan_path, summary)
    print_human_summary(summary, summary_path)


if __name__ == "__main__":
    main()
