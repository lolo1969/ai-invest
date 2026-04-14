import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import type { PortfolioHistoryPoint, PortfolioChartRange } from './portfolioTypes';

interface PortfolioChartProps {
  portfolioHistory: PortfolioHistoryPoint[];
  portfolioChartRange: PortfolioChartRange;
  setPortfolioChartRange: (r: PortfolioChartRange) => void;
  loadingPortfolioHistory: boolean;
  portfolioHistoryEnd: number;
  portfolioHistoryDiff: number;
  portfolioHistoryDiffPercent: number;
}

export function PortfolioChart({
  portfolioHistory,
  portfolioChartRange,
  setPortfolioChartRange,
  loadingPortfolioHistory,
  portfolioHistoryEnd,
  portfolioHistoryDiff,
  portfolioHistoryDiffPercent,
}: PortfolioChartProps) {
  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-[#252542] p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-white">Portfolio-Verlauf</h2>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Entwicklung des Gesamtwerts deiner Positionen
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {[
            { value: '1d' as const, label: 'Tag' },
            { value: '5d' as const, label: 'Woche' },
            { value: '1mo' as const, label: 'Monat' },
            { value: '1y' as const, label: 'Jahr' },
          ].map((range) => (
            <button
              key={range.value}
              onClick={() => setPortfolioChartRange(range.value)}
              className={`px-3 py-1.5 text-xs md:text-sm rounded-lg transition-colors ${
                portfolioChartRange === range.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-[#252542] text-gray-400 hover:text-white'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 text-sm">
        <span className="text-gray-400">Periode:</span>
        <span className="text-white font-semibold">
          {portfolioHistoryEnd.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
        </span>
        <span className={`flex items-center gap-1 ${portfolioHistoryDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {portfolioHistoryDiff >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {portfolioHistoryDiff >= 0 ? '+' : ''}
          {portfolioHistoryDiff.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          ({portfolioHistoryDiffPercent >= 0 ? '+' : ''}{portfolioHistoryDiffPercent.toFixed(2)}%)
        </span>
      </div>

      <div className="h-72">
        {loadingPortfolioHistory ? (
          <div className="h-full flex items-center justify-center">
            <RefreshCw className="animate-spin text-indigo-500" size={28} />
          </div>
        ) : portfolioHistory.length < 2 ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Zu wenig Verlaufsdaten verfügbar
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={portfolioHistory}>
              <defs>
                <linearGradient id="portfolio-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={portfolioHistoryDiff >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={portfolioHistoryDiff >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickFormatter={(value) =>
                  `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`
                }
                width={70}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a2e',
                  border: '1px solid #252542',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(value: number | string | undefined, _name, item) => {
                  const percentValue = typeof value === 'number' ? value : Number(value ?? 0);
                  const absoluteValue = Number(item?.payload?.value ?? 0);
                  return [
                    `${percentValue >= 0 ? '+' : ''}${percentValue.toFixed(2)}% (${absoluteValue.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €)`,
                    'Veränderung',
                  ];
                }}
              />
              <Area
                type="monotone"
                dataKey="changePercent"
                stroke={portfolioHistoryDiff >= 0 ? '#22c55e' : '#ef4444'}
                strokeWidth={2.2}
                fill="url(#portfolio-gradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
