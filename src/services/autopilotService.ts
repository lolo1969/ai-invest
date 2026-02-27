import { useAppStore, checkDuplicateOrder } from '../store/useAppStore';
import { marketDataService } from './marketData';
import { getAIService } from './aiService';
import type { 
  AutopilotLogEntry, 
  AISuggestedOrder, 
  Stock, 
  Position,
  Order
} from '../types';

/**
 * Autopilot-Service: Führt KI-Analysen durch und erstellt/verwaltet Orders automatisch.
 * 
 * Ablauf eines Zyklus:
 * 1. Prüfe ob Markt offen (wenn activeHoursOnly)
 * 2. Lade aktuelle Kurse für Watchlist + Portfolio
 * 3. Führe KI-Analyse durch
 * 4. Prüfe Safety-Regeln für jeden Vorschlag
 * 5. Erstelle/aktualisiere Orders je nach Modus
 * 6. Logge alle Aktionen
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

// Hole Stunde und Minute in einer bestimmten Zeitzone (DST-sicher)
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
  const hours = rawHours === 24 ? 0 : rawHours; // Manche Browser geben 24 statt 0 zurück
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value ?? '';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[weekdayStr] ?? new Date().getDay();
  return { hours, minutes, day };
}

// Prüfe ob irgendein relevanter Markt gerade offen ist
// EU (Xetra): Mo-Fr 9:00-17:30 Europe/Berlin
// US (NYSE):  Mo-Fr 9:30-16:00 America/New_York
function isMarketOpen(): { open: boolean; market?: string } {
  // EU-Markt prüfen (Xetra Frankfurt)
  const eu = getTimeInZone('Europe/Berlin');
  if (eu.day >= 1 && eu.day <= 5) {
    const euTime = eu.hours * 60 + eu.minutes;
    if (euTime >= 9 * 60 && euTime < 17 * 60 + 30) {
      return { open: true, market: 'EU (Xetra)' };
    }
  }

  // US-Markt prüfen (NYSE)
  const us = getTimeInZone('America/New_York');
  if (us.day >= 1 && us.day <= 5) {
    const usTime = us.hours * 60 + us.minutes;
    if (usTime >= 9 * 60 + 30 && usTime < 16 * 60) {
      return { open: true, market: 'US (NYSE)' };
    }
  }

  return { open: false };
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

  // Bei Vollautomatisch: Order-Auto-Ausführung sicherstellen
  if (settings.mode === 'full-auto' && !store.orderSettings.autoExecute) {
    store.updateOrderSettings({ autoExecute: true });
  }

  const cycleId = crypto.randomUUID().slice(0, 8);
  log(createLogEntry('info', `🔄 Autopilot-Zyklus #${cycleId} gestartet`));
  updateAutopilotState({ isRunning: true });

  try {
    // 0. Abgelaufene Orders bereinigen
    const now = new Date();
    const expiredOrders = orders.filter(
      o => (o.status === 'active' || o.status === 'pending') && o.expiresAt && new Date(o.expiresAt) < now
    );
    if (expiredOrders.length > 0) {
      for (const expired of expiredOrders) {
        cancelOrder(expired.id);
        log(createLogEntry('info', `⏰ Order abgelaufen: ${expired.orderType.toUpperCase()} ${expired.quantity}x ${expired.symbol}`, undefined, expired.symbol, expired.id));
      }
      log(createLogEntry('info', `🧹 ${expiredOrders.length} abgelaufene Order(s) storniert`));
    }

    // 0b. Doppelte Sell-Orders bereinigen (gleiche Richtung + ähnlicher Preis ±5%)
    const activeOrders = useAppStore.getState().orders.filter(
      o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss')
    );
    // Gruppiere nach Symbol
    const sellsBySymbol = new Map<string, typeof activeOrders>();
    for (const o of activeOrders) {
      const list = sellsBySymbol.get(o.symbol) || [];
      list.push(o);
      sellsBySymbol.set(o.symbol, list);
    }
    let duplicatesCancelled = 0;
    for (const [symbol, sellOrders] of sellsBySymbol) {
      if (sellOrders.length <= 1) continue;
      // Sortiere nach Erstellungsdatum – älteste zuerst (die behalten wir)
      sellOrders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const kept: typeof activeOrders = [];
      for (const order of sellOrders) {
        // Prüfe ob bereits eine behaltene Order bei ähnlichem Preis existiert
        const isDuplicate = kept.some(k => {
          const priceDiff = Math.abs(k.triggerPrice - order.triggerPrice) / k.triggerPrice;
          return priceDiff <= 0.05; // ±5%
        });
        if (isDuplicate) {
          cancelOrder(order.id);
          duplicatesCancelled++;
          log(createLogEntry('info',
            `🧹 Doppelte Sell-Order storniert: ${order.orderType.toUpperCase()} ${order.quantity}x ${symbol} @ ${order.triggerPrice.toFixed(2)}€`,
            undefined, symbol, order.id
          ));
        } else {
          kept.push(order);
        }
      }
    }
    if (duplicatesCancelled > 0) {
      log(createLogEntry('info', `🧹 ${duplicatesCancelled} doppelte Sell-Order(s) bereinigt`));
    }

    // 1. Marktzeiten prüfen
    const marketStatus = isMarketOpen();
    if (settings.activeHoursOnly && !marketStatus.open) {
      log(createLogEntry('info', '⏰ Alle Märkte geschlossen (EU: Xetra 9:00-17:30 MEZ, US: NYSE 9:30-16:00 ET) – Zyklus übersprungen'));
      updateAutopilotState({ 
        isRunning: false,
        lastRunAt: new Date().toISOString(),
      });
      return;
    }
    if (marketStatus.open && marketStatus.market) {
      log(createLogEntry('info', `📈 Markt offen: ${marketStatus.market}`));
    }

    // 2. API-Key prüfen
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

    // 3. Aktuelle Kurse laden
    log(createLogEntry('info', '📊 Lade aktuelle Kursdaten...'));
    
    // Alle relevanten Symbole sammeln
    const portfolioSymbols = userPositions.map(p => p.symbol);
    const watchlistSymbols = appSettings.watchlist;
    const allSymbols = [...new Set([...portfolioSymbols, ...watchlistSymbols])];
    
    if (allSymbols.length === 0) {
      log(createLogEntry('warning', '⚠️ Keine Aktien in Watchlist oder Portfolio'));
      updateAutopilotState({ isRunning: false, lastRunAt: new Date().toISOString() });
      return;
    }

    const stocks = await marketDataService.getQuotesWithRange(allSymbols);
    log(createLogEntry('info', `✅ ${stocks.length} Kurse geladen`));

    // Watchlist aktualisieren
    stocks.forEach(stock => store.addToWatchlist(stock));

    // 4. KI-Analyse durchführen
    log(createLogEntry('analysis', `🧠 KI-Analyse gestartet (${appSettings.aiProvider})...`));
    
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

    // Verfügbares Cash berechnen (abzgl. reserviertes Cash durch aktive Kauf-Orders inkl. Gebühren)
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
      `✅ Analyse abgeschlossen: ${analysisResponse.signals.length} Signale, ${analysisResponse.suggestedOrders.length} Order-Vorschläge`,
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

    // Signale speichern
    for (const signal of analysisResponse.signals) {
      store.addSignal(signal);
    }

    // Analyse-History speichern (voller Text, nicht gekürzt, damit Portfolio-Gedächtnis funktioniert)
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

    // 5. Order-Vorschläge verarbeiten
    const suggestedOrders = analysisResponse.suggestedOrders || [];
    
    // Fix-up: SELL-Orders mit quantity 0 (Fallback-generiert) bekommen die echte Positionsgröße
    for (const order of suggestedOrders) {
      if (order.quantity === 0) {
        const isSell = order.orderType === 'limit-sell' || order.orderType === 'stop-loss';
        if (isSell) {
          const position = userPositions.find(p => p.symbol === order.symbol);
          if (position) {
            order.quantity = position.quantity;
          }
        }
      }
    }
    
    if (suggestedOrders.length === 0) {
      log(createLogEntry('info', '📝 Keine Order-Vorschläge von der KI'));
    } else {
      const approvedOrders = applySafetyRules(suggestedOrders, stocks, log);
      
      if (approvedOrders.length === 0) {
        log(createLogEntry('info', '🛡️ Alle Vorschläge von Safety-Regeln abgelehnt'));
      } else {
        // Je nach Modus handeln
        if (settings.mode === 'suggest-only') {
          // Nur loggen, keine Orders erstellen
          for (const order of approvedOrders) {
            log(createLogEntry(
              'info',
              `💡 Vorschlag: ${order.orderType.toUpperCase()} ${order.quantity}x ${order.symbol} @ ${order.triggerPrice.toFixed(2)}€`,
              order.reasoning,
              order.symbol
            ));
          }
          log(createLogEntry('info', `📋 ${approvedOrders.length} Vorschläge im suggest-only Modus (keine Orders erstellt)`));
        } else {
          // full-auto oder confirm-each: Orders erstellen
          let ordersCreated = 0;
          for (const suggested of approvedOrders) {
            const isSellOrder = suggested.orderType === 'limit-sell' || suggested.orderType === 'stop-loss';

            // Duplikat-Sell-Schutz: Prüfe ob bereits eine Sell-Order (egal welcher Typ)
            // für dasselbe Symbol bei ähnlichem Preis (±5%) existiert
            if (isSellOrder) {
              const existingSells = orders.filter(
                o => (o.status === 'active' || o.status === 'pending') 
                  && o.symbol === suggested.symbol 
                  && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss')
              );
              const similarSell = existingSells.find(o => {
                const priceDiff = Math.abs(o.triggerPrice - suggested.triggerPrice) / o.triggerPrice;
                return priceDiff <= 0.05; // innerhalb ±5%
              });
              if (similarSell) {
                log(createLogEntry('skipped',
                  `⏭️ ${suggested.symbol}: Sell-Order übersprungen – bereits ${similarSell.orderType.toUpperCase()} @ ${similarSell.triggerPrice.toFixed(2)}€ vorhanden (±5% von ${suggested.triggerPrice.toFixed(2)}€)`,
                  undefined, suggested.symbol, similarSell.id
                ));
                continue;
              }

              // Prüfe ob Gesamtverkaufsvolumen die Position übersteigen würde
              const position = userPositions.find(p => p.symbol === suggested.symbol);
              const totalExistingSellQty = existingSells.reduce((sum, o) => sum + o.quantity, 0);
              if (position && (totalExistingSellQty + suggested.quantity) > position.quantity) {
                log(createLogEntry('skipped',
                  `⏭️ ${suggested.symbol}: Sell-Order übersprungen – bestehende Sells (${totalExistingSellQty}) + neue (${suggested.quantity}) > Position (${position.quantity})`,
                  undefined, suggested.symbol
                ));
                continue;
              }
            }

            // Bestehende gleiche Autopilot-Orders stornieren (nur Autopilot-generierte, keine manuellen)
            const existingAutopilotOrders = orders.filter(
              o => (o.status === 'active' || o.status === 'pending') 
                && o.symbol === suggested.symbol 
                && o.orderType === suggested.orderType
                && o.note?.startsWith('🤖 Autopilot:')
            );
            for (const existing of existingAutopilotOrders) {
              cancelOrder(existing.id);
              log(createLogEntry('info', `🔄 Bestehende Autopilot-Order storniert: ${existing.orderType} ${existing.symbol}`, undefined, existing.symbol, existing.id));
            }

            const stockData = stocks.find(s => s.symbol === suggested.symbol);
            const orderStatus = settings.mode === 'confirm-each' ? 'pending' : 'active';
            // Autopilot-Orders laufen standardmäßig nach 7 Tagen ab
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

            // Zentrale Duplikat-Prüfung (nochmal, als letzte Sicherung)
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

    // Warnungen loggen
    if (analysisResponse.warnings && analysisResponse.warnings.length > 0) {
      for (const warning of analysisResponse.warnings) {
        log(createLogEntry('warning', `⚠️ ${warning}`));
      }
    }

    log(createLogEntry('info', `✅ Zyklus #${cycleId} abgeschlossen`));
    
    updateAutopilotState({
      isRunning: false,
      lastRunAt: new Date().toISOString(),
      cycleCount: store.autopilotState.cycleCount + 1,
    });

  } catch (error: any) {
    log(createLogEntry('error', `❌ Fehler im Zyklus: ${error.message || 'Unbekannter Fehler'}`, error.stack));
    updateAutopilotState({ isRunning: false, lastRunAt: new Date().toISOString() });
  }
}

/**
 * Safety-Layer: Prüft jeden Order-Vorschlag gegen die konfigurierten Limits
 */
