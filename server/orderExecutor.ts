/**
 * Server-seitiger Order-Executor
 * Prüft aktive Orders gegen aktuelle Marktpreise und führt sie aus.
 * Repliziert die Logik aus useOrderExecution.ts.
 */

import * as state from './stateManager.js';
import * as market from './marketData.js';

/**
 * Prüft alle aktiven Orders und führt sie aus wenn die Bedingungen erfüllt sind.
 */
export async function checkAndExecuteOrders(sessionId = 'default'): Promise<void> {
  const currentState = state.loadState(sessionId);
  
  if (!currentState.orderSettings.autoExecute) return;

  const activeOrders = currentState.orders.filter(o => o.status === 'active');
  if (activeOrders.length === 0) return;

  const symbols = [...new Set(activeOrders.map(o => o.symbol))];

  try {
    const quotes = await market.getQuotesBatch(symbols);

    let stateChanged = false;

    for (const order of activeOrders) {
      const quote = quotes.find(q => q.symbol === order.symbol);
      if (!quote) continue;

      const currentPrice = quote.price;

      // Kein Handel mit Fallback-Daten
      if (quote.isFallback) {
        console.warn(`[OrderExecutor] ⚠️ Überspringe ${order.symbol}: Fallback-Daten`);
        continue;
      }

      // Preis im State updaten
      const orderInState = currentState.orders.find(o => o.id === order.id);
      if (orderInState) {
        orderInState.currentPrice = currentPrice;
        stateChanged = true;
      }

      // Circuit-Breaker: >25% Preissprung
      if (order.currentPrice > 0) {
        const priceChange = Math.abs((currentPrice - order.currentPrice) / order.currentPrice) * 100;
        if (priceChange > 25) {
          console.warn(`[OrderExecutor] ⚠️ Circuit-Breaker für ${order.symbol}: ${priceChange.toFixed(1)}% Preissprung`);
          continue;
        }
      }

      // Abgelaufen?
      if (order.expiresAt && new Date(order.expiresAt) < new Date()) {
        if (orderInState) {
          orderInState.status = 'cancelled';
          stateChanged = true;
        }
        continue;
      }

      // Trigger prüfen
      let shouldExecute = false;
      switch (order.orderType) {
        case 'limit-buy':
          shouldExecute = currentPrice <= order.triggerPrice;
          break;
        case 'limit-sell':
          shouldExecute = currentPrice >= order.triggerPrice;
          break;
        case 'stop-loss':
          shouldExecute = currentPrice <= order.triggerPrice;
          break;
        case 'stop-buy':
          shouldExecute = currentPrice >= order.triggerPrice;
          break;
      }

      if (shouldExecute) {
        console.log(`[OrderExecutor] ✅ Order ausführen: ${order.orderType} ${order.quantity}x ${order.symbol} @ ${currentPrice.toFixed(2)}€`);
        // State neu laden (executeOrder speichert intern)
        state.executeOrder(order.id, currentPrice, sessionId);
        stateChanged = false; // executeOrder hat schon gespeichert
        
        // Log-Eintrag
        const updatedState = state.loadState(sessionId);
        updatedState.autopilotLog = [{
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: 'order-executed',
          message: `✅ [Server] Order ausgeführt: ${order.orderType.toUpperCase()} ${order.quantity}x ${order.symbol} @ ${currentPrice.toFixed(2)}€`,
          symbol: order.symbol,
          orderId: order.id,
        }, ...updatedState.autopilotLog].slice(0, 200);
        updatedState.autopilotState.totalOrdersExecuted += 1;
        state.saveState(updatedState, sessionId);
      }
    }

    // Preis-Updates speichern wenn nötig
    if (stateChanged) {
      state.saveState(currentState, sessionId);
    }

  } catch (error) {
    console.error('[OrderExecutor] Fehler:', error);
  }
}
