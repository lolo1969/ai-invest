import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getStorageKey } from '../utils/session';
import { findCompatibleSymbolMatch, symbolsReferToSameInstrument, sumByEquivalentSymbol } from '../utils/symbolMatching';
import type { 
  UserSettings, 
  InvestmentSignal, 
  Portfolio, 
  Stock,
  UserPosition,
  PriceAlert,
  AnalysisHistoryEntry,
  Order,
  OrderSettings,
  AutopilotSettings,
  AutopilotLogEntry,
  AutopilotState,
  TaxTransaction,
  TradeHistoryEntry,
} from '../types';

// Migration: Alte Daten zu session-spezifischem Key übernehmen.
// Reihenfolge: ai-invest-storage → vestia-storage → vestia-storage-{sessionId}
// Die Session-Migration (vestia-storage → session-Key) läuft bereits in utils/session.ts
// MUSS vor der Store-Erstellung laufen, sonst überschreibt Zustand mit Defaults!
(() => {
  try {
    const oldKey = 'ai-invest-storage';
    const sessionKey = getStorageKey();
    const oldData = localStorage.getItem(oldKey);
    if (oldData && !localStorage.getItem(sessionKey)) {
      // Uralte Daten direkt zum Session-Key migrieren
      localStorage.setItem(sessionKey, oldData);
      localStorage.removeItem(oldKey);
      console.log('[Vestia] Daten von ai-invest-storage migriert → ' + sessionKey);
    } else if (oldData) {
      // Altes Key aufräumen wenn Session-Key schon existiert
      localStorage.removeItem(oldKey);
    }
  } catch (e) {
    console.error('[Vestia] Migration fehlgeschlagen:', e);
  }
})();

interface AppState {
  // User Settings
  settings: UserSettings;
  updateSettings: (settings: Partial<UserSettings>) => void;
  
  // Signals
  signals: InvestmentSignal[];
  addSignal: (signal: InvestmentSignal) => void;
  clearSignals: () => void;
  
  // Portfolio
  portfolios: Portfolio[];
  activePortfolioId: string | null;
  addPortfolio: (portfolio: Portfolio) => void;
  setActivePortfolio: (id: string) => void;
  
  // User Positions (eigene Aktien)
  userPositions: UserPosition[];
  addUserPosition: (position: UserPosition) => void;
  updateUserPosition: (id: string, updates: Partial<UserPosition>) => void;
  removeUserPosition: (id: string) => void;
    clearUserPositions: () => void;
  
  // Cash Balance
  cashBalance: number;
  setCashBalance: (amount: number) => void;
  initialCapital: number;
  setInitialCapital: (amount: number) => void;
  previousProfit: number;
  setPreviousProfit: (amount: number) => void;
  
  // Watchlist
  watchlist: Stock[];
  addToWatchlist: (stock: Stock) => void;
  removeFromWatchlist: (symbol: string) => void;
  
  // Price Alerts
  priceAlerts: PriceAlert[];
  addPriceAlert: (alert: PriceAlert) => void;
  removePriceAlert: (id: string) => void;
  triggerPriceAlert: (id: string) => void;
  
  // Orders
  orders: Order[];
  orderSettings: OrderSettings;
  addOrder: (order: Order) => void;
  removeOrder: (id: string) => void;
  cancelOrder: (id: string) => void;
  confirmOrder: (id: string) => void;
  executeOrder: (id: string, executedPrice: number) => void;
  updateOrderPrice: (id: string, currentPrice: number) => void;
  updateOrderSettings: (settings: Partial<OrderSettings>) => void;

  // Portfolio Analysis
  lastAnalysis: string | null;
  lastAnalysisDate: string | null;
  isAnalyzing: boolean;
  setLastAnalysis: (analysis: string | null) => void;
  setAnalyzing: (analyzing: boolean) => void;

  // Dashboard Analysis (separat vom Portfolio-Analyse-Text)
  dashboardAnalysisSummary: string | null;
  dashboardAnalysisDate: string | null;
  isDashboardAnalyzing: boolean;
  setDashboardAnalysisSummary: (summary: string | null) => void;
  setDashboardAnalyzing: (analyzing: boolean) => void;

  // Analysis History (AI Memory)
  analysisHistory: AnalysisHistoryEntry[];
  addAnalysisHistory: (entry: AnalysisHistoryEntry) => void;
  clearAnalysisHistory: () => void;