function applySafetyRules(
  suggestedOrders: AISuggestedOrder[],
  _stocks: Stock[],
  log: (entry: AutopilotLogEntry) => void
): AISuggestedOrder[] {
  const store = useAppStore.getState();
  const settings = store.autopilotSettings;
  const { cashBalance, userPositions, orders, orderSettings } = store;
  const totalPortfolioValue = userPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0) + cashBalance;
  
  // Berechne bereits reserviertes Cash durch aktive/pendende Kauf-Orders (inkl. Gebühren)
  const reservedCashByOrders = orders
    .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy'))
    .reduce((sum, o) => {
      const oCost = o.triggerPrice * o.quantity;
      const oFee = (orderSettings.transactionFeeFlat || 0) + oCost * (orderSettings.transactionFeePercent || 0) / 100;
      return sum + oCost + oFee;
    }, 0);
  let availableCash = cashBalance - reservedCashByOrders;

  // Berechne bereits reservierte Stücke pro Symbol durch aktive/pendende Verkaufs-Orders
  const reservedSharesBySymbol = new Map<string, number>();
  orders
    .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss'))
    .forEach(o => {
      reservedSharesBySymbol.set(o.symbol, (reservedSharesBySymbol.get(o.symbol) || 0) + o.quantity);
    });

  const approved: AISuggestedOrder[] = [];
  let tradesThisCycle = 0;

  for (const order of suggestedOrders) {
    // Max Trades pro Zyklus
    if (tradesThisCycle >= settings.maxTradesPerCycle) {
      log(createLogEntry('skipped', `⏭️ ${order.symbol}: Max. Trades pro Zyklus erreicht (${settings.maxTradesPerCycle})`, undefined, order.symbol));
      continue;
    }

    // Buy/Sell erlaubt?
    const isBuy = order.orderType === 'limit-buy' || order.orderType === 'stop-buy';
    const isSell = order.orderType === 'limit-sell' || order.orderType === 'stop-loss';
    
    if (isBuy && !settings.allowBuy) {
      log(createLogEntry('skipped', `⏭️ ${order.symbol}: Käufe deaktiviert`, undefined, order.symbol));
      continue;
    }
    if (isSell && !settings.allowSell) {
      log(createLogEntry('skipped', `⏭️ ${order.symbol}: Verkäufe deaktiviert`, undefined, order.symbol));
      continue;
    }

    // Neue Positionen erlaubt?
    if (isBuy && !settings.allowNewPositions) {
      const existingPosition = userPositions.find(p => p.symbol === order.symbol);
      if (!existingPosition) {
        log(createLogEntry('skipped', `⏭️ ${order.symbol}: Neue Positionen nicht erlaubt`, undefined, order.symbol));
        continue;
      }
    }

    // Nur Watchlist?
    if (settings.watchlistOnly) {
      const inWatchlist = store.watchlist.some(s => s.symbol === order.symbol);
      const inPortfolio = userPositions.some(p => p.symbol === order.symbol);
      if (!inWatchlist && !inPortfolio) {
        log(createLogEntry('skipped', `⏭️ ${order.symbol}: Nicht in Watchlist/Portfolio`, undefined, order.symbol));
        continue;
      }
    }

    // Max Positionsgröße
    if (isBuy && totalPortfolioValue > 0) {
      const orderValue = order.triggerPrice * order.quantity;
      const existingValue = userPositions
        .filter(p => p.symbol === order.symbol)
        .reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
      const totalPositionValue = existingValue + orderValue;
      const positionPercent = (totalPositionValue / totalPortfolioValue) * 100;
      
      if (positionPercent > settings.maxPositionPercent) {
        log(createLogEntry('skipped', 
          `⏭️ ${order.symbol}: Position wäre ${positionPercent.toFixed(1)}% > Max ${settings.maxPositionPercent}%`,
          undefined, order.symbol
        ));
        continue;
      }
    }

    // Min Cash-Reserve bei Käufen (mit Gebühren und bereits reserviertem Cash)
    if (isBuy) {
      const orderCost = order.triggerPrice * order.quantity;
      const orderFee = (orderSettings.transactionFeeFlat || 0) + orderCost * (orderSettings.transactionFeePercent || 0) / 100;
      const totalOrderCost = orderCost + orderFee;
      const cashAfter = availableCash - totalOrderCost;
      const cashPercentAfter = totalPortfolioValue > 0 ? (cashAfter / totalPortfolioValue) * 100 : 0;
      
      if (cashPercentAfter < settings.minCashReservePercent) {
        log(createLogEntry('skipped',
          `⏭️ ${order.symbol}: Cash-Reserve nach Kauf wäre ${cashPercentAfter.toFixed(1)}% < Min ${settings.minCashReservePercent}%`,
          undefined, order.symbol
        ));
        continue;
      }

      // Genug verfügbares Cash? (inkl. Gebühren, abzgl. reserviertes Cash)
      if (totalOrderCost > availableCash) {
        log(createLogEntry('skipped',
          `⏭️ ${order.symbol}: Nicht genug verfügbares Cash (${totalOrderCost.toFixed(2)}€ inkl. Gebühren > ${availableCash.toFixed(2)}€ verfügbar)`,
          undefined, order.symbol
        ));
        continue;
      }

      // Cash für diesen genehmigten Kauf reservieren (für nachfolgende Orders in diesem Zyklus)
      availableCash -= totalOrderCost;
    }

    // Genug Stücke für Verkauf? (abzgl. bereits reservierte durch andere Sell-Orders)
    if (isSell) {
      const position = userPositions.find(p => p.symbol === order.symbol);
      const reserved = reservedSharesBySymbol.get(order.symbol) || 0;
      const availableShares = (position?.quantity ?? 0) - reserved;
      if (!position || availableShares < order.quantity) {
        log(createLogEntry('skipped',
          `⏭️ ${order.symbol}: Nicht genug verfügbare Aktien (${availableShares} frei, ${reserved > 0 ? `${reserved} reserviert, ` : ''}benötigt ${order.quantity})`,
          undefined, order.symbol
        ));
        continue;
      }

      // Stücke für diesen genehmigten Verkauf reservieren
      reservedSharesBySymbol.set(order.symbol, reserved + order.quantity);
    }

    // Alles OK
    approved.push(order);
    tradesThisCycle++;
  }

  return approved;
}
