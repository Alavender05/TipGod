const LIVE_DATA_FILE = {
  label: "Approved source",
  path: "./nba-bestbets-scan.json",
  summaryPath: "./nba-bestbets-scan.run-summary.json",
};

const AU_CONFIG_PATH = "./config/au_sportsbooks.json";
const SOURCE_POLICY_PATH = "./config/source_policy.json";
const BET_TYPE_ORDER = ["player props", "line", "total points", "head-to-head", "team total"];
const BET_TYPE_COLORS = {
  "player props": "#0f766e",
  line: "#d97706",
  "total points": "#0284c7",
  "head-to-head": "#7c3aed",
  "team total": "#be123c",
  other: "#64748b",
};

const state = {
  picks: [],
  sourceLabel: "",
  runSummary: null,
  auConfig: null,
  sourcePolicy: null,
  betType: "All",
  sportsbook: "All",
  showTable: false,
};

const nodes = {
  sourceChip: document.getElementById("data-source-chip"),
  sourceAttribution: document.getElementById("source-attribution"),
  runStatusChip: document.getElementById("run-status-chip"),
  summaryStrip: document.getElementById("summary-strip"),
  approvedNoData: document.getElementById("approved-no-data"),
  controlRow: document.querySelector(".control-row"),
  mainGrid: document.querySelector(".main-grid"),
  betTypeFilters: document.getElementById("bet-type-filters"),
  sportsbookFilters: document.getElementById("sportsbook-filters"),
  featuredPick: document.getElementById("featured-pick"),
  pickStack: document.getElementById("pick-stack"),
  valueChart: document.getElementById("value-chart"),
  distributionChart: document.getElementById("distribution-chart"),
  heatmap: document.getElementById("heatmap"),
  tablePanel: document.getElementById("table-panel"),
  tableBody: document.getElementById("pick-table-body"),
  listToggle: document.getElementById("list-toggle"),
  emptyStateTemplate: document.getElementById("empty-state-template"),
};

async function loadJson(filePath) {
  const response = await fetch(filePath);
  if (!response.ok) {
    throw new Error(`Failed to load ${filePath}`);
  }
  return response.json();
}

async function loadDataset() {
  const [auConfig, sourcePolicy, liveItems, liveSummary] = await Promise.all([
    loadJson(AU_CONFIG_PATH),
    loadJson(SOURCE_POLICY_PATH),
    loadJson(LIVE_DATA_FILE.path).catch(() => []),
    loadJson(LIVE_DATA_FILE.summaryPath).catch(() => null),
  ]);

  return {
    sourceLabel: LIVE_DATA_FILE.label,
    items: Array.isArray(liveItems) ? liveItems : [],
    runSummary: liveSummary,
    auConfig,
    sourcePolicy,
  };
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parsePercent(value) {
  if (value == null) return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseDecimalOdds(value) {
  if (value == null) return null;
  const text = normalizeText(value);
  if (!text || text.startsWith("+") || text.startsWith("-")) return null;
  const match = text.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return numeric >= 1 ? numeric : null;
}

function impliedProbabilityFromDecimal(decimalOdds) {
  if (decimalOdds == null || Number.isNaN(decimalOdds) || decimalOdds <= 0) return null;
  return (1 / decimalOdds) * 100;
}

function labelForMarketType(value) {
  const labels = {
    "player props": "Player Props",
    line: "Line",
    "total points": "Total Points",
    "head-to-head": "Head-to-Head",
    "team total": "Team Total",
    other: "Other",
  };
  return labels[value] || "Other";
}

function buildTeamAliasMap() {
  return new Map(
    state.sourcePolicy.official_nba_teams.flatMap((team) =>
      [team.name, ...(team.aliases || [])].map((alias) => [alias.toLowerCase(), team.name])
    )
  );
}

function canonicalTeamName(value) {
  return buildTeamAliasMap().get(normalizeText(value).toLowerCase()) || null;
}

function extractMatchupTeams(matchup) {
  const text = normalizeText(matchup);
  if (!text) return [];
  for (const separator of [/\s+vs\s+/i, /\s+@\s+/i, /\s+v\s+/i, /\s+versus\s+/i]) {
    const parts = text.split(separator);
    if (parts.length === 2) return parts.map((part) => normalizeText(part));
  }
  return [];
}

function matchupIsNba(matchup) {
  const teams = extractMatchupTeams(matchup);
  return teams.length === 2 && teams.every((team) => canonicalTeamName(team));
}

function normalizeMarketType(item) {
  const aliases = state.auConfig?.market_type_aliases || {};
  const candidates = [item.market_type, item.bet_type, item.market_type_raw, item.market, item.selection];
  for (const candidate of candidates) {
    const raw = String(candidate || "").toLowerCase();
    if (!raw) continue;
    for (const [alias, target] of Object.entries(aliases)) {
      if (raw.includes(alias.toLowerCase())) return target;
    }
  }
  return "other";
}

function resolveSportsbook(item) {
  const books = state.auConfig?.sportsbooks || [];
  const byId = new Map(books.map((book) => [book.id, book]));
  const byName = new Map(books.map((book) => [book.name.toLowerCase(), book]));
  if (item.sportsbook_id && byId.has(item.sportsbook_id)) return byId.get(item.sportsbook_id);
  const rawName = String(item.sportsbook_name || item.sportsbook || "").toLowerCase();
  if (rawName && byName.has(rawName)) return byName.get(rawName);
  return null;
}

function compactTime(value) {
  if (!value) return "Fresh";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-AU", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: state.sourcePolicy?.timezone_display || "Australia/Sydney",
  });
}

