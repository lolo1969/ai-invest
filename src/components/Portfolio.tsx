import { useState, useEffect, useRef, useMemo } from 'react';
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
  ArrowRightLeft,
  Upload
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
import { symbolsReferToSameInstrument } from '../utils/symbolMatching';

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

// Trade History Component
function TradeHistory() {
  const { tradeHistory, clearTradeHistory } = useAppStore();
  const [showAll, setShowAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  if (tradeHistory.length === 0) return null;

  const sortedTrades = [...tradeHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const displayedTrades = showAll ? sortedTrades : sortedTrades.slice(0, 10);

  return (
    <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-gray-700/30 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <ArrowRightLeft size={18} className="text-purple-400" />
          Trade History
          <span className="text-xs text-gray-500 font-normal">({tradeHistory.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {confirmClear ? (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-red-400">Clear all?</span>
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
              title="Delete history"
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
              <th className="text-left py-2 px-2 font-medium">Date</th>
              <th className="text-center py-2 px-2 font-medium">Type</th>
              <th className="text-left py-2 px-2 font-medium">Symbol</th>
              <th className="text-right py-2 px-2 font-medium">Qty</th>
              <th className="text-right py-2 px-2 font-medium">Price</th>
              <th className="text-right py-2 px-2 font-medium">Total</th>
              <th className="text-right py-2 px-2 font-medium">Fees</th>
              <th className="text-center py-2 px-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {displayedTrades.map(trade => (
              <tr key={trade.id} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                <td className="py-2 px-2 text-gray-300 text-xs">
                  {new Date(trade.date).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="text-center py-2 px-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    trade.type === 'buy' 
                      ? 'bg-green-500/10 text-green-400' 
                      : 'bg-red-500/10 text-red-400'
                  }`}>
                    {trade.type === 'buy' ? '↑ Buy' : '↓ Sell'}
                  </span>
                </td>
                <td className="py-2 px-2">
                  <span className="text-white font-medium">{trade.name}</span>
                  {trade.symbol && trade.symbol !== trade.name && (
                    <span className="text-gray-500 text-xs block">{trade.symbol}</span>
                  )}
                </td>
                <td className="text-right py-2 px-2 text-gray-300">{trade.quantity}</td>
                <td className="text-right py-2 px-2 text-gray-300">
                  {trade.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </td>
                <td className="text-right py-2 px-2">
                  <span className={trade.type === 'buy' ? 'text-red-300' : 'text-green-300'}>
                    {trade.type === 'buy' ? '-' : '+'}{trade.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </span>
                </td>
                <td className="text-right py-2 px-2 text-gray-500 text-xs">
                  {trade.fees > 0 ? `-${trade.fees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '–'}
                </td>
                <td className="text-center py-2 px-2">
                  <span className={`text-xs ${trade.source === 'order' ? 'text-blue-400' : 'text-gray-500'}`}>
                    {trade.source === 'order' ? 'Order' : 'Manual'}
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
          {showAll ? 'Show less' : `Show all ${tradeHistory.length} trades`}
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
    orders,
    taxTransactions,
    orderSettings,
    tradeHistory,
    analysisProgress,
    setAnalysisProgress
  } = useAppStore();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const { lastAnalysis: analysisResult, lastAnalysisDate, lastAnalysisDurationMs, setLastAnalysis: setAnalysisResult, addAnalysisHistory, isAnalyzing: analyzing, setAnalyzing } = useAppStore();
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState('');
  const [editingPosition, setEditingPosition] = useState<string | null>(null);
  const [editSymbol, setEditSymbol] = useState('');
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');

  const [editingBuyPrice, setEditingBuyPrice] = useState<string | null>(null);
  const [editBuyPriceValue, setEditBuyPriceValue] = useState('');
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
  const analysisResultRef = useRef<HTMLDivElement | null>(null);
  const wasAnalyzingRef = useRef(false);
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

  // Calculate available cash (minus reserved cash from active/pending buy orders)
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

  // Calculate available shares (minus reserved shares from active/pending sell orders)
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
    
    // Calculate transaction fees
    const fee = (orderSettings.transactionFeeFlat || 0) + totalCost * (orderSettings.transactionFeePercent || 0) / 100;

    // IMPORTANT: Always read the current cash value from the store (not from the closure!)
    const { currentCash, reservedCash, availableCash } = getAvailableCash();

    if (type === 'buy') {
      if (totalCost + fee > availableCash) {
        setError(`Insufficient cash. Required: ${(totalCost + fee).toFixed(2)} € (incl. ${fee.toFixed(2)} € fees), Available: ${availableCash.toFixed(2)} €${reservedCash > 0 ? ` (${reservedCash.toFixed(2)} € reserved by active orders)` : ''}`);
        return;
      }
      // Add purchase: calculate average price
      const newTotalQty = position.quantity + quantity;
      const avgBuyPrice = (position.buyPrice * position.quantity + price * quantity) / newTotalQty;
      updateUserPosition(positionId, { quantity: newTotalQty, buyPrice: avgBuyPrice, currentPrice: price });
      setCashBalance(currentCash - totalCost - fee);

      // Record trade history (Buy)
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
        setError(`Insufficient shares available. Total: ${position.quantity}${reservedShares > 0 ? `, of which ${reservedShares} reserved by active sell orders` : ''}, available: ${availableShares}`);
        return;
      }

      // Record tax transaction (sale)
      const sellDate = new Date();
      const gainLoss = (price - position.buyPrice) * quantity - fee;
      
      // Determine purchase date: From executed buy orders or look up in trade history
      const store = useAppStore.getState();
      let buyDate: Date | null = null;
      
      // 1. Try via executed buy orders (most accurate)
      const executedBuyOrders = store.orders
        .filter(o => o.status === 'executed' 
          && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy')
          && o.symbol === position.symbol
          && o.executedAt != null)
        .sort((a, b) => new Date(a.executedAt!).getTime() - new Date(b.executedAt!).getTime());
      
      if (executedBuyOrders.length > 0) {
        // Oldest buy order as purchase date (FIFO principle)
        buyDate = new Date(executedBuyOrders[0].executedAt!);
      }
      
      // 2. Fallback: Search trade history for purchases
      if (!buyDate) {
        const buyTrades = store.tradeHistory
          .filter(t => t.type === 'buy' && t.symbol === position.symbol)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        if (buyTrades.length > 0) {
          buyDate = new Date(buyTrades[0].date);
        }
      }
      
      const effectiveBuyDate = buyDate || sellDate;
      const holdingDays = buyDate 
        ? Math.floor((sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      const taxFree = holdingDays >= 183;
      store.addTaxTransaction({
        id: crypto.randomUUID(),
        symbol: position.symbol,
        name: position.name,
        quantity,
        buyPrice: position.buyPrice,
        sellPrice: price,
        buyDate: effectiveBuyDate.toISOString(),
        sellDate: sellDate.toISOString(),
        gainLoss,
        fees: fee,
        holdingDays,
        taxFree,
      });

      const newQty = position.quantity - quantity;
      if (newQty <= 0) {
        // Sell entire position
        removeUserPosition(positionId);
      } else {
        updateUserPosition(positionId, { quantity: newQty, currentPrice: price });
      }
      setCashBalance(currentCash + totalCost - fee);

      // Record trade history (Sell)
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
              console.warn(`[Portfolio] Price history not available for ${symbol}:`, error);
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
      // Small delay to prioritize active UI requests.
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
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      }
      if (portfolioChartRange === '5d') {
        return date.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit' });
      }
      if (portfolioChartRange === '1mo') {
        return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      }
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    };

    const allBuckets = new Map<string, number>();
    const quantityBySymbol = new Map<string, number>();
    const positionMetaBySymbol = new Map<string, { isins: Set<string>; names: Set<string> }>();
    const fallbackPriceBySymbol = new Map<string, number>();
    const fallbackQtyBySymbol = new Map<string, number>();
    userPositions.forEach((position) => {
      const symbol = position.symbol.trim();
      if (!symbol) return;
      quantityBySymbol.set(symbol, (quantityBySymbol.get(symbol) ?? 0) + position.quantity);

      const meta = positionMetaBySymbol.get(symbol) ?? { isins: new Set<string>(), names: new Set<string>() };
      if (position.isin) {
        meta.isins.add(position.isin.trim().toUpperCase());
      }
      if (position.name) {
        meta.names.add(position.name.trim().toUpperCase());
      }
      positionMetaBySymbol.set(symbol, meta);

      // Fallback: If historical data is missing for a symbol, use current position price.
      const prevPrice = fallbackPriceBySymbol.get(symbol) ?? 0;
      const prevQty = fallbackQtyBySymbol.get(symbol) ?? 0;
      const nextQty = prevQty + position.quantity;
      if (nextQty > 0) {
        const weighted = ((prevPrice * prevQty) + (position.currentPrice * position.quantity)) / nextQty;
        fallbackPriceBySymbol.set(symbol, weighted);
        fallbackQtyBySymbol.set(symbol, nextQty);
      }
    });

    const symbolSeries = [...quantityBySymbol.entries()].map(([symbol, quantity]) => {
      const meta = positionMetaBySymbol.get(symbol) ?? { isins: new Set<string>(), names: new Set<string>() };
      const cacheKey = `${portfolioChartRange}:${symbol}`;
      const history = historicalDataCacheRef.current[cacheKey]?.data ?? [];
      const pointByKey = new Map<string, number>();

      const matchesTradeToSymbol = (trade: { symbol: string; name: string }) => {
        const tradeSymbol = trade.symbol.trim().toUpperCase();
        const tradeName = trade.name.trim().toUpperCase();
        return (
          symbolsReferToSameInstrument(trade.symbol.trim(), symbol)
          || meta.isins.has(tradeSymbol)
          || meta.names.has(tradeName)
        );
      };

      const matchesOrderToSymbol = (order: { symbol: string; name: string }) => {
        const orderSymbol = order.symbol.trim().toUpperCase();
        const orderName = order.name.trim().toUpperCase();
        return (
          symbolsReferToSameInstrument(order.symbol.trim(), symbol)
          || meta.isins.has(orderSymbol)
          || meta.names.has(orderName)
        );
      };

      let firstKnownPrice = 0;
      let firstPriceTimestamp: number | null = null;
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
          if (firstPriceTimestamp === null || ts < firstPriceTimestamp) {
            firstPriceTimestamp = ts;
            firstKnownPrice = point.close;
          }
        });

      const symbolTrades = tradeHistory
        .filter((trade) => matchesTradeToSymbol(trade))
        .map((trade) => ({
          timestamp: new Date(trade.date).getTime(),
          delta: trade.type === 'buy' ? trade.quantity : -trade.quantity,
        }))
        .filter((event) => Number.isFinite(event.timestamp) && Number.isFinite(event.delta))
        .sort((a, b) => a.timestamp - b.timestamp);

      const earliestBuyTradeTimestamp = tradeHistory
        .filter((trade) => trade.type === 'buy' && matchesTradeToSymbol(trade))
        .map((trade) => new Date(trade.date).getTime())
        .filter((ts) => Number.isFinite(ts))
        .sort((a, b) => a - b)[0];

      const earliestExecutedBuyOrderTimestamp = orders
        .filter((order) =>
          (order.orderType === 'limit-buy' || order.orderType === 'stop-buy')
          && order.status === 'executed'
          && order.executedAt
          && matchesOrderToSymbol(order)
        )
        .map((order) => new Date(order.executedAt as Date).getTime())
        .filter((ts) => Number.isFinite(ts))
        .sort((a, b) => a - b)[0];

      const earliestBuyOrderCreatedTimestamp = orders
        .filter((order) =>
          (order.orderType === 'limit-buy' || order.orderType === 'stop-buy')
          && matchesOrderToSymbol(order)
        )
        .map((order) => new Date(order.createdAt as Date).getTime())
        .filter((ts) => Number.isFinite(ts))
        .sort((a, b) => a - b)[0];

      const acquisitionCandidates = [earliestBuyTradeTimestamp, earliestExecutedBuyOrderTimestamp, earliestBuyOrderCreatedTimestamp]
        .filter((ts): ts is number => typeof ts === 'number' && Number.isFinite(ts));
      const firstAcquisitionTimestamp = acquisitionCandidates.length > 0
        ? Math.min(...acquisitionCandidates)
        : null;

      return {
        symbol,
        currentQuantity: quantity,
        trades: symbolTrades,
        pointByKey,
        firstKnownPrice,
        firstPriceTimestamp,
        firstAcquisitionTimestamp,
        fallbackPrice: fallbackPriceBySymbol.get(symbol) ?? 0,
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

    const rangeStartTimestamp = sortedBuckets[0].timestamp;
    const rangeEndTimestamp = sortedBuckets[sortedBuckets.length - 1].timestamp;
    const hasHistoricalTimeline =
      tradeHistory.some((trade) => trade.type === 'buy')
      || taxTransactions.length > 0
      || orders.some((order) => order.orderType === 'limit-buy' || order.orderType === 'stop-buy');

    const normalizedSymbolSeries = symbolSeries.map((series) => {
      let trades = series.trades.filter(
        (event) => event.timestamp >= rangeStartTimestamp && event.timestamp <= rangeEndTimestamp
      );

      const netInRange = trades.reduce((sum, event) => sum + event.delta, 0);
      let baseQuantity = series.currentQuantity - netInRange;

      // If history is inconsistent (e.g., incomplete old imports),
      // fall back to stable display with current quantity without trade deltas.
      const inconsistentHistory = baseQuantity < -0.000001 || baseQuantity > (series.currentQuantity * 5 + 0.000001);
      if (inconsistentHistory) {
        trades = [];
        baseQuantity = series.currentQuantity;
      }

      if (Math.abs(baseQuantity) < 0.000001) {
        baseQuantity = 0;
      }

      if (hasHistoricalTimeline && series.firstAcquisitionTimestamp === null && trades.length === 0) {
        // Don't retroactively display unknown legacy holdings in active timeline mode.
        baseQuantity = 0;
      }

      return {
        ...series,
        trades,
        baseQuantity: Math.max(0, baseQuantity),
        firstAcquisitionTimestamp: series.firstAcquisitionTimestamp,
        tradeIndex: 0,
        runningTradeQuantity: 0,
        lastKnownPrice: series.firstKnownPrice,
        hasPrice: series.firstKnownPrice > 0,
      };
    });

    const earliestHoldingTimestamp = normalizedSymbolSeries
      .map((series) => {
        if (series.firstAcquisitionTimestamp !== null) {
          return series.firstAcquisitionTimestamp;
        }
        if (series.baseQuantity > 0) {
          return series.firstPriceTimestamp ?? null;
        }
        const firstBuy = series.trades.find((event) => event.delta > 0);
        return firstBuy?.timestamp ?? null;
      })
      .filter((ts): ts is number => ts !== null);

    const globalHistoryStartCandidates: number[] = [];

    tradeHistory.forEach((trade) => {
      if (trade.type !== 'buy') return;
      const ts = new Date(trade.date).getTime();
      if (Number.isFinite(ts)) {
        globalHistoryStartCandidates.push(ts);
      }
    });

    taxTransactions.forEach((tx) => {
      const ts = new Date(tx.buyDate).getTime();
      if (Number.isFinite(ts)) {
        globalHistoryStartCandidates.push(ts);
      }
    });

    orders.forEach((order) => {
      if (!(order.orderType === 'limit-buy' || order.orderType === 'stop-buy')) return;

      const createdTs = new Date(order.createdAt as Date).getTime();
      if (Number.isFinite(createdTs)) {
        globalHistoryStartCandidates.push(createdTs);
      }

      if (order.executedAt) {
        const executedTs = new Date(order.executedAt as Date).getTime();
        if (Number.isFinite(executedTs)) {
          globalHistoryStartCandidates.push(executedTs);
        }
      }
    });

    const globalPortfolioStartTimestamp = globalHistoryStartCandidates.length > 0
      ? Math.min(...globalHistoryStartCandidates)
      : null;

    const portfolioStartTimestamp = hasHistoricalTimeline
      ? (globalPortfolioStartTimestamp
        ?? (earliestHoldingTimestamp.length > 0 ? Math.min(...earliestHoldingTimestamp) : null))
      : null;

    const chartPointsRaw: Omit<PortfolioHistoryPoint, 'changePercent'>[] = sortedBuckets.map((bucket) => {
      if (portfolioStartTimestamp !== null && bucket.timestamp < portfolioStartTimestamp) {
        return {
          timestamp: bucket.timestamp,
          label: formatLabel(new Date(bucket.timestamp)),
          value: 0,
        };
      }

      let totalValue = 0;

      normalizedSymbolSeries.forEach((series) => {
        while (series.tradeIndex < series.trades.length && series.trades[series.tradeIndex].timestamp <= bucket.timestamp) {
          series.runningTradeQuantity += series.trades[series.tradeIndex].delta;
          series.tradeIndex += 1;
        }

        const quantityAtBucket =
          hasHistoricalTimeline && series.firstAcquisitionTimestamp !== null && bucket.timestamp < series.firstAcquisitionTimestamp
            ? 0
            : Math.max(0, series.baseQuantity + series.runningTradeQuantity);
        const pointValue = series.pointByKey.get(bucket.key);
        if (typeof pointValue === 'number') {
          series.lastKnownPrice = pointValue;
          series.hasPrice = true;
        } else if (!series.hasPrice && series.fallbackPrice > 0 && quantityAtBucket > 0) {
          // No history point on this day: use stable fallback price instead of 0.
          series.lastKnownPrice = series.fallbackPrice;
          series.hasPrice = true;
        }

        if (!series.hasPrice || quantityAtBucket <= 0) {
          return;
        }

        totalValue += series.lastKnownPrice * quantityAtBucket;
      });

      return {
        timestamp: bucket.timestamp,
        label: formatLabel(new Date(bucket.timestamp)),
        value: Math.max(0, totalValue),
      };
    });

    const currentPortfolioValue = userPositions.reduce((sum, p) => sum + (p.currentPrice * p.quantity), 0);
    if (chartPointsRaw.length > 0) {
      chartPointsRaw[chartPointsRaw.length - 1] = {
        ...chartPointsRaw[chartPointsRaw.length - 1],
        value: Math.max(0, currentPortfolioValue),
      };
    }

    const firstNonZero = chartPointsRaw.find((p) => p.value > 0);
    const baseValue = firstNonZero?.value ?? 0;
    const chartPoints: PortfolioHistoryPoint[] = chartPointsRaw.map((point) => ({
      ...point,
      changePercent: baseValue > 0 ? ((point.value - baseValue) / baseValue) * 100 : 0,
    }));
    setPortfolioHistory(chartPoints);
  }, [orders, portfolioChartRange, portfolioSymbolSignature, portfolioQuantitySignature, portfolioHistoryCacheVersion, taxTransactions, tradeHistory, userPositions]);

  const portfolioHistoryStart = portfolioHistory.length > 0 ? (portfolioHistory.find((p) => p.value > 0)?.value ?? 0) : 0;
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

    // Automatically determine purchase price if not specified
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
          // Fallback: use current price from form
          buyPrice = parseFloat(formData.currentPrice);
        }
      } catch {
        // Fallback: use current price from the form
        buyPrice = parseFloat(formData.currentPrice);
      } finally {
        setAddingPosition(false);
      }
    }

    const totalCost = buyPrice * quantity;
    
    // Calculate transaction fees
    const fee = (orderSettings.transactionFeeFlat || 0) + totalCost * (orderSettings.transactionFeePercent || 0) / 100;

    // IMPORTANT: Always read the current cash value from the store (not from the closure!)
    const { currentCash, reservedCash, availableCash } = getAvailableCash();

    // Cash check (incl. reserved cash from active buy orders)
    if (totalCost + fee > availableCash) {
      setError(`Insufficient cash. Required: ${(totalCost + fee).toFixed(2)} € (incl. ${fee.toFixed(2)} € fees), Available: ${availableCash.toFixed(2)} €${reservedCash > 0 ? ` (${reservedCash.toFixed(2)} € reserved by active orders)` : ''}`);      
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

    // Record trade history (buy) so purchase date is available when selling
    useAppStore.getState().addTradeHistory({
      id: crypto.randomUUID(),
      type: 'buy',
      symbol: newPosition.symbol,
      name: newPosition.name,
      quantity,
      price: buyPrice,
      totalAmount: totalCost,
      fees: fee,
      date: new Date().toISOString(),
      source: 'manual',
    });

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
    const analysisStartedAt = Date.now();
    const activeApiKey = settings.aiProvider === 'openai' 
      ? settings.apiKeys.openai 
      : settings.aiProvider === 'gemini'
      ? settings.apiKeys.gemini
      : settings.apiKeys.claude;
    const providerName = settings.aiProvider === 'openai' ? 'OpenAI' : settings.aiProvider === 'gemini' ? 'Google Gemini' : 'Claude';
    
    if (!activeApiKey) {
      setError(`Please add your ${providerName} API key in settings.`);
      return;
    }

    if (userPositions.length === 0 && watchlist.length === 0) {
      setError('First add positions to your portfolio or stocks to your watchlist.');
      return;
    }

    setAnalyzing(true);
    setAnalysisProgress({ step: 'Preparation', detail: 'Starting portfolio analysis...', percent: 0 });
    // Do NOT delete old analysis so it remains visible while loading
    // setAnalysisResult(null); — will only be overwritten on success

    try {
      // Load 52-week data (like Autopilot) for consistent analysis
      setAnalysisProgress({ step: 'Market Data', detail: 'Loading 52-week data & technical indicators...', percent: 5 });
      const portfolioSymbols = userPositions.map(p => p.symbol);
      const watchlistSymbolsList = watchlist.map(s => s.symbol);
      const allSymbolsForQuotes = [...new Set([...portfolioSymbols, ...watchlistSymbolsList])];
      let stocksWithRange: import('../types').Stock[] = [];
      try {
        stocksWithRange = await marketDataService.getQuotesWithRange(allSymbolsForQuotes);
      } catch (e) {
        console.warn('[Portfolio] Could not load 52W data, continuing without:', e);
      }

      // Build portfolio context with 52-week data and technical indicators (harmonized with Autopilot)
      setAnalysisProgress({ step: 'Portfolio Context', detail: `Preparing ${userPositions.length} positions with prices, P/L & indicators...`, percent: 15 });
      const portfolioSummary = userPositions.length > 0 ? userPositions.map(p => {
        const pl = getProfitLoss(p);
        const identifier = p.isin ? `${p.name} (ISIN: ${p.isin})` : `${p.symbol} (${p.name})`;
        let info = `${identifier}: ${p.quantity} shares, Buy price: ${p.buyPrice.toFixed(2)} ${p.currency}, Current: ${p.currentPrice.toFixed(2)} ${p.currency}, P/L: ${pl.percent >= 0 ? '+' : ''}${pl.percent.toFixed(2)}% (${pl.absolute >= 0 ? '+' : ''}${pl.absolute.toFixed(2)} ${p.currency})`;
        
        // FIFO holding period for Luxembourg tax (183 days)
        const today = new Date();
        const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        const matchingBuys = tradeHistory
          .filter(t => {
            if (t.type !== 'buy') return false;
            if (symbolsReferToSameInstrument(t.symbol, p.symbol)) return true;
            if (p.isin && t.symbol === p.isin) return true;
            if (normName(t.name) === normName(p.name)) return true;
            return false;
          })
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (matchingBuys.length > 0) {
          const earliestBuy = matchingBuys[0];
          const latestBuy = matchingBuys[matchingBuys.length - 1];
          const earliestDays = Math.floor((today.getTime() - new Date(earliestBuy.date).getTime()) / 86400000);
          const latestDays = Math.floor((today.getTime() - new Date(latestBuy.date).getTime()) / 86400000);

          // Build FIFO lots and subtract sales
          const lots = matchingBuys.map(t => ({ qty: t.quantity, date: new Date(t.date), days: Math.floor((today.getTime() - new Date(t.date).getTime()) / 86400000) }));
          const sells = tradeHistory.filter(t => {
            if (t.type !== 'sell') return false;
            if (symbolsReferToSameInstrument(t.symbol, p.symbol)) return true;
            if (p.isin && t.symbol === p.isin) return true;
            if (normName(t.name) === normName(p.name)) return true;
            return false;
          }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          for (const sell of sells) {
            let rem = sell.quantity;
            for (const lot of lots) { if (rem <= 0) break; const c = Math.min(lot.qty, rem); lot.qty -= c; rem -= c; }
          }
          const shortTerm = lots.filter(l => l.qty > 0 && l.days < 183).reduce((s, l) => s + l.qty, 0);
          const taxFreeQty = lots.filter(l => l.qty > 0 && l.days >= 183).reduce((s, l) => s + l.qty, 0);

          if (matchingBuys.length === 1) {
            info += ` | Buy date: ${new Date(earliestBuy.date).toLocaleDateString('en-US')} (${earliestDays} days ago${earliestDays >= 183 ? ', ✅ TAX-FREE' : `, ⚠️ ${183 - earliestDays} days until tax-free`})`;
          } else {
            info += ` | Buys from ${new Date(earliestBuy.date).toLocaleDateString('en-US')} (${earliestDays}d) to ${new Date(latestBuy.date).toLocaleDateString('en-US')} (${latestDays}d)`;
          }
          info += ` | FIFO holding period (Lux 183d): taxable <6M: ${shortTerm.toFixed(4).replace(/\.?0+$/, '')} shares, tax-free ≥183d: ${taxFreeQty.toFixed(4).replace(/\.?0+$/, '')} shares`;
          if (shortTerm > 0) {
            const soonestFreeLot = lots.filter(l => l.qty > 0 && l.days < 183).sort((a, b) => b.days - a.days)[0];
            if (soonestFreeLot) {
              const daysLeft = 183 - soonestFreeLot.days;
              info += ` | Next tax-free date: in ${daysLeft} days (${new Date(soonestFreeLot.date.getTime() + 183 * 86400000).toLocaleDateString('en-US')})`;
            }
          }
        }
        
        // Add 52-week data (without evaluative labels — the AI should assess itself)
        const stockData = stocksWithRange.find(s => s.symbol === p.symbol);
        if (stockData?.week52High && stockData?.week52Low) {
          const positionInRange = stockData.week52ChangePercent ?? 0;
          info += ` | 52W: ${stockData.week52Low.toFixed(2)}-${stockData.week52High.toFixed(2)} (${positionInRange.toFixed(0)}% in range)`;
        }
        // Add technical indicators (same as aiService)
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
      }).join('\n') : 'No positions in portfolio yet.';

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
      // Enriched with 52W data and technical indicators (harmonized with Autopilot/aiService)
      setAnalysisProgress({ step: 'Watchlist', detail: `Preparing ${watchlist.length} watchlist stocks with price data & indicators...`, percent: 25 });
      const portfolioSymbolsUpper = userPositions.map(p => p.symbol.toUpperCase());
      const watchlistOnly = watchlist.filter(s => !portfolioSymbolsUpper.includes(s.symbol.toUpperCase()));
      const watchlistSummary = watchlistOnly.length > 0
        ? watchlistOnly.map(s => {
            const stockData = stocksWithRange.find(sq => sq.symbol === s.symbol);
            let info = `${s.symbol} (${s.name}): ${(stockData?.price ?? s.price)?.toFixed(2) ?? '?'} ${s.currency} (${(stockData?.changePercent ?? s.changePercent) != null ? ((stockData?.changePercent ?? s.changePercent!) >= 0 ? '+' : '') + (stockData?.changePercent ?? s.changePercent!).toFixed(2) + '%' : '?'})`;
            if (stockData?.week52High && stockData?.week52Low) {
              const posInRange = stockData.week52ChangePercent ?? 0;
              info += ` | 52W: ${stockData.week52Low.toFixed(2)}-${stockData.week52High.toFixed(2)} (${posInRange.toFixed(0)}% in range)`;
            }
            // Add technical indicators
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
        : 'No watchlist stocks available.';

      // Include live news snapshot for current macro/geopolitical situation
      setAnalysisProgress({ step: 'Live News', detail: 'Loading current macro and geopolitical headlines...', percent: 30 });
      let liveNewsContext = `
═══════════════════════════════════════
🗞️ LIVE-NEWS-SNAPSHOT (Macro & Geopolitics):
═══════════════════════════════════════
No live news available.

STRICTLY PROHIBITED:
- Do NOT invent geopolitical events, wars, conflicts, or macro developments.
- Do NOT claim that certain wars are ongoing, central banks have made specific decisions, or geopolitical tensions exist – you have NO current information about these.
- Explicitly write in the market summary: "Note: No current news available. Analysis is based solely on technical indicators and price data. Geopolitical/macroeconomic assessments cannot be provided."
- Restrict analysis to technical indicators, price data, and chart patterns.
`;
      try {
        // News retrieval: tries Finnhub (with key) or Yahoo Finance (without key)
        marketDataService.setApiKey(settings.apiKeys.marketData || '');
        const rawNews = await marketDataService.getMarketNews();

          const toDateLabel = (item: any) => {
            const epoch = typeof item?.datetime === 'number' ? item.datetime * 1000 : NaN;
            const d = Number.isFinite(epoch) ? new Date(epoch) : new Date();
            return d.toLocaleString('en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          };

          // Scoring: Boost for obviously market-relevant news, but ALL headlines
          // are considered – the AI decides for itself what is relevant.
          const highRelevancePattern = /(war|conflict|sanction|inflation|interest|rate|recession|stock|oil|fed|ecb|gdp|trade|tariff|crash|rally|default|debt|bank|energy|nuclear|attack|pandemic|climate)/i;

          const normalizedNews = (rawNews || [])
            .map((n: any) => {
              const headline = (n?.headline || n?.title || '').replace(/\s+/g, ' ').trim();
              const summary = (n?.summary || '').replace(/\s+/g, ' ').trim();
              const source = (n?.source || 'Unknown').toString();
              const dateLabel = toDateLabel(n);
              const text = `${headline} ${summary}`.trim();
              // Boost obviously relevant news, but don't exclude others
              let score = 1; // Base score: Every headline has a chance
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
🗞️ LIVE-NEWS-SNAPSHOT (Macro & Geopolitics):
═══════════════════════════════════════
${newsLines}

BINDING RULES FOR ANALYSIS:
- Use these headlines as the primary basis for current macro/geopolitical events.
- Explicitly mention by name the 1-3 most important current conflicts/events (not just "geopolitical tensions").
- If an event in the snapshot affects your portfolio (e.g., energy, trade, supply chains, regional conflicts), it MUST be explicitly mentioned in the market/macro section.
- Only mention geopolitical/macro events that are documented in the above headlines. Do NOT invent additional conflicts or developments!
- Clearly separate confirmed news facts from conclusions for your portfolio.
`;
          }
      } catch (e) {
        console.warn('[Portfolio] Live news could not be loaded, continuing without news snapshot:', e);
      }

      // Build AI memory context from previous analyses
      setAnalysisProgress({ step: 'AI Memory', detail: 'Evaluating previous analyses & changes since last analysis...', percent: 35 });
      const memoryContext = (() => {
        const history = useAppStore.getState().analysisHistory;
        if (history.length === 0) return '';

        const lastEntry = history[0];
        const lastDate = new Date(lastEntry.date).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        
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
          changes += `\n✅ NEWLY BOUGHT since last analysis:\n${newPositions.map(p => `  - ${p.name} (${p.symbol}): ${p.quantity} shares at ${p.buyPrice.toFixed(2)} ${p.currency}`).join('\n')}`;
        }
        if (removedPositions.length > 0) {
          changes += `\n❌ SOLD since last analysis:\n${removedPositions.map(p => `  - ${p.name} (${p.symbol}): ${p.quantity} shares (was at ${p.buyPrice.toFixed(2)})`).join('\n')}`;
        }
        if (changedPositions.length > 0) {
          changes += `\n🔄 POSITION CHANGED since last analysis:\n${changedPositions.map(p => {
            const prev = prevPositions.find(pp => pp.symbol.toUpperCase() === p.symbol.toUpperCase())!;
            const qtyChange = p.quantity !== prev.quantity ? ` Quantity: ${prev.quantity} → ${p.quantity}` : '';
            const priceChange = Math.abs(prev.buyPrice - p.buyPrice) > 0.01 ? ` Buy price: ${prev.buyPrice.toFixed(2)} → ${p.buyPrice.toFixed(2)}` : '';
            return `  - ${p.name} (${p.symbol}):${qtyChange}${priceChange}`;
          }).join('\n')}`;
        }
        if (cashChanged) {
          changes += `\n💰 CASH CHANGED: ${prevCash.toFixed(2)} EUR → ${cashBalance.toFixed(2)} EUR`;
        }
        if (newWatchlistItems.length > 0) {
          changes += `\n👀 NEW ON WATCHLIST: ${newWatchlistItems.join(', ')}`;
        }
        if (removedWatchlistItems.length > 0) {
          changes += `\n🗑️ REMOVED FROM WATCHLIST: ${removedWatchlistItems.join(', ')}`;
        }

        const noChanges = !newPositions.length && !removedPositions.length && !changedPositions.length && !cashChanged && !newWatchlistItems.length && !removedWatchlistItems.length;

        // Smart truncation: preserve buy recommendations section which often appears later in the text
        const buildPrevAnalysisSummary = (text: string, maxLen: number): string => {
          if (text.length <= maxLen) return text;
          
          // Try to find and preserve the "New Purchase Recommendations" / recommendations section
          const recPatterns = [
            /🆕.*?(?:RECOMMENDATION|Recommendation|PURCHASE)/i,
            /(?:new|neue).*?(?:recommendation|empfehlung|purchase|kauf|buy)/i,
            /🎯.*?(?:ACTION PLAN|action plan)/i,
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
            return firstPart + '\n... (Portfolio assessment truncated) ...\n' + secondPart + (recSectionStart + secondPartLen < text.length ? '\n... (truncated)' : '');
          }
          
          // Fallback: simple truncation with higher limit
          return text.substring(0, maxLen) + '\n... (truncated)';
        };
        
        const prevAnalysisTruncated = buildPrevAnalysisSummary(lastEntry.analysisText, 5000);

        return `
═══════════════════════════════════════
🧠 AI MEMORY: LAST ANALYSIS (${lastDate})
═══════════════════════════════════════
${prevAnalysisTruncated}

═══════════════════════════════════════
📋 CHANGES SINCE LAST ANALYSIS:
═══════════════════════════════════════
${noChanges ? '⚪ No changes to portfolio since last analysis.' : changes}

IMPORTANT FOR THIS ANALYSIS:
- Reference your previous analysis and acknowledge which recommendations have been implemented
- If the user has bought stocks you recommended, confirm this positively
- If recommendations were NOT implemented, repeat them if still current, or update them
- Avoid repeating the same recommendations verbatim - develop the analysis further
- Provide a short section "📝 Implementation Check" at the beginning that summarizes what has happened since last time

`;
      })();

      setAnalysisProgress({ step: 'Autopilot Signals', detail: 'Loading latest autopilot signals for consistent assessment...', percent: 40 });
      // Include latest autopilot signals for consistency between portfolio and autopilot
      const autopilotSignalsContext = (() => {
        const allSignals = useAppStore.getState().signals || [];
        const recentSignals = allSignals.slice(0, 10);
        if (recentSignals.length === 0) return '';
        const signalLines = recentSignals.map(s => {
          const age = Math.round((Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60));
          const ageStr = age < 24 ? 'ago ' + age + 'h' : 'ago ' + Math.round(age / 24) + 'd';
          return '- ' + s.stock.symbol + ': ' + s.signal + ' (Confidence: ' + s.confidence + '%, ' + ageStr + ') - ' + s.reasoning.substring(0, 120) + '...';
        }).join('\n');
        return '═══════════════════════════════════════\n🤖 LATEST AUTOPILOT SIGNALS (for consistent assessment):\n═══════════════════════════════════════\nThese signals were generated by the Autopilot module. Your portfolio analysis should be consistent with these assessments unless new information justifies a deviation.\n' + signalLines + '\n\nIMPORTANT: If your assessment differs from the autopilot signals, explain why!\n';
      })();

      setAnalysisProgress({ step: 'Build Prompt', detail: 'Compiling analysis request with all factors...', percent: 50 });
      const hasPositions = userPositions.length > 0;
      const promptContent = hasPositions 
        ? `You are an experienced investment analyst with expertise in technical analysis, fundamental analysis, macroeconomics, and geopolitics. Analyze my current portfolio holistically and provide concrete recommendations.

═══════════════════════════════════════
MY PORTFOLIO (ONLY these ${userPositions.length} positions I own!):
═══════════════════════════════════════
${portfolioSummary}

TOTAL VALUE:
- Invested: ${totalInvested.toFixed(2)} EUR
- Current Value: ${totalCurrentValue.toFixed(2)} EUR  
- Gain/Loss: ${totalProfitLoss >= 0 ? '+' : ''}${totalProfitLoss.toFixed(2)} EUR (${totalProfitLossPercent >= 0 ? '+' : ''}${totalProfitLossPercent.toFixed(2)}%)

AVAILABLE CASH: ${cashBalance.toFixed(2)} EUR
TOTAL NET WORTH (Cash + Portfolio): ${(cashBalance + totalCurrentValue).toFixed(2)} EUR
${(useAppStore.getState().initialCapital || 0) > 0 ? (() => {
  const store = useAppStore.getState();
  const initCap = store.initialCapital;
  const prevProfit = store.previousProfit || 0;
  const currentProfit = (cashBalance + totalCurrentValue) - initCap;
  const combinedProfit = currentProfit + prevProfit;
  return `INITIAL CAPITAL: ${initCap.toFixed(2)} EUR
TOTAL GAIN (realized + unrealized): ${combinedProfit >= 0 ? '+' : ''}${combinedProfit.toFixed(2)} EUR (${(combinedProfit / initCap * 100).toFixed(1)}%)${prevProfit !== 0 ? `
Of which from previous portfolios: ${prevProfit >= 0 ? '+' : ''}${prevProfit.toFixed(2)} EUR` : ''}`;
})() : ''}
${(orderSettings.transactionFeeFlat || orderSettings.transactionFeePercent) ? `TRANSACTION FEES: ${orderSettings.transactionFeeFlat ? `${orderSettings.transactionFeeFlat.toFixed(2)} € fixed` : ''}${orderSettings.transactionFeeFlat && orderSettings.transactionFeePercent ? ' + ' : ''}${orderSettings.transactionFeePercent ? `${orderSettings.transactionFeePercent}% of volume` : ''} per trade
NOTE: Consider fees in buy/sell recommendations! For small positions, fees can reduce profits.` : ''}

MY STRATEGY:
- Investment Horizon: ${settings.strategy === 'short' ? 'Short-term (days-weeks)' : settings.strategy === 'middle' ? 'Mid-term (weeks-months)' : 'Long-term (10+ years, buy & hold)'}
- Risk Tolerance: ${settings.riskTolerance === 'low' ? 'Conservative' : settings.riskTolerance === 'medium' ? 'Balanced' : 'Aggressive'}

${settings.strategy === 'long' ? `═══════════════════════════════════════
📏 RATING RULES (LONG-TERM STRATEGY 10+ Years):
═══════════════════════════════════════
- Focus on quality companies with strong fundamentals and competitive advantages (Moat)
- Prefer companies with: stable earnings growth, low leverage, strong market position
- Dividend growth and dividend history are important factors
- Short-term price fluctuations are less relevant - focus on long-term growth potential
- The 52W range is NOT a good indicator for overheating in long-term investments
- Use RSI, MACD, and Bollinger Bands for assessment instead
- For long-term investments, stocks near the 52W high can be bought if fundamentals are sound
- Stop-Loss is less relevant for long-term investments - set it generously (20-30% below purchase price)
- Consider megatrends: Digitalization, health, renewable energy, demographic change
- HOLD quality stocks long-term, even with price declines of 20-30%
- Sell ONLY with fundamental deterioration of company (not due to price fluctuations!)
- Gains of 50%, 100% or more are NORMAL with long-term investments - NOT a reason to sell!
- For winners: HOLD and let them run as long as fundamentals remain sound
- Sell recommendation only if: massive overvaluation (P/E >50), deterioration of business outlook, better alternatives
- WARNING for: Meme stocks, highly speculative tech stocks without earnings, penny stocks, crypto-related stocks` 
: settings.strategy === 'short' ? `═══════════════════════════════════════
📏 RATING RULES (SHORT-TERM STRATEGY Days-Weeks):
═══════════════════════════════════════
TECHNICAL INDICATORS (PRIMARY):
- RSI: <30 = oversold (buy opportunity), >70 = overbought (caution/sell), 30-70 = neutral
- MACD > Signal = bullish momentum, MACD < Signal = bearish momentum
- Bollinger %B > 100% = overextension, %B < 0% = oversold
- Price above SMA200 = long-term uptrend, SMA50 above SMA200 = Golden Cross

52-WEEK RANGE (just a minor factor!):
- The 52W range alone says NOTHING about overheating!
- Stocks in strong uptrends stand CONTINUOUSLY near 52W high → that is NORMAL
- Use RSI and MACD as primary overheating indicators, not the 52W range
- A stock at 95% in 52W range with RSI 45 is NOT overheated
- A stock at 60% in 52W range with RSI 78 IS overheated

SHORT-TERM RULES:
- Technical indicators are ESPECIALLY important for timing
- RSI extremes and MACD crossovers as entry/exit signals
- Set tight stop-loss (ATR-based)
- With gain >20% AND RSI >70: Recommend partial sale or profit-taking`
: `═══════════════════════════════════════
📏 RATING RULES (MID-TERM STRATEGY Weeks-Months):
═══════════════════════════════════════
TECHNICAL INDICATORS (PRIMARY):
- RSI: <30 = oversold (buy opportunity), >70 = overbought (caution/sell), 30-70 = neutral
- MACD > Signal = bullish momentum, MACD < Signal = bearish momentum
- Bollinger %B > 100% = overextension, %B < 0% = oversold
- Price above SMA200 = long-term uptrend, SMA50 above SMA200 = Golden Cross

52-WEEK RANGE (just a minor factor!):
- The 52W range alone says NOTHING about overheating!
- Stocks in strong uptrends stand CONTINUOUSLY near 52W high → that is NORMAL
- Use RSI and MACD as primary overheating indicators, not the 52W range
- A stock at 95% in 52W range with RSI 45 is NOT overheated
- A stock at 60% in 52W range with RSI 78 IS overheated

MID-TERM RULES:
- Combination of technical and fundamental analysis
- Trend confirmation via moving averages + MACD
- Balance between growth and risk
- Watch for upcoming earnings, product launches, industry trends
- With gain >20% AND RSI >70: Recommend partial sale or profit-taking`}

═══════════════════════════════════════
MY WATCHLIST (stocks I'm watching, which I do NOT own):
═══════════════════════════════════════
${watchlistSummary}

TODAY'S DATE: ${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

${liveNewsContext}

═══════════════════════════════════════
🌍 COMPREHENSIVE ANALYSIS METHODOLOGY:
═══════════════════════════════════════
Analyze EVERY stock and the overall portfolio from ALL the following perspectives:

**A) TECHNICAL ANALYSIS** (already provided in the price data above):
- RSI, MACD, SMA, Bollinger Bands → already included in price data
- Chart patterns, support/resistance, trendlines

**B) FUNDAMENTAL ANALYSIS:**
- Valuation metrics: P/E, P/S, P/B, PEG ratio — Is the stock fairly valued?
- Profitability: Profit margins, operating margin, free cashflow
- Growth: Revenue and earnings growth (YoY), forward guidance
- Balance sheet quality: Debt-to-equity ratio, current ratio, cash position
- Competitive advantages: Moat (brand, network effects, switching costs, cost advantages, patents)
- Management quality: Track record, capital allocation, insider transactions

**C) MACROECONOMIC ENVIRONMENT:**
- Interest rate development: Fed/ECB base rates and their impact on stocks (growth vs. value)
- Inflation: Current inflation rate, impact on companies and consumers
- Business cycle: Where are we in the economic cycle? (Expansion, peak, recession, recovery)
- Bond yields: 10-year yields and yield curve — recession signal?
- Labor market: Employment situation, wage development, consumer sentiment
- Monetary policy: QE/QT, central bank balance sheet reduction

**D) GEOPOLITICAL FACTORS:**
- Conflicts & wars: Impact on energy, defense, supply chains
- Trade policy: Tariffs, sanctions, trade agreements (US-China, EU regulation)
- Political stability: Elections, government changes, regulatory changes
- Supply chains: Bottlenecks, reshoring trends, China risk, chip embargo
- Energy policy: Oil prices, gas prices, energy transition dynamics

**E) SECTOR ANALYSIS & INDUSTRY TRENDS:**
- Sector rotation: Which sectors are currently preferred? (Cyclicals vs. defensives)
- Industry-specific risks: Regulation, competition, technological disruption
- Megatrends: AI/machine learning, electromobility, healthcare/biotech, cybersecurity, cloud
- ESG factors: Sustainability risks, CO2 regulation, greenwashing risks

**F) RISK & PORTFOLIO ANALYSIS:**
- Correlation risk: Are positions too strongly correlated? (e.g., multiple tech stocks)
- Concentration risk: Is a single position or sector too dominant?
- Currency risk: EUR/USD impact on US stocks, hedging needs
- Liquidity risk: Trading volume, spread, market cap
- Tail risk: Black-swan scenarios, maximum drawdown
- Dividend characteristics: Yield, payout ratio, dividend growth, ex-dividend dates

**G) MARKET SENTIMENT & TIMING:**
- Market sentiment: Current sentiment (fear & greed), VIX level
- Seasonality: "Sell in May", year-end rally, tax effects
- Upcoming events: Earnings dates, central bank meetings, economic data
- Options market signals: Put/call ratio, unusual activity
- Institutional flow: Are large investors buying or selling?

IMPORTANT: You do NOT need to comment on every point for every stock. Focus on the MOST RELEVANT factors for each stock. But DO consider the macro/geopolitical situation for the OVERALL PORTFOLIO!

${(() => {
  const activeOrders = useAppStore.getState().orders.filter(o => o.status === 'active');
  if (activeOrders.length === 0) return `═══════════════════════════════════════
📝 ACTIVE ORDERS: NONE
═══════════════════════════════════════
The user has NO active orders. NEVER claim in your analysis that an order "is pending", "exists" or "is set"! If you recommend a new order, clearly state it as a NEW recommendation (e.g., "Recommend setting limit-sell at X EUR").
`;
  const orderTypeLabels: Record<string, string> = { 'limit-buy': 'Limit Buy', 'limit-sell': 'Limit Sell', 'stop-loss': 'Stop Loss', 'stop-buy': 'Stop Buy' };
  return `═══════════════════════════════════════
📝 MY ACTIVE ORDERS (these orders already exist!):
═══════════════════════════════════════
${activeOrders.map(o => `- ${o.symbol} (${o.name}): ${orderTypeLabels[o.orderType] || o.orderType} | Trigger: ${o.triggerPrice.toFixed(2)} EUR | Quantity: ${o.quantity} shares${o.note ? ` | ${o.note}` : ''}`).join('\n')}

IMPORTANT: Do NOT recommend orders that are already listed above!
- If an order for a symbol+type already exists, do NOT mention it again as a new recommendation
- You can assess existing orders (whether they still make sense)
- Only if an existing order should be adjusted, recommend a new one with a different trigger price

⚠️ CRITICAL: ONLY the listed orders above actually exist! NEVER claim an order "is pending" or "exists" if it is NOT listed above. If you recommend a NEW order, phrase it as a recommendation (e.g., "Recommend setting limit-sell at X EUR"), NOT as if it already exists!
`;
})()}
${memoryContext}
${(() => {
  const currentYear = new Date().getFullYear();
  const LUX_EXEMPTION = 500;
  const allTax = useAppStore.getState().taxTransactions;
  const yearTx = allTax.filter(tx => (tx.transactionType === 'capital-gain' || !tx.transactionType) && new Date(tx.sellDate).getFullYear() === currentYear);
  if (yearTx.length === 0) return '';

  const shortTermTx = yearTx.filter(tx => !tx.taxFree);
  const gains = shortTermTx.filter(tx => tx.gainLoss > 0).reduce((s, tx) => s + tx.gainLoss, 0);
  const losses = shortTermTx.filter(tx => tx.gainLoss < 0).reduce((s, tx) => s + tx.gainLoss, 0);
  const net = gains + losses;
  const taxable = Math.max(0, net - LUX_EXEMPTION);
  const headroom = net < 0 ? Math.abs(net) + LUX_EXEMPTION : (net <= LUX_EXEMPTION ? LUX_EXEMPTION - net : 0);

  return `
═══════════════════════════════════════
💶 TAX STATUS ${currentYear} (Luxembourg – Short-term speculation transactions <6 months):
═══════════════════════════════════════
Realized Gains:        +${gains.toFixed(2)} €
Realized Losses:       ${losses.toFixed(2)} €
Net Result:            ${net >= 0 ? '+' : ''}${net.toFixed(2)} €
Tax Exemption:         ${LUX_EXEMPTION} €
To Tax:                ${taxable.toFixed(2)} € ${taxable === 0 ? '✅ (currently no tax)' : '⚠️'}
${headroom > 0 && taxable === 0 ? `Still available tax-free headroom: ~${headroom.toFixed(2)} € profit possible before tax liability` : ''}
Transactions <6M: ${shortTermTx.length} (${shortTermTx.filter(tx => tx.gainLoss > 0).length} gains, ${shortTermTx.filter(tx => tx.gainLoss < 0).length} losses)

IMPORTANT FOR YOUR RECOMMENDATIONS:
- Consider when making sell recommendations whether the position would be taxable (<6 months holding period)
- ${taxable === 0 ? `Currently ~${headroom.toFixed(2)} € profit is still realizable tax-free (loss buffer + exemption)` : `${taxable.toFixed(2)} € of taxable gains above exemption have already been realized`}
- If losses exist: Strategic tax-loss harvesting could be beneficial
- Tax-free gains (≥6 months holding period) do not affect this calculation
`;
})()}
${autopilotSignalsContext}
═══════════════════════════════════════
TASK:
═══════════════════════════════════════

🌍 **0. MARKET & MACRO ASSESSMENT** (brief and concise)
- Current macro situation: Interest rates, inflation, economy
- Geopolitical risks affecting the portfolio (name current conflicts/events explicitly by name if in live-news snapshot)
- Market sentiment & relevant upcoming events (earnings, Fed, etc.)
- What does this mean for MY specific portfolio?

📊 **1. PORTFOLIO ANALYSIS** (ONLY my ${userPositions.length} positions listed above!)
IMPORTANT: Analyze ONLY the positions listed above under "MY PORTFOLIO".
Do NOT invent additional positions! Do NOT add watchlist stocks here!

⚠️ YOU MUST ASSESS EACH AND EVERY ONE OF THE ${userPositions.length} POSITIONS! Do not skip any!
Here is the complete list of positions to assess:
${userPositions.map((p, i) => `  ${i + 1}. ${p.name} (${p.symbol})`).join('\n')}

For EACH of these ${userPositions.length} positions there MUST be an assessment:
- HOLD, BUY MORE, PARTIAL SALE, or SELL
- Technical situation (RSI, MACD, trend) + most important fundamentals
- Macro/geopolitical influence if relevant for this stock
- Concrete action suggestion with target price

📈 **2. OVERALL ASSESSMENT**
- Diversification check (sectors, regions, currencies, correlations)
- Diversification check (sectors, regions, currencies, correlations)
- Concentration risks (too much in one sector/region?)
- Currency risk assessment (EUR/USD exposure)
- Risk assessment of overall portfolio in current market environment

🆕 **3. NEW PURCHASE RECOMMENDATIONS** (from watchlist and beyond)
Based on my available cash of ${cashBalance.toFixed(2)} EUR and my strategy:
- First check my watchlist stocks above and recommend the best ones
- Supplement with additional stocks/ETFs if needed (total 3-5 recommendations)
- For each recommendation: Name, ticker symbol, current approximate price in EUR
- Rationale: Technical AND fundamental AND macro fit to current environment
- How does the recommendation fit into diversification of my existing portfolio? (Sector, region, currency)
- Suggested investment amount in EUR
- IMPORTANT: Do NOT recommend stocks I already have in my portfolio!

📝 **4. ASSESS EXISTING ORDERS** (if any)
- Are the active orders still reasonable?
- Do trigger prices need to be adjusted?
- Should orders be cancelled?

🎯 **5. ACTION PLAN**
- Prioritized list of next steps
- What to do immediately, what to monitor
- Do NOT repeat orders that are already active!

${settings.customPrompt ? `
═══════════════════════════════════════
⚙️ PERSONAL INSTRUCTIONS (MUST OBSERVE!):
═══════════════════════════════════════
${settings.customPrompt}
` : ''}
${settings.aiLanguage === 'de' ? 'Antworte auf Deutsch mit Emojis für bessere Übersicht.' : settings.aiLanguage === 'fr' ? 'Réponds en français avec des emojis pour une meilleure vue d\'ensemble.' : 'Answer in English with emojis for better overview.'}`
        : `You are an experienced investment analyst with expertise in technical analysis, fundamental analysis, macroeconomics, and geopolitics. I have no positions in my portfolio yet and want to start investing.

═══════════════════════════════════════
MY PORTFOLIO:
═══════════════════════════════════════
No positions yet.

AVAILABLE CASH: ${cashBalance.toFixed(2)} EUR
${(useAppStore.getState().initialCapital || 0) > 0 ? `INITIAL CAPITAL: ${useAppStore.getState().initialCapital.toFixed(2)} EUR` : ''}

MY STRATEGY:
- Investment Horizon: ${settings.strategy === 'short' ? 'Short-term (days-weeks)' : settings.strategy === 'middle' ? 'Mid-term (weeks-months)' : 'Long-term (10+ years, buy & hold)'}
- Risk Tolerance: ${settings.riskTolerance === 'low' ? 'Conservative' : settings.riskTolerance === 'medium' ? 'Balanced' : 'Aggressive'}

═══════════════════════════════════════
MY WATCHLIST (stocks I'm watching):
═══════════════════════════════════════
${watchlistSummary}

TODAY'S DATE: ${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

${liveNewsContext}

═══════════════════════════════════════
🌍 COMPREHENSIVE ANALYSIS METHODOLOGY:
═══════════════════════════════════════
Analyze the watchlist stocks from ALL the following perspectives:
- **Technical Analysis**: RSI, MACD, SMA, Bollinger Bands, chart patterns
- **Fundamental Analysis**: P/E, growth, profitability, moat, balance sheet quality
- **Macroeconomics**: Interest rates, inflation, business cycle
- **Geopolitics**: Trade policy, conflicts, supply chains
- **Sector Analysis**: Industry trends, megatrends, sector rotation
- **Sentiment**: Market sentiment, VIX, upcoming events

═══════════════════════════════════════
TASK:
═══════════════════════════════════════

🌍 **0. MARKET & MACRO ASSESSMENT**
- Current macro situation: Interest rates, inflation, economy
- Geopolitical risks (name current conflicts/events explicitly by name if in live-news snapshot)
- Market sentiment & relevant upcoming events
- What does this mean for a beginner?

🛒 **1. PURCHASE RECOMMENDATIONS** (MAIN FOCUS!)
Based on my available cash of ${cashBalance.toFixed(2)} EUR and my strategy:
- Analyze EACH watchlist stock in detail with buy/wait recommendation
- For each buy recommendation: Technical + fundamental rationale, specific entry price, stop-loss, price target
- Suggested investment amount in EUR (position sizing recommendation)
- Consider diversification: Mix of sectors, regions, risk profiles
- Supplement with 2-3 additional stocks/ETFs beyond watchlist if needed

📊 **2. PORTFOLIO BUILD-UP STRATEGY**
- How should I allocate my cash? (e.g., 60% immediately, 20% staged, 20% reserve)
- Recommended sector and regional distribution
- Core positions vs. growth positions
- When and how to invest gradually? (Timing strategy)

🎯 **3. ACTION PLAN**
- Prioritized buy list: What to buy first?
- Entry strategy: Buy immediately or wait for better prices?
- Cash management: How much cash to reserve initially?

${settings.customPrompt ? `
═══════════════════════════════════════
⚙️ PERSONAL INSTRUCTIONS (MUST OBSERVE!):
═══════════════════════════════════════
${settings.customPrompt}
` : ''}
${settings.aiLanguage === 'de' ? 'Antworte auf Deutsch mit Emojis für bessere Übersicht.' : settings.aiLanguage === 'fr' ? 'Réponds en français avec des emojis pour une meilleure vue d’ensemble.' : 'Answer in English with emojis for better overview.'}`;

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
              { role: 'system', content: `You are an experienced investment analyst with expertise in technical analysis, fundamental analysis, macroeconomics, and geopolitics. Answer in ${settings.aiLanguage === 'de' ? 'German (Deutsch)' : settings.aiLanguage === 'fr' ? 'French (Français)' : 'English'} with emojis.` },
              { role: 'user', content: promptContent },
            ],
          })
        : isGemini
        ? JSON.stringify({
            contents: [{ parts: [{ text: promptContent }] }],
            systemInstruction: { parts: [{ text: `You are an experienced investment analyst with expertise in technical analysis, fundamental analysis, macroeconomics, and geopolitics. Answer in ${settings.aiLanguage === 'de' ? 'German (Deutsch)' : settings.aiLanguage === 'fr' ? 'French (Français)' : 'English'} with emojis.` }] },
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
      setAnalysisProgress({ step: 'AI Analysis', detail: `${modelDisplayName} analyzing portfolio (technical, fundamentals, macro, geopolitics)...`, percent: 60 });
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
          console.warn(`[Portfolio Analysis] Status ${response.status} - Retry ${attempt + 1}/${maxRetries} in ${waitMs}ms...`);
          setAnalysisProgress({ step: 'AI Analysis', detail: `Server overloaded — Retry ${attempt + 1}/${maxRetries} in ${Math.round(waitMs / 1000)}s...`, percent: 65 });
          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }
        break;
      }

      if (!response || !response.ok) {
        const errorText = response ? await response.text() : 'No response';
        let errorMsg = `API error ${response?.status || 'unknown'}`;
        // User-friendly message when overloaded
        if (response?.status === 529 || errorText.toLowerCase().includes('overloaded')) {
          errorMsg = 'The AI server is currently overloaded. Please try again in 1-2 minutes.';
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
        throw new Error('AI did not provide a response. Please try again.');
      }

      setAnalysisProgress({ step: 'Saving', detail: 'Saving analysis & sending notifications...', percent: 95 });
      setAnalysisResult(content, Date.now() - analysisStartedAt);

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
        const telegramHeader = `📊 *Portfolio Analysis*\n🤖 AI Model: ${modelDisplayName}\n\n`;
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
          const partIndicator = totalParts > 1 ? `(Part ${i + 1}/${totalParts})\n` : '';
          const messageText = i === 0 
            ? `${telegramHeader}${partIndicator}${chunks[i]}`
            : `📊 *Portfolio Analysis* ${partIndicator}\n${chunks[i]}`;
          
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
              subject: `📊 Vestia Portfolio Analysis (${modelDisplayName})`,
              stock_name: 'Portfolio Analysis',
              stock_symbol: 'PORTFOLIO',
              signal_type: `ANALYSE (${modelDisplayName})`,
              price: `${totalCurrentValue.toFixed(2)} EUR`,
              change: `${totalProfitLossPercent >= 0 ? '+' : ''}${totalProfitLossPercent.toFixed(2)}%`,
              confidence: '-',
              risk_level: settings.riskTolerance === 'low' ? 'Low' : settings.riskTolerance === 'medium' ? 'Medium' : 'High',
              reasoning: `🤖 KI-Modell: ${modelDisplayName}\n\n${content}`,
              target_price: '-',
              stop_loss: '-',
              date: new Date().toLocaleString('en-US'),
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
      const msg = error.message || 'Analysis failed';
      // Shorten error message if it's a huge API response
      setError(msg.length > 300 ? msg.slice(0, 300) + '...' : msg);
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
    }
  };

  // FIFO holding period analysis per position (Luxembourg: 183 days = tax-free)
  const LUX_SPECULATION_DAYS = 183;

  const normalizeInstrumentName = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  const formatQuantity = (qty: number) =>
    qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(4).replace(/\.?0+$/, '');

  const formatAnalysisDuration = (durationMs: number | null) => {
    if (!durationMs || durationMs <= 0) return null;
    const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${totalSeconds} Sec.`;
    if (seconds === 0) return `${minutes} Min.`;
    return `${minutes} Min. ${seconds} Sec.`;
  };

  useEffect(() => {
    if (wasAnalyzingRef.current && !analyzing && analysisResult && analysisResultRef.current) {
      analysisResultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      analysisResultRef.current.focus({ preventScroll: true });
    }

    wasAnalyzingRef.current = analyzing;
  }, [analyzing, analysisResult]);

  const fifoBreakdownByPositionId = useMemo(() => {
    const today = new Date();
    const result: Record<string, { shortTerm: number; taxFree: number; nextFreeDays: number | null; lastFreeDays: number | null; shortTermValue: number; taxFreeValue: number; pendingLots: { qty: number; daysLeft: number }[] }> = {};

    for (const position of userPositions) {
      const matchingBuys = tradeHistory
        .filter(t => {
          if (t.type !== 'buy') return false;
          if (symbolsReferToSameInstrument(t.symbol, position.symbol)) return true;
          if (position.isin && t.symbol === position.isin) return true;
          if (normalizeInstrumentName(t.name) === normalizeInstrumentName(position.name)) return true;
          return false;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (matchingBuys.length === 0) {
        result[position.id] = { shortTerm: -1, taxFree: -1, nextFreeDays: null, lastFreeDays: null, shortTermValue: 0, taxFreeValue: 0, pendingLots: [] }; // -1 = no history
        continue;
      }

      // Build FIFO lots
      const lots = matchingBuys.map(t => ({ qty: t.quantity, date: new Date(t.date) }));

      // Subtract sales from lots
      const sells = tradeHistory
        .filter(t => {
          if (t.type !== 'sell') return false;
          if (symbolsReferToSameInstrument(t.symbol, position.symbol)) return true;
          if (position.isin && t.symbol === position.isin) return true;
          if (normalizeInstrumentName(t.name) === normalizeInstrumentName(position.name)) return true;
          return false;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (const sell of sells) {
        let remaining = sell.quantity;
        for (const lot of lots) {
          if (remaining <= 0) break;
          const consumed = Math.min(lot.qty, remaining);
          lot.qty -= consumed;
          remaining -= consumed;
        }
      }

      // Remaining lots after holding period split
      let shortTerm = 0;
      let taxFree = 0;
      let minDaysRemaining: number | null = null;
      let maxDaysRemaining: number | null = null;
      const currentPrice = position.currentPrice ?? position.buyPrice ?? 0;
      const pendingLotsMap = new Map<number, number>(); // daysLeft -> qty
      for (const lot of lots) {
        if (lot.qty < 0.0001) continue;
        const holdingDays = Math.floor((today.getTime() - lot.date.getTime()) / 86400000);
        if (holdingDays >= LUX_SPECULATION_DAYS) {
          taxFree += lot.qty;
        } else {
          const daysLeft = LUX_SPECULATION_DAYS - holdingDays;
          if (minDaysRemaining === null || daysLeft < minDaysRemaining) minDaysRemaining = daysLeft;
          if (maxDaysRemaining === null || daysLeft > maxDaysRemaining) maxDaysRemaining = daysLeft;
          shortTerm += lot.qty;
          pendingLotsMap.set(daysLeft, (pendingLotsMap.get(daysLeft) ?? 0) + lot.qty);
        }
      }

      // Rounding-Drift anpassen
      const totalFifo = shortTerm + taxFree;
      if (totalFifo > 0 && Math.abs(totalFifo - position.quantity) / position.quantity < 0.02) {
        const scale = position.quantity / totalFifo;
        shortTerm *= scale;
        taxFree *= scale;
      }

      const pendingLots = Array.from(pendingLotsMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([daysLeft, qty]) => ({ daysLeft, qty }))
        .filter(l => l.qty >= 0.0001);

      result[position.id] = {
        shortTerm,
        taxFree,
        nextFreeDays: minDaysRemaining,
        lastFreeDays: maxDaysRemaining,
        shortTermValue: shortTerm * currentPrice,
        taxFreeValue: taxFree * currentPrice,
        pendingLots,
      };
    }
    return result;
  }, [userPositions, tradeHistory]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-12 lg:pt-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">My Portfolio</h1>
          <p className="text-sm text-gray-400">
            Manage and analyze your stocks
            {lastUpdate && (
              <span className="block md:inline md:ml-2 text-xs text-gray-500">
                • Prices updated: {lastUpdate.toLocaleTimeString()}
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
            <span className="hidden sm:inline">Add</span> Position
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-purple-600 hover:bg-purple-700 
                     text-white rounded-lg transition-colors text-sm md:text-base"
          >
            <Upload size={16} />
            CSV Import
          </button>
          <button
            onClick={analyzePortfolio}
            disabled={analyzing || (userPositions.length === 0 && watchlist.length === 0)}
            className="flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-green-600 hover:bg-green-700 
                     disabled:bg-green-600/50 text-white rounded-lg transition-colors text-sm md:text-base"
          >
            {analyzing ? (
              <>
                <RefreshCw className="animate-spin" size={16} />
                <span className="hidden sm:inline">{analysisProgress?.step || 'Analyzing...'}</span>
                <span className="sm:hidden">...</span>
              </>
            ) : (
              <>
                <Brain size={16} />
                Full Analysis
              </>
            )}
          </button>
          <button
            onClick={fetchYahooPrices}
            disabled={loadingYahooPrices || userPositions.length === 0}
            className="flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 
                     disabled:bg-blue-600/50 text-white rounded-lg transition-colors text-sm md:text-base"
            title={lastUpdate ? `Last updated: ${lastUpdate.toLocaleTimeString()}` : 'Not yet updated'}
          >
            {loadingYahooPrices ? (
              <>
                <RefreshCw className="animate-spin" size={18} />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw size={18} />
                Update Prices
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
              <p className="text-gray-400 text-xs md:text-sm">Available Cash</p>
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
                      {cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} €
                    </p>
                    {(() => {
                      const { reservedCash, availableCash } = getAvailableCash();
                      if (reservedCash > 0) {
                        return (
                          <p className="text-xs text-orange-400 mt-0.5">
                            of which {reservedCash.toLocaleString('en-US', { minimumFractionDigits: 2 })} € reserved
                            <span className="text-gray-500"> → available: {availableCash.toLocaleString('en-US', { minimumFractionDigits: 2 })} €</span>
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
              <p className="text-gray-400 text-xs md:text-sm">Positions</p>
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
              <p className="text-gray-400 text-xs md:text-sm">Invested</p>
              <p className="text-lg md:text-2xl font-bold text-white truncate">
                {totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2 })} €
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
              <p className="text-gray-400 text-xs md:text-sm">Current Value</p>
              <p className="text-lg md:text-2xl font-bold text-white truncate">
                {totalCurrentValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} €
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
              <p className="text-gray-400 text-xs md:text-sm">Profit/Loss</p>
              <p className={`text-lg md:text-2xl font-bold ${
                totalProfitLoss >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {totalProfitLoss >= 0 ? '+' : ''}{totalProfitLoss.toLocaleString('en-US', { minimumFractionDigits: 2 })} €
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
            <h2 className="text-base md:text-lg font-semibold text-white">Portfolio History</h2>
            <p className="text-xs md:text-sm text-gray-400 mt-1">
              Evolution of your total portfolio value
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {[
              { value: '1d' as const, label: 'Day' },
              { value: '5d' as const, label: 'Week' },
              { value: '1mo' as const, label: 'Month' },
              { value: '1y' as const, label: 'Year' },
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
          <span className="text-gray-400">Period:</span>
          <span className="text-white font-semibold">
            {portfolioHistoryEnd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </span>
          <span className={`flex items-center gap-1 ${portfolioHistoryDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {portfolioHistoryDiff >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {portfolioHistoryDiff >= 0 ? '+' : ''}
            {portfolioHistoryDiff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
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
              Not enough history data available
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
                      `${percentValue >= 0 ? '+' : ''}${percentValue.toFixed(2)}% (${absoluteValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €)`,
                      'Change',
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
              <h2 className="text-xl font-semibold text-white">Add Position</h2>
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
                      placeholder="e.g. AAPL, MSFT"
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
                    placeholder="e.g. US0378331005"
                    className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                             text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">Enter symbol OR ISIN (one is enough) – suggestions appear as you type</p>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Apple Inc."
                  className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                           text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Number of Shares *
                </label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="e.g. 10"
                  step="0.001"
                  className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                           text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Buy Price <span className="text-gray-500 text-xs">(optional)</span>
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
                    Current Price *
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
                  Currency
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
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Determining price...</>
                ) : (
                  'Add Position'
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
            My Positions
          </h2>
        </div>

        {userPositions.length === 0 ? (
          <div className="p-12 text-center">
            <Briefcase size={48} className="mx-auto text-gray-500 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No positions yet</h3>
            <p className="text-gray-400 max-w-md mx-auto">
              Add your current stocks to get an AI analysis.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm bg-[#252542]/50">
                  <th className="px-6 py-4">Symbol / ISIN</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4 text-right">Quantity</th>
                  <th className="px-6 py-4 text-right">Buy Price</th>
                  <th className="px-6 py-4 text-right">Current</th>
                  <th className="px-6 py-4 text-right">Value</th>
                  <th className="px-6 py-4 text-right">G/V</th>
                  <th className="px-6 py-4 text-center">Action</th>
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
                              placeholder="e.g. SAP.DE"
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
                              <span className="block text-xs text-yellow-500 mt-0.5" title="Yahoo Finance price">
                                {loadingYahooPrices ? 'Loading Yahoo...' : 
                                 yahooPrices[position.id] !== undefined ? 
                                   `Yahoo: ${yahooPrices[position.id].toFixed(2)} EUR` : 
                                   'Yahoo: not available'}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setEditSymbol(position.symbol || '');
                                setEditingPosition(position.id);
                              }}
                              className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                              title="Edit symbol"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-300">{position.name}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-white">{position.quantity}</span>
                        {(() => {
                          const fifo = fifoBreakdownByPositionId[position.id];
                          if (!fifo) return null;
                          if (fifo.shortTerm === -1) return (
                            <span className="text-gray-600 text-xs block">FIFO: no history</span>
                          );
                          return (
                            <span className="text-xs block space-y-0.5 mt-0.5">
                              {fifo.pendingLots.map((lot, i) => (
                                <span key={i} className="flex items-center justify-end gap-1.5 block">
                                  <span className="font-bold text-white">{formatQuantity(lot.qty)}</span>
                                  <span className="text-gray-400">in</span>
                                  <span className="text-amber-400 font-semibold">{lot.daysLeft} Days</span>
                                  <span className="text-gray-500">available</span>
                                </span>
                              ))}
                              {fifo.taxFree > 0 && (
                                <span className="flex items-center justify-end gap-1.5 block">
                                  <span className="font-bold text-white">{formatQuantity(fifo.taxFree)}</span>
                                  <span className="text-emerald-400 font-semibold">✓ Free</span>
                                </span>
                              )}
                            </span>
                          );
                        })()}
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
                              title="Edit buy price"
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
                                  Loading...
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
                                title="Edit price"
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
                                  title={position.useYahooPrice ? 'Yahoo live price active' : 'Use Yahoo price'}
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
                              {tradeAction.type === 'buy' ? '📈 Buy More' : '📉 Sell'}
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
                                  placeholder="Buy price"
                                  className="w-24 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-center"
                                  autoFocus
                                />
                                <input
                                  type="number"
                                  step="1"
                                  min="1"
                                  value={tradeQuantity}
                                  onChange={(e) => setTradeQuantity(e.target.value)}
                                  placeholder="Quantity"
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
                                  placeholder="Sell price"
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
                                  placeholder="Quantity"
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
                              title="Buy more"
                            >
                              <ShoppingCart size={16} />
                            </button>
                            <button
                              onClick={() => { setTradeAction({ positionId: position.id, type: 'sell' }); setTradeQuantity(position.quantity.toString()); setTradePrice((yahooPrices[position.id] ?? position.currentPrice).toFixed(2)); }}
                              className="p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                              title="Sell"
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

      {/* CSV Import Modal */}
      <CSVImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} />

      {/* Trade-Historie */}
      <TradeHistory />

      {/* AI Analysis Result */}
      {analysisResult && (
        <div
          ref={analysisResultRef}
          tabIndex={-1}
          className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-indigo-500/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Brain size={20} className="text-indigo-500" />
              Portfolio Full Analysis
            </h2>
            <div className="flex items-start gap-3">
              {(lastAnalysisDate || lastAnalysisDurationMs) && (
                <div className="text-right text-xs text-gray-500 space-y-1">
                  {lastAnalysisDate && (
                    <div>
                      {new Date(lastAnalysisDate).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  {formatAnalysisDuration(lastAnalysisDurationMs) && (
                    <div className="text-cyan-300">Duration: {formatAnalysisDuration(lastAnalysisDurationMs)}</div>
                  )}
                </div>
              )}
              <button
                onClick={() => setAnalysisResult(null)}
                className="p-1 hover:bg-[#252542] rounded"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
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
