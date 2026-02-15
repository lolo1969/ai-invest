import { useAppStore } from '../store/useAppStore';
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

// Prüfe ob US-Markt gerade offen ist (Mo-Fr, 9:30-16:00 EST)
function isMarketOpen(): boolean {
  const now = new Date();
  const estOffset = -5; // EST = UTC-5
  const utcHours = now.getUTCHours();
  const estHours = (utcHours + estOffset + 24) % 24;
  const estMinutes = now.getUTCMinutes();
  const day = now.getUTCDay(); // 0=So, 6=Sa
  
  // Wochenende
  if (day === 0 || day === 6) return false;
  
  // Vor 9:30 EST
  if (estHours < 9 || (estHours === 9 && estMinutes < 30)) return false;
  
  // Nach 16:00 EST
  if (estHours >= 16) return false;
  
  return true;
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

  const cycleId = crypto.randomUUID().slice(0, 8);
  log(createLogEntry('info', `🔄 Autopilot-Zyklus #${cycleId} gestartet`));
  updateAutopilotState({ isRunning: true });

  try {
    // 1. Marktzeiten prüfen
    if (settings.activeHoursOnly && !isMarketOpen()) {
      log(createLogEntry('info', '⏰ Markt geschlossen – Zyklus übersprungen'));
      updateAutopilotState({ 
        isRunning: false,
        lastRunAt: new Date().toISOString(),
      });
      return;
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

    const analysisResponse = await aiService.analyzeMarket({
      stocks,
      strategy: appSettings.strategy,
      riskTolerance: appSettings.riskTolerance,
      budget: cashBalance,
      currentPositions,
      previousSignals: signals.slice(0, 10),
      activeOrders: orders.filter(o => o.status === 'active'),
      customPrompt: appSettings.customPrompt || undefined,
    });

    log(createLogEntry(
      'analysis', 
      `✅ Analyse abgeschlossen: ${analysisResponse.signals.length} Signale, ${analysisResponse.suggestedOrders.length} Order-Vorschläge`,
      analysisResponse.marketSummary
    ));

    // Signale speichern
    for (const signal of analysisResponse.signals) {
      store.addSignal(signal);
    }

    // Analyse-History speichern
    const totalValue = userPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0) + cashBalance;
    store.addAnalysisHistory({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      analysisText: analysisResponse.marketSummary.slice(0, 500),
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
            // Bestehende gleiche Orders stornieren
            const existingOrders = orders.filter(
              o => o.status === 'active' && o.symbol === suggested.symbol && o.orderType === suggested.orderType
            );
            for (const existing of existingOrders) {
              cancelOrder(existing.id);
              log(createLogEntry('info', `🔄 Bestehende Order storniert: ${existing.orderType} ${existing.symbol}`, undefined, existing.symbol, existing.id));
            }

            const stockData = stocks.find(s => s.symbol === suggested.symbol);
            const newOrder: Order = {
              id: crypto.randomUUID(),
              symbol: suggested.symbol,
              name: stockData?.name || suggested.symbol,
              orderType: suggested.orderType,
              quantity: suggested.quantity,
              triggerPrice: suggested.triggerPrice,
              currentPrice: stockData?.price || suggested.triggerPrice,
              status: 'active',
              createdAt: new Date(),
              note: `🤖 Autopilot: ${suggested.reasoning}`,
            };

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
  const { cashBalance, userPositions } = store;
  const totalPortfolioValue = userPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0) + cashBalance;
  
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

    // Min Cash-Reserve bei Käufen
    if (isBuy) {
      const orderCost = order.triggerPrice * order.quantity;
      const cashAfter = cashBalance - orderCost;
      const cashPercentAfter = totalPortfolioValue > 0 ? (cashAfter / totalPortfolioValue) * 100 : 0;
      
      if (cashPercentAfter < settings.minCashReservePercent) {
        log(createLogEntry('skipped',
          `⏭️ ${order.symbol}: Cash-Reserve nach Kauf wäre ${cashPercentAfter.toFixed(1)}% < Min ${settings.minCashReservePercent}%`,
          undefined, order.symbol
        ));
        continue;
      }

      // Genug Cash?
      if (orderCost > cashBalance) {
        log(createLogEntry('skipped',
          `⏭️ ${order.symbol}: Nicht genug Cash (${orderCost.toFixed(2)}€ > ${cashBalance.toFixed(2)}€)`,
          undefined, order.symbol
        ));
        continue;
      }
    }

    // Genug Stücke für Verkauf?
    if (isSell) {
      const position = userPositions.find(p => p.symbol === order.symbol);
      if (!position || position.quantity < order.quantity) {
        log(createLogEntry('skipped',
          `⏭️ ${order.symbol}: Nicht genug Aktien (${position?.quantity ?? 0} < ${order.quantity})`,
          undefined, order.symbol
        ));
        continue;
      }
    }

    // Alles OK
    approved.push(order);
    tradesThisCycle++;
  }

  return approved;
}
