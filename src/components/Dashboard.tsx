import { useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Target, 
  AlertTriangle,
  RefreshCw,
  Brain
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useStocksWithRange, useAIAnalysis } from '../hooks/useMarketData';
import { notificationService } from '../services/notifications';
import type { InvestmentSignal } from '../types';

export function Dashboard() {
  const { settings, signals, addSignal, addToWatchlist, setError, cashBalance, userPositions } = useAppStore();
  
  // Use React Query for stock data
  const { 
    data: stocks = [], 
    isLoading, 
    refetch,
    isRefetching 
  } = useStocksWithRange(settings.watchlist);
  
  // AI Analysis mutation - use selected provider and corresponding API key
  const activeApiKey = settings.aiProvider === 'openai' 
    ? settings.apiKeys.openai 
    : settings.apiKeys.claude;
  const aiAnalysis = useAIAnalysis(activeApiKey, settings.aiProvider);

  // Add stocks to watchlist when data updates
  useEffect(() => {
    stocks.forEach(stock => addToWatchlist(stock));
  }, [stocks, addToWatchlist]);

  // Run AI analysis
  const runAnalysis = async () => {
    const providerName = settings.aiProvider === 'openai' ? 'OpenAI' : 'Claude';
    
    if (!activeApiKey) {
      setError(`Bitte füge deinen ${providerName} API-Schlüssel in den Einstellungen hinzu.`);
      return;
    }

    if (stocks.length === 0) {
      setError('Keine Aktien in der Watchlist. Bitte warte bis die Kurse geladen sind oder füge Aktien hinzu.');
      return;
    }

    try {
      // Convert userPositions to Position format for AI analysis
      const currentPositions = userPositions.map(up => {
        const stockData = stocks.find(s => s.symbol === up.symbol);
        const currentPrice = up.useYahooPrice && stockData ? stockData.price : up.currentPrice;
        const profitLoss = (currentPrice - up.buyPrice) * up.quantity;
        const profitLossPercent = ((currentPrice - up.buyPrice) / up.buyPrice) * 100;
        
        return {
          id: up.id,
          stock: stockData || {
            symbol: up.symbol,
            name: up.name,
            price: currentPrice,
            change: 0,
            changePercent: 0,
            currency: up.currency,
            exchange: '',
          },
          quantity: up.quantity,
          averageBuyPrice: up.buyPrice,
          currentPrice,
          profitLoss,
          profitLossPercent,
          boughtAt: new Date(),
        };
      });

      const response = await aiAnalysis.mutateAsync({
        stocks,
        strategy: settings.strategy,
        riskTolerance: settings.riskTolerance,
        budget: cashBalance,
        currentPositions,
      });

      // Add signals and send notifications
      for (const signal of response.signals) {
        addSignal(signal);
        
        // Send notifications for BUY/SELL signals
        if (signal.signal !== 'HOLD') {
          await notificationService.notify(signal, {
            telegram: settings.notifications.telegram.enabled
              ? {
                  botToken: settings.notifications.telegram.botToken,
                  chatId: settings.notifications.telegram.chatId,
                }
              : undefined,
            email: settings.notifications.email.enabled
              ? { 
                  address: settings.notifications.email.address,
                  serviceId: settings.notifications.email.serviceId,
                  templateId: settings.notifications.email.templateId,
                  publicKey: settings.notifications.email.publicKey,
                }
              : undefined,
          });
        }
      }
    } catch (error: any) {
      setError(error.message || 'Analyse fehlgeschlagen');
    }
  };

  const latestSignals = signals.slice(0, 5);
  const buySignals = signals.filter(s => s.signal === 'BUY').length;
  const sellSignals = signals.filter(s => s.signal === 'SELL').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400">Dein KI-Investment-Überblick</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-2 px-4 py-3 bg-[#252542] hover:bg-[#3a3a5a] 
                       disabled:opacity-50 text-white rounded-lg transition-colors"
            title="Kurse aktualisieren"
          >
            <RefreshCw className={isRefetching ? 'animate-spin' : ''} size={20} />
          </button>
          <button
            onClick={runAnalysis}
            disabled={aiAnalysis.isPending || isLoading}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 
                       disabled:bg-indigo-600/50 text-white rounded-lg transition-colors"
          >
            {aiAnalysis.isPending ? (
              <>
                <RefreshCw className="animate-spin" size={20} />
                Analysiere...
              </>
            ) : (
              <>
                <Brain size={20} />
                KI-Analyse starten
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Verfügbares Cash"
          value={`${cashBalance.toLocaleString('de-DE')} €`}
          icon={<Wallet size={24} />}
          color="yellow"
        />
        <StatCard
          title="Strategie"
          value={settings.strategy === 'short' ? 'Kurzfristig' : settings.strategy === 'middle' ? 'Mittelfristig' : 'Langfristig'}
          icon={<Target size={24} />}
          color="blue"
        />
        <StatCard
          title="Kaufsignale"
          value={buySignals.toString()}
          icon={<TrendingUp size={24} />}
          color="green"
        />
        <StatCard
          title="Verkaufssignale"
          value={sellSignals.toString()}
          icon={<TrendingDown size={24} />}
          color="red"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Watchlist */}
        <div className="lg:col-span-2 bg-[#1a1a2e] rounded-xl p-6 border border-[#252542]">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-indigo-500" />
            Watchlist
          </h2>
          {isLoading && stocks.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="animate-spin text-indigo-500" size={32} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 text-sm border-b border-[#252542]">
                    <th className="pb-3">Symbol</th>
                    <th className="pb-3">Name</th>
                    <th className="pb-3 text-right">Preis</th>
                    <th className="pb-3 text-right">Änderung</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((stock) => (
                    <tr key={stock.symbol} className="border-b border-[#252542] hover:bg-[#252542]/50">
                      <td className="py-3 font-medium text-white">{stock.symbol}</td>
                      <td className="py-3 text-gray-300">{stock.name}</td>
                      <td className="py-3 text-right text-white">
                        {stock.price?.toFixed(2) ?? '-'} {stock.currency}
                      </td>
                      <td className={`py-3 text-right font-medium ${
                        (stock.changePercent ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {stock.changePercent != null && !isNaN(stock.changePercent) 
                          ? `${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Signals */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542]">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-yellow-500" />
            Letzte Signale
          </h2>
          {latestSignals.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              Noch keine Signale. Starte eine KI-Analyse!
            </p>
          ) : (
            <div className="space-y-3">
              {latestSignals.map((signal) => (
                <SignalCard key={signal.id} signal={signal} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon, 
  color 
}: { 
  title: string; 
  value: string; 
  icon: React.ReactNode; 
  color: 'indigo' | 'blue' | 'green' | 'red' | 'yellow';
}) {
  const colorClasses = {
    indigo: 'bg-indigo-500/20 text-indigo-500',
    blue: 'bg-blue-500/20 text-blue-500',
    green: 'bg-green-500/20 text-green-500',
    red: 'bg-red-500/20 text-red-500',
    yellow: 'bg-yellow-500/20 text-yellow-500',
  };

  return (
    <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function SignalCard({ signal }: { signal: InvestmentSignal }) {
  const signalColors = {
    BUY: 'bg-green-500/20 text-green-500 border-green-500/30',
    SELL: 'bg-red-500/20 text-red-500 border-red-500/30',
    HOLD: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  };

  return (
    <div className={`p-4 rounded-lg border ${signalColors[signal.signal]} ${
      signal.signal === 'BUY' ? 'pulse-buy' : signal.signal === 'SELL' ? 'pulse-sell' : ''
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold">{signal.stock.symbol}</span>
        <span className="text-xs font-medium px-2 py-1 rounded bg-black/20">
          {signal.signal}
        </span>
      </div>
      <p className="text-xs opacity-80 line-clamp-2">{signal.reasoning}</p>
      <div className="flex items-center justify-between mt-2 text-xs opacity-60">
        <span>Konfidenz: {signal.confidence}%</span>
        <span>{new Date(signal.createdAt).toLocaleTimeString('de-DE')}</span>
      </div>
    </div>
  );
}
