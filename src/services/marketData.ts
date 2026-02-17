import axios from 'axios';
import type { Stock, HistoricalData } from '../types';

// Use own PHP proxy on production, Vite proxy for local dev
const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const OWN_PROXY = '/api/proxy.php?url=';
// For localhost, use Vite's built-in proxy (no encoding needed)
const LOCAL_PROXY = '/yahoo-api';
const FINNHUB_API = 'https://finnhub.io/api/v1';

// Helper to build URL based on environment
function buildYahooUrl(path: string): string {
  if (isProduction) {
    // Production: use PHP proxy with full URL encoded
    return `${OWN_PROXY}${encodeURIComponent(`https://query1.finance.yahoo.com${path}`)}`;
  } else {
    // Local dev: use Vite proxy directly
    return `${LOCAL_PROXY}${path}`;
  }
}

// Cache for exchange rate
let cachedEurUsdRate: { rate: number; timestamp: number } | null = null;
const RATE_CACHE_DURATION = 3600000; // 1 hour

// Fallback demo data when API fails
const DEMO_STOCKS: Record<string, Stock> = {
  'AAPL': { symbol: 'AAPL', name: 'Apple Inc.', price: 165.00, change: 2.30, changePercent: 1.31, currency: 'EUR', exchange: 'NASDAQ' },
  'MSFT': { symbol: 'MSFT', name: 'Microsoft Corporation', price: 350.00, change: -1.20, changePercent: -0.32, currency: 'EUR', exchange: 'NASDAQ' },
  'GOOGL': { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 132.00, change: 0.85, changePercent: 0.60, currency: 'EUR', exchange: 'NASDAQ' },
  'AMZN': { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 165.00, change: 3.40, changePercent: 1.94, currency: 'EUR', exchange: 'NASDAQ' },
  'TSLA': { symbol: 'TSLA', name: 'Tesla Inc.', price: 230.00, change: -5.20, changePercent: -2.05, currency: 'EUR', exchange: 'NASDAQ' },
  'NVDA': { symbol: 'NVDA', name: 'NVIDIA Corporation', price: 450.00, change: 12.30, changePercent: 2.60, currency: 'EUR', exchange: 'NASDAQ' },
  'META': { symbol: 'META', name: 'Meta Platforms Inc.', price: 355.00, change: 4.50, changePercent: 1.18, currency: 'EUR', exchange: 'NASDAQ' },
};

export class MarketDataService {
  private apiKey: string;

  constructor(apiKey: string = '') {
    this.apiKey = apiKey;
  }

