/**
 * Server-seitiger Autopilot-Runner
 * Repliziert die Logik aus autopilotService.ts, aber für den Server-Kontext.
 * Arbeitet mit dem file-basierten StateManager statt Zustand/React.
 */

import * as state from './stateManager.js';
import * as market from './marketData.js';
import { calculateTechnicalIndicators } from '../src/utils/technicalIndicators.js';

// ─── Helpers ──────────────────────────────────────────

function createLogEntry(
  type: string,
  message: string,
  details?: string,
  symbol?: string,
  orderId?: string
) {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    message,
    details,
    symbol,
    orderId,
  };
}

function getTimeInZone(tz: string): { hours: number; minutes: number; day: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const rawHours = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const hours = rawHours === 24 ? 0 : rawHours;
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value ?? '';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[weekdayStr] ?? new Date().getDay();
  return { hours, minutes, day };
}

function isMarketOpen(): { open: boolean; market?: string } {
  const eu = getTimeInZone('Europe/Berlin');
  if (eu.day >= 1 && eu.day <= 5) {
    const euTime = eu.hours * 60 + eu.minutes;
    if (euTime >= 9 * 60 && euTime < 17 * 60 + 30) {
      return { open: true, market: 'EU (Xetra)' };
    }
  }
  const us = getTimeInZone('America/New_York');
  if (us.day >= 1 && us.day <= 5) {
    const usTime = us.hours * 60 + us.minutes;
    if (usTime >= 9 * 60 + 30 && usTime < 16 * 60) {
      return { open: true, market: 'US (NYSE)' };
    }
  }
  return { open: false };
}

// ─── AI Service (direkte API-Calls) ──────────────────

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if ((response.status === 429 || response.status === 529 || response.status === 503) && attempt < maxRetries) {
      const retryAfter = response.headers.get('retry-after');
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : (5000 * Math.pow(2, attempt));
      console.warn(`[AI API] Status ${response.status} - Retry ${attempt + 1}/${maxRetries} in ${waitMs}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    return response;
  }
  throw new Error('Max retries exceeded');
}

async function callAI(prompt: string, appSettings: state.ServerState['settings']): Promise<string> {
  const provider = appSettings.aiProvider;
  const apiKey = provider === 'openai' ? appSettings.apiKeys.openai
    : provider === 'gemini' ? appSettings.apiKeys.gemini
    : appSettings.apiKeys.claude;

  if (!apiKey) throw new Error('Kein API-Key konfiguriert');

  if (provider === 'claude') {
    const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: appSettings.claudeModel,
        max_tokens: 32768,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API Error: ${err}`);
    }
    const data = await response.json() as any;
    return data.content[0]?.text || '';
  }

  if (provider === 'openai') {
    const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: appSettings.openaiModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 16384,
        temperature: 0.3,
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API Error: ${err}`);
    }
    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${appSettings.geminiModel}:generateContent?key=${apiKey}`;
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 16384 },
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API Error: ${err}`);
    }
    const data = await response.json() as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  throw new Error(`Unbekannter AI-Provider: ${provider}`);
}

// ─── AI Response Parser ──────────────────────────────

function parseAIResponse(content: string, stocks: any[], strategy?: string): any {
  // Extract JSON from response
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
  
  if (!jsonMatch) {
    return {
      signals: [],
      marketSummary: content.substring(0, 500),
      recommendations: [],
      warnings: [],
      suggestedOrders: [],
      analyzedAt: new Date(),
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[1].trim());
    
    const signals = (parsed.signals || []).map((s: any) => {
      const stockData = stocks.find(st => st.symbol === s.symbol) || {
        symbol: s.symbol, name: s.name || s.symbol, price: 0,
        change: 0, changePercent: 0, currency: 'EUR', exchange: '',
      };
      return {
        id: crypto.randomUUID(),
        stock: stockData,
        signal: s.signal || 'HOLD',
        strategy: strategy || 'middle',
        confidence: s.confidence || 50,
        reasoning: s.reasoning || '',
        idealEntryPrice: s.idealEntryPrice,
        targetPrice: s.targetPrice,
        stopLoss: s.stopLoss,
        createdAt: new Date(),
        riskLevel: s.riskLevel || 'medium',
      };
    });

    const suggestedOrders = (parsed.suggestedOrders || parsed.orders || []).map((o: any) => ({
      symbol: o.symbol,
      orderType: o.orderType || o.type || 'limit-buy',
      quantity: o.quantity || 0,
      triggerPrice: o.triggerPrice || o.price || 0,
      reasoning: o.reasoning || o.reason || '',
    }));

    return {
      signals,
      marketSummary: parsed.marketSummary || parsed.summary || content.substring(0, 500),
      recommendations: parsed.recommendations || [],
      warnings: parsed.warnings || [],
      suggestedOrders,
      analyzedAt: new Date(),
    };
  } catch {
    return {
      signals: [],
      marketSummary: content.substring(0, 500),
      recommendations: [],
      warnings: [],
      suggestedOrders: [],
      analyzedAt: new Date(),
    };
  }
}

// ─── Prompt Builder (angelehnt an aiService.ts) ──────

function buildAnalysisPrompt(data: {
  stocks: any[];
  strategy: string;
  riskTolerance: string;
  budget: number;
  positions: any[];
  signals: any[];
  activeOrders: any[];
  customPrompt?: string;
  initialCapital?: number;
  totalAssets?: number;
  portfolioValue?: number;
  totalProfit?: number;
  totalProfitPercent?: number;
  transactionFeeFlat?: number;
  transactionFeePercent?: number;
  previousProfit?: number;
}): string {
  const { stocks, strategy, riskTolerance, budget, positions, signals, activeOrders, customPrompt } = data;

  const strategyMap: Record<string, string> = {
    short: 'Kurzfristig (Tage bis Wochen)',
    middle: 'Mittelfristig (Wochen bis Monate)',
    long: 'Langfristig (Monate bis Jahre)',
  };

  // Technische Indikatoren formatieren
  let indicatorsText = '';
  for (const stock of stocks) {
    if (stock.technicalIndicators) {
      const ti = stock.technicalIndicators;
      indicatorsText += `\n${stock.symbol}: `;
      if (ti.rsi14 !== null && ti.rsi14 !== undefined) indicatorsText += `RSI(14)=${ti.rsi14.toFixed(1)} `;
      if (ti.macd !== null && ti.macd !== undefined) indicatorsText += `MACD=${ti.macd.toFixed(2)} `;
      if (ti.sma50 !== null && ti.sma50 !== undefined) indicatorsText += `SMA50=${ti.sma50.toFixed(2)} `;
      if (ti.sma200 !== null && ti.sma200 !== undefined) indicatorsText += `SMA200=${ti.sma200.toFixed(2)} `;
    }
  }

  let prompt = `Du bist ein professioneller KI-Investmentberater. Analysiere folgende Aktien und gib Handlungsempfehlungen.