function confidenceBand(confidence) {
  if (confidence == null) return "low";
  if (confidence >= 80) return "elite";
  if (confidence >= 70) return "high";
  if (confidence >= 60) return "medium";
  return "low";
}

function confidenceColor(confidence) {
  const band = confidenceBand(confidence);
  if (band === "elite") return "var(--confidence-elite)";
  if (band === "high") return "var(--confidence-high)";
  if (band === "medium") return "var(--confidence-medium)";
  return "var(--confidence-low)";
}

function edgeColor(edge) {
  if (edge == null) return "var(--edge-neutral)";
  if (edge >= 10) return "var(--edge-strong)";
  if (edge > 0) return "var(--edge-positive)";
  return "var(--edge-neutral)";
}

function buildReason(item) {
  if (item.summary_reason) return item.summary_reason;
  const edgeReason = item.model_edge_or_confidence?.edge_reason;
  if (edgeReason) return edgeReason;
  if (Array.isArray(item.supporting_text) && item.supporting_text.length) return item.supporting_text[0];
  return "Approved-source NBA market.";
}

function validateApprovedRecord(item) {
  return item.source_url === state.sourcePolicy.approved_source_url
    && item.league_id === state.sourcePolicy.league_id
    && item.sport === state.sourcePolicy.sport
    && matchupIsNba(item.matchup || "");
}

function enrichItem(item, index) {
  const confidence = parsePercent(item.model_edge_or_confidence?.confidence_percent ?? item.confidence_percent);
  const decimalOdds = item.odds_decimal ?? parseDecimalOdds(item.odds);
  const impliedProbability = item.implied_probability_percent ?? impliedProbabilityFromDecimal(decimalOdds);
  const edge = item.model_edge_percent ?? (
    confidence != null && impliedProbability != null ? Number((confidence - impliedProbability).toFixed(1)) : null
  );
  const sportsbook = resolveSportsbook(item);
  const marketType = normalizeMarketType(item);

  return {
    ...item,
    rank: index + 1,
    betType: marketType,
    marketTypeLabel: labelForMarketType(marketType),
    confidence,
    impliedProbability,
    edge,
    sportsbook_id: sportsbook?.id || item.sportsbook_id || null,
    sportsbook_name: sportsbook?.name || item.sportsbook_name || null,
    region: item.region || "AU",
    odds_format: item.odds_format || state.auConfig?.odds_format_default || "decimal",
    currency: item.currency || state.auConfig?.currency_default || "AUD",
    scheduled_timezone: item.scheduled_timezone || "Australia/Sydney",
    reason: buildReason(item),
    displayOdds: decimalOdds ? decimalOdds.toFixed(2) : "N/A",
    displayTimestamp: compactTime(item.scheduled_at || item.timestamp),
  };
}

