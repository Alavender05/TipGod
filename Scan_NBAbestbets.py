import asyncio
import hashlib
import json
import logging
import re
from datetime import datetime, timedelta
from pathlib import Path

from playwright.async_api import async_playwright

PAGE_URL = "https://capping.pro/nba-bestbets"
OUTPUT_PATH = Path("nba-bestbets-scan-python.json")
MAX_DATES = 3
MAX_TEAMS = 32
MAX_RETRIES = 2

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("nba_bestbets_reader")

S = {
    "root": ".nba-best-bets-container",
    "cards": ".nba-best-bets-grid .nba-best-bet-card",
    "no_results": ".no-results, .nba-best-bets-error",
    "date": "input.date-picker, input[type='date']",
    "tabs": ".category-tabs .category-tab",
    "toggle": ".matchup-toggle input[type='checkbox']",
    "injury_btn": ".injury-filter-button",
    "injury_boxes": ".injury-filter-dropdown input[type='checkbox']",
    "injury_actions": ".injury-filter-dropdown .filter-action-btn",
    "sliders": {
        "points_threshold": "#points-threshold",
        "assists_threshold": "#assists-threshold",
        "rebounds_threshold": "#rebounds-threshold",
    },
    "modal": ".nba-modal-overlay .nba-modal-content, .ios-bottom-sheet.open",
    "modal_close": ".nba-modal-close-btn, .nba-modal-close-x, .ios-bottom-sheet-close, button[aria-label='Close']",
}

LOADING = [
    ".nba-best-bets-loading",
    ".refreshing-overlay",
    ".nba-modal-loading",
    "text=/Loading NBA Best Bets Analysis/i",
    "text=/Updating results/i",
]


def norm(value):
    return " ".join((value or "").split())


def path(parts):
    return " > ".join([part for part in parts if part])


def sha(value):
    return hashlib.sha1(value.encode("utf-8")).hexdigest()


async def visible(locator):
    try:
        return await locator.first.is_visible()
    except Exception:
        return False


async def click_retry(page, locator, label):
    last = None
    for _ in range(MAX_RETRIES + 1):
        try:
            await locator.first.scroll_into_view_if_needed()
            await locator.first.click(timeout=5000)
            return
        except Exception as exc:
            last = exc
            await page.wait_for_timeout(250)
            try:
                await locator.first.click(timeout=5000, force=True)
                return
            except Exception as exc2:
                last = exc2
    raise RuntimeError(f"click failed for {label}: {last}")


async def dismiss_overlays(page):
    for locator in [
        page.get_by_role("button", name=re.compile(r"accept|agree|ok|got it|close", re.I)),
        page.locator("button[aria-label='Close']"),
    ]:
        if await visible(locator):
            try:
                await locator.first.click(timeout=2000)
                await page.wait_for_timeout(300)
            except Exception:
                LOGGER.debug("overlay dismiss failed", exc_info=True)


async def wait_for_content_change(page, previous_hash=None):
    await page.wait_for_load_state("domcontentloaded")
    for selector in LOADING:
        try:
            loading = page.locator(selector)
            if await loading.first.is_visible(timeout=800):
                await loading.first.wait_for(state="hidden", timeout=15000)
        except Exception:
            pass

    last_hash = ""
    stable = 0
    current = await get_content_signature(page)
    for _ in range(30):
        current = await get_content_signature(page)
        if current["hash"] == last_hash or (previous_hash and current["hash"] != previous_hash):
            stable += 1
        else:
            stable = 0
        if stable >= 3:
            break
        last_hash = current["hash"]
        await page.wait_for_timeout(300)
    return current


async def get_content_signature(page):
    payload = await page.evaluate(
        """(sels) => {
          const cards = Array.from(document.querySelectorAll(sels.cards))
            .filter(node => {
              const style = window.getComputedStyle(node);
              const rect = node.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
            })
            .map(node => node.textContent.replace(/\\s+/g, ' ').trim());
          const empty = document.querySelector(sels.noResults);
          return {
            cards,
            noResults: empty ? empty.textContent.replace(/\\s+/g, ' ').trim() : '',
            cardCount: cards.length
          };
        }""",
        {"cards": S["cards"], "noResults": S["no_results"]},
    )
    payload["hash"] = sha(json.dumps(payload, sort_keys=True))
    return payload


