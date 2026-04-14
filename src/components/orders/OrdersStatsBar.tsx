import { Play, Pause, Clock } from 'lucide-react';
import type { OrderSettings } from '../../types';

interface Stats {
  pending: number;
  active: number;
  executed: number;
  totalExecutedValue: number;
}

interface OrdersStatsBarProps {
  orderSettings: OrderSettings;
  stats: Stats;
  cashBalance: number;
  reservedCash: number;
  availableCash: number;
  onToggleAutoExecute: () => void;
}

export function OrdersStatsBar({
  orderSettings,
  stats,
  cashBalance,
  reservedCash,
  availableCash,
  onToggleAutoExecute,
}: OrdersStatsBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
      {/* Auto-Execute Card */}
      <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#252542]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">Auto-Ausführung</span>
          <button
            onClick={onToggleAutoExecute}
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
        {reservedCash > 0 && (
          <div className="mt-1">
            <p className="text-xs text-orange-400">
              {reservedCash.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} reserviert
            </p>
            <p className="text-xs text-gray-500">
              Frei: {availableCash.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </p>
          </div>
        )}
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
  );
}
