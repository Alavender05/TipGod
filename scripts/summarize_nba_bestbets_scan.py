import json
import sys
from collections import Counter
from pathlib import Path


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
