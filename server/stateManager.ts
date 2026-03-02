/**
 * Server State Manager
 * Verwaltet den App-State als JSON-Datei statt localStorage.
 * Beide Seiten (Server + Frontend) teilen dasselbe Datenformat.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, 'data', 'state.json');
const LOCK_FILE = STATE_FILE + '.lock';

// Ensure data directory exists
const dataDir = path.dirname(STATE_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export interface ServerState {
  settings: {
    budget: number;
    strategy: string;
    riskTolerance: string;
    watchlist: string[];
    notifications: any;
    apiKeys: {
      claude: string;
      openai: string;
      gemini: string;
      marketData: string;
    };
    aiProvider: string;
    claudeModel: string;
    openaiModel: string;
    geminiModel: string;
    customPrompt: string;
  };
  userPositions: Array<{
    id: string;
    symbol: string;
    isin?: string;
    name: string;
    quantity: number;
    buyPrice: number;
    currentPrice: number;
    currency: string;
    useYahooPrice?: boolean;
  }>;
  cashBalance: number;
  initialCapital: number;
  previousProfit: number;
  watchlist: Array<{
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    currency: string;
    exchange: string;
    isFallback?: boolean;
    week52High?: number;
    week52Low?: number;
    week52ChangePercent?: number;
    technicalIndicators?: any;
  }>;
  signals: any[];
  orders: Array<{
    id: string;
    symbol: string;
    name: string;
    orderType: string;
    quantity: number;
    triggerPrice: number;
    currentPrice: number;
    status: string;
    createdAt: string;
    executedAt?: string;
    executedPrice?: number;
    expiresAt?: string;
    note?: string;
  }>;
  orderSettings: {
    autoExecute: boolean;
    checkIntervalSeconds: number;
    transactionFeeFlat: number;
    transactionFeePercent: number;
  };
  autopilotSettings: {
    enabled: boolean;
    mode: string;
    intervalMinutes: number;
    activeHoursOnly: boolean;
    maxTradesPerCycle: number;
    maxPositionPercent: number;
    minCashReservePercent: number;
    minConfidence: number;
    allowBuy: boolean;
    allowSell: boolean;
    allowNewPositions: boolean;
    watchlistOnly: boolean;
  };
  autopilotLog: Array<{
    id: string;
    timestamp: string;
    type: string;
    message: string;
    details?: string;
    symbol?: string;
    orderId?: string;
  }>;
  autopilotState: {
    isRunning: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
    cycleCount: number;
    totalOrdersCreated: number;
    totalOrdersExecuted: number;
  };
  lastAnalysis: string | null;
  lastAnalysisDate: string | null;
  analysisHistory: any[];
  portfolios: any[];
  activePortfolioId: string | null;
  priceAlerts: any[];
}

const DEFAULT_STATE: ServerState = {
  settings: {
    budget: 1000,
    strategy: 'middle',
    riskTolerance: 'medium',
    watchlist: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'],
    notifications: { email: { enabled: false }, telegram: { enabled: false } },
    apiKeys: { claude: '', openai: '', gemini: '', marketData: '' },
    aiProvider: 'gemini',
    claudeModel: 'claude-opus-4-6',
    openaiModel: 'gpt-5.2',
    geminiModel: 'gemini-2.5-flash',
    customPrompt: '',
  },
  userPositions: [],
  cashBalance: 0,
  initialCapital: 0,
  previousProfit: 0,
  watchlist: [],
  signals: [],
  orders: [],
  orderSettings: { autoExecute: false, checkIntervalSeconds: 30, transactionFeeFlat: 0, transactionFeePercent: 0 },
  autopilotSettings: {
    enabled: false,
    mode: 'suggest-only',
    intervalMinutes: 240,
    activeHoursOnly: true,
    maxTradesPerCycle: 3,
    maxPositionPercent: 20,
    minCashReservePercent: 10,
    minConfidence: 70,
    allowBuy: true,
    allowSell: true,
    allowNewPositions: false,
    watchlistOnly: true,
  },
  autopilotLog: [],
  autopilotState: {
    isRunning: false,
    lastRunAt: null,
    nextRunAt: null,
    cycleCount: 0,
    totalOrdersCreated: 0,
    totalOrdersExecuted: 0,
  },
  lastAnalysis: null,
  lastAnalysisDate: null,
  analysisHistory: [],
  portfolios: [],
  activePortfolioId: null,
  priceAlerts: [],
};

let cachedState: ServerState | null = null;
let lastReadTime = 0;
const CACHE_TTL = 1000; // Re-read file at most every 1s

/**
 * State aus Datei laden (mit Cache)
 */
export function loadState(): ServerState {
  const now = Date.now();
  if (cachedState && (now - lastReadTime) < CACHE_TTL) {
    return cachedState;
  }

  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      // Merge with defaults to ensure all fields exist
      cachedState = deepMerge(DEFAULT_STATE, parsed.state ?? parsed) as ServerState;
      lastReadTime = now;
      return cachedState;
    }
  } catch (err) {
    console.error('[StateManager] Fehler beim Laden:', err);
  }

  cachedState = { ...DEFAULT_STATE };
  lastReadTime = now;
  return cachedState;
}

/**
 * State in Datei speichern (atomar mit temp-file + rename)
 */
export function saveState(state: ServerState): void {
  try {
    const data = JSON.stringify({ 
      version: '1.0.0',
      lastModified: new Date().toISOString(),
      source: 'server',
      state 
    }, null, 2);
    
    const tmpFile = STATE_FILE + '.tmp';
    fs.writeFileSync(tmpFile, data, 'utf-8');
    fs.renameSync(tmpFile, STATE_FILE);
    
    cachedState = state;
    lastReadTime = Date.now();
  } catch (err) {
    console.error('[StateManager] Fehler beim Speichern:', err);
  }
}

