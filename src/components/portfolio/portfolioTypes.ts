export interface SymbolSuggestion {
  symbol: string;
  name: string;
  price?: number;
  changePercent?: number;
  loading?: boolean;
}

export type PortfolioChartRange = '1d' | '5d' | '1mo' | '1y';

export interface PortfolioHistoryPoint {
  timestamp: number;
  label: string;
  value: number;
  changePercent: number;
}

export const PORTFOLIO_CHART_RANGES: PortfolioChartRange[] = ['1d', '5d', '1mo', '1y'];
export const HISTORY_CACHE_TTL_MS = 10 * 60 * 1000;
