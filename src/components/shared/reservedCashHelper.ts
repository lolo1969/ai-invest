import type { Order, OrderSettings } from '../../types';

/**
 * Berechnet das durch aktive/pendende Kauf-Orders reservierte Cash.
 */
export function calcReservedCash(orders: Order[], orderSettings: OrderSettings): number {
  return orders
    .filter(
      (o) =>
        (o.status === 'active' || o.status === 'pending') &&
        (o.orderType === 'limit-buy' || o.orderType === 'stop-buy')
    )
    .reduce((sum, o) => {
      const cost = o.triggerPrice * o.quantity;
      const fee =
        (orderSettings.transactionFeeFlat || 0) +
        cost * ((orderSettings.transactionFeePercent || 0) / 100);
      return sum + cost + fee;
    }, 0);
}

/**
 * Gibt verfügbares und reserviertes Cash zurück.
 */
export function calcAvailableCash(
  cashBalance: number,
  orders: Order[],
  orderSettings: OrderSettings
): { reservedCash: number; availableCash: number } {
  const reservedCash = calcReservedCash(orders, orderSettings);
  return { reservedCash, availableCash: cashBalance - reservedCash };
}

/**
 * Berechnet die durch aktive/pendende Sell-Orders reservierten Stücke für ein Symbol.
 */
export function calcReservedShares(orders: Order[], symbol: string): number {
  return orders
    .filter(
      (o) =>
        (o.status === 'active' || o.status === 'pending') &&
        (o.orderType === 'limit-sell' || o.orderType === 'stop-loss') &&
        o.symbol === symbol
    )
    .reduce((sum, o) => sum + o.quantity, 0);
}