async def js_set_select(page, label_text, value):
    await page.evaluate(
        """({label, value}) => {
          const labels = Array.from(document.querySelectorAll('label'));
          const labelNode = labels.find(node => node.textContent.replace(/\\s+/g, ' ').trim().startsWith(label));
          if (!labelNode) throw new Error(`Label not found: ${label}`);
          let select = labelNode.nextElementSibling;
          if (!select || select.tagName !== 'SELECT') {
            select = labelNode.parentElement ? labelNode.parentElement.querySelector('select') : null;
          }
          if (!select) throw new Error(`Select not found: ${label}`);
          select.value = value;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }""",
        {"label": label_text, "value": value},
    )


async def get_select_options(page, label_text):
    values = await page.evaluate(
        """(label) => {
          const labels = Array.from(document.querySelectorAll('label'));
          const labelNode = labels.find(node => node.textContent.replace(/\\s+/g, ' ').trim().startsWith(label));
          if (!labelNode) return [];
          let select = labelNode.nextElementSibling;
          if (!select || select.tagName !== 'SELECT') {
            select = labelNode.parentElement ? labelNode.parentElement.querySelector('select') : null;
          }
          if (!select) return [];
          return Array.from(select.options).map(option => ({
            label: option.textContent.replace(/\\s+/g, ' ').trim(),
            value: option.value
          }));
        }""",
        label_text,
    )
    return values


async def get_control_groups(page):
    groups = []
    if await visible(page.locator(S["date"])):
        current = await page.locator(S["date"]).first.input_value()
        if current:
            base = datetime.fromisoformat(current)
            states = [{"label": current, "value": current}]
            for idx in range(1, MAX_DATES):
                nxt = (base + timedelta(days=idx)).date().isoformat()
                states.append({"label": nxt, "value": nxt})
            groups.append({"name": "date", "kind": "filter", "states": states})

    lookback = await get_select_options(page, "Lookback Period")
    if lookback:
        groups.append({"name": "lookback_period", "kind": "dropdown", "states": lookback[:3]})

    tabs = page.locator(S["tabs"])
    tab_count = await tabs.count()
    if tab_count:
        states = []
        seen = set()
        for i in range(tab_count):
            label = norm(await tabs.nth(i).text_content())
            if label and label not in seen:
                seen.add(label)
                states.append({"label": label, "value": i})
        groups.append({"name": "category", "kind": "tab", "states": states})

    for label, name, limit in [
        ("Position", "position", 6),
        ("Team:", "team", MAX_TEAMS),
        ("Min Confidence", "min_confidence", 6),
    ]:
        options = await get_select_options(page, label)
        if options:
            groups.append({"name": name, "kind": "dropdown", "states": options[:limit]})

    if await visible(page.locator(S["toggle"])):
        groups.append({
            "name": "include_opponent",
            "kind": "filter",
            "states": [
                {"label": "Exclude Opponent", "value": False},
                {"label": "Include Opponent", "value": True},
            ],
            "optional": True,
        })

    if await visible(page.locator(S["injury_btn"])):
        await click_retry(page, page.locator(S["injury_btn"]), "injury filter")
        await page.wait_for_timeout(200)
        injury = await page.evaluate(
            """(selector) => Array.from(document.querySelectorAll(selector)).slice(0, 2).map(input => {
              const label = input.parentElement ? input.parentElement.textContent.replace(/\\s+/g, ' ').trim() : '';
              return { label, value: input.value || label };
            })""",
            S["injury_boxes"],
        )
        await page.keyboard.press("Escape")
        groups.append({
            "name": "injury_filter",
            "kind": "dropdown",
            "optional": True,
            "states": [{"label": "default", "value": "default"}, {"label": "show_all", "value": "show_all"}]
            + [{"label": f"exclude:{item['label']}", "value": item["value"]} for item in injury],
        })

    for name, selector in S["sliders"].items():
        if not await visible(page.locator(selector)):
            continue
        values = await page.locator(selector).first.evaluate(
            """node => {
              const min = Number(node.min || 0);
              const max = Number(node.max || 0);
              const step = Number(node.step || 1);
              const current = Number(node.value || min);
              const mid = min + Math.round((max - min) / (2 * step)) * step;
              return Array.from(new Set([current, min, mid, max])).sort((a, b) => a - b);
            }"""
        )
        groups.append({"name": name, "kind": "range", "selector": selector, "states": [{"label": str(v), "value": v} for v in values]})
    return groups


