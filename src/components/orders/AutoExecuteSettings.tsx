import { Zap, RefreshCw } from 'lucide-react';
import { marketDataService } from '../../services/marketData';
import { useAppStore } from '../../store/useAppStore';
import type { OrderSettings, Order } from '../../types';

interface AutoExecuteSettingsProps {
  orderSettings: OrderSettings;
  activeOrders: Order[];
  onUpdate: (settings: Partial<OrderSettings>) => void;
}

export function AutoExecuteSettings({
  orderSettings,
  activeOrders,
  onUpdate,
}: AutoExecuteSettingsProps) {
  const { updateOrderPrice } = useAppStore();

  const handleManualCheck = async () => {
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
  };

  return (
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
              onChange={(e) => onUpdate({ checkIntervalSeconds: parseInt(e.target.value) })}
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
            onClick={handleManualCheck}
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
  );
}
