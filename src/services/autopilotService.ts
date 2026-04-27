import { useAppStore, checkDuplicateOrder } from '../store/useAppStore';
import { marketDataService } from './marketData';
import { getAIService } from './aiService';
import { findCompatibleSymbolMatch, symbolsReferToSameInstrument, sumByEquivalentSymbol } from '../utils/symbolMatching';
import type { 
  AutopilotLogEntry, 
  AISuggestedOrder, 
  Stock, 
  Position,
  Order
} from '../types';

const BOOTSTRAP_UNIVERSE_US = ['SPY', 'VTI', 'QQQ', 'AAPL', 'MSFT', 'JPM', 'XOM', 'JNJ', 'PG', 'KO'];
const BOOTSTRAP_UNIVERSE_EU = ['EXS1.DE', 'EUNL.DE', 'IUSQ.DE', 'SAP.DE', 'SIE.DE', 'ALV.DE', 'ASML.AS', 'AIR.PA', 'MC.PA', 'BNP.PA'];
const BOOTSTRAP_UNIVERSE_MIXED = ['SPY', 'VTI', 'EXS1.DE', 'EUNL.DE', 'SAP.DE', 'ASML.AS', 'JPM', 'JNJ', 'PG', 'XOM'];

/**
 * Autopilot Service: Runs AI analysis and creates/manages orders automatically.
 * 
 * Autopilot cycle flow:
 * 1. Check if market is open (if activeHoursOnly)
 * 2. Load current prices for watchlist + portfolio
 * 3. Run AI analysis
 * 4. Check safety rules for each suggestion
 * 5. Create/update orders based on mode
 * 6. Log all actions
 */

function createLogEntry(
  type: AutopilotLogEntry['type'],
  message: string,
  details?: string,
  symbol?: string,
  orderId?: string
): AutopilotLogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    message,
    details,
    symbol,
    orderId,
  };
}

// Get hour and minute in a specific timezone (DST-safe)
function getTimeInZone(tz: string): { hours: number; minutes: number; day: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const rawHours = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const hours = rawHours === 24 ? 0 : rawHours; // Some browsers return 24 instead of 0
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value ?? '';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[weekdayStr] ?? new Date().getDay();
  return { hours, minutes, day };
}

// Check if any relevant market is currently open
// EU (Xetra): Mo-Fr 9:00-17:30 Europe/Berlin
// US (NYSE):  Mo-Fr 9:30-16:00 America/New_York
function isMarketOpen(): { open: boolean; market?: string } {
  // Check EU market (Xetra Frankfurt)
  const eu = getTimeInZone('Europe/Berlin');
  if (eu.day >= 1 && eu.day <= 5) {
    const euTime = eu.hours * 60 + eu.minutes;
    if (euTime >= 9 * 60 && euTime < 17 * 60 + 30) {
      return { open: true, market: 'EU (Xetra)' };
    }
  }

  // Check US market (NYSE)
  const us = getTimeInZone('America/New_York');
  if (us.day >= 1 && us.day <= 5) {
    const usTime = us.hours * 60 + us.minutes;
    if (usTime >= 9 * 60 + 30 && usTime < 16 * 60) {
      return { open: true, market: 'US (NYSE)' };
    }
  }

  return { open: false };
}

function getBootstrapUniverseSequence(market?: string): string[][] {
  if (market === 'EU (Xetra)') return [BOOTSTRAP_UNIVERSE_EU, BOOTSTRAP_UNIVERSE_MIXED, BOOTSTRAP_UNIVERSE_US];
  if (market === 'US (NYSE)') return [BOOTSTRAP_UNIVERSE_US, BOOTSTRAP_UNIVERSE_MIXED, BOOTSTRAP_UNIVERSE_EU];
  return [BOOTSTRAP_UNIVERSE_MIXED, BOOTSTRAP_UNIVERSE_US, BOOTSTRAP_UNIVERSE_EU];
}