async def activate_control(page, group, state):
    try:
        if group["name"] == "date":
            locator = page.locator(S["date"]).first
            await locator.fill(str(state["value"]))
            await locator.dispatch_event("input")
            await locator.dispatch_event("change")
            return True
        if group["name"] == "lookback_period":
            await js_set_select(page, "Lookback Period", str(state["value"]))
            return True
        if group["name"] == "category":
            await click_retry(page, page.locator(S["tabs"]).nth(int(state["value"])), state["label"])
            return True
        if group["name"] == "position":
            await js_set_select(page, "Position", str(state["value"]))
            return True
        if group["name"] == "team":
            await js_set_select(page, "Team:", str(state["value"]))
            return True
        if group["name"] == "include_opponent":
            toggle = page.locator(S["toggle"]).first
            if await toggle.is_checked() != bool(state["value"]):
                await toggle.set_checked(bool(state["value"]))
            return True
        if group["name"] == "min_confidence":
            await js_set_select(page, "Min Confidence", str(state["value"]))
            return True
        if group["name"] == "injury_filter":
            if state["value"] == "default":
                return True
            await click_retry(page, page.locator(S["injury_btn"]), "injury filter")
            await page.wait_for_timeout(200)
            if state["value"] == "show_all":
                buttons = page.locator(S["injury_actions"])
                for i in range(await buttons.count()):
                    button = buttons.nth(i)
                    if norm(await button.text_content()) == "Show All":
                        await click_retry(page, button, "show all")
                        break
            else:
                boxes = page.locator(S["injury_boxes"])
                for i in range(await boxes.count()):
                    box = boxes.nth(i)
                    label = await box.evaluate("node => node.parentElement ? node.parentElement.textContent.replace(/\\s+/g, ' ').trim() : ''")
                    value = await box.input_value()
                    if state["value"] not in label and state["value"] != value:
                        continue
                    if await box.is_checked():
                        await box.uncheck()
                    break
            await page.keyboard.press("Escape")
            return True
        if group["kind"] == "range":
            await page.locator(group["selector"]).first.evaluate(
                """(node, value) => {
                  node.value = String(value);
                  node.dispatchEvent(new Event('input', { bubbles: true }));
                  node.dispatchEvent(new Event('change', { bubbles: true }));
                }""",
                state["value"],
            )
            return True
    except Exception:
        LOGGER.warning("activate_control failed for %s=%s", group["name"], state["label"], exc_info=True)
        return False
    return False


def normalize_item(raw, scan_parts, labels):
    recommended = norm(raw.get("recommended_play"))
    player = norm(raw.get("player_name"))
    matchup = norm(raw.get("matchup"))
    tier = norm(raw.get("tier"))
    parts = recommended.split(" ", 1) if recommended else []
    line = parts[0] if len(parts) == 2 and any(ch.isdigit() for ch in parts[0]) else None
    market = parts[1] if line else None
    stat_items = [norm(item) for item in raw.get("stat_items", []) if norm(item)]
    return {
        "page_url": PAGE_URL,
        "scan_path": path(scan_parts),
        "group_labels_used_to_reach_item": {k: v for k, v in labels.items() if v},
        "matchup": matchup or None,
        "market": market,
        "selection": recommended or None,
        "line": line,
        "odds": None,
        "sportsbook": None,
        "model_edge_or_confidence": {
            "confidence_percent": norm(raw.get("confidence")) or None,
            "hit_rate_percent": next((item for item in stat_items if "hit rate" in item.lower()), None),
            "edge_reason": norm(raw.get("edge_reason")) or None,
        },
        "timestamp": labels.get("date"),
        "analyst_source_label": "Algorithm-driven",
        "supporting_text": [norm(raw.get("edge_reason")), *stat_items],
        "raw_html_snippet": raw.get("raw_html_snippet"),
        "extraction_confidence": 0.9 if player and matchup and recommended else 0.7,
        "ambiguities": [item for item in [
            None if market else "market derived from recommendation text or unavailable",
            "odds not visible",
            "sportsbook not visible",
        ] if item],
        "_dedupe_key": f"{player}|{matchup}|{recommended}|{tier}",
    }


