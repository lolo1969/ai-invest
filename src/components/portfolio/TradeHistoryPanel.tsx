import { useState } from 'react';
import { ArrowRightLeft, Check, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function TradeHistoryPanel() {
  const { tradeHistory, clearTradeHistory } = useAppStore();
  const [showAll, setShowAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  if (tradeHistory.length === 0) return null;

  const displayedTrades = showAll ? tradeHistory : tradeHistory.slice(0, 10);

  return (
    <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-gray-700/30 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <ArrowRightLeft size={18} className="text-purple-400" />
          Trade-Historie
          <span className="text-xs text-gray-500 font-normal">({tradeHistory.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {confirmClear ? (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-red-400">Alles löschen?</span>
              <button
                onClick={() => { clearTradeHistory(); setConfirmClear(false); }}
                className="p-1 text-red-400 hover:bg-red-500/20 rounded"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="p-1 text-gray-400 hover:bg-gray-500/20 rounded"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10"
              title="Historie löschen"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700/50">
              <th className="text-left py-2 px-2 font-medium">Datum</th>
              <th className="text-center py-2 px-2 font-medium">Typ</th>
              <th className="text-left py-2 px-2 font-medium">Symbol</th>
              <th className="text-right py-2 px-2 font-medium">Stück</th>
              <th className="text-right py-2 px-2 font-medium">Preis</th>
              <th className="text-right py-2 px-2 font-medium">Gesamt</th>
              <th className="text-right py-2 px-2 font-medium">Gebühren</th>
              <th className="text-center py-2 px-2 font-medium">Quelle</th>
            </tr>
          </thead>
          <tbody>
            {displayedTrades.map(trade => (
              <tr key={trade.id} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                <td className="py-2 px-2 text-gray-300 text-xs">
                  {new Date(trade.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="text-center py-2 px-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    trade.type === 'buy'
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}>
                    {trade.type === 'buy' ? '↑ Kauf' : '↓ Verkauf'}
                  </span>
                </td>
                <td className="py-2 px-2">
                  <span className="text-white font-medium">{trade.symbol}</span>
                  {trade.name !== trade.symbol && (
                    <span className="text-gray-500 text-xs block">{trade.name}</span>
                  )}
                </td>
                <td className="text-right py-2 px-2 text-gray-300">{trade.quantity}</td>
                <td className="text-right py-2 px-2 text-gray-300">
                  {trade.price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </td>
                <td className="text-right py-2 px-2">
                  <span className={trade.type === 'buy' ? 'text-red-300' : 'text-green-300'}>
                    {trade.type === 'buy' ? '-' : '+'}{trade.totalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </span>
                </td>
                <td className="text-right py-2 px-2 text-gray-500 text-xs">
                  {trade.fees > 0 ? `-${trade.fees.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '–'}
                </td>
                <td className="text-center py-2 px-2">
                  <span className={`text-xs ${trade.source === 'order' ? 'text-blue-400' : 'text-gray-500'}`}>
                    {trade.source === 'order' ? 'Order' : 'Manuell'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tradeHistory.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/30 rounded-lg transition"
        >
          {showAll ? 'Weniger anzeigen' : `Alle ${tradeHistory.length} Trades anzeigen`}
        </button>
      )}
    </div>
  );
}
