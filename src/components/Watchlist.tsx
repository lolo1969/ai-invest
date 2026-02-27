import { useState } from 'react';
import { 
  Search, 
  Plus, 
  Trash2, 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { marketDataService } from '../services/marketData';
import { StockChart } from './StockChart';
import type { Stock } from '../types';

export function Watchlist() {
  const { settings, updateSettings, watchlist, addToWatchlist, removeFromWatchlist } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string; price?: number; change?: number; changePercent?: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    try {
      const results = await marketDataService.searchStocks(searchQuery);
      // Fetch prices for each result
      const resultsWithPrices = await Promise.all(
        results.map(async (result) => {
          try {
            const quote = await marketDataService.getQuote(result.symbol);
            return {
              ...result,
              price: quote?.price,
              change: quote?.change,
              changePercent: quote?.changePercent
            };
          } catch {
            return result;
          }
        })
      );
      setSearchResults(resultsWithPrices);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const addStock = async (symbol: string) => {
    // Add to settings watchlist
    if (!settings.watchlist.includes(symbol)) {
      updateSettings({ watchlist: [...settings.watchlist, symbol] });
    }
    
    // Fetch and add to store
    const stock = await marketDataService.getQuote(symbol);
    if (stock) {
      addToWatchlist(stock);
    }
    
    setSearchResults([]);
    setSearchQuery('');
  };

  const removeStock = (symbol: string) => {
    updateSettings({ watchlist: settings.watchlist.filter(s => s !== symbol) });
    removeFromWatchlist(symbol);
  };

  const refreshWatchlist = async () => {
    setRefreshing(true);
    try {
      const stocks = await marketDataService.getQuotes(settings.watchlist);
      stocks.forEach(stock => addToWatchlist(stock));
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Watchlist</h1>
          <p className="text-gray-400">Beobachte deine favorisierten Aktien</p>
        </div>
        <button
          onClick={refreshWatchlist}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-[#252542] hover:bg-[#3a3a5a] 
                   text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          Aktualisieren
        </button>
      </div>

      {/* Stock Chart Modal */}
      {selectedStock && (
        <StockChart stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}

      {/* Search */}
      <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542]">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Search size={18} className="text-indigo-500" />
          Aktie hinzufügen
        </h2>
        
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Suche nach Symbol oder Name (z.B. AAPL, Tesla)..."
            className="flex-1 px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg 
                     transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {searching ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <Search size={18} />
            )}
            Suchen
          </button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-4 border border-[#252542] rounded-lg overflow-hidden">
            {searchResults.map((result) => (
              <div
                key={result.symbol}
                className="flex items-center justify-between px-4 py-3 
                         hover:bg-[#252542] border-b border-[#252542] last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-white text-sm md:text-base">{result.symbol}</span>
                  <span className="text-gray-400 ml-2 text-xs md:text-sm truncate">{result.name}</span>
                </div>
                <div className="flex items-center gap-2 md:gap-4">
                  {result.price !== undefined && !isNaN(result.price) && (
                    <div className="text-right">
                      <span className="text-white font-medium">{result.price.toFixed(2)} EUR</span>
                      {result.changePercent !== undefined && !isNaN(result.changePercent) && (
                        <span className={`ml-2 text-sm ${result.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {result.changePercent >= 0 ? '+' : ''}{result.changePercent.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => addStock(result.symbol)}
                    disabled={settings.watchlist.includes(result.symbol)}
                    className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 
                             text-white rounded-lg transition-colors"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Watchlist Table */}
      <div className="bg-[#1a1a2e] rounded-xl border border-[#252542] overflow-hidden">
        <div className="p-4 md:p-6 border-b border-[#252542]">
          <h2 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
            <TrendingUp size={18} className="text-indigo-500" />
            Deine Watchlist ({watchlist.length} Aktien)
          </h2>
        </div>

        {watchlist.length === 0 ? (
          <div className="p-12 text-center">
            <Search size={48} className="mx-auto text-gray-500 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Keine Aktien in der Watchlist</h3>
            <p className="text-gray-400">Suche oben nach Aktien, um sie hinzuzufügen.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm bg-[#252542]/50">
                  <th className="px-3 md:px-6 py-3 md:py-4">Symbol</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 hidden sm:table-cell">Name</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-right">Preis</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-right">Änderung</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-right hidden md:table-cell">Börse</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-center">Chart</th>
                  <th className="px-3 md:px-6 py-3 md:py-4 text-center">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((stock) => (
                  <tr 
                    key={stock.symbol} 
                    className="border-b border-[#252542] hover:bg-[#252542]/30 transition-colors"
                  >
                    <td className="px-3 md:px-6 py-3 md:py-4">
                      <span className="font-bold text-white text-sm md:text-base">{stock.symbol}</span>
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-gray-300 hidden sm:table-cell text-sm">{stock.name}</td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-right text-white font-medium text-sm md:text-base">
                      {stock.price != null && !isNaN(stock.price) ? `${stock.price.toFixed(2)} ${stock.currency}` : '-'}
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-right">
                      {stock.changePercent != null && !isNaN(stock.changePercent) ? (
                        <span className={`flex items-center justify-end gap-1 font-medium text-sm md:text-base ${
                          stock.changePercent >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {stock.changePercent >= 0 ? (
                            <TrendingUp size={16} />
                          ) : (
                            <TrendingDown size={16} />
                          )}
                          {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-right text-gray-400 hidden md:table-cell text-sm">{stock.exchange || '-'}</td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-center">
                      <button
                        onClick={() => setSelectedStock(stock)}
                        className="p-2 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors"
                        title="Chart anzeigen"
                      >
                        <BarChart3 size={18} />
                      </button>
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 text-center">
                      <button
                        onClick={() => removeStock(stock.symbol)}
                        className="p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