STRATEGIE: ${strategyMap[strategy] || strategy}
RISIKOTOLERANZ: ${riskTolerance}
VERFÜGBARES BUDGET: ${budget.toFixed(2)} EUR`;

  if (data.initialCapital) {
    prompt += `\nSTARTKAPITAL: ${data.initialCapital.toFixed(2)} EUR`;
  }
  if (data.totalAssets) {
    prompt += `\nGESAMTVERMÖGEN: ${data.totalAssets.toFixed(2)} EUR`;
  }
  if (data.totalProfit !== undefined) {
    prompt += `\nGESAMTGEWINN: ${data.totalProfit.toFixed(2)} EUR (${data.totalProfitPercent?.toFixed(1)}%)`;
  }
  if (data.transactionFeeFlat || data.transactionFeePercent) {
    prompt += `\nTRANSAKTIONSGEBÜHREN: ${data.transactionFeeFlat || 0}€ fix + ${data.transactionFeePercent || 0}% variabel`;
  }

  prompt += `\n\nAKTIEN ZUR ANALYSE:
${stocks.map(s => `${s.symbol} (${s.name}): ${s.price.toFixed(2)} EUR, Veränderung: ${s.changePercent.toFixed(2)}%${s.week52High ? `, 52W: ${s.week52Low?.toFixed(2)}-${s.week52High.toFixed(2)}` : ''}`).join('\n')}`;

  if (indicatorsText) {
    prompt += `\n\nTECHNISCHE INDIKATOREN:${indicatorsText}`;
  }

  if (positions.length > 0) {
    prompt += `\n\nAKTUELLES PORTFOLIO:
