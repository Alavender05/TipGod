"""Rules and constants for the NBA Yahoo odds pipeline."""

from __future__ import annotations

SUPPORTED_LEAGUE = "NBA"
SUPPORTED_SPORT_KEY = "nba"
SUPPORTED_PERIOD = "FULL_GAME"
SUPPORTED_EVENT_STATE = "PREGAME"

SUPPORTED_MARKETS = {
    "MONEY_LINE": {
        "market_type": "moneyline",
        "selection_kinds": {"team"},
    },
    "SPREAD": {
        "market_type": "spread",
        "selection_kinds": {"team"},
    },
    "OVER_UNDER": {
        "market_type": "total",
        "selection_kinds": {"over", "under"},
    },
}

TEAM_NAME_OVERRIDES = {
    "LA Clippers": "Los Angeles Clippers",
    "LA Lakers": "Los Angeles Lakers",
    "NY Knicks": "New York Knicks",
    "NO Pelicans": "New Orleans Pelicans",
    "GS Warriors": "Golden State Warriors",
}

DERIVED_PLAYER_LINE_MARKETS = {
    "PLAYER_POINTS",
    "PLAYER_REBOUNDS",
    "PLAYER_ASSISTS",
    "PLAYER_THREES",
}

YAHOO_DATE_URL_TEMPLATE = (
    "https://graphite.sports.yahoo.com/v1/query/shangrila/"
    "leagueGameIdsByDate?startRange={date}&endRange={date}&leagues=nba"
)

YAHOO_GAME_URL_TEMPLATE = (
    "https://sports.yahoo.com/site/api/resource/"
    "sports.graphite.gameOdds;dataType=graphite;endpoint=graphite;gameIds={game_id}"
)
