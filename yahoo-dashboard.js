const DATA_PATHS = {
  games: "./data/parsed/live_jsonl/normalized/games.jsonl",
  edges: "./data/parsed/live_jsonl/derived/edges.jsonl",
};

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const state = {
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
  statusMode: "loading",
};

const nodes = {
  sourceChip: document.getElementById("yahoo-source-chip"),
  runStatusChip: document.getElementById("yahoo-run-status-chip"),
  summaryStrip: document.getElementById("yahoo-summary-strip"),
  emptyState: document.getElementById("yahoo-empty-state"),
  emptyMessage: document.getElementById("yahoo-empty-message"),
  marketFilters: document.getElementById("yahoo-market-filters"),
  matchupFilters: document.getElementById("yahoo-matchup-filters"),
  selectionFilters: document.getElementById("yahoo-selection-filters"),
  thresholdFilters: document.getElementById("yahoo-threshold-filters"),
  featuredPick: document.getElementById("yahoo-featured-pick"),
  pickStack: document.getElementById("yahoo-pick-stack"),
  valueChart: document.getElementById("yahoo-value-chart"),
  distributionChart: document.getElementById("yahoo-distribution-chart"),
  heatmap: document.getElementById("yahoo-heatmap"),
  tablePanel: document.getElementById("yahoo-table-panel"),
  tableBody: document.getElementById("yahoo-pick-table-body"),
  tableToggle: document.getElementById("yahoo-list-toggle"),
};

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function titleize(value) {
  return normalizeText(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
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

function compactTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

function thresholdBucket(row) {
  const edge = Number(row.edge_probability ?? Number.NEGATIVE_INFINITY);
  if (edge > 0) return "Positive";
  if (edge >= -0.01) return "Near Fair";
  return "Below Fair";
}

function joinRows(games, edges) {
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
        edge_bucket: thresholdBucket(edge),
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

function filteredRows() {
  return state.rows.filter((row) => {
    const marketOk = state.filters.marketType === "All" || row.market_label === state.filters.marketType;
    const matchupOk = state.filters.matchup === "All" || row.matchup === state.filters.matchup;
    const selectionOk = state.filters.selection === "All" || titleize(row.selection_kind) === state.filters.selection;
    const thresholdOk = state.filters.threshold === "All" || row.edge_bucket === state.filters.threshold;
    return marketOk && matchupOk && selectionOk && thresholdOk;
  });
}

function renderChips(container, values, activeValue, onClick) {
  container.innerHTML = "";
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${value === activeValue ? " active" : ""}`;
    button.textContent = value;
    button.addEventListener("click", () => onClick(value));
    container.appendChild(button);
  });
}

function renderFilters(rows) {
  const marketValues = ["All", ...new Set(rows.map((row) => row.market_label))];
  const matchupValues = ["All", ...new Set(rows.map((row) => row.matchup))];
  const selectionValues = ["All", ...new Set(rows.map((row) => titleize(row.selection_kind)))];
  const thresholdValues = ["All", "Positive", "Near Fair", "Below Fair"];

  renderChips(nodes.marketFilters, marketValues, state.filters.marketType, (value) => {
    state.filters.marketType = value;
    render();
  });
  renderChips(nodes.matchupFilters, matchupValues, state.filters.matchup, (value) => {
    state.filters.matchup = value;
    render();
  });
  renderChips(nodes.selectionFilters, selectionValues, state.filters.selection, (value) => {
    state.filters.selection = value;
    render();
  });
  renderChips(nodes.thresholdFilters, thresholdValues, state.filters.threshold, (value) => {
    state.filters.threshold = value;
    render();
  });
}

function summaryCards(rows) {
  const uniqueGames = new Set(rows.map((row) => row.game_id));
  const positive = rows.filter((row) => Number(row.edge_probability) > 0).length;
  const nearFair = rows.filter((row) => Number(row.edge_probability) >= -0.01).length;
  const marketCount = [...new Set(rows.map((row) => row.market_label))].length;
  const latest = latestScheduledTipoff(state.games);

  return [
    { label: "Games on slate", value: String(uniqueGames.size), note: rows[0]?.season ? `Season ${rows[0].season}` : "NBA only" },
    { label: "Market rows", value: String(rows.length), note: `${marketCount} market types loaded` },
    { label: "Positive / near fair", value: `${positive} / ${nearFair}`, note: "Based on edge probability buckets" },
    { label: "Latest tipoff", value: compactTime(latest), note: "Latest scheduled game start across the loaded slate" },
  ];
}

function renderSummary(rows) {
  nodes.summaryStrip.innerHTML = summaryCards(rows).map((card) => `
    <article class="summary-card">
      <span class="summary-label">${card.label}</span>
      <span class="summary-value">${card.value}</span>
      <span class="summary-note">${card.note}</span>
    </article>
  `).join("");
}

function metricRatio(row, rows) {
  const current = Number(row.edge_probability ?? 0);
  const max = Math.max(...rows.map((entry) => Math.abs(Number(entry.edge_probability ?? 0))), 0.0001);
  return Math.max(0.12, Math.min(Math.abs(current) / max, 1));
}

function toneColor(ratio) {
  if (ratio >= 0.85) return "var(--confidence-elite)";
  if (ratio >= 0.65) return "var(--confidence-high)";
  if (ratio >= 0.4) return "var(--confidence-medium)";
  return "var(--confidence-low)";
}

function meterMarkup(row, rows) {
  const ratio = metricRatio(row, rows);
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

function pillsMarkup(row) {
  const pills = [
    `<span class="type-chip">${row.market_label}</span>`,
    `<span class="book-chip">${titleize(row.selection_kind)}</span>`,
  ];
  if (row.line != null) pills.push(`<span class="odds-chip">Line ${formatNumber(row.line, 1)}</span>`);
  pills.push(`<span class="metric-pill ${Number(row.edge_probability) > 0 ? "positive" : ""}">Fair ${formatAmerican(row.fair_american_odds)}</span>`);
  pills.push(`<span class="metric-pill ${Number(row.overround) > 1.06 ? "warning" : ""}">Overround ${formatPercent((Number(row.overround) || 1) - 1, 2)}</span>`);
  return pills.join("");
}

function rawPathLabel(path) {
  const parts = normalizeText(path).split("/");
  return parts.slice(-2).join("/");
}

function pickCardMarkup(row, rows, featured = false) {
  const ratio = metricRatio(row, rows);
  const tone = toneColor(ratio);
  const hasPositive = Number(row.edge_probability) > 0;
  const edgeText = hasPositive ? "Positive edge" : "Closest to fair";
  return `
    <article class="${featured ? "featured-card" : "pick-card"} yahoo-card">
      ${featured ? "" : `<div class="pick-rank">${row.rank}</div>`}
      <div class="pick-topline">${pillsMarkup(row)}</div>
      <div class="matchup">${row.matchup}</div>
      <div class="pick-text">${row.selection_label}</div>
      ${meterMarkup(row, rows)}
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

function renderFeatured(rows) {
  nodes.featuredPick.innerHTML = rows.length ? pickCardMarkup(rows[0], rows, true) : "";
}

function renderPickStack(rows) {
  nodes.pickStack.innerHTML = rows.slice(0, 8).map((row) => pickCardMarkup(row, rows)).join("");
}

function renderValueChart(rows) {
  const top = rows.slice(0, 8);
  const max = Math.max(...top.map((row) => Math.abs(Number(row.edge_probability ?? 0))), 0.0001);
  nodes.valueChart.innerHTML = top.map((row) => `
    <div class="value-row">
      <div class="value-label">
        <div class="value-title">${row.matchup}</div>
        <div class="value-subtitle">${row.selection_label}</div>
      </div>
      <div class="value-bar">
        <div class="value-fill" style="width: ${Math.max(8, (Math.abs(Number(row.edge_probability ?? 0)) / max) * 100)}%; background: ${toneColor(metricRatio(row, top))};"></div>
      </div>
      <div class="value-number">${formatPercent(row.edge_probability, 2)}</div>
    </div>
  `).join("");
}

function renderDistribution(rows) {
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

function renderHeatmap(rows) {
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

function renderTable(rows) {
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

function renderDataViews(rows) {
  renderSummary(rows);
  renderFilters(state.rows);
  renderFeatured(rows);
  renderPickStack(rows);
  renderValueChart(rows);
  renderDistribution(rows);
  renderHeatmap(rows);
  renderTable(rows);
}

function setEmptyState(message) {
  nodes.emptyState.hidden = false;
  nodes.emptyMessage.textContent = message;
  nodes.summaryStrip.innerHTML = "";
  nodes.featuredPick.innerHTML = "";
  nodes.pickStack.innerHTML = "";
  nodes.valueChart.innerHTML = "";
  nodes.distributionChart.innerHTML = "";
  nodes.heatmap.innerHTML = "";
  nodes.tableBody.innerHTML = "";
}

function render() {
  const rows = filteredRows();
  const sourceLabel = `Yahoo NBA · ${state.games.length} games · ${state.edges.length} derived rows`;
  nodes.sourceChip.textContent = state.loadError && !state.rows.length ? "Yahoo load failed" : sourceLabel;
  const refreshedText = state.lastRefreshAt ? ` · refreshed ${compactTime(state.lastRefreshAt)}` : "";
  if (state.statusMode === "loading") {
    nodes.runStatusChip.textContent = "Loading dashboard";
  } else if (state.statusMode === "refresh_failed") {
    nodes.runStatusChip.textContent = `Refresh failed${refreshedText}`;
  } else if (rows.length) {
    nodes.runStatusChip.textContent = `${rows.length} rows in view${refreshedText}`;
  } else {
    nodes.runStatusChip.textContent = `No rows in current filter${refreshedText}`;
  }
  nodes.tablePanel.hidden = !state.showTable;

  if (state.loadError && !state.rows.length) {
    setEmptyState(state.loadError);
    return;
  }

  if (!state.rows.length) {
    setEmptyState("No parsed Yahoo dashboard rows were found. Run the live parser pipeline and refresh.");
    return;
  }

  if (!rows.length) {
    nodes.emptyState.hidden = false;
    nodes.emptyMessage.textContent = "No rows match the current filters.";
    nodes.featuredPick.innerHTML = "";
    nodes.pickStack.innerHTML = "";
    nodes.valueChart.innerHTML = "";
    nodes.distributionChart.innerHTML = "";
    nodes.heatmap.innerHTML = "";
    nodes.tableBody.innerHTML = "";
    renderSummary(state.rows);
    renderFilters(state.rows);
    return;
  }

  nodes.emptyState.hidden = true;
  renderDataViews(rows);
}

async function loadDashboardData() {
  try {
    const [games, edges] = await Promise.all([
      loadJsonl(DATA_PATHS.games),
      loadJsonl(DATA_PATHS.edges),
    ]);
    state.games = games;
    state.edges = edges;
    state.rows = joinRows(games, edges);
    state.loadError = null;
    state.lastRefreshAt = new Date().toISOString();
    state.statusMode = "updated";
  } catch (error) {
    state.loadError = error.message || "Unknown dashboard load failure";
    state.statusMode = state.rows.length ? "refresh_failed" : "load_failed";
  }
  render();
}

function startRefreshLoop() {
  if (state.refreshTimerId != null) return;
  state.refreshTimerId = window.setInterval(() => {
    loadDashboardData();
  }, REFRESH_INTERVAL_MS);
}

nodes.tableToggle.addEventListener("click", () => {
  state.showTable = !state.showTable;
  nodes.tableToggle.textContent = state.showTable ? "Hide table" : "Show table";
  render();
});

state.statusMode = "loading";
loadDashboardData();
startRefreshLoop();