${positions.map(p => `${p.symbol} (${p.name}): ${p.quantity}x @ ${p.buyPrice.toFixed(2)} EUR (aktuell: ${p.currentPrice.toFixed(2)} EUR)`).join('\n')}`;
  }

  if (activeOrders.length > 0) {
    prompt += `\n\nAKTIVE ORDERS:
${activeOrders.map(o => `${o.orderType.toUpperCase()} ${o.quantity}x ${o.symbol} @ ${o.triggerPrice.toFixed(2)} EUR`).join('\n')}`;
  }

  if (customPrompt) {
    prompt += `\n\nZUSÄTZLICHE ANWEISUNGEN:\n${customPrompt}`;
  }

  prompt += `\n\nAntworte AUSSCHLIESSLICH als JSON im folgenden Format:
\`\`\`json
{
  "marketSummary": "Kurze Marktanalyse...",
  "signals": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "signal": "BUY",
      "confidence": 75,
      "reasoning": "Begründung...",
      "idealEntryPrice": 150.00,
      "targetPrice": 170.00,
      "stopLoss": 140.00,
      "riskLevel": "medium"
    }
  ],
  "suggestedOrders": [
    {
      "symbol": "AAPL",
      "orderType": "limit-buy",
      "quantity": 5,
      "triggerPrice": 150.00,
      "reasoning": "Begründung für die Order..."
    }
  ],
  "recommendations": ["Empfehlung 1", "Empfehlung 2"],
  "warnings": ["Warnung 1"]
}
\`\`\`

WICHTIG:
- orderType muss eines sein: "limit-buy", "limit-sell", "stop-loss", "stop-buy"
- Alle Preise in EUR
- quantity muss eine ganze Zahl > 0 sein
- confidence von 0-100
- Bei Verkaufsorders (limit-sell, stop-loss): Nur für Aktien im Portfolio
- triggerPrice: Der Preis bei dem die Order ausgelöst werden soll`;

  return prompt;
}

// ─── Safety Rules ────────────────────────────────────

