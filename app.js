const DATA_FILE = {
  label: "Approved source",
  path: "./capping-pro-nba-surfaces.json",
  enrichedPath: "./capping-pro-nba-surfaces-enriched.json",
  summaryPath: "./capping-pro-nba-surfaces.run-summary.json",
};

const AU_CONFIG_PATH = "./config/au_sportsbooks.json";
const SOURCE_POLICY_PATH = "./config/source_policy.json";
const YAHOO_DATA_PATHS = {
  games: "./data/parsed/live_jsonl/normalized/games.jsonl",
  edges: "./data/parsed/live_jsonl/derived/edges.jsonl",
};

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const APPROVED_BOOKMAKERS = ["ladbrokes", "sportsbet", "pointsbet", "bet365"];
const BOOKMAKER_DISPLAY_NAMES = {
  ladbrokes: "Ladbrokes",
  sportsbet: "Sportsbet",
  pointsbet: "PointsBet",
  bet365: "Bet365",
};
const SURFACE_ORDER = ["best-bets", "edges", "props", "parlay", "degen", "exploits"];
const STORAGE_KEY = "tipgod_ui_state";
const SOURCE_TABS = [
  { id: "approved", label: "Approved Source" },
  { id: "yahoo", label: "Yahoo NBA" },
];

const FILTER_SPECS = {
  "best-bets": [
    {
      label: "Market",
      getValue(item) {
        return displayMarket(item.market_type);
      },
    },
    {
      label: "Tier",
      getValue(item) {
        return firstMatchingTag(item.tags, ["Elite", "Strong", "Opportunistic", "All"]) || "Unlabeled";
      },
    },
  ],
  edges: [
    {
      label: "Prop Type",
      getValue(item) {
        return displayMarket(item.market_type);
      },
    },
    {
      label: "Tier",
      getValue(item) {
        return firstMatchingTag(item.tags, ["STRONG BET", "VALUE", "MARGINAL", "SPECULATIVE", "LONGSHOT VALUE", "HIGH RISK"]) || "Unlabeled";
      },
    },
  ],
  props: [
    {
      label: "Stat Type",
      getValue(item) {
        return displayMarket(item.market_type);
      },
    },
    {
      label: "Trend",
      getValue(item) {
        return firstMatchingTag(item.tags, ["High Trend", "Medium Trend", "Low Trend"]) || "Mixed";
      },
    },
  ],
  parlay: [
    {
      label: "Format",
      getValue(item) {
        return item.market_type === "prebuilt-parlay" ? "Prebuilt" : "Single Leg";
      },
    },
    {
      label: "Legs",
      getValue(item) {
        const legs = metricByKey(item, "legs");
        return legs?.value ? legs.value : "Single";
      },
    },
  ],
  degen: [
    {
      label: "Stat Type",
      getValue(item) {
        return displayMarket(item.market_type);
      },
    },
    {
      label: "Pattern Strength",
      getValue(item) {
        return firstMatchingTag(item.tags, ["S", "A", "B", "C"]) || "Pattern";
      },
    },
  ],
  exploits: [
    {
      label: "Exploit Type",
      getValue(item) {
        return displayMarket(item.market_type);
      },
    },
    {
      label: "Team",
      getValue(item) {
        return item.team || "Unknown";
      },
    },
  ],
};

const state = {
  activeDataSource: window.location.hash === "#yahoo" ? "yahoo" : "approved",
  approved: {
    sourceLabel: "",
    runSummary: null,
    auConfig: null,
    sourcePolicy: null,
    surfaces: [],
    activeSurfaceId: "best-bets",
    filters: {
      primary: "All",
      secondary: "All",
    },
    showTable: false,
    loadError: null,
  },
  yahoo: {
    games: [],
    edges: [],
    rows: [],
    filters: {
      marketType: "All",
      matchup: "All",
      selection: "All",
      threshold: "All",
    },
    showTable: false,
    loadError: null,
    lastRefreshAt: null,
    refreshTimerId: null,
    statusMode: "idle",
    hasLoaded: false,
  },
};

const nodes = {
  heroShell: document.getElementById("hero-shell"),
  heroEyebrow: document.getElementById("hero-eyebrow"),
  heroTitle: document.getElementById("hero-title"),
  heroDescription: document.getElementById("hero-description"),
  sourceChip: document.getElementById("data-source-chip"),
  sourceAttribution: document.getElementById("source-attribution"),
  runStatusChip: document.getElementById("run-status-chip"),
  summaryStrip: document.getElementById("summary-strip"),
  emptyState: document.getElementById("approved-no-data"),
  emptyStateTitle: document.getElementById("empty-state-title"),
  emptySourceAttribution: document.getElementById("empty-source-attribution"),
  sourceTabs: document.getElementById("source-tabs"),
  surfaceRow: document.querySelector(".surface-row"),
  surfaceFilters: document.getElementById("surface-filters"),
  controlRow: document.querySelector(".control-row"),
  primaryFilters: document.getElementById("primary-filters"),
  secondaryFilters: document.getElementById("secondary-filters"),
  tertiaryFilters: document.getElementById("tertiary-filters"),
  quaternaryFilters: document.getElementById("quaternary-filters"),
  primaryFilterLabel: document.getElementById("primary-filter-label"),
  secondaryFilterLabel: document.getElementById("secondary-filter-label"),
  tertiaryFilterLabel: document.getElementById("tertiary-filter-label"),
  quaternaryFilterLabel: document.getElementById("quaternary-filter-label"),
  mainGrid: document.querySelector(".main-grid"),
  featuredPanelEyebrow: document.querySelector(".featured-panel .eyebrow"),
  featuredPanelTitle: document.querySelector(".featured-panel h2"),
  stackPanelEyebrow: document.querySelector(".pick-stack").closest(".panel").querySelector(".eyebrow"),
  stackPanelTitle: document.querySelector(".pick-stack").closest(".panel").querySelector("h2"),
  valuePanelEyebrow: document.getElementById("value-chart").closest(".panel").querySelector(".eyebrow"),
  valuePanelTitle: document.getElementById("value-chart").closest(".panel").querySelector("h2"),
  distributionPanelEyebrow: document.getElementById("distribution-chart").closest(".panel").querySelector(".eyebrow"),
  distributionPanelTitle: document.getElementById("distribution-chart").closest(".panel").querySelector("h2"),
  heatmapPanelEyebrow: document.getElementById("heatmap").closest(".panel").querySelector(".eyebrow"),
  heatmapPanelTitle: document.getElementById("heatmap").closest(".panel").querySelector("h2"),
  tablePanelEyebrow: document.getElementById("table-panel").querySelector(".eyebrow"),
  tablePanelTitle: document.getElementById("table-panel").querySelector("h2"),
  tableHeadRow: document.querySelector("#table-panel thead tr"),
  featuredPick: document.getElementById("featured-pick"),
  pickStack: document.getElementById("pick-stack"),
  valueChart: document.getElementById("value-chart"),
  distributionChart: document.getElementById("distribution-chart"),
  heatmap: document.getElementById("heatmap"),
  tablePanel: document.getElementById("table-panel"),
  tableBody: document.getElementById("pick-table-body"),
  listToggle: document.getElementById("list-toggle"),
};

