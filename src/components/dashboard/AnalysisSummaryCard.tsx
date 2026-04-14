import { Brain } from 'lucide-react';

interface AnalysisSummaryCardProps {
  summary: string | null;
  date: string | null;
}

export function AnalysisSummaryCard({ summary, date }: AnalysisSummaryCardProps) {
  if (!summary) return null;

  return (
    <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-indigo-500/30">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
          <Brain size={20} className="text-indigo-500" />
          Dashboard-Schnellanalyse
        </h2>
        {date && (
          <span className="text-xs text-gray-500">
            {new Date(date).toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{summary}</p>
    </div>
  );
}
