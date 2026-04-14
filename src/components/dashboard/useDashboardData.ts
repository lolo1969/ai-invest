import { useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useStocksWithRange, useAIAnalysis } from '../../hooks/useMarketData';
import type { Stock } from '../../types';

export function useDashboardData() {
  const {
    settings,
    userPositions,
    watchlist: cachedWatchlist,
    addToWatchlist,
    updateUserPosition,
  } = useAppStore();

  // Merge symbol sources: settings.watchlist (string[]) is the source of truth + portfolio positions
  // Only include cached watchlist items that are still in settings.watchlist
  const allWatchlistSymbols = useMemo(() => {
    const symbols = new Set<string>(settings.watchlist);
    // Include portfolio position symbols so their prices also get fetched
    userPositions.forEach(p => symbols.add(p.symbol));
    return [...symbols];
  }, [settings.watchlist, userPositions]);

  // Use React Query for stock data (with technical indicators)
  const {
    data: fetchedStocks = [],
    isLoading,
    refetch,
    isRefetching,
  } = useStocksWithRange(allWatchlistSymbols);

  // All fetched/cached stocks (includes portfolio positions for price updates)
  const stocks = useMemo(() => {
    const result: Stock[] = [];
    for (const symbol of allWatchlistSymbols) {
      const fetched = fetchedStocks.find(s => s.symbol === symbol);
      const cached = cachedWatchlist.find(s => s.symbol === symbol);
      result.push(fetched || cached || {
        symbol,
        name: symbol,
        price: 0,
        change: 0,
        changePercent: 0,
        currency: 'EUR',
        exchange: '',
      });
    }
    return result;
  }, [fetchedStocks, allWatchlistSymbols, cachedWatchlist]);

  // Watchlist-Anzeige: NUR settings.watchlist — identisch mit der Watchlist-Seite
  const watchlistStocks = useMemo(() => {
    const watchlistSet = new Set(settings.watchlist);
    return stocks.filter(s => watchlistSet.has(s.symbol));
  }, [stocks, settings.watchlist]);

  // AI Analysis mutation - use selected provider and corresponding API key
  const activeApiKey = settings.aiProvider === 'openai'
    ? settings.apiKeys.openai
    : settings.aiProvider === 'gemini'
    ? settings.apiKeys.gemini
    : settings.apiKeys.claude;

  const aiAnalysis = useAIAnalysis(
    activeApiKey,
    settings.aiProvider,
    settings.claudeModel || 'claude-opus-4-6',
    settings.openaiModel || 'gpt-5.2',
    settings.geminiModel || 'gemini-2.5-flash'
  );

  // Add stocks to watchlist cache when data updates (only if still in settings.watchlist)
  useEffect(() => {
    const watchlistSet = new Set(settings.watchlist);
    fetchedStocks.forEach(stock => {
      if (watchlistSet.has(stock.symbol)) {
        addToWatchlist(stock);
      }
    });
  }, [fetchedStocks, addToWatchlist, settings.watchlist]);

  // Auto-update portfolio position prices with live data from Yahoo
  useEffect(() => {
    if (fetchedStocks.length === 0) return;
    const positions = useAppStore.getState().userPositions;
    const updated: string[] = [];
    const notFound: string[] = [];

    // Build a detailed comparison table for console
    const comparisonData = positions.map(pos => {
      const liveStock = fetchedStocks.find(s => s.symbol === pos.symbol);
      const livePrice = liveStock?.price || 0;
      const storedValue = pos.quantity * pos.currentPrice;
      const liveValue = pos.quantity * (livePrice > 0 ? livePrice : pos.currentPrice);
      const diff = liveValue - storedValue;
      return {
        Symbol: pos.symbol,
        Name: pos.name.substring(0, 25),
        Stk: pos.quantity,
        Währung: pos.currency || '?',
        'Kauf €': pos.buyPrice.toFixed(2),
        'Gespeichert €': pos.currentPrice.toFixed(2),
        'Yahoo €': livePrice > 0 ? livePrice.toFixed(2) : '❌ FEHLT',
        'Wert (gespeichert)': storedValue.toFixed(2),
        'Wert (Yahoo)': livePrice > 0 ? liveValue.toFixed(2) : '-',
        'Differenz €': livePrice > 0 ? diff.toFixed(2) : '?',
        'Auto-Update': pos.useYahooPrice ? '✅' : '❌',
      };
    });

    console.log('%c[Portfolio-Vergleich] Alle Positionen:', 'font-weight:bold;font-size:14px;color:#4f46e5');
    console.table(comparisonData);

    // Summary
    const totalStoredValue = positions.reduce((s, p) => s + p.quantity * p.currentPrice, 0);
    const totalLiveValue = positions.reduce((s, p) => {
      const live = fetchedStocks.find(f => f.symbol === p.symbol);
      return s + p.quantity * (live?.price && live.price > 0 ? live.price : p.currentPrice);
    }, 0);
    const totalInvested = positions.reduce((s, p) => s + p.quantity * p.buyPrice, 0);
    const cash = useAppStore.getState().cashBalance;
    const initCap = useAppStore.getState().initialCapital;
    const prevProf = useAppStore.getState().previousProfit || 0;
    console.log(
      `%c[Portfolio-Zusammenfassung]\n` +
      `  Investiert:        ${totalInvested.toFixed(2)} €\n` +
      `  Gespeichert:       ${totalStoredValue.toFixed(2)} €\n` +
      `  Yahoo Live:        ${totalLiveValue.toFixed(2)} €\n` +
      `  Differenz:         ${(totalLiveValue - totalStoredValue).toFixed(2)} €\n` +
      `  Cash:              ${cash.toFixed(2)} €\n` +
      `  Startkapital:      ${initCap.toFixed(2)} €\n` +
      `  Vorh. Gewinn:      ${prevProf.toFixed(2)} €\n` +
      `  Gesamtvermögen:    ${(totalLiveValue + cash).toFixed(2)} €\n` +
      `  Akt. Gewinn:       ${(totalLiveValue + cash - initCap).toFixed(2)} €\n` +
      `  Gesamtgewinn:      ${(totalLiveValue + cash - initCap + prevProf).toFixed(2)} €`,
      'font-weight:bold;color:#059669'
    );

    // Update store with live prices
    for (const pos of positions) {
      const liveStock = fetchedStocks.find(s => s.symbol === pos.symbol);
      if (liveStock?.price && liveStock.price > 0) {
        if (Math.abs(liveStock.price - pos.currentPrice) > 0.01) {
          updateUserPosition(pos.id, { currentPrice: liveStock.price });
          updated.push(`${pos.symbol}: ${pos.currentPrice.toFixed(2)} → ${liveStock.price.toFixed(2)}`);
        }
      } else {
        notFound.push(pos.symbol);
      }
    }
    if (updated.length > 0) console.log('[Dashboard] Preise aktualisiert:', updated);
    if (notFound.length > 0) console.warn('[Dashboard] ⚠️ Keine Live-Preise gefunden für:', notFound, '— Diese Symbole evtl. anpassen (z.B. SAP → SAP.DE)');
  }, [fetchedStocks, updateUserPosition]);

  // Sync: remove cached watchlist entries that are no longer in settings.watchlist
  useEffect(() => {
    const watchlistSet = new Set(settings.watchlist);
    const removeFromWatchlist = useAppStore.getState().removeFromWatchlist;
    cachedWatchlist.forEach(s => {
      if (!watchlistSet.has(s.symbol)) {
        removeFromWatchlist(s.symbol);
      }
    });
  }, [cachedWatchlist, settings.watchlist]);

  return {
    fetchedStocks,
    stocks,
    watchlistStocks,
    isLoading,
    isRefetching,
    refetch,
    activeApiKey,
    aiAnalysis,
  };
}
