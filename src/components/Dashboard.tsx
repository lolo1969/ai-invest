import { useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Target, 
  AlertTriangle,
  RefreshCw,
  Brain
} from 'lucide-react';
import { useAppStore, checkDuplicateOrder } from '../store/useAppStore';
import { useStocksWithRange, useAIAnalysis } from '../hooks/useMarketData';
import { notificationService } from '../services/notifications';
import type { InvestmentSignal } from '../types';

export function Dashboard() {
  const { settings, signals, addSignal, addToWatchlist, setError, cashBalance, initialCapital, previousProfit, userPositions, orders, addOrder, cancelOrder, watchlist: cachedWatchlist, updateUserPosition } = useAppStore();
  
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
    isRefetching 
  } = useStocksWithRange(allWatchlistSymbols);
  
  // All fetched/cached stocks (includes portfolio positions for price updates)
  const stocks = useMemo(() => {
    const result: import('../types').Stock[] = [];
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

  // Run AI analysis
  const runAnalysis = async () => {
    const providerName = settings.aiProvider === 'openai' ? 'OpenAI' : settings.aiProvider === 'gemini' ? 'Google Gemini' : 'Claude';
    
    if (!activeApiKey) {
      setError(`Bitte füge deinen ${providerName} API-Schlüssel in den Einstellungen hinzu.`);
      return;
    }

    if (stocks.length === 0) {
      setError('Keine Aktien in der Watchlist. Bitte warte bis die Kurse geladen sind oder füge Aktien hinzu.');
      return;
    }

    try {
      // Convert userPositions to Position format for AI analysis
      const currentPositions = userPositions.map(up => {
        const stockData = stocks.find(s => s.symbol === up.symbol);
        // Prefer live price over stored price
        const currentPrice = stockData?.price && stockData.price > 0 ? stockData.price : up.currentPrice;
        const profitLoss = (currentPrice - up.buyPrice) * up.quantity;
        const profitLossPercent = ((currentPrice - up.buyPrice) / up.buyPrice) * 100;
        
        return {
          id: up.id,
          stock: stockData || {
            symbol: up.symbol,
            name: up.name,
            price: currentPrice,
            change: 0,
            changePercent: 0,
            currency: up.currency,
            exchange: '',
          },
          quantity: up.quantity,
          averageBuyPrice: up.buyPrice,
          currentPrice,
          profitLoss,
          profitLossPercent,
          boughtAt: new Date(),
        };
      });

      const portfolioVal = userPositions.reduce((sum, p) => {
        const liveStock = stocks.find(s => s.symbol === p.symbol);
        const currentPrice = liveStock?.price && liveStock.price > 0 ? liveStock.price : p.currentPrice;
        return sum + p.quantity * currentPrice;
      }, 0);
      const totalAssetsVal = cashBalance + portfolioVal;
      const totalInvestedVal = userPositions.reduce((sum, p) => sum + p.quantity * p.buyPrice, 0);
      const profitVal = (initialCapital || 0) > 0 ? totalAssetsVal - (initialCapital || 0) : portfolioVal - totalInvestedVal;
      const prevProfitVal = previousProfit || 0;
      const combinedProfit = profitVal + prevProfitVal;
      const profitPctVal = (initialCapital || 0) > 0 ? (combinedProfit / (initialCapital || 1)) * 100 : 0;
      const { orderSettings: os } = useAppStore.getState();

      // Verfügbares Cash berechnen (abzgl. reserviertes Cash durch aktive Kauf-Orders)
      const activeOrders = useAppStore.getState().orders;
      const reservedCash = activeOrders
        .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy'))
        .reduce((sum, o) => {
          const oCost = o.triggerPrice * o.quantity;
          const oFee = (os.transactionFeeFlat || 0) + oCost * (os.transactionFeePercent || 0) / 100;
          return sum + oCost + oFee;
        }, 0);
      const availableCash = Math.max(0, cashBalance - reservedCash);

      const response = await aiAnalysis.mutateAsync({
        stocks,
        strategy: settings.strategy,
        riskTolerance: settings.riskTolerance,
        budget: availableCash,
        currentPositions,
        previousSignals: signals.slice(0, 10),
        activeOrders: orders.filter(o => o.status === 'active'),
        customPrompt: settings.customPrompt || undefined,
        initialCapital: initialCapital || undefined,
        totalAssets: totalAssetsVal,
        portfolioValue: portfolioVal,
        totalProfit: (initialCapital || 0) > 0 ? combinedProfit : undefined,
        totalProfitPercent: (initialCapital || 0) > 0 ? profitPctVal : undefined,
        transactionFeeFlat: os.transactionFeeFlat || undefined,
        transactionFeePercent: os.transactionFeePercent || undefined,
        previousProfit: prevProfitVal !== 0 ? prevProfitVal : undefined,
      });

      // Process AI-suggested orders: override existing orders for same symbol
      if (response.suggestedOrders && response.suggestedOrders.length > 0) {
        for (const suggested of response.suggestedOrders) {
          // Storniere bestehende aktive KI-Orders für dieses Symbol/Typ (manuelle bleiben)
          const existingOrders = orders.filter(
            o => o.status === 'active' && o.symbol === suggested.symbol && o.orderType === suggested.orderType && o.note?.startsWith('🤖 KI:')
          );
          for (const existing of existingOrders) {
            cancelOrder(existing.id);
          }

          // Duplikat-Check: Erstelle nur wenn keine ähnliche Order existiert
          const newOrder = {
            id: crypto.randomUUID(),
            symbol: suggested.symbol,
            name: (stocks.find(s => s.symbol === suggested.symbol))?.name || suggested.symbol,
            orderType: suggested.orderType,
            quantity: suggested.quantity,
            triggerPrice: suggested.triggerPrice,
            currentPrice: (stocks.find(s => s.symbol === suggested.symbol))?.price || suggested.triggerPrice,
            status: 'active' as const,
            createdAt: new Date(),
            note: `🤖 KI: ${suggested.reasoning}`,
          };

          const dupCheck = checkDuplicateOrder(newOrder);
          if (dupCheck.ok) {
            addOrder(newOrder);
          } else {
            console.log(`[Vestia] KI-Order übersprungen: ${dupCheck.reason}`);
          }
        }
      }

      // Add signals and send notifications
      for (const signal of response.signals) {
        addSignal(signal);
        
        // Send notifications for BUY/SELL signals
        if (signal.signal !== 'HOLD') {
          await notificationService.notify(signal, {
            telegram: settings.notifications.telegram.enabled
              ? {
                  botToken: settings.notifications.telegram.botToken,
                  chatId: settings.notifications.telegram.chatId,
                }
              : undefined,
            email: settings.notifications.email.enabled
              ? { 
                  address: settings.notifications.email.address,
                  serviceId: settings.notifications.email.serviceId,
                  templateId: settings.notifications.email.templateId,
                  publicKey: settings.notifications.email.publicKey,
                }
              : undefined,
          });
        }
      }
    } catch (error: any) {
      setError(error.message || 'Analyse fehlgeschlagen');
    }
  };

  const latestSignals = signals.slice(0, 5);
  const buySignals = signals.filter(s => s.signal === 'BUY').length;
  const sellSignals = signals.filter(s => s.signal === 'SELL').length;

  // Gesamtvermögen & Gewinn berechnen — mit aktuellen Yahoo-Preisen wenn verfügbar
  const portfolioValue = userPositions.reduce((sum, p) => {
    const liveStock = fetchedStocks.find(s => s.symbol === p.symbol);
    const currentPrice = liveStock?.price && liveStock.price > 0 ? liveStock.price : p.currentPrice;
    return sum + p.quantity * currentPrice;
  }, 0);
  const totalInvested = userPositions.reduce((sum, p) => sum + p.quantity * p.buyPrice, 0);
  const totalAssets = cashBalance + portfolioValue;
  const unrealizedProfit = portfolioValue - totalInvested;
  const prevProfit = previousProfit || 0;
  // Gesamtgewinn = Gesamtvermögen − Startkapital + vorhergehende Gewinne
  const currentProfit = (initialCapital || 0) > 0 ? totalAssets - (initialCapital || 0) : unrealizedProfit;
  const totalProfit = currentProfit + prevProfit;
  const totalProfitPercent = (initialCapital || 0) > 0 ? (totalProfit / (initialCapital || 1)) * 100 : 0;
  const hasInitialCapital = (initialCapital || 0) > 0;
  const hasPreviousProfit = prevProfit !== 0;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-12 lg:pt-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-sm md:text-base text-gray-400">Dein KI-Investment-Überblick</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center justify-center gap-2 px-3 md:px-4 py-2.5 md:py-3 bg-[#252542] hover:bg-[#3a3a5a] 
                       disabled:opacity-50 text-white rounded-lg transition-colors"
            title="Kurse aktualisieren"
          >
            <RefreshCw className={isRefetching ? 'animate-spin' : ''} size={18} />
          </button>
          <button
            onClick={runAnalysis}
            disabled={aiAnalysis.isPending || isLoading}
            className="flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-indigo-600 hover:bg-indigo-700 
                       disabled:bg-indigo-600/50 text-white rounded-lg transition-colors flex-1 md:flex-initial"
          >
            {aiAnalysis.isPending ? (
              <>
                <RefreshCw className="animate-spin" size={18} />
                <span className="text-sm md:text-base">Analysiere...</span>
              </>
            ) : (
              <>
                <Brain size={18} />
                <span className="text-sm md:text-base">KI-Analyse starten</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
        <StatCard
          title="Gesamtvermögen"
          value={`${totalAssets.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
          icon={<Wallet size={24} />}
          color="indigo"
        />
        <StatCard
          title="Verfügbares Cash"
          value={`${cashBalance.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
          icon={<Wallet size={24} />}
          color="yellow"
        />
        <StatCard
          title="Portfolio-Wert"
          value={`${portfolioValue.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
          icon={<Target size={24} />}
          color="blue"
        />
        <StatCard
          title={hasInitialCapital ? 'Gesamtgewinn' : 'Unrealisierter Gewinn'}
          value={`${totalProfit >= 0 ? '+' : ''}${totalProfit.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €${hasInitialCapital ? ` (${totalProfitPercent >= 0 ? '+' : ''}${totalProfitPercent.toFixed(1)}%)` : ''}`}
          subtitle={hasPreviousProfit ? `Davon vorh. Portfolios: ${prevProfit >= 0 ? '+' : ''}${prevProfit.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : undefined}
          icon={totalProfit >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
          color={totalProfit >= 0 ? 'green' : 'red'}
        />
        <StatCard
          title="Kaufsignale"
          value={buySignals.toString()}
          icon={<TrendingUp size={24} />}
          color="green"
        />
        <StatCard
          title="Verkaufssignale"
          value={sellSignals.toString()}
          icon={<TrendingDown size={24} />}
          color="red"
        />
      </div>

      {/* Portfolio-Diagnose (aufklappbar) */}
      {(() => {
        const positionsDetail = userPositions.map(p => {
          const liveStock = fetchedStocks.find(s => s.symbol === p.symbol);
          const usedPrice = liveStock?.price && liveStock.price > 0 ? liveStock.price : p.currentPrice;
          const value = p.quantity * usedPrice;
          const priceSource = liveStock?.price && liveStock.price > 0 ? 'Yahoo' : 'Gespeichert';
          return { ...p, usedPrice, value, priceSource, livePrice: liveStock?.price || 0 };
        }).sort((a, b) => b.value - a.value);
        const total = positionsDetail.reduce((s, p) => s + p.value, 0);
        return (
          <details className="bg-[#1a1a2e] rounded-xl border border-[#252542] overflow-hidden">
            <summary className="px-6 py-3 cursor-pointer text-sm text-gray-400 hover:text-white transition-colors flex items-center justify-between">
              <span>🔍 Portfolio-Diagnose ({userPositions.length} Positionen)</span>
              <span className="text-white font-mono">{total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
            </summary>
            <div className="px-6 pb-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-[#252542]">
                    <th className="pb-2">Symbol</th>
                    <th className="pb-2">Name</th>
                    <th className="pb-2 text-right">Stk</th>
                    <th className="pb-2 text-right">Kauf €</th>
                    <th className="pb-2 text-right">Aktuell €</th>
                    <th className="pb-2 text-right">Quelle</th>
                    <th className="pb-2 text-right">Wert €</th>
                    <th className="pb-2 text-right">G/V €</th>
                  </tr>
                </thead>
                <tbody>
                  {positionsDetail.map(p => {
                    const pnl = p.value - p.quantity * p.buyPrice;
                    return (
                      <tr key={p.id} className="border-b border-[#252542]/50 hover:bg-[#252542]/30">
                        <td className="py-1.5 font-mono text-indigo-400">{p.symbol}</td>
                        <td className="py-1.5 text-gray-300 truncate max-w-[150px]">{p.name}</td>
                        <td className="py-1.5 text-right text-gray-300">{p.quantity}</td>
                        <td className="py-1.5 text-right text-gray-400 font-mono">{p.buyPrice.toFixed(2)}</td>
                        <td className="py-1.5 text-right text-white font-mono">{p.usedPrice.toFixed(2)}</td>
                        <td className={`py-1.5 text-right text-xs ${p.priceSource === 'Yahoo' ? 'text-green-400' : 'text-orange-400'}`}>{p.priceSource}</td>
                        <td className="py-1.5 text-right text-white font-mono font-semibold">{p.value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className={`py-1.5 text-right font-mono ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pnl >= 0 ? '+' : ''}{pnl.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#252542] font-semibold">
                    <td colSpan={6} className="pt-2 text-gray-300">Summe Portfolio</td>
                    <td className="pt-2 text-right text-white font-mono">{total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className={`pt-2 text-right font-mono ${(total - totalInvested) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(total - totalInvested) >= 0 ? '+' : ''}{(total - totalInvested).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="pt-1 text-gray-500 text-xs">+ Cash</td>
                    <td className="pt-1 text-right text-gray-400 font-mono text-xs">{cashBalance.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="pt-1 text-indigo-400 font-semibold">= Gesamtvermögen</td>
                    <td className="pt-1 text-right text-indigo-400 font-mono font-semibold">{(total + cashBalance).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>
        );
      })()}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Watchlist */}
        <div className="lg:col-span-2 bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-[#252542]">
          <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-indigo-500" />
            Watchlist
          </h2>
          {isLoading && watchlistStocks.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="animate-spin text-indigo-500" size={32} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 text-sm border-b border-[#252542]">
                    <th className="pb-3">Symbol</th>
                    <th className="pb-3">Name</th>
                    <th className="pb-3 text-right">Preis</th>
                    <th className="pb-3 text-right">Änderung</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlistStocks.map((stock) => (
                    <tr key={stock.symbol} className="border-b border-[#252542] hover:bg-[#252542]/50">
                      <td className="py-3 font-medium text-white">{stock.symbol}</td>
                      <td className="py-3 text-gray-300">{stock.name !== stock.symbol ? stock.name : ''}</td>
                      <td className="py-3 text-right text-white">
                        {stock.price > 0 ? `${stock.price.toFixed(2)} ${stock.currency}` : <span className="text-gray-500">Laden…</span>}
                      </td>
                      <td className={`py-3 text-right font-medium ${
                        (stock.changePercent ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {stock.price > 0 && stock.changePercent != null && !isNaN(stock.changePercent) 
                          ? `${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Signals */}
        <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-[#252542]">
          <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-yellow-500" />
            Letzte Signale
          </h2>
          {latestSignals.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              Noch keine Signale. Starte eine KI-Analyse!
            </p>
          ) : (
            <div className="space-y-3">
              {latestSignals.map((signal) => (
                <SignalCard key={signal.id} signal={signal} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  subtitle,
  icon, 
  color 
}: { 
  title: string; 
  value: string; 
  subtitle?: string;
  icon: React.ReactNode; 
  color: 'indigo' | 'blue' | 'green' | 'red' | 'yellow';
}) {
  const colorClasses = {
    indigo: 'bg-indigo-500/20 text-indigo-500',
    blue: 'bg-blue-500/20 text-blue-500',
    green: 'bg-green-500/20 text-green-500',
    red: 'bg-red-500/20 text-red-500',
    yellow: 'bg-yellow-500/20 text-yellow-500',
  };

  return (
    <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-6 border border-[#252542]">
      <div className="flex items-start md:items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-gray-400 text-xs md:text-sm truncate">{title}</p>
          <p className="text-base md:text-2xl font-bold text-white mt-0.5 md:mt-1 truncate">{value}</p>
          {subtitle && <p className="text-[10px] md:text-xs text-gray-500 mt-0.5 md:mt-1 line-clamp-2">{subtitle}</p>}
        </div>
        <div className={`p-2 md:p-3 rounded-lg flex-shrink-0 ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function SignalCard({ signal }: { signal: InvestmentSignal }) {
  const signalColors = {
    BUY: 'bg-green-500/20 text-green-500 border-green-500/30',
    SELL: 'bg-red-500/20 text-red-500 border-red-500/30',
    HOLD: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  };

  return (
    <div className={`p-4 rounded-lg border ${signalColors[signal.signal]} ${
      signal.signal === 'BUY' ? 'pulse-buy' : signal.signal === 'SELL' ? 'pulse-sell' : ''
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold">{signal.stock.symbol}</span>
        <span className="text-xs font-medium px-2 py-1 rounded bg-black/20">
          {signal.signal}
        </span>
      </div>
      <p className="text-xs opacity-80 line-clamp-2">{signal.reasoning}</p>
      <div className="flex items-center justify-between mt-2 text-xs opacity-60">
        <span>Konfidenz: {signal.confidence}%</span>
        <span>{new Date(signal.createdAt).toLocaleTimeString('de-DE')}</span>
      </div>
    </div>
  );
}
