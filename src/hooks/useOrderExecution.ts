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

        // Preis aktualisieren
        updateOrderPrice(order.id, currentPrice);

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
