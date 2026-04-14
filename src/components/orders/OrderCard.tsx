import { Check, X, Play, Clock, Trash2 } from 'lucide-react';
import { ORDER_TYPE_LABELS, ORDER_TYPE_ICONS, STATUS_COLORS, STATUS_LABELS } from './orderConstants';
import type { Order } from '../../types';

interface OrderCardProps {
  order: Order;
  manualExecuteId: string | null;
  onManualExecute: (id: string) => void;
  onCancelOrder: (id: string) => void;
  onRemoveOrder: (id: string) => void;
  onSetManualExecuteId: (id: string | null) => void;
}

export function OrderCard({
  order,
  manualExecuteId,
  onManualExecute,
  onCancelOrder,
  onRemoveOrder,
  onSetManualExecuteId,
}: OrderCardProps) {
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
        const maxRange = order.currentPrice * 0.1;
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
                    onClick={() => onManualExecute(order.id)}
                    className="p-1.5 text-green-400 hover:bg-green-400/10 rounded"
                    title="Bestätigen"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => onSetManualExecuteId(null)}
                    className="p-1.5 text-gray-400 hover:bg-gray-400/10 rounded"
                    title="Abbrechen"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onSetManualExecuteId(order.id)}
                  className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded"
                  title="Sofort ausführen"
                >
                  <Play size={16} />
                </button>
              )}
              {/* Stornieren */}
              <button
                onClick={() => onCancelOrder(order.id)}
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
              onClick={() => onRemoveOrder(order.id)}
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
}