function generateBootstrapBuySuggestions(
  stocks: Stock[],
  availableCash: number,
  minCashReservePercent: number,
  maxTradesPerCycle: number,
  maxPositionPercent: number
): AISuggestedOrder[] {
  if (availableCash <= 0 || stocks.length === 0) return [];

  const reserveAmount = availableCash * (minCashReservePercent / 100);
  const investableCash = Math.max(0, availableCash - reserveAmount);
  if (investableCash <= 0) return [];

  const tradeSlots = Math.max(1, Math.min(maxTradesPerCycle, 3));
  const totalAssets = availableCash;
  const maxPerPositionByRisk = totalAssets * (maxPositionPercent / 100);
  const budgetPerTrade = investableCash / tradeSlots;

  const selected = stocks
    .filter(s => s.price > 0)
    .sort((a, b) => {
      const aIsFallback = a.isFallback ? 1 : 0;
      const bIsFallback = b.isFallback ? 1 : 0;
      if (aIsFallback !== bIsFallback) return aIsFallback - bIsFallback;
      return b.changePercent - a.changePercent;
    })
    .slice(0, tradeSlots);

  const orders: AISuggestedOrder[] = [];
  for (const stock of selected) {
    const usableBudget = Math.max(0, Math.min(budgetPerTrade, maxPerPositionByRisk));
    const quantity = Math.floor(usableBudget / stock.price);
    if (quantity < 1) continue;

    orders.push({
      symbol: stock.symbol,
      orderType: 'limit-buy',
      quantity,
      triggerPrice: Math.round(stock.price * 100) / 100,
      reasoning: 'Bootstrap-Kauf: Automatisch erstellt (leere Watchlist/Portfolio, cash-basiertes Initialinvestment).',
    });
  }

  return orders;
}

function normalizeBootstrapSuggestedOrders(
  suggestedOrders: AISuggestedOrder[],
  stocks: Stock[],
  availableCash: number,
  minCashReservePercent: number,
  maxTradesPerCycle: number,
  maxPositionPercent: number
): AISuggestedOrder[] {
  if (availableCash <= 0) return [];

  const reserveAmount = availableCash * (minCashReservePercent / 100);
  const investableCash = Math.max(0, availableCash - reserveAmount);
  if (investableCash <= 0) return [];

  const tradeSlots = Math.max(1, Math.min(maxTradesPerCycle, 3));
  const maxPerPositionByRisk = availableCash * (maxPositionPercent / 100);
  const budgetPerTrade = investableCash / tradeSlots;

  const buyCandidates = suggestedOrders
    .filter(o => o.orderType === 'limit-buy' || o.orderType === 'stop-buy')
    .map(o => {
      const stock = findCompatibleSymbolMatch(o.symbol, stocks, (item) => item.symbol);
      const trigger = o.triggerPrice > 0 ? o.triggerPrice : (stock?.price || 0);
      return {
        ...o,
        orderType: 'limit-buy' as const,
        triggerPrice: trigger,
      };
    })
    .filter(o => o.triggerPrice > 0)
    .slice(0, tradeSlots);

  const normalized: AISuggestedOrder[] = [];
  for (const candidate of buyCandidates) {
    const usableBudget = Math.max(0, Math.min(budgetPerTrade, maxPerPositionByRisk));
    const maxAffordableQty = Math.floor(usableBudget / candidate.triggerPrice);
    if (maxAffordableQty < 1) continue;

    const quantity = candidate.quantity > 0
      ? Math.max(1, Math.min(candidate.quantity, maxAffordableQty))
      : maxAffordableQty;

    normalized.push({
      symbol: candidate.symbol,
      orderType: 'limit-buy',
      quantity,
      triggerPrice: Math.round(candidate.triggerPrice * 100) / 100,
      reasoning: candidate.reasoning || 'Bootstrap-Kauf: KI-Signal cash-basiert normalisiert.',
    });
  }

  return normalized;
}

function getMaxAffordableQuantity(
  triggerPrice: number,
  maxSpendableCash: number,
  transactionFeeFlat: number,
  transactionFeePercent: number
): number {
  if (triggerPrice <= 0 || maxSpendableCash <= 0) return 0;

  const remainingAfterFlatFee = maxSpendableCash - transactionFeeFlat;
  if (remainingAfterFlatFee <= 0) return 0;

  const priceWithPercentFee = triggerPrice * (1 + transactionFeePercent / 100);
  if (priceWithPercentFee <= 0) return 0;

  return Math.max(0, Math.floor(remainingAfterFlatFee / priceWithPercentFee));
}

