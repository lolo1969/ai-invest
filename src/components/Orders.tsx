import { useState, useMemo } from 'react';
import { 
  ShoppingCart,
  Plus, 
  Trash2, 
  Check,
  X,
  Play,
  Pause,
  Clock,
  ArrowUpCircle,
  ArrowDownCircle,
  ShieldAlert,
  Zap,
  Filter,
  RefreshCw
} from 'lucide-react';
import { useAppStore, checkDuplicateOrder } from '../store/useAppStore';
import { marketDataService } from '../services/marketData';
import { createAlpacaService } from '../services/alpacaService';
import type { OrderType, OrderStatus } from '../types';
import { findCompatibleSymbolMatch, symbolsReferToSameInstrument, sumByEquivalentSymbol } from '../utils/symbolMatching';

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  'limit-buy': 'Limit Buy',
  'limit-sell': 'Limit Sell',
  'stop-loss': 'Stop Loss',
  'stop-buy': 'Stop Buy',
};

const ORDER_TYPE_DESCRIPTIONS: Record<OrderType, string> = {
  'limit-buy': 'Buy when price falls to or below target price',
  'limit-sell': 'Sell when price rises to or above target price',
  'stop-loss': 'Loss protection – sell when price falls',
  'stop-buy': 'Breakout – buy when price rises',
};

