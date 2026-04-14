import type { InvestmentSignal } from '../../types';

const signalColors = {
  BUY: 'bg-green-500/20 text-green-500 border-green-500/30',
  SELL: 'bg-red-500/20 text-red-500 border-red-500/30',
  HOLD: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
};

interface SignalCardProps {
  signal: InvestmentSignal;
}

export function SignalCard({ signal }: SignalCardProps) {
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