  // UI State
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;

  // Autopilot
  autopilotSettings: AutopilotSettings;
  autopilotLog: AutopilotLogEntry[];
  autopilotState: AutopilotState;
  updateAutopilotSettings: (settings: Partial<AutopilotSettings>) => void;
  addAutopilotLog: (entry: AutopilotLogEntry) => void;
  clearAutopilotLog: () => void;
  updateAutopilotState: (state: Partial<AutopilotState>) => void;
  resetAutopilotState: () => void;

  // Tax Transactions (realisierte Gewinne/Verluste)
  taxTransactions: TaxTransaction[];
  addTaxTransaction: (tx: TaxTransaction) => void;
  removeTaxTransaction: (id: string) => void;
  clearTaxTransactions: () => void;

  // Trade History (direkte Portfolio-Käufe/Verkäufe)
  tradeHistory: TradeHistoryEntry[];
  addTradeHistory: (entry: TradeHistoryEntry) => void;
  clearTradeHistory: () => void;
}

const defaultSettings: UserSettings = {
  budget: 1000,
  strategy: 'middle',
  riskTolerance: 'medium',
  watchlist: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'],
  notifications: {
    email: {
      enabled: false,
      address: '',
      serviceId: '',
      templateId: '',
      publicKey: '',
    },
    telegram: {
      enabled: false,
      chatId: '',
      botToken: '',
    },
  },
  apiKeys: {
    claude: '',
    openai: '',
    gemini: '',
    marketData: '',
  },
  aiProvider: 'gemini',
  claudeModel: 'claude-opus-4-6',
  openaiModel: 'gpt-5.4',
  geminiModel: 'gemini-2.5-flash',
  customPrompt: '',
};

const API_KEYS_SESSION_KEY = 'vestia-api-keys-session';

function getEmptyApiKeys(): UserSettings['apiKeys'] {
  return {
    claude: '',
    openai: '',
    gemini: '',
    marketData: '',
  };
}

function normalizeApiKeys(apiKeys?: Partial<UserSettings['apiKeys']>): UserSettings['apiKeys'] {
  const empty = getEmptyApiKeys();
  return {
    claude: typeof apiKeys?.claude === 'string' ? apiKeys.claude : empty.claude,
    openai: typeof apiKeys?.openai === 'string' ? apiKeys.openai : empty.openai,
    gemini: typeof apiKeys?.gemini === 'string' ? apiKeys.gemini : empty.gemini,
    marketData: typeof apiKeys?.marketData === 'string' ? apiKeys.marketData : empty.marketData,
  };
}

function hasAnyApiKey(apiKeys?: Partial<UserSettings['apiKeys']>): boolean {
  if (!apiKeys) return false;
  return Object.values(apiKeys).some((value) => typeof value === 'string' && value.trim().length > 0);
}

function readApiKeysFromSessionStorage(): UserSettings['apiKeys'] {
  if (typeof window === 'undefined') return getEmptyApiKeys();
  try {
    const raw = sessionStorage.getItem(API_KEYS_SESSION_KEY);
    if (!raw) return getEmptyApiKeys();
    const parsed = JSON.parse(raw) as Partial<UserSettings['apiKeys']>;
    return normalizeApiKeys(parsed);
  } catch (e) {
    console.warn('[Vestia] Session-API-Keys konnten nicht gelesen werden:', e);
    return getEmptyApiKeys();
  }
}

function writeApiKeysToSessionStorage(apiKeys: Partial<UserSettings['apiKeys']>) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(API_KEYS_SESSION_KEY, JSON.stringify(normalizeApiKeys(apiKeys)));
  } catch (e) {
    console.warn('[Vestia] Session-API-Keys konnten nicht gespeichert werden:', e);
  }
}

