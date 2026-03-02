/**
 * Server-seitiger MarketData-Service
 * Greift direkt auf Yahoo Finance zu (kein Browser-Proxy nötig).
 */

import axios from 'axios';

const YAHOO_BASE = 'https://query1.finance.yahoo.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export interface ServerStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  exchange: string;
  isFallback?: boolean;
}

// FX-Rate Cache
const fxCache: Record<string, { rate: number; ts: number }> = {};
const FX_CACHE_TTL = 3600_000; // 1h

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1500): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isNetworkError = 
        error?.code === 'ENETDOWN' || error?.code === 'ECONNRESET' ||
        error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND' ||
        error?.code === 'ERR_NETWORK' || error?.message?.includes('timeout');
      
      if (isNetworkError && attempt < retries) {
        const wait = delayMs * Math.pow(2, attempt);
        console.warn(`[ServerMarketData] Retry ${attempt + 1}/${retries} in ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

async function getFxRateToEur(currency: string): Promise<number> {
  const cur = currency.toUpperCase();
  if (cur === 'EUR') return 1;
  
  // GBX = British Pence
  if (cur === 'GBX' || cur === 'GBP') {
    const gbpRate = await _fetchFxRate('GBP');
    return cur === 'GBX' ? gbpRate / 100 : gbpRate;
  }
  
  return _fetchFxRate(cur);
}

async function _fetchFxRate(currency: string): Promise<number> {
  const cached = fxCache[currency];
  if (cached && Date.now() - cached.ts < FX_CACHE_TTL) return cached.rate;

  try {
    let pair: string;
    let needsInverse = false;
    if (currency === 'USD') {
      pair = 'EURUSD=X';
      needsInverse = true;
    } else {
      pair = `${currency}EUR=X`;
    }

    const url = `${YAHOO_BASE}/v8/finance/chart/${pair}?interval=1d&range=1d`;
    const response = await fetchWithRetry(() => 
      axios.get(url, { timeout: 10000, headers: { 'User-Agent': USER_AGENT } })
    );
    const result = response.data.chart.result?.[0];
    
    if (result?.meta?.regularMarketPrice) {
      const rate = needsInverse ? 1 / result.meta.regularMarketPrice : result.meta.regularMarketPrice;
      fxCache[currency] = { rate, ts: Date.now() };
      console.log(`[FX] 1 ${currency} = ${rate.toFixed(4)} EUR`);
      return rate;
    }
  } catch (error) {
    console.error(`[FX] Failed to fetch ${currency}→EUR:`, error);
  }

  // Fallback rates
  const fallbacks: Record<string, number> = {
    USD: 0.92, GBP: 1.17, CHF: 1.05, CAD: 0.68, JPY: 0.0061,
    SEK: 0.088, DKK: 0.134, NOK: 0.086, AUD: 0.60, HKD: 0.118,
  };
  return fallbacks[currency] || 1;
}

/**
 * Einzelne Aktie laden
 */
export async function getQuote(symbol: string): Promise<ServerStock | null> {
  try {
    const url = `${YAHOO_BASE}/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const response = await fetchWithRetry(() => 
      axios.get(url, { timeout: 10000, headers: { 'User-Agent': USER_AGENT } })
    );

    const result = response.data.chart.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    let price = meta.regularMarketPrice || 0;
    let previousClose = meta.previousClose || meta.chartPreviousClose || price;
    const originalCurrency = meta.currency || 'USD';

    if (originalCurrency.toUpperCase() !== 'EUR') {
      const fxRate = await getFxRateToEur(originalCurrency);
      price = price * fxRate;
      previousClose = previousClose * fxRate;
    }

    const change = previousClose > 0 ? price - previousClose : 0;
    const changePercent = previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;

    return {
      symbol: meta.symbol,
      name: meta.shortName || meta.longName || symbol,
      price,
      change,
      changePercent,
      currency: 'EUR',
      exchange: meta.exchangeName || 'Unknown',
    };
  } catch (error) {
    console.error(`[ServerMarketData] Fehler bei ${symbol}:`, error);
    return null;
  }
}

/**
 * Batch-Quotes laden (1 HTTP Request für alle Symbole)
 */
