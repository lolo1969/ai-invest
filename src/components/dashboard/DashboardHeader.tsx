import { Brain, RefreshCw } from 'lucide-react';

interface DashboardHeaderProps {
  onRefetch: () => void;
  onRunAnalysis: () => void;
  isRefetching: boolean;
  isDashboardAnalyzing: boolean;
  isLoading: boolean;
}

export function DashboardHeader({
  onRefetch,
  onRunAnalysis,
  isRefetching,
  isDashboardAnalyzing,
  isLoading,
}: DashboardHeaderProps) {
  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-12 lg:pt-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-sm md:text-base text-gray-400">Dein KI-Investment-Überblick (Schnellanalyse)</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefetch}
            disabled={isRefetching}
            className="flex items-center justify-center gap-2 px-3 md:px-4 py-2.5 md:py-3 bg-[#252542] hover:bg-[#3a3a5a]
                       disabled:opacity-50 text-white rounded-lg transition-colors"
            title="Kurse aktualisieren"
          >
            <RefreshCw className={isRefetching ? 'animate-spin' : ''} size={18} />
          </button>
          <button
            onClick={onRunAnalysis}
            disabled={isDashboardAnalyzing || isLoading}
            className="flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-indigo-600 hover:bg-indigo-700
                       disabled:bg-indigo-600/50 text-white rounded-lg transition-colors flex-1 md:flex-initial"
          >
            {isDashboardAnalyzing ? (
              <>
                <RefreshCw className="animate-spin" size={18} />
                <span className="text-sm md:text-base">Analysiere...</span>
              </>
            ) : (
              <>
                <Brain size={18} />
                <span className="text-sm md:text-base">Schnellanalyse starten</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isDashboardAnalyzing && (
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-indigo-500/30">
          <div className="flex items-center gap-3 text-indigo-300">
            <RefreshCw className="animate-spin" size={18} />
            <span className="text-sm">Dashboard-Schnellanalyse läuft im Hintergrund weiter. Du kannst die Seite wechseln und später zurückkommen.</span>
          </div>
        </div>
      )}
    </>
  );
}