function getSettingsWithoutApiKeys(settings: UserSettings): UserSettings {
  return {
    ...settings,
    apiKeys: getEmptyApiKeys(),
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Settings
      settings: {
        ...defaultSettings,
        apiKeys: readApiKeysFromSessionStorage(),
      },
      updateSettings: (newSettings) =>
        set((state) => {
          const mergedApiKeys = newSettings.apiKeys
            ? normalizeApiKeys({ ...state.settings.apiKeys, ...newSettings.apiKeys })
            : state.settings.apiKeys;
          const nextSettings: UserSettings = {
            ...state.settings,
            ...newSettings,
            apiKeys: mergedApiKeys,
          };

          if (newSettings.apiKeys) {
            writeApiKeysToSessionStorage(mergedApiKeys);
          }

          return {
            settings: nextSettings,
          };
        }),

      // Signals
      signals: [],
      addSignal: (signal) =>
        set((state) => ({
          signals: [signal, ...state.signals].slice(0, 50), // Keep last 50
        })),
      clearSignals: () => set({ signals: [] }),

      // Portfolio
      portfolios: [],
      activePortfolioId: null,
      addPortfolio: (portfolio) =>
        set((state) => ({
          portfolios: [...state.portfolios, portfolio],
        })),
      setActivePortfolio: (id) => set({ activePortfolioId: id }),

      // User Positions
      userPositions: [],
      addUserPosition: (position) =>
        set((state) => ({
          userPositions: [...state.userPositions, position],
        })),
      updateUserPosition: (id, updates) =>
        set((state) => ({
          userPositions: state.userPositions.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),
      removeUserPosition: (id) =>
        set((state) => ({
          userPositions: state.userPositions.filter((p) => p.id !== id),
        })),
      clearUserPositions: () => set({ userPositions: [] }),

      // Cash Balance
      cashBalance: 0,
      setCashBalance: (amount) => set({ cashBalance: Math.round(amount * 100) / 100 }),
      initialCapital: 0,
      setInitialCapital: (amount) => set({ initialCapital: amount }),
      previousProfit: 0,
      setPreviousProfit: (amount) => set({ previousProfit: amount }),

      // Watchlist
      watchlist: [],
      addToWatchlist: (stock) =>
        set((state) => ({
          watchlist: [...state.watchlist.filter(s => s.symbol !== stock.symbol), stock],
        })),
      removeFromWatchlist: (symbol) =>
        set((state) => ({
          watchlist: state.watchlist.filter((s) => s.symbol !== symbol),
        })),

      // Price Alerts
      priceAlerts: [],
      addPriceAlert: (alert) =>
        set((state) => ({
          priceAlerts: [...state.priceAlerts, alert],
        })),
      removePriceAlert: (id) =>
        set((state) => ({
          priceAlerts: state.priceAlerts.filter((a) => a.id !== id),
        })),
      triggerPriceAlert: (id) =>
        set((state) => ({
          priceAlerts: state.priceAlerts.map((a) =>
            a.id === id ? { ...a, triggered: true, triggeredAt: new Date() } : a
          ),
        })),

      // Orders
      orders: [],
      orderSettings: { autoExecute: false, checkIntervalSeconds: 30, transactionFeeFlat: 0, transactionFeePercent: 0 },
      addOrder: (order) => {
        // Duplikat-Check über zentrale Funktion
        const result = checkDuplicateOrder(order);
        if (!result.ok) {
          console.warn(`[Vestia] Order abgelehnt: ${result.reason}`);
          return;
        }
        set((state) => ({
          orders: [...state.orders, order],
        }));
      },
      removeOrder: (id) =>
        set((state) => ({
          orders: state.orders.filter((o) => o.id !== id),
        })),
      cancelOrder: (id) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === id ? { ...o, status: 'cancelled' as const } : o
          ),
        })),
      confirmOrder: (id) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === id && o.status === 'pending' ? { ...o, status: 'active' as const } : o
          ),
        })),
      executeOrder: (id, executedPrice) =>
        set((state) => {
          const order = state.orders.find((o) => o.id === id);
          if (!order || (order.status !== 'active' && order.status !== 'pending')) return state;

          // SICHERHEITS-CHECK: Trigger-Bedingung validieren
          // Verhindert, dass Orders zu einem ungünstigen Preis ausgeführt werden
          // (z.B. Stop-Loss bei 210€ soll NICHT bei 227€ auslösen)
          let triggerConditionMet = true;
          switch (order.orderType) {
            case 'limit-buy':
              triggerConditionMet = executedPrice <= order.triggerPrice;
              break;
            case 'limit-sell':
              triggerConditionMet = executedPrice >= order.triggerPrice;
              break;
            case 'stop-loss':
              triggerConditionMet = executedPrice <= order.triggerPrice;
              break;
            case 'stop-buy':
              triggerConditionMet = executedPrice >= order.triggerPrice;
              break;
          }
          if (!triggerConditionMet) {
            console.warn(`[executeOrder] ⛔ Trigger-Bedingung NICHT erfüllt für ${order.symbol} (${order.orderType}): Preis ${executedPrice.toFixed(2)}€, Trigger ${order.triggerPrice.toFixed(2)}€ – Ausführung verhindert.`);
            return state;
          }

          const totalCost = executedPrice * order.quantity;
          // Transaktionsgebühren berechnen
          const fee = (state.orderSettings.transactionFeeFlat || 0) + totalCost * (state.orderSettings.transactionFeePercent || 0) / 100;
          let newCashBalance = state.cashBalance;
          let newPositions = [...state.userPositions];

          if (order.orderType === 'limit-buy' || order.orderType === 'stop-buy') {
            // Cash-Guard: Genug Cash für Kauf (inkl. Gebühren)?
            if (totalCost + fee > state.cashBalance) {
              console.warn(`[executeOrder] Nicht genug Cash für ${order.symbol}: Benötigt ${(totalCost + fee).toFixed(2)}, Verfügbar ${state.cashBalance.toFixed(2)}`);
              return {
                orders: state.orders.map((o) =>
                  o.id === id ? { ...o, status: 'cancelled' as const, note: (o.note || '') + ' ❌ Storniert: Nicht genug Cash' } : o
                ),
              };
            }
            // Kauf: Cash reduzieren (inkl. Gebühren), Position hinzufügen/erweitern
            newCashBalance -= totalCost + fee;
            const existingPos = findCompatibleSymbolMatch(order.symbol, newPositions, (item) => item.symbol);
            if (existingPos) {
              const totalQty = existingPos.quantity + order.quantity;
              const avgPrice = (existingPos.buyPrice * existingPos.quantity + executedPrice * order.quantity) / totalQty;
              newPositions = newPositions.map((p) =>
                p.id === existingPos.id
                  ? { ...p, quantity: totalQty, buyPrice: avgPrice, currentPrice: executedPrice }
                  : p
              );
            } else {
              newPositions.push({
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
            // Verkauf: Cash erhöhen (abzgl. Gebühren), Position reduzieren/entfernen
            const existingPos = findCompatibleSymbolMatch(order.symbol, newPositions, (item) => item.symbol);
            // Guard: Genug Aktien für Verkauf?
            if (!existingPos || existingPos.quantity < order.quantity) {
              console.warn(`[executeOrder] Nicht genug Aktien für ${order.symbol}: Benötigt ${order.quantity}, Verfügbar ${existingPos?.quantity ?? 0}`);
              return {
                orders: state.orders.map((o) =>
                  o.id === id ? { ...o, status: 'cancelled' as const, note: (o.note || '') + ' ❌ Storniert: Nicht genug Aktien' } : o
                ),
              };
            }
            newCashBalance += totalCost - fee;

            // Steuer-Transaktion erfassen
            const sellDate = new Date();
            
            // Kaufdatum ermitteln: Aus ausgeführten Buy-Orders nachschlagen
            let buyDate: Date | null = null;
            const executedBuyOrders = state.orders
              .filter(o => o.status === 'executed'
                && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy')
                && symbolsReferToSameInstrument(o.symbol, order.symbol)
                && o.executedAt != null)
              .sort((a, b) => new Date(a.executedAt!).getTime() - new Date(b.executedAt!).getTime());
            
            if (executedBuyOrders.length > 0) {
              buyDate = new Date(executedBuyOrders[0].executedAt!);
            }
            
            // Fallback: Trade-History
            if (!buyDate) {
              const buyTrade = state.tradeHistory
                ?.filter(t => t.type === 'buy' && symbolsReferToSameInstrument(t.symbol, order.symbol))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
              if (buyTrade && buyTrade.length > 0) {
                buyDate = new Date(buyTrade[0].date);
              }
            }
            
            // Letzter Fallback: Order-Erstellungsdatum
            if (!buyDate) {
              buyDate = new Date(order.createdAt);
            }
            
            const holdingDays = Math.floor((sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24));
            const gainLoss = (executedPrice - existingPos.buyPrice) * order.quantity - fee;
            const taxFree = holdingDays >= 183; // ~6 Monate
            const taxTx: TaxTransaction = {
              id: crypto.randomUUID(),
              symbol: order.symbol,
              name: order.name,
              quantity: order.quantity,
              buyPrice: existingPos.buyPrice,
              sellPrice: executedPrice,
              buyDate: buyDate.toISOString(),
              sellDate: sellDate.toISOString(),
              gainLoss,
              fees: fee,
              holdingDays,
              taxFree,
            };

            const newQty = existingPos.quantity - order.quantity;
            if (newQty <= 0) {
              newPositions = newPositions.filter((p) => p.id !== existingPos.id);
            } else {
              newPositions = newPositions.map((p) =>
                p.id === existingPos.id
                  ? { ...p, quantity: newQty, currentPrice: executedPrice }
                  : p
              );
            }

            return {
              orders: state.orders.map((o) =>
                o.id === id
                  ? { ...o, status: 'executed' as const, executedAt: new Date(), executedPrice }
                  : o
              ),
              cashBalance: Math.round(newCashBalance * 100) / 100,
              userPositions: newPositions,
              taxTransactions: [taxTx, ...state.taxTransactions],
              tradeHistory: [{
                id: crypto.randomUUID(),
                type: 'sell' as const,
                symbol: order.symbol,
                name: order.name,
                quantity: order.quantity,
                price: executedPrice,
                totalAmount: totalCost,
                fees: fee,
                date: new Date().toISOString(),
                source: 'order' as const,
              }, ...state.tradeHistory].slice(0, 500),
            };
          }

          return {
            orders: state.orders.map((o) =>
              o.id === id
                ? { ...o, status: 'executed' as const, executedAt: new Date(), executedPrice }
                : o
            ),
            cashBalance: Math.round(newCashBalance * 100) / 100,
            userPositions: newPositions,
            tradeHistory: [{
              id: crypto.randomUUID(),
              type: 'buy' as const,
              symbol: order.symbol,
              name: order.name,
              quantity: order.quantity,
              price: executedPrice,
              totalAmount: totalCost,
              fees: fee,
              date: new Date().toISOString(),
              source: 'order' as const,
            }, ...state.tradeHistory].slice(0, 500),
          };
        }),
      updateOrderPrice: (id, currentPrice) =>
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === id ? { ...o, currentPrice } : o
          ),
        })),
      updateOrderSettings: (settings) =>
        set((state) => ({
          orderSettings: { ...state.orderSettings, ...settings },
        })),

      // Portfolio Analysis
      lastAnalysis: null,
      lastAnalysisDate: null,
      isAnalyzing: false,
      setLastAnalysis: (analysis) => set({ 
        lastAnalysis: analysis, 
        lastAnalysisDate: analysis ? new Date().toISOString() : null 
      }),
      setAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
      dashboardAnalysisSummary: null,
      dashboardAnalysisDate: null,
      isDashboardAnalyzing: false,
      setDashboardAnalysisSummary: (summary) => set({
        dashboardAnalysisSummary: summary,
        dashboardAnalysisDate: summary ? new Date().toISOString() : null,
      }),
      setDashboardAnalyzing: (analyzing) => set({ isDashboardAnalyzing: analyzing }),

      // Analysis History (AI Memory)
      analysisHistory: [],
      addAnalysisHistory: (entry) =>
        set((state) => ({
          analysisHistory: [entry, ...state.analysisHistory].slice(0, 5), // Keep last 5
        })),
      clearAnalysisHistory: () => set({ analysisHistory: [] }),

      // UI
      isLoading: false,
      setLoading: (loading) => set({ isLoading: loading }),
      error: null,
      setError: (error) => set({ error }),

      // Autopilot
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
      updateAutopilotSettings: (newSettings) =>
        set((state) => ({
          autopilotSettings: { ...state.autopilotSettings, ...newSettings },
        })),
      addAutopilotLog: (entry) =>
        set((state) => ({
          autopilotLog: [entry, ...state.autopilotLog].slice(0, 200), // Max 200 Einträge
        })),
      clearAutopilotLog: () => set({ autopilotLog: [] }),
      updateAutopilotState: (newState) =>
        set((state) => ({
          autopilotState: { ...state.autopilotState, ...newState },
        })),
      resetAutopilotState: () =>
        set({
          autopilotState: {
            isRunning: false,
            lastRunAt: null,
            nextRunAt: null,
            cycleCount: 0,
            totalOrdersCreated: 0,
            totalOrdersExecuted: 0,
          },
        }),

      // Tax Transactions
      taxTransactions: [],
      addTaxTransaction: (tx) =>
        set((state) => ({
          taxTransactions: [tx, ...state.taxTransactions],
        })),
      removeTaxTransaction: (id) =>
        set((state) => ({
          taxTransactions: state.taxTransactions.filter((t) => t.id !== id),
        })),
      clearTaxTransactions: () => set({ taxTransactions: [] }),

      // Trade History
      tradeHistory: [],
      addTradeHistory: (entry) =>
        set((state) => ({
          tradeHistory: [entry, ...state.tradeHistory].slice(0, 500), // Max 500 Einträge
        })),
      clearTradeHistory: () => set({ tradeHistory: [] }),
    }),
    {
      name: getStorageKey(),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[Vestia] Rehydrate fehlgeschlagen:', error);
          return;
        }
        if (!state) return;

        // Falls sessionStorage noch Keys hat (Migration von alter Variante), bevorzuge diese
        const sessionApiKeys = readApiKeysFromSessionStorage();
        if (hasAnyApiKey(sessionApiKeys)) {
          state.updateSettings({ apiKeys: sessionApiKeys });
        }
        // Ansonsten bleiben die aus localStorage rehydrierten Keys direkt erhalten
      },
      partialize: (state) => ({
        settings: state.settings,
        portfolios: state.portfolios,
        activePortfolioId: state.activePortfolioId,
        userPositions: state.userPositions,
        cashBalance: state.cashBalance,
        initialCapital: state.initialCapital,
        previousProfit: state.previousProfit,
        watchlist: state.watchlist,
        signals: state.signals,
        priceAlerts: state.priceAlerts,
        orders: state.orders,
        orderSettings: state.orderSettings,
        lastAnalysis: state.lastAnalysis,
        lastAnalysisDate: state.lastAnalysisDate,
        dashboardAnalysisSummary: state.dashboardAnalysisSummary,
        dashboardAnalysisDate: state.dashboardAnalysisDate,
        isDashboardAnalyzing: state.isDashboardAnalyzing,
        analysisHistory: state.analysisHistory,
        autopilotSettings: state.autopilotSettings,
        autopilotLog: state.autopilotLog,
        autopilotState: state.autopilotState,
        taxTransactions: state.taxTransactions,
        tradeHistory: state.tradeHistory,
      }),
    }
  )
);

