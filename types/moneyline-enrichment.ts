// ─── Bookmaker identity ─────────────────────────────────────────────────────

/** The four AU bookmakers approved for NBA moneyline enrichment. */
export type ApprovedBookmaker =
  | 'ladbrokes'
  | 'sportsbet'
  | 'pointsbet'
  | 'bet365';

export const APPROVED_BOOKMAKERS: readonly ApprovedBookmaker[] = [
  'ladbrokes',
  'sportsbet',
  'pointsbet',
  'bet365',
] as const;

// ─── Config shapes (mirrors config/moneyline_bookmakers.json) ───────────────

/** One entry in the moneyline_bookmakers.json bookmakers array. */
export interface BookmakerConfig {
  readonly id: string;
  readonly slug: ApprovedBookmaker;
  readonly name: string;
  readonly region: 'AU';
  readonly odds_format: 'decimal';
  readonly currency: 'AUD';
  readonly timezone: 'Australia/Sydney';
  /** Bookmaker-native market tab label for NBA head-to-head, e.g. "Head To Head" */
  readonly moneyline_market_name: string;
  readonly base_url: string;
  readonly nba_path: string;
}

/** Shape of config/moneyline_bookmakers.json. */
export interface MoneylineBookmakerPolicy {
  readonly description: string;
  readonly league_id: 'NBA';
  readonly market_canonical: 'head-to-head';
  readonly odds_format: 'decimal';
  readonly currency: 'AUD';
  readonly timezone: 'Australia/Sydney';
  readonly bookmakers: readonly BookmakerConfig[];
}

// ─── Per-item enrichment primitives ────────────────────────────────────────

/**
 * One bookmaker's head-to-head prices for a single NBA matchup.
 * is_available: false means the book has no line yet for this game.
 */
export interface BookmakerMoneylineQuote {
  readonly bookmaker: ApprovedBookmaker;
  readonly bookmaker_name: string;
  readonly home_odds: number | null;
  readonly away_odds: number | null;
  /** Bookmaker-native label for the market, e.g. "Head To Head", "Match Betting" */
  readonly market_name: string;
  readonly retrieved_at: string | null;
  readonly is_available: boolean;
}

/** Best available head-to-head price across the four approved books. */
export interface BestAvailableMoneyline {
  readonly home_best_odds: number | null;
  readonly home_best_bookmaker: ApprovedBookmaker | null;
  readonly away_best_odds: number | null;
  readonly away_best_bookmaker: ApprovedBookmaker | null;
}

/**
 * Full enrichment block for one NBA matchup.
 * quotes is a keyed Record so every approved book always has a defined slot;
 * is_available: false handles the "not yet offered" case without optional keys.
 */
export interface MoneylineEnrichment {
  readonly matchup: string;
  readonly home_team: string;
  readonly away_team: string;
  readonly quotes: Readonly<Record<ApprovedBookmaker, BookmakerMoneylineQuote>>;
  readonly best_available: BestAvailableMoneyline;
  readonly enriched_at: string;
}

// ─── Coverage stats ─────────────────────────────────────────────────────────

/** Enrichment coverage breakdown for one surface. */
export interface MoneylineCoverageStats {
  readonly surface_id: string;
  readonly total_items: number;
  /** Items that carry a resolvable matchup field. */
  readonly enrichable_items: number;
  /** Items where at least one bookmaker quote was found. */
  readonly enriched_items: number;
  readonly books_with_coverage: readonly ApprovedBookmaker[];
  /** 0–100, computed as Math.round((enriched_items / enrichable_items) * 100) */
  readonly coverage_pct: number;
}

// ─── Typed versions of the existing normalized item contract ────────────────

/** Typed version of the metrics[] entry produced by makeItem() in the scanner. */
export interface NBAItemMetric {
  readonly key: string;
  readonly label: string;
  readonly value: string | null;
  readonly value_numeric: number | null;
}

/**
 * Typed version of the normalized item produced by scan-capping-pro-nba-surfaces.js.
 * league_id is narrowed to the literal 'NBA' to prevent cross-league misuse.
 * All string fields are nullable to match the JS scanner's optional extraction.
 */
export interface NBANormalizedItem {
  readonly surface: string;
  readonly source_url: string;
  readonly league_id: 'NBA';
  readonly sport: 'Basketball';
  readonly item_id: string;
  readonly title: string | null;
  readonly subtitle: string | null;
  readonly matchup: string | null;
  readonly selection: string | null;
  readonly market_type: string | null;
  readonly team: string | null;
  readonly player_name: string | null;
  readonly sportsbook_name: string | null;
  readonly odds_decimal: number | null;
  readonly updated_at: string | null;
  readonly reason: string | null;
  readonly detail_notes: readonly string[];
  readonly metrics: readonly NBAItemMetric[];
  readonly tags: readonly string[];
  readonly raw_context: Readonly<Record<string, unknown>>;
}

// ─── Enriched shapes ────────────────────────────────────────────────────────

/** NBANormalizedItem with the moneyline enrichment block appended. */
export interface EnrichedNBAItem extends NBANormalizedItem {
  readonly moneyline_enrichment: MoneylineEnrichment | null;
}

/** Surface object after enrichment (parallel to the existing surface shape). */
export interface EnrichedNBASurface {
  readonly id: string;
  readonly label: string;
  readonly source_url: string;
  readonly scan_summary: Readonly<Record<string, unknown>> | null;
  readonly items: readonly EnrichedNBAItem[];
  readonly moneyline_coverage: MoneylineCoverageStats;
}

/** Top-level enriched dataset (parallel to capping-pro-nba-surfaces.json shape). */
export interface EnrichedNBADataset {
  readonly generated_at: string;
  readonly enriched_at: string;
  readonly source_domain: 'capping.pro';
  readonly league_id: 'NBA';
  readonly sport: 'Basketball';
  readonly approved_bookmakers: readonly ApprovedBookmaker[];
  readonly surfaces: readonly EnrichedNBASurface[];
}