function applySafetyRules(
  suggestedOrders: any[],
  currentState: state.ServerState,
  logEntries: any[]
): any[] {
  const settings = currentState.autopilotSettings;
  const { cashBalance, userPositions, orders, orderSettings } = currentState;
  const totalPortfolioValue = userPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0) + cashBalance;

  const reservedCash = orders
    .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy'))
    .reduce((sum, o) => {
      const oCost = o.triggerPrice * o.quantity;
      const oFee = (orderSettings.transactionFeeFlat || 0) + oCost * (orderSettings.transactionFeePercent || 0) / 100;
      return sum + oCost + oFee;
    }, 0);
  let availableCash = cashBalance - reservedCash;

  const reservedShares = new Map<string, number>();
  orders
    .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss'))
    .forEach(o => {
      reservedShares.set(o.symbol, (reservedShares.get(o.symbol) || 0) + o.quantity);
    });

  const approved: any[] = [];
  let tradesThisCycle = 0;

  for (const order of suggestedOrders) {
    if (tradesThisCycle >= settings.maxTradesPerCycle) {
      logEntries.push(createLogEntry('skipped', `⏭️ ${order.symbol}: Max. Trades pro Zyklus erreicht`, undefined, order.symbol));
      continue;
    }

    const isBuy = order.orderType === 'limit-buy' || order.orderType === 'stop-buy';
    const isSell = order.orderType === 'limit-sell' || order.orderType === 'stop-loss';

    if (isBuy && !settings.allowBuy) {
      logEntries.push(createLogEntry('skipped', `⏭️ ${order.symbol}: Käufe deaktiviert`, undefined, order.symbol));
      continue;
    }
    if (isSell && !settings.allowSell) {
      logEntries.push(createLogEntry('skipped', `⏭️ ${order.symbol}: Verkäufe deaktiviert`, undefined, order.symbol));
      continue;
    }

    if (isBuy && !settings.allowNewPositions) {
      const existing = userPositions.find(p => p.symbol === order.symbol);
      if (!existing) {
        logEntries.push(createLogEntry('skipped', `⏭️ ${order.symbol}: Neue Positionen nicht erlaubt`, undefined, order.symbol));
        continue;
      }
    }

    if (settings.watchlistOnly) {
      const inWatchlist = currentState.settings.watchlist.includes(order.symbol);
      const inPortfolio = userPositions.some(p => p.symbol === order.symbol);
      if (!inWatchlist && !inPortfolio) {
        logEntries.push(createLogEntry('skipped', `⏭️ ${order.symbol}: Nicht in Watchlist/Portfolio`, undefined, order.symbol));
        continue;
      }
    }

    if (isBuy && totalPortfolioValue > 0) {
      const orderValue = order.triggerPrice * order.quantity;
      const existingValue = userPositions
        .filter(p => p.symbol === order.symbol)
        .reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
      const positionPercent = ((existingValue + orderValue) / totalPortfolioValue) * 100;
      if (positionPercent > settings.maxPositionPercent) {
        logEntries.push(createLogEntry('skipped', `⏭️ ${order.symbol}: Position wäre ${positionPercent.toFixed(1)}% > Max ${settings.maxPositionPercent}%`, undefined, order.symbol));
        continue;
      }
    }

    if (isBuy) {
      const orderCost = order.triggerPrice * order.quantity;
      const orderFee = (orderSettings.transactionFeeFlat || 0) + orderCost * (orderSettings.transactionFeePercent || 0) / 100;
      const totalOrderCost = orderCost + orderFee;
      const cashAfter = availableCash - totalOrderCost;
      const cashPercentAfter = totalPortfolioValue > 0 ? (cashAfter / totalPortfolioValue) * 100 : 0;

      if (cashPercentAfter < settings.minCashReservePercent) {
        logEntries.push(createLogEntry('skipped', `⏭️ ${order.symbol}: Cash-Reserve wäre ${cashPercentAfter.toFixed(1)}% < Min ${settings.minCashReservePercent}%`, undefined, order.symbol));
        continue;
      }
      if (totalOrderCost > availableCash) {
        logEntries.push(createLogEntry('skipped', `⏭️ ${order.symbol}: Nicht genug Cash (${totalOrderCost.toFixed(2)}€ > ${availableCash.toFixed(2)}€)`, undefined, order.symbol));
        continue;
      }
      availableCash -= totalOrderCost;
    }

    if (isSell) {
      const position = userPositions.find(p => p.symbol === order.symbol);
      const reserved = reservedShares.get(order.symbol) || 0;
      const available = (position?.quantity ?? 0) - reserved;
      if (!position || available < order.quantity) {
        logEntries.push(createLogEntry('skipped', `⏭️ ${order.symbol}: Nicht genug Aktien (${available} frei, benötigt ${order.quantity})`, undefined, order.symbol));
        continue;
      }
      reservedShares.set(order.symbol, reserved + order.quantity);
    }

    approved.push(order);
    tradesThisCycle++;
  }

  return approved;
}

// ─── Haupt-Zyklus ────────────────────────────────────