/**
 * Prüft ob eine Order ein Duplikat wäre.
 * Gleiche Richtung (Buy/Sell), gleiches Symbol, ähnlicher Preis (±5%)
 * oder Sell-Menge > verfügbare Position.
 */
export function checkDuplicateOrder(order: Order): { ok: boolean; reason?: string } {
  const state = useAppStore.getState();
  const isBuy = order.orderType === 'limit-buy' || order.orderType === 'stop-buy';
  const isSell = order.orderType === 'limit-sell' || order.orderType === 'stop-loss';

  const sameDirectionOrders = state.orders.filter(
    o => (o.status === 'active' || o.status === 'pending')
      && symbolsReferToSameInstrument(o.symbol, order.symbol)
      && (
        (isBuy && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy'))
        || (isSell && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss'))
      )
  );

  const duplicate = sameDirectionOrders.find(o => {
    if (o.triggerPrice === 0 || order.triggerPrice === 0) return false;
    const priceDiff = Math.abs(o.triggerPrice - order.triggerPrice) / o.triggerPrice;
    return priceDiff <= 0.05;
  });

  if (duplicate) {
    const direction = isSell ? 'Sell' : 'Buy';
    return {
      ok: false,
      reason: `Duplikat: ${direction}-Order für ${order.symbol} bei ${order.triggerPrice.toFixed(2)}€ – bereits ${duplicate.orderType.toUpperCase()} @ ${duplicate.triggerPrice.toFixed(2)}€ vorhanden (±5%)`,
    };
  }

  if (isSell) {
    const position = findCompatibleSymbolMatch(order.symbol, state.userPositions, (item) => item.symbol);
    const totalExistingSellQty = sumByEquivalentSymbol(order.symbol, sameDirectionOrders, (item) => item.symbol, (item) => item.quantity);
    if (position && (totalExistingSellQty + order.quantity) > position.quantity) {
      return {
        ok: false,
        reason: `Überverkauf: Sells gesamt (${totalExistingSellQty + order.quantity}) > Position (${position.quantity}) für ${order.symbol}`,
      };
    }
  }

  return { ok: true };
}
// Automatisches Backup: Alle 60s eine Sicherheitskopie unter separatem Key speichern
// Schützt vor Datenverlust bei Storage-Key-Änderungen, Updates oder Bugs
const BACKUP_KEY = 'vestia-auto-backup';
const BACKUP_INTERVAL = 60_000; // 60 Sekunden

function saveAutoBackup() {
  try {
    const state = useAppStore.getState();
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.10.2',
      data: {
        settings: getSettingsWithoutApiKeys(state.settings),
        portfolios: state.portfolios,
        activePortfolioId: state.activePortfolioId,
        userPositions: state.userPositions,
        cashBalance: state.cashBalance,
        initialCapital: state.initialCapital,
        previousProfit: state.previousProfit,
        watchlist: state.watchlist,
        signals: state.signals,
        priceAlerts: state.priceAlerts,
        orders: state.orders,
        orderSettings: state.orderSettings,
        lastAnalysis: state.lastAnalysis,
        lastAnalysisDate: state.lastAnalysisDate,
        dashboardAnalysisSummary: state.dashboardAnalysisSummary,
        dashboardAnalysisDate: state.dashboardAnalysisDate,
        isDashboardAnalyzing: state.isDashboardAnalyzing,
        analysisHistory: state.analysisHistory,
        autopilotSettings: state.autopilotSettings,
        autopilotLog: state.autopilotLog,
        autopilotState: state.autopilotState,
        taxTransactions: state.taxTransactions,
        tradeHistory: state.tradeHistory,
      },
    };
    // Nur speichern wenn echte Daten vorhanden (nicht leerer Default-State)
    if (state.userPositions.length > 0 || state.cashBalance > 0 || state.watchlist.length > 0) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    }
  } catch (e) {
    console.warn('[Vestia] Auto-Backup fehlgeschlagen:', e);
  }
}

