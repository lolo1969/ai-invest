import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { TrendingUp, TrendingDown, RefreshCw, X } from 'lucide-react';
import { useStockHistory } from '../hooks/useMarketData';
import type { Stock } from '../types';

type TimeRange = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y';

interface StockChartProps {
  stock: Stock;
  onClose?: () => void;
}

export function StockChart({ stock, onClose }: StockChartProps) {
  const [range, setRange] = useState<TimeRange>('1mo');
  
  const { data: history = [], isLoading, isError } = useStockHistory(stock.symbol, range);

  // Prepare chart data
  const chartData = history.map((d) => ({
    date: d.date instanceof Date ? d.date : new Date(d.date),
    price: d.close,
    formattedDate: formatDate(d.date instanceof Date ? d.date : new Date(d.date), range),
  })).filter(d => d.price > 0);

  const isPositive = chartData.length >= 2 
    ? chartData[chartData.length - 1].price >= chartData[0].price 
    : stock.changePercent >= 0;

  const priceChange = chartData.length >= 2
    ? chartData[chartData.length - 1].price - chartData[0].price
    : stock.change;
  
  const priceChangePercent = chartData.length >= 2 && chartData[0].price > 0
    ? ((chartData[chartData.length - 1].price - chartData[0].price) / chartData[0].price) * 100
    : stock.changePercent;

  const ranges: { value: TimeRange; label: string }[] = [
    { value: '1d', label: '1T' },
    { value: '5d', label: '5T' },
    { value: '1mo', label: '1M' },
    { value: '3mo', label: '3M' },
    { value: '6mo', label: '6M' },
    { value: '1y', label: '1J' },
  ];

  return (
    <div className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-[#252542]">
      {/* Header */}
      <div className="flex items-start justify-between mb-3 md:mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <h3 className="text-lg md:text-xl font-bold text-white">{stock.symbol}</h3>
            <span className="text-gray-400 text-sm truncate">{stock.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xl md:text-2xl font-bold text-white">
              {stock.price.toFixed(2)} {stock.currency}
            </span>
            <span className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
              {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
            </span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#252542] rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        )}
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-1 mb-4">
        {ranges.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              range === r.value
                ? 'bg-indigo-600 text-white'
                : 'bg-[#252542] text-gray-400 hover:text-white'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-64">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <RefreshCw className="animate-spin text-indigo-500" size={32} />
          </div>
        ) : isError || chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            Keine Daten verfügbar
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`gradient-${stock.symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={isPositive ? '#22c55e' : '#ef4444'}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={isPositive ? '#22c55e' : '#ef4444'}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="formattedDate"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['auto', 'auto']}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickFormatter={(value) => `${value.toFixed(0)}`}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a2e',
                  border: '1px solid #252542',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(2)} ${stock.currency}`, 'Preis'] : ['-', 'Preis']}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={isPositive ? '#22c55e' : '#ef4444'}
                strokeWidth={2}
                fill={`url(#gradient-${stock.symbol})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 52 Week Range */}
      {stock.week52High && stock.week52Low && (
        <div className="mt-4 pt-4 border-t border-[#252542]">
          <p className="text-sm text-gray-400 mb-2">52-Wochen-Bereich</p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{stock.week52Low.toFixed(2)}</span>
            <div className="flex-1 h-2 bg-[#252542] rounded-full relative">
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full"
                style={{ width: '100%' }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg border-2 border-indigo-500"
                style={{ left: `${stock.week52ChangePercent || 50}%`, marginLeft: '-6px' }}
              />
            </div>
            <span className="text-sm text-gray-500">{stock.week52High.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Mini chart for table rows
interface MiniChartProps {
  symbol: string;
  isPositive?: boolean;
}

export function MiniChart({ symbol, isPositive = true }: MiniChartProps) {
  const { data: history = [], isLoading } = useStockHistory(symbol, '5d', true);

  const chartData = history.map((d) => ({
    price: d.close,
  })).filter(d => d.price > 0);

  if (isLoading || chartData.length < 2) {
    return <div className="w-20 h-8" />;
  }

  return (
    <div className="w-20 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="price"
            stroke={isPositive ? '#22c55e' : '#ef4444'}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatDate(date: Date, range: TimeRange): string {
  if (range === '1d') {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } else if (range === '5d') {
    return date.toLocaleDateString('de-DE', { weekday: 'short' });
  } else if (range === '1mo') {
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  } else {
    return date.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
  }
}
