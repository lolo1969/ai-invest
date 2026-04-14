import { useState } from 'react';
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  Edit3,
  Check,
  X,
  ShoppingCart,
  ArrowRightLeft,
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { UserPosition, OrderSettings } from '../../types';

interface PositionsTableProps {
  positions: UserPosition[];
  yahooPrices: Record<string, number>;
  loadingYahooPrices: boolean;
  totalCurrentValue: number;
  tradeAction: { positionId: string; type: 'buy' | 'sell' } | null;
  tradeQuantity: string;
  tradePrice: string;
  setTradeAction: (action: { positionId: string; type: 'buy' | 'sell' } | null) => void;
  setTradeQuantity: (q: string) => void;
  setTradePrice: (p: string) => void;
  executeTrade: (posId: string, type: 'buy' | 'sell', qty: number, price?: number) => void;
  orderSettings: OrderSettings;
  getProfitLoss: (p: UserPosition) => { absolute: number; percent: number };
}

export function PositionsTable({
  positions,
  yahooPrices,
  loadingYahooPrices,
  totalCurrentValue,
  tradeAction,
  tradeQuantity,
  tradePrice,
  setTradeAction,
  setTradeQuantity,
  setTradePrice,
  executeTrade,
  orderSettings,
  getProfitLoss,
}: PositionsTableProps) {
  const { updateUserPosition } = useAppStore();

  const [editingPosition, setEditingPosition] = useState<string | null>(null);
  const [editSymbol, setEditSymbol] = useState('');
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');
  const [editingBuyPrice, setEditingBuyPrice] = useState<string | null>(null);
  const [editBuyPriceValue, setEditBuyPriceValue] = useState('');

  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-[#252542] overflow-hidden">
      <div className="p-4 md:p-6 border-b border-[#252542]">
        <h2 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
          <Briefcase size={18} className="text-indigo-500" />
          Meine Positionen
        </h2>
      </div>

      {positions.length === 0 ? (
        <div className="p-12 text-center">
          <Briefcase size={48} className="mx-auto text-gray-500 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Noch keine Positionen</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            Füge deine aktuellen Aktien hinzu, um eine KI-Analyse zu erhalten.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm bg-[#252542]/50">
                <th className="px-6 py-4">Symbol / ISIN</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4 text-right">Anzahl</th>
                <th className="px-6 py-4 text-right">Kaufpreis</th>
                <th className="px-6 py-4 text-right">Aktuell</th>
                <th className="px-6 py-4 text-right">Wert</th>
                <th className="px-6 py-4 text-right">G/V</th>
                <th className="px-6 py-4 text-center">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {[...positions]
                .sort((a, b) => (b.quantity * b.currentPrice) - (a.quantity * a.currentPrice))
                .map((position) => {
                const pl = getProfitLoss(position);
                return (
                  <tr
                    key={position.id}
                    className="border-b border-[#252542] hover:bg-[#252542]/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      {editingPosition === position.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editSymbol}
                            onChange={(e) => setEditSymbol(e.target.value.toUpperCase())}
                            placeholder="z.B. SAP.DE"
                            className="w-24 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm"
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              updateUserPosition(position.id, { symbol: editSymbol });
                              setEditingPosition(null);
                            }}
                            className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingPosition(null)}
                            className="p-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-500"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-bold text-white">
                              {position.symbol || '-'}
                            </span>
                            {position.isin && (
                              <span className="block text-xs text-gray-500 font-mono mt-0.5">
                                {position.isin}
                              </span>
                            )}
                            <span className="block text-xs text-yellow-500 mt-0.5" title="Yahoo Finance Preis">
                              {loadingYahooPrices ? 'Lade Yahoo...' :
                               yahooPrices[position.id] !== undefined ?
                                 `Yahoo: ${yahooPrices[position.id].toFixed(2)} EUR` :
                                 'Yahoo: nicht verfügbar'}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setEditSymbol(position.symbol || '');
                              setEditingPosition(position.id);
                            }}
                            className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                            title="Symbol bearbeiten"
                          >
                            <Edit3 size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-300">{position.name}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-white">{position.quantity}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {editingBuyPrice === position.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editBuyPriceValue}
                            onChange={(e) => setEditBuyPriceValue(e.target.value)}
                            className="w-20 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-right"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const newBuyPrice = parseFloat(editBuyPriceValue);
                                if (newBuyPrice > 0) {
                                  updateUserPosition(position.id, { buyPrice: newBuyPrice });
                                }
                                setEditingBuyPrice(null);
                              }
                            }}
                          />
                          <button
                            onClick={() => {
                              const newBuyPrice = parseFloat(editBuyPriceValue);
                              if (newBuyPrice > 0) {
                                updateUserPosition(position.id, { buyPrice: newBuyPrice });
                              }
                              setEditingBuyPrice(null);
                            }}
                            className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingBuyPrice(null)}
                            className="p-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-500"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-gray-400">{position.buyPrice.toFixed(2)} {position.currency}</span>
                          <button
                            onClick={() => {
                              setEditBuyPriceValue(position.buyPrice.toString());
                              setEditingBuyPrice(position.id);
                            }}
                            className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                            title="Kaufpreis bearbeiten"
                          >
                            <Edit3 size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {editingPrice === position.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={editPriceValue}
                            onChange={(e) => setEditPriceValue(e.target.value)}
                            className="w-20 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-right"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const newPrice = parseFloat(editPriceValue);
                                if (newPrice > 0) {
                                  console.log('Saving new price:', newPrice, 'for position:', position.id);
                                  updateUserPosition(position.id, { currentPrice: newPrice });
                                }
                                setEditingPrice(null);
                              }
                            }}
                          />
                          <button
                            onClick={() => {
                              const newPrice = parseFloat(editPriceValue);
                              console.log('Button clicked. New price:', newPrice, 'for position:', position.id);
                              if (newPrice > 0) {
                                updateUserPosition(position.id, { currentPrice: newPrice });
                              }
                              setEditingPrice(null);
                            }}
                            className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingPrice(null)}
                            className="p-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-500"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <div className="text-right">
                            <span className="text-white font-medium">
                              {position.currentPrice.toFixed(2)} {position.currency}
                            </span>
                            {yahooPrices[position.id] !== undefined && (
                              <span className="block text-xs text-yellow-500 mt-0.5">
                                Yahoo: {yahooPrices[position.id].toFixed(2)} EUR
                              </span>
                            )}
                            {loadingYahooPrices && yahooPrices[position.id] === undefined && (
                              <span className="block text-xs text-gray-500 mt-0.5 animate-pulse">
                                Lade...
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => {
                                setEditPriceValue(position.currentPrice.toString());
                                setEditingPrice(position.id);
                              }}
                              className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                              title="Preis bearbeiten"
                            >
                              <Edit3 size={12} />
                            </button>
                            {yahooPrices[position.id] !== undefined && (
                              <button
                                onClick={() => {
                                  updateUserPosition(position.id, {
                                    currentPrice: yahooPrices[position.id],
                                    useYahooPrice: !position.useYahooPrice
                                  });
                                }}
                                className={`p-1 rounded text-xs ${
                                  position.useYahooPrice
                                    ? 'bg-yellow-500/30 text-yellow-400'
                                    : 'hover:bg-[#252542] text-gray-500 hover:text-yellow-400'
                                }`}
                                title={position.useYahooPrice ? 'Yahoo Live-Preis aktiv' : 'Yahoo-Preis übernehmen'}
                              >
                                <RefreshCw size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-white font-medium">
                        {(position.quantity * position.currentPrice).toFixed(2)} {position.currency}
                      </div>
                      <div className="text-xs text-gray-400">
                        {totalCurrentValue > 0 ? ((position.quantity * position.currentPrice) / totalCurrentValue * 100).toFixed(1) : '0.0'}%
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className={`font-medium ${pl.absolute >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        <div className="flex items-center justify-end gap-1">
                          {pl.absolute >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                          {pl.absolute >= 0 ? '+' : ''}{pl.absolute.toFixed(2)} {position.currency}
                        </div>
                        <div className="text-xs">
                          ({pl.percent >= 0 ? '+' : ''}{pl.percent.toFixed(2)}%)
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {tradeAction?.positionId === position.id ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="text-xs font-medium text-gray-300">
                            {tradeAction.type === 'buy' ? '📈 Nachkaufen' : '📉 Verkaufen'}
                          </div>
                          {tradeAction.type === 'buy' ? (
                            <>
                              <div className="text-xs text-gray-500">
                                Marktpreis: {(yahooPrices[position.id] ?? position.currentPrice).toFixed(2)} €
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={tradePrice}
                                onChange={(e) => setTradePrice(e.target.value)}
                                placeholder="Kaufpreis"
                                className="w-24 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-center"
                                autoFocus
                              />
                              <input
                                type="number"
                                step="1"
                                min="1"
                                value={tradeQuantity}
                                onChange={(e) => setTradeQuantity(e.target.value)}
                                placeholder="Anzahl"
                                className="w-20 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-center"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const qty = parseFloat(tradeQuantity);
                                    const price = parseFloat(tradePrice) || undefined;
                                    if (qty > 0) executeTrade(position.id, tradeAction.type, qty, price);
                                  }
                                  if (e.key === 'Escape') { setTradeAction(null); setTradeQuantity(''); setTradePrice(''); }
                                }}
                              />
                            </>
                          ) : (
                            <>
                              <div className="text-xs text-gray-500">
                                Marktpreis: {(yahooPrices[position.id] ?? position.currentPrice).toFixed(2)} €
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={tradePrice}
                                onChange={(e) => setTradePrice(e.target.value)}
                                placeholder="Verkaufspreis"
                                className="w-24 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-center"
                                autoFocus
                              />
                              <input
                                type="number"
                                step="1"
                                min="1"
                                max={position.quantity}
                                value={tradeQuantity}
                                onChange={(e) => setTradeQuantity(e.target.value)}
                                placeholder="Anzahl"
                                className="w-20 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-center"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const qty = parseFloat(tradeQuantity);
                                    const price = parseFloat(tradePrice) || undefined;
                                    if (qty > 0) executeTrade(position.id, tradeAction.type, qty, price);
                                  }
                                  if (e.key === 'Escape') { setTradeAction(null); setTradeQuantity(''); setTradePrice(''); }
                                }}
                              />
                            </>
                          )}
                          {tradeQuantity && parseFloat(tradeQuantity) > 0 && (() => {
                            const qty = parseFloat(tradeQuantity);
                            const effectivePrice = (tradePrice && parseFloat(tradePrice) > 0)
                              ? parseFloat(tradePrice)
                              : (yahooPrices[position.id] ?? position.currentPrice);
                            const tradeTotal = qty * effectivePrice;
                            const tradeFee = (orderSettings.transactionFeeFlat || 0) + tradeTotal * (orderSettings.transactionFeePercent || 0) / 100;
                            return (
                              <div className="text-xs text-gray-400">
                                = {tradeTotal.toFixed(2)} €
                                {tradeFee > 0 && (
                                  <span className="text-yellow-400 ml-1">(+{tradeFee.toFixed(2)} € Geb.)</span>
                                )}
                              </div>
                            );
                          })()}
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                const qty = parseFloat(tradeQuantity);
                                const price = parseFloat(tradePrice) || undefined;
                                if (qty > 0) executeTrade(position.id, tradeAction.type, qty, price);
                              }}
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                tradeAction.type === 'buy'
                                  ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                                  : 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                              }`}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => { setTradeAction(null); setTradeQuantity(''); setTradePrice(''); }}
                              className="px-2 py-1 bg-gray-500/20 hover:bg-gray-500/30 rounded text-gray-400 text-xs"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => { setTradeAction({ positionId: position.id, type: 'buy' }); setTradeQuantity(''); setTradePrice((yahooPrices[position.id] ?? position.currentPrice).toFixed(2)); }}
                            className="p-1.5 hover:bg-green-500/20 text-green-500 rounded-lg transition-colors"
                            title="Nachkaufen"
                          >
                            <ShoppingCart size={16} />
                          </button>
                          <button
                            onClick={() => { setTradeAction({ positionId: position.id, type: 'sell' }); setTradeQuantity(position.quantity.toString()); setTradePrice((yahooPrices[position.id] ?? position.currentPrice).toFixed(2)); }}
                            className="p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                            title="Verkaufen"
                          >
                            <ArrowRightLeft size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