export async function runAutopilotCycle(sessionId = 'default'): Promise<void> {
  const currentState = state.loadState(sessionId);
  const settings = currentState.autopilotSettings;
  const logEntries: any[] = [];

  if (!settings.enabled) return;

  // Bei Vollautomatisch: Order-Auto-Ausführung sicherstellen
  if (settings.mode === 'full-auto' && !currentState.orderSettings.autoExecute) {
    currentState.orderSettings.autoExecute = true;
  }

  const cycleId = crypto.randomUUID().slice(0, 8);
  logEntries.push(createLogEntry('info', `🔄 [Server] Autopilot-Zyklus #${cycleId} gestartet (Session: ${sessionId})`));
  currentState.autopilotState.isRunning = true;
  state.saveState(currentState, sessionId);

  try {
    // 0. Abgelaufene Orders bereinigen
    const now = new Date();
    const expired = currentState.orders.filter(
      o => (o.status === 'active' || o.status === 'pending') && o.expiresAt && new Date(o.expiresAt) < now
    );
    for (const exp of expired) {
      exp.status = 'cancelled';
      logEntries.push(createLogEntry('info', `⏰ Order abgelaufen: ${exp.orderType.toUpperCase()} ${exp.quantity}x ${exp.symbol}`, undefined, exp.symbol, exp.id));
    }
    if (expired.length > 0) {
      logEntries.push(createLogEntry('info', `🧹 ${expired.length} abgelaufene Order(s) storniert`));
    }

    // 0b. Doppelte Sell-Orders bereinigen
    const activeSells = currentState.orders.filter(
      o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss')
    );
    const sellsBySymbol = new Map<string, typeof activeSells>();
    for (const o of activeSells) {
      const list = sellsBySymbol.get(o.symbol) || [];
      list.push(o);
      sellsBySymbol.set(o.symbol, list);
    }
    let duplicatesCancelled = 0;
    for (const [symbol, sellOrders] of sellsBySymbol) {
      if (sellOrders.length <= 1) continue;
      sellOrders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const kept: typeof activeSells = [];
      for (const order of sellOrders) {
        const isDuplicate = kept.some(k => Math.abs(k.triggerPrice - order.triggerPrice) / k.triggerPrice <= 0.05);
        if (isDuplicate) {
          order.status = 'cancelled';
          duplicatesCancelled++;
          logEntries.push(createLogEntry('info', `🧹 Doppelte Sell-Order storniert: ${order.orderType.toUpperCase()} ${order.quantity}x ${symbol} @ ${order.triggerPrice.toFixed(2)}€`, undefined, symbol, order.id));
        } else {
          kept.push(order);
        }
      }
    }

    // 1. Marktzeiten prüfen
    const marketStatus = isMarketOpen();
    if (settings.activeHoursOnly && !marketStatus.open) {
      logEntries.push(createLogEntry('info', '⏰ Alle Märkte geschlossen – Zyklus übersprungen'));
      currentState.autopilotState.isRunning = false;
      currentState.autopilotState.lastRunAt = new Date().toISOString();
      currentState.autopilotLog = [...logEntries, ...currentState.autopilotLog].slice(0, 200);
      state.saveState(currentState, sessionId);
      return;
    }
    if (marketStatus.open) {
      logEntries.push(createLogEntry('info', `📈 Markt offen: ${marketStatus.market}`));
    }

    // 2. API-Key prüfen
    const activeApiKey = currentState.settings.aiProvider === 'openai'
      ? currentState.settings.apiKeys.openai
      : currentState.settings.aiProvider === 'gemini'
      ? currentState.settings.apiKeys.gemini
      : currentState.settings.apiKeys.claude;

    if (!activeApiKey) {
      logEntries.push(createLogEntry('error', '❌ Kein API-Key konfiguriert – Autopilot pausiert'));
      currentState.autopilotState.isRunning = false;
      currentState.autopilotLog = [...logEntries, ...currentState.autopilotLog].slice(0, 200);
      state.saveState(currentState, sessionId);
      return;
    }

    // 3. Kursdaten laden
    logEntries.push(createLogEntry('info', '📊 Lade aktuelle Kursdaten...'));

    const portfolioSymbols = currentState.userPositions.map(p => p.symbol);
    const watchlistSymbols = currentState.settings.watchlist;
    const allSymbols = [...new Set([...portfolioSymbols, ...watchlistSymbols])];

    if (allSymbols.length === 0) {
      logEntries.push(createLogEntry('warning', '⚠️ Keine Aktien in Watchlist oder Portfolio'));
      currentState.autopilotState.isRunning = false;
      currentState.autopilotState.lastRunAt = new Date().toISOString();
      currentState.autopilotLog = [...logEntries, ...currentState.autopilotLog].slice(0, 200);
      state.saveState(currentState, sessionId);
      return;
    }

    const stocks = await market.getQuotesWithRange(allSymbols, calculateTechnicalIndicators);
    logEntries.push(createLogEntry('info', `✅ ${stocks.length} Kurse geladen`));

    // Watchlist im State updaten
    for (const stock of stocks) {
      const idx = currentState.watchlist.findIndex(w => w.symbol === stock.symbol);
      if (idx >= 0) {
        currentState.watchlist[idx] = stock;
      } else {
        currentState.watchlist.push(stock);
      }
    }

    // 4. KI-Analyse
    logEntries.push(createLogEntry('analysis', `🧠 KI-Analyse gestartet (${currentState.settings.aiProvider})...`));

    const portfolioVal = currentState.userPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
    const totalAssetsVal = currentState.cashBalance + portfolioVal;
    const totalInvestedVal = currentState.userPositions.reduce((sum, p) => sum + p.quantity * p.buyPrice, 0);
    const initCap = currentState.initialCapital || 0;
    const profitVal = initCap > 0 ? totalAssetsVal - initCap : portfolioVal - totalInvestedVal;
    const prevProfitVal = currentState.previousProfit || 0;
    const combinedProfit = profitVal + prevProfitVal;
    const profitPctVal = initCap > 0 ? (combinedProfit / (initCap || 1)) * 100 : 0;
    const os = currentState.orderSettings;

    // Verfügbares Cash
    const reservedCash = currentState.orders
      .filter(o => (o.status === 'active' || o.status === 'pending') && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy'))
      .reduce((sum, o) => {
        const oCost = o.triggerPrice * o.quantity;
        const oFee = (os.transactionFeeFlat || 0) + oCost * (os.transactionFeePercent || 0) / 100;
        return sum + oCost + oFee;
      }, 0);
    const availableCash = Math.max(0, currentState.cashBalance - reservedCash);

    // Positionen für KI
    const currentPositions = currentState.userPositions.map(up => {
      const stockData = stocks.find((s: any) => s.symbol === up.symbol);
      const currentPrice = up.useYahooPrice && stockData ? stockData.price : up.currentPrice;
      return { ...up, currentPrice };
    });

    const prompt = buildAnalysisPrompt({
      stocks,
      strategy: currentState.settings.strategy,
      riskTolerance: currentState.settings.riskTolerance,
      budget: availableCash,
      positions: currentPositions,
      signals: currentState.signals.slice(0, 10),
      activeOrders: currentState.orders.filter(o => o.status === 'active'),
      customPrompt: currentState.settings.customPrompt || undefined,
      initialCapital: initCap > 0 ? initCap : undefined,
      totalAssets: totalAssetsVal,
      portfolioValue: portfolioVal,
      totalProfit: initCap > 0 ? combinedProfit : undefined,
      totalProfitPercent: initCap > 0 ? profitPctVal : undefined,
      transactionFeeFlat: os.transactionFeeFlat || undefined,
      transactionFeePercent: os.transactionFeePercent || undefined,
      previousProfit: prevProfitVal !== 0 ? prevProfitVal : undefined,
    });

    const aiResponse = await callAI(prompt, currentState.settings);
    const analysisResponse = parseAIResponse(aiResponse, stocks, currentState.settings.strategy);

    logEntries.push(createLogEntry(
      'analysis',
      `✅ Analyse abgeschlossen: ${analysisResponse.signals.length} Signale, ${analysisResponse.suggestedOrders.length} Order-Vorschläge`,
      analysisResponse.marketSummary
    ));

    // Signale loggen und speichern
    for (const signal of analysisResponse.signals) {
      logEntries.push(createLogEntry('info', `📊 Signal: ${signal.stock?.symbol || signal.symbol} → ${signal.signal} (${signal.confidence}%)`, signal.reasoning?.substring(0, 200), signal.stock?.symbol || signal.symbol));
      currentState.signals = [signal, ...currentState.signals].slice(0, 50);
    }

    // Analyse speichern
    currentState.lastAnalysis = analysisResponse.marketSummary;
    currentState.lastAnalysisDate = new Date().toISOString();
    const totalValue = currentState.userPositions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0) + currentState.cashBalance;
    currentState.analysisHistory = [{
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      analysisText: analysisResponse.marketSummary,
      portfolioSnapshot: {
        positions: currentState.userPositions.map(p => ({
          symbol: p.symbol, name: p.name, quantity: p.quantity,
          buyPrice: p.buyPrice, currentPrice: p.currentPrice,
        })),
        cashBalance: currentState.cashBalance,
        totalValue,
      },
      watchlistSymbols: allSymbols,
      strategy: currentState.settings.strategy,
      aiProvider: currentState.settings.aiProvider,
    }, ...currentState.analysisHistory].slice(0, 5);

    // 5. Order-Vorschläge verarbeiten
    let suggestedOrders = analysisResponse.suggestedOrders || [];

    // Fix-up: SELL-Orders mit quantity 0
    for (const order of suggestedOrders) {
      if (order.quantity === 0) {
        const isSell = order.orderType === 'limit-sell' || order.orderType === 'stop-loss';
        if (isSell) {
          const position = currentState.userPositions.find(p => p.symbol === order.symbol);
          if (position) order.quantity = position.quantity;
        }
      }
    }

    if (suggestedOrders.length === 0) {
      logEntries.push(createLogEntry('info', '📝 Keine Order-Vorschläge von der KI'));
    } else {
      const approvedOrders = applySafetyRules(suggestedOrders, currentState, logEntries);

      if (approvedOrders.length === 0) {
        logEntries.push(createLogEntry('info', '🛡️ Alle Vorschläge von Safety-Regeln abgelehnt'));
      } else {
        if (settings.mode === 'suggest-only') {
          for (const order of approvedOrders) {
            logEntries.push(createLogEntry('info', `💡 Vorschlag: ${order.orderType.toUpperCase()} ${order.quantity}x ${order.symbol} @ ${order.triggerPrice.toFixed(2)}€`, order.reasoning, order.symbol));
          }
        } else {
          let ordersCreated = 0;
          for (const suggested of approvedOrders) {
            const isSellOrder = suggested.orderType === 'limit-sell' || suggested.orderType === 'stop-loss';

            // Duplikat-Sell-Schutz
            if (isSellOrder) {
              const existingSells = currentState.orders.filter(
                o => (o.status === 'active' || o.status === 'pending')
                  && o.symbol === suggested.symbol
                  && (o.orderType === 'limit-sell' || o.orderType === 'stop-loss')
              );
              const similarSell = existingSells.find(o => Math.abs(o.triggerPrice - suggested.triggerPrice) / o.triggerPrice <= 0.05);
              if (similarSell) {
                logEntries.push(createLogEntry('skipped', `⏭️ ${suggested.symbol}: Sell-Order übersprungen – bereits vorhanden`, undefined, suggested.symbol));
                continue;
              }
              const position = currentState.userPositions.find(p => p.symbol === suggested.symbol);
              const totalSellQty = existingSells.reduce((sum, o) => sum + o.quantity, 0);
              if (position && (totalSellQty + suggested.quantity) > position.quantity) {
                logEntries.push(createLogEntry('skipped', `⏭️ ${suggested.symbol}: Sell-Order übersprungen – Überverkauf`, undefined, suggested.symbol));
                continue;
              }
            }

            // Bestehende Autopilot-Orders stornieren
            currentState.orders
              .filter(o => (o.status === 'active' || o.status === 'pending')
                && o.symbol === suggested.symbol
                && o.orderType === suggested.orderType
                && o.note?.startsWith('🤖 Autopilot:'))
              .forEach(o => {
                o.status = 'cancelled';
                logEntries.push(createLogEntry('info', `🔄 Bestehende Order storniert: ${o.orderType} ${o.symbol}`, undefined, o.symbol, o.id));
              });

            const stockData = stocks.find((s: any) => s.symbol === suggested.symbol);
            const orderStatus = settings.mode === 'confirm-each' ? 'pending' : 'active';
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            const newOrder = {
              id: crypto.randomUUID(),
              symbol: suggested.symbol,
              name: stockData?.name || suggested.symbol,
              orderType: suggested.orderType,
              quantity: suggested.quantity,
              triggerPrice: suggested.triggerPrice,
              currentPrice: stockData?.price || suggested.triggerPrice,
              status: orderStatus,
              createdAt: new Date().toISOString(),
              expiresAt: expiresAt.toISOString(),
              note: `🤖 Autopilot: ${suggested.reasoning}`,
            };

            currentState.orders.push(newOrder);
            ordersCreated++;

            logEntries.push(createLogEntry(
              'order-created',
              `📦 Order erstellt: ${suggested.orderType.toUpperCase()} ${suggested.quantity}x ${suggested.symbol} @ ${suggested.triggerPrice.toFixed(2)}€`,
              suggested.reasoning,
              suggested.symbol,
              newOrder.id
            ));
          }

          currentState.autopilotState.totalOrdersCreated += ordersCreated;
        }
      }
    }

    // Warnungen
    if (analysisResponse.warnings?.length > 0) {
      for (const warning of analysisResponse.warnings) {
        logEntries.push(createLogEntry('warning', `⚠️ ${warning}`));
      }
    }

    logEntries.push(createLogEntry('info', `✅ Zyklus #${cycleId} abgeschlossen`));

    currentState.autopilotState.isRunning = false;
    currentState.autopilotState.lastRunAt = new Date().toISOString();
    currentState.autopilotState.cycleCount += 1;

  } catch (error: any) {
    logEntries.push(createLogEntry('error', `❌ Fehler im Zyklus: ${error.message || 'Unbekannter Fehler'}`, error.stack));
    currentState.autopilotState.isRunning = false;
    currentState.autopilotState.lastRunAt = new Date().toISOString();
  }

  // Alle Logs auf einmal speichern
  currentState.autopilotLog = [...logEntries, ...currentState.autopilotLog].slice(0, 200);
  state.saveState(currentState, sessionId);
}
