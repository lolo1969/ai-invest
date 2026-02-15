import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marketDataService } from '../services/marketData';
import { getAIService } from '../services/aiService';
import type { Stock, AIAnalysisRequest, AIAnalysisResponse, AIProvider, ClaudeModel, OpenAIModel, GeminiModel } from '../types';

// Query Keys
export const queryKeys = {
  stocks: (symbols: string[]) => ['stocks', symbols] as const,
  stocksWithRange: (symbols: string[]) => ['stocks', 'withRange', symbols] as const,
  stock: (symbol: string) => ['stock', symbol] as const,
  stockHistory: (symbol: string, range: string) => ['stockHistory', symbol, range] as const,
  searchStocks: (query: string) => ['searchStocks', query] as const,
  exchangeRate: () => ['exchangeRate'] as const,
};

// Hook: Fetch multiple stock quotes
export function useStocks(symbols: string[], enabled = true) {
  return useQuery({
    queryKey: queryKeys.stocks(symbols),
    queryFn: () => marketDataService.getQuotes(symbols),
    enabled: enabled && symbols.length > 0,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Auto-refresh every minute
  });
}

// Hook: Fetch multiple stock quotes with 52-week range
export function useStocksWithRange(symbols: string[], enabled = true) {
  return useQuery({
    queryKey: queryKeys.stocksWithRange(symbols),
    queryFn: () => marketDataService.getQuotesWithRange(symbols),
    enabled: enabled && symbols.length > 0,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// Hook: Fetch single stock quote
export function useStock(symbol: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.stock(symbol),
    queryFn: () => marketDataService.getQuote(symbol),
    enabled: enabled && !!symbol,
    staleTime: 60 * 1000,
  });
}

// Hook: Fetch stock historical data
export function useStockHistory(
  symbol: string,
  range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' = '1mo',
  enabled = true
) {
  return useQuery({
    queryKey: queryKeys.stockHistory(symbol, range),
    queryFn: () => marketDataService.getHistoricalData(symbol, range),
    enabled: enabled && !!symbol,
    staleTime: 5 * 60 * 1000, // 5 minutes for historical data
  });
}

// Hook: Search stocks
export function useSearchStocks(query: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.searchStocks(query),
    queryFn: () => marketDataService.searchStocks(query),
    enabled: enabled && query.length >= 1,
    staleTime: 5 * 60 * 1000,
  });
}

// Hook: AI Analysis mutation
export function useAIAnalysis(apiKey: string, provider: AIProvider = 'claude', claudeModel: ClaudeModel = 'claude-opus-4-6', openaiModel: OpenAIModel = 'gpt-5.2', geminiModel: GeminiModel = 'gemini-2.5-flash') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: AIAnalysisRequest): Promise<AIAnalysisResponse> => {
      if (!apiKey) {
        const names: Record<AIProvider, string> = { claude: 'Claude', openai: 'OpenAI', gemini: 'Google Gemini' };
        throw new Error(`${names[provider]} API key is required`);
      }
      const aiService = getAIService(apiKey, provider, claudeModel, openaiModel, geminiModel);
      return aiService.analyzeMarket(request);
    },
    onSuccess: () => {
      // Invalidate stocks to refresh prices after analysis
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
    },
  });
}

// Hook: Prefetch stocks
export function usePrefetchStocks() {
  const queryClient = useQueryClient();

  return (symbols: string[]) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.stocks(symbols),
      queryFn: () => marketDataService.getQuotes(symbols),
      staleTime: 60 * 1000,
    });
  };
}

// Hook: Update stock in cache
export function useUpdateStockCache() {
  const queryClient = useQueryClient();

  return (stock: Stock) => {
    queryClient.setQueryData(queryKeys.stock(stock.symbol), stock);
  };
}
