import { RefreshCw, X } from 'lucide-react';
import type { SymbolSuggestion } from './portfolioTypes';

interface FormData {
  symbol: string;
  isin: string;
  name: string;
  quantity: string;
  buyPrice: string;
  currentPrice: string;
  currency: string;
}

interface AddPositionModalProps {
  onClose: () => void;
  formData: FormData;
  setFormData: (data: FormData) => void;
  onSubmit: () => Promise<void>;
  addingPosition: boolean;
  symbolSuggestions: SymbolSuggestion[];
  searchingSymbol: boolean;
  showSuggestions: boolean;
  setShowSuggestions: (b: boolean) => void;
  onSymbolSearch: (v: string) => void;
  onSelectSuggestion: (s: SymbolSuggestion) => void;
}

export function AddPositionModal({
  onClose,
  formData,
  setFormData,
  onSubmit,
  addingPosition,
  symbolSuggestions,
  searchingSymbol,
  showSuggestions,
  setShowSuggestions,
  onSymbolSearch,
  onSelectSuggestion,
}: AddPositionModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-md border border-[#252542]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Position hinzufügen</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#252542] rounded"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Symbol
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.symbol}
                  onChange={(e) => onSymbolSearch(e.target.value)}
                  onFocus={() => { if (symbolSuggestions.length > 0) setShowSuggestions(true); }}
                  placeholder="z.B. AAPL, MSFT"
                  autoComplete="off"
                  className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg
                           text-white focus:outline-none focus:border-indigo-500"
                />
                {searchingSymbol && (
                  <RefreshCw size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" />
                )}
              </div>
              {/* Symbol Suggestions Dropdown */}
              {showSuggestions && symbolSuggestions.length > 0 && (
                <div className="absolute z-[60] left-0 right-0 mt-1 bg-[#1e1e3a] border border-[#3a3a5a] rounded-lg shadow-xl overflow-hidden"
                     style={{ width: 'calc(200% + 1rem)' }}>
                  {symbolSuggestions.map((s) => (
                    <button
                      key={s.symbol}
                      type="button"
                      onClick={() => onSelectSuggestion(s)}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[#252542]
                               transition-colors text-left border-b border-[#252542] last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-white text-sm">{s.symbol}</span>
                        <span className="text-gray-400 text-xs ml-2 truncate">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        {s.loading ? (
                          <RefreshCw size={12} className="text-gray-500 animate-spin" />
                        ) : s.price !== undefined && !isNaN(s.price) ? (
                          <>
                            <span className="text-white font-medium text-sm">{s.price.toFixed(2)} €</span>
                            {s.changePercent !== undefined && !isNaN(s.changePercent) && (
                              <span className={`text-xs font-medium ${s.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-500 text-xs">—</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                ISIN
              </label>
              <input
                type="text"
                value={formData.isin}
                onChange={(e) => setFormData({ ...formData, isin: e.target.value })}
                placeholder="z.B. US0378331005"
                className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg
                         text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">Gib Symbol ODER ISIN ein (eines reicht) – Vorschläge erscheinen beim Tippen</p>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="z.B. Apple Inc."
              className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg
                       text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Anzahl Aktien *
            </label>
            <input
              type="number"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              placeholder="z.B. 10"
              step="0.001"
              className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg
                       text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Kaufpreis <span className="text-gray-500 text-xs">(optional)</span>
              </label>
              <input
                type="number"
                value={formData.buyPrice}
                onChange={(e) => setFormData({ ...formData, buyPrice: e.target.value })}
                placeholder="150.00"
                step="0.01"
                className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg
                         text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Aktueller Preis *
              </label>
              <input
                type="number"
                value={formData.currentPrice}
                onChange={(e) => setFormData({ ...formData, currentPrice: e.target.value })}
                placeholder="178.50"
                step="0.01"
                className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg
                         text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Währung
            </label>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg
                       text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>

          <button
            onClick={onSubmit}
            disabled={addingPosition || ((!formData.symbol && !formData.isin) || !formData.quantity || !formData.currentPrice)}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50
                     text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {addingPosition ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Preis wird ermittelt...</>
            ) : (
              'Position hinzufügen'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