function saveUIState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      approved: {
        activeSurfaceId: state.approved.activeSurfaceId,
        filters: state.approved.filters,
        showTable: state.approved.showTable,
      },
      yahoo: {
        filters: state.yahoo.filters,
        showTable: state.yahoo.showTable,
      },
    }));
  } catch {
    // localStorage unavailable; ignore persistence.
  }
}

function loadUIState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function loadJson(filePath) {
  const response = await fetch(filePath);
  if (!response.ok) {
    throw new Error(`Failed to load ${filePath}`);
  }
  return response.json();
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseNumber(value) {
  const match = normalizeText(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function compactTime(value, timeZone = "America/New_York") {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function titleize(value) {
  return normalizeText(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function displayMarket(value) {
  return value ? titleize(value) : "Unspecified";
}

function firstMatchingTag(tags, options) {
  return options.find((option) => (tags || []).includes(option)) || null;
}

function formatPercent(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "N/A";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function formatNumber(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "N/A";
  return Number(value).toFixed(digits);
}

function formatAmerican(value) {
  if (value == null || Number.isNaN(Number(value))) return "N/A";
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number}`;
}

function rawPathLabel(path) {
  const parts = normalizeText(path).split("/");
  return parts.slice(-2).join("/");
}

function renderChips(container, values, activeValue, onClick, labelFn = (value) => value) {
  container.innerHTML = "";
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${value === activeValue ? " active" : ""}`;
    button.textContent = labelFn(value);
    button.addEventListener("click", () => onClick(value));
    container.appendChild(button);
  });
}

function clearDataViews() {
  nodes.featuredPick.innerHTML = "";
  nodes.pickStack.innerHTML = "";
  nodes.valueChart.innerHTML = "";
  nodes.distributionChart.innerHTML = "";
  nodes.heatmap.innerHTML = "";
  nodes.tableBody.innerHTML = "";
}

function setTableHeaders(sourceId) {
  if (sourceId === "yahoo") {
    nodes.tableHeadRow.innerHTML = `
      <th>Matchup</th>
      <th>Market</th>
      <th>Selection</th>
      <th>Line</th>
      <th>Odds</th>
      <th>Fair</th>
      <th>Edge</th>
      <th>Overround</th>
      <th>Snapshot</th>
    `;
    nodes.tablePanelEyebrow.textContent = "All Rows";
    nodes.tablePanelTitle.textContent = "Compact Yahoo edge table";
    nodes.featuredPanelEyebrow.textContent = "Featured Edge";
    nodes.featuredPanelTitle.textContent = "Best current Yahoo board signal";
    nodes.stackPanelEyebrow.textContent = "Ranked Board";
    nodes.stackPanelTitle.textContent = "Closest to value, sorted live";
    nodes.valuePanelEyebrow.textContent = "Edge Ladder";
    nodes.valuePanelTitle.textContent = "Top signals by edge probability";
    nodes.distributionPanelEyebrow.textContent = "Market Mix";
    nodes.distributionPanelTitle.textContent = "Distribution by market type";
    nodes.heatmapPanelEyebrow.textContent = "Slate Coverage";
    nodes.heatmapPanelTitle.textContent = "Matchup x market heatmap";
    return;
  }

  nodes.tableHeadRow.innerHTML = `
    <th>Context</th>
    <th>Selection</th>
    <th>Surface</th>
    <th>Primary Metric</th>
    <th>Secondary Metric</th>
    <th>Updated</th>
  `;
  nodes.tablePanelEyebrow.textContent = "All Picks";
  nodes.tablePanelTitle.textContent = "Compact comparison table";
  nodes.featuredPanelEyebrow.textContent = "Featured Pick";
  nodes.featuredPanelTitle.textContent = "Best play at a glance";
  nodes.stackPanelEyebrow.textContent = "Top Picks";
  nodes.stackPanelTitle.textContent = "Ranked card stack";
  nodes.valuePanelEyebrow.textContent = "Value View";
  nodes.valuePanelTitle.textContent = "Top edges";
  nodes.distributionPanelEyebrow.textContent = "Slate Shape";
  nodes.distributionPanelTitle.textContent = "Bet type distribution";
  nodes.heatmapPanelEyebrow.textContent = "Game Coverage";
  nodes.heatmapPanelTitle.textContent = "Matchup x bet type heatmap";
}

function renderSourceTabs() {
  renderChips(
    nodes.sourceTabs,
    SOURCE_TABS.map((tab) => tab.id),
    state.activeDataSource,
    (value) => switchDataSource(value),
    (value) => SOURCE_TABS.find((tab) => tab.id === value)?.label || value
  );
}

function renderFilterBlock(labelNode, chipNode, label, hidden) {
  labelNode.hidden = hidden || !label;
  labelNode.textContent = hidden ? "" : label;
  chipNode.innerHTML = hidden ? "" : chipNode.innerHTML;
  chipNode.parentElement.hidden = hidden;
}

function setHeroContent(config) {
  nodes.heroShell.classList.toggle("yahoo-hero", config.isYahoo);
  nodes.heroEyebrow.textContent = config.eyebrow;
  nodes.heroTitle.textContent = config.title;
  nodes.heroDescription.textContent = config.description;
  nodes.sourceAttribution.textContent = config.attribution;
}

function setEmptyState(title, attribution) {
  nodes.emptyState.hidden = false;
  nodes.emptyStateTitle.textContent = title;
  nodes.emptySourceAttribution.textContent = attribution;
}

function hideEmptyState() {
  nodes.emptyState.hidden = true;
}

function getApprovedSurfaceMeta(surfaceId) {
  return (state.approved.sourcePolicy?.approved_surfaces || []).find((surface) => surface.id === surfaceId) || null;
}

function validateItem(item, surfaceMeta) {
  if (!item || item.league_id !== state.approved.sourcePolicy.league_id || item.sport !== state.approved.sourcePolicy.sport) {
    return false;
  }
  if (!surfaceMeta || item.surface !== surfaceMeta.id) {
    return false;
  }
  return surfaceMeta.allowed_paths.some((allowedPath) => String(item.source_url || "").endsWith(allowedPath));
}

function hydrateSurfaces(payload) {
  const incoming = new Map((payload.surfaces || []).map((surface) => [surface.id, surface]));

  return SURFACE_ORDER.map((surfaceId) => {
    const meta = getApprovedSurfaceMeta(surfaceId);
    const existing = incoming.get(surfaceId) || {};
    const items = Array.isArray(existing.items) ? existing.items.filter((item) => validateItem(item, meta)) : [];
    return {
      id: surfaceId,
      label: meta?.label || titleize(surfaceId),
      source_url: existing.source_url || new URL(meta?.allowed_paths?.[0] || "/", state.approved.sourcePolicy.approved_root_url).href,
      scan_summary: existing.scan_summary || null,
      items: items.map((item, index) => ({
        ...item,
        rank_seed: index + 1,
      })),
    };
  });
}

function getActiveSurface() {
  return state.approved.surfaces.find((surface) => surface.id === state.approved.activeSurfaceId) || state.approved.surfaces[0] || null;
}

function metricByKey(item, key) {
  return (item.metrics || []).find((metric) => metric.key === key) || null;
}

function primaryMetric(item) {
  return (item.metrics || []).find((metric) => metric.value_numeric != null) || item.metrics?.[0] || null;
}

function secondaryMetric(item) {
  const numeric = (item.metrics || []).filter((metric) => metric.value_numeric != null);
  return numeric[1] || item.metrics?.[1] || null;
}

function metricDisplay(metric) {
  if (!metric) return "N/A";
  return metric.value || (metric.value_numeric != null ? String(metric.value_numeric) : "N/A");
}

function approvedSurfaceFilters(surfaceId) {
  return FILTER_SPECS[surfaceId] || [];
}

function approvedItemMatchesFilters(item) {
  const [primarySpec, secondarySpec] = approvedSurfaceFilters(state.approved.activeSurfaceId);
  const primaryValue = primarySpec ? primarySpec.getValue(item) : "All";
  const secondaryValue = secondarySpec ? secondarySpec.getValue(item) : "All";
  const primaryOk = state.approved.filters.primary === "All" || primaryValue === state.approved.filters.primary;
  const secondaryOk = state.approved.filters.secondary === "All" || secondaryValue === state.approved.filters.secondary;
  return primaryOk && secondaryOk;
}

function approvedMetricRatio(item, items) {
  const metric = primaryMetric(item);
  if (!metric?.value_numeric) return 0.35;
  const max = Math.max(...items.map((entry) => Math.abs(primaryMetric(entry)?.value_numeric || 0)), 1);
  return Math.max(0.12, Math.min(Math.abs(metric.value_numeric) / max, 1));
}

function toneColor(ratio) {
  if (ratio >= 0.85) return "var(--confidence-elite)";
  if (ratio >= 0.65) return "var(--confidence-high)";
  if (ratio >= 0.4) return "var(--confidence-medium)";
  return "var(--confidence-low)";
}

function approvedMeterMarkup(item, items) {
  const metric = primaryMetric(item);
  const ratio = approvedMetricRatio(item, items);
  return `
    <div class="confidence-wrap">
      <div class="confidence-row">
        <span>${metric?.label || "Primary metric"}</span>
        <strong>${metricDisplay(metric)}</strong>
      </div>
      <div class="meter">
        <div class="meter-fill" style="width: ${Math.round(ratio * 100)}%; background: ${toneColor(ratio)};"></div>
      </div>
    </div>
  `;
}

function itemTopline(item, surfaceLabel) {
  const chips = [
    `<span class="type-chip">${surfaceLabel}</span>`,
    `<span class="book-chip">${displayMarket(item.market_type)}</span>`,
  ];
  if (item.team) {
    chips.push(`<span class="odds-chip">${item.team}</span>`);
  } else if (item.matchup) {
    chips.push(`<span class="odds-chip">${item.matchup}</span>`);
  }
  return chips.join("");
}

function renderLegacyMoneylineComparison(item) {
  const enrichment = item.moneyline_enrichment;
  if (!enrichment) return "";

  const availableQuotes = APPROVED_BOOKMAKERS.filter((slug) => enrichment.quotes[slug]?.is_available);
  const coverageCount = availableQuotes.length;
  if (coverageCount === 0) {
    return `
      <div class="moneyline-no-data">
        <span>No moneyline data available</span>
      </div>
    `;
  }

  const best = enrichment.best_available;
  const homeLabel = enrichment.home_team ? enrichment.home_team.split(" ").pop() : "Home";
  const awayLabel = enrichment.away_team ? enrichment.away_team.split(" ").pop() : "Away";
  const bestCellMarkup = (odds, bookmaker) => {
    if (odds == null || !bookmaker) {
      return `<span class="best-available-empty">—</span>`;
    }
    const displayName = BOOKMAKER_DISPLAY_NAMES[bookmaker] || bookmaker;
    return `
      <span class="best-available-odds">${odds.toFixed(2)}</span>
      <span class="best-available-book">${displayName}</span>
    `;
  };

  const bestAvailableRow = `
    <div class="moneyline-row best-available-row" data-available="true">
      <span class="ml-book-name best-available-label">Best Available</span>
      <span class="ml-odds best-available-cell">
        ${bestCellMarkup(best.home_best_odds, best.home_best_bookmaker)}
      </span>
      <span class="ml-odds best-available-cell">
        ${bestCellMarkup(best.away_best_odds, best.away_best_bookmaker)}
      </span>
    </div>
  `;

  const rows = APPROVED_BOOKMAKERS.map((slug) => {
    const quote = enrichment.quotes[slug];
    const available = quote?.is_available;
    const displayName = BOOKMAKER_DISPLAY_NAMES[slug] || slug;

    if (!available) {
      return `
        <div class="moneyline-row" data-available="false">
          <span class="ml-book-name">${displayName}</span>
          <span class="ml-unavailable">—</span>
        </div>
      `;
    }

    const homeOdds = quote.home_odds != null ? quote.home_odds.toFixed(2) : "—";
    const awayOdds = quote.away_odds != null ? quote.away_odds.toFixed(2) : "—";
    const homeBest = best.home_best_bookmaker === slug ? " best-odds" : "";
    const awayBest = best.away_best_bookmaker === slug ? " best-odds" : "";

    return `
      <div class="moneyline-row" data-available="true">
        <span class="ml-book-name">${displayName}</span>
        <span class="ml-odds ml-home-odds${homeBest}">${homeOdds}</span>
        <span class="ml-odds ml-away-odds${awayBest}">${awayOdds}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="moneyline-comparison">
      <div class="moneyline-header">
        <span class="moneyline-label">Moneyline</span>
        <span class="moneyline-coverage">${coverageCount} of 4 books</span>
      </div>
      <div class="moneyline-matchup-labels">
        <span class="ml-team ml-home">${homeLabel}</span>
        <span class="ml-team ml-away">${awayLabel}</span>
      </div>
      <div class="moneyline-rows">${bestAvailableRow}${rows}</div>
    </div>
  `;
}

function bookmakerEnrichment(item) {
  return item.bookmaker_enrichment || null;
}

function formatBookmakerOdds(value) {
  return value != null ? value.toFixed(2) : "—";
}

function formatBestAvailable(best) {
  if (!best || best.odds == null || !best.bookmaker) return "—";
  const name = BOOKMAKER_DISPLAY_NAMES[best.bookmaker] || best.bookmaker;
  return `${best.odds.toFixed(2)} · ${name}`;
}

function renderGameMarketsPanel(gameBundle) {
  if (!gameBundle?.markets?.length) return "";

  const rows = gameBundle.markets
    .filter((market) => market.market_type === "moneyline" || market.best_available?.odds != null)
    .map((market) => `
      <div class="game-market-row">
        <span class="game-market-name">${displayMarket(market.market_type)}</span>
        <span class="game-market-best">${formatBestAvailable(market.best_available)}</span>
      </div>
    `)
    .join("");

  if (!rows) return "";

  return `
    <details class="game-markets-panel">
      <summary>Game Markets</summary>
      <div class="game-markets-list">${rows}</div>
    </details>
  `;
}

function renderBookmakerComparison(item) {
  const enrichment = bookmakerEnrichment(item);
  if (!enrichment) {
    return item.moneyline_enrichment ? renderLegacyMoneylineComparison(item) : "";
  }

  const matchedMarket = enrichment.matched_market;
  const gameBundle = enrichment.game_bundle;

  if (!matchedMarket) {
    if (gameBundle?.markets?.length) {
      return `
        <div class="bookmaker-comparison">
          <div class="bookmaker-header">
            <span class="bookmaker-label">Bookmaker Markets</span>
            <span class="bookmaker-coverage">${gameBundle.markets.length} game selections</span>
          </div>
          <div class="bookmaker-context">${gameBundle.matchup}</div>
          ${renderGameMarketsPanel(gameBundle)}
        </div>
      `;
    }
    return "";
  }

  const availableQuotes = APPROVED_BOOKMAKERS.filter(
    (slug) => matchedMarket.quotes[slug]?.is_available && matchedMarket.quotes[slug]?.odds != null
  );
  const coverageCount = availableQuotes.length;

  const rows = APPROVED_BOOKMAKERS.map((slug) => {
    const quote = matchedMarket.quotes[slug];
    const available = quote?.is_available && quote?.odds != null;
    const displayName = BOOKMAKER_DISPLAY_NAMES[slug] || slug;
    const isBest = matchedMarket.best_available?.bookmaker === slug ? " best-odds" : "";

    return `
      <div class="bookmaker-row" data-available="${available ? "true" : "false"}">
        <span class="bk-name">${displayName}</span>
        <span class="bk-odds${isBest}">${available ? formatBookmakerOdds(quote.odds) : "—"}</span>
        <span class="bk-note">${quote?.market_name || "Unavailable"}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="bookmaker-comparison">
      <div class="bookmaker-header">
        <span class="bookmaker-label">${displayMarket(matchedMarket.market_type)}</span>
        <span class="bookmaker-coverage">${coverageCount} of 4 books</span>
      </div>
      <div class="bookmaker-context">${matchedMarket.selection_label || "Selection"}${enrichment.lookup.matchup ? ` · ${enrichment.lookup.matchup}` : ""}</div>
      <div class="best-selection-row">
        <span class="best-selection-label">Best Available</span>
        <span class="best-selection-value">${formatBestAvailable(matchedMarket.best_available)}</span>
      </div>
      <div class="bookmaker-rows">${rows}</div>
      ${renderGameMarketsPanel(gameBundle)}
    </div>
  `;
}

function approvedPickCardMarkup(item, items, surfaceLabel, featured = false) {
  const secondary = secondaryMetric(item);
  const metaPills = [
    `<span class="metric-pill">${primaryMetric(item)?.label || "Metric"}: ${metricDisplay(primaryMetric(item))}</span>`,
  ];
  if (secondary) {
    metaPills.push(`<span class="metric-pill positive">${secondary.label}: ${metricDisplay(secondary)}</span>`);
  }
  if (item.matchup || item.subtitle) {
    metaPills.push(`<span class="metric-pill">${item.matchup || item.subtitle}</span>`);
  }

  return `
    <article class="${featured ? "featured-card" : "pick-card"}">
      ${featured ? "" : `<div class="pick-rank">${item.rank}</div>`}
      <div class="pick-topline">${itemTopline(item, surfaceLabel)}</div>
      <div class="matchup">${item.title || "Untitled item"}</div>
      <div class="pick-text">${item.selection || item.subtitle || "Selection unavailable"}</div>
      ${approvedMeterMarkup(item, items)}
      <div class="pick-meta-grid">${metaPills.join("")}</div>
      ${renderBookmakerComparison(item)}
      <p class="subtext">${item.reason || "Approved-source NBA item."}</p>
      <div class="edge-strip" style="width: ${Math.round(approvedMetricRatio(item, items) * 100)}%; background: ${toneColor(approvedMetricRatio(item, items))};"></div>
    </article>
  `;
}

function approvedSortItems(items) {
  return [...items]
    .sort((a, b) => {
      const aPrimary = primaryMetric(a)?.value_numeric ?? -Infinity;
      const bPrimary = primaryMetric(b)?.value_numeric ?? -Infinity;
      if (bPrimary !== aPrimary) return bPrimary - aPrimary;
      const aSecondary = secondaryMetric(a)?.value_numeric ?? -Infinity;
      const bSecondary = secondaryMetric(b)?.value_numeric ?? -Infinity;
      if (bSecondary !== aSecondary) return bSecondary - aSecondary;
      return normalizeText(a.title).localeCompare(normalizeText(b.title));
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function approvedFilteredItems() {
  const surface = getActiveSurface();
  if (!surface) return [];
  return approvedSortItems(surface.items.filter(approvedItemMatchesFilters));
}

function renderApprovedSurfaceTabs() {
  renderChips(
    nodes.surfaceFilters,
    state.approved.surfaces.map((surface) => surface.id),
    state.approved.activeSurfaceId,
    (value) => {
      state.approved.activeSurfaceId = value;
      state.approved.filters.primary = "All";
      state.approved.filters.secondary = "All";
      saveUIState();
      render();
    },
    (value) => state.approved.surfaces.find((surface) => surface.id === value)?.label || value
  );
}

function renderApprovedFilters() {
  const specs = approvedSurfaceFilters(state.approved.activeSurfaceId);
  const surface = getActiveSurface();
  const items = surface?.items || [];
  const [primarySpec, secondarySpec] = specs;
  const primaryValues = primarySpec ? ["All", ...new Set(items.map(primarySpec.getValue).filter(Boolean))] : ["All"];
  const secondaryValues = secondarySpec ? ["All", ...new Set(items.map(secondarySpec.getValue).filter(Boolean))] : ["All"];

  renderFilterBlock(nodes.primaryFilterLabel, nodes.primaryFilters, primarySpec?.label || "", !primarySpec);
  renderFilterBlock(nodes.secondaryFilterLabel, nodes.secondaryFilters, secondarySpec?.label || "", !secondarySpec);
  renderFilterBlock(nodes.tertiaryFilterLabel, nodes.tertiaryFilters, "", true);
  renderFilterBlock(nodes.quaternaryFilterLabel, nodes.quaternaryFilters, "", true);

  renderChips(nodes.primaryFilters, primaryValues, state.approved.filters.primary, (value) => {
    state.approved.filters.primary = value;
    saveUIState();
    render();
  });

  renderChips(nodes.secondaryFilters, secondaryValues, state.approved.filters.secondary, (value) => {
    state.approved.filters.secondary = value;
    saveUIState();
    render();
  });
}

function renderApprovedSummary(items) {
  const strongest = items[0];
  const topMetric = primaryMetric(strongest);
  const secondMetric = secondaryMetric(strongest);
  const surface = getActiveSurface();
  const cards = [
    {
      label: "Live items",
      value: String(items.length),
      note: surface?.label || "No active surface",
    },
    {
      label: topMetric?.label || "Top score",
      value: metricDisplay(topMetric),
      note: strongest?.title || "No data",
    },
    {
      label: secondMetric?.label || "Updated",
      value: secondMetric ? metricDisplay(secondMetric) : compactTime(surface?.scan_summary?.finished_at),
      note: strongest?.selection || "No secondary metric",
    },
    {
      label: "Source",
      value: "Capping.Pro",
      note: surface?.label || "NBA only",
    },
  ];

  nodes.summaryStrip.innerHTML = cards.map((card) => `
    <article class="summary-card">
      <span class="summary-label">${card.label}</span>
      <span class="summary-value">${card.value}</span>
      <span class="summary-note">${card.note}</span>
    </article>
  `).join("");
}

function renderApprovedFeatured(items) {
  const surfaceLabel = getActiveSurface()?.label || "Surface";
  nodes.featuredPick.innerHTML = items.length ? approvedPickCardMarkup(items[0], items, surfaceLabel, true) : "";
}

function renderApprovedPickStack(items) {
  const surfaceLabel = getActiveSurface()?.label || "Surface";
  nodes.pickStack.innerHTML = items.slice(0, 6).map((item) => approvedPickCardMarkup(item, items, surfaceLabel)).join("");
}

function renderApprovedValueChart(items) {
  const top = items.slice(0, 6);
  const max = Math.max(...top.map((item) => Math.abs(primaryMetric(item)?.value_numeric || 0)), 1);
  nodes.valueChart.innerHTML = top.map((item) => `
    <div class="value-row">
      <div class="value-label">
        <div class="value-title">${item.title || "Untitled item"}</div>
        <div class="value-subtitle">${item.selection || item.subtitle || item.matchup || "No context"}</div>
      </div>
      <div class="value-bar">
        <div class="value-fill" style="width: ${Math.max(8, (Math.abs(primaryMetric(item)?.value_numeric || 0) / max) * 100)}%; background: ${toneColor(approvedMetricRatio(item, top))};"></div>
      </div>
      <div class="value-number">${metricDisplay(primaryMetric(item))}</div>
    </div>
  `).join("");
}

function renderApprovedDistribution(items) {
  const counts = [...new Set(items.map((item) => displayMarket(item.market_type)))].map((label) => ({
    label,
    count: items.filter((item) => displayMarket(item.market_type) === label).length,
  }));
  const max = Math.max(...counts.map((entry) => entry.count), 1);
  nodes.distributionChart.innerHTML = counts.map((entry) => `
    <div class="dist-row">
      <div class="dist-label-line">
        <span>${entry.label}</span>
        <strong>${entry.count}</strong>
      </div>
      <div class="dist-bar">
        <div class="dist-fill" style="width: ${(entry.count / max) * 100}%;"></div>
      </div>
    </div>
  `).join("");
}

function renderApprovedHeatmap(items) {
  const rowKeys = [...new Set(items.map((item) => item.matchup || item.team || item.title).filter(Boolean))].slice(0, 6);
  const columns = [...new Set(items.map((item) => displayMarket(item.market_type)).filter(Boolean))].slice(0, 4);
  if (!rowKeys.length || !columns.length) {
    nodes.heatmap.innerHTML = "<div class=\"muted\">Not enough grouped matchup context for this surface.</div>";
    return;
  }

  const maxCount = Math.max(
    1,
    ...rowKeys.flatMap((rowKey) =>
      columns.map((column) =>
        items.filter((item) => (item.matchup || item.team || item.title) === rowKey && displayMarket(item.market_type) === column).length
      )
    )
  );

  const cells = ["<div class=\"heatmap-grid\">", "<div class=\"heatmap-cell label\">Context</div>"];
  columns.forEach((column) => cells.push(`<div class="heatmap-cell label">${column}</div>`));
  rowKeys.forEach((rowKey) => {
    cells.push(`<div class="heatmap-cell label">${rowKey}</div>`);
    columns.forEach((column) => {
      const count = items.filter((item) => (item.matchup || item.team || item.title) === rowKey && displayMarket(item.market_type) === column).length;
      const intensity = count / maxCount;
      const background = count ? `rgba(20, 184, 166, ${0.18 + intensity * 0.55})` : "rgba(226, 232, 240, 0.45)";
      cells.push(`<div class="heatmap-cell" style="background: ${background};">${count || "—"}</div>`);
    });
  });
  cells.push("</div>");
  nodes.heatmap.innerHTML = cells.join("");
}

function renderApprovedTable(items) {
  const surfaceLabel = getActiveSurface()?.label || "Surface";
  nodes.tableBody.innerHTML = items.map((item) => `
    <tr>
      <td>${item.matchup || item.subtitle || item.team || "Context TBD"}</td>
      <td>${item.selection || "Unavailable"}</td>
      <td><span class="table-pill">${surfaceLabel}</span></td>
      <td><span class="table-pill">${primaryMetric(item)?.label || "Metric"}: ${metricDisplay(primaryMetric(item))}</span></td>
      <td><span class="table-pill">${secondaryMetric(item)?.label || "Metric"}: ${metricDisplay(secondaryMetric(item))}</span></td>
      <td>${compactTime(item.updated_at || getActiveSurface()?.scan_summary?.finished_at)}</td>
    </tr>
  `).join("");
}

function renderApprovedNoData() {
  const surface = getActiveSurface();
  nodes.summaryStrip.hidden = true;
  nodes.controlRow.hidden = false;
  nodes.mainGrid.hidden = true;
  nodes.tablePanel.hidden = true;
  nodes.sourceChip.textContent = "Approved source only";
  nodes.runStatusChip.textContent = `${surface?.label || "Surface"}: no valid NBA data`;
  setHeroContent({
    eyebrow: "NBA Betting Results",
    title: "Card-first results for fast betting decisions.",
    description: "Approved source only: capping.pro NBA surfaces for Best Bets, Edges, Props, Parlay, Degen, and Exploits. No alternate feeds, no fallback providers, no mixed-league content.",
    attribution: `Source: ${surface?.source_url || state.approved.sourcePolicy?.approved_root_url || "https://capping.pro/"}`,
    isYahoo: false,
  });
  setEmptyState(
    "No NBA markets currently available from the approved source.",
    `Source: ${surface?.source_url || state.approved.sourcePolicy?.approved_root_url || "https://capping.pro/"}`
  );
}

function renderApprovedData(items) {
  const surface = getActiveSurface();
  hideEmptyState();
  nodes.summaryStrip.hidden = false;
  nodes.controlRow.hidden = false;
  nodes.mainGrid.hidden = false;
  nodes.tablePanel.hidden = !state.approved.showTable;
  nodes.sourceChip.textContent = "Approved source only";
  nodes.runStatusChip.textContent = `${surface?.label || "Surface"}: ${items.length} NBA items`;
  setHeroContent({
    eyebrow: "NBA Betting Results",
    title: "Card-first results for fast betting decisions.",
    description: "Approved source only: capping.pro NBA surfaces for Best Bets, Edges, Props, Parlay, Degen, and Exploits. No alternate feeds, no fallback providers, no mixed-league content.",
    attribution: `Source: ${surface?.source_url || state.approved.sourcePolicy?.approved_root_url || "https://capping.pro/"}`,
    isYahoo: false,
  });
  renderApprovedSummary(items);
  renderApprovedFeatured(items);
  renderApprovedPickStack(items);
  renderApprovedValueChart(items);
  renderApprovedDistribution(items);
  renderApprovedHeatmap(items);
  renderApprovedTable(items);
  nodes.listToggle.textContent = state.approved.showTable ? "Hide table" : "Show table";
}

function parseJsonl(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Malformed JSONL at line ${index + 1}: ${error.message}`);
      }
    });
}

async function loadJsonl(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  const text = await response.text();
  return parseJsonl(text);
}

function latestScheduledTipoff(games) {
  const timestamps = games
    .map((game) => game.start_time || game.start_date)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .map((date) => date.getTime());

  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function yahooThresholdBucket(row) {
  const edge = Number(row.edge_probability ?? Number.NEGATIVE_INFINITY);
  if (edge > 0) return "Positive";
  if (edge >= -0.01) return "Near Fair";
  return "Below Fair";
}

function joinYahooRows(games, edges) {
  const gamesBySnapshot = new Map(games.map((game) => [game.snapshot_id, game]));
  return edges
    .map((edge) => {
      const game = gamesBySnapshot.get(edge.snapshot_id) || {};
      const matchup = `${edge.away_team || game.away_team || "Away"} @ ${edge.home_team || game.home_team || "Home"}`;
      return {
        ...game,
        ...edge,
        matchup,
        market_label: titleize(edge.market_type),
        selection_label: edge.selection_kind === "away" ? `${edge.away_team} moneyline`
          : edge.selection_kind === "home" ? `${edge.home_team} moneyline`
          : edge.selection_kind === "over" ? `Over ${formatNumber(edge.line, 1)}`
          : edge.selection_kind === "under" ? `Under ${formatNumber(edge.line, 1)}`
          : edge.selection_name || titleize(edge.selection_kind),
        edge_bucket: yahooThresholdBucket(edge),
      };
    })
    .sort((a, b) => {
      const edgeDiff = (Number(b.edge_probability) || -Infinity) - (Number(a.edge_probability) || -Infinity);
      if (edgeDiff !== 0) return edgeDiff;
      const overroundDiff = (Number(a.overround) || Infinity) - (Number(b.overround) || Infinity);
      if (overroundDiff !== 0) return overroundDiff;
      return normalizeText(a.matchup).localeCompare(normalizeText(b.matchup));
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function yahooFilteredRows() {
  return state.yahoo.rows.filter((row) => {
    const marketOk = state.yahoo.filters.marketType === "All" || row.market_label === state.yahoo.filters.marketType;
    const matchupOk = state.yahoo.filters.matchup === "All" || row.matchup === state.yahoo.filters.matchup;
    const selectionOk = state.yahoo.filters.selection === "All" || titleize(row.selection_kind) === state.yahoo.filters.selection;
    const thresholdOk = state.yahoo.filters.threshold === "All" || row.edge_bucket === state.yahoo.filters.threshold;
    return marketOk && matchupOk && selectionOk && thresholdOk;
  });
}

function renderYahooFilters() {
  const rows = state.yahoo.rows;
  const marketValues = ["All", ...new Set(rows.map((row) => row.market_label))];
  const matchupValues = ["All", ...new Set(rows.map((row) => row.matchup))];
  const selectionValues = ["All", ...new Set(rows.map((row) => titleize(row.selection_kind)))];
  const thresholdValues = ["All", "Positive", "Near Fair", "Below Fair"];

  renderFilterBlock(nodes.primaryFilterLabel, nodes.primaryFilters, "Market Type", false);
  renderFilterBlock(nodes.secondaryFilterLabel, nodes.secondaryFilters, "Matchup", false);
  renderFilterBlock(nodes.tertiaryFilterLabel, nodes.tertiaryFilters, "Selection Side", false);
  renderFilterBlock(nodes.quaternaryFilterLabel, nodes.quaternaryFilters, "Edge Bucket", false);

  renderChips(nodes.primaryFilters, marketValues, state.yahoo.filters.marketType, (value) => {
    state.yahoo.filters.marketType = value;
    saveUIState();
    render();
  });
  renderChips(nodes.secondaryFilters, matchupValues, state.yahoo.filters.matchup, (value) => {
    state.yahoo.filters.matchup = value;
    saveUIState();
    render();
  });
  renderChips(nodes.tertiaryFilters, selectionValues, state.yahoo.filters.selection, (value) => {
    state.yahoo.filters.selection = value;
    saveUIState();
    render();
  });
  renderChips(nodes.quaternaryFilters, thresholdValues, state.yahoo.filters.threshold, (value) => {
    state.yahoo.filters.threshold = value;
    saveUIState();
    render();
  });
}

function yahooMetricRatio(row, rows) {
  const current = Number(row.edge_probability ?? 0);
  const max = Math.max(...rows.map((entry) => Math.abs(Number(entry.edge_probability ?? 0))), 0.0001);
  return Math.max(0.12, Math.min(Math.abs(current) / max, 1));
}

function yahooMeterMarkup(row, rows) {
  const ratio = yahooMetricRatio(row, rows);
  return `
    <div class="confidence-wrap">
      <div class="confidence-row">
        <span>Edge Probability</span>
        <strong>${formatPercent(row.edge_probability, 2)}</strong>
      </div>
      <div class="meter">
        <div class="meter-fill" style="width: ${Math.round(ratio * 100)}%; background: ${toneColor(ratio)};"></div>
      </div>
    </div>
  `;
}

function yahooPillsMarkup(row) {
  const pills = [
    `<span class="type-chip">${row.market_label}</span>`,
    `<span class="book-chip">${titleize(row.selection_kind)}</span>`,
  ];
  if (row.line != null) pills.push(`<span class="odds-chip">Line ${formatNumber(row.line, 1)}</span>`);
  pills.push(`<span class="metric-pill ${Number(row.edge_probability) > 0 ? "positive" : ""}">Fair ${formatAmerican(row.fair_american_odds)}</span>`);
  pills.push(`<span class="metric-pill ${Number(row.overround) > 1.06 ? "warning" : ""}">Overround ${formatPercent((Number(row.overround) || 1) - 1, 2)}</span>`);
  return pills.join("");
}

function yahooPickCardMarkup(row, rows, featured = false) {
  const ratio = yahooMetricRatio(row, rows);
  const tone = toneColor(ratio);
  const hasPositive = Number(row.edge_probability) > 0;
  const edgeText = hasPositive ? "Positive edge" : "Closest to fair";
  return `
    <article class="${featured ? "featured-card" : "pick-card"} yahoo-card">
      ${featured ? "" : `<div class="pick-rank">${row.rank}</div>`}
      <div class="pick-topline">${yahooPillsMarkup(row)}</div>
      <div class="matchup">${row.matchup}</div>
      <div class="pick-text">${row.selection_label}</div>
      ${yahooMeterMarkup(row, rows)}
      <div class="pick-meta-grid">
        <span class="metric-pill ${hasPositive ? "positive" : ""}">Edge ${formatPercent(row.edge_probability, 2)}</span>
        <span class="metric-pill">Offered ${formatAmerican(row.american_odds)} / ${formatNumber(row.decimal_odds, 2)}</span>
        <span class="metric-pill">No-vig ${formatPercent(row.no_vig_probability, 2)}</span>
      </div>
      <div class="yahoo-detail-grid">
        <div class="yahoo-detail-row">
          <span class="muted">Fair odds</span>
          <strong>${formatAmerican(row.fair_american_odds)} / ${formatNumber(row.fair_decimal_odds, 2)}</strong>
        </div>
        <div class="yahoo-detail-row">
          <span class="muted">Overround</span>
          <strong>${formatPercent((Number(row.overround) || 1) - 1, 2)}</strong>
        </div>
        <div class="yahoo-detail-row">
          <span class="muted">Snapshot</span>
          <strong>${row.snapshot_ts || "Unknown"}</strong>
        </div>
        <div class="yahoo-detail-row">
          <span class="muted">Raw file</span>
          <strong>${rawPathLabel(row.raw_path)}</strong>
        </div>
      </div>
      <p class="subtext">${edgeText}. Market: ${row.market_name || row.market_label}. Source file: ${row.raw_path}.</p>
      <div class="edge-strip" style="width: ${Math.round(ratio * 100)}%; background: ${tone};"></div>
    </article>
  `;
}

function renderYahooSummary(rows) {
  const uniqueGames = new Set(rows.map((row) => row.game_id));
  const positive = rows.filter((row) => Number(row.edge_probability) > 0).length;
  const nearFair = rows.filter((row) => Number(row.edge_probability) >= -0.01).length;
  const marketCount = [...new Set(rows.map((row) => row.market_label))].length;
  const latest = latestScheduledTipoff(state.yahoo.games);
  const cards = [
    { label: "Games on slate", value: String(uniqueGames.size), note: rows[0]?.season ? `Season ${rows[0].season}` : "NBA only" },
    { label: "Market rows", value: String(rows.length), note: `${marketCount} market types loaded` },
    { label: "Positive / near fair", value: `${positive} / ${nearFair}`, note: "Based on edge probability buckets" },
    { label: "Latest tipoff", value: compactTime(latest), note: "Latest scheduled game start across the loaded slate" },
  ];

  nodes.summaryStrip.innerHTML = cards.map((card) => `
    <article class="summary-card">
      <span class="summary-label">${card.label}</span>
      <span class="summary-value">${card.value}</span>
      <span class="summary-note">${card.note}</span>
    </article>
  `).join("");
}

function renderYahooFeatured(rows) {
  nodes.featuredPick.innerHTML = rows.length ? yahooPickCardMarkup(rows[0], rows, true) : "";
}

function renderYahooPickStack(rows) {
  nodes.pickStack.innerHTML = rows.slice(0, 8).map((row) => yahooPickCardMarkup(row, rows)).join("");
}

function renderYahooValueChart(rows) {
  const top = rows.slice(0, 8);
  const max = Math.max(...top.map((row) => Math.abs(Number(row.edge_probability ?? 0))), 0.0001);
  nodes.valueChart.innerHTML = top.map((row) => `
    <div class="value-row">
      <div class="value-label">
        <div class="value-title">${row.matchup}</div>
        <div class="value-subtitle">${row.selection_label}</div>
      </div>
      <div class="value-bar">
        <div class="value-fill" style="width: ${Math.max(8, (Math.abs(Number(row.edge_probability ?? 0)) / max) * 100)}%; background: ${toneColor(yahooMetricRatio(row, top))};"></div>
      </div>
      <div class="value-number">${formatPercent(row.edge_probability, 2)}</div>
    </div>
  `).join("");
}

function renderYahooDistribution(rows) {
  const counts = [...new Set(rows.map((row) => row.market_label))].map((label) => ({
    label,
    count: rows.filter((row) => row.market_label === label).length,
  }));
  const max = Math.max(...counts.map((entry) => entry.count), 1);
  nodes.distributionChart.innerHTML = counts.map((entry) => `
    <div class="dist-row">
      <div class="dist-label-line">
        <span>${entry.label}</span>
        <strong>${entry.count}</strong>
      </div>
      <div class="dist-bar">
        <div class="dist-fill" style="width: ${(entry.count / max) * 100}%;"></div>
      </div>
    </div>
  `).join("");
}

function renderYahooHeatmap(rows) {
  const rowKeys = [...new Set(rows.map((row) => row.matchup))].slice(0, 8);
  const columns = [...new Set(rows.map((row) => row.market_label))].slice(0, 4);
  if (!rowKeys.length || !columns.length) {
    nodes.heatmap.innerHTML = "<div class=\"muted\">No matchup coverage to display.</div>";
    return;
  }

  const maxCount = Math.max(
    1,
    ...rowKeys.flatMap((rowKey) =>
      columns.map((column) => rows.filter((row) => row.matchup === rowKey && row.market_label === column).length)
    )
  );

  const cells = ["<div class=\"heatmap-grid\">", "<div class=\"heatmap-cell label\">Matchup</div>"];
  columns.forEach((column) => cells.push(`<div class="heatmap-cell label">${column}</div>`));
  rowKeys.forEach((rowKey) => {
    cells.push(`<div class="heatmap-cell label">${rowKey}</div>`);
    columns.forEach((column) => {
      const count = rows.filter((row) => row.matchup === rowKey && row.market_label === column).length;
      const intensity = count / maxCount;
      const background = count ? `rgba(20, 184, 166, ${0.18 + intensity * 0.55})` : "rgba(226, 232, 240, 0.45)";
      cells.push(`<div class="heatmap-cell" style="background: ${background};">${count || "—"}</div>`);
    });
  });
  cells.push("</div>");
  nodes.heatmap.innerHTML = cells.join("");
}

function renderYahooTable(rows) {
  nodes.tableBody.innerHTML = rows.slice(0, 24).map((row) => `
    <tr>
      <td>${row.matchup}</td>
      <td><span class="table-pill">${row.market_label}</span></td>
      <td>${row.selection_label}</td>
      <td>${row.line != null ? formatNumber(row.line, 1) : "—"}</td>
      <td>${formatAmerican(row.american_odds)} / ${formatNumber(row.decimal_odds, 2)}</td>
      <td>${formatAmerican(row.fair_american_odds)} / ${formatNumber(row.fair_decimal_odds, 2)}</td>
      <td>${formatPercent(row.edge_probability, 2)}</td>
      <td>${formatPercent((Number(row.overround) || 1) - 1, 2)}</td>
      <td>${row.snapshot_ts || "Unknown"}</td>
    </tr>
  `).join("");
}

function renderYahooNoData(message) {
  nodes.summaryStrip.hidden = true;
  nodes.controlRow.hidden = false;
  nodes.mainGrid.hidden = true;
  nodes.tablePanel.hidden = true;
  nodes.sourceChip.textContent = state.yahoo.loadError && !state.yahoo.rows.length ? "Yahoo load failed" : "Yahoo NBA dashboard";
  nodes.runStatusChip.textContent = message;
  setHeroContent({
    eyebrow: "Yahoo NBA Dashboard",
    title: "Live odds board built from your parsed Yahoo pipeline.",
    description: "Interactive NBA-only slate view for moneyline, spread, and game totals. Built from the live-compatible Yahoo JSONL outputs inside this Codespace.",
    attribution: "Source: Yahoo NBA game odds · data/parsed/live_jsonl",
    isYahoo: true,
  });
  setEmptyState("No Yahoo NBA dashboard data available.", message);
}

function renderYahooData(rows) {
  const refreshedText = state.yahoo.lastRefreshAt ? ` · refreshed ${compactTime(state.yahoo.lastRefreshAt, "UTC")}` : "";
  nodes.sourceChip.textContent = state.yahoo.loadError && !state.yahoo.rows.length
    ? "Yahoo load failed"
    : `Yahoo NBA · ${state.yahoo.games.length} games · ${state.yahoo.edges.length} derived rows`;

  if (state.yahoo.statusMode === "loading") {
    nodes.runStatusChip.textContent = "Loading dashboard";
  } else if (state.yahoo.statusMode === "refresh_failed") {
    nodes.runStatusChip.textContent = `Refresh failed${refreshedText}`;
  } else if (rows.length) {
    nodes.runStatusChip.textContent = `${rows.length} rows in view${refreshedText}`;
  } else {
    nodes.runStatusChip.textContent = `No rows in current filter${refreshedText}`;
  }

  setHeroContent({
    eyebrow: "Yahoo NBA Dashboard",
    title: "Live odds board built from your parsed Yahoo pipeline.",
    description: "Interactive NBA-only slate view for moneyline, spread, and game totals. Built from the live-compatible Yahoo JSONL outputs inside this Codespace.",
    attribution: "Source: Yahoo NBA game odds · data/parsed/live_jsonl",
    isYahoo: true,
  });
  nodes.summaryStrip.hidden = false;
  nodes.controlRow.hidden = false;
  nodes.mainGrid.hidden = false;
  nodes.tablePanel.hidden = !state.yahoo.showTable;
  nodes.listToggle.textContent = state.yahoo.showTable ? "Hide table" : "Show table";

  if (!state.yahoo.rows.length) {
    renderYahooNoData("Run the Yahoo fetch and parse pipeline, then refresh.");
    return;
  }

  renderYahooFilters();

  if (!rows.length) {
    setEmptyState("No Yahoo rows match the current filters.", "Adjust the market, matchup, selection, or edge bucket filters.");
    clearDataViews();
    renderYahooSummary(state.yahoo.rows);
    return;
  }

  hideEmptyState();
  renderYahooSummary(rows);
  renderYahooFeatured(rows);
  renderYahooPickStack(rows);
  renderYahooValueChart(rows);
  renderYahooDistribution(rows);
  renderYahooHeatmap(rows);
  renderYahooTable(rows);
}

async function loadApprovedDataset() {
  const payload = await loadJson(DATA_FILE.enrichedPath).catch(
    () => loadJson(DATA_FILE.path).catch(() => ({ surfaces: [] }))
  );

  const [auConfig, sourcePolicy, runSummary] = await Promise.all([
    loadJson(AU_CONFIG_PATH),
    loadJson(SOURCE_POLICY_PATH),
    loadJson(DATA_FILE.summaryPath).catch(() => null),
  ]);

  state.approved.sourceLabel = DATA_FILE.label;
  state.approved.runSummary = runSummary;
  state.approved.auConfig = auConfig;
  state.approved.sourcePolicy = sourcePolicy;
  state.approved.surfaces = hydrateSurfaces(payload);
  state.approved.loadError = null;
}

async function loadYahooDashboardData() {
  if (state.yahoo.statusMode === "loading" && state.yahoo.hasLoaded) return;
  state.yahoo.statusMode = "loading";
  if (state.activeDataSource === "yahoo") {
    render();
  }

  try {
    const [games, edges] = await Promise.all([
      loadJsonl(YAHOO_DATA_PATHS.games),
      loadJsonl(YAHOO_DATA_PATHS.edges),
    ]);
    state.yahoo.games = games;
    state.yahoo.edges = edges;
    state.yahoo.rows = joinYahooRows(games, edges);
    state.yahoo.loadError = null;
    state.yahoo.lastRefreshAt = new Date().toISOString();
    state.yahoo.statusMode = "updated";
    state.yahoo.hasLoaded = true;
  } catch (error) {
    state.yahoo.loadError = error.message || "Unknown dashboard load failure";
    state.yahoo.statusMode = state.yahoo.rows.length ? "refresh_failed" : "load_failed";
    state.yahoo.hasLoaded = true;
  }

  if (state.activeDataSource === "yahoo") {
    render();
  }
}

function startYahooRefreshLoop() {
  if (state.yahoo.refreshTimerId != null) return;
  state.yahoo.refreshTimerId = window.setInterval(() => {
    if (state.activeDataSource === "yahoo") {
      loadYahooDashboardData();
    }
  }, REFRESH_INTERVAL_MS);
}

function stopYahooRefreshLoop() {
  if (state.yahoo.refreshTimerId == null) return;
  window.clearInterval(state.yahoo.refreshTimerId);
  state.yahoo.refreshTimerId = null;
}

function switchDataSource(sourceId) {
  if (state.activeDataSource === sourceId) return;
  state.activeDataSource = sourceId;
  window.location.hash = sourceId === "yahoo" ? "yahoo" : "";
  if (sourceId === "yahoo") {
    startYahooRefreshLoop();
    if (!state.yahoo.hasLoaded) {
      loadYahooDashboardData();
    }
  } else {
    stopYahooRefreshLoop();
  }
  render();
}

function renderApprovedView() {
  nodes.surfaceRow.hidden = false;
  renderApprovedSurfaceTabs();
  renderApprovedFilters();
  const items = approvedFilteredItems();
  if (!items.length) {
    renderApprovedNoData();
    return;
  }
  renderApprovedData(items);
}

function renderYahooView() {
  nodes.surfaceRow.hidden = true;
  const rows = yahooFilteredRows();
  if (state.yahoo.loadError && !state.yahoo.rows.length) {
    renderYahooNoData(state.yahoo.loadError);
    return;
  }
  renderYahooData(rows);
}

function render() {
  renderSourceTabs();
  setTableHeaders(state.activeDataSource);

  if (state.activeDataSource === "yahoo") {
    renderYahooView();
    return;
  }

  renderApprovedView();
}

nodes.listToggle.addEventListener("click", () => {
  if (state.activeDataSource === "yahoo") {
    state.yahoo.showTable = !state.yahoo.showTable;
  } else {
    state.approved.showTable = !state.approved.showTable;
  }
  saveUIState();
  render();
});

async function init() {
  await loadApprovedDataset();

  const saved = loadUIState();
  const defaultSurfaceId = state.approved.surfaces.find((surface) => surface.items.length)?.id || state.approved.surfaces[0]?.id || "best-bets";
  if (saved?.approved) {
    const surfaceExists = state.approved.surfaces.some((surface) => surface.id === saved.approved.activeSurfaceId);
    state.approved.activeSurfaceId = surfaceExists ? saved.approved.activeSurfaceId : defaultSurfaceId;
    state.approved.filters = {
      primary: saved.approved.filters?.primary || "All",
      secondary: saved.approved.filters?.secondary || "All",
    };
    state.approved.showTable = saved.approved.showTable ?? false;
  } else {
    state.approved.activeSurfaceId = defaultSurfaceId;
  }

  if (saved?.yahoo) {
    state.yahoo.filters = {
      marketType: saved.yahoo.filters?.marketType || "All",
      matchup: saved.yahoo.filters?.matchup || "All",
      selection: saved.yahoo.filters?.selection || "All",
      threshold: saved.yahoo.filters?.threshold || "All",
    };
    state.yahoo.showTable = saved.yahoo.showTable ?? false;
  }

  if (state.activeDataSource === "yahoo") {
    startYahooRefreshLoop();
    void loadYahooDashboardData();
  }

  render();
}

init().catch((error) => {
  state.activeDataSource = "approved";
  nodes.sourceChip.textContent = "Approved source only";
  nodes.runStatusChip.textContent = error.message;
  nodes.summaryStrip.hidden = true;
  nodes.mainGrid.hidden = true;
  nodes.tablePanel.hidden = true;
  nodes.surfaceRow.hidden = false;
  setHeroContent({
    eyebrow: "NBA Betting Results",
    title: "Card-first results for fast betting decisions.",
    description: "Approved source only: capping.pro NBA surfaces for Best Bets, Edges, Props, Parlay, Degen, and Exploits. No alternate feeds, no fallback providers, no mixed-league content.",
    attribution: "Source: https://capping.pro/",
    isYahoo: false,
  });
  setEmptyState("No NBA markets currently available from the approved source.", `Error: ${error.message}`);
});
