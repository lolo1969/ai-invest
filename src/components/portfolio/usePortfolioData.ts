import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { marketDataService } from '../../services/marketData';
import type { PortfolioHistoryPoint, PortfolioChartRange } from './portfolioTypes';
import { PORTFOLIO_CHART_RANGES, HISTORY_CACHE_TTL_MS } from './portfolioTypes';

export function usePortfolioData() {
  const userPositions = useAppStore(s => s.userPositions);

  const [yahooPrices, setYahooPrices] = useState<Record<string, number>>({});
  const [loadingYahooPrices, setLoadingYahooPrices] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [portfolioChartRange, setPortfolioChartRange] = useState<PortfolioChartRange>('1mo');
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [loadingPortfolioHistory, setLoadingPortfolioHistory] = useState(false);
  const [portfolioHistoryCacheVersion, setPortfolioHistoryCacheVersion] = useState(0);

  const historicalDataCacheRef = useRef<Record<string, { data: Array<{ date: Date; close: number }>; fetchedAt: number }>>({});

  const isHistoryCacheFresh = (range: PortfolioChartRange, symbol: string, now = Date.now()) => {
    const cached = historicalDataCacheRef.current[`${range}:${symbol}`];
    return !!cached && (now - cached.fetchedAt) <= HISTORY_CACHE_TTL_MS;
  };

  const fetchYahooPrices = async () => {
    const currentPositions = useAppStore.getState().userPositions;
    if (currentPositions.length === 0) return;

    console.log('[Yahoo] Fetching prices for', currentPositions.length, 'positions...');
    setLoadingYahooPrices(true);
    const prices: Record<string, number> = {};

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

  // Fetch Yahoo Finance prices on mount and auto-refresh every 60s
  useEffect(() => {
    fetchYahooPrices();
    const interval = setInterval(fetchYahooPrices, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch when positions change or useYahooPrice toggles change
  const positionCount = userPositions.length;
  const yahooEnabledSignature = userPositions.map(p => `${p.id}:${p.useYahooPrice}`).join(',');

  useEffect(() => {
    if (positionCount > 0) {
      console.log('[Yahoo] Positions or settings changed, refetching...');
      fetchYahooPrices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionCount, yahooEnabledSignature]);

  const portfolioSymbolSignature = userPositions
    .map((p) => p.symbol.trim())
    .filter(Boolean)
    .sort()
    .join('|');
  const portfolioQuantitySignature = userPositions
    .map(p => `${p.id}:${p.quantity}`)
    .sort()
    .join('|');

  // Load missing portfolio history for current range
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

  // Prefetch other ranges in background
  useEffect(() => {
    let isCancelled = false;

    const symbols = [...new Set(userPositions.map((p) => p.symbol.trim()).filter(Boolean))];
    if (symbols.length === 0) {
      return;
    }

    const prefetchRanges = PORTFOLIO_CHART_RANGES.filter((range) => range !== portfolioChartRange);

    const prefetchInBackground = async () => {
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

  // Build chart data from cache
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

  return {
    yahooPrices,
    loadingYahooPrices,
    lastUpdate,
    fetchYahooPrices,
    portfolioChartRange,
    setPortfolioChartRange,
    portfolioHistory,
    loadingPortfolioHistory,
    portfolioHistoryEnd,
    portfolioHistoryDiff,
    portfolioHistoryDiffPercent,
  };
}
