import axios from 'axios';
import type { Stock, HistoricalData } from '../types';
import { calculateTechnicalIndicators } from '../utils/technicalIndicators';

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

// Cache for all currency → EUR rates
const cachedFxRates: Record<string, { rate: number; timestamp: number }> = {};

// Fallback demo data when API fails
const DEMO_STOCKS: Record<string, Stock> = {
  'AAPL': { symbol: 'AAPL', name: 'Apple Inc.', price: 165.00, change: 2.30, changePercent: 1.31, currency: 'EUR', exchange: 'NASDAQ', isFallback: true },
  'MSFT': { symbol: 'MSFT', name: 'Microsoft Corporation', price: 350.00, change: -1.20, changePercent: -0.32, currency: 'EUR', exchange: 'NASDAQ', isFallback: true },
  'GOOGL': { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 132.00, change: 0.85, changePercent: 0.60, currency: 'EUR', exchange: 'NASDAQ', isFallback: true },
  'AMZN': { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 165.00, change: 3.40, changePercent: 1.94, currency: 'EUR', exchange: 'NASDAQ', isFallback: true },
  'TSLA': { symbol: 'TSLA', name: 'Tesla Inc.', price: 230.00, change: -5.20, changePercent: -2.05, currency: 'EUR', exchange: 'NASDAQ', isFallback: true },
  'NVDA': { symbol: 'NVDA', name: 'NVIDIA Corporation', price: 450.00, change: 12.30, changePercent: 2.60, currency: 'EUR', exchange: 'NASDAQ', isFallback: true },
  'META': { symbol: 'META', name: 'Meta Platforms Inc.', price: 355.00, change: 4.50, changePercent: 1.18, currency: 'EUR', exchange: 'NASDAQ', isFallback: true },
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
    return this.getFxRateToEur('USD');
  }

  // Get exchange rate for any currency → EUR
  async getFxRateToEur(currency: string): Promise<number> {
    const cur = currency.toUpperCase();
    if (cur === 'EUR') return 1;
    
    // GBX = British Pence (1/100 GBP) — common for London-listed stocks
    if (cur === 'GBX' || cur === 'GBP') {
      const gbpRate = await this._fetchFxRate('GBP');
      // GBX is pence, so divide by 100
      return cur === 'GBX' ? gbpRate / 100 : gbpRate;
    }
    
    return this._fetchFxRate(cur);
  }

  // Internal: fetch and cache an FX rate for currency → EUR
  private async _fetchFxRate(currency: string): Promise<number> {
    // Return cached rate if still valid
    const cached = cachedFxRates[currency];
    if (cached && Date.now() - cached.timestamp < RATE_CACHE_DURATION) {
      return cached.rate;
    }

    // Also populate cachedEurUsdRate for backward compat
    if (currency === 'USD' && cachedEurUsdRate && Date.now() - cachedEurUsdRate.timestamp < RATE_CACHE_DURATION) {
      return cachedEurUsdRate.rate;
    }

    try {
      // Yahoo Finance: XXXEUR=X gives how many EUR per 1 XXX
      // For USD: we use EURUSD=X (gives USD per EUR, need inverse)
      // For others: use XXXEUR=X directly
      let pair: string;
      let needsInverse = false;
      
      if (currency === 'USD') {
        pair = 'EURUSD=X'; // gives ~1.08 (USD per EUR) → we need 1/1.08
        needsInverse = true;
      } else {
        pair = `${currency}EUR=X`; // gives EUR per 1 unit of currency
      }

      const url = buildYahooUrl(`/v8/finance/chart/${pair}?interval=1d&range=1d`);
      const response = await this.fetchWithRetry(() => axios.get(url, { timeout: 10000 }));
      const result = response.data.chart.result?.[0];
      
      if (result?.meta?.regularMarketPrice) {
        let rate: number;
        if (needsInverse) {
          rate = 1 / result.meta.regularMarketPrice;
        } else {
          rate = result.meta.regularMarketPrice;
        }
        
        cachedFxRates[currency] = { rate, timestamp: Date.now() };
        // Backward compat
        if (currency === 'USD') {
          cachedEurUsdRate = { rate, timestamp: Date.now() };
        }
        console.log(`[FX] 1 ${currency} = ${rate.toFixed(4)} EUR`);
        return rate;
      }
    } catch (error) {
      console.error(`[FX] Failed to fetch ${currency}→EUR rate:`, error);
    }

    // Fallback rates
    const fallbackRates: Record<string, number> = {
      'USD': 0.92,
      'GBP': 1.17,
      'CHF': 1.05,
      'CAD': 0.68,
      'JPY': 0.0061,
      'SEK': 0.088,
      'DKK': 0.134,
      'NOK': 0.086,
      'AUD': 0.60,
      'HKD': 0.118,
    };
    const fallback = fallbackRates[currency] || 1;
    console.warn(`[FX] Using fallback rate: 1 ${currency} = ${fallback} EUR`);
    return fallback;
  }

  // Convert a price from any currency to EUR
  async convertToEur(price: number, fromCurrency: string): Promise<number> {
    const cur = fromCurrency.toUpperCase();
    if (cur === 'EUR') return price;
    const rate = await this.getFxRateToEur(cur);
    return price * rate;
  }

  // Fetch a single quote using Yahoo Finance chart endpoint - always returns EUR
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
      
      // Convert any non-EUR currency to EUR
      if (originalCurrency.toUpperCase() !== 'EUR') {
        const fxRate = await this.getFxRateToEur(originalCurrency);
        const origPrice = price;
        price = price * fxRate;
        previousClose = previousClose * fxRate;
        console.log(`[FX] Converted ${symbol}: ${origPrice} ${originalCurrency} → ${price.toFixed(2)} EUR (rate: ${fxRate.toFixed(6)})`);
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

  // Fetch ALL quotes in a single batch request using Yahoo Finance quote endpoint
  // This uses 1 HTTP request for ALL symbols instead of 1 per symbol!
  async getQuotesBatch(symbols: string[]): Promise<Stock[]> {
    if (symbols.length === 0) return [];
    
    const symbolsStr = symbols.join(',');
    console.log(`[MarketData] Batch-Quote für ${symbols.length} Symbole: ${symbolsStr}`);
    
    try {
      const url = buildYahooUrl(`/v7/finance/quote?symbols=${encodeURIComponent(symbolsStr)}&fields=symbol,shortName,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,currency,fullExchangeName`);
      const response = await this.fetchWithRetry(() => axios.get(url, { timeout: 15000 }));
      
      const quotes = response.data?.quoteResponse?.result || [];
      console.log(`[MarketData] Batch-Quote: ${quotes.length}/${symbols.length} erhalten`);
      
      if (quotes.length === 0) {
        console.warn('[MarketData] Batch-Quote leer, fallback auf Einzel-Requests');
        return this.getQuotesFallback(symbols);
      }
      
      // Pre-fetch FX rates for all currencies in this batch
      const currencies = new Set(quotes.map((q: any) => (q.currency || 'USD').toUpperCase()));
      const fxRates: Record<string, number> = { EUR: 1 };
      for (const cur of currencies) {
        const currency = cur as string;
        if (currency !== 'EUR') {
          fxRates[currency] = await this.getFxRateToEur(currency);
        }
      }
      console.log('[MarketData] FX-Raten:', fxRates);
      
      const stocks: Stock[] = [];
      for (const q of quotes) {
        try {
          let price = q.regularMarketPrice || 0;
          let previousClose = q.regularMarketPreviousClose || price;
          const originalCurrency = (q.currency || 'USD').toUpperCase();
          
          if (originalCurrency !== 'EUR') {
            const rate = fxRates[originalCurrency] || 1;
            price = price * rate;
            previousClose = previousClose * rate;
          }
          
          const change = previousClose > 0 ? price - previousClose : 0;
          const changePercent = previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;
          
          stocks.push({
            symbol: q.symbol,
            name: q.shortName || q.longName || q.symbol,
            price,
            change,
            changePercent,
            currency: 'EUR',
            exchange: q.fullExchangeName || 'Unknown',
          });
        } catch (err) {
          console.warn(`[MarketData] Fehler bei ${q.symbol}:`, err);
        }
      }
      
      return stocks;
    } catch (error) {
      console.warn('[MarketData] Batch-Quote fehlgeschlagen, fallback auf Einzel-Requests:', error);
      return this.getQuotesFallback(symbols);
    }
  }

  // Fallback: fetch quotes one by one (used when batch endpoint fails)
  private async getQuotesFallback(symbols: string[]): Promise<Stock[]> {
    const batchSize = 5;
    const results: (Stock | null)[] = [];
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((s) => this.getQuote(s)));
      results.push(...batchResults);
      
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return results.filter((q): q is Stock => q !== null);
  }

  // Legacy method - kept for compatibility (Watchlist refresh etc.)
  async getQuotes(symbols: string[]): Promise<Stock[]> {
    return this.getQuotesBatch(symbols);
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

  // Fetch quote with 52-week high/low data AND full technical indicators for AI analysis
  async getQuoteWithRange(symbol: string): Promise<Stock | null> {
    try {
      // First get current quote
      const quote = await this.getQuote(symbol);
      if (!quote) return null;

      // Then fetch 1-year historical data to calculate 52-week range + technical indicators
      const historicalData = await this.getHistoricalData(symbol, '1y');
      
      if (historicalData.length > 0) {
        const highs = historicalData.map(d => d.high).filter(h => h > 0);
        const lows = historicalData.map(d => d.low).filter(l => l > 0);
        
        // Calculate technical indicators (RSI, MACD, SMA, Bollinger etc.)
        const technicalIndicators = calculateTechnicalIndicators(historicalData);
        
        if (highs.length > 0 && lows.length > 0) {
          const week52High = Math.max(...highs);
          const week52Low = Math.min(...lows);
          const range = week52High - week52Low;
          
          // Calculate where the current price sits in the 52-week range (0% = at low, 100% = at high)
          const week52ChangePercent = range > 0 
            ? ((quote.price - week52Low) / range) * 100 
            : 50;
          
          console.log(`[${symbol}] 52W: Low=${week52Low.toFixed(2)}, High=${week52High.toFixed(2)}, Current=${quote.price.toFixed(2)} (${week52ChangePercent.toFixed(1)}% im Bereich)`);
          if (technicalIndicators.rsi14 !== null) {
            console.log(`[${symbol}] RSI(14): ${technicalIndicators.rsi14.toFixed(1)}, MACD: ${technicalIndicators.macd?.toFixed(2) ?? '–'}, SMA50: ${technicalIndicators.sma50?.toFixed(2) ?? '–'}, SMA200: ${technicalIndicators.sma200?.toFixed(2) ?? '–'}`);
          }
          
          return {
            ...quote,
            week52High,
            week52Low,
            week52ChangePercent,
            technicalIndicators,
          };
        }

        // Even without 52W data, still add technical indicators
        return {
          ...quote,
          technicalIndicators,
        };
      }
      
      return quote;
    } catch (error) {
      console.error(`Failed to fetch extended quote for ${symbol}:`, error);
      return this.getQuote(symbol);
    }
  }

  // Fetch multiple quotes with 52-week range data
  // Strategy: First load ALL basic quotes in 1 batch request, then enrich with historical data
  async getQuotesWithRange(symbols: string[]): Promise<Stock[]> {
    // Step 1: Load ALL basic quotes in a single batch request (1 HTTP call!)
    console.log(`[MarketData] Lade ${symbols.length} Aktien (Batch-Modus)...`);
    const basicQuotes = await this.getQuotesBatch(symbols);
    console.log(`[MarketData] ${basicQuotes.length}/${symbols.length} Basis-Quotes geladen`);
    
    if (basicQuotes.length === 0) return [];

    // Step 2: Enrich with historical data + technical indicators in small batches
    // History must be fetched per-symbol (no batch endpoint), so we use small batches with delays
    const batchSize = 3;
    const enrichedResults: Stock[] = [];
    
    for (let i = 0; i < basicQuotes.length; i += batchSize) {
      const batch = basicQuotes.slice(i, i + batchSize);
      const enrichedBatch = await Promise.all(
        batch.map(async (quote) => {
          try {
            const historicalData = await this.getHistoricalData(quote.symbol, '1y');
            
            if (historicalData.length > 0) {
              const highs = historicalData.map(d => d.high).filter(h => h > 0);
              const lows = historicalData.map(d => d.low).filter(l => l > 0);
              const technicalIndicators = calculateTechnicalIndicators(historicalData);
              
              if (highs.length > 0 && lows.length > 0) {
                const week52High = Math.max(...highs);
                const week52Low = Math.min(...lows);
                const range = week52High - week52Low;
                const week52ChangePercent = range > 0 
                  ? ((quote.price - week52Low) / range) * 100 
                  : 50;
                
                return { ...quote, week52High, week52Low, week52ChangePercent, technicalIndicators };
              }
              return { ...quote, technicalIndicators };
            }
            return quote;
          } catch (error) {
            console.warn(`[MarketData] History für ${quote.symbol} fehlgeschlagen, nutze Basis-Quote`, error);
            return quote; // Return basic quote even if history fails
          }
        })
      );
      enrichedResults.push(...enrichedBatch);
      
      // Pause between batches to avoid rate limiting on history endpoint
      if (i + batchSize < basicQuotes.length) {
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }
    
    console.log(`[MarketData] ${enrichedResults.length}/${symbols.length} Aktien erfolgreich geladen (davon ${enrichedResults.filter(s => s.technicalIndicators).length} mit Indikatoren)`);
    return enrichedResults;
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
