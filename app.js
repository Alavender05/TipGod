const DATA_FILE = {
  label: "Approved source",
  path: "./capping-pro-nba-surfaces.json",
  enrichedPath: "./capping-pro-nba-surfaces-enriched.json",
  summaryPath: "./capping-pro-nba-surfaces.run-summary.json",
};

const AU_CONFIG_PATH = "./config/au_sportsbooks.json";
const SOURCE_POLICY_PATH = "./config/source_policy.json";

// Moneyline enrichment — 4 approved AU bookmakers only
const APPROVED_BOOKMAKERS = ["ladbrokes", "sportsbet", "pointsbet", "bet365"];
const BOOKMAKER_DISPLAY_NAMES = {
  ladbrokes: "Ladbrokes",
  sportsbet: "Sportsbet",
  pointsbet: "PointsBet",
  bet365: "Bet365",
};
const SURFACE_ORDER = ["best-bets", "edges", "props", "parlay", "degen", "exploits"];

const STORAGE_KEY = "tipgod_ui_state";

function saveUIState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeSurfaceId: state.activeSurfaceId,
      filters: state.filters,
      showTable: state.showTable,
    }));
  } catch {
    // localStorage unavailable (e.g. private browsing with strict settings) — ignore
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

const state = {
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
};

const nodes = {
  sourceChip: document.getElementById("data-source-chip"),
  sourceAttribution: document.getElementById("source-attribution"),
  runStatusChip: document.getElementById("run-status-chip"),
  summaryStrip: document.getElementById("summary-strip"),
  approvedNoData: document.getElementById("approved-no-data"),
  emptySourceAttribution: document.getElementById("empty-source-attribution"),
  surfaceFilters: document.getElementById("surface-filters"),
  controlRow: document.querySelector(".control-row"),
  primaryFilters: document.getElementById("primary-filters"),
  secondaryFilters: document.getElementById("secondary-filters"),
  primaryFilterLabel: document.getElementById("primary-filter-label"),
  secondaryFilterLabel: document.getElementById("secondary-filter-label"),
  mainGrid: document.querySelector(".main-grid"),
  featuredPick: document.getElementById("featured-pick"),
  pickStack: document.getElementById("pick-stack"),
  valueChart: document.getElementById("value-chart"),
  distributionChart: document.getElementById("distribution-chart"),
  heatmap: document.getElementById("heatmap"),
  tablePanel: document.getElementById("table-panel"),
  tableBody: document.getElementById("pick-table-body"),
  listToggle: document.getElementById("list-toggle"),
};

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

async function loadJson(filePath) {
  const response = await fetch(filePath);
  if (!response.ok) {
    throw new Error(`Failed to load ${filePath}`);
  }
  return response.json();
}

async function loadDataset() {
  // Prefer the enriched dataset if available; fall back to the base dataset.
  const payload = await loadJson(DATA_FILE.enrichedPath).catch(
    () => loadJson(DATA_FILE.path).catch(() => ({ surfaces: [] }))
  );

  const [auConfig, sourcePolicy, runSummary] = await Promise.all([
    loadJson(AU_CONFIG_PATH),
    loadJson(SOURCE_POLICY_PATH),
    loadJson(DATA_FILE.summaryPath).catch(() => null),
  ]);

  return {
    sourceLabel: DATA_FILE.label,
    payload,
    runSummary,
    auConfig,
    sourcePolicy,
  };
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseNumber(value) {
  const match = normalizeText(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function compactTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: state.sourcePolicy?.timezone_display || "America/New_York",
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

function getApprovedSurfaceMeta(surfaceId) {
  return (state.sourcePolicy?.approved_surfaces || []).find((surface) => surface.id === surfaceId) || null;
}

function validateItem(item, surfaceMeta) {
  if (!item || item.league_id !== state.sourcePolicy.league_id || item.sport !== state.sourcePolicy.sport) {
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
      source_url: existing.source_url || new URL(meta?.allowed_paths?.[0] || "/", state.sourcePolicy.approved_root_url).href,
      scan_summary: existing.scan_summary || null,
      items: items.map((item, index) => ({
        ...item,
        rank_seed: index + 1,
      })),
    };
  });
}

function getActiveSurface() {
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId) || state.surfaces[0] || null;
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

function surfaceFilters(surfaceId) {
  return FILTER_SPECS[surfaceId] || [];
}

function itemMatchesFilters(item) {
  const [primarySpec, secondarySpec] = surfaceFilters(state.activeSurfaceId);
  const primaryValue = primarySpec ? primarySpec.getValue(item) : "All";
  const secondaryValue = secondarySpec ? secondarySpec.getValue(item) : "All";
  const primaryOk = state.filters.primary === "All" || primaryValue === state.filters.primary;
  const secondaryOk = state.filters.secondary === "All" || secondaryValue === state.filters.secondary;
  return primaryOk && secondaryOk;
}

function sortItems(items) {
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

function filteredItems() {
  const surface = getActiveSurface();
  if (!surface) return [];
  return sortItems(surface.items.filter(itemMatchesFilters));
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

function renderSurfaceTabs() {
  renderChips(
    nodes.surfaceFilters,
    state.surfaces.map((surface) => surface.id),
    state.activeSurfaceId,
    (value) => {
      state.activeSurfaceId = value;
      state.filters.primary = "All";
      state.filters.secondary = "All";
      saveUIState();
      render();
    },
    (value) => state.surfaces.find((surface) => surface.id === value)?.label || value
  );
}

function renderDynamicFilters() {
  const specs = surfaceFilters(state.activeSurfaceId);
  const surface = getActiveSurface();
  const items = surface?.items || [];

  const [primarySpec, secondarySpec] = specs;
  const primaryValues = primarySpec ? ["All", ...new Set(items.map(primarySpec.getValue).filter(Boolean))] : ["All"];
  const secondaryValues = secondarySpec ? ["All", ...new Set(items.map(secondarySpec.getValue).filter(Boolean))] : ["All"];

  nodes.primaryFilterLabel.hidden = !primarySpec;
  nodes.secondaryFilterLabel.hidden = !secondarySpec;
  nodes.primaryFilterLabel.textContent = primarySpec?.label || "";
  nodes.secondaryFilterLabel.textContent = secondarySpec?.label || "";

  renderChips(nodes.primaryFilters, primaryValues, state.filters.primary, (value) => {
    state.filters.primary = value;
    saveUIState();
    render();
  });

  renderChips(nodes.secondaryFilters, secondaryValues, state.filters.secondary, (value) => {
    state.filters.secondary = value;
    saveUIState();
    render();
  });
}

function metricRatio(item, items) {
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

function meterMarkup(item, items) {
  const metric = primaryMetric(item);
  const ratio = metricRatio(item, items);
  const width = `${Math.round(ratio * 100)}%`;
  return `
    <div class="confidence-wrap">
      <div class="confidence-row">
        <span>${metric?.label || "Primary metric"}</span>
        <strong>${metricDisplay(metric)}</strong>
      </div>
      <div class="meter">
        <div class="meter-fill" style="width: ${width}; background: ${toneColor(ratio)};"></div>
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

function renderMoneylineComparison(item) {
  const enrichment = item.moneyline_enrichment;

  // No enrichment data at all — show nothing (not even no-data message)
  // This keeps cards clean when running against the base (non-enriched) dataset
  if (!enrichment) return "";

  const availableQuotes = APPROVED_BOOKMAKERS.filter(
    (slug) => enrichment.quotes[slug]?.is_available
  );
  const coverageCount = availableQuotes.length;

  // All 4 books unavailable — show no-data message
  if (coverageCount === 0) {
    return `
      <div class="moneyline-no-data">
        <span>No moneyline data available</span>
      </div>
    `;
  }

  const best = enrichment.best_available;
  const homeLabel = enrichment.home_team
    ? enrichment.home_team.split(" ").pop()   // e.g. "Lakers" from "Los Angeles Lakers"
    : "Home";
  const awayLabel = enrichment.away_team
    ? enrichment.away_team.split(" ").pop()
    : "Away";

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
      <div class="moneyline-rows">${rows}</div>
    </div>
  `;
}

function pickCardMarkup(item, items, surfaceLabel, featured = false) {
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
      ${meterMarkup(item, items)}
      <div class="pick-meta-grid">${metaPills.join("")}</div>
      ${renderMoneylineComparison(item)}
      <p class="subtext">${item.reason || "Approved-source NBA item."}</p>
      <div class="edge-strip" style="width: ${Math.round(metricRatio(item, items) * 100)}%; background: ${toneColor(metricRatio(item, items))};"></div>
    </article>
  `;
}

function renderSummary(items) {
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

function renderFeatured(items) {
  const surfaceLabel = getActiveSurface()?.label || "Surface";
  nodes.featuredPick.innerHTML = items.length ? pickCardMarkup(items[0], items, surfaceLabel, true) : "";
}

function renderPickStack(items) {
  const surfaceLabel = getActiveSurface()?.label || "Surface";
  nodes.pickStack.innerHTML = items.slice(0, 6).map((item) => pickCardMarkup(item, items, surfaceLabel)).join("");
}

function renderValueChart(items) {
  const top = items.slice(0, 6);
  const max = Math.max(...top.map((item) => Math.abs(primaryMetric(item)?.value_numeric || 0)), 1);
  nodes.valueChart.innerHTML = top.map((item) => `
    <div class="value-row">
      <div class="value-label">
        <div class="value-title">${item.title || "Untitled item"}</div>
        <div class="value-subtitle">${item.selection || item.subtitle || item.matchup || "No context"}</div>
      </div>
      <div class="value-bar">
        <div class="value-fill" style="width: ${Math.max(8, (Math.abs(primaryMetric(item)?.value_numeric || 0) / max) * 100)}%; background: ${toneColor(metricRatio(item, top))};"></div>
      </div>
      <div class="value-number">${metricDisplay(primaryMetric(item))}</div>
    </div>
  `).join("");
}

function renderDistribution(items) {
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

function renderHeatmap(items) {
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

function renderTable(items) {
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

function renderNoData() {
  const surface = getActiveSurface();
  nodes.summaryStrip.hidden = true;
  nodes.controlRow.hidden = false;
  nodes.mainGrid.hidden = true;
  nodes.tablePanel.hidden = true;
  nodes.approvedNoData.hidden = false;
  nodes.sourceChip.textContent = "Approved source only";
  nodes.runStatusChip.textContent = `${surface?.label || "Surface"}: no valid NBA data`;
  nodes.sourceAttribution.textContent = `Source: ${surface?.source_url || state.sourcePolicy.approved_root_url}`;
  nodes.emptySourceAttribution.textContent = `Source: ${surface?.source_url || state.sourcePolicy.approved_root_url}`;
}

function renderData(items) {
  const surface = getActiveSurface();
  nodes.approvedNoData.hidden = true;
  nodes.summaryStrip.hidden = false;
  nodes.controlRow.hidden = false;
  nodes.mainGrid.hidden = false;
  nodes.tablePanel.hidden = !state.showTable;
  nodes.sourceChip.textContent = "Approved source only";
  nodes.runStatusChip.textContent = `${surface?.label || "Surface"}: ${items.length} NBA items`;
  nodes.sourceAttribution.textContent = `Source: ${surface?.source_url || state.sourcePolicy.approved_root_url}`;

  renderSummary(items);
  renderFeatured(items);
  renderPickStack(items);
  renderValueChart(items);
  renderDistribution(items);
  renderHeatmap(items);
  renderTable(items);
  nodes.listToggle.textContent = state.showTable ? "Hide table" : "Show table";
}

function render() {
  renderSurfaceTabs();
  renderDynamicFilters();
  const items = filteredItems();
  if (!items.length) {
    renderNoData();
    return;
  }
  renderData(items);
}

nodes.listToggle.addEventListener("click", () => {
  state.showTable = !state.showTable;
  saveUIState();
  render();
});

async function init() {
  const dataset = await loadDataset();
  state.sourceLabel = dataset.sourceLabel;
  state.runSummary = dataset.runSummary;
  state.auConfig = dataset.auConfig;
  state.sourcePolicy = dataset.sourcePolicy;
  state.surfaces = hydrateSurfaces(dataset.payload);

  // Restore persisted UI state (surface, filters, showTable)
  const saved = loadUIState();
  const defaultSurfaceId = state.surfaces.find((surface) => surface.items.length)?.id || state.surfaces[0]?.id || "best-bets";
  if (saved) {
    const surfaceExists = state.surfaces.some((s) => s.id === saved.activeSurfaceId);
    state.activeSurfaceId = surfaceExists ? saved.activeSurfaceId : defaultSurfaceId;
    state.filters = { primary: saved.filters?.primary || "All", secondary: saved.filters?.secondary || "All" };
    state.showTable = saved.showTable ?? false;
  } else {
    state.activeSurfaceId = defaultSurfaceId;
  }

  render();
}

init().catch((error) => {
  nodes.sourceChip.textContent = "Approved source only";
  nodes.runStatusChip.textContent = error.message;
  nodes.approvedNoData.hidden = false;
  nodes.summaryStrip.hidden = true;
  nodes.mainGrid.hidden = true;
  nodes.tablePanel.hidden = true;
});
