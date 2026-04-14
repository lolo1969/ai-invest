import { useState, useRef } from 'react';
import { marketDataService } from '../../services/marketData';
import type { SymbolSuggestion } from './portfolioTypes';

interface FormData {
  symbol: string;
  isin: string;
  name: string;
  quantity: string;
  buyPrice: string;
  currentPrice: string;
  currency: string;
}

export function useSymbolSearch(setFormData: React.Dispatch<React.SetStateAction<FormData>>) {
  const [symbolSuggestions, setSymbolSuggestions] = useState<SymbolSuggestion[]>([]);
  const [searchingSymbol, setSearchingSymbol] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const symbolSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSymbolSearch = (query: string) => {
    setFormData(prev => ({ ...prev, symbol: query }));

    if (symbolSearchTimeout.current) {
      clearTimeout(symbolSearchTimeout.current);
    }

    if (query.trim().length < 1) {
      setSymbolSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setShowSuggestions(true);
    symbolSearchTimeout.current = setTimeout(async () => {
      setSearchingSymbol(true);
      try {
        const results = await marketDataService.searchStocks(query);
        // Show results immediately, then fetch prices
        const suggestions: SymbolSuggestion[] = results.slice(0, 6).map(r => ({
          ...r,
          loading: true,
        }));
        setSymbolSuggestions(suggestions);

        // Fetch prices for each result
        const withPrices = await Promise.all(
          suggestions.map(async (s) => {
            try {
              const quote = await marketDataService.getQuote(s.symbol);
              return {
                ...s,
                price: quote?.price,
                changePercent: quote?.changePercent,
                loading: false,
              };
            } catch {
              return { ...s, loading: false };
            }
          })
        );
        setSymbolSuggestions(withPrices);
      } catch (error) {
        console.error('Symbol search failed:', error);
      } finally {
        setSearchingSymbol(false);
      }
    }, 400);
  };

  const selectSuggestion = (suggestion: SymbolSuggestion) => {
    setFormData(prev => ({
      ...prev,
      symbol: suggestion.symbol,
      name: suggestion.name,
      currentPrice: suggestion.price ? suggestion.price.toFixed(2) : prev.currentPrice,
    }));
    setShowSuggestions(false);
    setSymbolSuggestions([]);
  };

  return {
    symbolSuggestions,
    searchingSymbol,
    showSuggestions,
    setShowSuggestions,
    handleSymbolSearch,
    selectSuggestion,
  };
}
