import { useState } from 'react';
import { useAppStore, checkDuplicateOrder } from '../../store/useAppStore';
import { marketDataService } from '../../services/marketData';
import { calcAvailableCash } from '../shared/reservedCashHelper';
import type { OrderType } from '../../types';

const DEFAULT_FORM = {
  symbol: '',
  name: '',
  orderType: 'limit-buy' as OrderType,
  quantity: '',
  triggerPrice: '',
  expiresAt: '',
  note: '',
};

export function useOrderForm() {
  const {
    orders,
    orderSettings,
    userPositions,
    cashBalance,
    addOrder,
    executeOrder,
  } = useAppStore();

  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [showForm, setShowForm] = useState(false);
  const [searchingSymbol, setSearchingSymbol] = useState(false);
  const [symbolSuggestions, setSymbolSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [manualExecuteId, setManualExecuteId] = useState<string | null>(null);

  // Symbol-Suche
  const handleSymbolSearch = async (value: string) => {
    setFormData((prev) => ({ ...prev, symbol: value.toUpperCase() }));
    if (value.length < 1) {
      setSymbolSuggestions([]);
      return;
    }
    setSearchingSymbol(true);
    try {
      const results = await marketDataService.searchStocks(value);
      setSymbolSuggestions(
        results.slice(0, 6).map((r) => ({ symbol: r.symbol, name: r.name }))
      );
    } catch {
      setSymbolSuggestions([]);
    } finally {
      setSearchingSymbol(false);
    }
  };

  const selectSymbol = async (symbol: string, name: string) => {
    const isSell = formData.orderType === 'limit-sell' || formData.orderType === 'stop-loss';
    const position = userPositions.find((p) => p.symbol === symbol);
    const autoQuantity = isSell && position ? position.quantity.toString() : '';

    setFormData((prev) => ({ ...prev, symbol, name, ...(autoQuantity ? { quantity: autoQuantity } : {}) }));
    setSymbolSuggestions([]);
    try {
      const quote = await marketDataService.getQuote(symbol);
      if (quote) {
        const type = formData.orderType;
        let suggestedPrice = quote.price;
        if (type === 'limit-buy' || type === 'stop-loss') {
          suggestedPrice = +(quote.price * 0.95).toFixed(2);
        } else {
          suggestedPrice = +(quote.price * 1.05).toFixed(2);
        }
        setFormData((prev) => ({ ...prev, triggerPrice: suggestedPrice.toString() }));
      }
    } catch {
      // Ignorieren
    }
  };

  const handleSubmit = async () => {
    if (!formData.symbol || !formData.quantity || !formData.triggerPrice) return;

    const quantity = parseFloat(formData.quantity);
    const triggerPrice = parseFloat(formData.triggerPrice);
    if (isNaN(quantity) || isNaN(triggerPrice) || quantity <= 0 || triggerPrice <= 0) return;

    // Aktuellen Preis holen
    let currentPrice = triggerPrice;
    try {
      const quote = await marketDataService.getQuote(formData.symbol);
      if (quote) currentPrice = quote.price;
    } catch {
      // Fallback auf triggerPrice
    }

    // Validierung: Genug Cash für Kauf-Orders?
    if (formData.orderType === 'limit-buy' || formData.orderType === 'stop-buy') {
      const cost = triggerPrice * quantity;
      const fee = (orderSettings.transactionFeeFlat || 0) + cost * (orderSettings.transactionFeePercent || 0) / 100;
      const { reservedCash, availableCash } = calcAvailableCash(cashBalance, orders, orderSettings);
      if (cost + fee > availableCash) {
        alert(`Nicht genug Cash! Benötigt: ${(cost + fee).toFixed(2)} € (inkl. ${fee.toFixed(2)} € Gebühren), Verfügbar: ${availableCash.toFixed(2)} € (${reservedCash > 0 ? `${reservedCash.toFixed(2)} € reserviert durch aktive Orders` : 'keine Order-Reservierungen'})`);
        return;
      }
    }

    // Validierung: Genug Stück für Verkauf-Orders?
    if (formData.orderType === 'limit-sell' || formData.orderType === 'stop-loss') {
      const position = userPositions.find((p) => p.symbol === formData.symbol);
      const reservedQuantity = orders
        .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss') && o.symbol === formData.symbol)
        .reduce((sum, o) => sum + o.quantity, 0);
      const availableQuantity = (position?.quantity ?? 0) - reservedQuantity;
      if (!position || availableQuantity < quantity) {
        alert(`Nicht genug Aktien! Verfügbar: ${availableQuantity} (${reservedQuantity > 0 ? `${reservedQuantity} reserviert durch aktive Orders` : 'gesamt: ' + (position?.quantity ?? 0)})`);
        return;
      }
    }

    const order = {
      id: crypto.randomUUID(),
      symbol: formData.symbol,
      name: formData.name || formData.symbol,
      orderType: formData.orderType,
      quantity,
      triggerPrice,
      currentPrice,
      status: 'active' as const,
      createdAt: new Date(),
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt) : undefined,
      note: formData.note || undefined,
    };

    const dupCheck = checkDuplicateOrder(order);
    if (!dupCheck.ok) {
      alert(`Order nicht erstellt: ${dupCheck.reason}`);
      return;
    }
    addOrder(order);
    setFormData({ ...DEFAULT_FORM });
    setShowForm(false);
  };

  const handleManualExecute = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || (order.status !== 'active' && order.status !== 'pending')) return;

    try {
      const quote = await marketDataService.getQuote(order.symbol);
      const price = quote?.price ?? order.triggerPrice;
      executeOrder(orderId, price);
    } catch {
      executeOrder(orderId, order.triggerPrice);
    }
    setManualExecuteId(null);
  };

  return {
    formData,
    setFormData,
    showForm,
    setShowForm,
    searchingSymbol,
    symbolSuggestions,
    manualExecuteId,
    setManualExecuteId,
    handleSymbolSearch,
    selectSymbol,
    handleSubmit,
    handleManualExecute,
  };
}