// Duplikat-Orders beim App-Start bereinigen (einmalig nach 3s)
setTimeout(() => {
  try {
    const state = useAppStore.getState();
    const activeOrders = state.orders.filter(
      o => (o.status === 'active' || o.status === 'pending')
    );
    // Gruppiere nach Symbol + Richtung
    const groups = new Map<string, typeof activeOrders>();
    for (const o of activeOrders) {
      const isSell = o.orderType === 'limit-sell' || o.orderType === 'stop-loss';
      const key = `${o.symbol}_${isSell ? 'sell' : 'buy'}`;
      const list = groups.get(key) || [];
      list.push(o);
      groups.set(key, list);
    }
    let cancelled = 0;
    for (const [, groupOrders] of groups) {
      if (groupOrders.length <= 1) continue;
      // Sortiere: älteste zuerst
      groupOrders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const kept: typeof activeOrders = [];
      for (const order of groupOrders) {
        const isDuplicate = kept.some(k => {
          if (k.triggerPrice === 0 || order.triggerPrice === 0) return false;
          const priceDiff = Math.abs(k.triggerPrice - order.triggerPrice) / k.triggerPrice;
          return priceDiff <= 0.05;
        });
        if (isDuplicate) {
          state.cancelOrder(order.id);
          cancelled++;
        } else {
          kept.push(order);
        }
      }
    }
    if (cancelled > 0) {
      console.log(`[Vestia] ${cancelled} doppelte Order(s) beim Start bereinigt`);
    }
  } catch (e) {
    console.warn('[Vestia] Order-Bereinigung fehlgeschlagen:', e);
  }
}, 3000);

