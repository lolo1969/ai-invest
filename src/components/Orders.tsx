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
import type { OrderType, OrderStatus } from '../types';

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  'limit-buy': 'Limit Buy',
  'limit-sell': 'Limit Sell',
  'stop-loss': 'Stop Loss',
  'stop-buy': 'Stop Buy',
};

const ORDER_TYPE_DESCRIPTIONS: Record<OrderType, string> = {
  'limit-buy': 'Kaufen wenn Preis auf oder unter Zielpreis fällt',
  'limit-sell': 'Verkaufen wenn Preis auf oder über Zielpreis steigt',
  'stop-loss': 'Verlustbegrenzung – verkaufen wenn Preis fällt',
  'stop-buy': 'Breakout – kaufen wenn Preis steigt',
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
  pending: 'Warte auf Bestätigung',
  active: 'Aktiv',
  executed: 'Ausgeführt',
  cancelled: 'Storniert',
  expired: 'Abgelaufen',
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
  
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('active');
  const [typeFilter, setTypeFilter] = useState<OrderType | 'all'>('all');
  const [searchingSymbol, setSearchingSymbol] = useState(false);
  const [symbolSuggestions, setSymbolSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [manualExecuteId, setManualExecuteId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    symbol: '',
    name: '',
    orderType: 'limit-buy' as OrderType,
    quantity: '',
    triggerPrice: '',
    expiresAt: '',
    note: '',
  });

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

  // Symbol-Suche mit Debounce
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
    // Bei Sell-Orders automatisch die max. verfügbare Menge eintragen
    const isSell = formData.orderType === 'limit-sell' || formData.orderType === 'stop-loss';
    const position = userPositions.find((p) => p.symbol === symbol);
    const autoQuantity = isSell && position ? position.quantity.toString() : '';
    
    setFormData((prev) => ({ ...prev, symbol, name, ...(autoQuantity ? { quantity: autoQuantity } : {}) }));
    setSymbolSuggestions([]);
    // Aktuellen Preis laden um als Orientierung zu dienen
    try {
      const quote = await marketDataService.getQuote(symbol);
      if (quote) {
        // Trigger-Preis vorschlagen basierend auf Order-Typ
        const type = formData.orderType;
        let suggestedPrice = quote.price;
        if (type === 'limit-buy' || type === 'stop-loss') {
          suggestedPrice = +(quote.price * 0.95).toFixed(2); // 5% unter aktuellem Preis
        } else {
          suggestedPrice = +(quote.price * 1.05).toFixed(2); // 5% über aktuellem Preis
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

    // Aktuelle Preis holen
    let currentPrice = triggerPrice;
    try {
      const quote = await marketDataService.getQuote(formData.symbol);
      if (quote) currentPrice = quote.price;
    } catch {
      // Fallback auf triggerPrice
    }

    // Validierung: Genug Cash für Kauf-Orders? (inkl. Gebühren + reserviertes Cash durch aktive Orders)
    if (formData.orderType === 'limit-buy' || formData.orderType === 'stop-buy') {
      const cost = triggerPrice * quantity;
      const fee = (orderSettings.transactionFeeFlat || 0) + cost * (orderSettings.transactionFeePercent || 0) / 100;
      // Cash der bereits durch aktive/pendende Kauf-Orders reserviert ist
      const reservedCash = orders
        .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy'))
        .reduce((sum, o) => {
          const oCost = o.triggerPrice * o.quantity;
          const oFee = (orderSettings.transactionFeeFlat || 0) + oCost * (orderSettings.transactionFeePercent || 0) / 100;
          return sum + oCost + oFee;
        }, 0);
      const availableCash = cashBalance - reservedCash;
      if (cost + fee > availableCash) {
        alert(`Nicht genug Cash! Benötigt: ${(cost + fee).toFixed(2)} € (inkl. ${fee.toFixed(2)} € Gebühren), Verfügbar: ${availableCash.toFixed(2)} € (${reservedCash > 0 ? `${reservedCash.toFixed(2)} € reserviert durch aktive Orders` : 'keine Order-Reservierungen'})`);
        return;
      }
    }

    // Validierung: Genug Stück für Verkauf-Orders? (inkl. reservierte Stücke durch aktive Sell-Orders)
    if (formData.orderType === 'limit-sell' || formData.orderType === 'stop-loss') {
      const position = userPositions.find((p) => p.symbol === formData.symbol);
      // Bereits durch aktive/pendende Verkaufs-Orders reservierte Stücke
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

    try {
      const quote = await marketDataService.getQuote(order.symbol);
      const price = quote?.price ?? order.triggerPrice;
      executeOrder(orderId, price);
    } catch {
      executeOrder(orderId, order.triggerPrice);
    }
    setManualExecuteId(null);
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

  // Max. verkaufbare Menge für aktuelles Symbol
  const maxSellQuantity = useMemo(() => {
    if (!formData.symbol) return 0;
    const position = userPositions.find((p) => p.symbol === formData.symbol);
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
          {showForm ? 'Abbrechen' : 'Neue Order'}
        </button>
      </div>

      {/* Auto-Execution Toggle & Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
        {/* Auto-Execute Card */}
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Auto-Ausführung</span>
            <button
              onClick={() => updateOrderSettings({ autoExecute: !orderSettings.autoExecute })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                orderSettings.autoExecute ? 'bg-green-500' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
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
              {orderSettings.autoExecute ? 'Aktiv' : 'Inaktiv'}
            </span>
          </div>
          {orderSettings.autoExecute && (
            <div className="mt-2 flex items-center gap-2">
              <Clock size={12} className="text-gray-500" />
              <span className="text-xs text-gray-500">
                Prüfung alle {orderSettings.checkIntervalSeconds}s
              </span>
            </div>
          )}
        </div>

        {/* Cash Balance */}
        <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-4 border border-[#252542]">
          <span className="text-xs md:text-sm text-gray-400">Cash-Bestand</span>
          <p className="text-base md:text-xl font-bold text-white mt-1 truncate">
            {cashBalance.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
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
                    {reservedCash.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} reserviert
                  </p>
                  <p className="text-xs text-gray-500">
                    Frei: {availableCash.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Active Orders */}
        <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-4 border border-[#252542]">
          <span className="text-xs md:text-sm text-gray-400">Aktive Orders</span>
          <p className="text-base md:text-xl font-bold text-blue-400 mt-1">
            {stats.active}
            {stats.pending > 0 && (
              <span className="text-yellow-400 text-sm ml-2">(+{stats.pending} wartend)</span>
            )}
          </p>
        </div>

        {/* Executed Orders */}
        <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-4 border border-[#252542]">
          <span className="text-xs md:text-sm text-gray-400">Ausgeführt</span>
          <p className="text-base md:text-xl font-bold text-green-400 mt-1">{stats.executed}</p>
          {stats.totalExecutedValue > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Volumen: {stats.totalExecutedValue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
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
              <span className="text-sm font-medium text-green-400">Auto-Ausführung aktiv</span>
            </div>
            <div className="flex items-center gap-2 md:gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Intervall:</label>
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
                onClick={async () => {
                  // Manueller Check: Aktive Orders gegen aktuelle Kurse prüfen
                  const activeOrders = orders.filter(o => o.status === 'active');
                  if (activeOrders.length === 0) return;
                  const symbols = [...new Set(activeOrders.map(o => o.symbol))];
                  try {
                    const quotes = await marketDataService.getQuotes(symbols);
                    for (const order of activeOrders) {
                      const quote = quotes.find(q => q.symbol === order.symbol);
                      if (!quote) continue;
                      updateOrderPrice(order.id, quote.price);
                    }
                  } catch { /* ignore */ }
                }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white 
                         bg-[#252542] px-2 py-1 rounded"
              >
                <RefreshCw size={12} />
                Jetzt prüfen
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            ⚠️ Orders werden automatisch zum Marktpreis ausgeführt wenn der Trigger-Preis erreicht wird. 
            Cash und Positionen werden sofort angepasst.
          </p>
        </div>
      )}

      {/* Order Form */}
      {showForm && (
        <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-[#252542] mb-4 md:mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Neue Order erstellen</h3>
          
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
                placeholder="z.B. AAPL, MSFT..."
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
                placeholder="Aktienname"
                className="w-full bg-[#252542] text-white rounded-lg px-3 py-2 border border-[#353560] 
                         focus:border-purple-500 focus:outline-none"
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Stückzahl
                {isSellOrder && maxSellQuantity > 0 && (
                  <span className="ml-2 text-xs text-indigo-400">
                    (max. {maxSellQuantity} verfügbar)
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
                  placeholder="z.B. 10"
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
                  Gesamtwert: {(parseFloat(formData.quantity) * parseFloat(formData.triggerPrice)).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </p>
              )}
            </div>

            {/* Trigger Price */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Trigger-Preis</label>
              <input
                type="number"
                value={formData.triggerPrice}
                onChange={(e) => setFormData((prev) => ({ ...prev, triggerPrice: e.target.value }))}
                placeholder="z.B. 150.00"
                min="0.01"
                step="0.01"
                className="w-full bg-[#252542] text-white rounded-lg px-3 py-2 border border-[#353560] 
                         focus:border-purple-500 focus:outline-none"
              />
            </div>

            {/* Expiry Date */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Gültig bis (optional)</label>
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
              <label className="block text-sm text-gray-400 mb-1">Notiz (optional)</label>
              <input
                type="text"
                value={formData.note}
                onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="z.B. Earnings Play..."
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
              Abbrechen
            </button>
            <button
              onClick={handleSubmit}
              disabled={!formData.symbol || !formData.quantity || !formData.triggerPrice}
              className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 
                       text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Order erstellen
            </button>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542] mb-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">ℹ️ So funktionieren Orders</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-500">
          <div className="flex items-start gap-2">
            <ArrowDownCircle size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Limit Buy:</strong> Kauforder wird ausgeführt wenn der Kurs auf oder unter den Trigger-Preis fällt.</span>
          </div>
          <div className="flex items-start gap-2">
            <ArrowUpCircle size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Limit Sell:</strong> Verkaufsorder wird ausgeführt wenn der Kurs auf oder über den Trigger-Preis steigt.</span>
          </div>
          <div className="flex items-start gap-2">
            <ShieldAlert size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Stop Loss:</strong> Automatischer Verkauf zur Verlustbegrenzung wenn der Kurs unter den Trigger fällt.</span>
          </div>
          <div className="flex items-start gap-2">
            <Zap size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Stop Buy:</strong> Kauforder bei Breakout – wird ausgeführt wenn der Kurs über den Trigger steigt.</span>
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
              {status === 'all' ? 'Alle' : STATUS_LABELS[status]}
              {status !== 'all' && (
                <span className="ml-1">({orders.filter((o) => o.status === status).length})</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <ShoppingCart size={14} className="text-gray-500 flex-shrink-0" />
          <span className="text-xs md:text-sm text-gray-500 flex-shrink-0">Typ:</span>
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
                <span className="ml-1">({orders.filter((o) => o.orderType === type).length})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <ShoppingCart size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg">Keine Orders vorhanden</p>
          <p className="text-sm mt-1">Erstelle deine erste Order mit dem Button oben</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isBuy = order.orderType === 'limit-buy' || order.orderType === 'stop-buy';
            const priceDiff = order.currentPrice - order.triggerPrice;
            const priceDiffPercent = (priceDiff / order.triggerPrice) * 100;
            const totalValue = order.triggerPrice * order.quantity;

            // Fortschrittsanzeige: Wie nah ist der Preis am Trigger?
            let progressPercent = 0;
            if (order.status === 'active' || order.status === 'pending') {
              if (order.orderType === 'limit-buy' || order.orderType === 'stop-loss') {
                // Preis muss fallen -> Progress steigt wenn Preis näher am Trigger
                if (order.currentPrice > order.triggerPrice) {
                  const range = order.currentPrice - order.triggerPrice;
                  const maxRange = order.currentPrice * 0.1; // 10% als max Range
                  progressPercent = Math.max(0, Math.min(100, (1 - range / maxRange) * 100));
                } else {
                  progressPercent = 100;
                }
              } else {
                // Preis muss steigen
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
                            {order.triggerPrice.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Aktuell: </span>
                          <span className="text-white">
                            {order.currentPrice.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
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
                          <span className="text-gray-500">Stk: </span>
                          <span className="text-white">{order.quantity}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Wert: </span>
                          <span className="text-white">
                            {totalValue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Erstellt: </span>
                          <span className="text-gray-400">
                            {new Date(order.createdAt).toLocaleDateString('de-DE', { 
                              day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' 
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Ausführungsdetails */}
                      {order.status === 'executed' && order.executedPrice && (
                        <div className="flex items-center gap-2 mt-2 text-sm text-green-400">
                          <Check size={14} />
                          <span>
                            Ausgeführt zu {order.executedPrice.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                            {order.executedAt && 
                              ` am ${new Date(order.executedAt).toLocaleDateString('de-DE', { 
                                day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' 
                              })}`
                            }
                          </span>
                        </div>
                      )}

                      {/* Ablaufdatum */}
                      {order.expiresAt && order.status === 'active' && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-orange-400">
                          <Clock size={12} />
                          <span>
                            Gültig bis {new Date(order.expiresAt).toLocaleDateString('de-DE', { 
                              day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' 
                            })}
                          </span>
                        </div>
                      )}

                      {/* Notiz */}
                      {order.note && (
                        <p className="text-xs text-gray-500 mt-1 italic">📝 {order.note}</p>
                      )}

                      {/* Progress bar für aktive/pending Orders */}
                      {(order.status === 'active' || order.status === 'pending') && (
                        <div className="mt-2 w-48">
                          <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                            <span>Trigger-Nähe</span>
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
                        {/* Manuell ausführen */}
                        {manualExecuteId === order.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleManualExecute(order.id)}
                              className="p-1.5 text-green-400 hover:bg-green-400/10 rounded"
                              title="Bestätigen"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={() => setManualExecuteId(null)}
                              className="p-1.5 text-gray-400 hover:bg-gray-400/10 rounded"
                              title="Abbrechen"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setManualExecuteId(order.id)}
                            className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded"
                            title="Sofort ausführen"
                          >
                            <Play size={16} />
                          </button>
                        )}
                        {/* Stornieren */}
                        <button
                          onClick={() => cancelOrder(order.id)}
                          className="p-1.5 text-orange-400 hover:bg-orange-400/10 rounded"
                          title="Stornieren"
                        >
                          <X size={16} />
                        </button>
                      </>
                    )}
                    {/* Löschen (nur abgeschlossene) */}
                    {order.status !== 'active' && order.status !== 'pending' && (
                      <button
                        onClick={() => removeOrder(order.id)}
                        className="p-1.5 text-red-400 hover:bg-red-400/10 rounded"
                        title="Löschen"
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
