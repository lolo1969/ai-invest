import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  Bot,
  Play,
  Square,
  RefreshCw,
  Settings2,
  ScrollText,
  ShieldCheck,
  Zap,
  Eye,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Info,
  Trash2,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  ShoppingCart,
  ArrowRightLeft,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { runAutopilotCycle } from '../services/autopilotService';
import type { AutopilotMode, AutopilotLogType } from '../types';

const MODE_CONFIG: Record<AutopilotMode, { label: string; description: string; icon: React.ReactNode; color: string }> = {
  'suggest-only': {
    label: 'Nur Vorschläge',
    description: 'KI analysiert und schlägt vor, erstellt aber keine Orders',
    icon: <Eye size={18} />,
    color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  },
  'confirm-each': {
    label: 'Mit Bestätigung',
    description: 'KI erstellt Orders, die du vor Ausführung bestätigen musst',
    icon: <CheckCircle2 size={18} />,
    color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  },
  'full-auto': {
    label: 'Vollautomatisch',
    description: 'KI analysiert, erstellt und führt Orders selbständig aus',
    icon: <Zap size={18} />,
    color: 'text-red-400 bg-red-400/10 border-red-400/30',
  },
};

const LOG_ICONS: Record<AutopilotLogType, React.ReactNode> = {
  info: <Info size={14} className="text-gray-400" />,
  analysis: <TrendingUp size={14} className="text-purple-400" />,
  'order-created': <TrendingUp size={14} className="text-green-400" />,
  'order-executed': <CheckCircle2 size={14} className="text-green-400" />,
  warning: <AlertTriangle size={14} className="text-yellow-400" />,
  error: <AlertTriangle size={14} className="text-red-400" />,
  skipped: <TrendingDown size={14} className="text-gray-500" />,
};

const LOG_COLORS: Record<AutopilotLogType, string> = {
  info: 'border-l-gray-500',
  analysis: 'border-l-purple-500',
  'order-created': 'border-l-green-500',
  'order-executed': 'border-l-green-400',
  warning: 'border-l-yellow-500',
  error: 'border-l-red-500',
  skipped: 'border-l-gray-600',
};

