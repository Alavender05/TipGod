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

export type CanonicalMarketType =
  | 'moneyline'
  | 'spread'
  | 'game_total'
  | 'first_half_spread'
  | 'first_half_total'
  | 'second_half_spread'
  | 'second_half_total'
  | 'player_points'
  | 'player_rebounds'
  | 'player_assists'
  | 'player_blocks'
  | 'player_free_throws';

export type MarketFamily =
  | 'game_side'
  | 'game_total'
  | 'player_prop'
  | 'same_game_parlay_leg'
  | 'prebuilt_parlay';

export type PeriodScope = 'full_game' | 'first_half' | 'second_half';

export type SelectionKey =
  | 'home'
  | 'away'
  | 'over'
  | 'under'
  | 'alt_over'
  | 'alt_under'
  | 'yes'
  | 'no'
  | string;

export interface BookmakerConfig {
  readonly id: string;
  readonly slug: ApprovedBookmaker;
  readonly name: string;
  readonly region: 'AU';
  readonly odds_format: 'decimal';
  readonly currency: 'AUD';
  readonly timezone: 'Australia/Sydney';
  readonly base_url: string;
  readonly nba_path: string;
  readonly market_aliases: Readonly<Record<CanonicalMarketType, readonly string[]>>;
}

export interface MoneylineBookmakerPolicy {
  readonly description: string;
  readonly league_id: 'NBA';
  readonly market_canonical: 'multi-market';
  readonly odds_format: 'decimal';
  readonly currency: 'AUD';
  readonly timezone: 'Australia/Sydney';
  readonly bookmakers: readonly BookmakerConfig[];
}

export interface BookmakerMarketQuote {
  readonly bookmaker: ApprovedBookmaker;
  readonly bookmaker_name: string;
  readonly matchup: string | null;
  readonly home_team: string | null;
  readonly away_team: string | null;
  readonly market_type: CanonicalMarketType;
  readonly market_family: MarketFamily;
  readonly period: PeriodScope;
  readonly market_key: string;
  readonly selection_key: SelectionKey;
  readonly selection_label: string | null;
  readonly player_name: string | null;
  readonly line: number | null;
  readonly market_name: string;
  readonly odds: number | null;
  readonly retrieved_at: string | null;
  readonly is_available: boolean;
}

export interface BestAvailableSelection {
  readonly odds: number | null;
  readonly bookmaker: ApprovedBookmaker | null;
  readonly bookmaker_name: string | null;
  readonly selection_key: SelectionKey | null;
  readonly selection_label: string | null;
}

export interface ItemMarketMatch {
  readonly matchup: string | null;
  readonly home_team: string | null;
  readonly away_team: string | null;
  readonly market_type: CanonicalMarketType;
  readonly market_family: MarketFamily;
  readonly period: PeriodScope;
  readonly market_key: string;
  readonly selection_key: SelectionKey;
  readonly selection_label: string | null;
  readonly player_name: string | null;
  readonly line: number | null;
  readonly quotes: Readonly<Record<ApprovedBookmaker, BookmakerMarketQuote>>;
  readonly best_available: BestAvailableSelection;
}

export interface GameMarketBundle {
  readonly matchup: string;
  readonly home_team: string;
  readonly away_team: string;
  readonly markets: readonly ItemMarketMatch[];
}

export interface PlayerMarketBundle {
  readonly matchup: string;
  readonly player_name: string;
  readonly markets: readonly ItemMarketMatch[];
}

export interface ItemMarketLookup {
  readonly matchup: string | null;
  readonly home_team: string | null;
  readonly away_team: string | null;
  readonly market_type: CanonicalMarketType | null;
  readonly market_family: MarketFamily | null;
  readonly period: PeriodScope;
  readonly market_key: string | null;
  readonly selection_key: SelectionKey | null;
  readonly selection_label: string | null;
  readonly player_name: string | null;
  readonly line: number | null;
  readonly team_context: string | null;
}

export interface BookmakerEnrichment {
  readonly lookup: ItemMarketLookup;
  readonly matched_market: ItemMarketMatch | null;
  readonly game_bundle: GameMarketBundle | null;
  readonly player_bundle: PlayerMarketBundle | null;
  readonly enriched_at: string;
}

export interface BookmakerMoneylineQuote {
  readonly bookmaker: ApprovedBookmaker;
  readonly bookmaker_name: string;
  readonly home_odds: number | null;
  readonly away_odds: number | null;
  readonly market_name: string;
  readonly retrieved_at: string | null;
  readonly is_available: boolean;
}

export interface BestAvailableMoneyline {
  readonly home_best_odds: number | null;
  readonly home_best_bookmaker: ApprovedBookmaker | null;
  readonly away_best_odds: number | null;
  readonly away_best_bookmaker: ApprovedBookmaker | null;
}

export interface MoneylineEnrichment {
  readonly matchup: string;
  readonly home_team: string;
  readonly away_team: string;
  readonly quotes: Readonly<Record<ApprovedBookmaker, BookmakerMoneylineQuote>>;
  readonly best_available: BestAvailableMoneyline;
  readonly enriched_at: string;
}

export interface BookmakerCoverageStats {
  readonly surface_id: string;
  readonly total_items: number;
  readonly enrichable_items: number;
  readonly enriched_items: number;
  readonly books_with_coverage: readonly ApprovedBookmaker[];
  readonly coverage_pct: number;
  readonly market_type_counts?: Readonly<Record<string, number>>;
}

export type MoneylineCoverageStats = BookmakerCoverageStats;

export interface NBAItemMetric {
  readonly key: string;
  readonly label: string;
  readonly value: string | null;
  readonly value_numeric: number | null;
}

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

export interface EnrichedNBAItem extends NBANormalizedItem {
  readonly bookmaker_enrichment: BookmakerEnrichment | null;
  readonly moneyline_enrichment?: MoneylineEnrichment | null;
}

export interface EnrichedNBASurface {
  readonly id: string;
  readonly label: string;
  readonly source_url: string;
  readonly scan_summary: Readonly<Record<string, unknown>> | null;
  readonly items: readonly EnrichedNBAItem[];
  readonly bookmaker_coverage: BookmakerCoverageStats;
  readonly moneyline_coverage?: MoneylineCoverageStats;
}

export interface EnrichedNBADataset {
  readonly generated_at: string;
  readonly enriched_at: string;
  readonly source_domain: 'capping.pro';
  readonly league_id: 'NBA';
  readonly sport: 'Basketball';
  readonly approved_bookmakers: readonly ApprovedBookmaker[];
  readonly surfaces: readonly EnrichedNBASurface[];
}
