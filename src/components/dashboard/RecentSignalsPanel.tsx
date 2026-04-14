import { AlertTriangle } from 'lucide-react';
import { SignalCard } from './SignalCard';
import type { InvestmentSignal } from '../../types';

interface RecentSignalsPanelProps {
  signals: InvestmentSignal[];
}

export function RecentSignalsPanel({ signals }: RecentSignalsPanelProps) {
  return (
    <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-[#252542]">
      <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4 flex items-center gap-2">
        <AlertTriangle size={20} className="text-yellow-500" />
        Letzte Signale
      </h2>
      {signals.length === 0 ? (
        <p className="text-gray-400 text-center py-8">Noch keine Signale. Starte eine KI-Analyse!</p>
      ) : (
        <div className="space-y-3">
          {signals.map(signal => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}