export async function runAutopilotCycle(): Promise<void> {
  const store = useAppStore.getState();
  const { 
    autopilotSettings: settings, 
    addAutopilotLog: log, 
    updateAutopilotState,
    settings: appSettings,
    userPositions,
    cashBalance,
    signals,
    orders,
    addOrder,
    cancelOrder,
  } = store;

  // Sicherheitscheck
  if (!settings.enabled) return;

  // For full-auto: Ensure order auto-execution
  if (settings.mode === 'full-auto' && !store.orderSettings.autoExecute) {
    store.updateOrderSettings({ autoExecute: true });
  }

  const cycleId = crypto.randomUUID().slice(0, 8);
  log(createLogEntry('info', `🔄 Autopilot cycle #${cycleId} started`));
  updateAutopilotState({ isRunning: true });

  try {
    // 0. Clean up expired orders
    const now = new Date();
    const expiredOrders = orders.filter(
      o => (o.status === 'active' || o.status === 'pending') && o.expiresAt && new Date(o.expiresAt) < now
    );
    if (expiredOrders.length > 0) {
      for (const expired of expiredOrders) {
        cancelOrder(expired.id);
        log(createLogEntry('info', `⏰ Order expired: ${expired.orderType.toUpperCase()} ${expired.quantity}x ${expired.symbol}`, undefined, expired.symbol, expired.id));
      }
      log(createLogEntry('info', `🧹 ${expiredOrders.length} expired order(s) cancelled`));
    }

    // 0b. Clean up duplicate sell orders (same direction + similar price ±5% or alias symbol)
    const activeOrders = useAppStore.getState().orders.filter(
      o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss')
    );
    // Gruppiere nach kanonischem Symbol (alias-aware: ENR und ENR.DE landen in der gleichen Gruppe)
    const sellGroups: (typeof activeOrders)[] = [];
    for (const o of activeOrders) {
      const existingGroup = sellGroups.find(g => symbolsReferToSameInstrument(g[0].symbol, o.symbol));
      if (existingGroup) {
        existingGroup.push(o);
      } else {
        sellGroups.push([o]);
      }
    }
    let duplicatesCancelled = 0;
    for (const sellOrders of sellGroups) {
      if (sellOrders.length <= 1) continue;
      // Sort by creation date – oldest first (we keep those)
      sellOrders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const kept: typeof activeOrders = [];
      for (const order of sellOrders) {
        // Duplicate if: same group and price ±5% of an already kept order
        const isDuplicate = kept.some(k => {
          const priceDiff = Math.abs(k.triggerPrice - order.triggerPrice) / k.triggerPrice;
          return priceDiff <= 0.05; // ±5%
        });
        if (isDuplicate) {
          cancelOrder(order.id);
          duplicatesCancelled++;
          log(createLogEntry('info',
            `🧹 Duplicate sell order cancelled: ${order.orderType.toUpperCase()} ${order.quantity}x ${order.symbol} @ ${order.triggerPrice.toFixed(2)}€`,
            undefined, order.symbol, order.id
          ));
        } else {
          kept.push(order);
        }
      }
    }
    if (duplicatesCancelled > 0) {
      log(createLogEntry('info', `🧹 ${duplicatesCancelled} duplicate sell order(s) cleaned up`));
    }

    // 1. Check market hours
    const marketStatus = isMarketOpen();
    if (settings.activeHoursOnly && !marketStatus.open) {
      log(createLogEntry('info', '⏰ All markets closed (EU: Xetra 9:00-17:30 CET, US: NYSE 9:30-16:00 ET) – Cycle skipped'));
      updateAutopilotState({ 
        isRunning: false,
        lastRunAt: new Date().toISOString(),
      });
      return;
    }
    if (marketStatus.open && marketStatus.market) {
      log(createLogEntry('info', `📈 Market open: ${marketStatus.market}`));
    }

    // 2. Check API key
    const activeApiKey = appSettings.aiProvider === 'openai' 
      ? appSettings.apiKeys.openai 
      : appSettings.aiProvider === 'gemini'
      ? appSettings.apiKeys.gemini
      : appSettings.apiKeys.claude;

    if (!activeApiKey) {
      log(createLogEntry('error', '❌ Kein API-Key konfiguriert – Autopilot pausiert'));
      updateAutopilotState({ isRunning: false });
      return;
    }

    // 3. Load current prices
    log(createLogEntry('info', '📊 Loading current price data...'));
    const isBootstrapCycle = userPositions.length === 0 && store.watchlist.length === 0;

    // Alle relevanten Symbole sammeln
    const portfolioSymbols = userPositions.map(p => p.symbol);
    const watchlistSymbols = appSettings.watchlist || [];
    let allSymbols = [...new Set([...portfolioSymbols, ...watchlistSymbols])];

    if (allSymbols.length === 0) {
      allSymbols = getBootstrapUniverseSequence(marketStatus.market)[0];
      log(createLogEntry('info', `🌱 Bootstrap mode: Starter universe derived by market (${marketStatus.market || 'mixed'}): ${allSymbols.join(', ')}`));
    }

    const stocks = await marketDataService.getQuotesWithRange(allSymbols);
    log(createLogEntry('info', `✅ ${stocks.length} prices loaded`));

    if (stocks.length === 0) {
      log(createLogEntry('warning', '⚠️ No market data available for current symbol universe'));
      updateAutopilotState({ isRunning: false, lastRunAt: new Date().toISOString() });
      return;
    }

    // Update watchlist
    stocks.forEach(stock => store.addToWatchlist(stock));

    // 4. Run AI analysis
    log(createLogEntry('analysis', `🧠 AI analysis started (${appSettings.aiProvider})...`));
    
    const currentPositions: Position[] = userPositions.map(up => {
      const stockData = stocks.find(s => s.symbol === up.symbol);
      const currentPrice = up.useYahooPrice && stockData ? stockData.price : up.currentPrice;
      const profitLoss = (currentPrice - up.buyPrice) * up.quantity;
      const profitLossPercent = ((currentPrice - up.buyPrice) / up.buyPrice) * 100;
      return {
        id: up.id,
        stock: stockData || {
          symbol: up.symbol, name: up.name, price: currentPrice,
          change: 0, changePercent: 0, currency: up.currency, exchange: '',
        },
        quantity: up.quantity,
        averageBuyPrice: up.buyPrice,
        currentPrice,
        profitLoss,
        profitLossPercent,
        boughtAt: new Date(),
      };
    });

    const aiService = getAIService(
      activeApiKey, 
      appSettings.aiProvider,
      appSettings.claudeModel,
      appSettings.openaiModel,
      appSettings.geminiModel
    );

    const portfolioVal = userPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
    const totalAssetsVal = cashBalance + portfolioVal;
    const totalInvestedVal = userPositions.reduce((sum, p) => sum + p.quantity * p.buyPrice, 0);
    const initCap = store.initialCapital || 0;
    const profitVal = initCap > 0 ? totalAssetsVal - initCap : portfolioVal - totalInvestedVal;
    const prevProfitVal = store.previousProfit || 0;
    const combinedProfit = profitVal + prevProfitVal;
    const profitPctVal = initCap > 0 ? (combinedProfit / (initCap || 1)) * 100 : 0;
    const os = store.orderSettings;

    // Calculate available cash (minus reserved cash from active buy orders incl. fees)
    const reservedCash = orders
      .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy'))
      .reduce((sum, o) => {
        const oCost = o.triggerPrice * o.quantity;
        const oFee = (os.transactionFeeFlat || 0) + oCost * (os.transactionFeePercent || 0) / 100;
        return sum + oCost + oFee;
      }, 0);
    const availableCash = Math.max(0, cashBalance - reservedCash);

    const analysisResponse = await aiService.analyzeMarket({
      stocks,
      strategy: appSettings.strategy,
      riskTolerance: appSettings.riskTolerance,
      budget: availableCash,
      currentPositions,
      previousSignals: signals.slice(0, 10),
      activeOrders: orders.filter(o => o.status === 'active'),
      customPrompt: appSettings.customPrompt || undefined,
      aiLanguage: appSettings.aiLanguage || 'en',
      initialCapital: initCap > 0 ? initCap : undefined,
      totalAssets: totalAssetsVal,
      portfolioValue: portfolioVal,
      totalProfit: initCap > 0 ? combinedProfit : undefined,
      totalProfitPercent: initCap > 0 ? profitPctVal : undefined,
      transactionFeeFlat: os.transactionFeeFlat || undefined,
      transactionFeePercent: os.transactionFeePercent || undefined,
      previousProfit: prevProfitVal !== 0 ? prevProfitVal : undefined,
    });

    log(createLogEntry(
      'analysis', 
      `✅ Analysis completed: ${analysisResponse.signals.length} signals, ${analysisResponse.suggestedOrders.length} order suggestions`,
      analysisResponse.marketSummary
    ));

    // Signal-Details loggen
    for (const signal of analysisResponse.signals) {
      log(createLogEntry(
        'info',
        `📊 Signal: ${signal.stock.symbol} → ${signal.signal} (${signal.confidence}%)`,
        signal.reasoning?.substring(0, 200),
        signal.stock.symbol
      ));
    }

    // Save signals
    for (const signal of analysisResponse.signals) {
      store.addSignal(signal);
    }

    // Save analysis history (full text, not truncated, so portfolio memory works)
    const totalValue = userPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0) + cashBalance;
    store.addAnalysisHistory({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      analysisText: analysisResponse.marketSummary,
      portfolioSnapshot: {
        positions: userPositions.map(p => ({
          symbol: p.symbol, name: p.name, quantity: p.quantity,
          buyPrice: p.buyPrice, currentPrice: p.currentPrice,
        })),
        cashBalance,
        totalValue,
      },
      watchlistSymbols: allSymbols,
      strategy: appSettings.strategy,
      aiProvider: appSettings.aiProvider,
    });
    store.setLastAnalysis(analysisResponse.marketSummary);

    // 5. Process order suggestions
    let suggestedOrders = analysisResponse.suggestedOrders || [];

    if (isBootstrapCycle && settings.allowBuy) {
      const normalizedBootstrapOrders = normalizeBootstrapSuggestedOrders(
        suggestedOrders,
        stocks,
        availableCash,
        settings.minCashReservePercent,
        settings.maxTradesPerCycle,
        settings.maxPositionPercent
      );

      if (normalizedBootstrapOrders.length > 0) {
        suggestedOrders = normalizedBootstrapOrders;
        log(createLogEntry('info', `🌱 Bootstrap normalized ${normalizedBootstrapOrders.length} market-based buy order(s) from AI suggestions`));
      } else {
        const bootstrapOrders = generateBootstrapBuySuggestions(
          stocks,
          availableCash,
          settings.minCashReservePercent,
          settings.maxTradesPerCycle,
          settings.maxPositionPercent
        );
        if (bootstrapOrders.length > 0) {
          suggestedOrders = bootstrapOrders;
          log(createLogEntry('info', `🌱 Bootstrap fallback generated ${bootstrapOrders.length} cash-based buy order(s)`));
        }
      }
    }
    
    // Fix-up: SELL orders with quantity 0 (fallback-generated) get the actual position size
    for (const order of suggestedOrders) {
      if (order.quantity === 0) {
        const isSell = order.orderType === 'limit-sell' || order.orderType === 'stop-loss';
        if (isSell) {
          const position = findCompatibleSymbolMatch(order.symbol, userPositions, (item) => item.symbol);
          if (position) {
            order.quantity = position.quantity;
          }
        }
      }
    }
    
    if (suggestedOrders.length === 0) {
      log(createLogEntry('info', '📝 No order suggestions from AI'));
    } else {
      let approvedOrders = applySafetyRules(suggestedOrders, stocks, log, { bootstrapMode: isBootstrapCycle });
      let stocksForApprovedOrders = stocks;

      if (approvedOrders.length === 0 && isBootstrapCycle && settings.allowBuy) {
        const universeSequence = getBootstrapUniverseSequence(marketStatus.market);
        const initialUniverseKey = [...allSymbols].sort().join('|');
        const retryUniverses = universeSequence
          .map(u => [...u])
          .filter(u => u.sort().join('|') !== initialUniverseKey)
          .slice(0, 2);

        for (const retrySymbols of retryUniverses) {
          log(createLogEntry('info', `🔁 Bootstrap retry: testing alternative candidate universe (${retrySymbols.join(', ')})`));
          const retryStocks = await marketDataService.getQuotesWithRange(retrySymbols);
          if (retryStocks.length === 0) {
            log(createLogEntry('warning', '⚠️ Bootstrap retry skipped: no quotes for candidate universe'));
            continue;
          }

          retryStocks.forEach(stock => store.addToWatchlist(stock));
          const retrySuggestions = generateBootstrapBuySuggestions(
            retryStocks,
            availableCash,
            settings.minCashReservePercent,
            settings.maxTradesPerCycle,
            settings.maxPositionPercent
          );

          if (retrySuggestions.length === 0) continue;
          const retryApproved = applySafetyRules(retrySuggestions, retryStocks, log, { bootstrapMode: true });
          if (retryApproved.length > 0) {
            approvedOrders = retryApproved;
            stocksForApprovedOrders = retryStocks;
            log(createLogEntry('info', `✅ Bootstrap retry successful: ${retryApproved.length} order(s) approved from alternative universe`));
            break;
          }
        }
      }
      
      if (approvedOrders.length === 0) {
        log(createLogEntry('info', '🛡️ All suggestions rejected by safety rules'));
      } else {
        // Je nach Modus handeln
        if (settings.mode === 'suggest-only') {
          // Nur loggen, keine Orders erstellen
          for (const order of approvedOrders) {
            log(createLogEntry(
              'info',
              `💡 Suggestion: ${order.orderType.toUpperCase()} ${order.quantity}x ${order.symbol} @ ${order.triggerPrice.toFixed(2)}€`,
              order.reasoning,
              order.symbol
            ));
          }
          log(createLogEntry('info', `📋 ${approvedOrders.length} suggestions in suggest-only mode (no orders created)`));
        } else {
          // full-auto oder confirm-each: Orders erstellen
          let ordersCreated = 0;
          for (const suggested of approvedOrders) {
            const isSellOrder = suggested.orderType === 'limit-sell' || suggested.orderType === 'stop-loss';

            // Duplicate sell protection: Check if a sell order (any type) already exists
            // for the same symbol at similar price (±5%)
            if (isSellOrder) {
              const existingSells = orders.filter(
                o => (o.status === 'active' || o.status === 'pending') 
                  && symbolsReferToSameInstrument(o.symbol, suggested.symbol)
                  && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss')
              );
              const similarSell = existingSells.find(o => {
                const priceDiff = Math.abs(o.triggerPrice - suggested.triggerPrice) / o.triggerPrice;
                return priceDiff <= 0.05; // innerhalb ±5%
              });
              if (similarSell) {
                log(createLogEntry('skipped',
                  `⏭️ ${suggested.symbol}: Sell order skipped – already ${similarSell.orderType.toUpperCase()} @ ${similarSell.triggerPrice.toFixed(2)}€ exists (±5% of ${suggested.triggerPrice.toFixed(2)}€)`,
                  undefined, suggested.symbol, similarSell.id
                ));
                continue;
              }

              // Check if total sale volume would exceed the position
              const position = findCompatibleSymbolMatch(suggested.symbol, userPositions, (item) => item.symbol);
              const totalExistingSellQty = sumByEquivalentSymbol(suggested.symbol, existingSells, (item) => item.symbol, (item) => item.quantity);
              if (position && (totalExistingSellQty + suggested.quantity) > position.quantity) {
                log(createLogEntry('skipped',
                  `⏭️ ${suggested.symbol}: Sell order skipped – existing sells (${totalExistingSellQty}) + new (${suggested.quantity}) > position (${position.quantity})`,
                  undefined, suggested.symbol
                ));
                continue;
              }
            }

            // Cancel existing identical autopilot orders (only autopilot-generated, no manual ones)
            const existingAutopilotOrders = orders.filter(
              o => (o.status === 'active' || o.status === 'pending') 
                && symbolsReferToSameInstrument(o.symbol, suggested.symbol)
                && o.orderType === suggested.orderType
                && o.note?.startsWith('🤖 Autopilot:')
            );
            for (const existing of existingAutopilotOrders) {
              cancelOrder(existing.id);
              log(createLogEntry('info', `🔄 Existing autopilot order cancelled: ${existing.orderType} ${existing.symbol}`, undefined, existing.symbol, existing.id));
            }

            const stockData = findCompatibleSymbolMatch(suggested.symbol, stocksForApprovedOrders, (item) => item.symbol);
            const orderStatus = settings.mode === 'confirm-each' ? 'pending' : 'active';
            // Autopilot orders expire by default after 7 days
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            const newOrder: Order = {
              id: crypto.randomUUID(),
              symbol: suggested.symbol,
              name: stockData?.name || suggested.symbol,
              orderType: suggested.orderType,
              quantity: suggested.quantity,
              triggerPrice: suggested.triggerPrice,
              currentPrice: stockData?.price || suggested.triggerPrice,
              status: orderStatus,
              createdAt: new Date(),
              expiresAt,
              note: `🤖 Autopilot: ${suggested.reasoning}`,
            };

            // Central duplicate check (again, as last safety net)
            const dupCheck = checkDuplicateOrder(newOrder);
            if (!dupCheck.ok) {
              log(createLogEntry('skipped',
                `⏭️ ${suggested.symbol}: ${dupCheck.reason}`,
                undefined, suggested.symbol
              ));
              continue;
            }

            addOrder(newOrder);
            ordersCreated++;
            
            log(createLogEntry(
              'order-created',
              `📦 Order erstellt: ${suggested.orderType.toUpperCase()} ${suggested.quantity}x ${suggested.symbol} @ ${suggested.triggerPrice.toFixed(2)}€`,
              suggested.reasoning,
              suggested.symbol,
              newOrder.id
            ));
          }

          updateAutopilotState({ 
            totalOrdersCreated: store.autopilotState.totalOrdersCreated + ordersCreated 
          });
        }
      }
    }

    // Log warnings
    if (analysisResponse.warnings && analysisResponse.warnings.length > 0) {
      for (const warning of analysisResponse.warnings) {
        log(createLogEntry('warning', `⚠️ ${warning}`));
      }
    }

    log(createLogEntry('info', `✅ Cycle #${cycleId} completed`));
    
    updateAutopilotState({
      isRunning: false,
      lastRunAt: new Date().toISOString(),
      cycleCount: store.autopilotState.cycleCount + 1,
    });

  } catch (error: any) {
    log(createLogEntry('error', `❌ Error in cycle: ${error.message || 'Unknown error'}`, error.stack));
    updateAutopilotState({ isRunning: false, lastRunAt: new Date().toISOString() });
  }
}