/**
 * State partiell updaten (wie Zustand set)
 */
export function updateState(partial: Partial<ServerState>): ServerState {
  const current = loadState();
  const updated = { ...current, ...partial };
  saveState(updated);
  return updated;
}

/**
 * Einzelnes Feld updaten
 */
export function updateStateField<K extends keyof ServerState>(
  key: K,
  value: ServerState[K]
): ServerState {
  const current = loadState();
  current[key] = value;
  saveState(current);
  return current;
}

/**
 * Autopilot-Log hinzufügen
 */
export function addAutopilotLog(entry: ServerState['autopilotLog'][0]): void {
  const state = loadState();
  state.autopilotLog = [entry, ...state.autopilotLog].slice(0, 200);
  saveState(state);
}

/**
 * Order hinzufügen
 */
export function addOrder(order: ServerState['orders'][0]): void {
  const state = loadState();
  // Duplikat-Check
  const isBuy = order.orderType === 'limit-buy' || order.orderType === 'stop-buy';
  const isSell = order.orderType === 'limit-sell' || order.orderType === 'stop-loss';
  
  const sameDirection = state.orders.filter(
    o => (o.status === 'active' || o.status === 'pending')
      && o.symbol === order.symbol
      && ((isBuy && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy'))
        || (isSell && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss')))
  );
  
  const isDuplicate = sameDirection.some(o => {
    if (o.triggerPrice === 0 || order.triggerPrice === 0) return false;
    const priceDiff = Math.abs(o.triggerPrice - order.triggerPrice) / o.triggerPrice;
    return priceDiff <= 0.05;
  });
  
  if (isDuplicate) {
    console.warn(`[StateManager] Order abgelehnt: Duplikat für ${order.symbol}`);
    return;
  }
  
  state.orders.push(order);
  saveState(state);
}

/**
 * Order stornieren
 */
export function cancelOrder(orderId: string): void {
  const state = loadState();
  state.orders = state.orders.map(o =>
    o.id === orderId ? { ...o, status: 'cancelled' } : o
  );
  saveState(state);
}

/**
 * Order ausführen
 */
export function executeOrder(orderId: string, executedPrice: number): void {
  const state = loadState();
  const order = state.orders.find(o => o.id === orderId);
  if (!order || (order.status !== 'active' && order.status !== 'pending')) return;

  // Trigger-Bedingung validieren
  let triggerMet = true;
  switch (order.orderType) {
    case 'limit-buy': triggerMet = executedPrice <= order.triggerPrice; break;
    case 'limit-sell': triggerMet = executedPrice >= order.triggerPrice; break;
    case 'stop-loss': triggerMet = executedPrice <= order.triggerPrice; break;
    case 'stop-buy': triggerMet = executedPrice >= order.triggerPrice; break;
  }
  if (!triggerMet) {
    console.warn(`[executeOrder] ⛔ Trigger nicht erfüllt für ${order.symbol}`);
    return;
  }

  const totalCost = executedPrice * order.quantity;
  const fee = (state.orderSettings.transactionFeeFlat || 0) + totalCost * (state.orderSettings.transactionFeePercent || 0) / 100;

  if (order.orderType === 'limit-buy' || order.orderType === 'stop-buy') {
    // Kauf
    if (totalCost + fee > state.cashBalance) {
      console.warn(`[executeOrder] Nicht genug Cash für ${order.symbol}`);
      order.status = 'cancelled';
      order.note = (order.note || '') + ' ❌ Storniert: Nicht genug Cash';
      saveState(state);
      return;
    }
    state.cashBalance = Math.round((state.cashBalance - totalCost - fee) * 100) / 100;
    
    const existingPos = state.userPositions.find(p => p.symbol === order.symbol);
    if (existingPos) {
      const totalQty = existingPos.quantity + order.quantity;
      existingPos.buyPrice = (existingPos.buyPrice * existingPos.quantity + executedPrice * order.quantity) / totalQty;
      existingPos.quantity = totalQty;
      existingPos.currentPrice = executedPrice;
    } else {
      state.userPositions.push({
        id: crypto.randomUUID(),
        symbol: order.symbol,
        name: order.name,
        quantity: order.quantity,
        buyPrice: executedPrice,
        currentPrice: executedPrice,
        currency: 'EUR',
        useYahooPrice: true,
      });
    }
  } else {
    // Verkauf
    const existingPos = state.userPositions.find(p => p.symbol === order.symbol);
    if (!existingPos || existingPos.quantity < order.quantity) {
      console.warn(`[executeOrder] Nicht genug Aktien für ${order.symbol}`);
      order.status = 'cancelled';
      order.note = (order.note || '') + ' ❌ Storniert: Nicht genug Aktien';
      saveState(state);
      return;
    }
    state.cashBalance = Math.round((state.cashBalance + totalCost - fee) * 100) / 100;
    existingPos.quantity -= order.quantity;
    if (existingPos.quantity <= 0) {
      state.userPositions = state.userPositions.filter(p => p.symbol !== order.symbol);
    } else {
      existingPos.currentPrice = executedPrice;
    }
  }

  order.status = 'executed';
  order.executedAt = new Date().toISOString();
  order.executedPrice = executedPrice;
  saveState(state);
}

/**
 * Prüfe ob die State-Datei existiert
 */
export function stateFileExists(): boolean {
  return fs.existsSync(STATE_FILE);
}

/**
 * State-Datei Pfad
 */
export function getStateFilePath(): string {
  return STATE_FILE;
}

/**
 * Cache invalidieren (z.B. nach Frontend-Sync)
 */
export function invalidateCache(): void {
  cachedState = null;
  lastReadTime = 0;
}

// Deep merge helper
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