  // Retry-Wrapper für Netzwerkfehler (ENETDOWN, ECONNRESET, ETIMEDOUT etc.)
  private async fetchWithRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1500): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        const isNetworkError = 
          error?.code === 'ENETDOWN' || 
          error?.code === 'ECONNRESET' || 
          error?.code === 'ETIMEDOUT' || 
          error?.code === 'ENOTFOUND' ||
          error?.code === 'ECONNREFUSED' ||
          error?.code === 'ERR_NETWORK' ||
          error?.message?.includes('ENETDOWN') ||
          error?.message?.includes('Network Error') ||
          error?.message?.includes('timeout');
        
        if (isNetworkError && attempt < retries) {
          const wait = delayMs * Math.pow(2, attempt);
          console.warn(`[Retry ${attempt + 1}/${retries}] Netzwerkfehler, warte ${wait}ms...`, error?.code || error?.message);
          await new Promise(resolve => setTimeout(resolve, wait));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  }

  // Get USD to EUR exchange rate
  async getUsdToEurRate(): Promise<number> {
    // Return cached rate if still valid
    if (cachedEurUsdRate && Date.now() - cachedEurUsdRate.timestamp < RATE_CACHE_DURATION) {
      return cachedEurUsdRate.rate;
    }

    try {
      // Use Yahoo Finance to get EUR/USD rate
      const url = buildYahooUrl('/v8/finance/chart/EURUSD=X?interval=1d&range=1d');
      const response = await this.fetchWithRetry(() => axios.get(url, { timeout: 10000 }));
      const result = response.data.chart.result?.[0];
      
      if (result?.meta?.regularMarketPrice) {
        // EURUSD gives us how many USD per EUR, we need the inverse
        const eurPerUsd = 1 / result.meta.regularMarketPrice;
        cachedEurUsdRate = { rate: eurPerUsd, timestamp: Date.now() };
        console.log(`Exchange rate: 1 USD = ${eurPerUsd.toFixed(4)} EUR`);
        return eurPerUsd;
      }
    } catch (error) {
      console.error('Failed to fetch exchange rate:', error);
    }

    // Fallback rate if API fails
    return 0.92; // Approximate EUR/USD rate
  }

  // Fetch quote using Yahoo Finance with CORS proxy - always returns EUR
  async getQuote(symbol: string): Promise<Stock | null> {
    try {
      const url = buildYahooUrl(`/v8/finance/chart/${symbol}?interval=1d&range=1d`);
      console.log('Fetching stock:', symbol);
      
      const response = await this.fetchWithRetry(() => axios.get(url, { timeout: 10000 }));

      const result = response.data.chart.result?.[0];
      if (!result) {
        console.log(`No data for ${symbol}, using demo data`);
        return DEMO_STOCKS[symbol] || null;
      }

      const meta = result.meta;
      let price = meta.regularMarketPrice || 0;
      let previousClose = meta.previousClose || meta.chartPreviousClose || price;
      const originalCurrency = meta.currency || 'USD';
      
      // Convert to EUR if price is in USD
      if (originalCurrency === 'USD') {
        const eurRate = await this.getUsdToEurRate();
        price = price * eurRate;
        previousClose = previousClose * eurRate;
        console.log(`Converted ${symbol}: ${meta.regularMarketPrice} USD → ${price.toFixed(2)} EUR`);
      }
      
      // Calculate change safely
      const change = previousClose > 0 ? price - previousClose : 0;
      const changePercent = previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;
      
      console.log(`[${symbol}] Price: ${price.toFixed(2)}, PrevClose: ${previousClose.toFixed(2)}, Change: ${changePercent.toFixed(2)}%`);
      
      return {
        symbol: meta.symbol,
        name: meta.shortName || meta.longName || symbol,
        price: price,
        change: change,
        changePercent: changePercent,
        currency: 'EUR', // Always EUR
        exchange: meta.exchangeName || 'Unknown',
      };
    } catch (error) {
      console.error(`Failed to fetch quote for ${symbol}:`, error);
      // Return demo data as fallback only for known symbols
      return DEMO_STOCKS[symbol] || null;
    }
  }

  // Fetch multiple quotes
  async getQuotes(symbols: string[]): Promise<Stock[]> {
    const quotes = await Promise.all(symbols.map((s) => this.getQuote(s)));
    return quotes.filter((q): q is Stock => q !== null);
  }

  // Fetch historical data
  async getHistoricalData(
    symbol: string,
    range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' = '1mo'
  ): Promise<HistoricalData[]> {
    try {
      const url = buildYahooUrl(`/v8/finance/chart/${symbol}?interval=${range === '1d' ? '5m' : '1d'}&range=${range}`);
      const response = await this.fetchWithRetry(() => axios.get(url, { timeout: 10000 }));

      const result = response.data.chart.result?.[0];
      if (!result) return [];

      const timestamps = result.timestamp || [];
      const quote = result.indicators?.quote?.[0] || {};

      return timestamps.map((ts: number, i: number) => ({
        date: new Date(ts * 1000),
        open: quote.open?.[i] || 0,
        high: quote.high?.[i] || 0,
        low: quote.low?.[i] || 0,
        close: quote.close?.[i] || 0,
        volume: quote.volume?.[i] || 0,
      }));
    } catch (error) {
      console.error(`Failed to fetch historical data for ${symbol}:`, error);
      return [];
    }
  }

  // Search for stocks
  async searchStocks(query: string): Promise<{ symbol: string; name: string }[]> {
    try {
      const url = buildYahooUrl(`/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`);
      const response = await this.fetchWithRetry(() => axios.get(url, { timeout: 10000 }));

      return (response.data.quotes || []).map((q: any) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
      }));
    } catch (error) {
      console.error('Search failed:', error);
      // Return some popular stocks as fallback
      const fallbackStocks = [
        { symbol: 'AAPL', name: 'Apple Inc.' },
        { symbol: 'MSFT', name: 'Microsoft Corporation' },
        { symbol: 'GOOGL', name: 'Alphabet Inc.' },
        { symbol: 'AMZN', name: 'Amazon.com Inc.' },
        { symbol: 'TSLA', name: 'Tesla Inc.' },
        { symbol: 'NVDA', name: 'NVIDIA Corporation' },
        { symbol: 'META', name: 'Meta Platforms Inc.' },
      ];
      return fallbackStocks.filter(s => 
        s.symbol.toLowerCase().includes(query.toLowerCase()) ||
        s.name.toLowerCase().includes(query.toLowerCase())
      );
    }
  }

  // Fetch quote with 52-week high/low data for better analysis
  async getQuoteWithRange(symbol: string): Promise<Stock | null> {
    try {
      // First get current quote
      const quote = await this.getQuote(symbol);
      if (!quote) return null;

      // Then fetch 1-year historical data to calculate 52-week high/low
      const historicalData = await this.getHistoricalData(symbol, '1y');
      
      if (historicalData.length > 0) {
        const highs = historicalData.map(d => d.high).filter(h => h > 0);
        const lows = historicalData.map(d => d.low).filter(l => l > 0);
        
        if (highs.length > 0 && lows.length > 0) {
          const week52High = Math.max(...highs);
          const week52Low = Math.min(...lows);
          const range = week52High - week52Low;
          
          // Calculate where the current price sits in the 52-week range (0% = at low, 100% = at high)
          const week52ChangePercent = range > 0 
            ? ((quote.price - week52Low) / range) * 100 
            : 50;
          
          console.log(`[${symbol}] 52W: Low=${week52Low.toFixed(2)}, High=${week52High.toFixed(2)}, Current=${quote.price.toFixed(2)} (${week52ChangePercent.toFixed(1)}% im Bereich)`);
          
          return {
            ...quote,
            week52High,
            week52Low,
            week52ChangePercent
          };
        }
      }
      
      return quote;
    } catch (error) {
      console.error(`Failed to fetch extended quote for ${symbol}:`, error);
      return this.getQuote(symbol);
    }
  }

  // Fetch multiple quotes with 52-week range data
  async getQuotesWithRange(symbols: string[]): Promise<Stock[]> {
    const quotes = await Promise.all(symbols.map((s) => this.getQuoteWithRange(s)));
    return quotes.filter((q): q is Stock => q !== null);
  }

  // Get market news (using Finnhub if API key is available)
  async getMarketNews(): Promise<any[]> {
    if (!this.apiKey) return [];
    
    try {
      const response = await axios.get(`${FINNHUB_API}/news`, {
        params: {
          category: 'general',
          token: this.apiKey,
        },
      });
      return response.data.slice(0, 10);
    } catch (error) {
      console.error('Failed to fetch news:', error);
      return [];
    }
  }
}

export const marketDataService = new MarketDataService();
