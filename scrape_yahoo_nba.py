"""Production-style NBA Yahoo odds pipeline."""

from __future__ import annotations

import argparse
import logging
from collections import defaultdict
from pathlib import Path
from typing import Iterable, Mapping, Sequence

from scrape_rules import (
    DERIVED_PLAYER_LINE_MARKETS,
    SUPPORTED_EVENT_STATE,
    SUPPORTED_LEAGUE,
    SUPPORTED_MARKETS,
    SUPPORTED_PERIOD,
    TEAM_NAME_OVERRIDES,
)
from scrape_utils import (
    DatasetBundle,
    ParquetDependencyError,
    coerce_float,
    coerce_int,
    extract_option_detail,
    flatten_market_groups,
    implied_probability,
    load_json,
    normalize_probabilities,
    probability_to_american,
    probability_to_decimal,
    rounded,
    season_for_game_date,
    write_jsonl,
    write_parquet,
)
from scrape_yahoo_nfl import YahooOddsBaseScraper

LOGGER = logging.getLogger(__name__)


class ScrapeYahooNBA(YahooOddsBaseScraper):
    """NBA-only Yahoo odds collector, parser, normalizer, and derivation layer."""

    def parse_raw_snapshot(self, snapshot_path: str | Path) -> dict:
        """Parse a stored raw Yahoo snapshot into a structured intermediate object."""

        path = Path(snapshot_path)
        payload = load_json(path)
        return self.parse_payload(
            payload,
            raw_path=path,
            snapshot_ts=path.stem,
        )

    def parse_payload(
        self,
        payload: Mapping[str, object],
        *,
        raw_path: str | Path | None = None,
        snapshot_ts: str | None = None,
    ) -> dict:
        """Parse one Yahoo payload and keep only supported NBA full-game markets."""

        games = payload.get("data", {}).get("data", {}).get("games", [])  # type: ignore[assignment]
        if not games:
            raise ValueError("Yahoo payload does not contain any games")

        game = games[0]
        league = (game.get("league") or {}).get("shortName")
        if league != SUPPORTED_LEAGUE:
            raise ValueError(f"Unsupported league in payload: {league!r}")

        game_id = str(game.get("gameId"))
        game_date = game.get("startDate")
        snapshot_key = snapshot_ts or "unspecified"
        parsed_markets = self.parse_game_markets(game)
        player_line_stub = self.parse_player_line_markets(game)
        raw_path_value = str(raw_path) if raw_path else None

        return {
            "snapshot_id": f"{game_id}:{snapshot_key}",
            "snapshot_ts": snapshot_key,
            "raw_path": raw_path_value,
            "game": {
                "game_id": game_id,
                "start_date": game_date,
                "start_time": game.get("startTime"),
                "status": game.get("status"),
                "season": season_for_game_date(game_date),
                "away_team": self.normalize_team_name((game.get("awayTeam") or {}).get("displayName")),
                "home_team": self.normalize_team_name((game.get("homeTeam") or {}).get("displayName")),
                "away_team_id": (game.get("awayTeam") or {}).get("teamId"),
                "home_team_id": (game.get("homeTeam") or {}).get("teamId"),
                "favorite_team_id": (game.get("gameOddsSummary") or {}).get("favoriteId"),
                "pregame_odds_display": (game.get("gameOddsSummary") or {}).get("pregameOddsDisplay"),
                "raw_path": raw_path_value,
                "snapshot_ts": snapshot_key,
            },
            "markets": parsed_markets,
            "player_lines": player_line_stub,
        }

    def parse_game_markets(self, game: Mapping[str, object]) -> list[dict]:
        """Parse supported Yahoo game markets from the full game six-pack."""

        parsed_markets: list[dict] = []
        supported_types = set(SUPPORTED_MARKETS)
        for market in game.get("gameLineSixPack", []) or []:
            market_type = market.get("type")
            period = market.get("period")
            event_state = market.get("eventState")
            if (
                market_type not in supported_types
                or period != SUPPORTED_PERIOD
                or event_state != SUPPORTED_EVENT_STATE
            ):
                continue
            parsed_markets.append(
                {
                    "market_id": str(market.get("id")),
                    "market_type": SUPPORTED_MARKETS[market_type]["market_type"],
                    "market_name": market.get("name"),
                    "base_category": market.get("baseCategory"),
                    "period": period,
                    "event_state": event_state,
                    "options": [self.parse_market_option(game, market, option) for option in market.get("options", []) or []],
                }
            )
        return parsed_markets

    def parse_market_option(
        self,
        game: Mapping[str, object],
        market: Mapping[str, object],
        option: Mapping[str, object],
    ) -> dict:
        """Parse one Yahoo market option into a stable intermediate record."""

        away_team = game.get("awayTeam") or {}
        home_team = game.get("homeTeam") or {}
        team_ids = option.get("teamIds") or []
        option_details = option.get("optionDetails") or []
        line_value = (
            extract_option_detail(option_details, "points")
            or extract_option_detail(option_details, "over")
            or extract_option_detail(option_details, "under")
        )
        selection_kind = self.resolve_selection_kind(option, market, team_ids, away_team, home_team)
        team_context = self.resolve_team_context(team_ids, away_team, home_team)
        american_odds = coerce_int(option.get("americanOdds"))
        decimal_odds = coerce_float(option.get("decimalOdds"))

        return {
            "option_id": str(option.get("id")),
            "selection_name": option.get("name"),
            "selection_kind": selection_kind,
            "team": team_context,
            "team_id": team_ids[0] if team_ids else None,
            "line": coerce_float(line_value),
            "american_odds": american_odds,
            "decimal_odds": decimal_odds,
            "implied_probability": implied_probability(american_odds, decimal_odds),
            "stake_percentage": coerce_float(option.get("stakePercentage")),
            "wager_percentage": coerce_float(option.get("wagerPercentage")),
            "is_correct": option.get("isCorrect"),
            "raw_option_name": option.get("displayName") or option.get("shortName") or option.get("name"),
        }

    def parse_player_line_markets(self, game: Mapping[str, object]) -> list[dict]:
        """Placeholder for future player-line support."""

        skipped: list[dict] = []
        for market in (game.get("activePropBets") or []) + (game.get("closedPropBets") or []):
            players = market.get("players") or []
            market_type = market.get("type")
            if players or market_type in DERIVED_PLAYER_LINE_MARKETS:
                skipped.append(
                    {
                        "market_id": str(market.get("id")),
                        "market_type": market_type,
                        "status": "skipped",
                        "reason": "player-line parsing is not implemented yet",
                    }
                )
        if skipped:
            LOGGER.info("Skipped %s unsupported player-line markets", len(skipped))
        return skipped

    def normalize_markets(self, parsed_snapshots: Sequence[Mapping[str, object]]) -> DatasetBundle:
        """Convert parsed Yahoo snapshots into long-form game and market datasets."""

        games: list[dict] = []
        market_options: list[dict] = []
        for parsed in parsed_snapshots:
            game = dict(parsed["game"])
            snapshot_id = parsed["snapshot_id"]
            game["snapshot_id"] = snapshot_id
            games.append(game)

            for market in parsed["markets"]:
                for option in market["options"]:
                    market_options.append(
                        {
                            "snapshot_id": snapshot_id,
                            "snapshot_ts": parsed["snapshot_ts"],
                            "raw_path": parsed["raw_path"],
                            "game_id": game["game_id"],
                            "season": game["season"],
                            "start_date": game["start_date"],
                            "start_time": game["start_time"],
                            "away_team": game["away_team"],
                            "home_team": game["home_team"],
                            "market_id": market["market_id"],
                            "market_type": market["market_type"],
                            "market_name": market["market_name"],
                            "period": market["period"],
                            "event_state": market["event_state"],
                            "selection_id": option["option_id"],
                            "selection_name": option["selection_name"],
                            "selection_kind": option["selection_kind"],
                            "team": option["team"],
                            "team_id": option["team_id"],
                            "line": option["line"],
                            "american_odds": option["american_odds"],
                            "decimal_odds": option["decimal_odds"],
                            "implied_probability": option["implied_probability"],
                            "stake_percentage": option["stake_percentage"],
                            "wager_percentage": option["wager_percentage"],
                            "is_correct": option["is_correct"],
                            "raw_option_name": option["raw_option_name"],
                        }
                    )
        edges = self.calculate_edges(market_options)
        return DatasetBundle(games=games, market_options=market_options, edges=edges)

    def calculate_edges(self, market_options: Sequence[Mapping[str, object]]) -> list[dict]:
        """Compute implied-probability, no-vig, and fair-price metrics for each market row."""

        grouped: dict[tuple[str, str], list[Mapping[str, object]]] = defaultdict(list)
        for row in market_options:
            grouped[(str(row["snapshot_id"]), str(row["market_id"]))].append(row)

        edge_rows: list[dict] = []
        for (snapshot_id, market_id), selections in grouped.items():
            implieds = [coerce_float(row.get("implied_probability")) for row in selections]
            no_vig_values = normalize_probabilities(implieds)
            overround = rounded(sum(value for value in implieds if value is not None))

            for row, no_vig in zip(selections, no_vig_values):
                implied = coerce_float(row.get("implied_probability"))
                fair_decimal = probability_to_decimal(no_vig)
                fair_american = probability_to_american(no_vig)
                offered_decimal = coerce_float(row.get("decimal_odds"))
                edge_probability = rounded(no_vig - implied) if no_vig is not None and implied is not None else None
                edge_decimal = rounded(fair_decimal - offered_decimal, 6) if fair_decimal is not None and offered_decimal is not None else None
                edge_rows.append(
                    {
                        **dict(row),
                        "market_key": f"{snapshot_id}:{market_id}",
                        "overround": overround,
                        "no_vig_probability": no_vig,
                        "fair_decimal_odds": fair_decimal,
                        "fair_american_odds": fair_american,
                        "edge_probability": edge_probability,
                        "edge_decimal_odds": edge_decimal,
                        "is_value_opportunity": bool(edge_probability and edge_probability > 0),
                    }
                )
        return edge_rows

    def load_raw_snapshots(self, root: str | Path | None = None) -> list[Path]:
        """Enumerate saved raw Yahoo snapshots from disk."""

        base = Path(root) if root else self.base_dir / "raw"
        return sorted(base.glob("*/*/*.json"))

    def build_dataset_from_raw(self, raw_paths: Sequence[str | Path] | None = None) -> DatasetBundle:
        """Run parse -> normalize -> derive over stored raw snapshots."""

        parsed_snapshots = [self.parse_raw_snapshot(path) for path in (raw_paths or self.load_raw_snapshots())]
        return self.normalize_markets(parsed_snapshots)

    def write_dataset_bundle(
        self,
        bundle: DatasetBundle,
        *,
        output_root: str | Path | None = None,
        writer=write_parquet,
        file_extension: str | None = None,
    ) -> dict[str, Path]:
        """Write normalized datasets to the standard output paths."""

        root = Path(output_root) if output_root else self.base_dir
        extension = file_extension or (".parquet" if writer is write_parquet else ".jsonl")
        outputs = {
            "games": root / "normalized" / f"games{extension}",
            "market_options": root / "normalized" / f"market_options{extension}",
            "edges": root / "derived" / f"edges{extension}",
        }
        writer(outputs["games"], bundle.games)
        writer(outputs["market_options"], bundle.market_options)
        writer(outputs["edges"], bundle.edges)
        return outputs

    def run_pipeline(
        self,
        *,
        raw_paths: Sequence[str | Path] | None = None,
        output_root: str | Path | None = None,
        writer=write_parquet,
        file_extension: str | None = None,
    ) -> dict[str, Path]:
        """Run parse -> normalize -> derive -> write for stored raw snapshots."""

        bundle = self.build_dataset_from_raw(raw_paths=raw_paths)
        return self.write_dataset_bundle(
            bundle,
            output_root=output_root,
            writer=writer,
            file_extension=file_extension,
        )

    @staticmethod
    def normalize_team_name(value: object) -> str | None:
        """Apply small team-name compatibility fixes."""

        if value is None:
            return None
        text = str(value)
        return TEAM_NAME_OVERRIDES.get(text, text)

    def resolve_team_context(
        self,
        team_ids: Sequence[str],
        away_team: Mapping[str, object],
        home_team: Mapping[str, object],
    ) -> str | None:
        """Resolve the option's team display name when it is team-based."""

        if not team_ids:
            return None
        team_id = team_ids[0]
        if team_id == away_team.get("teamId"):
            return self.normalize_team_name(away_team.get("displayName"))
        if team_id == home_team.get("teamId"):
            return self.normalize_team_name(home_team.get("displayName"))
        return None

    def resolve_selection_kind(
        self,
        option: Mapping[str, object],
        market: Mapping[str, object],
        team_ids: Sequence[str],
        away_team: Mapping[str, object],
        home_team: Mapping[str, object],
    ) -> str:
        """Classify an option as a team side or totals side."""

        option_name = str(option.get("name") or "")
        if market.get("type") == "OVER_UNDER":
            if option_name.lower().startswith("over"):
                return "over"
            return "under"
        if team_ids:
            if team_ids[0] == away_team.get("teamId"):
                return "away"
            if team_ids[0] == home_team.get("teamId"):
                return "home"
        return "team"


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line interface for the NBA Yahoo pipeline."""

    parser = argparse.ArgumentParser(description="NBA Yahoo odds pipeline")
    parser.add_argument("--base-dir", default="nba_scrapes", help="Base directory for raw and derived outputs")
    parser.add_argument("--log-level", default="INFO", help="Python logging level")

    subparsers = parser.add_subparsers(dest="command", required=True)

    fetch_parser = subparsers.add_parser("fetch", help="Fetch raw Yahoo snapshots for a date range")
    fetch_parser.add_argument("--start", required=True, help="Start date in YYYY-MM-DD format")
    fetch_parser.add_argument("--end", required=True, help="End date in YYYY-MM-DD format")

    parse_parser = subparsers.add_parser("parse", help="Parse one raw snapshot and print a summary")
    parse_parser.add_argument("snapshot", help="Path to a raw Yahoo JSON snapshot")

    build_parser_cmd = subparsers.add_parser("build", help="Build normalized datasets from saved raw snapshots")
    build_parser_cmd.add_argument("--raw-root", default=None, help="Optional raw snapshot root")
    build_parser_cmd.add_argument(
        "--format",
        default="parquet",
        choices=("parquet", "jsonl"),
        help="Output format for normalized datasets",
    )

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint."""

    parser = build_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO))
    scraper = ScrapeYahooNBA(base_dir=args.base_dir)

    if args.command == "fetch":
        paths = scraper.fetch_range(start=args.start, end=args.end)
        print(f"Fetched {len(paths)} raw snapshots")
        return 0

    if args.command == "parse":
        parsed = scraper.parse_raw_snapshot(args.snapshot)
        print(
            f"Parsed {parsed['game']['game_id']} with "
            f"{len(parsed['markets'])} supported game markets and "
            f"{len(parsed['player_lines'])} deferred player-line markets"
        )
        return 0

    if args.command == "build":
        writer = write_parquet if args.format == "parquet" else write_jsonl
        raw_paths = scraper.load_raw_snapshots(args.raw_root) if args.raw_root else None
        try:
            outputs = scraper.run_pipeline(
                raw_paths=raw_paths,
                writer=writer,
                file_extension=".parquet" if args.format == "parquet" else ".jsonl",
            )
        except ParquetDependencyError as exc:
            parser.error(str(exc))
        for key, path in outputs.items():
            print(f"{key}: {path}")
        return 0

    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    raise SystemExit(main())
