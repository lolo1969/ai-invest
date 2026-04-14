import { TrendingUp, RefreshCw } from 'lucide-react';
import type { Stock } from '../../types';

interface DashboardWatchlistProps {
  watchlistStocks: Stock[];
  isLoading: boolean;
}

export function DashboardWatchlist({ watchlistStocks, isLoading }: DashboardWatchlistProps) {
  return (
    <div className="lg:col-span-2 bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-[#252542]">
      <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4 flex items-center gap-2">
        <TrendingUp size={20} className="text-indigo-500" />
        Watchlist
      </h2>
      {isLoading && watchlistStocks.length === 0 ? (
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
              {watchlistStocks.map(stock => (
                <tr key={stock.symbol} className="border-b border-[#252542] hover:bg-[#252542]/50">
                  <td className="py-3 font-medium text-white">{stock.symbol}</td>
                  <td className="py-3 text-gray-300">{stock.name !== stock.symbol ? stock.name : ''}</td>
                  <td className="py-3 text-right text-white">
                    {stock.price > 0 ? (
                      `${stock.price.toFixed(2)} ${stock.currency}`
                    ) : (
                      <span className="text-gray-500">Laden…</span>
                    )}
                  </td>
                  <td
                    className={`py-3 text-right font-medium ${
                      (stock.changePercent ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {stock.price > 0 && stock.changePercent != null && !isNaN(stock.changePercent)
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
  );
}
