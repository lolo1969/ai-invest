import { useState, useEffect } from 'react';
import { 
  Bell, 
  Plus, 
  Trash2, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  Check,
  X
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { marketDataService } from '../services/marketData';
import { notificationService } from '../services/notifications';
import type { PriceAlert, AlertCondition } from '../types';

export function PriceAlerts() {
  const { 
    priceAlerts, 
    addPriceAlert, 
    removePriceAlert, 
    triggerPriceAlert,
    watchlist,
    settings 
  } = useAppStore();
  
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    symbol: '',
    targetPrice: '',
    condition: 'below' as AlertCondition,
  });

  // Check alerts against current prices
  useEffect(() => {
    const checkAlerts = async () => {
      const untriggeredAlerts = priceAlerts.filter(a => !a.triggered);
      if (untriggeredAlerts.length === 0) return;

      for (const alert of untriggeredAlerts) {
        try {
          const quote = await marketDataService.getQuote(alert.symbol);
          if (!quote) continue;

          const shouldTrigger = alert.condition === 'above'
            ? quote.price >= alert.targetPrice
            : quote.price <= alert.targetPrice;

          if (shouldTrigger) {
            triggerPriceAlert(alert.id);
            
            // Send notification
            const message = `🔔 Preisalarm: ${alert.symbol} ist jetzt bei ${quote.price.toFixed(2)} EUR (${alert.condition === 'above' ? 'über' : 'unter'} ${alert.targetPrice.toFixed(2)} EUR)`;
            
            if (settings.notifications.telegram.enabled) {
              await notificationService.sendTelegramMessage(
                settings.notifications.telegram.botToken,
                settings.notifications.telegram.chatId,
                message
              );
            }
          }
        } catch (error) {
          console.error(`Failed to check alert for ${alert.symbol}:`, error);
        }
      }
    };

    checkAlerts();
    const interval = setInterval(checkAlerts, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [priceAlerts, settings.notifications.telegram, triggerPriceAlert]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.symbol || !formData.targetPrice) return;

    const stock = watchlist.find(s => s.symbol === formData.symbol);
    
    const newAlert: PriceAlert = {
      id: `alert-${Date.now()}`,
      symbol: formData.symbol.toUpperCase(),
      name: stock?.name || formData.symbol.toUpperCase(),
      targetPrice: parseFloat(formData.targetPrice),
      condition: formData.condition,
      currentPrice: stock?.price || 0,
      createdAt: new Date(),
      triggered: false,
    };

    addPriceAlert(newAlert);
    setFormData({ symbol: '', targetPrice: '', condition: 'below' });
    setShowForm(false);
  };

  const activeAlerts = priceAlerts.filter(a => !a.triggered);
  const triggeredAlerts = priceAlerts.filter(a => a.triggered);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Preisalarme</h1>
          <p className="text-gray-400">Werde benachrichtigt, wenn Kurse bestimmte Werte erreichen</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 
                   text-white rounded-lg transition-colors"
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
          {showForm ? 'Abbrechen' : 'Neuer Alarm'}
        </button>
      </div>

      {/* Create Alert Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542]">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Bell size={18} className="text-indigo-500" />
            Neuen Preisalarm erstellen
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Symbol</label>
              <select
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                         text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Wähle eine Aktie...</option>
                {watchlist.map(stock => (
                  <option key={stock.symbol} value={stock.symbol}>
                    {stock.symbol} - {stock.name} ({stock.price.toFixed(2)} €)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Bedingung</label>
              <select
                value={formData.condition}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value as AlertCondition })}
                className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                         text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="below">Fällt unter</option>
                <option value="above">Steigt über</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Zielpreis (EUR)</label>
              <input
                type="number"
                step="0.01"
                value={formData.targetPrice}
                onChange={(e) => setFormData({ ...formData, targetPrice: e.target.value })}
                placeholder="0.00"
                className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                         text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={!formData.symbol || !formData.targetPrice}
                className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50
                         text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Bell size={18} />
                Alarm erstellen
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Active Alerts */}
      <div className="bg-[#1a1a2e] rounded-xl border border-[#252542]">
        <div className="p-6 border-b border-[#252542]">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Bell size={18} className="text-yellow-500" />
            Aktive Alarme ({activeAlerts.length})
          </h2>
        </div>

        {activeAlerts.length === 0 ? (
          <div className="p-12 text-center">
            <Bell size={48} className="mx-auto text-gray-500 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Keine aktiven Alarme</h3>
            <p className="text-gray-400">Erstelle einen Alarm, um bei Kursbewegungen benachrichtigt zu werden.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#252542]">
            {activeAlerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} onRemove={removePriceAlert} />
            ))}
          </div>
        )}
      </div>

      {/* Triggered Alerts */}
      {triggeredAlerts.length > 0 && (
        <div className="bg-[#1a1a2e] rounded-xl border border-[#252542]">
          <div className="p-6 border-b border-[#252542]">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Check size={18} className="text-green-500" />
              Ausgelöste Alarme ({triggeredAlerts.length})
            </h2>
          </div>
          <div className="divide-y divide-[#252542]">
            {triggeredAlerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} onRemove={removePriceAlert} triggered />
            ))}
          </div>
        </div>
      )}

      {/* Info Box */}
      {!settings.notifications.telegram.enabled && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-400 font-medium">Telegram nicht konfiguriert</p>
            <p className="text-yellow-400/80 text-sm">
              Aktiviere Telegram in den Einstellungen, um Benachrichtigungen für ausgelöste Alarme zu erhalten.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertCard({ 
  alert, 
  onRemove, 
  triggered = false 
}: { 
  alert: PriceAlert; 
  onRemove: (id: string) => void;
  triggered?: boolean;
}) {
  return (
    <div className={`p-4 flex items-center justify-between ${triggered ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${
          alert.condition === 'above' 
            ? 'bg-green-500/20' 
            : 'bg-red-500/20'
        }`}>
          {alert.condition === 'above' 
            ? <TrendingUp size={20} className="text-green-500" />
            : <TrendingDown size={20} className="text-red-500" />
          }
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">{alert.symbol}</span>
            <span className="text-gray-400">{alert.name}</span>
            {triggered && (
              <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">
                Ausgelöst
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">
            {alert.condition === 'above' ? 'Steigt über' : 'Fällt unter'}{' '}
            <span className="text-white font-medium">{alert.targetPrice.toFixed(2)} EUR</span>
            {alert.triggeredAt && (
              <span className="ml-2">
                • Ausgelöst am {new Date(alert.triggeredAt).toLocaleDateString('de-DE')}
              </span>
            )}
          </p>
        </div>
      </div>
      <button
        onClick={() => onRemove(alert.id)}
        className="p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}
