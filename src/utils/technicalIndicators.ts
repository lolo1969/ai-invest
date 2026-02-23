import type { HistoricalData } from '../types';

/**
 * Technische Indikatoren berechnet aus historischen Kursdaten.
 * Diese werden der KI als Entscheidungsgrundlage übergeben.
 */

export interface TechnicalIndicators {
  // RSI (Relative Strength Index) - 14 Tage
  rsi14: number | null;
  
  // Moving Averages
  sma20: number | null;   // Simple Moving Average 20 Tage
  sma50: number | null;   // Simple Moving Average 50 Tage
  sma200: number | null;  // Simple Moving Average 200 Tage
  ema12: number | null;   // Exponential Moving Average 12 Tage
  ema26: number | null;   // Exponential Moving Average 26 Tage
  
  // MACD (Moving Average Convergence Divergence)
  macd: number | null;         // MACD-Linie (EMA12 - EMA26)
  macdSignal: number | null;   // Signal-Linie (EMA9 von MACD)
  macdHistogram: number | null; // MACD-Histogramm
  
  // Bollinger Bands (20 Tage, 2 Std-Abweichungen)
  bollingerUpper: number | null;
  bollingerMiddle: number | null;  // = SMA20
  bollingerLower: number | null;
  bollingerPercentB: number | null; // Position im Band (0-1, >1 = über oberem Band)
  
  // 52-Wochen-Daten
  week52High: number | null;
  week52Low: number | null;
  week52PositionPercent: number | null; // 0-100%, wo der Kurs im 52W-Bereich steht
  
  // Volumen-Indikatoren
  avgVolume20: number | null;    // Durchschnittsvolumen 20 Tage
  volumeRatio: number | null;    // Aktuelles Volumen / Avg (>1 = überdurchschnittlich)
  
  // Trends
  priceChange5d: number | null;   // Kursänderung 5 Tage in %
  priceChange20d: number | null;  // Kursänderung 20 Tage in %
  priceChange60d: number | null;  // Kursänderung 60 Tage in %
  
  // Volatilität
  atr14: number | null;          // Average True Range 14 Tage
  volatility20: number | null;   // Annualisierte Volatilität (20-Tage Std)
}

/** Berechnet den Simple Moving Average */
function calculateSMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

/** Berechnet den Exponential Moving Average */
function calculateEMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  // Start mit SMA der ersten 'period' Werte
  let ema = data.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