async def extract_visible_items(page, scan_parts, labels):
    cards = page.locator(S["cards"])
    items = []
    for i in range(await cards.count()):
        card = cards.nth(i)
        try:
            if not await card.is_visible():
                continue
        except Exception:
            continue
        raw = await card.evaluate(
            """node => {
              const text = selector => {
                const found = node.querySelector(selector);
                return found ? found.textContent.replace(/\\s+/g, ' ').trim() : null;
              };
              return {
                player_name: text('.player-name'),
                matchup: text('.team-matchup'),
                confidence: text('.confidence-value'),
                recommended_play: text('.threshold-value'),
                edge_reason: text('.edge-reason'),
                tier: text('.tier-badge'),
                stat_items: Array.from(node.querySelectorAll('.bet-stats .stat-item')).map(item => item.textContent.replace(/\\s+/g, ' ').trim()),
                raw_html_snippet: node.outerHTML
              };
            }"""
        )
        items.append(normalize_item(raw, scan_parts, labels))
    return items


def deduplicate_items(items):
    seen = set()
    result = []
    for item in items:
        if item["_dedupe_key"] in seen:
            continue
        seen.add(item["_dedupe_key"])
        result.append(item)
    return result


async def extract_modal_details(page):
    if not await visible(page.locator(S["modal"])):
        return None
    return await page.locator(S["modal"]).first.evaluate(
        """node => {
          const text = selector => {
            const found = node.querySelector(selector);
            return found ? found.textContent.replace(/\\s+/g, ' ').trim() : null;
          };
          return {
            detail_confidence: text('.nba-confidence-number'),
            supporting_text: Array.from(node.querySelectorAll('.nba-insight-item, .nba-insight-text')).map(item => item.textContent.replace(/\\s+/g, ' ').trim()),
            raw_html_snippet: node.outerHTML
          };
        }"""
    )


async def close_modal(page):
    if not await visible(page.locator(S["modal"])):
        return
    close = page.locator(S["modal_close"])
    if await visible(close):
        await click_retry(page, close, "modal close")
    else:
        await page.keyboard.press("Escape")
    await page.wait_for_timeout(300)


async def enrich_with_details(page, items, detail_keys):
    cards = page.locator(S["cards"])
    for i in range(await cards.count()):
        card = cards.nth(i)
        try:
            if not await card.is_visible():
                continue
        except Exception:
            continue
        summary_key = await card.evaluate(
            """node => {
              const value = selector => (node.querySelector(selector)?.textContent || '').replace(/\\s+/g, ' ').trim();
              return [value('.player-name'), value('.team-matchup'), value('.threshold-value'), value('.tier-badge')].join('|');
            }"""
        )
        if f"{summary_key}|detail" in detail_keys:
            continue
        try:
            await click_retry(page, card, f"card {i + 1}")
            await page.wait_for_timeout(400)
            details = await extract_modal_details(page)
            if details:
                target = next((item for item in items if item["_dedupe_key"] == summary_key), None)
                if target:
                    target["supporting_text"] = list(dict.fromkeys(target["supporting_text"] + details.get("supporting_text", [])))
                    target["detail_raw_html_snippet"] = details.get("raw_html_snippet")
                    if not target["model_edge_or_confidence"]["confidence_percent"] and details.get("detail_confidence"):
                        target["model_edge_or_confidence"]["confidence_percent"] = details["detail_confidence"]
                detail_keys.add(f"{summary_key}|detail")
        except Exception:
            LOGGER.warning("detail extraction failed", exc_info=True)
        finally:
            await close_modal(page)
            await wait_for_content_change(page)


async def scan_state(page, scan_parts, labels, output, visited_states, global_keys, detail_keys, previous_hash=None):
    signature = await wait_for_content_change(page, previous_hash)
    state_key = f"{path(scan_parts)}|{signature['hash']}"
    if state_key in visited_states:
        return
    visited_states.add(state_key)
    items = deduplicate_items(await extract_visible_items(page, scan_parts, labels))
    if not items and not signature.get("noResults"):
        return
    for item in items:
        if item["_dedupe_key"] in global_keys:
            continue
        global_keys.add(item["_dedupe_key"])
        output.append(item)
    await enrich_with_details(page, items, detail_keys)


