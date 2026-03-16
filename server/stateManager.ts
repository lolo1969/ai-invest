/**
 * Server State Manager
 * Verwaltet den App-State als JSON-Dateien pro Session.
 * Jeder Browser/Client bekommt eine eigene Session-ID und damit
 * einen komplett isolierten State (Portfolio, Orders, Einstellungen).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Session-ID Validierung: Nur alphanumerisch + Bindestrich, max 64 Zeichen
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

function validateSessionId(sessionId: string): string {
  if (!sessionId || !SESSION_ID_REGEX.test(sessionId)) {
    return 'default';
  }
  return sessionId;
}

function getStateFilePath(sessionId: string): string {
  const safeId = validateSessionId(sessionId);
  return path.join(DATA_DIR, `state-${safeId}.json`);
}

// Migration: Alte state.json → state-default.json
const legacyStateFile = path.join(DATA_DIR, 'state.json');
const defaultStateFile = getStateFilePath('default');
if (fs.existsSync(legacyStateFile) && !fs.existsSync(defaultStateFile)) {
  try {
    fs.renameSync(legacyStateFile, defaultStateFile);
    console.log('[StateManager] Migriert: state.json → state-default.json');
  } catch (err) {
    console.error('[StateManager] Migration fehlgeschlagen:', err);
  }
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

// Per-Session Cache und Versionierung
const sessionCache = new Map<string, { state: ServerState; readTime: number; version: number }>();
const CACHE_TTL = 1000; // Re-read file at most every 1s

export function getStateVersion(sessionId = 'default'): number {
  return sessionCache.get(validateSessionId(sessionId))?.version ?? 0;
}

/**
 * Alle aktiven Session-IDs auflisten (für Autopilot/Order-Executor)
 */
export function listSessions(): string[] {
  try {
    const files = fs.readdirSync(DATA_DIR);
    return files
      .filter(f => f.startsWith('state-') && f.endsWith('.json'))
      .map(f => f.replace('state-', '').replace('.json', ''))
      .filter(id => SESSION_ID_REGEX.test(id));
  } catch {
    return ['default'];
  }
}

/**
 * State aus Datei laden (mit Cache), session-basiert
 */
export function loadState(sessionId = 'default'): ServerState {
  const safeId = validateSessionId(sessionId);
  const now = Date.now();
  const cached = sessionCache.get(safeId);
  
  if (cached && (now - cached.readTime) < CACHE_TTL) {
    return cached.state;
  }

  const stateFile = getStateFilePath(safeId);
  try {
    if (fs.existsSync(stateFile)) {
      const raw = fs.readFileSync(stateFile, 'utf-8');
      const parsed = JSON.parse(raw);
      // Merge with defaults to ensure all fields exist
      const state = deepMerge(DEFAULT_STATE, parsed.state ?? parsed) as ServerState;
      const version = parsed.stateVersion ?? (cached?.version ?? 0);
      sessionCache.set(safeId, { state, readTime: now, version });
      return state;
    }
  } catch (err) {
    console.error(`[StateManager] Fehler beim Laden (Session ${safeId}):`, err);
  }

  const state = { ...DEFAULT_STATE };
  sessionCache.set(safeId, { state, readTime: now, version: 0 });
  return state;
}

/**
 * State in Datei speichern (atomar mit temp-file + rename), session-basiert
 */
export function saveState(state: ServerState, sessionId = 'default'): void {
  const safeId = validateSessionId(sessionId);
  try {
    const cached = sessionCache.get(safeId);
    const newVersion = (cached?.version ?? 0) + 1;
    
    const data = JSON.stringify({ 
      version: '1.0.0',
      stateVersion: newVersion,
      sessionId: safeId,
      lastModified: new Date().toISOString(),
      source: 'server',
      state 
    }, null, 2);
    
    const stateFile = getStateFilePath(safeId);
    const tmpFile = stateFile + '.tmp';
    fs.writeFileSync(tmpFile, data, 'utf-8');
    fs.renameSync(tmpFile, stateFile);
    
    sessionCache.set(safeId, { state, readTime: Date.now(), version: newVersion });
  } catch (err) {
    console.error(`[StateManager] Fehler beim Speichern (Session ${safeId}):`, err);
  }
}