export function Autopilot() {
  const {
    autopilotSettings,
    autopilotState,
    autopilotLog,
    updateAutopilotSettings,
    clearAutopilotLog,
    resetAutopilotState,
    cashBalance,
    userPositions,
    orders,
    cancelOrder,
    addAutopilotLog,
  } = useAppStore();

  // Manuellen Zyklus direkt auslösen (ohne Hook)
  const isRunningRef = useRef(false);
  const isRunning = autopilotState.isRunning;
  
  const triggerManualCycle = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    
    addAutopilotLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'info',
      message: '🔧 Manueller Zyklus gestartet',
    });
    
    try {
      await runAutopilotCycle();
    } finally {
      isRunningRef.current = false;
      const store = useAppStore.getState();
      if (store.autopilotSettings.enabled) {
        const nextRun = new Date(Date.now() + store.autopilotSettings.intervalMinutes * 60 * 1000);
        store.updateAutopilotState({ nextRunAt: nextRun.toISOString() });
      }
    }
  }, [addAutopilotLog, isRunningRef]);
  const [showSettings, setShowSettings] = useState(true);
  const [logFilter, setLogFilter] = useState<AutopilotLogType | 'all'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Live-Ticker: Aktualisiert Countdown jede Sekunde
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!autopilotSettings.enabled) return;
    const tickInterval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(tickInterval);
  }, [autopilotSettings.enabled]);

  // Pending Orders (zur Bestätigung)
  const pendingOrders = useMemo(() => {
    return orders.filter(o => o.status === 'pending');
  }, [orders]);

  // Order bestätigen = aktivieren (NICHT sofort ausführen!)
  // Limit- und Stop-Orders sollen erst auslösen, wenn die Trigger-Bedingung erfüllt ist.
  // Die eigentliche Ausführung übernimmt der useOrderExecution-Hook.
  const confirmAndActivateOrder = useCallback((orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending') return;
    
    // Nur aktivieren – useOrderExecution prüft den Trigger und führt aus
    useAppStore.getState().confirmOrder(orderId);
    
    addAutopilotLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'order-created',
      message: `✅ Order bestätigt & aktiviert: ${order.orderType.toUpperCase()} ${order.quantity}x ${order.symbol} @ Trigger ${order.triggerPrice.toFixed(2)}€`,
      symbol: order.symbol,
      orderId: order.id,
    });
  }, [orders, addAutopilotLog]);

  // Alle pending Orders bestätigen und aktivieren
  const confirmAndActivateAll = useCallback(() => {
    pendingOrders.forEach(o => confirmAndActivateOrder(o.id));
  }, [pendingOrders, confirmAndActivateOrder]);

  // Gesamtportfolio-Wert
  const totalPortfolioValue = useMemo(() => {
    return userPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0) + cashBalance;
  }, [userPositions, cashBalance]);

  // Gefiltertes Log
  const filteredLog = useMemo(() => {
    if (logFilter === 'all') return autopilotLog;
    return autopilotLog.filter(entry => entry.type === logFilter);
  }, [autopilotLog, logFilter]);

  const handleToggleEnabled = () => {
    const newEnabled = !autopilotSettings.enabled;
    updateAutopilotSettings({ enabled: newEnabled });
    // Bei Aktivierung im Vollautomatisch-Modus: Auto-Ausführung einschalten
    if (newEnabled && autopilotSettings.mode === 'full-auto') {
      useAppStore.getState().updateOrderSettings({ autoExecute: true });
    }
    if (!newEnabled) {
      resetAutopilotState();
    }
  };

  const formatTimeAgo = (isoString: string | null): string => {
    if (!isoString) return '–';
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    return `vor ${Math.floor(hours / 24)} Tagen`;
  };

  const formatNextRun = (isoString: string | null): string => {
    if (!isoString) return '–';
    const diff = new Date(isoString).getTime() - Date.now();
    if (diff <= 0) return 'Jetzt...';
    const totalSecs = Math.floor(diff / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 md:mb-8 pt-12 lg:pt-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <Bot className="text-emerald-400" size={24} />
            Autopilot
          </h2>
          <p className="text-gray-400 mt-1 text-sm">KI-gesteuerter automatischer Handel</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {/* Manueller Zyklus */}
          <button
            onClick={triggerManualCycle}
            disabled={isRunning || !autopilotSettings.enabled}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-[#252542] hover:bg-[#353560] 
                     text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <RefreshCw size={14} className={isRunning ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{isRunning ? 'Läuft...' : 'Jetzt analysieren'}</span>
            <span className="sm:hidden">{isRunning ? '...' : 'Analyse'}</span>
          </button>
          {/* Hauptschalter */}
          <button
            onClick={handleToggleEnabled}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all font-medium ${
              autopilotSettings.enabled
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {autopilotSettings.enabled ? (
              <>
                <Square size={16} />
                Autopilot stoppen
              </>
            ) : (
              <>
                <Play size={16} />
                Autopilot starten
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        {/* Status */}
        <div className={`bg-[#1a1a2e] rounded-xl p-4 border ${
          autopilotSettings.enabled ? 'border-emerald-500/30' : 'border-[#252542]'
        }`}>
          <span className="text-sm text-gray-400">Status</span>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-2.5 h-2.5 rounded-full ${
              isRunning ? 'bg-yellow-400 animate-pulse' :
              autopilotSettings.enabled ? 'bg-emerald-400' : 'bg-gray-500'
            }`} />
            <span className={`text-lg font-bold ${
              isRunning ? 'text-yellow-400' :
              autopilotSettings.enabled ? 'text-emerald-400' : 'text-gray-500'
            }`}>
              {isRunning ? 'Analysiert...' : autopilotSettings.enabled ? 'Aktiv' : 'Inaktiv'}
            </span>
          </div>
        </div>

        {/* Modus */}
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542]">
          <span className="text-sm text-gray-400">Modus</span>
          <p className="text-lg font-bold text-white mt-1">
            {MODE_CONFIG[autopilotSettings.mode].label}
          </p>
        </div>

        {/* Letzter Lauf */}
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542]">
          <span className="text-sm text-gray-400">Letzter Lauf</span>
          <p className="text-lg font-bold text-white mt-1">
            {formatTimeAgo(autopilotState.lastRunAt)}
          </p>
        </div>

        {/* Nächster Lauf */}
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542]">
          <span className="text-sm text-gray-400">Nächster Lauf</span>
          <p className="text-lg font-bold text-white mt-1">
            {autopilotSettings.enabled ? formatNextRun(autopilotState.nextRunAt) : '–'}
          </p>
        </div>

        {/* Zyklen */}
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542]">
          <span className="text-sm text-gray-400">Zyklen / Orders</span>
          <p className="text-lg font-bold text-white mt-1">
            {autopilotState.cycleCount} / {autopilotState.totalOrdersCreated}
          </p>
        </div>
      </div>

      {/* Settings Panel */}
      <div className="bg-[#1a1a2e] rounded-xl border border-[#252542] mb-6">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center justify-between p-4 text-white hover:bg-[#252542]/50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={18} className="text-gray-400" />
            <span className="font-semibold">Einstellungen</span>
          </div>
          {showSettings ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showSettings && (
          <div className="p-4 pt-0 space-y-6">
            {/* Modus-Auswahl */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Betriebsmodus</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(Object.keys(MODE_CONFIG) as AutopilotMode[]).map((mode) => {
                  const config = MODE_CONFIG[mode];
                  return (
                    <button
                      key={mode}
                      onClick={() => {
                        updateAutopilotSettings({ mode });
                        // Bei Vollautomatisch: Order-Auto-Ausführung aktivieren
                        if (mode === 'full-auto') {
                          useAppStore.getState().updateOrderSettings({ autoExecute: true });
                        }
                      }}
                      className={`flex items-start gap-3 p-4 rounded-lg border transition-all text-left ${
                        autopilotSettings.mode === mode
                          ? config.color
                          : 'border-[#353560] bg-[#252542] text-gray-400 hover:border-[#454570]'
                      }`}
                    >
                      <div className="mt-0.5">{config.icon}</div>
                      <div>
                        <span className="text-sm font-medium block">{config.label}</span>
                        <span className="text-xs text-gray-500 block mt-1">{config.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {autopilotSettings.mode === 'full-auto' && (
                <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-xs text-red-400">
                    ⚠️ Im Vollautomatik-Modus erstellt die KI eigenständig Orders. 
                    Stelle sicher, dass die Sicherheitslimits korrekt eingestellt sind.
                  </p>
                </div>
              )}
            </div>

            {/* Timing */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Analyse-Intervall</label>
                <select
                  value={autopilotSettings.intervalMinutes}
                  onChange={(e) => updateAutopilotSettings({ intervalMinutes: parseInt(e.target.value) })}
                  className="w-full bg-[#252542] text-white rounded-lg px-3 py-2 border border-[#353560] 
                           focus:border-emerald-500 focus:outline-none"
                >
                  <option value={30}>Alle 30 Minuten</option>
                  <option value={60}>Stündlich</option>
                  <option value={120}>Alle 2 Stunden</option>
                  <option value={240}>Alle 4 Stunden</option>
                  <option value={480}>Alle 8 Stunden</option>
                  <option value={1440}>Täglich</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <button
                  onClick={() => updateAutopilotSettings({ activeHoursOnly: !autopilotSettings.activeHoursOnly })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autopilotSettings.activeHoursOnly ? 'bg-emerald-500' : 'bg-gray-600'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    autopilotSettings.activeHoursOnly ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                <div>
                  <span className="text-sm text-white">Nur Börsenzeiten</span>
                  <p className="text-xs text-gray-500">EU: Mo-Fr 9:00-17:30 MEZ · US: Mo-Fr 9:30-16:00 ET</p>
                </div>
              </div>
            </div>

            {/* Sicherheitslimits */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={16} className="text-emerald-400" />
                <span className="text-sm font-semibold text-white">Sicherheitslimits</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Max. Orders pro Zyklus</label>
                  <input
                    type="number"
                    value={autopilotSettings.maxTradesPerCycle}
                    onChange={(e) => updateAutopilotSettings({ maxTradesPerCycle: Math.max(1, parseInt(e.target.value) || 1) })}
                    min={1}
                    max={10}
                    className="w-full bg-[#252542] text-white rounded-lg px-3 py-2 border border-[#353560] 
                             focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Max. Positionsgröße
                    <span className="text-emerald-400 ml-1">
                      ({totalPortfolioValue > 0 ? (totalPortfolioValue * autopilotSettings.maxPositionPercent / 100).toFixed(0) : '0'}€)
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      value={autopilotSettings.maxPositionPercent}
                      onChange={(e) => updateAutopilotSettings({ maxPositionPercent: parseInt(e.target.value) })}
                      min={5}
                      max={50}
                      step={5}
                      className="flex-1 accent-emerald-500"
                    />
                    <span className="text-white text-sm w-10 text-right">{autopilotSettings.maxPositionPercent}%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Min. Cash-Reserve
                    <span className="text-emerald-400 ml-1">
                      ({totalPortfolioValue > 0 ? (totalPortfolioValue * autopilotSettings.minCashReservePercent / 100).toFixed(0) : '0'}€)
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      value={autopilotSettings.minCashReservePercent}
                      onChange={(e) => updateAutopilotSettings({ minCashReservePercent: parseInt(e.target.value) })}
                      min={0}
                      max={50}
                      step={5}
                      className="flex-1 accent-emerald-500"
                    />
                    <span className="text-white text-sm w-10 text-right">{autopilotSettings.minCashReservePercent}%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Min. KI-Konfidenz</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      value={autopilotSettings.minConfidence}
                      onChange={(e) => updateAutopilotSettings({ minConfidence: parseInt(e.target.value) })}
                      min={30}
                      max={95}
                      step={5}
                      className="flex-1 accent-emerald-500"
                    />
                    <span className="text-white text-sm w-10 text-right">{autopilotSettings.minConfidence}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Handels-Scope */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ScrollText size={16} className="text-emerald-400" />
                <span className="text-sm font-semibold text-white">Handels-Berechtigungen</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { key: 'allowBuy', label: 'Käufe erlauben', desc: 'Neue Aktien kaufen' },
                  { key: 'allowSell', label: 'Verkäufe erlauben', desc: 'Bestehende verkaufen' },
                  { key: 'allowNewPositions', label: 'Neue Positionen', desc: 'Aktien kaufen die noch nicht im Portfolio sind' },
                  { key: 'watchlistOnly', label: 'Nur Watchlist', desc: 'Nur Watchlist + Portfolio Aktien' },
                ].map(({ key, label, desc }) => (
                  <button
                    key={key}
                    onClick={() => updateAutopilotSettings({ [key]: !autopilotSettings[key as keyof typeof autopilotSettings] })}
                    className={`p-3 rounded-lg border transition-all text-left ${
                      autopilotSettings[key as keyof typeof autopilotSettings]
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-white'
                        : 'border-[#353560] bg-[#252542] text-gray-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-3 h-3 rounded-sm border ${
                        autopilotSettings[key as keyof typeof autopilotSettings]
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-gray-500'
                      }`} />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <p className="text-xs text-gray-500 ml-5">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pending Orders - Bestätigung */}
      {pendingOrders.length > 0 && (
        <div className="bg-[#1a1a2e] rounded-xl border border-yellow-500/30 mb-6">
          <div className="flex items-center justify-between p-4 border-b border-yellow-500/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-yellow-400" />
              <span className="font-semibold text-white">Ausstehende Bestätigungen</span>
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                {pendingOrders.length}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={confirmAndActivateAll}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
              >
                <Check size={14} />
                Alle aktivieren
              </button>
              <button
                onClick={() => pendingOrders.forEach(o => cancelOrder(o.id))}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
              >
                <X size={14} />
                Alle ablehnen
              </button>
            </div>
          </div>
          <div className="divide-y divide-[#252542]">
            {pendingOrders.map(order => {
              const isBuy = order.orderType === 'limit-buy' || order.orderType === 'stop-buy';
              const totalValue = order.triggerPrice * order.quantity;
              return (
                <div key={order.id} className="p-4 flex items-center justify-between hover:bg-[#252542]/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isBuy ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                      {isBuy ? <ShoppingCart size={18} className="text-green-400" /> : <ArrowRightLeft size={18} className="text-red-400" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isBuy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {isBuy ? 'KAUF' : 'VERKAUF'}
                        </span>
                        <span className="font-semibold text-white">{order.symbol}</span>
                        <span className="text-sm text-gray-400">{order.name}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {order.quantity} Stück × {order.triggerPrice.toFixed(2)} € = <span className="text-white font-medium">{totalValue.toFixed(2)} €</span>
                      </div>
                      {order.note && (
                        <div className="text-xs text-gray-500 mt-1 max-w-lg truncate">{order.note}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => confirmAndActivateOrder(order.id)}
                      className="flex items-center gap-1 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors text-sm font-medium"
                    >
                      <Check size={16} />
                      Aktivieren
                    </button>
                    <button
                      onClick={() => cancelOrder(order.id)}
                      className="flex items-center gap-1 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors text-sm font-medium"
                    >
                      <X size={16} />
                      Ablehnen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Log */}
      <div className="bg-[#1a1a2e] rounded-xl border border-[#252542]">
        <div className="flex items-center justify-between p-4 border-b border-[#252542]">
          <div className="flex items-center gap-2">
            <ScrollText size={18} className="text-gray-400" />
            <span className="font-semibold text-white">Aktivitäts-Log</span>
            <span className="text-xs text-gray-500">({autopilotLog.length} Einträge)</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter */}
            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value as any)}
              className="bg-[#252542] text-white text-xs rounded px-2 py-1 border border-[#353560]"
            >
              <option value="all">Alle</option>
              <option value="info">Info</option>
              <option value="analysis">Analyse</option>
              <option value="order-created">Orders</option>
              <option value="warning">Warnungen</option>
              <option value="error">Fehler</option>
              <option value="skipped">Übersprungen</option>
            </select>
            {autopilotLog.length > 0 && (
              <button
                onClick={clearAutopilotLog}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 
                         bg-[#252542] px-2 py-1 rounded transition-colors"
              >
                <Trash2 size={12} />
                Leeren
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[500px] overflow-y-auto">
          {filteredLog.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Bot size={40} className="mx-auto mb-3 opacity-30" />
              <p>Noch keine Aktivitäten</p>
              <p className="text-sm mt-1">
                {autopilotSettings.enabled 
                  ? 'Der nächste Zyklus startet bald...' 
                  : 'Aktiviere den Autopilot um zu beginnen'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#252542]">
              {filteredLog.map((entry) => (
                <div
                  key={entry.id}
                  className={`px-4 py-3 border-l-2 ${LOG_COLORS[entry.type]} hover:bg-[#252542]/30 transition-colors`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <div className="mt-0.5 flex-shrink-0">{LOG_ICONS[entry.type]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">{entry.message}</p>
                        {entry.details && (
                          <button
                            onClick={() => setExpandedLogId(expandedLogId === entry.id ? null : entry.id)}
                            className="text-xs text-gray-500 hover:text-gray-300 mt-1 flex items-center gap-1"
                          >
                            {expandedLogId === entry.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            Details
                          </button>
                        )}
                        {expandedLogId === entry.id && entry.details && (
                          <p className="text-xs text-gray-400 mt-1 bg-[#252542] p-2 rounded whitespace-pre-wrap">
                            {entry.details}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      {entry.symbol && (
                        <span className="text-xs px-1.5 py-0.5 bg-[#252542] text-gray-400 rounded">
                          {entry.symbol}
                        </span>
                      )}
                      <span className="text-xs text-gray-600">
                        {new Date(entry.timestamp).toLocaleTimeString('de-DE', { 
                          hour: '2-digit', minute: '2-digit', second: '2-digit' 
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-[#1a1a2e] rounded-xl p-4 border border-[#252542]">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">ℹ️ So funktioniert der Autopilot</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-500">
          <div className="flex items-start gap-2">
            <Eye size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Nur Vorschläge:</strong> Die KI analysiert dein Portfolio regelmäßig und zeigt Empfehlungen im Log. Du entscheidest manuell.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Mit Bestätigung:</strong> Die KI erstellt Orders automatisch. Orders werden erst durch die Auto-Ausführung (Orders-Seite) aktiv.</span>
          </div>
          <div className="flex items-start gap-2">
            <Zap size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Vollautomatisch:</strong> Wie „Mit Bestätigung", zusätzlich wird Auto-Ausführung in Orders aktiviert. ⚠️ Nur mit Sicherheitslimits nutzen!</span>
          </div>
        </div>
      </div>
    </div>
  );
}
