import type { TechnicalIndicators } from '../utils/technicalIndicators';

// Investment Types
export type InvestmentStrategy = 'short' | 'middle' | 'long';
export type SignalType = 'BUY' | 'SELL' | 'HOLD';
export type RiskLevel = 'low' | 'medium' | 'high';
export type AIProvider = 'claude' | 'openai' | 'gemini';
export type AILanguage = 'en' | 'de' | 'fr';
export type ClaudeModel = 'claude-opus-4-6' | 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001';
export type OpenAIModel = 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5.4-nano';
export type GeminiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite';

export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  exchange: string;
  // Flag: Preis stammt aus Demo/Fallback-Daten (nicht aus echtem API-Call)
  isFallback?: boolean;
  // 52-week data (optional, for advanced analysis)
  week52High?: number;
  week52Low?: number;
  week52ChangePercent?: number;  // Where is the price in the 52-week range (0-100%)
  // Technische Indikatoren (RSI, MACD, SMA, Bollinger etc.)
  technicalIndicators?: TechnicalIndicators;
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
  aiProvider: AIProvider;
  claudeModel: ClaudeModel;
  openaiModel: OpenAIModel;
  geminiModel: GeminiModel;
  customPrompt: string; // Personal instructions for the AI
  aiLanguage: AILanguage; // Language for AI analysis output
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
  openai: string;
  gemini: string;
  marketData: string;
  alpacaKeyId: string;
  alpacaKeySecret: string;
}

export interface AlpacaSettings {
  enabled: boolean;
  paper: boolean; // true = paper trading, false = live (reserved for future)
}

// Price Alert Types
export type AlertCondition = 'above' | 'below';

export interface PriceAlert {
  id: string;
  symbol: string;
  name: string;
  targetPrice: number;
  condition: AlertCondition;
  currentPrice: number;
  createdAt: Date;
  triggered: boolean;
  triggeredAt?: Date;
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
  previousSignals?: InvestmentSignal[]; // Last signals for AI memory
  activeOrders?: Order[]; // Active orders for AI evaluation
  customPrompt?: string; // Personal instructions
  // Erweiterte Kontext-Daten
  initialCapital?: number; // Startkapital
  totalAssets?: number; // Total assets (cash + portfolio)
  portfolioValue?: number; // Aktueller Portfolio-Wert
  totalProfit?: number; // Total profit (realized + unrealized)
  totalProfitPercent?: number; // Total profit in %
  transactionFeeFlat?: number; // Flat transaction fee
  transactionFeePercent?: number; // Percentage transaction fee
  previousProfit?: number; // Profits/losses from earlier portfolios
  aiLanguage?: AILanguage; // Language for AI analysis output
}

export interface AISuggestedOrder {
  symbol: string;
  orderType: OrderType;
  quantity: number;
  triggerPrice: number;
  reasoning: string;
}

export interface AIAnalysisResponse {
  signals: InvestmentSignal[];
  marketSummary: string;
  recommendations: string[];
  warnings: string[];
  suggestedOrders: AISuggestedOrder[];
  analyzedAt: Date;
}

// Order Types
export type OrderType = 'limit-buy' | 'limit-sell' | 'stop-loss' | 'stop-buy';
export type OrderStatus = 'active' | 'pending' | 'executed' | 'cancelled' | 'expired';

export interface Order {
  id: string;
  symbol: string;
  name: string;
  orderType: OrderType;
  quantity: number;
  triggerPrice: number;       // Price at which the order is triggered
  currentPrice: number;       // Letzter bekannter Preis
  status: OrderStatus;
  createdAt: Date;
  executedAt?: Date;
  executedPrice?: number;     // Actual execution price
  expiresAt?: Date;           // Optionales Ablaufdatum
  note?: string;              // Optionale Notiz
}

export interface OrderSettings {
  autoExecute: boolean;       // Auto-execution enabled
  checkIntervalSeconds: number; // Check interval in seconds
  transactionFeeFlat: number;   // Flat fee per trade in EUR
  transactionFeePercent: number; // Percentage fee per trade (e.g. 0.25 = 0.25%)
}

// Analysis History for AI Memory
export interface PortfolioSnapshot {
  positions: { symbol: string; name: string; quantity: number; buyPrice: number; currentPrice: number }[];
  cashBalance: number;
  totalValue: number;
}

export interface AnalysisHistoryEntry {
  id: string;
  date: string; // ISO string
  analysisText: string; // The full AI response (truncated for context)
  portfolioSnapshot: PortfolioSnapshot;
  watchlistSymbols: string[];
  strategy: InvestmentStrategy;
  aiProvider: AIProvider;
}

// Autopilot Types
export type AutopilotMode = 'full-auto' | 'suggest-only' | 'confirm-each';

export interface AutopilotSettings {
  enabled: boolean;
  mode: AutopilotMode;
  
  // Timing
  intervalMinutes: number;        // e.g. 60, 240, 1440
  activeHoursOnly: boolean;       // Market hours only (Mon-Fri 9:30-16:00 EST)
  
  // Risikolimits
  maxTradesPerCycle: number;      // Max Orders pro Durchlauf
  maxPositionPercent: number;     // Max % des Portfolios pro Einzelposition
  minCashReservePercent: number;  // Min. cash buffer
  minConfidence: number;          // Min. AI confidence (0-100)
  
  // Scope
  allowBuy: boolean;
  allowSell: boolean;
  allowNewPositions: boolean;     // Can buy new stocks?
  watchlistOnly: boolean;         // Only trade watchlist stocks?
}

export type AutopilotLogType = 'info' | 'analysis' | 'order-created' | 'order-executed' | 'warning' | 'error' | 'skipped';

export interface AutopilotLogEntry {
  id: string;
  timestamp: string;  // ISO string
  type: AutopilotLogType;
  message: string;
  details?: string;    // Longer text (e.g. AI reasoning)
  symbol?: string;
  orderId?: string;
}

export interface AutopilotState {
  isRunning: boolean;
  lastRunAt: string | null;      // ISO string
  nextRunAt: string | null;      // ISO string
  cycleCount: number;
  totalOrdersCreated: number;
  totalOrdersExecuted: number;
}

// Tax Types (Luxembourg)
export interface TaxTransaction {
  id: string;
  symbol: string;
  name: string;
  transactionType?: 'capital-gain' | 'dividend' | 'interest'; // Transaktionsart (Standard: capital-gain)
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  buyDate: string;       // ISO string
  sellDate: string;      // ISO string
  gainLoss: number;      // Gain/loss in EUR (for dividends/interest: amount received)
  fees: number;          // Transaction fees
  holdingDays: number;   // Holding period in days
  taxFree: boolean;      // true if holding period >= 6 months
  withholdingTax?: number; // Withholding tax (already withheld by broker, e.g. for dividends)
}

// Trade History (direct portfolio purchases/sales)
export type TradeType = 'buy' | 'sell';

export interface TradeHistoryEntry {
  id: string;
  type: TradeType;
  symbol: string;
  name: string;
  quantity: number;
  price: number;          // Purchase/sale price per unit
  totalAmount: number;    // Total value (price × quantity)
  fees: number;           // Transaction fees
  date: string;           // ISO string
  source: 'manual' | 'order';  // Source: manual (portfolio) or order execution
}