/**
 * Intelligenter Merge: Vergleicht incoming State mit aktuellem Server-State
 * und merged nur die Felder, die sich im Client tatsächlich geändert haben.
 */
export function mergeClientState(clientState: Partial<ServerState>, clientVersion: number, sessionId = 'default'): {
  merged: ServerState;
  conflict: boolean;
  serverVersion: number;
} {
  const safeId = validateSessionId(sessionId);
  const current = loadState(safeId);
  const currentVersion = getStateVersion(safeId);
  const conflict = clientVersion > 0 && clientVersion < currentVersion;

  if (conflict) {
    console.log(`[StateManager] Conflict (Session ${safeId}): Client v${clientVersion} vs Server v${currentVersion} – merging`);
    
    const merged = smartMerge(current, clientState);
    saveState(merged, safeId);
    return { merged, conflict: true, serverVersion: getStateVersion(safeId) };
  } else {
    const merged = deepMerge(current, clientState) as ServerState;
    saveState(merged, safeId);
    return { merged, conflict: false, serverVersion: getStateVersion(safeId) };
  }
}

/**
 * Smart Merge: Kombiniert Server-State und Client-State intelligent.
 * - Positionen: Per ID mergen (beide Seiten behalten)
 * - Orders: Per ID mergen (Status-Updates gewinnen)
 * - Cash: Client gewinnt NUR wenn keine Server-seitigen Trades passiert sind
 * - Watchlist: Union beider Listen
 * - Settings: Client gewinnt (User hat sie aktiv geändert)
 */
