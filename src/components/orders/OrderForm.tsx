import { Plus, RefreshCw } from 'lucide-react';
import { ORDER_TYPE_LABELS, ORDER_TYPE_DESCRIPTIONS, ORDER_TYPE_ICONS } from './orderConstants';
import type { OrderType } from '../../types';

interface FormData {
  symbol: string;
  name: string;
  orderType: OrderType;
  quantity: string;
  triggerPrice: string;
  expiresAt: string;
  note: string;
}

interface QuickSelectOption {
  symbol: string;
  name: string;
  quantity: number;
  currentPrice: number;
  source: 'portfolio' | 'watchlist';
}

interface OrderFormProps {
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  onSubmit: () => void;
  onCancel: () => void;
  searchingSymbol: boolean;
  symbolSuggestions: { symbol: string; name: string }[];
  onSymbolSearch: (v: string) => void;
  onSelectSymbol: (s: string, n: string) => void;
  quickSelectOptions: QuickSelectOption[];
  maxSellQuantity: number;
  isSellOrder: boolean;
}

export function OrderForm({
  formData,
  setFormData,
  onSubmit,
  onCancel,
  searchingSymbol,
  symbolSuggestions,
  onSymbolSearch,
  onSelectSymbol,
  quickSelectOptions,
  maxSellQuantity,
  isSellOrder,
}: OrderFormProps) {
  return (
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
            onChange={(e) => onSymbolSearch(e.target.value)}
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
                  onClick={() => onSelectSymbol(s.symbol, s.name)}
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
                        onClick={() => onSelectSymbol(p.symbol, p.name)}
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
                        onClick={() => onSelectSymbol(s.symbol, s.name)}
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
          onClick={onCancel}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Abbrechen
        </button>
        <button
          onClick={onSubmit}
          disabled={!formData.symbol || !formData.quantity || !formData.triggerPrice}
          className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700
                   text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={16} />
          Order erstellen
        </button>
      </div>
    </div>
  );
}