function getFilteredPicks() {
  return state.picks.filter((pick) => {
    const typeOk = state.betType === "All" || pick.betType === state.betType;
    const bookOk = state.sportsbook === "All" || pick.sportsbook_id === state.sportsbook;
    return typeOk && bookOk;
  });
}

function sortPicks(picks) {
  return [...picks].sort((a, b) => {
    const edgeA = a.edge ?? -999;
    const edgeB = b.edge ?? -999;
    if (edgeB !== edgeA) return edgeB - edgeA;
    const confA = a.confidence ?? -999;
    const confB = b.confidence ?? -999;
    return confB - confA;
  });
}

function renderChips(container, values, activeValue, onClick, labelFn = (value) => labelForMarketType(value)) {
  container.innerHTML = "";
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${value === activeValue ? " active" : ""}`;
    button.textContent = value === "All" ? "All" : labelFn(value);
    button.addEventListener("click", () => onClick(value));
    container.appendChild(button);
  });
}

function renderNoDataState() {
  nodes.summaryStrip.hidden = true;
  nodes.controlRow.hidden = true;
  nodes.mainGrid.hidden = true;
  nodes.tablePanel.hidden = true;
  nodes.approvedNoData.hidden = false;
  nodes.sourceChip.textContent = "Approved source only";
  nodes.runStatusChip.textContent = "No NBA data available";
  nodes.sourceAttribution.textContent = `Source: ${state.sourcePolicy.approved_source_url}`;
}

function renderSummary(picks) {
  const strongest = picks[0];
  const bestEdge = picks.reduce((best, pick) => (pick.edge ?? -999) > (best?.edge ?? -999) ? pick : best, null);
  const cards = [
    {
      label: "Live picks",
      value: String(picks.length),
      note: strongest ? `${strongest.marketTypeLabel} available` : "No approved picks",
    },
    {
      label: "Best edge",
      value: bestEdge?.edge != null ? `${bestEdge.edge > 0 ? "+" : ""}${bestEdge.edge.toFixed(1)}%` : "N/A",
      note: bestEdge ? bestEdge.selection : "No edge data",
    },
    {
      label: "Top confidence",
      value: strongest?.confidence != null ? `${strongest.confidence.toFixed(0)}%` : "N/A",
      note: strongest ? strongest.matchup : "No confidence data",
    },
    {
      label: "Source",
      value: "NBA",
      note: "Approved source only",
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

function meterMarkup(confidence) {
  const safeConfidence = confidence ?? 0;
  return `
    <div class="confidence-wrap">
      <div class="confidence-row">
        <span>Confidence</span>
        <strong>${safeConfidence ? `${safeConfidence.toFixed(0)}%` : "No score"}</strong>
      </div>
      <div class="meter">
        <div class="meter-fill" style="width: ${Math.max(8, Math.min(safeConfidence, 100))}%; background: ${confidenceColor(safeConfidence)};"></div>
      </div>
    </div>
  `;
}

function pickCardMarkup(pick, featured = false) {
  const edgeText = pick.edge != null ? `${pick.edge > 0 ? "+" : ""}${pick.edge.toFixed(1)}% edge` : "Edge pending";
  const impliedText = pick.impliedProbability != null ? `${pick.impliedProbability.toFixed(1)}% implied` : "Implied N/A";
  const klass = featured ? "featured-card" : "pick-card";

  return `
    <article class="${klass}">
      ${featured ? "" : `<div class="pick-rank">${pick.rank}</div>`}
      <div class="pick-topline">
        <span class="type-chip">${pick.marketTypeLabel}</span>
        <span class="book-chip">${pick.sportsbook_name || "Book not shown"}</span>
        <span class="odds-chip">${pick.displayOdds}</span>
      </div>
      <div class="matchup">${pick.matchup || "Matchup TBD"}</div>
      <div class="pick-text">${pick.selection || "Selection unavailable"}</div>
      ${meterMarkup(pick.confidence)}
      <div class="pick-meta-grid">
        <span class="metric-pill ${pick.edge != null && pick.edge > 0 ? "positive" : ""}">${edgeText}</span>
        <span class="metric-pill">${impliedText}</span>
        <span class="metric-pill">Sydney ${pick.displayTimestamp}</span>
      </div>
      <p class="subtext">${pick.reason}</p>
      <div class="edge-strip" style="width: ${Math.max(20, Math.min((pick.edge ?? 0) * 6, 100))}%; background: ${edgeColor(pick.edge)};"></div>
    </article>
  `;
}

function renderFeatured(picks) {
  nodes.featuredPick.innerHTML = picks.length ? pickCardMarkup(picks[0], true) : "";
}

function renderPickStack(picks) {
  nodes.pickStack.innerHTML = picks.slice(0, 6).map((pick) => pickCardMarkup(pick)).join("");
}

function renderValueChart(picks) {
  const top = picks.slice(0, 6);
  const maxEdge = Math.max(...top.map((pick) => Math.max(pick.edge ?? 0, 1)));
  nodes.valueChart.innerHTML = top.map((pick) => `
    <div class="value-row">
      <div class="value-label">
        <div class="value-title">${pick.selection || "Selection unavailable"}</div>
        <div class="value-subtitle">${pick.matchup || "Matchup TBD"} · ${pick.sportsbook_name || "Book not shown"}</div>
      </div>
      <div class="value-bar">
        <div class="value-fill" style="width: ${Math.max(8, ((pick.edge ?? 0) / maxEdge) * 100)}%; background: ${edgeColor(pick.edge)};"></div>
      </div>
      <div class="value-number">${pick.edge != null ? `${pick.edge > 0 ? "+" : ""}${pick.edge.toFixed(1)}%` : "N/A"}</div>
    </div>
  `).join("");
}

function renderDistribution(picks) {
  const counts = BET_TYPE_ORDER.map((type) => ({
    type,
    count: picks.filter((pick) => pick.betType === type).length,
  })).filter((entry) => entry.count > 0);
  const max = Math.max(...counts.map((entry) => entry.count));
  nodes.distributionChart.innerHTML = counts.map((entry) => `
    <div class="dist-row">
      <div class="dist-label-line">
        <span>${labelForMarketType(entry.type)}</span>
        <strong>${entry.count}</strong>
      </div>
      <div class="dist-bar">
        <div class="dist-fill" style="width: ${(entry.count / max) * 100}%; background: linear-gradient(90deg, ${BET_TYPE_COLORS[entry.type] || BET_TYPE_COLORS.other}, #cbd5e1);"></div>
      </div>
    </div>
  `).join("");
}

function renderHeatmap(picks) {
  const matchups = [...new Set(picks.map((pick) => pick.matchup).filter(Boolean))].slice(0, 6);
  const columns = BET_TYPE_ORDER;
  const maxCount = Math.max(1, ...matchups.flatMap((matchup) =>
    columns.map((type) => picks.filter((pick) => pick.matchup === matchup && pick.betType === type).length)
  ));

  const cells = ['<div class="heatmap-grid">', '<div class="heatmap-cell label">Matchup</div>'];
  for (const column of columns) {
    cells.push(`<div class="heatmap-cell label">${labelForMarketType(column)}</div>`);
  }
  for (const matchup of matchups) {
    cells.push(`<div class="heatmap-cell label">${matchup}</div>`);
    for (const type of columns) {
      const count = picks.filter((pick) => pick.matchup === matchup && pick.betType === type).length;
      const intensity = count / maxCount;
      const background = count ? `rgba(20, 184, 166, ${0.18 + intensity * 0.55})` : "rgba(226, 232, 240, 0.45)";
      cells.push(`<div class="heatmap-cell" style="background: ${background};">${count ? count : "—"}</div>`);
    }
  }
  cells.push("</div>");
  nodes.heatmap.innerHTML = cells.join("");
}

function renderTable(picks) {
  nodes.tableBody.innerHTML = picks.map((pick) => `
    <tr>
      <td>${pick.matchup || "TBD"}</td>
      <td>${pick.selection || "Unavailable"}</td>
      <td><span class="table-pill">${pick.marketTypeLabel}</span></td>
      <td>${pick.displayOdds}</td>
      <td>${pick.sportsbook_name || "Book not shown"}</td>
      <td><span class="table-pill" style="background: ${confidenceColor(pick.confidence)}22; color: ${confidenceColor(pick.confidence)};">${pick.confidence != null ? `${pick.confidence.toFixed(0)}%` : "N/A"}</span></td>
      <td><span class="table-pill" style="background: ${edgeColor(pick.edge)}22; color: ${edgeColor(pick.edge)};">${pick.edge != null ? `${pick.edge > 0 ? "+" : ""}${pick.edge.toFixed(1)}%` : "N/A"}</span></td>
      <td>${pick.displayTimestamp}</td>
    </tr>
  `).join("");
}

function renderControls() {
  const betTypes = ["All", ...BET_TYPE_ORDER.filter((type) => state.picks.some((pick) => pick.betType === type))];
  const books = [
    "All",
    ...(state.auConfig?.sportsbooks || [])
      .filter((book) => state.picks.some((pick) => pick.sportsbook_id === book.id))
      .map((book) => book.id),
  ];

  renderChips(nodes.betTypeFilters, betTypes, state.betType, (value) => {
    state.betType = value;
    render();
  });
  renderChips(nodes.sportsbookFilters, books, state.sportsbook, (value) => {
    state.sportsbook = value;
    render();
  }, (value) => {
    const book = (state.auConfig?.sportsbooks || []).find((entry) => entry.id === value);
    return book ? book.name : value;
  });
}

function renderApprovedData() {
  nodes.approvedNoData.hidden = true;
  nodes.summaryStrip.hidden = false;
  nodes.controlRow.hidden = false;
  nodes.mainGrid.hidden = false;
  nodes.tablePanel.hidden = !state.showTable;
  nodes.sourceChip.textContent = "Approved source only";
  nodes.runStatusChip.textContent = `${state.picks.length} NBA picks from approved source`;
  nodes.sourceAttribution.textContent = `Source: ${state.sourcePolicy.approved_source_url}`;

  renderControls();
  const filtered = sortPicks(getFilteredPicks());
  renderSummary(filtered);
  renderFeatured(filtered);
  renderPickStack(filtered);
  renderValueChart(filtered);
  renderDistribution(filtered);
  renderHeatmap(filtered);
  renderTable(filtered);
  nodes.listToggle.textContent = state.showTable ? "Hide table" : "Show table";
}

function render() {
  if (!state.picks.length) {
    renderNoDataState();
    return;
  }
  renderApprovedData();
}

nodes.listToggle.addEventListener("click", () => {
  state.showTable = !state.showTable;
  if (state.picks.length) renderApprovedData();
});

async function init() {
  const dataset = await loadDataset();
  state.sourceLabel = dataset.sourceLabel;
  state.runSummary = dataset.runSummary;
  state.auConfig = dataset.auConfig;
  state.sourcePolicy = dataset.sourcePolicy;
  const approvedItems = dataset.items.filter(validateApprovedRecord).map(enrichItem);
  state.picks = sortPicks(approvedItems);
  render();
}

init().catch((error) => {
  nodes.sourceChip.textContent = "Approved source only";
  nodes.runStatusChip.textContent = error.message;
  nodes.approvedNoData.hidden = false;
  nodes.summaryStrip.hidden = true;
  nodes.controlRow.hidden = true;
  nodes.mainGrid.hidden = true;
  nodes.tablePanel.hidden = true;
});
