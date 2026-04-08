import { useState, useEffect, useRef } from 'react';
import { 
  Briefcase, 
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart as PieChartIcon,
  Plus,
  Brain,
  RefreshCw,
  X,
  Wallet,
  Edit3,
  Check,
  ShoppingCart,
  ArrowRightLeft
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { CSVImportModal } from './CSVImportModal';
import { useAppStore } from '../store/useAppStore';
import { marketDataService } from '../services/marketData';
import emailjs from '@emailjs/browser';
import type { UserPosition, AnalysisHistoryEntry } from '../types';

interface SymbolSuggestion {
  symbol: string;
  name: string;
  price?: number;
  changePercent?: number;
  loading?: boolean;
}

type PortfolioChartRange = '1d' | '5d' | '1mo' | '1y';

interface PortfolioHistoryPoint {
  timestamp: number;
  label: string;
  value: number;
  changePercent: number;
}

const HISTORY_CACHE_TTL_MS = 10 * 60 * 1000;
const PORTFOLIO_CHART_RANGES: PortfolioChartRange[] = ['1d', '5d', '1mo', '1y'];

// Trade-Historie Subkomponente
function TradeHistory() {
  const { tradeHistory, clearTradeHistory } = useAppStore();
  const [showAll, setShowAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  if (tradeHistory.length === 0) return null;

  const displayedTrades = showAll ? tradeHistory : tradeHistory.slice(0, 10);

  return (
    <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-gray-700/30 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <ArrowRightLeft size={18} className="text-purple-400" />
          Trade-Historie
          <span className="text-xs text-gray-500 font-normal">({tradeHistory.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {confirmClear ? (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-red-400">Alles löschen?</span>
              <button
                onClick={() => { clearTradeHistory(); setConfirmClear(false); }}
                className="p-1 text-red-400 hover:bg-red-500/20 rounded"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="p-1 text-gray-400 hover:bg-gray-500/20 rounded"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10"
              title="Historie löschen"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700/50">
              <th className="text-left py-2 px-2 font-medium">Datum</th>
              <th className="text-center py-2 px-2 font-medium">Typ</th>
              <th className="text-left py-2 px-2 font-medium">Symbol</th>
              <th className="text-right py-2 px-2 font-medium">Stück</th>
              <th className="text-right py-2 px-2 font-medium">Preis</th>
              <th className="text-right py-2 px-2 font-medium">Gesamt</th>
              <th className="text-right py-2 px-2 font-medium">Gebühren</th>
              <th className="text-center py-2 px-2 font-medium">Quelle</th>
            </tr>
          </thead>
          <tbody>
            {displayedTrades.map(trade => (
              <tr key={trade.id} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                <td className="py-2 px-2 text-gray-300 text-xs">
                  {new Date(trade.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="text-center py-2 px-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    trade.type === 'buy' 
                      ? 'bg-green-500/10 text-green-400' 
                      : 'bg-red-500/10 text-red-400'
                  }`}>
                    {trade.type === 'buy' ? '↑ Kauf' : '↓ Verkauf'}
                  </span>
                </td>
                <td className="py-2 px-2">
                  <span className="text-white font-medium">{trade.symbol}</span>
                  {trade.name !== trade.symbol && (
                    <span className="text-gray-500 text-xs block">{trade.name}</span>
                  )}
                </td>
                <td className="text-right py-2 px-2 text-gray-300">{trade.quantity}</td>
                <td className="text-right py-2 px-2 text-gray-300">
                  {trade.price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </td>
                <td className="text-right py-2 px-2">
                  <span className={trade.type === 'buy' ? 'text-red-300' : 'text-green-300'}>
                    {trade.type === 'buy' ? '-' : '+'}{trade.totalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </span>
                </td>
                <td className="text-right py-2 px-2 text-gray-500 text-xs">
                  {trade.fees > 0 ? `-${trade.fees.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '–'}
                </td>
                <td className="text-center py-2 px-2">
                  <span className={`text-xs ${trade.source === 'order' ? 'text-blue-400' : 'text-gray-500'}`}>
                    {trade.source === 'order' ? 'Order' : 'Manuell'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tradeHistory.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/30 rounded-lg transition"
        >
          {showAll ? 'Weniger anzeigen' : `Alle ${tradeHistory.length} Trades anzeigen`}
        </button>
      )}
    </div>
  );
}

export function Portfolio() {
  const { 
    settings, 
    userPositions, 
    addUserPosition, 
    updateUserPosition,
    removeUserPosition,
    watchlist,
    cashBalance,
    setCashBalance,
    setError,
    orderSettings
  } = useAppStore();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const { lastAnalysis: analysisResult, lastAnalysisDate, setLastAnalysis: setAnalysisResult, addAnalysisHistory, isAnalyzing: analyzing, setAnalyzing } = useAppStore();
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState('');
  const [editingPosition, setEditingPosition] = useState<string | null>(null);
  const [editSymbol, setEditSymbol] = useState('');
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');

  const [editingBuyPrice, setEditingBuyPrice] = useState<string | null>(null);
  const [editBuyPriceValue, setEditBuyPriceValue] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState<{ step: string; detail: string; percent: number } | null>(null);
  const [tradeAction, setTradeAction] = useState<{ positionId: string; type: 'buy' | 'sell' } | null>(null);
  const [tradeQuantity, setTradeQuantity] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [yahooPrices, setYahooPrices] = useState<Record<string, number>>({});
  const [loadingYahooPrices, setLoadingYahooPrices] = useState(false);
  const [symbolSuggestions, setSymbolSuggestions] = useState<SymbolSuggestion[]>([]);
  const [searchingSymbol, setSearchingSymbol] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const symbolSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historicalDataCacheRef = useRef<Record<string, { data: Array<{ date: Date; close: number }>; fetchedAt: number }>>({});
  const [portfolioChartRange, setPortfolioChartRange] = useState<PortfolioChartRange>('1mo');
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [loadingPortfolioHistory, setLoadingPortfolioHistory] = useState(false);
  const [portfolioHistoryCacheVersion, setPortfolioHistoryCacheVersion] = useState(0);
  
  // Form state
  const [formData, setFormData] = useState({
    symbol: '',
    isin: '',
    name: '',
    quantity: '',
    buyPrice: '',
    currentPrice: '',
    currency: 'EUR'
  });

  // Berechne verfügbares Cash (abzgl. reserviertes Cash durch aktive/pendende Kauf-Orders)
  const getAvailableCash = () => {
    const store = useAppStore.getState();
    const currentCash = store.cashBalance;
    const reservedCash = store.orders
      .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy'))
      .reduce((sum, o) => {
        const oCost = o.triggerPrice * o.quantity;
        const oFee = (orderSettings.transactionFeeFlat || 0) + oCost * (orderSettings.transactionFeePercent || 0) / 100;
        return sum + oCost + oFee;
      }, 0);
    return { currentCash, reservedCash, availableCash: currentCash - reservedCash };
  };

  // Berechne verfügbare Stücke (abzgl. reservierter Stücke durch aktive/pendende Sell-Orders)
  const getAvailableShares = (symbol: string, totalQuantity: number) => {
    const store = useAppStore.getState();
    const reservedShares = store.orders
      .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss') && o.symbol === symbol)
      .reduce((sum, o) => sum + o.quantity, 0);
    return { reservedShares, availableShares: totalQuantity - reservedShares };
  };

  // Execute instant trade at current market price
  const executeTrade = (positionId: string, type: 'buy' | 'sell', quantity: number, customPrice?: number) => {
    const position = userPositions.find(p => p.id === positionId);
    if (!position || quantity <= 0) return;

    const price = customPrice ?? yahooPrices[positionId] ?? position.currentPrice;
    const totalCost = price * quantity;
    
    // Transaktionsgebühren berechnen
    const fee = (orderSettings.transactionFeeFlat || 0) + totalCost * (orderSettings.transactionFeePercent || 0) / 100;

    // WICHTIG: Immer den aktuellen Cash-Wert aus dem Store lesen (nicht aus der Closure!)
    const { currentCash, reservedCash, availableCash } = getAvailableCash();

    if (type === 'buy') {
      if (totalCost + fee > availableCash) {
        setError(`Nicht genügend Cash. Benötigt: ${(totalCost + fee).toFixed(2)} € (inkl. ${fee.toFixed(2)} € Gebühren), Verfügbar: ${availableCash.toFixed(2)} €${reservedCash > 0 ? ` (${reservedCash.toFixed(2)} € reserviert durch aktive Orders)` : ''}`);
        return;
      }
      // Nachkaufen: Durchschnittspreis berechnen
      const newTotalQty = position.quantity + quantity;
      const avgBuyPrice = (position.buyPrice * position.quantity + price * quantity) / newTotalQty;
      updateUserPosition(positionId, { quantity: newTotalQty, buyPrice: avgBuyPrice, currentPrice: price });
      setCashBalance(currentCash - totalCost - fee);

      // Trade-History erfassen (Kauf)
      useAppStore.getState().addTradeHistory({
        id: crypto.randomUUID(),
        type: 'buy',
        symbol: position.symbol,
        name: position.name,
        quantity,
        price,
        totalAmount: totalCost,
        fees: fee,
        date: new Date().toISOString(),
        source: 'manual',
      });
    } else {
      const { reservedShares, availableShares } = getAvailableShares(position.symbol, position.quantity);
      if (quantity > availableShares) {
        setError(`Nicht genügend verfügbare Aktien. Gesamt: ${position.quantity}${reservedShares > 0 ? `, davon ${reservedShares} reserviert durch aktive Sell-Orders` : ''}, verfügbar: ${availableShares}`);
        return;
      }

      // Steuer-Transaktion erfassen (Verkauf)
      const sellDate = new Date();
      const gainLoss = (price - position.buyPrice) * quantity - fee;
      // Haltedauer: Approximation - Position hat kein explizites Kaufdatum,
      // verwende das aktuelle Datum minus eine geschätzte Haltedauer
      // Für manuelle Trades: Haltedauer unbekannt, User kann im Steuer-Tab korrigieren
      const holdingDays = 0; // Unbekannt bei manuellen Positionen
      const taxFree = holdingDays >= 183;
      useAppStore.getState().addTaxTransaction({
        id: crypto.randomUUID(),
        symbol: position.symbol,
        name: position.name,
        quantity,
        buyPrice: position.buyPrice,
        sellPrice: price,
        buyDate: sellDate.toISOString(), // Kaufdatum unbekannt, wird als Verkaufsdatum gesetzt
        sellDate: sellDate.toISOString(),
        gainLoss,
        fees: fee,
        holdingDays,
        taxFree,
      });

      const newQty = position.quantity - quantity;
      if (newQty <= 0) {
        // Position komplett verkaufen
        removeUserPosition(positionId);
      } else {
        updateUserPosition(positionId, { quantity: newQty, currentPrice: price });
      }
      setCashBalance(currentCash + totalCost - fee);

      // Trade-History erfassen (Verkauf)
      useAppStore.getState().addTradeHistory({
        id: crypto.randomUUID(),
        type: 'sell',
        symbol: position.symbol,
        name: position.name,
        quantity,
        price,
        totalAmount: totalCost,
        fees: fee,
        date: new Date().toISOString(),
        source: 'manual',
      });
    }
    setTradeAction(null);
    setTradeQuantity('');
    setTradePrice('');
  };

  // Calculate totals
  const totalInvested = userPositions.reduce((sum, p) => sum + (p.quantity * p.buyPrice), 0);
  const totalCurrentValue = userPositions.reduce((sum, p) => sum + (p.quantity * p.currentPrice), 0);
  const totalProfitLoss = totalCurrentValue - totalInvested;
  const totalProfitLossPercent = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

  // Timestamp for last update
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch Yahoo prices function - extracted for manual refresh
  const fetchYahooPrices = async () => {
    if (userPositions.length === 0) return;
    
    console.log('[Yahoo] Fetching prices for', userPositions.length, 'positions...');
    setLoadingYahooPrices(true);
    const prices: Record<string, number> = {};
    
    // Get current positions from store to avoid stale closure
    const currentPositions = useAppStore.getState().userPositions;
    
    for (const position of currentPositions) {
      const symbolToFetch = position.symbol && position.symbol !== position.isin 
        ? position.symbol 
        : position.isin || position.symbol;
      
      console.log('[Yahoo] Fetching:', symbolToFetch);
      try {
        const quote = await marketDataService.getQuote(symbolToFetch);
        console.log('[Yahoo] Result for', symbolToFetch, ':', quote);
        if (quote && quote.price > 0 && !isNaN(quote.price)) {
          prices[position.id] = quote.price;
          // Auto-update if useYahooPrice is enabled
          if (position.useYahooPrice) {
            console.log('[Yahoo] Auto-updating position', position.id, 'to price:', quote.price);
            useAppStore.getState().updateUserPosition(position.id, { currentPrice: quote.price });
          }
        }
      } catch (e) {
        console.error('[Yahoo] Error fetching', symbolToFetch, ':', e);
      }
    }
    
    console.log('[Yahoo] Final prices:', prices);
    setYahooPrices(prices);
    setLoadingYahooPrices(false);
    setLastUpdate(new Date());
  };

  // Fetch Yahoo Finance prices for comparison
  useEffect(() => {
    // Fetch immediately on mount
    fetchYahooPrices();
    
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchYahooPrices, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch when positions change or useYahooPrice toggles change
  const positionCount = userPositions.length;
  const yahooEnabledSignature = userPositions.map(p => `${p.id}:${p.useYahooPrice}`).join(',');
  const portfolioSymbolSignature = userPositions
    .map((p) => p.symbol.trim())
    .filter(Boolean)
    .sort()
    .join('|');
  const portfolioQuantitySignature = userPositions
    .map(p => `${p.id}:${p.quantity}`)
    .sort()
    .join('|');

  const isHistoryCacheFresh = (range: PortfolioChartRange, symbol: string, now = Date.now()) => {
    const cached = historicalDataCacheRef.current[`${range}:${symbol}`];
    return !!cached && (now - cached.fetchedAt) <= HISTORY_CACHE_TTL_MS;
  };
  
  useEffect(() => {
    if (positionCount > 0) {
      console.log('[Yahoo] Positions or settings changed, refetching...');
      fetchYahooPrices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionCount, yahooEnabledSignature]);

  useEffect(() => {
    let isCancelled = false;

    const loadMissingPortfolioHistory = async () => {
      const symbols = [...new Set(userPositions.map((p) => p.symbol.trim()).filter(Boolean))];
      if (symbols.length === 0) {
        setLoadingPortfolioHistory(false);
        return;
      }

      const now = Date.now();
      const symbolsToFetch = symbols.filter((symbol) => {
        return !isHistoryCacheFresh(portfolioChartRange, symbol, now);
      });

      if (symbolsToFetch.length === 0) {
        return;
      }

      setLoadingPortfolioHistory(true);
      try {
        const fetched = await Promise.all(
          symbolsToFetch.map(async (symbol) => {
            try {
              const history = await marketDataService.getHistoricalData(symbol, portfolioChartRange);
              return { symbol, history };
            } catch (error) {
              console.warn(`[Portfolio] Verlauf nicht verfügbar für ${symbol}:`, error);
              return { symbol, history: [] as Array<{ date: Date; close: number }> };
            }
          })
        );

        if (isCancelled) {
          return;
        }

        const fetchedAt = Date.now();
        fetched.forEach(({ symbol, history }) => {
          historicalDataCacheRef.current[`${portfolioChartRange}:${symbol}`] = {
            data: history,
            fetchedAt,
          };
        });

        setPortfolioHistoryCacheVersion((prev) => prev + 1);
      } finally {
        if (!isCancelled) {
          setLoadingPortfolioHistory(false);
        }
      }
    };

    loadMissingPortfolioHistory();
    return () => {
      isCancelled = true;
    };
  }, [portfolioChartRange, portfolioSymbolSignature, userPositions]);

  useEffect(() => {
    let isCancelled = false;

    const symbols = [...new Set(userPositions.map((p) => p.symbol.trim()).filter(Boolean))];
    if (symbols.length === 0) {
      return;
    }

    const prefetchRanges = PORTFOLIO_CHART_RANGES.filter((range) => range !== portfolioChartRange);

    const prefetchInBackground = async () => {
      // Kleine Verzögerung, damit aktive UI-Requests Vorrang haben.
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (isCancelled) return;

      for (const range of prefetchRanges) {
        if (isCancelled) break;

        const now = Date.now();
        const symbolsToFetch = symbols.filter((symbol) => !isHistoryCacheFresh(range, symbol, now));
        if (symbolsToFetch.length === 0) {
          continue;
        }

        const chunkSize = 4;
        for (let i = 0; i < symbolsToFetch.length; i += chunkSize) {
          if (isCancelled) break;

          const chunk = symbolsToFetch.slice(i, i + chunkSize);
          const results = await Promise.allSettled(
            chunk.map((symbol) => marketDataService.getHistoricalData(symbol, range))
          );

          if (isCancelled) break;

          const fetchedAt = Date.now();
          results.forEach((result, index) => {
            if (result.status !== 'fulfilled') return;
            const symbol = chunk[index];
            historicalDataCacheRef.current[`${range}:${symbol}`] = {
              data: result.value,
              fetchedAt,
            };
          });
        }
      }
    };

    prefetchInBackground();
    return () => {
      isCancelled = true;
    };
  }, [portfolioChartRange, portfolioSymbolSignature, userPositions]);

  useEffect(() => {
    if (userPositions.length === 0) {
      setPortfolioHistory([]);
      return;
    }

    const getBucketKey = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hour = String(date.getHours()).padStart(2, '0');
      const minute = String(date.getMinutes()).padStart(2, '0');
      return portfolioChartRange === '1d'
        ? `${year}-${month}-${day} ${hour}:${minute}`
        : `${year}-${month}-${day}`;
    };

    const formatLabel = (date: Date): string => {
      if (portfolioChartRange === '1d') {
        return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      }
      if (portfolioChartRange === '5d') {
        return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit' });
      }
      if (portfolioChartRange === '1mo') {
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
      }
      return date.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
    };

    const allBuckets = new Map<string, number>();
    const symbolSeries = userPositions.map((position) => {
      const symbol = position.symbol.trim();
      const cacheKey = `${portfolioChartRange}:${symbol}`;
      const history = historicalDataCacheRef.current[cacheKey]?.data ?? [];
      const pointByKey = new Map<string, number>();

      let firstKnownPrice = 0;
      history
        .filter((point) => point.close > 0)
        .forEach((point) => {
          const date = point.date instanceof Date ? point.date : new Date(point.date);
          const key = getBucketKey(date);
          const ts = date.getTime();

          if (!allBuckets.has(key) || ts < (allBuckets.get(key) ?? Number.MAX_SAFE_INTEGER)) {
            allBuckets.set(key, ts);
          }
          if (!pointByKey.has(key)) {
            pointByKey.set(key, point.close);
          }
          if (firstKnownPrice === 0) {
            firstKnownPrice = point.close;
          }
        });

      return {
        quantity: position.quantity,
        lastKnownPrice: firstKnownPrice > 0 ? firstKnownPrice : position.currentPrice,
        pointByKey,
      };
    });

    const sortedBuckets = [...allBuckets.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([key, timestamp]) => ({ key, timestamp }));

    if (sortedBuckets.length === 0) {
      const fallbackValue = userPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
      setPortfolioHistory([
        {
          timestamp: Date.now(),
          label: 'Jetzt',
          value: fallbackValue,
          changePercent: 0,
        },
      ]);
      return;
    }

    const chartPointsRaw: Omit<PortfolioHistoryPoint, 'changePercent'>[] = sortedBuckets.map((bucket) => {
      let totalValue = 0;

      symbolSeries.forEach((series) => {
        const pointValue = series.pointByKey.get(bucket.key);
        if (typeof pointValue === 'number') {
          series.lastKnownPrice = pointValue;
        }
        totalValue += (series.lastKnownPrice || 0) * series.quantity;
      });

      return {
        timestamp: bucket.timestamp,
        label: formatLabel(new Date(bucket.timestamp)),
        value: Math.max(0, totalValue),
      };
    });

    const baseValue = chartPointsRaw[0]?.value ?? 0;
    const chartPoints: PortfolioHistoryPoint[] = chartPointsRaw.map((point) => ({
      ...point,
      changePercent: baseValue > 0 ? ((point.value - baseValue) / baseValue) * 100 : 0,
    }));
    setPortfolioHistory(chartPoints);
  }, [portfolioChartRange, portfolioSymbolSignature, portfolioQuantitySignature, portfolioHistoryCacheVersion, userPositions]);

  const portfolioHistoryStart = portfolioHistory.length > 0 ? portfolioHistory[0].value : 0;
  const portfolioHistoryEnd = portfolioHistory.length > 0 ? portfolioHistory[portfolioHistory.length - 1].value : 0;
  const portfolioHistoryDiff = portfolioHistoryEnd - portfolioHistoryStart;
  const portfolioHistoryDiffPercent = portfolioHistoryStart > 0 ? (portfolioHistoryDiff / portfolioHistoryStart) * 100 : 0;

  // Symbol search with debounce
  const handleSymbolSearch = (query: string) => {
    setFormData(prev => ({ ...prev, symbol: query }));
    
    if (symbolSearchTimeout.current) {
      clearTimeout(symbolSearchTimeout.current);
    }
    
    if (query.trim().length < 1) {
      setSymbolSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    setShowSuggestions(true);
    symbolSearchTimeout.current = setTimeout(async () => {
      setSearchingSymbol(true);
      try {
        const results = await marketDataService.searchStocks(query);
        // Show results immediately, then fetch prices
        const suggestions: SymbolSuggestion[] = results.slice(0, 6).map(r => ({
          ...r,
          loading: true,
        }));
        setSymbolSuggestions(suggestions);
        
        // Fetch prices for each result
        const withPrices = await Promise.all(
          suggestions.map(async (s) => {
            try {
              const quote = await marketDataService.getQuote(s.symbol);
              return {
                ...s,
                price: quote?.price,
                changePercent: quote?.changePercent,
                loading: false,
              };
            } catch {
              return { ...s, loading: false };
            }
          })
        );
        setSymbolSuggestions(withPrices);
      } catch (error) {
        console.error('Symbol search failed:', error);
      } finally {
        setSearchingSymbol(false);
      }
    }, 400);
  };

  const selectSuggestion = (suggestion: SymbolSuggestion) => {
    setFormData(prev => ({
      ...prev,
      symbol: suggestion.symbol,
      name: suggestion.name,
      currentPrice: suggestion.price ? suggestion.price.toFixed(2) : prev.currentPrice,
    }));
    setShowSuggestions(false);
    setSymbolSuggestions([]);
  };

  const [addingPosition, setAddingPosition] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const handleAddPosition = async () => {
    if ((!formData.symbol && !formData.isin) || !formData.quantity || !formData.currentPrice) {
      return;
    }

    const quantity = parseFloat(formData.quantity);
    let buyPrice: number;

    // Kaufpreis automatisch ermitteln, wenn nicht angegeben
    if (formData.buyPrice && parseFloat(formData.buyPrice) > 0) {
      buyPrice = parseFloat(formData.buyPrice);
    } else {
      setAddingPosition(true);
      try {
        const symbol = formData.symbol || formData.isin;
        const quote = await marketDataService.getQuote(symbol);
        if (quote && quote.price > 0) {
          buyPrice = quote.price;
        } else {
          // Fallback: aktuellen Preis aus dem Formular verwenden
          buyPrice = parseFloat(formData.currentPrice);
        }
      } catch {
        // Fallback: aktuellen Preis aus dem Formular verwenden
        buyPrice = parseFloat(formData.currentPrice);
      } finally {
        setAddingPosition(false);
      }
    }

    const totalCost = buyPrice * quantity;
    
    // Transaktionsgebühren berechnen
    const fee = (orderSettings.transactionFeeFlat || 0) + totalCost * (orderSettings.transactionFeePercent || 0) / 100;

    // WICHTIG: Immer den aktuellen Cash-Wert aus dem Store lesen (nicht aus der Closure!)
    const { currentCash, reservedCash, availableCash } = getAvailableCash();

    // Cash-Prüfung (inkl. reserviertes Cash durch aktive Kauf-Orders)
    if (totalCost + fee > availableCash) {
      setError(`Nicht genügend Cash. Benötigt: ${(totalCost + fee).toFixed(2)} € (inkl. ${fee.toFixed(2)} € Gebühren), Verfügbar: ${availableCash.toFixed(2)} €${reservedCash > 0 ? ` (${reservedCash.toFixed(2)} € reserviert durch aktive Orders)` : ''}`);
      return;
    }

    const newPosition: UserPosition = {
      id: `pos-${Date.now()}`,
      symbol: formData.symbol.toUpperCase() || formData.isin.toUpperCase(),
      isin: formData.isin.toUpperCase() || undefined,
      name: formData.name || formData.symbol.toUpperCase() || formData.isin.toUpperCase(),
      quantity,
      buyPrice,
      currentPrice: parseFloat(formData.currentPrice),
      currency: formData.currency
    };

    addUserPosition(newPosition);
    setCashBalance(currentCash - totalCost - fee);
    setFormData({ symbol: '', isin: '', name: '', quantity: '', buyPrice: '', currentPrice: '', currency: 'EUR' });
    setShowAddForm(false);
  };

  const getProfitLoss = (position: UserPosition) => {
    const invested = position.quantity * position.buyPrice;
    const current = position.quantity * position.currentPrice;
    return {
      absolute: current - invested,
      percent: ((current - invested) / invested) * 100
    };
  };

  // AI Portfolio Analysis
  const analyzePortfolio = async () => {
    const activeApiKey = settings.aiProvider === 'openai' 
      ? settings.apiKeys.openai 
      : settings.aiProvider === 'gemini'
      ? settings.apiKeys.gemini
      : settings.apiKeys.claude;
    const providerName = settings.aiProvider === 'openai' ? 'OpenAI' : settings.aiProvider === 'gemini' ? 'Google Gemini' : 'Claude';
    
    if (!activeApiKey) {
      setError(`Bitte füge deinen ${providerName} API-Schlüssel in den Einstellungen hinzu.`);
      return;
    }

    if (userPositions.length === 0 && watchlist.length === 0) {
      setError('Füge zuerst Positionen zu deinem Portfolio oder Aktien zur Watchlist hinzu.');
      return;
    }

    setAnalyzing(true);
    setAnalysisProgress({ step: 'Vorbereitung', detail: 'Starte Portfolio-Analyse...', percent: 0 });
    // Alte Analyse NICHT löschen, damit sie während des Ladens sichtbar bleibt
    // setAnalysisResult(null); — wird erst bei Erfolg überschrieben

    try {
      // 52-Wochen-Daten laden (wie Autopilot) für konsistente Analyse
      setAnalysisProgress({ step: 'Marktdaten', detail: '52-Wochen-Daten & technische Indikatoren laden...', percent: 5 });
      const portfolioSymbols = userPositions.map(p => p.symbol);
      const watchlistSymbolsList = watchlist.map(s => s.symbol);
      const allSymbolsForQuotes = [...new Set([...portfolioSymbols, ...watchlistSymbolsList])];
      let stocksWithRange: import('../types').Stock[] = [];
      try {
        stocksWithRange = await marketDataService.getQuotesWithRange(allSymbolsForQuotes);
      } catch (e) {
        console.warn('[Portfolio] Konnte 52W-Daten nicht laden, fahre ohne fort:', e);
      }

      // Build portfolio context with 52-week data and technical indicators (harmonized with Autopilot)
      setAnalysisProgress({ step: 'Portfolio-Kontext', detail: `${userPositions.length} Positionen mit Kursen, P/L & Indikatoren aufbereiten...`, percent: 15 });
      const portfolioSummary = userPositions.length > 0 ? userPositions.map(p => {
        const pl = getProfitLoss(p);
        const identifier = p.isin ? `${p.name} (ISIN: ${p.isin})` : `${p.symbol} (${p.name})`;
        let info = `${identifier}: ${p.quantity} Stück, Kaufpreis: ${p.buyPrice.toFixed(2)} ${p.currency}, Aktuell: ${p.currentPrice.toFixed(2)} ${p.currency}, P/L: ${pl.percent >= 0 ? '+' : ''}${pl.percent.toFixed(2)}% (${pl.absolute >= 0 ? '+' : ''}${pl.absolute.toFixed(2)} ${p.currency})`;
        
        // 52-Wochen-Daten hinzufügen (ohne wertende Labels — die KI soll selbst bewerten)
        const stockData = stocksWithRange.find(s => s.symbol === p.symbol);
        if (stockData?.week52High && stockData?.week52Low) {
          const positionInRange = stockData.week52ChangePercent ?? 0;
          info += ` | 52W: ${stockData.week52Low.toFixed(2)}-${stockData.week52High.toFixed(2)} (${positionInRange.toFixed(0)}% im Bereich)`;
        }
        // Technische Indikatoren hinzufügen (gleich wie aiService)
        if (stockData?.technicalIndicators) {
          const ti = stockData.technicalIndicators;
          const parts: string[] = [];
          if (ti.rsi14 !== null) parts.push(`RSI: ${ti.rsi14.toFixed(1)}`);
          if (ti.macdHistogram !== null) parts.push(`MACD-Hist: ${ti.macdHistogram > 0 ? '+' : ''}${ti.macdHistogram.toFixed(2)}`);
          if (ti.sma200 !== null) parts.push(`SMA200: ${ti.sma200.toFixed(2)}`);
          if (ti.bollingerPercentB !== null) parts.push(`BB%B: ${(ti.bollingerPercentB * 100).toFixed(0)}%`);
          if (parts.length > 0) info += ` | ${parts.join(', ')}`;
        }
        return info;
      }).join('\n') : 'Noch keine Positionen im Portfolio.';

      // Direct API call for portfolio analysis - use selected provider
      const isOpenAI = settings.aiProvider === 'openai';
      const isGemini = settings.aiProvider === 'gemini';
      const apiUrl = isOpenAI 
        ? 'https://api.openai.com/v1/chat/completions'
        : isGemini
        ? `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel || 'gemini-2.5-flash'}:generateContent?key=${activeApiKey}`
        : 'https://api.anthropic.com/v1/messages';
      const apiHeaders: Record<string, string> = isOpenAI
        ? {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeApiKey}`,
          }
        : isGemini
        ? {
            'Content-Type': 'application/json',
          }
        : {
            'Content-Type': 'application/json',
            'x-api-key': activeApiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          };

      // Build watchlist context (stocks NOT in portfolio, for new recommendations)
      // Mit 52W-Daten und technischen Indikatoren angereichert (harmonisiert mit Autopilot/aiService)
      setAnalysisProgress({ step: 'Watchlist', detail: `${watchlist.length} Watchlist-Aktien mit Kursdaten & Indikatoren aufbereiten...`, percent: 25 });
      const portfolioSymbolsUpper = userPositions.map(p => p.symbol.toUpperCase());
      const watchlistOnly = watchlist.filter(s => !portfolioSymbolsUpper.includes(s.symbol.toUpperCase()));
      const watchlistSummary = watchlistOnly.length > 0
        ? watchlistOnly.map(s => {
            const stockData = stocksWithRange.find(sq => sq.symbol === s.symbol);
            let info = `${s.symbol} (${s.name}): ${(stockData?.price ?? s.price)?.toFixed(2) ?? '?'} ${s.currency} (${(stockData?.changePercent ?? s.changePercent) != null ? ((stockData?.changePercent ?? s.changePercent!) >= 0 ? '+' : '') + (stockData?.changePercent ?? s.changePercent!).toFixed(2) + '%' : '?'})`;
            if (stockData?.week52High && stockData?.week52Low) {
              const posInRange = stockData.week52ChangePercent ?? 0;
              info += ` | 52W: ${stockData.week52Low.toFixed(2)}-${stockData.week52High.toFixed(2)} (${posInRange.toFixed(0)}% im Bereich)`;
            }
            // Technische Indikatoren hinzufügen
            if (stockData?.technicalIndicators) {
              const ti = stockData.technicalIndicators;
              const parts: string[] = [];
              if (ti.rsi14 !== null) parts.push(`RSI: ${ti.rsi14.toFixed(1)}`);
              if (ti.macdHistogram !== null) parts.push(`MACD-Hist: ${ti.macdHistogram > 0 ? '+' : ''}${ti.macdHistogram.toFixed(2)}`);
              if (ti.sma200 !== null) parts.push(`SMA200: ${ti.sma200.toFixed(2)}`);
              if (ti.bollingerPercentB !== null) parts.push(`BB%B: ${(ti.bollingerPercentB * 100).toFixed(0)}%`);
              if (parts.length > 0) info += ` | ${parts.join(', ')}`;
            }
            return info;
          }).join('\n')
        : 'Keine Watchlist-Aktien vorhanden.';

      // Live-News-Snapshot für aktuelle Makro-/Geopolitik-Lage einbinden
      setAnalysisProgress({ step: 'Live-News', detail: 'Aktuelle Makro- und Geopolitik-Headlines laden...', percent: 30 });
      let liveNewsContext = `
═══════════════════════════════════════
🗞️ LIVE-NEWS-SNAPSHOT (Makro & Geopolitik):
═══════════════════════════════════════
Keine Live-News verfügbar.

STRIKT VERBOTEN:
- Erfinde KEINE geopolitischen Ereignisse, Kriege, Konflikte oder Makro-Entwicklungen.
- Behaupte NICHT, dass bestimmte Kriege andauern, Zentralbanken bestimmte Entscheidungen getroffen haben, oder geopolitische Spannungen bestehen – du hast KEINE aktuellen Informationen darüber.
- Schreibe im marketSummary EXPLIZIT: "Hinweis: Keine aktuellen Nachrichten verfügbar. Die Analyse basiert ausschließlich auf technischen Indikatoren und Kursdaten. Geopolitische/makroökonomische Einschätzungen können nicht gegeben werden."
- Beschränke die Analyse auf technische Indikatoren, Kursdaten und Chartmuster.
`;
      try {
        // News-Abruf: versucht Finnhub (mit Key) oder Yahoo Finance (ohne Key)
        marketDataService.setApiKey(settings.apiKeys.marketData || '');
        const rawNews = await marketDataService.getMarketNews();

          const toDateLabel = (item: any) => {
            const epoch = typeof item?.datetime === 'number' ? item.datetime * 1000 : NaN;
            const d = Number.isFinite(epoch) ? new Date(epoch) : new Date();
            return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          };

          // Scoring: Boost für offensichtlich marktrelevante News, aber ALLE Headlines
          // werden berücksichtigt – die KI entscheidet selbst was relevant ist.
          const highRelevancePattern = /(krieg|war|conflict|sanktion|inflat|zins|rate|rezession|börse|stock|oil|öl|fed|ecb|ezb|gdp|bip|trade|zoll|tariff|crash|rally|default|schulden|debt|bank|energy|energie|nuclear|nuklear|attack|angriff|pandem|climate|klima)/i;

          const normalizedNews = (rawNews || [])
            .map((n: any) => {
              const headline = (n?.headline || n?.title || '').replace(/\s+/g, ' ').trim();
              const summary = (n?.summary || '').replace(/\s+/g, ' ').trim();
              const source = (n?.source || 'Unbekannt').toString();
              const dateLabel = toDateLabel(n);
              const text = `${headline} ${summary}`.trim();
              // Booste offensichtlich relevante News, aber schließe andere nicht aus
              let score = 1; // Basis-Score: Jede Headline hat Chance
              if (highRelevancePattern.test(text)) score += 3;
              return { headline, source, dateLabel, text, score };
            })
            .filter((n: any) => n.headline.length > 0)
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, 15);

          if (normalizedNews.length > 0) {
            const newsLines = normalizedNews
              .map((n: any) => `- ${n.dateLabel} | ${n.source}: ${n.headline}`)
              .join('\n');

            liveNewsContext = `
═══════════════════════════════════════
🗞️ LIVE-NEWS-SNAPSHOT (Makro & Geopolitik):
═══════════════════════════════════════
${newsLines}

VERBINDLICHE REGELN FÜR DIE ANALYSE:
- Nutze diese Headlines als primäre tagesaktuelle Ereignisbasis für Makro-/Geopolitik.
- Nenne die 1-3 wichtigsten aktuellen Konflikte/Ereignisse EXPLIZIT beim Namen (nicht nur "geopolitische Spannungen").
- Wenn ein Ereignis im Snapshot enthalten ist, das das Portfolio beeinflusst (z.B. Energie, Handel, Lieferketten, regionale Konflikte), MUSS es im Markt-/Makro-Abschnitt konkret erwähnt werden.
- Erwähne NUR Geopolitik/Makro-Ereignisse die in den obigen Headlines belegt sind. Erfinde KEINE zusätzlichen Konflikte oder Entwicklungen!
- Trenne bestätigte News-Fakten klar von Schlussfolgerungen für das Portfolio.
`;
          }
      } catch (e) {
        console.warn('[Portfolio] Live-News konnten nicht geladen werden, fahre ohne News-Snapshot fort:', e);
      }

      // Build AI memory context from previous analyses
      setAnalysisProgress({ step: 'KI-Gedächtnis', detail: 'Vorherige Analysen & Änderungen seit letzter Analyse auswerten...', percent: 35 });
      const memoryContext = (() => {
        const history = useAppStore.getState().analysisHistory;
        if (history.length === 0) return '';

        const lastEntry = history[0];
        const lastDate = new Date(lastEntry.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        
        // Detect changes since last analysis
        const prevPositions = lastEntry.portfolioSnapshot.positions;
        const currentSymbols = userPositions.map(p => p.symbol.toUpperCase());
        const prevSymbols = prevPositions.map(p => p.symbol.toUpperCase());
        
        const newPositions = userPositions.filter(p => !prevSymbols.includes(p.symbol.toUpperCase()));
        const removedPositions = prevPositions.filter(p => !currentSymbols.includes(p.symbol.toUpperCase()));
        const changedPositions = userPositions.filter(p => {
          const prev = prevPositions.find(pp => pp.symbol.toUpperCase() === p.symbol.toUpperCase());
          if (!prev) return false;
          return prev.quantity !== p.quantity || Math.abs(prev.buyPrice - p.buyPrice) > 0.01;
        });

        const prevCash = lastEntry.portfolioSnapshot.cashBalance;
        const cashChanged = Math.abs(prevCash - cashBalance) > 0.01;

        const prevWatchlistSymbols = lastEntry.watchlistSymbols || [];
        const currentWatchlistSymbols = watchlist.map(s => s.symbol.toUpperCase());
        const newWatchlistItems = currentWatchlistSymbols.filter(s => !prevWatchlistSymbols.includes(s));
        const removedWatchlistItems = prevWatchlistSymbols.filter(s => !currentWatchlistSymbols.includes(s));

        let changes = '';
        if (newPositions.length > 0) {
          changes += `\n✅ NEU GEKAUFT seit letzter Analyse:\n${newPositions.map(p => `  - ${p.name} (${p.symbol}): ${p.quantity} Stück zu ${p.buyPrice.toFixed(2)} ${p.currency}`).join('\n')}`;
        }
        if (removedPositions.length > 0) {
          changes += `\n❌ VERKAUFT seit letzter Analyse:\n${removedPositions.map(p => `  - ${p.name} (${p.symbol}): ${p.quantity} Stück (war zu ${p.buyPrice.toFixed(2)})`).join('\n')}`;
        }
        if (changedPositions.length > 0) {
          changes += `\n🔄 POSITION GEÄNDERT seit letzter Analyse:\n${changedPositions.map(p => {
            const prev = prevPositions.find(pp => pp.symbol.toUpperCase() === p.symbol.toUpperCase())!;
            const qtyChange = p.quantity !== prev.quantity ? ` Menge: ${prev.quantity} → ${p.quantity}` : '';
            const priceChange = Math.abs(prev.buyPrice - p.buyPrice) > 0.01 ? ` Kaufpreis: ${prev.buyPrice.toFixed(2)} → ${p.buyPrice.toFixed(2)}` : '';
            return `  - ${p.name} (${p.symbol}):${qtyChange}${priceChange}`;
          }).join('\n')}`;
        }
        if (cashChanged) {
          changes += `\n💰 CASH GEÄNDERT: ${prevCash.toFixed(2)} EUR → ${cashBalance.toFixed(2)} EUR`;
        }
        if (newWatchlistItems.length > 0) {
          changes += `\n👀 NEU AUF WATCHLIST: ${newWatchlistItems.join(', ')}`;
        }
        if (removedWatchlistItems.length > 0) {
          changes += `\n🗑️ VON WATCHLIST ENTFERNT: ${removedWatchlistItems.join(', ')}`;
        }

        const noChanges = !newPositions.length && !removedPositions.length && !changedPositions.length && !cashChanged && !newWatchlistItems.length && !removedWatchlistItems.length;

        // Smart truncation: preserve buy recommendations section which often appears later in the text
        const buildPrevAnalysisSummary = (text: string, maxLen: number): string => {
          if (text.length <= maxLen) return text;
          
          // Try to find and preserve the "Neue Kaufempfehlungen" / recommendations section
          const recPatterns = [
            /🆕.*?(?:KAUFEMPFEHLUNG|Kaufempfehlung)/i,
            /(?:neue|new).*?(?:kaufempfehlung|empfehlung|recommendation)/i,
            /🎯.*?(?:AKTIONSPLAN|Aktionsplan)/i,
          ];
          
          let recSectionStart = -1;
          for (const pattern of recPatterns) {
            const match = text.search(pattern);
            if (match > maxLen && match !== -1) {
              recSectionStart = match;
              break;
            }
          }
          
          if (recSectionStart > 0) {
            // Include beginning + recommendations section
            const firstPartLen = Math.floor(maxLen * 0.55);
            const secondPartLen = maxLen - firstPartLen - 50; // reserve space for separator
            const firstPart = text.substring(0, firstPartLen);
            const secondPart = text.substring(recSectionStart, recSectionStart + secondPartLen);
            return firstPart + '\n... (Portfolio-Bewertung gekürzt) ...\n' + secondPart + (recSectionStart + secondPartLen < text.length ? '\n... (gekürzt)' : '');
          }
          
          // Fallback: simple truncation with higher limit
          return text.substring(0, maxLen) + '\n... (gekürzt)';
        };
        
        const prevAnalysisTruncated = buildPrevAnalysisSummary(lastEntry.analysisText, 5000);

        return `
═══════════════════════════════════════
🧠 KI-GEDÄCHTNIS: LETZTE ANALYSE (${lastDate})
═══════════════════════════════════════
${prevAnalysisTruncated}

═══════════════════════════════════════
📋 ÄNDERUNGEN SEIT LETZTER ANALYSE:
═══════════════════════════════════════
${noChanges ? '⚪ Keine Änderungen am Portfolio seit der letzten Analyse.' : changes}

WICHTIG FÜR DIESE ANALYSE:
- Beziehe dich auf deine vorherige Analyse und erkenne an, welche Empfehlungen bereits umgesetzt wurden
- Wenn der Nutzer Aktien gekauft hat die du empfohlen hast, bestätige dies positiv
- Wenn Empfehlungen NICHT umgesetzt wurden, wiederhole sie falls noch aktuell, oder aktualisiere sie
- Vermeide es, die gleichen Empfehlungen wortwörtlich zu wiederholen - entwickle die Analyse weiter
- Gib einen kurzen Abschnitt "📝 Umsetzungs-Check" am Anfang, der zusammenfasst was seit letztem Mal passiert ist

`;
      })();

      setAnalysisProgress({ step: 'Autopilot-Signale', detail: 'Letzte Autopilot-Signale für konsistente Bewertung laden...', percent: 40 });
      // Letzte Autopilot-Signale einbinden für Konsistenz zwischen Portfolio und Autopilot
      const autopilotSignalsContext = (() => {
        const allSignals = useAppStore.getState().signals || [];
        const recentSignals = allSignals.slice(0, 10);
        if (recentSignals.length === 0) return '';
        const signalLines = recentSignals.map(s => {
          const age = Math.round((Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60));
          const ageStr = age < 24 ? 'vor ' + age + 'h' : 'vor ' + Math.round(age / 24) + 'd';
          return '- ' + s.stock.symbol + ': ' + s.signal + ' (Konfidenz: ' + s.confidence + '%, ' + ageStr + ') - ' + s.reasoning.substring(0, 120) + '...';
        }).join('\n');
        return '═══════════════════════════════════════\n🤖 LETZTE AUTOPILOT-SIGNALE (für konsistente Bewertung):\n═══════════════════════════════════════\nDiese Signale wurden vom Autopilot-Modul generiert. Deine Portfolio-Analyse sollte mit diesen Einschätzungen konsistent sein, es sei denn neue Informationen rechtfertigen eine Abweichung.\n' + signalLines + '\n\nWICHTIG: Wenn deine Einschätzung von den Autopilot-Signalen abweicht, erkläre warum!\n';
      })();

      setAnalysisProgress({ step: 'Prompt aufbauen', detail: 'Analyse-Anfrage mit allen Faktoren zusammenstellen...', percent: 50 });
      const hasPositions = userPositions.length > 0;
      const promptContent = hasPositions 
        ? `Du bist ein erfahrener Investment-Analyst mit Expertise in technischer Analyse, Fundamentalanalyse, Makroökonomie und Geopolitik. Analysiere mein aktuelles Portfolio ganzheitlich und gib konkrete Empfehlungen.

═══════════════════════════════════════
MEIN PORTFOLIO (NUR diese ${userPositions.length} Positionen besitze ich!):
═══════════════════════════════════════
${portfolioSummary}

GESAMTWERT:
- Investiert: ${totalInvested.toFixed(2)} EUR
- Aktueller Wert: ${totalCurrentValue.toFixed(2)} EUR  
- Gewinn/Verlust: ${totalProfitLoss >= 0 ? '+' : ''}${totalProfitLoss.toFixed(2)} EUR (${totalProfitLossPercent >= 0 ? '+' : ''}${totalProfitLossPercent.toFixed(2)}%)

VERFÜGBARES CASH: ${cashBalance.toFixed(2)} EUR
GESAMTVERMÖGEN (Cash + Portfolio): ${(cashBalance + totalCurrentValue).toFixed(2)} EUR
${(useAppStore.getState().initialCapital || 0) > 0 ? (() => {
  const store = useAppStore.getState();
  const initCap = store.initialCapital;
  const prevProfit = store.previousProfit || 0;
  const currentProfit = (cashBalance + totalCurrentValue) - initCap;
  const combinedProfit = currentProfit + prevProfit;
  return `STARTKAPITAL: ${initCap.toFixed(2)} EUR
GESAMTGEWINN (realisiert + unrealisiert): ${combinedProfit >= 0 ? '+' : ''}${combinedProfit.toFixed(2)} EUR (${(combinedProfit / initCap * 100).toFixed(1)}%)${prevProfit !== 0 ? `
Davon aus früheren Portfolios: ${prevProfit >= 0 ? '+' : ''}${prevProfit.toFixed(2)} EUR` : ''}`;
})() : ''}
${(orderSettings.transactionFeeFlat || orderSettings.transactionFeePercent) ? `TRANSAKTIONSGEBÜHREN: ${orderSettings.transactionFeeFlat ? `${orderSettings.transactionFeeFlat.toFixed(2)} € fix` : ''}${orderSettings.transactionFeeFlat && orderSettings.transactionFeePercent ? ' + ' : ''}${orderSettings.transactionFeePercent ? `${orderSettings.transactionFeePercent}% vom Volumen` : ''} pro Trade
HINWEIS: Berücksichtige die Gebühren bei Kauf-/Verkaufsempfehlungen! Bei kleinen Positionen können Gebühren den Gewinn schmälern.` : ''}

MEINE STRATEGIE:
- Anlagehorizont: ${settings.strategy === 'short' ? 'Kurzfristig (Tage-Wochen)' : settings.strategy === 'middle' ? 'Mittelfristig (Wochen-Monate)' : 'Langfristig (10+ Jahre, Buy & Hold)'}
- Risikotoleranz: ${settings.riskTolerance === 'low' ? 'Konservativ' : settings.riskTolerance === 'medium' ? 'Ausgewogen' : 'Aggressiv'}

${settings.strategy === 'long' ? `═══════════════════════════════════════
📏 BEWERTUNGSREGELN (LANGFRISTIGE STRATEGIE 10+ Jahre):
═══════════════════════════════════════
- Fokus auf Qualitätsunternehmen mit starken Fundamentaldaten und Wettbewerbsvorteilen (Moat)
- Bevorzuge Unternehmen mit: stabilem Gewinnwachstum, niedriger Verschuldung, starker Marktposition
- Dividendenwachstum und Dividendenhistorie sind wichtige Faktoren
- Kurzfristige Kursschwankungen sind weniger relevant - Fokus auf langfristiges Wachstumspotenzial
- Der 52W-Bereich ist bei langfristigen Investments KEIN guter Indikator für Überhitzung
- Nutze stattdessen RSI, MACD und Bollinger Bands zur Bewertung
- Bei langfristigen Investments können auch Aktien nahe dem 52W-Hoch gekauft werden, wenn die Fundamentaldaten stimmen
- Stop-Loss ist bei langfristigen Investments weniger relevant - setze ihn großzügiger (20-30% unter Kaufpreis)
- Berücksichtige Megatrends: Digitalisierung, Gesundheit, erneuerbare Energien, demographischer Wandel
- HALTE Qualitätsaktien langfristig, auch bei Kursrückgängen von 20-30%
- Verkaufe NUR bei fundamentaler Verschlechterung des Unternehmens (nicht wegen Kursschwankungen!)
- Gewinne von 50%, 100% oder mehr sind bei langfristigen Investments NORMAL - KEIN Verkaufsgrund!
- Bei Gewinnern: HALTEN und weiterlaufen lassen, solange Fundamentaldaten stimmen
- Verkaufsempfehlung nur bei: massiver Überbewertung (KGV >50), Verschlechterung der Geschäftsaussichten, bessere Alternativen
- WARNUNG bei: Meme-Stocks, hochspekulative Tech-Aktien ohne Gewinne, Penny Stocks, Krypto-bezogene Aktien` 
: settings.strategy === 'short' ? `═══════════════════════════════════════
📏 BEWERTUNGSREGELN (KURZFRISTIGE STRATEGIE Tage-Wochen):
═══════════════════════════════════════
TECHNISCHE INDIKATOREN (PRIMÄR):
- RSI: <30 = überverkauft (Kaufchance), >70 = überkauft (Vorsicht/Verkauf), 30-70 = neutral
- MACD > Signal = bullishes Momentum, MACD < Signal = bearishes Momentum
- Bollinger %B > 100% = Überdehnung, %B < 0% = überverkauft
- Kurs über SMA200 = langfristiger Aufwärtstrend, SMA50 über SMA200 = Golden Cross

52-WOCHEN-BEREICH (nur Nebenfaktor!):
- Der 52W-Bereich allein sagt NICHTS über Überhitzung aus!
- Aktien in starkem Aufwärtstrend stehen DAUERHAFT nahe dem 52W-Hoch → das ist NORMAL
- Nutze RSI und MACD als primäre Überhitzungs-Indikatoren, nicht den 52W-Bereich
- Eine Aktie bei 95% im 52W-Bereich mit RSI 45 ist NICHT überhitzt
- Eine Aktie bei 60% im 52W-Bereich mit RSI 78 IST überhitzt

KURZFRISTIGE REGELN:
- Technische Indikatoren sind BESONDERS wichtig für Timing
- RSI-Extreme und MACD-Crossovers als Entry/Exit-Signale
- Enge Stop-Loss setzen (ATR-basiert)
- Bei Gewinn >20% UND RSI >70: Empfehle Teilverkauf oder Gewinnmitnahme`
: `═══════════════════════════════════════
📏 BEWERTUNGSREGELN (MITTELFRISTIGE STRATEGIE Wochen-Monate):
═══════════════════════════════════════
TECHNISCHE INDIKATOREN (PRIMÄR):
- RSI: <30 = überverkauft (Kaufchance), >70 = überkauft (Vorsicht/Verkauf), 30-70 = neutral
- MACD > Signal = bullishes Momentum, MACD < Signal = bearishes Momentum
- Bollinger %B > 100% = Überdehnung, %B < 0% = überverkauft
- Kurs über SMA200 = langfristiger Aufwärtstrend, SMA50 über SMA200 = Golden Cross

52-WOCHEN-BEREICH (nur Nebenfaktor!):
- Der 52W-Bereich allein sagt NICHTS über Überhitzung aus!
- Aktien in starkem Aufwärtstrend stehen DAUERHAFT nahe dem 52W-Hoch → das ist NORMAL
- Nutze RSI und MACD als primäre Überhitzungs-Indikatoren, nicht den 52W-Bereich
- Eine Aktie bei 95% im 52W-Bereich mit RSI 45 ist NICHT überhitzt
- Eine Aktie bei 60% im 52W-Bereich mit RSI 78 IST überhitzt

MITTELFRISTIGE REGELN:
- Kombination aus technischer und fundamentaler Analyse
- Trend-Bestätigung über Moving Averages + MACD
- Balance zwischen Wachstum und Risiko
- Achte auf kommende Earnings, Produktlaunches, Branchentrends
- Bei Gewinn >20% UND RSI >70: Empfehle Teilverkauf oder Gewinnmitnahme`}

═══════════════════════════════════════
MEINE WATCHLIST (beobachtete Aktien, die ich NICHT besitze):
═══════════════════════════════════════
${watchlistSummary}

HEUTIGES DATUM: ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

${liveNewsContext}

═══════════════════════════════════════
🌍 GANZHEITLICHE ANALYSE-METHODIK:
═══════════════════════════════════════
Analysiere JEDE Aktie und das Gesamtportfolio aus ALLEN folgenden Perspektiven:

**A) TECHNISCHE ANALYSE** (bereits oben bei den Kursdaten):
- RSI, MACD, SMA, Bollinger Bands → bereits in den Kursdaten enthalten
- Chartmuster, Support/Resistance, Trendlinien

**B) FUNDAMENTALANALYSE:**
- Bewertungskennzahlen: KGV, KUV, KBV, PEG-Ratio — Ist die Aktie fair bewertet?
- Profitabilität: Gewinnmargen, operative Marge, Free Cashflow
- Wachstum: Umsatz- und Gewinnwachstum (YoY), Forward-Guidance
- Bilanzqualität: Verschuldungsgrad (Debt/Equity), Current Ratio, Cash-Position
- Wettbewerbsvorteile: Moat (Marke, Netzwerkeffekte, Switching Costs, Kostenvorteile, Patente)
- Management-Qualität: Track Record, Kapitalallokation, Insider-Transaktionen

**C) MAKROÖKONOMISCHES UMFELD:**
- Zinsentwicklung: Fed/EZB Leitzinsen und deren Auswirkung auf Aktien (Growth vs. Value)
- Inflation: Aktuelle Inflationsrate, Auswirkung auf Unternehmen und Konsumenten
- Konjunkturzyklus: Wo stehen wir im Wirtschaftszyklus? (Expansion, Peak, Rezession, Erholung)
- Anleiherenditen: 10-Jahres-Renditen und Yield Curve — Rezessionssignal?
- Arbeitsmarkt: Beschäftigungslage, Lohnentwicklung, Konsumklima
- Geldpolitik: QE/QT, Bilanzreduktion der Zentralbanken

**D) GEOPOLITISCHE FAKTOREN:**
- Konflikte & Kriege: Auswirkungen auf Energie, Rüstung, Supply Chains
- Handelspolitik: Zölle, Sanktionen, Handelsabkommen (US-China, EU-Regulierung)
- Politische Stabilität: Wahlen, Regierungswechsel, regulatorische Änderungen
- Lieferketten: Engpässe, Reshoring-Trends, China-Risiko, Chip-Embargo
- Energiepolitik: Ölpreis, Gaspreise, Energiewende-Dynamik

**E) SEKTORANALYSE & BRANCHENTRENDS:**
- Sektorrotation: Welche Sektoren sind aktuell bevorzugt? (Zykliker vs. Defensive)
- Branchenspezifische Risiken: Regulierung, Wettbewerb, technologische Disruption
- Megatrends: KI/Machine Learning, Elektromobilität, Gesundheit/Biotech, Cybersecurity, Cloud
- ESG-Faktoren: Nachhaltigkeitsrisiken, CO2-Regulierung, Greenwashing-Risiken

**F) RISIKO- & PORTFOLIOANALYSE:**
- Korrelationsrisiko: Sind Positionen zu stark korreliert? (z.B. mehrere Tech-Aktien)
- Konzentrationsrisiko: Ist eine einzelne Position oder Branche zu dominant?
- Währungsrisiko: EUR/USD-Auswirkungen bei US-Aktien, Hedging-Bedarf
- Liquiditätsrisiko: Handelsvolumen, Spread, Market Cap
- Tail-Risk: Black-Swan-Szenarien, maximaler Drawdown
- Dividendeneigenschaften: Rendite, Ausschüttungsquote, Dividendenwachstum, Ex-Dividend-Termine

**G) MARKTSENTIMENT & TIMING:**
- Marktstimmung: Aktuelles Sentiment (Fear & Greed), VIX-Niveau
- Saisonalität: "Sell in May", Jahresendrallye, Steuereffekte
- Kommende Events: Earnings-Termine, Zentralbank-Sitzungen, Wirtschaftsdaten
- Optionsmarkt-Signale: Put/Call-Ratio, ungewöhnliche Aktivitäten
- Institutional Flow: Sind große Investoren Käufer oder Verkäufer?

WICHTIG: Du musst NICHT zu jedem Punkt bei jeder Aktie etwas sagen. Fokussiere auf die RELEVANTESTEN Faktoren je Aktie. Aber berücksichtige die Makro-/Geopolitik-Lage für das GESAMTPORTFOLIO!

${(() => {
  const activeOrders = useAppStore.getState().orders.filter(o => o.status === 'active');
  if (activeOrders.length === 0) return `═══════════════════════════════════════
📝 AKTIVE ORDERS: KEINE
═══════════════════════════════════════
Der Nutzer hat KEINE aktiven Orders. Behaupte in deiner Analyse NIEMALS, dass eine Order "steht", "existiert" oder "gesetzt ist"! Wenn du eine neue Order empfiehlst, formuliere es klar als NEUE Empfehlung (z.B. "Empfehle Limit-Sell bei X EUR aufzusetzen").
`;
  const orderTypeLabels: Record<string, string> = { 'limit-buy': 'Limit Buy', 'limit-sell': 'Limit Sell', 'stop-loss': 'Stop Loss', 'stop-buy': 'Stop Buy' };
  return `═══════════════════════════════════════
📝 MEINE AKTIVEN ORDERS (diese Orders existieren bereits!):
═══════════════════════════════════════
${activeOrders.map(o => `- ${o.symbol} (${o.name}): ${orderTypeLabels[o.orderType] || o.orderType} | Trigger: ${o.triggerPrice.toFixed(2)} EUR | Menge: ${o.quantity} Stück${o.note ? ` | ${o.note}` : ''}`).join('\n')}

WICHTIG: Empfehle KEINE Orders die bereits oben aufgelistet sind!
- Wenn eine Order für ein Symbol+Typ bereits existiert, erwähne sie NICHT erneut als neue Empfehlung
- Du kannst bestehende Orders bewerten (ob sie noch sinnvoll sind)
- Nur wenn eine bestehende Order angepasst werden sollte, empfehle eine neue mit anderem Trigger-Preis

⚠️ KRITISCH: NUR die oben aufgelisteten Orders existieren tatsächlich! Behaupte NIEMALS, dass eine Order "steht" oder "existiert", wenn sie NICHT in dieser Liste aufgeführt ist. Wenn du eine NEUE Order empfiehlst, formuliere es als Empfehlung (z.B. "Empfehle Limit-Sell bei X EUR aufzusetzen"), NICHT als ob sie bereits existiert!
`;
})()}
${memoryContext}
${autopilotSignalsContext}
═══════════════════════════════════════
AUFGABE:
═══════════════════════════════════════

🌍 **0. MARKT- & MAKRO-LAGEBEURTEILUNG** (kurz und prägnant)
- Aktuelle Makrolage: Zinsen, Inflation, Konjunktur
- Geopolitische Risiken die das Portfolio betreffen könnten (nenne aktuelle Konflikte/Ereignisse explizit beim Namen, wenn im Live-News-Snapshot enthalten)
- Marktsentiment & relevante kommende Events (Earnings, Fed etc.)
- Was bedeutet das für MEIN konkretes Portfolio?

📊 **1. PORTFOLIO-ANALYSE** (NUR meine ${userPositions.length} oben gelisteten Positionen!)
WICHTIG: Analysiere AUSSCHLIESSLICH die Positionen die oben unter "MEIN PORTFOLIO" aufgelistet sind.
Erfinde KEINE zusätzlichen Positionen! Füge KEINE Watchlist-Aktien hier hinzu!

⚠️ DU MUSST JEDE EINZELNE DER ${userPositions.length} POSITIONEN BEWERTEN! Keine auslassen!
Hier ist die vollständige Liste der zu bewertenden Positionen:
${userPositions.map((p, i) => `  ${i + 1}. ${p.name} (${p.symbol})`).join('\n')}

Für JEDE dieser ${userPositions.length} Positionen MUSS eine Bewertung enthalten sein:
- HALTEN, NACHKAUFEN, TEILVERKAUF oder VERKAUFEN
- Technische Lage (RSI, MACD, Trend) + wichtigste Fundamentaldaten
- Makro/Geopolitik-Einfluss falls relevant für diese Aktie
- Konkreter Aktionsvorschlag mit Zielpreis

📈 **2. GESAMTBEWERTUNG**
- Diversifikations-Check (Branchen, Regionen, Währungen, Korrelationen)
- Konzentrationsrisiken (zu viel in einem Sektor/Region?)
- Währungsrisiko-Einschätzung (EUR/USD-Exposure)
- Risiko-Einschätzung des Gesamtportfolios im aktuellen Marktumfeld

🆕 **3. NEUE KAUFEMPFEHLUNGEN** (aus Watchlist und darüber hinaus)
Basierend auf meinem verfügbaren Cash von ${cashBalance.toFixed(2)} EUR und meiner Strategie:
- Prüfe zuerst meine Watchlist-Aktien oben und empfehle die besten daraus
- Ergänze mit weiteren Aktien/ETFs falls nötig (insgesamt 3-5 Empfehlungen)
- Für jede Empfehlung: Name, Ticker-Symbol, aktueller ungefährer Kurs in EUR
- Begründung: Technisch UND fundamental UND Makro-Passung zum aktuellen Umfeld
- Wie passt die Empfehlung zur Diversifikation meines bestehenden Portfolios? (Sektor, Region, Währung)
- Vorgeschlagene Investitionssumme in EUR
- WICHTIG: Empfehle hier KEINE Aktien die ich bereits im Portfolio habe!

📝 **4. BESTEHENDE ORDERS BEWERTEN** (falls vorhanden)
- Sind die aktiven Orders noch sinnvoll?
- Müssen Trigger-Preise angepasst werden?
- Sollten Orders storniert werden?

🎯 **5. AKTIONSPLAN**
- Priorisierte Liste der nächsten Schritte
- Was sofort tun, was beobachten
- WIEDERHOLE KEINE Orders die bereits aktiv sind!

${settings.customPrompt ? `
═══════════════════════════════════════
⚙️ PERSÖNLICHE ANWEISUNGEN (UNBEDINGT BEACHTEN!):
═══════════════════════════════════════
${settings.customPrompt}
` : ''}
Antworte auf Deutsch mit Emojis für bessere Übersicht.`
        : `Du bist ein erfahrener Investment-Analyst mit Expertise in technischer Analyse, Fundamentalanalyse, Makroökonomie und Geopolitik. Ich habe noch keine Positionen im Portfolio und möchte mit dem Investieren beginnen.

═══════════════════════════════════════
MEIN PORTFOLIO:
═══════════════════════════════════════
Noch keine Positionen vorhanden.

VERFÜGBARES CASH: ${cashBalance.toFixed(2)} EUR
${(useAppStore.getState().initialCapital || 0) > 0 ? `STARTKAPITAL: ${useAppStore.getState().initialCapital.toFixed(2)} EUR` : ''}

MEINE STRATEGIE:
- Anlagehorizont: ${settings.strategy === 'short' ? 'Kurzfristig (Tage-Wochen)' : settings.strategy === 'middle' ? 'Mittelfristig (Wochen-Monate)' : 'Langfristig (10+ Jahre, Buy & Hold)'}
- Risikotoleranz: ${settings.riskTolerance === 'low' ? 'Konservativ' : settings.riskTolerance === 'medium' ? 'Ausgewogen' : 'Aggressiv'}

═══════════════════════════════════════
MEINE WATCHLIST (beobachtete Aktien):
═══════════════════════════════════════
${watchlistSummary}

HEUTIGES DATUM: ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

${liveNewsContext}

═══════════════════════════════════════
🌍 GANZHEITLICHE ANALYSE-METHODIK:
═══════════════════════════════════════
Analysiere die Watchlist-Aktien aus ALLEN folgenden Perspektiven:
- **Technische Analyse**: RSI, MACD, SMA, Bollinger Bands, Chartmuster
- **Fundamentalanalyse**: KGV, Wachstum, Profitabilität, Moat, Bilanzqualität
- **Makroökonomie**: Zinsen, Inflation, Konjunkturzyklus
- **Geopolitik**: Handelspolitik, Konflikte, Lieferketten
- **Sektoranalyse**: Branchentrends, Megatrends, Sektorrotation
- **Sentiment**: Marktstimmung, VIX, kommende Events

═══════════════════════════════════════
AUFGABE:
═══════════════════════════════════════

🌍 **0. MARKT- & MAKRO-LAGEBEURTEILUNG**
- Aktuelle Makrolage: Zinsen, Inflation, Konjunktur
- Geopolitische Risiken (nenne aktuelle Konflikte/Ereignisse explizit beim Namen, wenn im Live-News-Snapshot enthalten)
- Marktsentiment & relevante kommende Events
- Was bedeutet das für einen Neueinsteiger?

🛒 **1. KAUFEMPFEHLUNGEN** (HAUPTFOKUS!)
Basierend auf meinem verfügbaren Cash von ${cashBalance.toFixed(2)} EUR und meiner Strategie:
- Analysiere JEDE Watchlist-Aktie detailliert mit Kauf-/Abwarte-Empfehlung
- Für jede Kaufempfehlung: Technische + fundamentale Begründung, konkreter Einstiegspreis, Stop-Loss, Kursziel
- Vorgeschlagene Investitionssumme in EUR (Positionsgrößen-Empfehlung)
- Berücksichtige Diversifikation: Mix aus Branchen, Regionen, Risikoprofilen
- Ergänze ggf. 2-3 weitere Aktien/ETFs über die Watchlist hinaus

📊 **2. PORTFOLIO-AUFBAU-STRATEGIE**
- Wie sollte ich mein Cash aufteilen? (z.B. 60% sofort, 20% gestaffelt, 20% Reserve)
- Empfohlene Branchen- und Regionen-Verteilung
- Kern-Positionen vs. Wachstums-Positionen
- Wann und wie nach und nach investieren? (Timing-Strategie)

🎯 **3. AKTIONSPLAN**
- Priorisierte Kaufliste: Was zuerst kaufen?
- Einstiegsstrategie: Sofort kaufen oder auf bessere Kurse warten?
- Cash-Management: Wie viel Cash vorerst zurückhalten?

${settings.customPrompt ? `
═══════════════════════════════════════
⚙️ PERSÖNLICHE ANWEISUNGEN (UNBEDINGT BEACHTEN!):
═══════════════════════════════════════
${settings.customPrompt}
` : ''}
Antworte auf Deutsch mit Emojis für bessere Übersicht.`;

      const modelName = isOpenAI 
        ? (settings.openaiModel || 'gpt-5.2')
        : isGemini
        ? (settings.geminiModel || 'gemini-2.5-flash')
        : (settings.claudeModel || 'claude-opus-4-6');
      const modelDisplayNames: Record<string, string> = {
        'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5',
        'claude-opus-4-6': 'Claude Opus 4.6',
        'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
        'gpt-5.2': 'OpenAI GPT-5.2',
        'gpt-5-mini': 'OpenAI GPT-5 Mini',
        'gpt-4o': 'OpenAI GPT-4o',
        'gemini-2.5-flash': 'Google Gemini 2.5 Flash',
        'gemini-2.5-pro': 'Google Gemini 2.5 Pro',
      };
      const modelDisplayName = modelDisplayNames[modelName] || modelName;

      const apiBody = isOpenAI
        ? JSON.stringify({
            model: modelName,
            max_completion_tokens: 32768,
            messages: [
              { role: 'system', content: 'Du bist ein erfahrener Investment-Analyst mit Expertise in technischer Analyse, Fundamentalanalyse, Makroökonomie und Geopolitik. Antworte auf Deutsch mit Emojis.' },
              { role: 'user', content: promptContent },
            ],
          })
        : isGemini
        ? JSON.stringify({
            contents: [{ parts: [{ text: promptContent }] }],
            systemInstruction: { parts: [{ text: 'Du bist ein erfahrener Investment-Analyst mit Expertise in technischer Analyse, Fundamentalanalyse, Makroökonomie und Geopolitik. Antworte auf Deutsch mit Emojis.' }] },
            generationConfig: { maxOutputTokens: 32768, temperature: 0.7 },
          })
        : JSON.stringify({
            model: modelName,
            max_tokens: 32768,
            messages: [
              { role: 'user', content: promptContent },
            ],
          });

      // Retry bei Overloaded (529), Rate Limit (429), Service Unavailable (503)
      setAnalysisProgress({ step: 'KI-Analyse', detail: `${modelDisplayName} analysiert Portfolio (Technik, Fundamentals, Makro, Geopolitik)...`, percent: 60 });
      let response: Response | null = null;
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: apiHeaders,
          body: apiBody,
        });

        if ((response.status === 429 || response.status === 529 || response.status === 503) && attempt < maxRetries) {
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : (5000 * Math.pow(2, attempt));
          console.warn(`[Portfolio-Analyse] Status ${response.status} - Retry ${attempt + 1}/${maxRetries} in ${waitMs}ms...`);
          setAnalysisProgress({ step: 'KI-Analyse', detail: `Server überlastet — Wiederholung ${attempt + 1}/${maxRetries} in ${Math.round(waitMs / 1000)}s...`, percent: 65 });
          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }
        break;
      }

      if (!response || !response.ok) {
        const errorText = response ? await response.text() : 'Keine Antwort';
        let errorMsg = `API-Fehler ${response?.status || 'unbekannt'}`;
        // Benutzerfreundliche Meldung bei Overloaded
        if (response?.status === 529 || errorText.toLowerCase().includes('overloaded')) {
          errorMsg = 'Der KI-Server ist momentan überlastet. Bitte versuche es in 1-2 Minuten erneut.';
        } else {
          try {
            const errorJson = JSON.parse(errorText);
            errorMsg = errorJson.error?.message || errorJson.error?.type || errorMsg;
          } catch {
            if (errorText.length < 500) errorMsg = errorText;
          }
        }
        throw new Error(errorMsg);
      }

      setAnalysisProgress({ step: 'Antwort verarbeiten', detail: 'KI-Antwort empfangen, Ergebnis aufbereiten...', percent: 90 });
      const data = await response.json();
      const content = isOpenAI 
        ? (data.choices?.[0]?.message?.content)
        : isGemini
        ? (data.candidates?.[0]?.content?.parts?.[0]?.text)
        : (data.content?.[0]?.text);
      
      if (!content) {
        console.error('API response without content:', JSON.stringify(data).slice(0, 500));
        throw new Error('KI hat keine Antwort geliefert. Bitte erneut versuchen.');
      }

      setAnalysisProgress({ step: 'Speichern', detail: 'Analyse speichern & Benachrichtigungen senden...', percent: 95 });
      setAnalysisResult(content);

      // Save analysis to history for AI memory
      const historyEntry: AnalysisHistoryEntry = {
        id: `analysis-${Date.now()}`,
        date: new Date().toISOString(),
        analysisText: content,
        portfolioSnapshot: {
          positions: userPositions.map(p => ({
            symbol: p.symbol,
            name: p.name,
            quantity: p.quantity,
            buyPrice: p.buyPrice,
            currentPrice: p.currentPrice,
          })),
          cashBalance,
          totalValue: totalCurrentValue,
        },
        watchlistSymbols: watchlist.map(s => s.symbol.toUpperCase()),
        strategy: settings.strategy,
        aiProvider: settings.aiProvider,
      };
      addAnalysisHistory(historyEntry);

      // Send to Telegram if enabled - split into multiple messages if needed
      if (settings.notifications.telegram.enabled) {
        const telegramHeader = `📊 *Portfolio-Analyse*\n🤖 KI-Modell: ${modelDisplayName}\n\n`;
        const maxTelegramLength = 4096;
        const headerLength = telegramHeader.length;
        const chunkSize = maxTelegramLength - headerLength - 50; // Reserve space for part indicators
        
        // Split content into chunks at line breaks
        const splitContentForTelegram = (text: string, maxLen: number): string[] => {
          const chunks: string[] = [];
          let remaining = text;
          while (remaining.length > 0) {
            if (remaining.length <= maxLen) {
              chunks.push(remaining);
              break;
            }
            // Find last newline before maxLen
            let splitAt = remaining.lastIndexOf('\n', maxLen);
            if (splitAt <= 0) splitAt = maxLen;
            chunks.push(remaining.substring(0, splitAt));
            remaining = remaining.substring(splitAt).trimStart();
          }
          return chunks;
        };

        const chunks = splitContentForTelegram(content, chunkSize);
        const totalParts = chunks.length;

        for (let i = 0; i < chunks.length; i++) {
          const partIndicator = totalParts > 1 ? `(Teil ${i + 1}/${totalParts})\n` : '';
          const messageText = i === 0 
            ? `${telegramHeader}${partIndicator}${chunks[i]}`
            : `📊 *Portfolio-Analyse* ${partIndicator}\n${chunks[i]}`;
          
          try {
            await fetch(
              `https://api.telegram.org/bot${settings.notifications.telegram.botToken}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: settings.notifications.telegram.chatId,
                  text: messageText,
                  parse_mode: 'Markdown',
                }),
              }
            );
          } catch (telegramError) {
            console.error(`Failed to send Telegram part ${i + 1}:`, telegramError);
            // Retry without Markdown parse_mode in case of formatting issues
            try {
              await fetch(
                `https://api.telegram.org/bot${settings.notifications.telegram.botToken}/sendMessage`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: settings.notifications.telegram.chatId,
                    text: messageText,
                  }),
                }
              );
            } catch (retryError) {
              console.error(`Telegram retry failed for part ${i + 1}:`, retryError);
            }
          }
          // Small delay between messages to avoid rate limiting
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      // Send to Email if enabled
      console.log('Email settings check:', {
        enabled: settings.notifications.email.enabled,
        hasServiceId: !!settings.notifications.email.serviceId,
        hasTemplateId: !!settings.notifications.email.templateId,
        hasPublicKey: !!settings.notifications.email.publicKey,
        hasAddress: !!settings.notifications.email.address
      });
      
      if (settings.notifications.email.enabled && 
          settings.notifications.email.serviceId && 
          settings.notifications.email.templateId && 
          settings.notifications.email.publicKey) {
        console.log('Attempting to send email...');
        try {
          await emailjs.send(
            settings.notifications.email.serviceId,
            settings.notifications.email.templateId,
            {
              to_email: settings.notifications.email.address,
              subject: `📊 Vestia Portfolio-Analyse (${modelDisplayName})`,
              stock_name: 'Portfolio-Analyse',
              stock_symbol: 'PORTFOLIO',
              signal_type: `ANALYSE (${modelDisplayName})`,
              price: `${totalCurrentValue.toFixed(2)} EUR`,
              change: `${totalProfitLossPercent >= 0 ? '+' : ''}${totalProfitLossPercent.toFixed(2)}%`,
              confidence: '-',
              risk_level: settings.riskTolerance === 'low' ? 'Niedrig' : settings.riskTolerance === 'medium' ? 'Mittel' : 'Hoch',
              reasoning: `🤖 KI-Modell: ${modelDisplayName}\n\n${content}`,
              target_price: '-',
              stop_loss: '-',
              date: new Date().toLocaleString('de-DE'),
            },
            settings.notifications.email.publicKey
          );
          console.log('Portfolio analysis email sent successfully');
        } catch (emailError) {
          console.error('Failed to send portfolio analysis email:', emailError);
        }
      }

    } catch (error: any) {
      console.error('Portfolio analysis error:', error);
      const msg = error.message || 'Analyse fehlgeschlagen';
      // Fehlermeldung kürzen falls es ein riesiger API-Response ist
      setError(msg.length > 300 ? msg.slice(0, 300) + '...' : msg);
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-12 lg:pt-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Mein Portfolio</h1>
          <p className="text-sm text-gray-400">
            Verwalte und analysiere deine Aktien
            {lastUpdate && (
              <span className="block md:inline md:ml-2 text-xs text-gray-500">
                • Preise aktualisiert: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 
                     text-white rounded-lg transition-colors text-sm md:text-base"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Position</span> hinzufügen
          </button>
          {/* CSV Import - temporär deaktiviert
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 
                     text-white rounded-lg transition-colors"
          >
            <Upload size={18} />
            CSV Import
          </button>
          */}
          <button
            onClick={analyzePortfolio}
            disabled={analyzing || (userPositions.length === 0 && watchlist.length === 0)}
            className="flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-green-600 hover:bg-green-700 
                     disabled:bg-green-600/50 text-white rounded-lg transition-colors text-sm md:text-base"
          >
            {analyzing ? (
              <>
                <RefreshCw className="animate-spin" size={16} />
                <span className="hidden sm:inline">{analysisProgress?.step || 'Analysiere...'}</span>
                <span className="sm:hidden">...</span>
              </>
            ) : (
              <>
                <Brain size={16} />
                Vollanalyse
              </>
            )}
          </button>
          <button
            onClick={fetchYahooPrices}
            disabled={loadingYahooPrices || userPositions.length === 0}
            className="flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 
                     disabled:bg-blue-600/50 text-white rounded-lg transition-colors text-sm md:text-base"
            title={lastUpdate ? `Zuletzt aktualisiert: ${lastUpdate.toLocaleTimeString()}` : 'Noch nicht aktualisiert'}
          >
            {loadingYahooPrices ? (
              <>
                <RefreshCw className="animate-spin" size={18} />
                Lade...
              </>
            ) : (
              <>
                <RefreshCw size={18} />
                Preise aktualisieren
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
        {/* Cash Balance Card */}
        <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-6 border border-[#252542] col-span-2 md:col-span-1">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 md:p-3 bg-yellow-500/20 rounded-lg">
              <Wallet size={20} className="text-yellow-500 md:w-6 md:h-6" />
            </div>
            <div className="flex-1">
              <p className="text-gray-400 text-xs md:text-sm">Verfügbares Cash</p>
              {editingCash ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    className="w-24 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-lg"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      setCashBalance(parseFloat(cashInput) || 0);
                      setEditingCash(false);
                    }}
                    className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                  >
                    <Check size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-lg md:text-2xl font-bold text-yellow-500">
                      {cashBalance.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    </p>
                    {(() => {
                      const { reservedCash, availableCash } = getAvailableCash();
                      if (reservedCash > 0) {
                        return (
                          <p className="text-xs text-orange-400 mt-0.5">
                            davon {reservedCash.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € reserviert
                            <span className="text-gray-500"> → frei: {availableCash.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span>
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <button
                    onClick={() => {
                      setCashInput(cashBalance.toString());
                      setEditingCash(true);
                    }}
                    className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                  >
                    <Edit3 size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-6 border border-[#252542]">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 md:p-3 bg-indigo-500/20 rounded-lg">
              <Briefcase size={20} className="text-indigo-500 md:w-6 md:h-6" />
            </div>
            <div>
              <p className="text-gray-400 text-xs md:text-sm">Positionen</p>
              <p className="text-lg md:text-2xl font-bold text-white">{userPositions.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-6 border border-[#252542]">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 md:p-3 bg-blue-500/20 rounded-lg">
              <DollarSign size={20} className="text-blue-500 md:w-6 md:h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-gray-400 text-xs md:text-sm">Investiert</p>
              <p className="text-lg md:text-2xl font-bold text-white truncate">
                {totalInvested.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-6 border border-[#252542]">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 md:p-3 bg-purple-500/20 rounded-lg">
              <PieChartIcon size={20} className="text-purple-500 md:w-6 md:h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-gray-400 text-xs md:text-sm">Aktueller Wert</p>
              <p className="text-lg md:text-2xl font-bold text-white truncate">
                {totalCurrentValue.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              </p>
            </div>
          </div>
        </div>

        <div className={`rounded-xl p-3 md:p-6 border col-span-2 md:col-span-1 ${
          totalProfitLoss >= 0 
            ? 'bg-green-500/10 border-green-500/30' 
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-center gap-3 md:gap-4">
            <div className={`p-2 md:p-3 rounded-lg ${
              totalProfitLoss >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'
            }`}>
              {totalProfitLoss >= 0 ? (
                <TrendingUp size={24} className="text-green-500" />
              ) : (
                <TrendingDown size={24} className="text-red-500" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-gray-400 text-xs md:text-sm">Gewinn/Verlust</p>
              <p className={`text-lg md:text-2xl font-bold ${
                totalProfitLoss >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {totalProfitLoss >= 0 ? '+' : ''}{totalProfitLoss.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                <span className="text-xs md:text-sm ml-1 md:ml-2">
                  ({totalProfitLossPercent >= 0 ? '+' : ''}{totalProfitLossPercent.toFixed(2)}%)
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio-Verlauf */}
      <div className="bg-[#1a1a2e] rounded-xl border border-[#252542] p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-white">Portfolio-Verlauf</h2>
            <p className="text-xs md:text-sm text-gray-400 mt-1">
              Entwicklung des Gesamtwerts deiner Positionen
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {[
              { value: '1d' as const, label: 'Tag' },
              { value: '5d' as const, label: 'Woche' },
              { value: '1mo' as const, label: 'Monat' },
              { value: '1y' as const, label: 'Jahr' },
            ].map((range) => (
              <button
                key={range.value}
                onClick={() => setPortfolioChartRange(range.value)}
                className={`px-3 py-1.5 text-xs md:text-sm rounded-lg transition-colors ${
                  portfolioChartRange === range.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[#252542] text-gray-400 hover:text-white'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4 text-sm">
          <span className="text-gray-400">Periode:</span>
          <span className="text-white font-semibold">
            {portfolioHistoryEnd.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </span>
          <span className={`flex items-center gap-1 ${portfolioHistoryDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {portfolioHistoryDiff >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {portfolioHistoryDiff >= 0 ? '+' : ''}
            {portfolioHistoryDiff.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            ({portfolioHistoryDiffPercent >= 0 ? '+' : ''}{portfolioHistoryDiffPercent.toFixed(2)}%)
          </span>
        </div>

        <div className="h-72">
          {loadingPortfolioHistory ? (
            <div className="h-full flex items-center justify-center">
              <RefreshCw className="animate-spin text-indigo-500" size={28} />
            </div>
          ) : portfolioHistory.length < 2 ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              Zu wenig Verlaufsdaten verfügbar
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={portfolioHistory}>
                <defs>
                  <linearGradient id="portfolio-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={portfolioHistoryDiff >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={portfolioHistoryDiff >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  tickFormatter={(value) =>
                    `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`
                  }
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #252542',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(value: number | string | undefined, _name, item) => {
                    const percentValue = typeof value === 'number' ? value : Number(value ?? 0);
                    const absoluteValue = Number(item?.payload?.value ?? 0);
                    return [
                      `${percentValue >= 0 ? '+' : ''}${percentValue.toFixed(2)}% (${absoluteValue.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €)`,
                      'Veränderung',
                    ];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="changePercent"
                  stroke={portfolioHistoryDiff >= 0 ? '#22c55e' : '#ef4444'}
                  strokeWidth={2.2}
                  fill="url(#portfolio-gradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Add Position Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-md border border-[#252542]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Position hinzufügen</h2>
              <button 
                onClick={() => setShowAddForm(false)}
                className="p-1 hover:bg-[#252542] rounded"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Symbol
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.symbol}
                      onChange={(e) => handleSymbolSearch(e.target.value)}
                      onFocus={() => { if (symbolSuggestions.length > 0) setShowSuggestions(true); }}
                      placeholder="z.B. AAPL, MSFT"
                      autoComplete="off"
                      className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                               text-white focus:outline-none focus:border-indigo-500"
                    />
                    {searchingSymbol && (
                      <RefreshCw size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" />
                    )}
                  </div>
                  {/* Symbol Suggestions Dropdown */}
                  {showSuggestions && symbolSuggestions.length > 0 && (
                    <div className="absolute z-[60] left-0 right-0 mt-1 bg-[#1e1e3a] border border-[#3a3a5a] rounded-lg shadow-xl overflow-hidden"
                         style={{ width: 'calc(200% + 1rem)' }}>
                      {symbolSuggestions.map((s) => (
                        <button
                          key={s.symbol}
                          type="button"
                          onClick={() => selectSuggestion(s)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[#252542] 
                                   transition-colors text-left border-b border-[#252542] last:border-b-0"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-white text-sm">{s.symbol}</span>
                            <span className="text-gray-400 text-xs ml-2 truncate">{s.name}</span>
                          </div>
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            {s.loading ? (
                              <RefreshCw size={12} className="text-gray-500 animate-spin" />
                            ) : s.price !== undefined && !isNaN(s.price) ? (
                              <>
                                <span className="text-white font-medium text-sm">{s.price.toFixed(2)} €</span>
                                {s.changePercent !== undefined && !isNaN(s.changePercent) && (
                                  <span className={`text-xs font-medium ${s.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-500 text-xs">—</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    ISIN
                  </label>
                  <input
                    type="text"
                    value={formData.isin}
                    onChange={(e) => setFormData({ ...formData, isin: e.target.value })}
                    placeholder="z.B. US0378331005"
                    className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                             text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">Gib Symbol ODER ISIN ein (eines reicht) – Vorschläge erscheinen beim Tippen</p>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="z.B. Apple Inc."
                  className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                           text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Anzahl Aktien *
                </label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="z.B. 10"
                  step="0.001"
                  className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                           text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Kaufpreis <span className="text-gray-500 text-xs">(optional)</span>
                  </label>
                  <input
                    type="number"
                    value={formData.buyPrice}
                    onChange={(e) => setFormData({ ...formData, buyPrice: e.target.value })}
                    placeholder="150.00"
                    step="0.01"
                    className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                             text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Aktueller Preis *
                  </label>
                  <input
                    type="number"
                    value={formData.currentPrice}
                    onChange={(e) => setFormData({ ...formData, currentPrice: e.target.value })}
                    placeholder="178.50"
                    step="0.01"
                    className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                             text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Währung
                </label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                           text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>

              <button
                onClick={handleAddPosition}
                disabled={addingPosition || ((!formData.symbol && !formData.isin) || !formData.quantity || !formData.currentPrice)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 
                         text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {addingPosition ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Preis wird ermittelt...</>
                ) : (
                  'Position hinzufügen'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Positions Table */}
      <div className="bg-[#1a1a2e] rounded-xl border border-[#252542] overflow-hidden">
        <div className="p-4 md:p-6 border-b border-[#252542]">
          <h2 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
            <Briefcase size={18} className="text-indigo-500" />
            Meine Positionen
          </h2>
        </div>

        {userPositions.length === 0 ? (
          <div className="p-12 text-center">
            <Briefcase size={48} className="mx-auto text-gray-500 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Noch keine Positionen</h3>
            <p className="text-gray-400 max-w-md mx-auto">
              Füge deine aktuellen Aktien hinzu, um eine KI-Analyse zu erhalten.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm bg-[#252542]/50">
                  <th className="px-6 py-4">Symbol / ISIN</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4 text-right">Anzahl</th>
                  <th className="px-6 py-4 text-right">Kaufpreis</th>
                  <th className="px-6 py-4 text-right">Aktuell</th>
                  <th className="px-6 py-4 text-right">Wert</th>
                  <th className="px-6 py-4 text-right">G/V</th>
                  <th className="px-6 py-4 text-center">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {[...userPositions]
                  .sort((a, b) => (b.quantity * b.currentPrice) - (a.quantity * a.currentPrice))
                  .map((position) => {
                  const pl = getProfitLoss(position);
                  return (
                    <tr 
                      key={position.id} 
                      className="border-b border-[#252542] hover:bg-[#252542]/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        {editingPosition === position.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editSymbol}
                              onChange={(e) => setEditSymbol(e.target.value.toUpperCase())}
                              placeholder="z.B. SAP.DE"
                              className="w-24 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm"
                              autoFocus
                            />
                            <button
                              onClick={() => {
                                updateUserPosition(position.id, { symbol: editSymbol });
                                setEditingPosition(null);
                              }}
                              className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingPosition(null)}
                              className="p-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div>
                              <span className="font-bold text-white">
                                {position.symbol || '-'}
                              </span>
                              {position.isin && (
                                <span className="block text-xs text-gray-500 font-mono mt-0.5">
                                  {position.isin}
                                </span>
                              )}
                              <span className="block text-xs text-yellow-500 mt-0.5" title="Yahoo Finance Preis">
                                {loadingYahooPrices ? 'Lade Yahoo...' : 
                                 yahooPrices[position.id] !== undefined ? 
                                   `Yahoo: ${yahooPrices[position.id].toFixed(2)} EUR` : 
                                   'Yahoo: nicht verfügbar'}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setEditSymbol(position.symbol || '');
                                setEditingPosition(position.id);
                              }}
                              className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                              title="Symbol bearbeiten"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-300">{position.name}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-white">{position.quantity}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {editingBuyPrice === position.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editBuyPriceValue}
                              onChange={(e) => setEditBuyPriceValue(e.target.value)}
                              className="w-20 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-right"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const newBuyPrice = parseFloat(editBuyPriceValue);
                                  if (newBuyPrice > 0) {
                                    updateUserPosition(position.id, { buyPrice: newBuyPrice });
                                  }
                                  setEditingBuyPrice(null);
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                const newBuyPrice = parseFloat(editBuyPriceValue);
                                if (newBuyPrice > 0) {
                                  updateUserPosition(position.id, { buyPrice: newBuyPrice });
                                }
                                setEditingBuyPrice(null);
                              }}
                              className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingBuyPrice(null)}
                              className="p-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-gray-400">{position.buyPrice.toFixed(2)} {position.currency}</span>
                            <button
                              onClick={() => {
                                setEditBuyPriceValue(position.buyPrice.toString());
                                setEditingBuyPrice(position.id);
                              }}
                              className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                              title="Kaufpreis bearbeiten"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {editingPrice === position.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="number"
                              step="0.01"
                              value={editPriceValue}
                              onChange={(e) => setEditPriceValue(e.target.value)}
                              className="w-20 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-right"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const newPrice = parseFloat(editPriceValue);
                                  if (newPrice > 0) {
                                    console.log('Saving new price:', newPrice, 'for position:', position.id);
                                    updateUserPosition(position.id, { currentPrice: newPrice });
                                  }
                                  setEditingPrice(null);
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                const newPrice = parseFloat(editPriceValue);
                                console.log('Button clicked. New price:', newPrice, 'for position:', position.id);
                                if (newPrice > 0) {
                                  updateUserPosition(position.id, { currentPrice: newPrice });
                                }
                                setEditingPrice(null);
                              }}
                              className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingPrice(null)}
                              className="p-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <div className="text-right">
                              <span className="text-white font-medium">
                                {position.currentPrice.toFixed(2)} {position.currency}
                              </span>
                              {yahooPrices[position.id] !== undefined && (
                                <span className="block text-xs text-yellow-500 mt-0.5">
                                  Yahoo: {yahooPrices[position.id].toFixed(2)} EUR
                                </span>
                              )}
                              {loadingYahooPrices && yahooPrices[position.id] === undefined && (
                                <span className="block text-xs text-gray-500 mt-0.5 animate-pulse">
                                  Lade...
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => {
                                  setEditPriceValue(position.currentPrice.toString());
                                  setEditingPrice(position.id);
                                }}
                                className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                                title="Preis bearbeiten"
                              >
                                <Edit3 size={12} />
                              </button>
                              {yahooPrices[position.id] !== undefined && (
                                <button
                                  onClick={() => {
                                    updateUserPosition(position.id, { 
                                      currentPrice: yahooPrices[position.id],
                                      useYahooPrice: !position.useYahooPrice 
                                    });
                                  }}
                                  className={`p-1 rounded text-xs ${
                                    position.useYahooPrice 
                                      ? 'bg-yellow-500/30 text-yellow-400' 
                                      : 'hover:bg-[#252542] text-gray-500 hover:text-yellow-400'
                                  }`}
                                  title={position.useYahooPrice ? 'Yahoo Live-Preis aktiv' : 'Yahoo-Preis übernehmen'}
                                >
                                  <RefreshCw size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-white font-medium">
                          {(position.quantity * position.currentPrice).toFixed(2)} {position.currency}
                        </div>
                        <div className="text-xs text-gray-400">
                          {totalCurrentValue > 0 ? ((position.quantity * position.currentPrice) / totalCurrentValue * 100).toFixed(1) : '0.0'}%
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className={`font-medium ${pl.absolute >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          <div className="flex items-center justify-end gap-1">
                            {pl.absolute >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                            {pl.absolute >= 0 ? '+' : ''}{pl.absolute.toFixed(2)} {position.currency}
                          </div>
                          <div className="text-xs">
                            ({pl.percent >= 0 ? '+' : ''}{pl.percent.toFixed(2)}%)
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {tradeAction?.positionId === position.id ? (
                          <div className="flex flex-col items-center gap-2">
                            <div className="text-xs font-medium text-gray-300">
                              {tradeAction.type === 'buy' ? '📈 Nachkaufen' : '📉 Verkaufen'}
                            </div>
                            {tradeAction.type === 'buy' ? (
                              <>
                                <div className="text-xs text-gray-500">
                                  Marktpreis: {(yahooPrices[position.id] ?? position.currentPrice).toFixed(2)} €
                                </div>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={tradePrice}
                                  onChange={(e) => setTradePrice(e.target.value)}
                                  placeholder="Kaufpreis"
                                  className="w-24 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-center"
                                  autoFocus
                                />
                                <input
                                  type="number"
                                  step="1"
                                  min="1"
                                  value={tradeQuantity}
                                  onChange={(e) => setTradeQuantity(e.target.value)}
                                  placeholder="Anzahl"
                                  className="w-20 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-center"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const qty = parseFloat(tradeQuantity);
                                      const price = parseFloat(tradePrice) || undefined;
                                      if (qty > 0) executeTrade(position.id, tradeAction.type, qty, price);
                                    }
                                    if (e.key === 'Escape') { setTradeAction(null); setTradeQuantity(''); setTradePrice(''); }
                                  }}
                                />
                              </>
                            ) : (
                              <>
                                <div className="text-xs text-gray-500">
                                  Marktpreis: {(yahooPrices[position.id] ?? position.currentPrice).toFixed(2)} €
                                </div>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={tradePrice}
                                  onChange={(e) => setTradePrice(e.target.value)}
                                  placeholder="Verkaufspreis"
                                  className="w-24 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-center"
                                  autoFocus
                                />
                                <input
                                  type="number"
                                  step="1"
                                  min="1"
                                  max={position.quantity}
                                  value={tradeQuantity}
                                  onChange={(e) => setTradeQuantity(e.target.value)}
                                  placeholder="Anzahl"
                                  className="w-20 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-center"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const qty = parseFloat(tradeQuantity);
                                      const price = parseFloat(tradePrice) || undefined;
                                      if (qty > 0) executeTrade(position.id, tradeAction.type, qty, price);
                                    }
                                    if (e.key === 'Escape') { setTradeAction(null); setTradeQuantity(''); setTradePrice(''); }
                                  }}
                                />
                              </>
                            )}
                            {tradeQuantity && parseFloat(tradeQuantity) > 0 && (() => {
                              const qty = parseFloat(tradeQuantity);
                              const effectivePrice = (tradePrice && parseFloat(tradePrice) > 0)
                                ? parseFloat(tradePrice)
                                : (yahooPrices[position.id] ?? position.currentPrice);
                              const tradeTotal = qty * effectivePrice;
                              const tradeFee = (orderSettings.transactionFeeFlat || 0) + tradeTotal * (orderSettings.transactionFeePercent || 0) / 100;
                              return (
                                <div className="text-xs text-gray-400">
                                  = {tradeTotal.toFixed(2)} €
                                  {tradeFee > 0 && (
                                    <span className="text-yellow-400 ml-1">(+{tradeFee.toFixed(2)} € Geb.)</span>
                                  )}
                                </div>
                              );
                            })()}
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  const qty = parseFloat(tradeQuantity);
                                  const price = parseFloat(tradePrice) || undefined;
                                  if (qty > 0) executeTrade(position.id, tradeAction.type, qty, price);
                                }}
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  tradeAction.type === 'buy'
                                    ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                                    : 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                                }`}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => { setTradeAction(null); setTradeQuantity(''); setTradePrice(''); }}
                                className="px-2 py-1 bg-gray-500/20 hover:bg-gray-500/30 rounded text-gray-400 text-xs"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => { setTradeAction({ positionId: position.id, type: 'buy' }); setTradeQuantity(''); setTradePrice((yahooPrices[position.id] ?? position.currentPrice).toFixed(2)); }}
                              className="p-1.5 hover:bg-green-500/20 text-green-500 rounded-lg transition-colors"
                              title="Nachkaufen"
                            >
                              <ShoppingCart size={16} />
                            </button>
                            <button
                              onClick={() => { setTradeAction({ positionId: position.id, type: 'sell' }); setTradeQuantity(position.quantity.toString()); setTradePrice((yahooPrices[position.id] ?? position.currentPrice).toFixed(2)); }}
                              className="p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                              title="Verkaufen"
                            >
                              <ArrowRightLeft size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Analysis Loading */}
      {analyzing && (
        <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-indigo-500/30">
          <div className="flex items-center gap-3 mb-3">
            <RefreshCw className="animate-spin text-indigo-400" size={20} />
            <span className="text-indigo-300 font-medium">
              {analysisProgress?.step ? `${analysisProgress.step}` : 'KI-Analyse läuft...'}
            </span>
          </div>
          {analysisProgress && (
            <>
              <div className="w-full bg-[#252542] rounded-full h-2 mb-2">
                <div 
                  className="bg-indigo-500 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${analysisProgress.percent}%` }}
                />
              </div>
              <p className="text-sm text-gray-400">{analysisProgress.detail}</p>
            </>
          )}
        </div>
      )}

      {/* CSV Import Modal */}
      <CSVImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} />

      {/* Trade-Historie */}
      <TradeHistory />

      {/* AI Analysis Result */}
      {analysisResult && (
        <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-indigo-500/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Brain size={20} className="text-indigo-500" />
              Portfolio-Vollanalyse
            </h2>
            {lastAnalysisDate && (
              <span className="text-xs text-gray-500">
                {new Date(lastAnalysisDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => setAnalysisResult(null)}
              className="p-1 hover:bg-[#252542] rounded"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>
          <div className="prose prose-invert max-w-none">
            <div className="text-gray-300 whitespace-pre-wrap leading-relaxed">
              {analysisResult}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