const ORDER_TYPE_ICONS: Record<OrderType, React.ReactNode> = {
  'limit-buy': <ArrowDownCircle size={16} className="text-green-400" />,
  'limit-sell': <ArrowUpCircle size={16} className="text-blue-400" />,
  'stop-loss': <ShieldAlert size={16} className="text-red-400" />,
  'stop-buy': <Zap size={16} className="text-yellow-400" />,
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'text-yellow-400 bg-yellow-400/10',
  active: 'text-blue-400 bg-blue-400/10',
  executed: 'text-green-400 bg-green-400/10',
  cancelled: 'text-gray-400 bg-gray-400/10',
  expired: 'text-orange-400 bg-orange-400/10',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Awaiting Confirmation',
  active: 'Active',
  executed: 'Executed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export function Orders() {
  const { 
    orders, 
    orderSettings, 
    addOrder, 
    removeOrder, 
    cancelOrder,
    executeOrder,
    updateOrderSettings,
    updateOrderPrice,
    userPositions,
    cashBalance,
    watchlist
  } = useAppStore();
  const { settings, alpacaSettings } = useAppStore();
  
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('active');
  const [typeFilter, setTypeFilter] = useState<OrderType | 'all'>('all');
  const [searchingSymbol, setSearchingSymbol] = useState(false);
  const [symbolSuggestions, setSymbolSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [manualExecuteId, setManualExecuteId] = useState<string | null>(null);
  const [isCheckingNow, setIsCheckingNow] = useState(false);
  const [checkNowFeedback, setCheckNowFeedback] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    symbol: '',
    name: '',
    orderType: 'limit-buy' as OrderType,
    quantity: '',
    triggerPrice: '',
    expiresAt: '',
    note: '',
  });

  // Filtered orders
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

  // Filter counts contextually:
  // - Status counts take into account the currently selected type
  // - Type counts take into account the currently selected status
  const statusCounts = useMemo(() => {
    const base = typeFilter === 'all'
      ? orders
      : orders.filter((o) => o.orderType === typeFilter);

    return {
      all: base.length,
      pending: base.filter((o) => o.status === 'pending').length,
      active: base.filter((o) => o.status === 'active').length,
      executed: base.filter((o) => o.status === 'executed').length,
      cancelled: base.filter((o) => o.status === 'cancelled').length,
      expired: base.filter((o) => o.status === 'expired').length,
    };
  }, [orders, typeFilter]);

  const typeCounts = useMemo(() => {
    const base = statusFilter === 'all'
      ? orders
      : orders.filter((o) => o.status === statusFilter);

    return {
      all: base.length,
      'limit-buy': base.filter((o) => o.orderType === 'limit-buy').length,
      'limit-sell': base.filter((o) => o.orderType === 'limit-sell').length,
      'stop-loss': base.filter((o) => o.orderType === 'stop-loss').length,
      'stop-buy': base.filter((o) => o.orderType === 'stop-buy').length,
    };
  }, [orders, statusFilter]);

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

  // Symbol search with debounce
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
    // For sell orders, automatically enter the max available quantity
    const isSell = formData.orderType === 'limit-sell' || formData.orderType === 'stop-loss';
    const position = userPositions.find((p) => symbolsReferToSameInstrument(p.symbol, symbol));
    const autoQuantity = isSell && position ? position.quantity.toString() : '';
    
    setFormData((prev) => ({ ...prev, symbol, name, ...(autoQuantity ? { quantity: autoQuantity } : {}) }));
    setSymbolSuggestions([]);
    // Load current price to use as reference
    try {
      const quote = await marketDataService.getQuote(symbol);
      if (quote) {
        // Suggest trigger price based on order type
        const type = formData.orderType;
        let suggestedPrice = quote.price;
        if (type === 'limit-buy' || type === 'stop-loss') {
          suggestedPrice = +(quote.price * 0.95).toFixed(2); // 5% below current price
        } else {
          suggestedPrice = +(quote.price * 1.05).toFixed(2); // 5% above current price
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

    // Get current price
    let currentPrice = triggerPrice;
    try {
      const quote = await marketDataService.getQuote(formData.symbol);
      if (quote) currentPrice = quote.price;
    } catch {
      // Fallback to triggerPrice
    }

    // Validation: Enough cash for buy orders? (incl. fees + reserved cash by active orders)
    if (formData.orderType === 'limit-buy' || formData.orderType === 'stop-buy') {
      const cost = triggerPrice * quantity;
      const fee = (orderSettings.transactionFeeFlat || 0) + cost * (orderSettings.transactionFeePercent || 0) / 100;
      // Cash already reserved by active/pending buy orders
      const reservedCash = orders
        .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy'))
        .reduce((sum, o) => {
          const oCost = o.triggerPrice * o.quantity;
          const oFee = (orderSettings.transactionFeeFlat || 0) + oCost * (orderSettings.transactionFeePercent || 0) / 100;
          return sum + oCost + oFee;
        }, 0);
      const availableCash = cashBalance - reservedCash;
      if (cost + fee > availableCash) {
        alert(`Not enough cash! Required: ${(cost + fee).toFixed(2)} € (including ${fee.toFixed(2)} € fees), Available: ${availableCash.toFixed(2)} € (${reservedCash > 0 ? `${reservedCash.toFixed(2)} € reserved by active orders` : 'no order reservations'})`);
        return;
      }
    }

    // Validation: Enough units for sell orders? (incl. reserved units by active sell orders)
    if (formData.orderType === 'limit-sell' || formData.orderType === 'stop-loss') {
      const position = userPositions.find((p) => symbolsReferToSameInstrument(p.symbol, formData.symbol));
      // Units already reserved by active/pending sell orders
      const reservedQuantity = sumByEquivalentSymbol(
        formData.symbol,
        orders.filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss')),
        (item) => item.symbol,
        (item) => item.quantity
      );
      const availableQuantity = (position?.quantity ?? 0) - reservedQuantity;
      if (!position || availableQuantity < quantity) {
        alert(`Not enough shares! Available: ${availableQuantity} (${reservedQuantity > 0 ? `${reservedQuantity} reserved by active orders` : 'total: ' + (position?.quantity ?? 0)})`);
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
    setFormData({
      symbol: '',
      name: '',
      orderType: 'limit-buy',
      quantity: '',
      triggerPrice: '',
      expiresAt: '',
      note: '',
    });
    setShowForm(false);
  };

  const handleManualExecute = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || (order.status !== 'active' && order.status !== 'pending')) return;

    let price = order.triggerPrice;
    try {
      const quote = await marketDataService.getQuote(order.symbol);
      price = quote?.price ?? order.triggerPrice;
      executeOrder(orderId, price);
    } catch {
      executeOrder(orderId, order.triggerPrice);
    }

    // Submit to Alpaca if enabled
    if (alpacaSettings.enabled) {
      const alpaca = createAlpacaService(
        settings.apiKeys.alpacaKeyId,
        settings.apiKeys.alpacaKeySecret,
        alpacaSettings.paper
      );
      if (alpaca) {
        alpaca.submitOrder(order, price)
          .then((result) => console.log(`[Alpaca] Manual execute: ${order.symbol} → ${result.id}`))
          .catch((err) => console.warn(`[Alpaca] Manual execute failed for ${order.symbol}:`, err?.message ?? err));
      }
    }

    setManualExecuteId(null);
  };

  const handleCheckNow = async () => {
    if (isCheckingNow) return;

    const activeOrders = orders.filter(o => o.status === 'active');
    if (activeOrders.length === 0) {
        setCheckNowFeedback('No active orders to check.');
        return;
      }

      setIsCheckingNow(true);
      setCheckNowFeedback('Checking...');
    try {
      const symbols = activeOrders.map(o => o.symbol);
      const quotes = await marketDataService.getQuotes(symbols);
      let updated = 0;
      let missing = 0;

      for (const order of activeOrders) {
        const quote = findCompatibleSymbolMatch(order.symbol, quotes, (item) => item.symbol);
        if (!quote) {
          missing++;
          continue;
        }
        updateOrderPrice(order.id, quote.price);
        updated++;
      }

      const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setCheckNowFeedback(`Checked at ${now}: ${updated} updated, ${missing} without live quotes.`);
    } catch {
      setCheckNowFeedback('Check failed: Price data could not be loaded.');
    } finally {
      setIsCheckingNow(false);
    }
  };

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
      .filter((s) => !portfolioSymbols.has(s.symbol)) // Duplikate vermeiden
      .map((s) => ({
        symbol: s.symbol,
        name: s.name,
        quantity: 0,
        currentPrice: s.price,
        source: 'watchlist' as const,
      }));
    return [...portfolioItems, ...watchlistItems];
  }, [userPositions, watchlist]);

  // Max sellable quantity for current symbol
  const maxSellQuantity = useMemo(() => {
    if (!formData.symbol) return 0;
    const position = userPositions.find((p) => symbolsReferToSameInstrument(p.symbol, formData.symbol));
    return position?.quantity ?? 0;
  }, [formData.symbol, userPositions]);

  const isSellOrder = formData.orderType === 'limit-sell' || formData.orderType === 'stop-loss';

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8 pt-12 lg:pt-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="text-purple-400" size={24} />
            Orders
          </h2>
          <p className="text-gray-400 mt-1 text-sm">Limit & Stop Orders verwalten</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-purple-600 hover:bg-purple-700 
                   text-white rounded-lg transition-colors text-sm md:text-base"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Cancel' : 'New Order'}
        </button>
      </div>

      {/* Auto-Execution Toggle & Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
        {/* Auto-Execute Card */}
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Auto-execution</span>
            <button
              onClick={() => updateOrderSettings({ autoExecute: !orderSettings.autoExecute })}
              className={`toggle-switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                orderSettings.autoExecute ? 'bg-green-500' : 'bg-gray-600'
              }`}
              style={{ minWidth: '2.75rem', minHeight: '1.5rem', maxWidth: '2.75rem', maxHeight: '1.5rem' }}
            >
              <span
                className={`inline-block h-4 w-4 shrink-0 transform rounded-full bg-white transition-transform ${
                  orderSettings.autoExecute ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center gap-1 mt-1">
            {orderSettings.autoExecute ? (
              <Play size={14} className="text-green-400" />
            ) : (
              <Pause size={14} className="text-gray-500" />
            )}
            <span className={`text-sm font-medium ${orderSettings.autoExecute ? 'text-green-400' : 'text-gray-500'}`}>
              {orderSettings.autoExecute ? 'Active' : 'Inactive'}
            </span>
          </div>
          {orderSettings.autoExecute && (
            <div className="mt-2 flex items-center gap-2">
              <Clock size={12} className="text-gray-500" />
              <span className="text-xs text-gray-500">
                Check every {orderSettings.checkIntervalSeconds}s
              </span>
            </div>
          )}
        </div>

        {/* Cash Balance */}
        <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-4 border border-[#252542]">
          <span className="text-xs md:text-sm text-gray-400">Cash Balance</span>
          <p className="text-base md:text-xl font-bold text-white mt-1 truncate">
            {cashBalance.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}
          </p>
          {(() => {
            const reservedCash = orders
              .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy'))
              .reduce((sum, o) => {
                const oCost = o.triggerPrice * o.quantity;
                const oFee = (orderSettings.transactionFeeFlat || 0) + oCost * (orderSettings.transactionFeePercent || 0) / 100;
                return sum + oCost + oFee;
              }, 0);
            if (reservedCash > 0) {
              const availableCash = cashBalance - reservedCash;
              return (
                <div className="mt-1">
                  <p className="text-xs text-orange-400">
                    {reservedCash.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })} reserved
                  </p>
                  <p className="text-xs text-gray-500">
                    Free: {availableCash.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Active Orders */}
        <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-4 border border-[#252542]">
          <span className="text-xs md:text-sm text-gray-400">Active Orders</span>
          <p className="text-base md:text-xl font-bold text-blue-400 mt-1">
            {stats.active}
            {stats.pending > 0 && (
              <span className="text-yellow-400 text-sm ml-2">(+{stats.pending} pending)</span>
            )}
          </p>
        </div>

        {/* Executed Orders */}
        <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-4 border border-[#252542]">
          <span className="text-xs md:text-sm text-gray-400">Executed</span>
          <p className="text-base md:text-xl font-bold text-green-400 mt-1">{stats.executed}</p>
          {stats.totalExecutedValue > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Volume: {stats.totalExecutedValue.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}
            </p>
          )}
        </div>
      </div>

      {/* Auto-Execution Settings (expandable) */}
      {orderSettings.autoExecute && (
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-green-500/30 mb-4 md:mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-green-400" />
              <span className="text-sm font-medium text-green-400">Auto-execution active</span>
            </div>
            <div className="flex items-center gap-2 md:gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Interval:</label>
                <select
                  value={orderSettings.checkIntervalSeconds}
                  onChange={(e) => updateOrderSettings({ checkIntervalSeconds: parseInt(e.target.value) })}
                  className="bg-[#252542] text-white text-sm rounded px-2 py-1 border border-[#353560]"
                >
                  <option value={10}>10</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                  <option value={120}>120</option>
                  <option value={300}>300</option>
                </select>
              </div>
              <button
                onClick={handleCheckNow}
                disabled={isCheckingNow}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white 
                         bg-[#252542] px-2 py-1 rounded disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw size={12} className={isCheckingNow ? 'animate-spin' : ''} />
                {isCheckingNow ? 'Checking...' : 'Check now'}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            ⚠️ Orders are automatically executed at market price when...
            Cash and positions are adjusted immediately.
          </p>
          {checkNowFeedback && (
            <p className="text-xs text-cyan-300 mt-2">{checkNowFeedback}</p>
          )}
        </div>
      )}

      {/* Order Form */}
      {showForm && (
        <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-[#252542] mb-4 md:mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Create New Order</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Order Type Selection */}
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-400 mb-2">Order-Typ</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFormData((prev) => ({ ...prev, orderType: type }))}
                    className={`flex items-center gap-2 p-3 rounded-lg border transition-all text-left ${
                      formData.orderType === type
                        ? 'border-purple-500 bg-purple-500/10 text-white'
                        : 'border-[#353560] bg-[#252542] text-gray-400 hover:border-[#454570]'
                    }`}
                  >
                    {ORDER_TYPE_ICONS[type]}
                    <div>
                      <span className="text-sm font-medium block">{ORDER_TYPE_LABELS[type]}</span>
                      <span className="text-xs text-gray-500 block mt-0.5">{ORDER_TYPE_DESCRIPTIONS[type]}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Symbol */}
            <div className="relative">
              <label className="block text-sm text-gray-400 mb-1">Symbol</label>
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => handleSymbolSearch(e.target.value)}
                placeholder="e.g. AAPL, MSFT..."
                className="w-full bg-[#252542] text-white rounded-lg px-3 py-2 border border-[#353560] 
                         focus:border-purple-500 focus:outline-none"
              />
              {searchingSymbol && (
                <div className="absolute right-3 top-9">
                  <RefreshCw size={14} className="text-gray-500 animate-spin" />
                </div>
              )}
              {symbolSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-[#252542] border border-[#353560] rounded-lg 
                              shadow-xl max-h-48 overflow-auto">
                  {symbolSuggestions.map((s) => (
                    <button
                      key={s.symbol}
                      onClick={() => selectSymbol(s.symbol, s.name)}
                      className="w-full text-left px-3 py-2 hover:bg-[#353560] text-sm"
                    >
                      <span className="text-white font-medium">{s.symbol}</span>
                      <span className="text-gray-400 ml-2">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* Schnell-Auswahl aus Portfolio + Watchlist */}
              {formData.symbol === '' && quickSelectOptions.length > 0 && (
                <div className="mt-2">
                  {quickSelectOptions.some((o) => o.source === 'portfolio') && (
                    <div className="mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold">Portfolio</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {quickSelectOptions.filter((o) => o.source === 'portfolio').map((p) => (
                          <button
                            key={`pos-${p.symbol}`}
                            onClick={() => selectSymbol(p.symbol, p.name)}
                            className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded hover:bg-indigo-500/30"
                          >
                            {p.symbol} ({p.quantity}x)
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {quickSelectOptions.some((o) => o.source === 'watchlist') && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Watchlist</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {quickSelectOptions.filter((o) => o.source === 'watchlist').map((s) => (
                          <button
                            key={`wl-${s.symbol}`}
                            onClick={() => selectSymbol(s.symbol, s.name)}
                            className="text-xs px-2 py-1 bg-[#353560] text-gray-300 rounded hover:bg-[#454570]"
                          >
                            {s.symbol}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Stock name"
                className="w-full bg-[#252542] text-white rounded-lg px-3 py-2 border border-[#353560] 
                         focus:border-purple-500 focus:outline-none"
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Quantity
                {isSellOrder && maxSellQuantity > 0 && (
                  <span className="ml-2 text-xs text-indigo-400">
                    (max. {maxSellQuantity} available)
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (isSellOrder && maxSellQuantity > 0 && parseFloat(val) > maxSellQuantity) {
                      val = maxSellQuantity.toString();
                    }
                    setFormData((prev) => ({ ...prev, quantity: val }));
                  }}
                  placeholder="e.g. 10"
                  min="0.01"
                  step="0.01"
                  max={isSellOrder && maxSellQuantity > 0 ? maxSellQuantity : undefined}
                  className="w-full bg-[#252542] text-white rounded-lg px-3 py-2 border border-[#353560] 
                           focus:border-purple-500 focus:outline-none"
                />
                {isSellOrder && maxSellQuantity > 0 && (
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, quantity: maxSellQuantity.toString() }))}
                    className="px-3 py-2 text-xs font-medium bg-indigo-500/20 text-indigo-300 rounded-lg 
                             hover:bg-indigo-500/30 whitespace-nowrap transition-colors"
                  >
                    Max
                  </button>
                )}
              </div>
              {formData.quantity && formData.triggerPrice && (
                <p className="text-xs text-gray-500 mt-1">
                  Total value: {(parseFloat(formData.quantity) * parseFloat(formData.triggerPrice)).toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}
                </p>
              )}
            </div>

            {/* Trigger Price */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Trigger Price</label>
              <input
                type="number"
                value={formData.triggerPrice}
                onChange={(e) => setFormData((prev) => ({ ...prev, triggerPrice: e.target.value }))}
                placeholder="e.g. 150.00"
                min="0.01"
                step="0.01"
                className="w-full bg-[#252542] text-white rounded-lg px-3 py-2 border border-[#353560] 
                         focus:border-purple-500 focus:outline-none"
              />
            </div>

            {/* Expiry Date */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Valid until (optional)</label>
              <input
                type="datetime-local"
                value={formData.expiresAt}
                onChange={(e) => setFormData((prev) => ({ ...prev, expiresAt: e.target.value }))}
                className="w-full bg-[#252542] text-white rounded-lg px-3 py-2 border border-[#353560] 
                         focus:border-purple-500 focus:outline-none"
              />
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Note (optional)</label>
              <input
                type="text"
                value={formData.note}
                onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="e.g. Earnings play..."
                className="w-full bg-[#252542] text-white rounded-lg px-3 py-2 border border-[#353560] 
                         focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!formData.symbol || !formData.quantity || !formData.triggerPrice}
              className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 
                       text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Create Order
            </button>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542] mb-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">ℹ️ How Orders Work</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-500">
          <div className="flex items-start gap-2">
            <ArrowDownCircle size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Limit Buy:</strong> Buy order is executed when price falls to or below trigger price.</span>
          </div>
          <div className="flex items-start gap-2">
            <ArrowUpCircle size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Limit Sell:</strong> Sell order is executed when price rises to or above trigger price.</span>
          </div>
          <div className="flex items-start gap-2">
            <ShieldAlert size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Stop Loss:</strong> Automatic sale to limit loss...</span>
          </div>
          <div className="flex items-start gap-2">
            <Zap size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Stop Buy:</strong> Buy order on breakout – executed when price rises above trigger.</span>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <Filter size={14} className="text-gray-500 flex-shrink-0" />
          <span className="text-xs md:text-sm text-gray-500 flex-shrink-0">Status:</span>
          {(['all', 'active', 'executed', 'cancelled', 'expired'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                statusFilter === status
                  ? 'bg-purple-600 text-white'
                  : 'bg-[#252542] text-gray-400 hover:bg-[#353560]'
              }`}
            >
              {status === 'all' ? 'All' : STATUS_LABELS[status]}
              {status !== 'all' && (
                <span className="ml-1">({statusCounts[status]})</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <ShoppingCart size={14} className="text-gray-500 flex-shrink-0" />
          <span className="text-xs md:text-sm text-gray-500 flex-shrink-0">Type:</span>
          {(['all', 'limit-buy', 'limit-sell', 'stop-loss', 'stop-buy'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                typeFilter === type
                  ? 'bg-purple-600 text-white'
                  : 'bg-[#252542] text-gray-400 hover:bg-[#353560]'
              }`}
            >
              {type === 'all' ? 'Alle' : ORDER_TYPE_LABELS[type]}
              {type !== 'all' && (
                <span className="ml-1">({typeCounts[type]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <ShoppingCart size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg">No orders yet</p>
          <p className="text-sm mt-1">Create your first order with the button above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isBuy = order.orderType === 'limit-buy' || order.orderType === 'stop-buy';
            const priceDiff = order.currentPrice - order.triggerPrice;
            const priceDiffPercent = (priceDiff / order.triggerPrice) * 100;
            const totalValue = order.triggerPrice * order.quantity;

            // Progress indicator: How close is the price to trigger?
            let progressPercent = 0;
            if (order.status === 'active' || order.status === 'pending') {
              if (order.orderType === 'limit-buy' || order.orderType === 'stop-loss') {
                // Price must fall -> Progress increases when price is closer to trigger
                if (order.currentPrice > order.triggerPrice) {
                  const range = order.currentPrice - order.triggerPrice;
                  const maxRange = order.currentPrice * 0.1; // 10% als max Range
                  progressPercent = Math.max(0, Math.min(100, (1 - range / maxRange) * 100));
                } else {
                  progressPercent = 100;
                }
              } else {
                // Price must rise
                if (order.currentPrice < order.triggerPrice) {
                  const range = order.triggerPrice - order.currentPrice;
                  const maxRange = order.triggerPrice * 0.1;
                  progressPercent = Math.max(0, Math.min(100, (1 - range / maxRange) * 100));
                } else {
                  progressPercent = 100;
                }
              }
            }

            return (
              <div
                key={order.id}
                className={`bg-[#1a1a2e] rounded-xl p-4 border transition-all ${
                  order.status === 'active' 
                    ? 'border-[#252542] hover:border-purple-500/30' 
                    : order.status === 'pending'
                    ? 'border-yellow-500/30 hover:border-yellow-500/50'
                    : 'border-[#252542] opacity-75'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {/* Order Type Icon */}
                    <div className="mt-1">{ORDER_TYPE_ICONS[order.orderType]}</div>
                    
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold">{order.symbol}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status]}`}>
                          {STATUS_LABELS[order.status]}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          isBuy ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                        }`}>
                          {ORDER_TYPE_LABELS[order.orderType]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5">{order.name}</p>
                      
                      {/* Pricing details */}
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <div>
                          <span className="text-gray-500">Trigger: </span>
                          <span className="text-white font-medium">
                            {order.triggerPrice.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Current: </span>
                          <span className="text-white">
                            {order.currentPrice.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Diff: </span>
                          <span className={priceDiff >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {priceDiff >= 0 ? '+' : ''}{priceDiffPercent.toFixed(2)}%
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-1 text-sm">
                        <div>
                          <span className="text-gray-500">Units: </span>
                          <span className="text-white">{order.quantity}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Value: </span>
                          <span className="text-white">
                            {totalValue.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Created: </span>
                          <span className="text-gray-400">
                            {new Date(order.createdAt).toLocaleDateString('en-US', { 
                              day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' 
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Execution details */}
                      {order.status === 'executed' && order.executedPrice && (
                        <div className="flex items-center gap-2 mt-2 text-sm text-green-400">
                          <Check size={14} />
                          <span>
                            Executed at {order.executedPrice.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}
                            {order.executedAt && 
                              ` on ${new Date(order.executedAt).toLocaleDateString('en-US', { 
                                day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' 
                              })}`
                            }
                          </span>
                        </div>
                      )}

                      {/* Expiry date */}
                      {order.expiresAt && order.status === 'active' && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-orange-400">
                          <Clock size={12} />
                          <span>
                            Valid until {new Date(order.expiresAt).toLocaleDateString('en-US', { 
                              day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' 
                            })}
                          </span>
                        </div>
                      )}

                      {/* Notiz */}
                      {order.note && (
                        <p className="text-xs text-gray-500 mt-1 italic">📝 {order.note}</p>
                      )}

                      {/* Progress bar for active/pending orders */}
                      {(order.status === 'active' || order.status === 'pending') && (
                        <div className="mt-2 w-48">
                          <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                            <span>Trigger Proximity</span>
                            <span>{progressPercent.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 bg-[#252542] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                progressPercent > 80 ? 'bg-yellow-400' : 
                                progressPercent > 50 ? 'bg-blue-400' : 'bg-gray-500'
                              }`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {(order.status === 'active' || order.status === 'pending') && (
                      <>
                        {/* Manual execute */}
                        {manualExecuteId === order.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleManualExecute(order.id)}
                              className="p-1.5 text-green-400 hover:bg-green-400/10 rounded"
                              title="Confirm"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={() => setManualExecuteId(null)}
                              className="p-1.5 text-gray-400 hover:bg-gray-400/10 rounded"
                              title="Cancel"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setManualExecuteId(order.id)}
                            className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded"
                            title="Execute now"
                          >
                            <Play size={16} />
                          </button>
                        )}
                        {/* Cancel */}
                        <button
                          onClick={() => cancelOrder(order.id)}
                          className="p-1.5 text-orange-400 hover:bg-orange-400/10 rounded"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </>
                    )}
                    {/* Delete (completed orders only) */}
                    {order.status !== 'active' && order.status !== 'pending' && (
                      <button
                        onClick={() => removeOrder(order.id)}
                        className="p-1.5 text-red-400 hover:bg-red-400/10 rounded"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
