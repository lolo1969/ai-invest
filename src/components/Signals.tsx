import { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  Clock,
  Target,
  Shield,
  DollarSign
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { InvestmentSignal } from '../types';

export function Signals() {
  const { signals, clearSignals } = useAppStore();
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'HOLD'>('ALL');

  const buySignals = signals.filter(s => s.signal === 'BUY');
  const sellSignals = signals.filter(s => s.signal === 'SELL');
  const holdSignals = signals.filter(s => s.signal === 'HOLD');

  // Gefilterte Signale
  const filteredSignals = filter === 'ALL' 
    ? signals 
    : signals.filter(s => s.signal === filter);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-12 lg:pt-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Investment Signale</h1>
          <p className="text-sm text-gray-400">KI-generierte Kauf- und Verkaufsempfehlungen</p>
        </div>
        {signals.length > 0 && (
          <button
            onClick={clearSignals}
            className="px-4 py-2 bg-[#252542] hover:bg-[#3a3a5a] text-gray-300 
                     rounded-lg transition-colors"
          >
            Signale löschen
          </button>
        )}
      </div>

      {/* Signal Stats - Klickbar zum Filtern */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <button
          onClick={() => setFilter(filter === 'BUY' ? 'ALL' : 'BUY')}
          className={`bg-green-500/20 border rounded-xl p-4 flex items-center gap-4 transition-all
                     ${filter === 'BUY' ? 'border-green-500 ring-2 ring-green-500/50' : 'border-green-500/30 hover:border-green-500/60'}`}
        >
          <div className="p-3 bg-green-500/20 rounded-lg">
            <TrendingUp size={24} className="text-green-500" />
          </div>
          <div className="text-left">
            <p className="text-green-400 text-sm">Kaufsignale</p>
            <p className="text-2xl font-bold text-white">{buySignals.length}</p>
          </div>
        </button>

        <button
          onClick={() => setFilter(filter === 'SELL' ? 'ALL' : 'SELL')}
          className={`bg-red-500/20 border rounded-xl p-4 flex items-center gap-4 transition-all
                     ${filter === 'SELL' ? 'border-red-500 ring-2 ring-red-500/50' : 'border-red-500/30 hover:border-red-500/60'}`}
        >
          <div className="p-3 bg-red-500/20 rounded-lg">
            <TrendingDown size={24} className="text-red-500" />
          </div>
          <div className="text-left">
            <p className="text-red-400 text-sm">Verkaufssignale</p>
            <p className="text-2xl font-bold text-white">{sellSignals.length}</p>
          </div>
        </button>

        <button
          onClick={() => setFilter(filter === 'HOLD' ? 'ALL' : 'HOLD')}
          className={`bg-yellow-500/20 border rounded-xl p-4 flex items-center gap-4 transition-all
                     ${filter === 'HOLD' ? 'border-yellow-500 ring-2 ring-yellow-500/50' : 'border-yellow-500/30 hover:border-yellow-500/60'}`}
        >
          <div className="p-3 bg-yellow-500/20 rounded-lg">
            <Minus size={24} className="text-yellow-500" />
          </div>
          <div className="text-left">
            <p className="text-yellow-400 text-sm">Halten</p>
            <p className="text-2xl font-bold text-white">{holdSignals.length}</p>
          </div>
        </button>
      </div>

      {/* Filter-Anzeige */}
      {filter !== 'ALL' && (
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Filter aktiv:</span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium
            ${filter === 'BUY' ? 'bg-green-500/20 text-green-400' : ''}
            ${filter === 'SELL' ? 'bg-red-500/20 text-red-400' : ''}
            ${filter === 'HOLD' ? 'bg-yellow-500/20 text-yellow-400' : ''}`}>
            {filter === 'BUY' ? 'Kaufen' : filter === 'SELL' ? 'Verkaufen' : 'Halten'}
          </span>
          <button
            onClick={() => setFilter('ALL')}
            className="text-gray-500 hover:text-white text-sm underline"
          >
            Filter zurücksetzen
          </button>
        </div>
      )}

      {/* Signals List */}
      {signals.length === 0 ? (
        <div className="bg-[#1a1a2e] rounded-xl p-12 border border-[#252542] text-center">
          <AlertTriangle size={48} className="mx-auto text-gray-500 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Keine Signale vorhanden</h3>
          <p className="text-gray-400">
            Starte eine KI-Analyse im Dashboard, um Investment-Signale zu erhalten.
          </p>
        </div>
      ) : filteredSignals.length === 0 ? (
        <div className="bg-[#1a1a2e] rounded-xl p-12 border border-[#252542] text-center">
          <AlertTriangle size={48} className="mx-auto text-gray-500 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Keine Signale für diesen Filter</h3>
          <p className="text-gray-400">
            Es gibt keine {filter === 'BUY' ? 'Kauf' : filter === 'SELL' ? 'Verkauf' : 'Halten'}-Signale.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSignals.map((signal) => (
            <SignalDetailCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}

function SignalDetailCard({ signal }: { signal: InvestmentSignal }) {
  const signalConfig = {
    BUY: {
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      icon: <TrendingUp size={24} className="text-green-500" />,
      badge: 'bg-green-500 text-white',
      label: 'KAUFEN',
    },
    SELL: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      icon: <TrendingDown size={24} className="text-red-500" />,
      badge: 'bg-red-500 text-white',
      label: 'VERKAUFEN',
    },
    HOLD: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      icon: <Minus size={24} className="text-yellow-500" />,
      badge: 'bg-yellow-500 text-black',
      label: 'HALTEN',
    },
  };

  const config = signalConfig[signal.signal];
  const riskColors = {
    low: 'text-green-400',
    medium: 'text-yellow-400',
    high: 'text-red-400',
  };

  return (
    <div className={`${config.bg} ${config.border} border rounded-xl p-4 md:p-6`}>
      <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
        {/* Icon & Badge */}
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#1a1a2e] rounded-lg">
            {config.icon}
          </div>
          <div className="md:hidden">
            <span className={`${config.badge} px-3 py-1 rounded-full text-sm font-bold`}>
              {config.label}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="flex items-center gap-2 md:gap-3 mb-2 flex-wrap">
            <h3 className="text-lg md:text-xl font-bold text-white">{signal.stock.symbol}</h3>
            <span className="text-gray-400 text-sm">{signal.stock.name}</span>
            <span className={`hidden md:inline ${config.badge} px-3 py-1 rounded-full text-sm font-bold`}>
              {config.label}
            </span>
          </div>

          <p className="text-gray-300 mb-3 md:mb-4 text-sm md:text-base">{signal.reasoning}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 text-xs md:text-sm">
            <div>
              <p className="text-gray-500 flex items-center gap-1">
                <Target size={14} /> Aktueller Preis
              </p>
              <p className="text-white font-medium">
                {signal.stock.price.toFixed(2)} {signal.stock.currency}
              </p>
            </div>

            {signal.targetPrice && (
              <div>
                <p className="text-gray-500 flex items-center gap-1">
                  <Target size={14} /> Zielpreis
                </p>
                <p className="text-green-400 font-medium">
                  {signal.targetPrice.toFixed(2)} {signal.stock.currency}
                </p>
              </div>
            )}

            {signal.idealEntryPrice && (
              <div>
                <p className="text-gray-500 flex items-center gap-1">
                  <DollarSign size={14} /> Idealer Einstieg
                </p>
                <p className="text-blue-400 font-medium">
                  {signal.idealEntryPrice.toFixed(2)} {signal.stock.currency}
                </p>
              </div>
            )}

            {signal.stopLoss && (
              <div>
                <p className="text-gray-500 flex items-center gap-1">
                  <Shield size={14} /> Stop-Loss
                </p>
                <p className="text-red-400 font-medium">
                  {signal.stopLoss.toFixed(2)} {signal.stock.currency}
                </p>
              </div>
            )}

            <div>
              <p className="text-gray-500 flex items-center gap-1">
                <Shield size={14} /> Risiko
              </p>
              <p className={`font-medium ${riskColors[signal.riskLevel]}`}>
                {signal.riskLevel === 'low' && 'Niedrig'}
                {signal.riskLevel === 'medium' && 'Mittel'}
                {signal.riskLevel === 'high' && 'Hoch'}
              </p>
            </div>
          </div>
        </div>

        {/* Confidence */}
        <div className="flex flex-col items-center">
          <div className="relative w-16 h-16">
            <svg className="w-16 h-16 transform -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="#252542"
                strokeWidth="4"
                fill="none"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke={signal.confidence >= 70 ? '#22c55e' : signal.confidence >= 40 ? '#eab308' : '#ef4444'}
                strokeWidth="4"
                fill="none"
                strokeDasharray={`${(signal.confidence / 100) * 176} 176`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-white font-bold">
              {signal.confidence}%
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Konfidenz</p>
        </div>
      </div>

      {/* Timestamp */}
      <div className="mt-4 pt-4 border-t border-[#252542] flex items-center gap-2 text-xs text-gray-500">
        <Clock size={12} />
        {new Date(signal.createdAt).toLocaleString('de-DE')}
      </div>
    </div>
  );
}