function smartMerge(server: ServerState, client: Partial<ServerState>): ServerState {
  const merged = { ...server };

  // Settings: Client gewinnt (aktive User-Änderung)
  if (client.settings) {
    merged.settings = { ...server.settings, ...client.settings };
  }

  // Positionen: Per ID mergen
  if (client.userPositions) {
    const serverPositionMap = new Map(server.userPositions.map(p => [p.id, p]));
    const clientPositionMap = new Map(client.userPositions.map(p => [p.id, p]));
    
    // Alle Server-Positionen behalten, Client-Änderungen übernehmen
    const mergedPositions = [...server.userPositions];
    for (const [id, clientPos] of clientPositionMap) {
      if (!serverPositionMap.has(id)) {
        // Neue Position vom Client
        mergedPositions.push(clientPos);
      }
      // Server-Position hat Vorrang (könnte durch Order-Execution geändert sein)
    }
    merged.userPositions = mergedPositions;
  }

  // Orders: Per ID mergen, ausgeführte/stornierte Orders haben Vorrang
  if (client.orders) {
    const serverOrderMap = new Map(server.orders.map(o => [o.id, o]));
    const clientOrderMap = new Map(client.orders.map(o => [o.id, o]));
    
    const mergedOrders = [...server.orders];
    for (const [id, clientOrder] of clientOrderMap) {
      if (!serverOrderMap.has(id)) {
        // Neue Order vom Client
        mergedOrders.push(clientOrder);
      } else {
        // Existierende Order: Wer hat höheren Status-Fortschritt?
        const serverOrder = serverOrderMap.get(id)!;
        const statusPriority: Record<string, number> = { pending: 0, active: 1, executed: 2, cancelled: 2, expired: 2 };
        if ((statusPriority[clientOrder.status] || 0) > (statusPriority[serverOrder.status] || 0)) {
          // Client hat fortgeschritteneren Status
          const idx = mergedOrders.findIndex(o => o.id === id);
          if (idx >= 0) mergedOrders[idx] = clientOrder;
        }
      }
    }
    merged.orders = mergedOrders;
  }

  // Cash: Server hat Vorrang (könnte durch Order-Execution korrekt sein)
  // Client-Cash nur übernehmen wenn Server keine Trades hatte
  // → Server-Wert bleibt

  // Watchlist: Union (Symbol-basiert)
  if (client.watchlist) {
    const serverSymbols = new Set(server.watchlist.map(w => w.symbol));
    for (const item of client.watchlist) {
      if (!serverSymbols.has(item.symbol)) {
        merged.watchlist.push(item);
      }
    }
  }

  // Signals: Server-Signale + neue Client-Signale
  if (client.signals) {
    const serverSignalIds = new Set(server.signals.map((s: any) => s.id));
    for (const sig of client.signals) {
      if (!serverSignalIds.has((sig as any).id)) {
        merged.signals.push(sig);
      }
    }
  }

  // Autopilot-State: Server hat Vorrang
  // (Server führt Zyklen aus, sein State ist maßgeblich)

  // Autopilot-Settings: Client gewinnt (User hat sie geändert)
  if (client.autopilotSettings) {
    merged.autopilotSettings = { ...server.autopilotSettings, ...client.autopilotSettings };
  }

  // Autopilot-Log: Union per ID
  if (client.autopilotLog) {
    const serverLogIds = new Set(server.autopilotLog.map(l => l.id));
    for (const entry of client.autopilotLog) {
      if (!serverLogIds.has(entry.id)) {
        merged.autopilotLog.push(entry);
      }
    }
    merged.autopilotLog.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    merged.autopilotLog = merged.autopilotLog.slice(0, 200);
  }

  // Order-Settings: Client gewinnt
  if (client.orderSettings) {
    merged.orderSettings = { ...server.orderSettings, ...client.orderSettings };
  }

  // Price Alerts: Per ID mergen
  if (client.priceAlerts) {
    const serverAlertIds = new Set(server.priceAlerts.map((a: any) => a.id));
    for (const alert of client.priceAlerts) {
      if (!serverAlertIds.has((alert as any).id)) {
        merged.priceAlerts.push(alert);
      }
    }
  }

  // Analysis: Neuer gewinnt
  if (client.lastAnalysisDate && server.lastAnalysisDate) {
    if (new Date(client.lastAnalysisDate) > new Date(server.lastAnalysisDate)) {
      merged.lastAnalysis = client.lastAnalysis ?? server.lastAnalysis;
      merged.lastAnalysisDate = client.lastAnalysisDate;
    }
  } else if (client.lastAnalysisDate && !server.lastAnalysisDate) {
    merged.lastAnalysis = client.lastAnalysis ?? null;
    merged.lastAnalysisDate = client.lastAnalysisDate;
  }

  // Portfolios, capitalÄnderungen: Client gewinnt
  if (client.portfolios) merged.portfolios = client.portfolios;
  if (client.activePortfolioId !== undefined) merged.activePortfolioId = client.activePortfolioId;
  if (client.initialCapital !== undefined) merged.initialCapital = client.initialCapital;
  if (client.previousProfit !== undefined) merged.previousProfit = client.previousProfit;

  return merged;
}

/**
 * State partiell updaten (wie Zustand set)
 */
export function updateState(partial: Partial<ServerState>, sessionId = 'default'): ServerState {
  const current = loadState(sessionId);
  const updated = { ...current, ...partial };
  saveState(updated, sessionId);
  return updated;
}

/**
 * Einzelnes Feld updaten
 */
export function updateStateField<K extends keyof ServerState>(
  key: K,
  value: ServerState[K],
  sessionId = 'default'
): ServerState {
  const current = loadState(sessionId);
  current[key] = value;
  saveState(current, sessionId);
  return current;
}

/**
 * Autopilot-Log hinzufügen
 */
