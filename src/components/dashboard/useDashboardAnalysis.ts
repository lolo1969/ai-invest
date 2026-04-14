import { useAppStore, checkDuplicateOrder } from '../../store/useAppStore';
import { buildLiveNewsContext } from '../shared/liveNewsHelper';
import { notificationService } from '../../services/notifications';
import type { Stock } from '../../types';

interface UseDashboardAnalysisParams {
  stocks: Stock[];
  aiAnalysis: ReturnType<typeof import('../../hooks/useMarketData').useAIAnalysis>;
  activeApiKey: string;
}

export function useDashboardAnalysis({ stocks, aiAnalysis, activeApiKey }: UseDashboardAnalysisParams) {
  const runAnalysis = async () => {
    const { settings, setError, setDashboardAnalyzing, setDashboardAnalysisSummary, addSignal } =
      useAppStore.getState();

    const providerName =
      settings.aiProvider === 'openai'
        ? 'OpenAI'
        : settings.aiProvider === 'gemini'
        ? 'Google Gemini'
        : 'Claude';

    if (!activeApiKey) {
      setError(`Bitte füge deinen ${providerName} API-Schlüssel in den Einstellungen hinzu.`);
      return;
    }

    if (stocks.length === 0) {
      setError('Keine Aktien in der Watchlist. Bitte warte bis die Kurse geladen sind oder füge Aktien hinzu.');
      return;
    }

    setDashboardAnalyzing(true);
    try {
      // Live-News-Kontext fuer tagesaktuelle Makro-/Geopolitik-Signale
      const liveNewsPromptContext = await buildLiveNewsContext(
        settings.apiKeys.marketData || '',
        'Dashboard-Schnellanalyse'
      );

      const { userPositions, cashBalance, initialCapital, previousProfit, signals, orders } =
        useAppStore.getState();

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
      const profitVal =
        (initialCapital || 0) > 0 ? totalAssetsVal - (initialCapital || 0) : portfolioVal - totalInvestedVal;
      const prevProfitVal = previousProfit || 0;
      const combinedProfit = profitVal + prevProfitVal;
      const profitPctVal = (initialCapital || 0) > 0 ? (combinedProfit / (initialCapital || 1)) * 100 : 0;
      const { orderSettings: os } = useAppStore.getState();

      // Verfügbares Cash berechnen (abzgl. reserviertes Cash durch aktive Kauf-Orders)
      const activeOrders = useAppStore.getState().orders;
      const reservedCash = activeOrders
        .filter(
          o =>
            (o.status === 'active' || o.status === 'pending') &&
            (o.orderType === 'limit-buy' || o.orderType === 'stop-buy')
        )
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
        customPrompt: [
          settings.customPrompt?.trim() || '',
          liveNewsPromptContext.trim(),
        ]
          .filter(Boolean)
          .join('\n\n'),
        initialCapital: initialCapital || undefined,
        totalAssets: totalAssetsVal,
        portfolioValue: portfolioVal,
        totalProfit: (initialCapital || 0) > 0 ? combinedProfit : undefined,
        totalProfitPercent: (initialCapital || 0) > 0 ? profitPctVal : undefined,
        transactionFeeFlat: os.transactionFeeFlat || undefined,
        transactionFeePercent: os.transactionFeePercent || undefined,
        previousProfit: prevProfitVal !== 0 ? prevProfitVal : undefined,
      });

      setDashboardAnalysisSummary(response.marketSummary || 'Analyse abgeschlossen.');

      // Process AI-suggested orders: override existing orders for same symbol
      if (response.suggestedOrders && response.suggestedOrders.length > 0) {
        const { addOrder, cancelOrder } = useAppStore.getState();
        for (const suggested of response.suggestedOrders) {
          // Storniere bestehende aktive KI-Orders für dieses Symbol/Typ (manuelle bleiben)
          const existingOrders = orders.filter(
            o =>
              o.status === 'active' &&
              o.symbol === suggested.symbol &&
              o.orderType === suggested.orderType &&
              o.note?.startsWith('🤖 KI:')
          );
          for (const existing of existingOrders) {
            cancelOrder(existing.id);
          }

          // Duplikat-Check: Erstelle nur wenn keine ähnliche Order existiert
          const newOrder = {
            id: crypto.randomUUID(),
            symbol: suggested.symbol,
            name: stocks.find(s => s.symbol === suggested.symbol)?.name || suggested.symbol,
            orderType: suggested.orderType,
            quantity: suggested.quantity,
            triggerPrice: suggested.triggerPrice,
            currentPrice: stocks.find(s => s.symbol === suggested.symbol)?.price || suggested.triggerPrice,
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
      const { setError } = useAppStore.getState();
      setError(error.message || 'Analyse fehlgeschlagen');
    } finally {
      const { setDashboardAnalyzing } = useAppStore.getState();
      setDashboardAnalyzing(false);
    }
  };

  return { runAnalysis };
}