async def build_reader():
    output = []
    visited_states = set()
    global_keys = set()
    detail_keys = set()

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 2000})
        try:
            await page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=60000)
            await dismiss_overlays(page)
            await page.locator(S["root"]).wait_for(state="visible", timeout=30000)
            await wait_for_content_change(page)
            groups = {group["name"]: group for group in await get_control_groups(page)}
            LOGGER.info("Detected groups: %s", ", ".join(groups.keys()))

            date_states = groups.get("date", {"states": [{"label": "", "value": None}]})["states"]
            for date_state in date_states:
                if groups.get("date") and date_state["value"]:
                    await activate_control(page, groups["date"], date_state)

                lookback_states = groups.get("lookback_period", {"states": [{"label": "", "value": None}]})["states"]
                for lookback_state in lookback_states:
                    if groups.get("lookback_period") and lookback_state["value"] is not None:
                        await activate_control(page, groups["lookback_period"], lookback_state)

                    category_states = groups.get("category", {"states": [{"label": "", "value": None}]})["states"]
                    for category_state in category_states:
                        if groups.get("category") and category_state["value"] is not None:
                            await activate_control(page, groups["category"], category_state)

                        position_states = groups.get("position", {"states": [{"label": "", "value": None}]})["states"]
                        for position_state in position_states:
                            if groups.get("position") and position_state["value"] is not None:
                                await activate_control(page, groups["position"], position_state)

                            team_states = groups.get("team", {"states": [{"label": "", "value": None}]})["states"]
                            for team_state in team_states:
                                if groups.get("team") and team_state["value"] is not None:
                                    await activate_control(page, groups["team"], team_state)

                                include_states = [{"label": "", "value": None}]
                                if groups.get("include_opponent") and team_state["value"] and str(team_state["value"]).upper() != "ALL" and await visible(page.locator(S["toggle"])):
                                    include_states = groups["include_opponent"]["states"]

                                for include_state in include_states:
                                    if groups.get("include_opponent") and include_state["value"] is not None:
                                        await activate_control(page, groups["include_opponent"], include_state)

                                    confidence_states = groups.get("min_confidence", {"states": [{"label": "", "value": None}]})["states"]
                                    for confidence_state in confidence_states:
                                        if groups.get("min_confidence") and confidence_state["value"] is not None:
                                            await activate_control(page, groups["min_confidence"], confidence_state)

                                        injury_states = groups.get("injury_filter", {"states": [{"label": "default", "value": "default"}]})["states"]
                                        for injury_state in injury_states:
                                            if groups.get("injury_filter") and injury_state["value"] != "default":
                                                await activate_control(page, groups["injury_filter"], injury_state)
                                                await wait_for_content_change(page)

                                            scan_parts = [
                                                date_state["label"] or None,
                                                lookback_state["label"] or None,
                                                category_state["label"] or None,
                                                position_state["label"] or None,
                                                team_state["label"] or None,
                                                include_state["label"] or None,
                                                confidence_state["label"] or None,
                                                None if injury_state["value"] == "default" else injury_state["label"],
                                            ]
                                            labels = {
                                                "date": date_state["label"] or None,
                                                "lookback_period": lookback_state["label"] or None,
                                                "category": category_state["label"] or None,
                                                "position": position_state["label"] or None,
                                                "team": team_state["label"] or None,
                                                "include_opponent": include_state["label"] or None,
                                                "min_confidence": confidence_state["label"] or None,
                                                "injury_filter": None if injury_state["value"] == "default" else injury_state["label"],
                                            }
                                            await scan_state(page, scan_parts, labels, output, visited_states, global_keys, detail_keys)

                                            for slider_name in ["points_threshold", "assists_threshold", "rebounds_threshold"]:
                                                group = groups.get(slider_name)
                                                if not group:
                                                    continue
                                                last_hash = None
                                                repeats = 0
                                                for slider_state in group["states"]:
                                                    await activate_control(page, group, slider_state)
                                                    signature = await wait_for_content_change(page)
                                                    repeats = repeats + 1 if signature["hash"] == last_hash else 0
                                                    last_hash = signature["hash"]
                                                    slider_parts = scan_parts + [f"{slider_name} {slider_state['label']}+"]
                                                    slider_labels = {**labels, slider_name: slider_state["label"]}
                                                    await scan_state(page, slider_parts, slider_labels, output, visited_states, global_keys, detail_keys, signature["hash"])
                                                    if repeats >= 1:
                                                        break

                                            if groups.get("injury_filter") and injury_state["value"] != "default":
                                                await activate_control(page, groups["injury_filter"], {"label": "show_all", "value": "show_all"})
                                                await wait_for_content_change(page)
        finally:
            await browser.close()
    return [{k: v for k, v in item.items() if k != "_dedupe_key"} for item in output]


async def main():
    try:
        records = await build_reader()
        OUTPUT_PATH.write_text(json.dumps(records, indent=2), encoding="utf-8")
        print(json.dumps(records, indent=2))
        LOGGER.info("Wrote %s records to %s", len(records), OUTPUT_PATH)
    except Exception:
        LOGGER.exception("reader failed")
        raise


if __name__ == "__main__":
    asyncio.run(main())