export function addAutopilotLog(entry: ServerState['autopilotLog'][0], sessionId = 'default'): void {
  const s = loadState(sessionId);
  s.autopilotLog = [entry, ...s.autopilotLog].slice(0, 200);
  saveState(s, sessionId);
}

/**
 * Order hinzufügen
 */
export function addOrder(order: ServerState['orders'][0], sessionId = 'default'): void {
  const s = loadState(sessionId);
  // Duplikat-Check
  const isBuy = order.orderType === 'limit-buy' || order.orderType === 'stop-buy';
  const isSell = order.orderType === 'limit-sell' || order.orderType === 'stop-loss';
  
  const sameDirection = s.orders.filter(
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
  
  s.orders.push(order);
  saveState(s, sessionId);
}

/**
 * Order stornieren
 */
export function cancelOrder(orderId: string, sessionId = 'default'): void {
  const s = loadState(sessionId);
  s.orders = s.orders.map(o =>
    o.id === orderId ? { ...o, status: 'cancelled' } : o
  );
  saveState(s, sessionId);
}

/**
 * Order ausführen
 */
export function executeOrder(orderId: string, executedPrice: number, sessionId = 'default'): void {
  const s = loadState(sessionId);
  const order = s.orders.find(o => o.id === orderId);
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
  const fee = (s.orderSettings.transactionFeeFlat || 0) + totalCost * (s.orderSettings.transactionFeePercent || 0) / 100;

  if (order.orderType === 'limit-buy' || order.orderType === 'stop-buy') {
    // Kauf
    if (totalCost + fee > s.cashBalance) {
      console.warn(`[executeOrder] Nicht genug Cash für ${order.symbol}`);
      order.status = 'cancelled';
      order.note = (order.note || '') + ' ❌ Storniert: Nicht genug Cash';
      saveState(s, sessionId);
      return;
    }
    s.cashBalance = Math.round((s.cashBalance - totalCost - fee) * 100) / 100;
    
    const existingPos = s.userPositions.find(p => p.symbol === order.symbol);
    if (existingPos) {
      const totalQty = existingPos.quantity + order.quantity;
      existingPos.buyPrice = (existingPos.buyPrice * existingPos.quantity + executedPrice * order.quantity) / totalQty;
      existingPos.quantity = totalQty;
      existingPos.currentPrice = executedPrice;
    } else {
      s.userPositions.push({
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
    const existingPos = s.userPositions.find(p => p.symbol === order.symbol);
    if (!existingPos || existingPos.quantity < order.quantity) {
      console.warn(`[executeOrder] Nicht genug Aktien für ${order.symbol}`);
      order.status = 'cancelled';
      order.note = (order.note || '') + ' ❌ Storniert: Nicht genug Aktien';
      saveState(s, sessionId);
      return;
    }
    s.cashBalance = Math.round((s.cashBalance + totalCost - fee) * 100) / 100;
    existingPos.quantity -= order.quantity;
    if (existingPos.quantity <= 0) {
      s.userPositions = s.userPositions.filter(p => p.symbol !== order.symbol);
    } else {
      existingPos.currentPrice = executedPrice;
    }
  }

  order.status = 'executed';
  order.executedAt = new Date().toISOString();
  order.executedPrice = executedPrice;
  saveState(s, sessionId);
}

/**
 * Prüfe ob mindestens eine State-Datei existiert
 */
export function stateFileExists(): boolean {
  try {
    const files = fs.readdirSync(DATA_DIR);
    return files.some(f => f.startsWith('state-') && f.endsWith('.json'));
  } catch {
    return false;
  }
}

/**
 * State-Datei Pfad (für eine Session)
 */
export { getStateFilePath };

/**
 * Cache invalidieren (z.B. nach Frontend-Sync)
 */
export function invalidateCache(sessionId?: string): void {
  if (sessionId) {
    sessionCache.delete(validateSessionId(sessionId));
  } else {
    sessionCache.clear();
  }
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
