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
  Server,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { runAutopilotCycle } from '../services/autopilotService';
import { checkServerStatus } from '../services/syncService';
import type { AutopilotMode, AutopilotLogType } from '../types';

const MODE_CONFIG: Record<AutopilotMode, { label: string; description: string; icon: React.ReactNode; color: string }> = {
  'suggest-only': {
    label: 'Suggestions Only',
    description: 'AI analyzes and suggests, but does not create orders',
    icon: <Eye size={18} />,
    color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  },
  'confirm-each': {
    label: 'Confirm Each',
    description: 'AI creates orders that you must confirm before execution',
    icon: <CheckCircle2 size={18} />,
    color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  },
  'full-auto': {
    label: 'Full Auto',
    description: 'AI analyzes, creates and executes orders automatically',
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

  // Trigger manual cycle directly (without hook)
  const isRunningRef = useRef(false);
  const isRunning = autopilotState.isRunning;
  
  const triggerManualCycle = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    
    addAutopilotLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'info',
      message: '🔧 Manual cycle started',
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

  // Live ticker: Updates countdown every second
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!autopilotSettings.enabled) return;
    const tickInterval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(tickInterval);
  }, [autopilotSettings.enabled]);

  // Pending orders (for confirmation)
  const pendingOrders = useMemo(() => {
    return orders.filter(o => o.status === 'pending');
  }, [orders]);

  // Confirm order = activate (NOT execute immediately!)
  // Limit and stop orders should only trigger when the trigger condition is met.
  // The actual execution is handled by the useOrderExecution hook.
  const confirmAndActivateOrder = useCallback((orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending') return;
    
    // Only activate – useOrderExecution checks the trigger and executes
    useAppStore.getState().confirmOrder(orderId);
    
    addAutopilotLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'order-created',
      message: `✅ Order confirmed & activated: ${order.orderType.toUpperCase()} ${order.quantity}x ${order.symbol} @ Trigger ${order.triggerPrice.toFixed(2)}€`,
      symbol: order.symbol,
      orderId: order.id,
    });
  }, [orders, addAutopilotLog]);

  // Confirm and activate all pending orders
  const confirmAndActivateAll = useCallback(() => {
    pendingOrders.forEach(o => confirmAndActivateOrder(o.id));
  }, [pendingOrders, confirmAndActivateOrder]);

  // Total portfolio value
  const totalPortfolioValue = useMemo(() => {
    return userPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0) + cashBalance;
  }, [userPositions, cashBalance]);

  // Filtered log
  const filteredLog = useMemo(() => {
    if (logFilter === 'all') return autopilotLog;
    return autopilotLog.filter(entry => entry.type === logFilter);
  }, [autopilotLog, logFilter]);

  const handleToggleEnabled = () => {
    const newEnabled = !autopilotSettings.enabled;
    updateAutopilotSettings({ enabled: newEnabled });
    // When enabling in full-auto mode: Enable auto-execution
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
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const formatNextRun = (isoString: string | null): string => {
    if (!isoString) return '–';
    const diff = new Date(isoString).getTime() - Date.now();
    if (diff <= 0) return 'Now...';
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
          <p className="text-gray-400 mt-1 text-sm">AI-driven automated trading</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {/* Manual Cycle */}
          <button
            onClick={triggerManualCycle}
            disabled={isRunning || !autopilotSettings.enabled}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-[#252542] hover:bg-[#353560] 
                     text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <RefreshCw size={14} className={isRunning ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{isRunning ? 'Running...' : 'Analyze Now'}</span>
            <span className="sm:hidden">{isRunning ? '...' : 'Analysis'}</span>
          </button>
          {/* Main switch */}
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
                Stop Autopilot
              </>
            ) : (
              <>
                <Play size={16} />
                Start Autopilot
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
              {isRunning ? 'Analyzing...' : autopilotSettings.enabled ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        {/* Mode */}
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542]">
          <span className="text-sm text-gray-400">Mode</span>
          <p className="text-lg font-bold text-white mt-1">
            {MODE_CONFIG[autopilotSettings.mode].label}
          </p>
        </div>

        {/* Last Run */}
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542]">
          <span className="text-sm text-gray-400">Last Run</span>
          <p className="text-lg font-bold text-white mt-1">
            {formatTimeAgo(autopilotState.lastRunAt)}
          </p>
        </div>

        {/* Next Run */}
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542]">
          <span className="text-sm text-gray-400">Next Run</span>
          <p className="text-lg font-bold text-white mt-1">
            {autopilotSettings.enabled ? formatNextRun(autopilotState.nextRunAt) : '–'}
          </p>
        </div>

        {/* Cycles */}
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542]">
          <span className="text-sm text-gray-400">Cycles / Orders</span>
          <p className="text-lg font-bold text-white mt-1">
            {autopilotState.cycleCount} / {autopilotState.totalOrdersCreated}
          </p>
        </div>
      </div>

      {/* Server-Status Banner */}
      <ServerStatusBanner />

      {/* Settings Panel */}
      <div className="bg-[#1a1a2e] rounded-xl border border-[#252542] mb-6">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center justify-between p-4 text-white hover:bg-[#252542]/50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={18} className="text-gray-400" />
            <span className="font-semibold">Settings</span>
          </div>
          {showSettings ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showSettings && (
          <div className="p-4 pt-0 space-y-6">
            {/* Mode selection */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Operating Mode</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(Object.keys(MODE_CONFIG) as AutopilotMode[]).map((mode) => {
                  const config = MODE_CONFIG[mode];
                  return (
                    <button
                      key={mode}
                      onClick={() => {
                        updateAutopilotSettings({ mode });
                        // For fully automatic mode: enable auto order execution
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
                    ⚠️ In full automatic mode, the AI creates orders independently. 
                    Make sure security limits are set correctly.
                  </p>
                </div>
              )}
            </div>

            {/* Timing */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Analysis Interval</label>
                <select
                  value={autopilotSettings.intervalMinutes}
                  onChange={(e) => updateAutopilotSettings({ intervalMinutes: parseInt(e.target.value) })}
                  className="w-full bg-[#252542] text-white rounded-lg px-3 py-2 border border-[#353560] 
                           focus:border-emerald-500 focus:outline-none"
                >
                  <option value={30}>Every 30 minutes</option>
                  <option value={60}>Hourly</option>
                  <option value={120}>Every 2 hours</option>
                  <option value={240}>Every 4 hours</option>
                  <option value={480}>Every 8 hours</option>
                  <option value={1440}>Daily</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <button
                  onClick={() => updateAutopilotSettings({ activeHoursOnly: !autopilotSettings.activeHoursOnly })}
                  className={`toggle-switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    autopilotSettings.activeHoursOnly ? 'bg-emerald-500' : 'bg-gray-600'
                  }`}
                  style={{ minWidth: '2.75rem', minHeight: '1.5rem', maxWidth: '2.75rem', maxHeight: '1.5rem' }}
                >
                  <span className={`inline-block h-4 w-4 shrink-0 transform rounded-full bg-white transition-transform ${
                    autopilotSettings.activeHoursOnly ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                <div>
                  <span className="text-sm text-white">Market hours only</span>
                  <p className="text-xs text-gray-500">EU: Mon-Fri 9:00-17:30 CET · US: Mon-Fri 9:30-16:00 ET</p>
                </div>
              </div>
            </div>

            {/* Security Limits */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={16} className="text-emerald-400" />
                <span className="text-sm font-semibold text-white">Security Limits</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Max Orders per Cycle</label>
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
                    Max Position Size
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
                    Min Cash Reserve
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
                  <label className="block text-xs text-gray-400 mb-1">Min AI Confidence</label>
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

            {/* Trading Permissions */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ScrollText size={16} className="text-emerald-400" />
                <span className="text-sm font-semibold text-white">Trading Permissions</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { key: 'allowBuy', label: 'Allow Buys', desc: 'Buy new stocks' },
                  { key: 'allowSell', label: 'Allow Sells', desc: 'Sell existing holdings' },
                  { key: 'allowNewPositions', label: 'New Positions', desc: 'Buy stocks not yet in portfolio' },
                  { key: 'watchlistOnly', label: 'Watchlist Only', desc: 'Only watchlist & portfolio stocks' },
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

      {/* Pending Orders - Confirmation */}
      {pendingOrders.length > 0 && (
        <div className="bg-[#1a1a2e] rounded-xl border border-yellow-500/30 mb-6">
          <div className="flex items-center justify-between p-4 border-b border-yellow-500/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-yellow-400" />
              <span className="font-semibold text-white">Pending Confirmations</span>
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
                Activate All
              </button>
              <button
                onClick={() => pendingOrders.forEach(o => cancelOrder(o.id))}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
              >
                <X size={14} />
                Reject All
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
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>
                        <span className="font-semibold text-white">{order.symbol}</span>
                        <span className="text-sm text-gray-400">{order.name}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {order.quantity} shares × {order.triggerPrice.toFixed(2)} € = <span className="text-white font-medium">{totalValue.toFixed(2)} €</span>
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
                      Activate
                    </button>
                    <button
                      onClick={() => cancelOrder(order.id)}
                      className="flex items-center gap-1 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors text-sm font-medium"
                    >
                      <X size={16} />
                      Reject
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
            <span className="font-semibold text-white">Activity Log</span>
            <span className="text-xs text-gray-500">({autopilotLog.length} entries)</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter */}
            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value as any)}
              className="bg-[#252542] text-white text-xs rounded px-2 py-1 border border-[#353560]"
            >
              <option value="all">All</option>
              <option value="info">Info</option>
              <option value="analysis">Analysis</option>
              <option value="order-created">Orders</option>
              <option value="warning">Warnings</option>
              <option value="error">Errors</option>
              <option value="skipped">Skipped</option>
            </select>
            {autopilotLog.length > 0 && (
              <button
                onClick={clearAutopilotLog}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 
                         bg-[#252542] px-2 py-1 rounded transition-colors"
              >
                <Trash2 size={12} />
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[500px] overflow-y-auto">
          {filteredLog.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Bot size={40} className="mx-auto mb-3 opacity-30" />
              <p>No Activity Yet</p>
              <p className="text-sm mt-1">
                {autopilotSettings.enabled 
                  ? 'Next cycle starts soon...' 
                  : 'Enable Autopilot to begin'}
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
                        {new Date(entry.timestamp).toLocaleString('en-US', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
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
        <h3 className="text-sm font-semibold text-gray-300 mb-2">ℹ️ How the Autopilot Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-500">
          <div className="flex items-start gap-2">
            <Eye size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Suggestions Only:</strong> AI analyzes your portfolio regularly and shows recommendations in the log. You decide manually.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">With Confirmation:</strong> AI creates orders automatically. Orders only become active through auto-execution (Orders page).</span>
          </div>
          <div className="flex items-start gap-2">
            <Zap size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <span><strong className="text-gray-400">Fully Automatic:</strong> Like "With Confirmation", additionally auto-execution in Orders is enabled. ⚠️ Only use with security limits!</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServerStatusBanner() {
  const [connected, setConnected] = useState(false);
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    const check = async () => {
      const status = await checkServerStatus();
      setConnected(status.running);
      setInfo(status);
    };
    check();
    const interval = setInterval(check, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (connected) {
    return (
      <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3">
        <div className="p-2 bg-emerald-500/20 rounded-lg">
          <Server size={20} className="text-emerald-400" />
        </div>
        <div className="flex-1">
          <p className="text-emerald-300 font-medium text-sm">Backend Server Connected</p>
          <p className="text-emerald-400/70 text-xs mt-0.5">
            Autopilot & order execution run in the background without browser.
            {info?.activeOrders > 0 && ` ${info.activeOrders} active orders are monitored.`}
          </p>
        </div>
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
      </div>
    );
  }

  return null;
}
