import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { marketDataService } from '../services/marketData';
import { createAlpacaService } from '../services/alpacaService';
import { findCompatibleSymbolMatch } from '../utils/symbolMatching';

function buildSymbolCandidates(symbols: string[]): string[] {
  const expanded = new Set<string>();
  for (const raw of symbols) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol) continue;
    expanded.add(symbol);
    if (!symbol.includes('.')) {
      // Many EU ETFs at Yahoo are only available with exchange suffix (e.g., EUNA.DE).
      expanded.add(`${symbol}.DE`);
    }
  }
  return [...expanded];
}

/**
 * Hook for automatic execution of active orders.
 * Periodically checks current market prices and executes orders when conditions are met.
 */
export function useOrderExecution() {
  const { 
    orders, 
    orderSettings,
    settings,
    alpacaSettings,
    executeOrder, 
    updateOrderPrice,
    cancelOrder 
  } = useAppStore();
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAndExecuteOrders = useCallback(async () => {
    const activeOrders = orders.filter((o) => o.status === 'active');
    if (activeOrders.length === 0) return;

    // Collect all unique symbols including exchange variants.
    const symbols = buildSymbolCandidates(activeOrders.map((o) => o.symbol));
    
    try {
      const quotes = await marketDataService.getQuotes(symbols);
      
      for (const order of activeOrders) {
        const quote = findCompatibleSymbolMatch(order.symbol, quotes, (item) => item.symbol);
        if (!quote) {
          console.warn(`[OrderExecution] No live quote found for ${order.symbol}.`);
          continue;
        }

        const currentPrice = quote.price;

        // SAFETY 1: No order execution with fallback/demo data
        // Demo prices are static and don't reflect the real market.
        // Executing based on demo data can lead to incorrect trades.
        if (quote.isFallback) {
          console.warn(`[OrderExecution] ⚠️ Skipping ${order.symbol}: Price comes from fallback/demo data (${currentPrice.toFixed(2)} €), no auto-execution.`);
          continue;
        }

        // Update price (also okay for fallback, since only informational)
        updateOrderPrice(order.id, currentPrice);

        // SAFETY 2: Circuit-breaker for extreme price jumps (>25%)
        // If current price differs drastically from last known price,
        // it could indicate an API error or bad data.
        if (order.currentPrice > 0) {
          const priceChangePercent = Math.abs((currentPrice - order.currentPrice) / order.currentPrice) * 100;
          if (priceChangePercent > 25) {
            console.warn(`[OrderExecution] ⚠️ Circuit-breaker for ${order.symbol}: Price jump from ${order.currentPrice.toFixed(2)} € to ${currentPrice.toFixed(2)} € (${priceChangePercent.toFixed(1)}% change). Order will not auto-execute.`);
            continue;
          }
        }

        // Check if order has expired
        if (order.expiresAt && new Date(order.expiresAt) < new Date()) {
          cancelOrder(order.id);
          continue;
        }

        // Check if execution condition is met
        let shouldExecute = false;

        switch (order.orderType) {
          case 'limit-buy':
            // Buy when price falls to/below trigger
            shouldExecute = currentPrice <= order.triggerPrice;
            break;
          case 'limit-sell':
            // Sell when price rises to/above trigger
            shouldExecute = currentPrice >= order.triggerPrice;
            break;
          case 'stop-loss':
            // Sell when price falls to/below trigger (loss limiting)
            shouldExecute = currentPrice <= order.triggerPrice;
            break;
          case 'stop-buy':
            // Buy when price rises to/above trigger (breakout)
            shouldExecute = currentPrice >= order.triggerPrice;
            break;
        }

        if (shouldExecute && orderSettings.autoExecute) {
          executeOrder(order.id, currentPrice);

          // If Alpaca is enabled, submit the order there too (fire & forget)
          if (alpacaSettings.enabled) {
            const alpaca = createAlpacaService(
              settings.apiKeys.alpacaKeyId,
              settings.apiKeys.alpacaKeySecret,
              alpacaSettings.paper
            );
            if (alpaca) {
              alpaca.submitOrder(order, currentPrice)
                .then((result) => {
                  console.log(`[Alpaca] Order submitted: ${order.symbol} → Alpaca ID ${result.id}`);
                })
                .catch((err) => {
                  console.warn(`[Alpaca] Failed to submit order for ${order.symbol}:`, err?.message ?? err);
                });
            }
          }
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

    // Regular check
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