// Einmalige Migration: Bereits ausgeführte Sell-Orders als Steuertransaktionen nachimportieren
setTimeout(() => {
  try {
    const state = useAppStore.getState();
    if (state.taxTransactions.length > 0) return; // Bereits migriert oder manuell erfasst

    const executedSells = state.orders.filter(
      o => o.status === 'executed' 
        && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss')
        && o.executedPrice != null
        && o.executedAt != null
    );

    if (executedSells.length === 0) return;

    const newTaxTxs: TaxTransaction[] = executedSells.map(o => {
      const sellDate = new Date(o.executedAt!);
      const buyDate = new Date(o.createdAt);
      const holdingDays = Math.floor((sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24));
      // Versuche Kaufpreis aus Order-Kontext zu ermitteln (triggerPrice als Annäherung für Sell-Orders ist nicht ideal)
      // Nutze executedPrice als Verkaufspreis, triggerPrice als Näherung
      const fee = (state.orderSettings.transactionFeeFlat || 0) + (o.executedPrice! * o.quantity) * (state.orderSettings.transactionFeePercent || 0) / 100;
      const gainLoss = (o.executedPrice! - o.triggerPrice) * o.quantity - fee;
      const taxFree = holdingDays >= 183;

      return {
        id: crypto.randomUUID(),
        symbol: o.symbol,
        name: o.name,
        quantity: o.quantity,
        buyPrice: o.triggerPrice, // Trigger-Preis als Näherung (User kann im Steuer-Tab korrigieren)
        sellPrice: o.executedPrice!,
        buyDate: buyDate.toISOString(),
        sellDate: sellDate.toISOString(),
        gainLoss,
        fees: fee,
        holdingDays,
        taxFree,
      };
    });

    if (newTaxTxs.length > 0) {
      useAppStore.setState((s) => ({
        taxTransactions: [...newTaxTxs, ...s.taxTransactions],
      }));
      console.log(`[Vestia] ${newTaxTxs.length} historische Sell-Order(s) als Steuertransaktionen importiert`);
    }
  } catch (e) {
    console.warn('[Vestia] Steuer-Migration fehlgeschlagen:', e);
  }
}, 4000);

