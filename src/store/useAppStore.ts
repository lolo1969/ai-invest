import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  UserSettings, 
  InvestmentSignal, 
  Portfolio, 
  Stock,
  UserPosition,
  PriceAlert
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
  
  // UI State
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
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
    marketData: '',
  },
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

      // UI
      isLoading: false,
      setLoading: (loading) => set({ isLoading: loading }),
      error: null,
      setError: (error) => set({ error }),
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
      }),
    }
  )
);
