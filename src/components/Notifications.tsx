import { 
  Bell, 
  BellOff, 
  Send, 
  Mail, 
  Clock,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export function Notifications() {
  const { settings, signals } = useAppStore();

  const recentNotifications = signals
    .filter(s => s.signal !== 'HOLD')
    .slice(0, 20);

  const telegramEnabled = settings.notifications.telegram.enabled;
  const emailEnabled = settings.notifications.email.enabled;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="pt-12 lg:pt-0">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Benachrichtigungen</h1>
        <p className="text-sm text-gray-400">Übersicht deiner Investment-Alerts</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`rounded-xl p-6 border ${
          telegramEnabled 
            ? 'bg-green-500/10 border-green-500/30' 
            : 'bg-[#1a1a2e] border-[#252542]'
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${
              telegramEnabled ? 'bg-green-500/20' : 'bg-[#252542]'
            }`}>
              <Send size={24} className={telegramEnabled ? 'text-green-500' : 'text-gray-500'} />
            </div>
            <div>
              <h3 className="font-semibold text-white">Telegram</h3>
              <p className={telegramEnabled ? 'text-green-400' : 'text-gray-500'}>
                {telegramEnabled ? 'Aktiviert' : 'Deaktiviert'}
              </p>
            </div>
            {telegramEnabled ? (
              <Bell size={20} className="ml-auto text-green-500" />
            ) : (
              <BellOff size={20} className="ml-auto text-gray-500" />
            )}
          </div>
        </div>

        <div className={`rounded-xl p-6 border ${
          emailEnabled 
            ? 'bg-green-500/10 border-green-500/30' 
            : 'bg-[#1a1a2e] border-[#252542]'
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${
              emailEnabled ? 'bg-green-500/20' : 'bg-[#252542]'
            }`}>
              <Mail size={24} className={emailEnabled ? 'text-green-500' : 'text-gray-500'} />
            </div>
            <div>
              <h3 className="font-semibold text-white">E-Mail</h3>
              <p className={emailEnabled ? 'text-green-400' : 'text-gray-500'}>
                {emailEnabled ? 'Aktiviert' : 'Deaktiviert'}
              </p>
            </div>
            {emailEnabled ? (
              <Bell size={20} className="ml-auto text-green-500" />
            ) : (
              <BellOff size={20} className="ml-auto text-gray-500" />
            )}
          </div>
        </div>
      </div>

      {/* Info Box */}
      {!telegramEnabled && !emailEnabled && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <BellOff size={24} className="text-yellow-500 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-yellow-500">Keine Benachrichtigungen aktiv</h3>
              <p className="text-gray-400 mt-1">
                Aktiviere Telegram oder E-Mail Benachrichtigungen in den Einstellungen, 
                um Echtzeit-Alerts für Kauf- und Verkaufssignale zu erhalten.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Notification History */}
      <div className="bg-[#1a1a2e] rounded-xl border border-[#252542]">
        <div className="p-4 md:p-6 border-b border-[#252542]">
          <h2 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
            <Clock size={16} className="text-indigo-500" />
            Letzte Signale
          </h2>
        </div>

        {recentNotifications.length === 0 ? (
          <div className="p-12 text-center">
            <Bell size={48} className="mx-auto text-gray-500 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Keine Signale</h3>
            <p className="text-gray-400">
              Starte eine KI-Analyse, um Investment-Signale zu generieren.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#252542]">
            {recentNotifications.map((signal) => (
              <div key={signal.id} className="p-4 hover:bg-[#252542]/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${
                    signal.signal === 'BUY' ? 'bg-green-500/20' : 'bg-red-500/20'
                  }`}>
                    {signal.signal === 'BUY' ? (
                      <TrendingUp size={20} className="text-green-500" />
                    ) : (
                      <TrendingDown size={20} className="text-red-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{signal.stock.symbol}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        signal.signal === 'BUY' 
                          ? 'bg-green-500 text-white' 
                          : 'bg-red-500 text-white'
                      }`}>
                        {signal.signal === 'BUY' ? 'KAUFEN' : 'VERKAUFEN'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 line-clamp-1">{signal.reasoning}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-white">{signal.stock.price.toFixed(2)} {signal.stock.currency}</p>
                    <p className="text-gray-500">
                      {new Date(signal.createdAt).toLocaleTimeString('de-DE')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