// Einmalige Migration: Bereits ausgeführte Orders als Trade-History nachimportieren
setTimeout(() => {
  try {
    const state = useAppStore.getState();
    if (state.tradeHistory.length > 0) return; // Bereits migriert

    const executedOrders = state.orders.filter(
      o => o.status === 'executed' && o.executedPrice != null && o.executedAt != null
    );

    if (executedOrders.length === 0) return;

    const newTrades: TradeHistoryEntry[] = executedOrders.map(o => {
      const isBuy = o.orderType === 'limit-buy' || o.orderType === 'stop-buy';
      const totalCost = o.executedPrice! * o.quantity;
      const fee = (state.orderSettings.transactionFeeFlat || 0) + totalCost * (state.orderSettings.transactionFeePercent || 0) / 100;

      return {
        id: crypto.randomUUID(),
        type: isBuy ? 'buy' as const : 'sell' as const,
        symbol: o.symbol,
        name: o.name,
        quantity: o.quantity,
        price: o.executedPrice!,
        totalAmount: totalCost,
        fees: fee,
        date: new Date(o.executedAt!).toISOString(),
        source: 'order' as const,
      };
    });

    if (newTrades.length > 0) {
      // Sortiere nach Datum (neueste zuerst)
      newTrades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      useAppStore.setState((s) => ({
        tradeHistory: [...newTrades, ...s.tradeHistory].slice(0, 500),
      }));
      console.log(`[Vestia] ${newTrades.length} historische Order(s) als Trade-History importiert`);
    }
  } catch (e) {
    console.warn('[Vestia] Trade-History-Migration fehlgeschlagen:', e);
  }
}, 4500);

