import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  AutopilotState
} from '../types';

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
  
  // Cash Balance
  cashBalance: number;
  setCashBalance: (amount: number) => void;
  
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
  executeOrder: (id: string, executedPrice: number) => void;
  updateOrderPrice: (id: string, currentPrice: number) => void;
  updateOrderSettings: (settings: Partial<OrderSettings>) => void;

  // Portfolio Analysis
  lastAnalysis: string | null;
  lastAnalysisDate: string | null;
  setLastAnalysis: (analysis: string | null) => void;

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
  openaiModel: 'gpt-5.2',
  geminiModel: 'gemini-2.5-flash',
  customPrompt: '',
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Settings
      settings: defaultSettings,
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

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

      // Cash Balance
      cashBalance: 0,
      setCashBalance: (amount) => set({ cashBalance: amount }),

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
      orderSettings: { autoExecute: false, checkIntervalSeconds: 30 },
      addOrder: (order) =>
        set((state) => ({
          orders: [...state.orders, order],
        })),
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
      executeOrder: (id, executedPrice) =>
        set((state) => {
          const order = state.orders.find((o) => o.id === id);
          if (!order || order.status !== 'active') return state;

          const totalCost = executedPrice * order.quantity;
          let newCashBalance = state.cashBalance;
          let newPositions = [...state.userPositions];

          if (order.orderType === 'limit-buy' || order.orderType === 'stop-buy') {
            // Kauf: Cash reduzieren, Position hinzufügen/erweitern
            newCashBalance -= totalCost;
            const existingPos = newPositions.find((p) => p.symbol === order.symbol);
            if (existingPos) {
              const totalQty = existingPos.quantity + order.quantity;
              const avgPrice = (existingPos.buyPrice * existingPos.quantity + executedPrice * order.quantity) / totalQty;
              newPositions = newPositions.map((p) =>
                p.symbol === order.symbol
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
                currency: 'USD',
                useYahooPrice: true,
              });
            }
          } else {
            // Verkauf: Cash erhöhen, Position reduzieren/entfernen
            newCashBalance += totalCost;
            const existingPos = newPositions.find((p) => p.symbol === order.symbol);
            if (existingPos) {
              const newQty = existingPos.quantity - order.quantity;
              if (newQty <= 0) {
                newPositions = newPositions.filter((p) => p.symbol !== order.symbol);
              } else {
                newPositions = newPositions.map((p) =>
                  p.symbol === order.symbol
                    ? { ...p, quantity: newQty, currentPrice: executedPrice }
                    : p
                );
              }
            }
          }

          return {
            orders: state.orders.map((o) =>
              o.id === id
                ? { ...o, status: 'executed' as const, executedAt: new Date(), executedPrice }
                : o
            ),
            cashBalance: newCashBalance,
            userPositions: newPositions,
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
      setLastAnalysis: (analysis) => set({ 
        lastAnalysis: analysis, 
        lastAnalysisDate: analysis ? new Date().toISOString() : null 
      }),

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
    }),
    {
      name: 'ai-invest-storage',
      partialize: (state) => ({
        settings: state.settings,
        portfolios: state.portfolios,
        userPositions: state.userPositions,
        cashBalance: state.cashBalance,
        watchlist: state.watchlist,
        signals: state.signals,
        priceAlerts: state.priceAlerts,
        orders: state.orders,
        orderSettings: state.orderSettings,
        lastAnalysis: state.lastAnalysis,
        lastAnalysisDate: state.lastAnalysisDate,
        analysisHistory: state.analysisHistory,
        autopilotSettings: state.autopilotSettings,
        autopilotLog: state.autopilotLog,
        autopilotState: state.autopilotState,
      }),
    }
  )
);