export async function getQuotesBatch(symbols: string[]): Promise<ServerStock[]> {
  if (symbols.length === 0) return [];
  
  const symbolsStr = symbols.join(',');
  console.log(`[ServerMarketData] Batch-Quote für ${symbols.length} Symbole`);
  
  try {
    const url = `${YAHOO_BASE}/v7/finance/quote?symbols=${encodeURIComponent(symbolsStr)}&fields=symbol,shortName,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,currency,fullExchangeName`;
    const response = await fetchWithRetry(() => 
      axios.get(url, { timeout: 15000, headers: { 'User-Agent': USER_AGENT } })
    );
    
    const quotes = response.data?.quoteResponse?.result || [];
    if (quotes.length === 0) {
      return getQuotesFallback(symbols);
    }

    // Pre-fetch FX rates
    const currencies = new Set(quotes.map((q: any) => (q.currency || 'USD').toUpperCase()));
    const fxRates: Record<string, number> = { EUR: 1 };
    for (const cur of currencies) {
      if (cur !== 'EUR') {
        fxRates[cur as string] = await getFxRateToEur(cur as string);
      }
    }

    const stocks: ServerStock[] = [];
    for (const q of quotes) {
      let price = q.regularMarketPrice || 0;
      let previousClose = q.regularMarketPreviousClose || price;
      const originalCurrency = (q.currency || 'USD').toUpperCase();

      if (originalCurrency !== 'EUR') {
        const rate = fxRates[originalCurrency] || 1;
        price *= rate;
        previousClose *= rate;
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
    }
    
    return stocks;
  } catch (error) {
    console.warn('[ServerMarketData] Batch fehlgeschlagen, Fallback auf Einzel-Requests');
    return getQuotesFallback(symbols);
  }
}

/**
 * Historische Daten laden (für technische Indikatoren)
 */
export async function getHistoricalData(symbol: string, range: string = '1y'): Promise<Array<{ date: Date; open: number; high: number; low: number; close: number; volume: number }>> {
  try {
    const interval = range === '1d' ? '5m' : '1d';
    const url = `${YAHOO_BASE}/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
    const response = await fetchWithRetry(() =>
      axios.get(url, { timeout: 10000, headers: { 'User-Agent': USER_AGENT } })
    );

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
    console.error(`[ServerMarketData] History für ${symbol} fehlgeschlagen:`, error);
    return [];
  }
}

/**
 * Quotes mit 52-Wochen-Range und technischen Indikatoren
 */
export async function getQuotesWithRange(symbols: string[], calculateIndicators?: (data: any[]) => any): Promise<any[]> {
  const basicQuotes = await getQuotesBatch(symbols);
  if (basicQuotes.length === 0) return [];

  const batchSize = 3;
  const enriched: any[] = [];

  for (let i = 0; i < basicQuotes.length; i += batchSize) {
    const batch = basicQuotes.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (quote) => {
        try {
          const historicalData = await getHistoricalData(quote.symbol, '1y');
          if (historicalData.length > 0) {
            const highs = historicalData.map(d => d.high).filter(h => h > 0);
            const lows = historicalData.map(d => d.low).filter(l => l > 0);
            
            let indicators: any = undefined;
            if (calculateIndicators) {
              indicators = calculateIndicators(historicalData);
            }

            if (highs.length > 0 && lows.length > 0) {
              const week52High = Math.max(...highs);
              const week52Low = Math.min(...lows);
              const range = week52High - week52Low;
              const week52ChangePercent = range > 0
                ? ((quote.price - week52Low) / range) * 100
                : 50;
              return { ...quote, week52High, week52Low, week52ChangePercent, technicalIndicators: indicators };
            }
            return { ...quote, technicalIndicators: indicators };
          }
          return quote;
        } catch {
          return quote;
        }
      })
    );
    enriched.push(...results);
    if (i + batchSize < basicQuotes.length) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  return enriched;
}

async function getQuotesFallback(symbols: string[]): Promise<ServerStock[]> {
  const results: ServerStock[] = [];
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(s => getQuote(s)));
    results.push(...batchResults.filter((q): q is ServerStock => q !== null));
    if (i + 5 < symbols.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return results;
}
