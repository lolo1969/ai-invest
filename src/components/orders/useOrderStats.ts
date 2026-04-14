import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { OrderType, OrderStatus } from '../../types';

export function useOrderStats(symbol: string, orderType: OrderType) {
  const { orders, userPositions, watchlist } = useAppStore();

  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('active');
  const [typeFilter, setTypeFilter] = useState<OrderType | 'all'>('all');

  // Gefilterte Orders
  const filteredOrders = useMemo(() => {
    let filtered = [...orders];
    if (statusFilter !== 'all') {
      filtered = filtered.filter((o) => o.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter((o) => o.orderType === typeFilter);
    }
    // Neueste zuerst, pending und aktive ganz oben
    filtered.sort((a, b) => {
      const priorityOrder = { pending: 0, active: 1, executed: 2, cancelled: 3, expired: 4 };
      const aPriority = priorityOrder[a.status] ?? 5;
      const bPriority = priorityOrder[b.status] ?? 5;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return filtered;
  }, [orders, statusFilter, typeFilter]);

  // Statistiken
  const stats = useMemo(() => {
    const pending = orders.filter((o) => o.status === 'pending').length;
    const active = orders.filter((o) => o.status === 'active').length;
    const executed = orders.filter((o) => o.status === 'executed').length;
    const totalExecutedValue = orders
      .filter((o) => o.status === 'executed' && o.executedPrice)
      .reduce((sum, o) => sum + (o.executedPrice! * o.quantity), 0);
    return { pending, active, executed, totalExecutedValue };
  }, [orders]);

  // Kombinierte Schnellauswahl: Portfolio + Watchlist (dedupliziert)
  const quickSelectOptions = useMemo(() => {
    const portfolioSymbols = new Set(userPositions.map((p) => p.symbol));
    const portfolioItems = userPositions.map((p) => ({
      symbol: p.symbol,
      name: p.name,
      quantity: p.quantity,
      currentPrice: p.currentPrice,
      source: 'portfolio' as const,
    }));
    const watchlistItems = watchlist
      .filter((s) => !portfolioSymbols.has(s.symbol))
      .map((s) => ({
        symbol: s.symbol,
        name: s.name,
        quantity: 0,
        currentPrice: s.price,
        source: 'watchlist' as const,
      }));
    return [...portfolioItems, ...watchlistItems];
  }, [userPositions, watchlist]);

  // Max. verkaufbare Menge für aktuelles Symbol
  const maxSellQuantity = useMemo(() => {
    if (!symbol) return 0;
    const position = userPositions.find((p) => p.symbol === symbol);
    return position?.quantity ?? 0;
  }, [symbol, userPositions]);

  const isSellOrder = orderType === 'limit-sell' || orderType === 'stop-loss';

  return {
    filteredOrders,
    stats,
    quickSelectOptions,
    maxSellQuantity,
    isSellOrder,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
  };
}
