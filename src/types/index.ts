// Investment Types
export type InvestmentStrategy = 'short' | 'middle' | 'long';
export type SignalType = 'BUY' | 'SELL' | 'HOLD';
export type RiskLevel = 'low' | 'medium' | 'high';
export type AIProvider = 'claude' | 'openai' | 'gemini';
export type ClaudeModel = 'claude-sonnet-4-5-20250929' | 'claude-opus-4-6' | 'claude-haiku-4-5-20251001';
export type OpenAIModel = 'gpt-5.2' | 'gpt-5-mini' | 'gpt-4o';
export type GeminiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro';

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
  aiProvider: AIProvider;
  claudeModel: ClaudeModel;
  openaiModel: OpenAIModel;
  geminiModel: GeminiModel;
  customPrompt: string; // Persönliche Anweisungen für die KI
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
  activeOrders?: Order[]; // Aktive Orders für KI-Bewertung
  customPrompt?: string; // Persönliche Anweisungen
  // Erweiterte Kontext-Daten
  initialCapital?: number; // Startkapital
  totalAssets?: number; // Gesamtvermögen (Cash + Portfolio)
  portfolioValue?: number; // Aktueller Portfolio-Wert
  totalProfit?: number; // Gesamtgewinn (realisiert + unrealisiert)
  totalProfitPercent?: number; // Gesamtgewinn in %
  transactionFeeFlat?: number; // Fixe Transaktionsgebühr
  transactionFeePercent?: number; // Prozentuale Transaktionsgebühr
  previousProfit?: number; // Gewinne/Verluste aus früheren Portfolios
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
  triggerPrice: number;       // Preis bei dem die Order ausgelöst wird
  currentPrice: number;       // Letzter bekannter Preis
  status: OrderStatus;
  createdAt: Date;
  executedAt?: Date;
  executedPrice?: number;     // Tatsächlicher Ausführungspreis
  expiresAt?: Date;           // Optionales Ablaufdatum
  note?: string;              // Optionale Notiz
}

export interface OrderSettings {
  autoExecute: boolean;       // Automatische Ausführung aktiviert
  checkIntervalSeconds: number; // Prüfintervall in Sekunden
  transactionFeeFlat: number;   // Fixe Gebühr pro Trade in EUR
  transactionFeePercent: number; // Prozentuale Gebühr pro Trade (z.B. 0.25 = 0,25%)
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
  intervalMinutes: number;        // z.B. 60, 240, 1440
  activeHoursOnly: boolean;       // Nur Börsenzeiten (Mo-Fr 9:30-16:00 EST)
  
  // Risikolimits
  maxTradesPerCycle: number;      // Max Orders pro Durchlauf
  maxPositionPercent: number;     // Max % des Portfolios pro Einzelposition
  minCashReservePercent: number;  // Min. Cash-Puffer
  minConfidence: number;          // Min. KI-Konfidenz (0-100)
  
  // Scope
  allowBuy: boolean;
  allowSell: boolean;
  allowNewPositions: boolean;     // Darf neue Aktien kaufen?
  watchlistOnly: boolean;         // Nur Watchlist-Aktien handeln?
}

export type AutopilotLogType = 'info' | 'analysis' | 'order-created' | 'order-executed' | 'warning' | 'error' | 'skipped';

export interface AutopilotLogEntry {
  id: string;
  timestamp: string;  // ISO string
  type: AutopilotLogType;
  message: string;
  details?: string;    // Längerer Text (z.B. KI-Begründung)
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