/** Berechnet die vollständige EMA-Serie (für MACD-Signal) */
function calculateEMASeries(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = data.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  result.push(ema);
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

/** Berechnet den RSI (Relative Strength Index) */
function calculateRSI(closePrices: number[], period = 14): number | null {
  if (closePrices.length < period + 1) return null;
  
  // Berechne Preisänderungen
  const changes: number[] = [];
  for (let i = 1; i < closePrices.length; i++) {
    changes.push(closePrices[i] - closePrices[i - 1]);
  }
  
  // Erste Average Gain/Loss (SMA der ersten 'period' Werte)
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;
  
  // Smoothed RSI (Wilder's smoothing)
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/** Berechnet MACD (12, 26, 9) */
function calculateMACD(closePrices: number[]): { macd: number | null; signal: number | null; histogram: number | null } {
  if (closePrices.length < 35) return { macd: null, signal: null, histogram: null };
  
  const ema12Series = calculateEMASeries(closePrices, 12);
  const ema26Series = calculateEMASeries(closePrices, 26);
  
  if (ema12Series.length === 0 || ema26Series.length === 0) {
    return { macd: null, signal: null, histogram: null };
  }
  
  // MACD-Linie = EMA12 - EMA26 (aligniere die Serien)
  const offset = ema12Series.length - ema26Series.length;
  const macdSeries: number[] = [];
  for (let i = 0; i < ema26Series.length; i++) {
    macdSeries.push(ema12Series[i + offset] - ema26Series[i]);
  }
  
  if (macdSeries.length === 0) return { macd: null, signal: null, histogram: null };
  
  // Signal-Linie = EMA9 der MACD-Serie
  const signalSeries = calculateEMASeries(macdSeries, 9);
  
  const macd = macdSeries[macdSeries.length - 1];
  const signal = signalSeries.length > 0 ? signalSeries[signalSeries.length - 1] : null;
  const histogram = signal !== null ? macd - signal : null;
  
  return { macd, signal, histogram };
}

/** Berechnet Bollinger Bands (20 Tage, 2 Std-Abweichungen) */
function calculateBollingerBands(closePrices: number[], period = 20, stdDev = 2): {
  upper: number | null;
  middle: number | null;
  lower: number | null;
  percentB: number | null;
} {
  if (closePrices.length < period) return { upper: null, middle: null, lower: null, percentB: null };
  
  const slice = closePrices.slice(-period);
  const middle = slice.reduce((sum, v) => sum + v, 0) / period;
  
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / period;
  const sd = Math.sqrt(variance);
  
  const upper = middle + stdDev * sd;
  const lower = middle - stdDev * sd;
  const currentPrice = closePrices[closePrices.length - 1];
  const percentB = upper !== lower ? (currentPrice - lower) / (upper - lower) : 0.5;
  
  return { upper, middle, lower, percentB };
}

/** Berechnet den Average True Range (14 Tage) */
function calculateATR(data: HistoricalData[], period = 14): number | null {
  if (data.length < period + 1) return null;
  
  const trueRanges: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  // Wilder's smoothing für ATR
  let atr = trueRanges.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  
  return atr;
}

/** Berechnet die annualisierte Volatilität */
function calculateVolatility(closePrices: number[], period = 20): number | null {
  if (closePrices.length < period + 1) return null;
  
  const returns: number[] = [];
  const slice = closePrices.slice(-(period + 1));
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] > 0) {
      returns.push(Math.log(slice[i] / slice[i - 1]));
    }
  }
  
  if (returns.length < 2) return null;
  
  const mean = returns.reduce((sum, v) => sum + v, 0) / returns.length;
  const variance = returns.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (returns.length - 1);
  
  // Annualisieren (252 Handelstage)
  return Math.sqrt(variance * 252) * 100; // in Prozent
}

/**
 * Berechnet alle technischen Indikatoren aus historischen Kursdaten.
 * Benötigt mindestens 200+ Tage Daten für zuverlässige Ergebnisse.
 */
export function calculateTechnicalIndicators(historicalData: HistoricalData[]): TechnicalIndicators {
  // Filtere ungültige Daten
  const validData = historicalData.filter(d => d.close > 0 && d.high > 0 && d.low > 0);
  
  if (validData.length < 15) {
    return createEmptyIndicators();
  }
  
  const closePrices = validData.map(d => d.close);
  const volumes = validData.map(d => d.volume);
  const highs = validData.map(d => d.high);
  const lows = validData.map(d => d.low);
  const currentPrice = closePrices[closePrices.length - 1];
  
  // RSI
  const rsi14 = calculateRSI(closePrices, 14);
  
  // Moving Averages
  const sma20 = calculateSMA(closePrices, 20);
  const sma50 = calculateSMA(closePrices, 50);
  const sma200 = calculateSMA(closePrices, 200);
  const ema12 = calculateEMA(closePrices, 12);
  const ema26 = calculateEMA(closePrices, 26);
  
  // MACD
  const macdResult = calculateMACD(closePrices);
  
  // Bollinger Bands
  const bollinger = calculateBollingerBands(closePrices);
  
  // 52-Wochen-Daten
  const week52High = highs.length > 0 ? Math.max(...highs) : null;
  const week52Low = lows.length > 0 ? Math.min(...lows.filter(l => l > 0)) : null;
  let week52PositionPercent: number | null = null;
  if (week52High !== null && week52Low !== null && week52High > week52Low) {
    week52PositionPercent = ((currentPrice - week52Low) / (week52High - week52Low)) * 100;
  }
  
  // Volumen
  const avgVolume20 = calculateSMA(volumes, 20);
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = avgVolume20 && avgVolume20 > 0 ? currentVolume / avgVolume20 : null;
  
  // Kurstrends
  const priceChange5d = closePrices.length >= 6 
    ? ((currentPrice - closePrices[closePrices.length - 6]) / closePrices[closePrices.length - 6]) * 100 
    : null;
  const priceChange20d = closePrices.length >= 21 
    ? ((currentPrice - closePrices[closePrices.length - 21]) / closePrices[closePrices.length - 21]) * 100 
    : null;
  const priceChange60d = closePrices.length >= 61 
    ? ((currentPrice - closePrices[closePrices.length - 61]) / closePrices[closePrices.length - 61]) * 100 
    : null;
  
  // ATR & Volatilität
  const atr14 = calculateATR(validData, 14);
  const volatility20 = calculateVolatility(closePrices, 20);
  
  return {
    rsi14,
    sma20,
    sma50,
    sma200,
    ema12,
    ema26,
    macd: macdResult.macd,
    macdSignal: macdResult.signal,
    macdHistogram: macdResult.histogram,
    bollingerUpper: bollinger.upper,
    bollingerMiddle: bollinger.middle,
    bollingerLower: bollinger.lower,
    bollingerPercentB: bollinger.percentB,
    week52High,
    week52Low,
    week52PositionPercent,
    avgVolume20,
    volumeRatio,
    priceChange5d,
    priceChange20d,
    priceChange60d,
    atr14,
    volatility20,
  };
}

