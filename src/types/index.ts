// Investment Types
export type InvestmentStrategy = 'short' | 'middle';
export type SignalType = 'BUY' | 'SELL' | 'HOLD';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  exchange: string;
  // 52-Wochen-Daten (optional, für erweiterte Analyse)
  week52High?: number;
  week52Low?: number;
  week52ChangePercent?: number;  // Wo steht der Preis im 52-Wochen-Bereich (0-100%)
}

export interface InvestmentSignal {
  id: string;
  stock: Stock;
  signal: SignalType;
  strategy: InvestmentStrategy;
  confidence: number; // 0-100
  reasoning: string;
  idealEntryPrice?: number;  // Empfohlener Einstiegspreis
  targetPrice?: number;
  stopLoss?: number;
  createdAt: Date;
  riskLevel: RiskLevel;
}

export interface Portfolio {
  id: string;
  name: string;
  budget: number;
  remainingBudget: number;
  strategy: InvestmentStrategy;
  positions: Position[];
  createdAt: Date;
}

export interface Position {
  id: string;
  stock: Stock;
  quantity: number;
  averageBuyPrice: number;
  currentPrice: number;
  profitLoss: number;
  profitLossPercent: number;
  boughtAt: Date;
}

// Simplified position for user input
export interface UserPosition {
  id: string;
  symbol: string;
  isin?: string;  // International Securities Identification Number
  name: string;
  quantity: number;
  buyPrice: number;
  currentPrice: number;
  currency: string;
  useYahooPrice?: boolean;  // Auto-update price from Yahoo Finance
}

export interface UserSettings {
  budget: number;
  strategy: InvestmentStrategy;
  riskTolerance: RiskLevel;
  watchlist: string[];
  notifications: NotificationSettings;
  apiKeys: APIKeys;
}

export interface NotificationSettings {
  email: {
    enabled: boolean;
    address: string;
    serviceId: string;
    templateId: string;
    publicKey: string;
  };
  telegram: {
    enabled: boolean;
    chatId: string;
    botToken: string;
  };
}

export interface APIKeys {
  claude: string;
  marketData: string;
}

// Market Data Types
export interface MarketQuote {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  regularMarketOpen: number;
  regularMarketPreviousClose: number;
  currency: string;
  shortName: string;
  longName: string;
}

export interface HistoricalData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// AI Analysis Types
export interface AIAnalysisRequest {
  stocks: Stock[];
  strategy: InvestmentStrategy;
  riskTolerance: RiskLevel;
  budget: number;
  currentPositions?: Position[];
}

export interface AIAnalysisResponse {
  signals: InvestmentSignal[];
  marketSummary: string;
  recommendations: string[];
  warnings: string[];
  analyzedAt: Date;
}