// Backup beim Start und dann alle 60s
setTimeout(saveAutoBackup, 5000); // 5s nach Start (damit Daten geladen sind)
setInterval(saveAutoBackup, BACKUP_INTERVAL);

// Notfall-Wiederherstellung: Wenn der Hauptspeicher leer ist aber ein Backup existiert
(() => {
  try {
    const mainData = localStorage.getItem('vestia-storage');
    const backupRaw = localStorage.getItem(BACKUP_KEY);
    if (backupRaw) {
      const backup = JSON.parse(backupRaw);
      const hasMainData = (() => {
        if (!mainData) return false;
        try {
          const parsed = JSON.parse(mainData);
          const state = parsed?.state;
          return state && (
            (state.userPositions && state.userPositions.length > 0) ||
            (state.cashBalance && state.cashBalance > 0) ||
            (state.watchlist && state.watchlist.length > 0)
          );
        } catch { return false; }
      })();

      if (!hasMainData && backup.data) {
        console.warn('[Vestia] Hauptspeicher leer, stelle aus Auto-Backup wieder her (vom', backup.timestamp, ')');
        // Backup in Zustand-persist Format umwandeln
        const restored = { state: backup.data, version: 0 };
        localStorage.setItem('vestia-storage', JSON.stringify(restored));
        window.location.reload();
      }
    }
  } catch (e) {
    console.error('[Vestia] Backup-Wiederherstellung fehlgeschlagen:', e);
  }
})();
