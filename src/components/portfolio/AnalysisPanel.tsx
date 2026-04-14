import { Brain, RefreshCw, X } from 'lucide-react';

interface AnalysisPanelProps {
  analyzing: boolean;
  analysisProgress: { step: string; detail: string; percent: number } | null;
  analysisResult: string | null;
  lastAnalysisDate: string | null;
  onClear: () => void;
}

export function AnalysisPanel({
  analyzing,
  analysisProgress,
  analysisResult,
  lastAnalysisDate,
  onClear,
}: AnalysisPanelProps) {
  return (
    <>
      {/* AI Analysis Loading */}
      {analyzing && (
        <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-indigo-500/30">
          <div className="flex items-center gap-3 mb-3">
            <RefreshCw className="animate-spin text-indigo-400" size={20} />
            <span className="text-indigo-300 font-medium">
              {analysisProgress?.step ? `${analysisProgress.step}` : 'KI-Analyse läuft...'}
            </span>
          </div>
          {analysisProgress && (
            <>
              <div className="w-full bg-[#252542] rounded-full h-2 mb-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${analysisProgress.percent}%` }}
                />
              </div>
              <p className="text-sm text-gray-400">{analysisProgress.detail}</p>
            </>
          )}
        </div>
      )}

      {/* AI Analysis Result */}
      {analysisResult && (
        <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-indigo-500/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Brain size={20} className="text-indigo-500" />
              Portfolio-Vollanalyse
            </h2>
            {lastAnalysisDate && (
              <span className="text-xs text-gray-500">
                {new Date(lastAnalysisDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={onClear}
              className="p-1 hover:bg-[#252542] rounded"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>
          <div className="prose prose-invert max-w-none">
            <div className="text-gray-300 whitespace-pre-wrap leading-relaxed">
              {analysisResult}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