function createEmptyIndicators(): TechnicalIndicators {
  return {
    rsi14: null,
    sma20: null,
    sma50: null,
    sma200: null,
    ema12: null,
    ema26: null,
    macd: null,
    macdSignal: null,
    macdHistogram: null,
    bollingerUpper: null,
    bollingerMiddle: null,
    bollingerLower: null,
    bollingerPercentB: null,
    week52High: null,
    week52Low: null,
    week52PositionPercent: null,
    avgVolume20: null,
    volumeRatio: null,
    priceChange5d: null,
    priceChange20d: null,
    priceChange60d: null,
    atr14: null,
    volatility20: null,
  };
}

/**
 * Formatiert technische Indikatoren als lesbare Zusammenfassung für die KI.
 */
export function formatIndicatorsForAI(_symbol: string, price: number, indicators: TechnicalIndicators): string {
  const lines: string[] = [];
  
  // RSI
  if (indicators.rsi14 !== null) {
    const rsiValue = indicators.rsi14.toFixed(1);
    let rsiLabel = '';
    if (indicators.rsi14 > 70) rsiLabel = ' (ÜBERKAUFT)';
    else if (indicators.rsi14 > 60) rsiLabel = ' (leicht überkauft)';
    else if (indicators.rsi14 < 30) rsiLabel = ' (ÜBERVERKAUFT)';
    else if (indicators.rsi14 < 40) rsiLabel = ' (leicht überverkauft)';
    else rsiLabel = ' (neutral)';
    lines.push(`  RSI(14): ${rsiValue}${rsiLabel}`);
  }
  
  // Moving Averages vs. aktueller Kurs
  const maLines: string[] = [];
  if (indicators.sma20 !== null) {
    const diff = ((price - indicators.sma20) / indicators.sma20 * 100).toFixed(1);
    maLines.push(`SMA20: ${indicators.sma20.toFixed(2)} (${Number(diff) >= 0 ? '+' : ''}${diff}%)`);
  }
  if (indicators.sma50 !== null) {
    const diff = ((price - indicators.sma50) / indicators.sma50 * 100).toFixed(1);
    maLines.push(`SMA50: ${indicators.sma50.toFixed(2)} (${Number(diff) >= 0 ? '+' : ''}${diff}%)`);
  }
  if (indicators.sma200 !== null) {
    const diff = ((price - indicators.sma200) / indicators.sma200 * 100).toFixed(1);
    maLines.push(`SMA200: ${indicators.sma200.toFixed(2)} (${Number(diff) >= 0 ? '+' : ''}${diff}%)`);
  }
  if (maLines.length > 0) {
    lines.push(`  Moving Averages: ${maLines.join(' | ')}`);
  }
  
  // Golden Cross / Death Cross
  if (indicators.sma50 !== null && indicators.sma200 !== null) {
    if (indicators.sma50 > indicators.sma200) {
      lines.push(`  Trend: SMA50 > SMA200 → Bullish (Golden Cross Umfeld)`);
    } else {
      lines.push(`  Trend: SMA50 < SMA200 → Bearish (Death Cross Umfeld)`);
    }
  }
  
  // MACD
  if (indicators.macd !== null && indicators.macdSignal !== null) {
    const macdStr = indicators.macd.toFixed(2);
    const signalStr = indicators.macdSignal.toFixed(2);
    const histStr = indicators.macdHistogram?.toFixed(2) ?? '–';
    const macdTrend = indicators.macd > indicators.macdSignal ? 'Bullish' : 'Bearish';
    lines.push(`  MACD: ${macdStr} | Signal: ${signalStr} | Histogramm: ${histStr} → ${macdTrend}`);
  }
  
  // Bollinger Bands
  if (indicators.bollingerUpper !== null && indicators.bollingerLower !== null && indicators.bollingerPercentB !== null) {
    const pBStr = (indicators.bollingerPercentB * 100).toFixed(0);
    let bbLabel = '';
    if (indicators.bollingerPercentB > 1) bbLabel = ' – ÜBER oberem Band!';
    else if (indicators.bollingerPercentB > 0.8) bbLabel = ' – nahe oberem Band';
    else if (indicators.bollingerPercentB < 0) bbLabel = ' – UNTER unterem Band!';
    else if (indicators.bollingerPercentB < 0.2) bbLabel = ' – nahe unterem Band';
    lines.push(`  Bollinger Bands: ${indicators.bollingerLower.toFixed(2)} – ${indicators.bollingerUpper.toFixed(2)} (%B: ${pBStr}%${bbLabel})`);
  }
  
  // 52-Wochen
  if (indicators.week52High !== null && indicators.week52Low !== null) {
    const posStr = indicators.week52PositionPercent?.toFixed(0) ?? '–';
    lines.push(`  52W-Bereich: ${indicators.week52Low.toFixed(2)} – ${indicators.week52High.toFixed(2)} (Position: ${posStr}%)`);
  }
  
  // Kurstrends
  const trends: string[] = [];
  if (indicators.priceChange5d !== null) trends.push(`5T: ${indicators.priceChange5d >= 0 ? '+' : ''}${indicators.priceChange5d.toFixed(1)}%`);
  if (indicators.priceChange20d !== null) trends.push(`20T: ${indicators.priceChange20d >= 0 ? '+' : ''}${indicators.priceChange20d.toFixed(1)}%`);
  if (indicators.priceChange60d !== null) trends.push(`60T: ${indicators.priceChange60d >= 0 ? '+' : ''}${indicators.priceChange60d.toFixed(1)}%`);
  if (trends.length > 0) {
    lines.push(`  Kurstrend: ${trends.join(' | ')}`);
  }
  
  // Volumen
  if (indicators.volumeRatio !== null) {
    const volLabel = indicators.volumeRatio > 1.5 ? ' (HOHES Volumen!)' : indicators.volumeRatio < 0.5 ? ' (niedriges Volumen)' : '';
    lines.push(`  Volumen-Ratio: ${indicators.volumeRatio.toFixed(2)}x Durchschnitt${volLabel}`);
  }
  
  // Volatilität
  if (indicators.volatility20 !== null) {
    const volLabel = indicators.volatility20 > 50 ? ' (SEHR HOCH)' : indicators.volatility20 > 30 ? ' (hoch)' : indicators.volatility20 < 15 ? ' (niedrig)' : '';
    lines.push(`  Volatilität (20T ann.): ${indicators.volatility20.toFixed(1)}%${volLabel}`);
  }
  
  // ATR
  if (indicators.atr14 !== null) {
    const atrPercent = (indicators.atr14 / price * 100).toFixed(1);
    lines.push(`  ATR(14): ${indicators.atr14.toFixed(2)} (${atrPercent}% des Kurses)`);
  }
  
  return lines.join('\n');
}
