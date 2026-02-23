import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { marketDataService } from '../services/marketData';

/**
 * Hook für die automatische Ausführung von aktiven Orders.
 * Prüft regelmäßig die aktuellen Marktpreise und führt Orders aus,
 * wenn die Bedingungen erfüllt sind.
 */
export function useOrderExecution() {
  const { 
    orders, 
    orderSettings, 
    executeOrder, 
    updateOrderPrice,
    cancelOrder 
  } = useAppStore();
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAndExecuteOrders = useCallback(async () => {
    const activeOrders = orders.filter((o) => o.status === 'active');
    if (activeOrders.length === 0) return;

    // Sammle alle einzigartigen Symbole
    const symbols = [...new Set(activeOrders.map((o) => o.symbol))];
    
    try {
      const quotes = await marketDataService.getQuotes(symbols);
      
      for (const order of activeOrders) {
        const quote = quotes.find((q) => q.symbol === order.symbol);
        if (!quote) continue;

        const currentPrice = quote.price;

        // SCHUTZ 1: Keine Order-Ausführung mit Fallback/Demo-Daten
        // Demo-Preise sind statisch und spiegeln nicht den echten Markt wider.
        // Eine Ausführung auf Basis von Demo-Daten kann zu falschen Trades führen.
        if (quote.isFallback) {
          console.warn(`[OrderExecution] ⚠️ Überspringe ${order.symbol}: Preis stammt aus Fallback/Demo-Daten (${currentPrice.toFixed(2)} €), keine automatische Ausführung.`);
          continue;
        }

        // Preis aktualisieren (auch bei Fallback ok, da nur informativ)
        updateOrderPrice(order.id, currentPrice);

        // SCHUTZ 2: Circuit-Breaker bei extremen Preissprüngen (>25%)
        // Wenn der aktuelle Preis sich drastisch vom letzten bekannten Preis unterscheidet,
        // könnte das auf einen API-Fehler oder fehlerhafte Daten hindeuten.
        if (order.currentPrice > 0) {
          const priceChangePercent = Math.abs((currentPrice - order.currentPrice) / order.currentPrice) * 100;
          if (priceChangePercent > 25) {
            console.warn(`[OrderExecution] ⚠️ Circuit-Breaker für ${order.symbol}: Preissprung von ${order.currentPrice.toFixed(2)} € auf ${currentPrice.toFixed(2)} € (${priceChangePercent.toFixed(1)}% Änderung). Order wird nicht automatisch ausgeführt.`);
            continue;
          }
        }

        // Prüfe ob Order abgelaufen
        if (order.expiresAt && new Date(order.expiresAt) < new Date()) {
          cancelOrder(order.id);
          continue;
        }

        // Prüfe ob Ausführungsbedingung erfüllt
        let shouldExecute = false;

        switch (order.orderType) {
          case 'limit-buy':
            // Kaufen wenn Preis unter/gleich Trigger fällt
            shouldExecute = currentPrice <= order.triggerPrice;
            break;
          case 'limit-sell':
            // Verkaufen wenn Preis über/gleich Trigger steigt
            shouldExecute = currentPrice >= order.triggerPrice;
            break;
          case 'stop-loss':
            // Verkaufen wenn Preis unter/gleich Trigger fällt (Verlustbegrenzung)
            shouldExecute = currentPrice <= order.triggerPrice;
            break;
          case 'stop-buy':
            // Kaufen wenn Preis über/gleich Trigger steigt (Breakout)
            shouldExecute = currentPrice >= order.triggerPrice;
            break;
        }

        if (shouldExecute && orderSettings.autoExecute) {
          executeOrder(order.id, currentPrice);
        }
      }
    } catch (error) {
      console.error('Order execution check failed:', error);
    }
  }, [orders, orderSettings.autoExecute, executeOrder, updateOrderPrice, cancelOrder]);

  useEffect(() => {
    if (!orderSettings.autoExecute) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const activeOrders = orders.filter((o) => o.status === 'active');
    if (activeOrders.length === 0) return;

    // Initial check
    checkAndExecuteOrders();

    // Regelmäßige Prüfung
    intervalRef.current = setInterval(
      checkAndExecuteOrders,
      orderSettings.checkIntervalSeconds * 1000
    );

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [orderSettings.autoExecute, orderSettings.checkIntervalSeconds, orders, checkAndExecuteOrders]);

  return { checkAndExecuteOrders };
}