/**
 * Safety-Layer: Checks each order suggestion against configured limits
 */
function applySafetyRules(
  suggestedOrders: AISuggestedOrder[],
  _stocks: Stock[],
  log: (entry: AutopilotLogEntry) => void,
  options?: { bootstrapMode?: boolean }
): AISuggestedOrder[] {
  const store = useAppStore.getState();
  const settings = store.autopilotSettings;
  const { cashBalance, userPositions, orders, orderSettings } = store;
  const totalPortfolioValue = userPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0) + cashBalance;
  
  // Calculate already reserved cash from active/pending buy orders (incl. fees)
  const reservedCashByOrders = orders
    .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy'))
    .reduce((sum, o) => {
      const oCost = o.triggerPrice * o.quantity;
      const oFee = (orderSettings.transactionFeeFlat || 0) + oCost * (orderSettings.transactionFeePercent || 0) / 100;
      return sum + oCost + oFee;
    }, 0);
  let availableCash = cashBalance - reservedCashByOrders;

  // Calculate already reserved shares per symbol from active/pending sell orders
  const reservedSharesBySymbol = new Map<string, number>();
  orders
    .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss'))
    .forEach(o => {
      reservedSharesBySymbol.set(o.symbol, (reservedSharesBySymbol.get(o.symbol) || 0) + o.quantity);
    });

  const approved: AISuggestedOrder[] = [];
  let tradesThisCycle = 0;
  const minCashReserveValue = Math.max(0, totalPortfolioValue * (settings.minCashReservePercent / 100));

  for (const order of suggestedOrders) {
    let candidateOrder = { ...order };

    // Max trades per cycle
    if (tradesThisCycle >= settings.maxTradesPerCycle) {
      log(createLogEntry('skipped', `⏭️ ${candidateOrder.symbol}: Max. trades per cycle reached (${settings.maxTradesPerCycle})`, undefined, candidateOrder.symbol));
      continue;
    }

    // Buy/Sell erlaubt?
    const isBuy = candidateOrder.orderType === 'limit-buy' || candidateOrder.orderType === 'stop-buy';
    const isSell = candidateOrder.orderType === 'limit-sell' || candidateOrder.orderType === 'stop-loss';
    
    if (isBuy && !settings.allowBuy) {
      log(createLogEntry('skipped', `⏭️ ${candidateOrder.symbol}: Purchases disabled`, undefined, candidateOrder.symbol));
      continue;
    }
    if (isSell && !settings.allowSell) {
      log(createLogEntry('skipped', `⏭️ ${candidateOrder.symbol}: Sales disabled`, undefined, candidateOrder.symbol));
      continue;
    }

    // Neue Positionen erlaubt?
    if (isBuy && !settings.allowNewPositions && !options?.bootstrapMode) {
      const existingPosition = findCompatibleSymbolMatch(candidateOrder.symbol, userPositions, (item) => item.symbol);
      if (!existingPosition) {
        log(createLogEntry('skipped', `⏭️ ${candidateOrder.symbol}: Neue Positionen nicht erlaubt`, undefined, candidateOrder.symbol));
        continue;
      }
    }

    // Nur Watchlist?
    if (settings.watchlistOnly) {
      const inWatchlist = store.watchlist.some(s => symbolsReferToSameInstrument(s.symbol, candidateOrder.symbol));
      const inPortfolio = userPositions.some(p => symbolsReferToSameInstrument(p.symbol, candidateOrder.symbol));
      if (!inWatchlist && !inPortfolio) {
        log(createLogEntry('skipped', `⏭️ ${candidateOrder.symbol}: Nicht in Watchlist/Portfolio`, undefined, candidateOrder.symbol));
        continue;
      }
    }

    if (isBuy) {
      const existingValue = userPositions
        .filter(p => symbolsReferToSameInstrument(p.symbol, candidateOrder.symbol))
        .reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);

      const maxPositionValue = totalPortfolioValue > 0
        ? totalPortfolioValue * (settings.maxPositionPercent / 100)
        : Number.POSITIVE_INFINITY;
      const maxAdditionalPositionValue = Math.max(0, maxPositionValue - existingValue);
      const maxQtyByPosition = totalPortfolioValue > 0 && Number.isFinite(maxPositionValue)
        ? Math.floor(maxAdditionalPositionValue / Math.max(candidateOrder.triggerPrice, 0.0001))
        : candidateOrder.quantity;

      const maxSpendableCash = Math.max(0, availableCash - minCashReserveValue);
      const maxQtyByCash = getMaxAffordableQuantity(
        candidateOrder.triggerPrice,
        maxSpendableCash,
        orderSettings.transactionFeeFlat || 0,
        orderSettings.transactionFeePercent || 0
      );

      const allowedQuantity = Math.min(candidateOrder.quantity, maxQtyByPosition, maxQtyByCash);
      if (allowedQuantity < 1) {
        const skipReason = maxQtyByCash < 1
          ? `⏭️ ${candidateOrder.symbol}: Min cash reserve leaves no room for a buy order`
          : `⏭️ ${candidateOrder.symbol}: Position is already at max ${settings.maxPositionPercent}%`;
        log(createLogEntry('skipped', skipReason, undefined, candidateOrder.symbol));
        continue;
      }

      if (allowedQuantity < candidateOrder.quantity) {
        log(createLogEntry(
          'info',
          `↘️ ${candidateOrder.symbol}: Buy quantity reduced from ${candidateOrder.quantity} to ${allowedQuantity} to respect cash reserve/position limit`,
          undefined,
          candidateOrder.symbol
        ));
        candidateOrder.quantity = allowedQuantity;
      }
    }

    // Min cash reserve for purchases (incl. fees and already reserved cash)
    if (isBuy) {
      const orderCost = candidateOrder.triggerPrice * candidateOrder.quantity;
      const orderFee = (orderSettings.transactionFeeFlat || 0) + orderCost * (orderSettings.transactionFeePercent || 0) / 100;
      const totalOrderCost = orderCost + orderFee;
      const cashAfter = availableCash - totalOrderCost;
      const cashPercentAfter = totalPortfolioValue > 0 ? (cashAfter / totalPortfolioValue) * 100 : 0;
      
      if (cashPercentAfter < settings.minCashReservePercent) {
        log(createLogEntry('skipped',
          `⏭️ ${candidateOrder.symbol}: Cash reserve after purchase would be ${cashPercentAfter.toFixed(1)}% < Min ${settings.minCashReservePercent}%`,
          undefined, candidateOrder.symbol
        ));
        continue;
      }

      // Enough available cash? (incl. fees, minus reserved cash)
      if (totalOrderCost > availableCash) {
        log(createLogEntry('skipped',
          `⏭️ ${candidateOrder.symbol}: Not enough available cash (${totalOrderCost.toFixed(2)}€ incl. fees > ${availableCash.toFixed(2)}€ available)`,
          undefined, candidateOrder.symbol
        ));
        continue;
      }

      // Reserve cash for this approved buy (for subsequent orders in this cycle)
      availableCash -= totalOrderCost;
    }

    // Enough shares for sale? (minus already reserved by other sell orders)
    if (isSell) {
      const position = findCompatibleSymbolMatch(candidateOrder.symbol, userPositions, (item) => item.symbol);
      const reserved = Array.from(reservedSharesBySymbol.entries())
        .filter(([symbol]) => symbolsReferToSameInstrument(symbol, candidateOrder.symbol))
        .reduce((sum, [, qty]) => sum + qty, 0);
      const availableShares = (position?.quantity ?? 0) - reserved;
      if (!position || availableShares < candidateOrder.quantity) {
        log(createLogEntry('skipped',
          `⏭️ ${candidateOrder.symbol}: Not enough available shares (${availableShares} free, ${reserved > 0 ? `${reserved} reserved, ` : ''}required ${candidateOrder.quantity})`,
          undefined, candidateOrder.symbol
        ));
        continue;
      }

      // Reserve shares for this approved sale
      reservedSharesBySymbol.set(position?.symbol || candidateOrder.symbol, reserved + candidateOrder.quantity);
    }

    // Alles OK
    approved.push(candidateOrder);
    tradesThisCycle++;
  }

  return approved;
}
