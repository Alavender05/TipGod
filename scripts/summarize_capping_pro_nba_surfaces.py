import json
import sys
from collections import Counter
from pathlib import Path


def normalize_text(value):
    return " ".join(str(value or "").split())


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def top_titles(items, limit=5):
    counts = Counter(normalize_text(item.get("title")) for item in items if normalize_text(item.get("title")))
    return [{"title": title, "count": count} for title, count in counts.most_common(limit)]


def build_summary(dataset_path):
    dataset = load_json(dataset_path)
    run_summary_path = dataset_path.with_name(f"{dataset_path.stem}.run-summary.json")
    run_summary = load_json(run_summary_path) if run_summary_path.exists() else {}

    surfaces = []
    total_items = 0
    for surface in dataset.get("surfaces", []):
        items = surface.get("items", [])
        total_items += len(items)
        surfaces.append(
            {
                "id": surface.get("id"),
                "label": surface.get("label"),
                "source_url": surface.get("source_url"),
                "item_count": len(items),
                "top_titles": top_titles(items),
                "notes": (surface.get("scan_summary") or {}).get("notes", []),
            }
        )

    return {
        "dataset_file": dataset_path.name,
        "run_summary_file": run_summary_path.name if run_summary_path.exists() else None,
        "generated_at": dataset.get("generated_at"),
        "source_domain": dataset.get("source_domain"),
        "league_id": dataset.get("league_id"),
        "sport": dataset.get("sport"),
        "total_items": total_items,
        "surface_count": len(surfaces),
        "surfaces": surfaces,
        "run_summary": run_summary,
    }


def write_summary(dataset_path, summary):
    summary_path = dataset_path.with_name(f"{dataset_path.stem}.summary.json")
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary_path


def print_summary(summary, summary_path):
    print(f"summary_file: {summary_path.name}")
    print(f"total_items: {summary['total_items']}")
    print(f"surface_count: {summary['surface_count']}")
    for surface in summary["surfaces"]:
      print(f"- {surface['label']}: {surface['item_count']}")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 scripts/summarize_capping_pro_nba_surfaces.py <dataset-path>")

    dataset_path = Path(sys.argv[1]).resolve()
    summary = build_summary(dataset_path)
    summary_path = write_summary(dataset_path, summary)
    print_summary(summary, summary_path)


if __name__ == "__main__":
    main()
