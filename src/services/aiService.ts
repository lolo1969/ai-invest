import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
  AISuggestedOrder,
  InvestmentSignal,
  Stock,
  InvestmentStrategy,
  RiskLevel,
  AIProvider,
  ClaudeModel,
  OpenAIModel,
  GeminiModel,
} from '../types';
import { formatIndicatorsForAI } from '../utils/technicalIndicators';

export class AIService {
  private apiKey: string;
  private provider: AIProvider;
  private claudeModel: ClaudeModel;
  private openaiModel: OpenAIModel;
  private geminiModel: GeminiModel;

  constructor(apiKey: string, provider: AIProvider = 'claude', claudeModel: ClaudeModel = 'claude-opus-4-6', openaiModel: OpenAIModel = 'gpt-5.2', geminiModel: GeminiModel = 'gemini-2.5-flash') {
    this.apiKey = apiKey;
    this.provider = provider;
    this.claudeModel = claudeModel;
    this.openaiModel = openaiModel;
    this.geminiModel = geminiModel;
  }

  // Retry-Wrapper für überladene/rate-limited API-Aufrufe
  private async fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await fetch(url, options);
      
      // Retry bei 429 (Rate Limit) oder 529 (Overloaded) oder 503 (Service Unavailable)
      if ((response.status === 429 || response.status === 529 || response.status === 503) && attempt < maxRetries) {
        const retryAfter = response.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : (5000 * Math.pow(2, attempt));
        console.warn(`[AI API] Status ${response.status} - Retry ${attempt + 1}/${maxRetries} in ${waitMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      
      return response;
    }
    throw new Error('Max retries exceeded');
  }

  async analyzeMarket(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    if (!this.apiKey) {
      const providerNames: Record<AIProvider, string> = { claude: 'Claude', openai: 'OpenAI', gemini: 'Google Gemini' };
      throw new Error(`${providerNames[this.provider]} API key is required`);
    }

    const prompt = this.buildAnalysisPrompt(request);
    
    try {
      if (this.provider === 'openai') {
        return await this.callOpenAI(prompt, request.stocks, request.strategy);
      } else if (this.provider === 'gemini') {
        return await this.callGemini(prompt, request.stocks, request.strategy);
      } else {
        return await this.callClaude(prompt, request.stocks, request.strategy);
      }
    } catch (error: any) {
      console.error('AI analysis error:', error);
      if (error.message?.includes('Failed to fetch')) {
        const providerNames: Record<AIProvider, string> = { claude: 'Claude', openai: 'OpenAI', gemini: 'Google Gemini' };
        throw new Error(`Netzwerkfehler: Konnte ${providerNames[this.provider]} API nicht erreichen. Prüfe deine Internetverbindung.`);
      }
      // Benutzerfreundliche Meldung bei Overloaded
      if (error.message?.toLowerCase().includes('overloaded') || error.message?.includes('529')) {
        throw new Error('Der KI-Server ist momentan überlastet. Bitte versuche es in 1-2 Minuten erneut.');
      }
      throw error;
    }
  }

  private async callClaude(prompt: string, stocks: Stock[], strategy?: InvestmentStrategy): Promise<AIAnalysisResponse> {
    const response = await this.fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.claudeModel,
        max_tokens: 16384,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API Error Response:', errorText);
      let errorMessage = 'AI analysis failed';
      try {
        const error = JSON.parse(errorText);
        errorMessage = error.error?.message || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('Claude API Response:', data);
    const content = data.content[0]?.text || '';

    return this.parseAIResponse(content, stocks, strategy);
  }

  private async callOpenAI(prompt: string, stocks: Stock[], strategy?: InvestmentStrategy): Promise<AIAnalysisResponse> {
    const response = await this.fetchWithRetry('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.openaiModel,
        max_completion_tokens: 16384,
        messages: [
          {
            role: 'system',
            content: 'Du bist ein erfahrener Investment-Analyst. Antworte immer im angeforderten JSON-Format. WICHTIG: Du MUSST für JEDE Aktie in der Liste ein Signal geben (BUY, SELL oder HOLD). Überspringe keine Aktien! Wenn du BUY oder SELL Signale gibst, MUSST du auch passende Einträge im "suggestedOrders" Array liefern.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API Error Response:', errorText);
      let errorMessage = 'AI analysis failed';
      try {
        const error = JSON.parse(errorText);
        errorMessage = error.error?.message || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('OpenAI API Response:', data);
    const content = data.choices[0]?.message?.content || '';

    return this.parseAIResponse(content, stocks, strategy);
  }

  private async callGemini(prompt: string, stocks: Stock[], strategy?: InvestmentStrategy): Promise<AIAnalysisResponse> {
    // Build JSON schema for structured output
    const responseSchema = {
      type: 'object',
      properties: {
        signals: {
          type: 'array',
          description: 'Ein Signal pro analysierter Aktie (BUY, SELL oder HOLD)',
          items: {
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              signal: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] },
              confidence: { type: 'number' },
              reasoning: { type: 'string' },
              idealEntryPrice: { type: 'number' },
              targetPrice: { type: 'number' },
              stopLoss: { type: 'number' },
              riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
            required: ['symbol', 'signal', 'confidence', 'reasoning', 'targetPrice', 'stopLoss', 'riskLevel'],
          },
        },
        marketSummary: { type: 'string' },
        recommendations: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
        suggestedOrders: {
          type: 'array',
          description: 'Für JEDES BUY/SELL Signal MUSS hier eine Order stehen!',
          items: {
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              orderType: { type: 'string', enum: ['limit-buy', 'limit-sell', 'stop-loss', 'stop-buy'] },
              quantity: { type: 'integer' },
              triggerPrice: { type: 'number' },
              reasoning: { type: 'string' },
            },
            required: ['symbol', 'orderType', 'quantity', 'triggerPrice', 'reasoning'],
          },
        },
      },
      required: ['signals', 'marketSummary', 'recommendations', 'warnings', 'suggestedOrders'],
    };

    const response = await this.fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          systemInstruction: {
            parts: [
              {
                text: `Du bist ein erfahrener Investment-Analyst. Du MUSST für JEDE Aktie in der Liste ein Signal geben (BUY, SELL oder HOLD). Wenn du BUY oder SELL Signale gibst, MUSST du auch passende Einträge im "suggestedOrders" Array liefern. Das suggestedOrders Array darf NICHT leer sein wenn BUY/SELL Signale vorhanden sind!`,
              },
            ],
          },
          generationConfig: {
            maxOutputTokens: 65536,
            temperature: 0.7,
            responseMimeType: 'application/json',
            responseSchema,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error Response:', errorText);
      let errorMessage = 'AI analysis failed';
      try {
        const error = JSON.parse(errorText);
        errorMessage = error.error?.message || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('Gemini API Response:', data);
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return this.parseAIResponse(content, stocks, strategy);
  }

  private buildAnalysisPrompt(request: AIAnalysisRequest): string {
    const strategyDesc = request.strategy === 'short' 
      ? 'kurzfristig (Tage bis Wochen)' 
      : request.strategy === 'middle'
      ? 'mittelfristig (Wochen bis Monate)'
      : 'langfristig (10+ Jahre, Buy & Hold)';
    
    const riskDesc = {
      low: 'konservativ (minimales Risiko)',
      medium: 'ausgewogen (moderates Risiko)',
      high: 'aggressiv (höheres Risiko für höhere Rendite)',
    }[request.riskTolerance];

    const stocksInfo = request.stocks
      .map(s => {
        let info = `${s.symbol} (${s.name}): ${s.price.toFixed(2)} ${s.currency} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)`;
        
        // Mark if user already owns this stock
        const existingPosition = request.currentPositions?.find(p => p.stock.symbol === s.symbol);
        if (existingPosition) {
          info += ` [BEREITS IM PORTFOLIO: ${existingPosition.quantity} Stück]`;
        }
        
        // Add full technical indicators if available
        if (s.technicalIndicators) {
          info += '\n' + formatIndicatorsForAI(s.symbol, s.price, s.technicalIndicators);
        } else if (s.week52High && s.week52Low) {
          // Fallback: nur 52W-Daten wenn keine technischen Indikatoren verfügbar
          const positionInRange = s.week52ChangePercent ?? 0;
          info += ` | 52W: ${s.week52Low.toFixed(2)}-${s.week52High.toFixed(2)} (${positionInRange.toFixed(0)}% im Bereich)`;
          info += ' [⚠️ Keine weiteren technischen Indikatoren verfügbar]';
        }
        
        return info;
      })
      .join('\n\n');

    // Debug-Log: zeige ob technische Indikatoren vorhanden sind
    const withIndicators = request.stocks.filter(s => s.technicalIndicators).length;
    const withoutIndicators = request.stocks.filter(s => !s.technicalIndicators).length;
    console.log(`[AI Prompt] Aktien mit technischen Indikatoren: ${withIndicators}/${request.stocks.length}${withoutIndicators > 0 ? ` (${withoutIndicators} OHNE Indikatoren!)` : ''}`);
    if (withIndicators > 0) {
      const sample = request.stocks.find(s => s.technicalIndicators);
      if (sample?.technicalIndicators) {
        console.log(`[AI Prompt] Beispiel ${sample.symbol}: RSI=${sample.technicalIndicators.rsi14?.toFixed(1)}, MACD=${sample.technicalIndicators.macd?.toFixed(2)}, SMA50=${sample.technicalIndicators.sma50?.toFixed(2)}`);
      }
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return `Du bist ein erfahrener Investment-Analyst mit Expertise in technischer Analyse, Fundamentalanalyse, Makroökonomie und Geopolitik. Analysiere die folgenden Aktien GANZHEITLICH anhand aller verfügbaren Faktoren und gib fundierte Kauf-/Verkaufsempfehlungen.

AKTUELLES DATUM: ${dateStr}

KONTEXT:
- Investmentstrategie: ${strategyDesc}
- Risikotoleranz: ${riskDesc}
- Verfügbares Cash: ${request.budget.toFixed(2)} EUR
${request.portfolioValue ? `- Portfolio-Wert (Positionen): ${request.portfolioValue.toFixed(2)} EUR` : ''}
${request.totalAssets ? `- Gesamtvermögen (Cash + Portfolio): ${request.totalAssets.toFixed(2)} EUR` : ''}
${request.initialCapital && request.initialCapital > 0 ? `- Startkapital: ${request.initialCapital.toFixed(2)} EUR
- Gesamtgewinn: ${(request.totalProfit ?? 0) >= 0 ? '+' : ''}${(request.totalProfit ?? 0).toFixed(2)} EUR (${(request.totalProfitPercent ?? 0) >= 0 ? '+' : ''}${(request.totalProfitPercent ?? 0).toFixed(1)}%)${request.previousProfit ? `
- Davon aus früheren Portfolios: ${request.previousProfit >= 0 ? '+' : ''}${request.previousProfit.toFixed(2)} EUR` : ''}` : ''}
${(request.transactionFeeFlat || request.transactionFeePercent) ? `- Transaktionsgebühren: ${request.transactionFeeFlat ? `${request.transactionFeeFlat.toFixed(2)} € fix` : ''}${request.transactionFeeFlat && request.transactionFeePercent ? ' + ' : ''}${request.transactionFeePercent ? `${request.transactionFeePercent}% vom Volumen` : ''} pro Trade
  WICHTIG: Berücksichtige die Gebühren bei der Positionsgrößenberechnung! Bei kleinen Orders können die Gebühren den Gewinn auffressen.` : ''}
- Fokus: Deutsche/europäische und US-Aktien

═══════════════════════════════════════
AKTUELLE KURSE MIT TECHNISCHEN INDIKATOREN:
═══════════════════════════════════════
${stocksInfo}

═══════════════════════════════════════
ANALYSE-METHODIK – NUTZE ALLE INDIKATOREN!
═══════════════════════════════════════
Du hast für jede Aktie umfassende technische Indikatoren. Nutze sie ALLE in Kombination, um eine fundierte Einschätzung abzugeben. KEIN einzelner Indikator allein entscheidet!

WICHTIGE INDIKATOREN UND IHRE BEDEUTUNG (nach Priorität geordnet):

1. RSI (Relative Strength Index, 14 Tage) – PRIMÄRER INDIKATOR für Überhitzung:
   - >70 = überkauft (potenzielle Korrektur möglich, aber nicht zwingend Verkauf!)
   - <30 = überverkauft (potenzielle Erholung, aber Abwärtstrend kann andauern)
   - RSI allein ist KEIN Kauf-/Verkaufssignal – immer mit anderen Indikatoren bestätigen!
   - RSI ist der BESTE Indikator um zu erkennen ob eine Aktie überhitzt ist, NICHT der 52-Wochen-Bereich!

2. MACD (Moving Average Convergence Divergence) – PRIMÄRER Momentum-Indikator:
   - MACD > Signal-Linie = bullishes Momentum
   - MACD < Signal-Linie = bearishes Momentum
   - Histogramm zeigt Stärke des Momentums
   - Achte auf Divergenzen: Kurs steigt aber MACD fällt = Warnsignal

3. Moving Averages (SMA20, SMA50, SMA200) – Trend-Bestätigung:
   - Kurs über SMA200 = langfristiger Aufwärtstrend
   - SMA50 über SMA200 = Golden Cross (bullish)
   - SMA50 unter SMA200 = Death Cross (bearish)
   - Kurs unter SMA20 = kurzfristiger Abwärtsdruck

4. Bollinger Bands – Volatilität & Extremzonen:
   - %B > 100% = Kurs über oberem Band (Überdehnung, aber kann in Trendphasen anhalten!)
   - %B < 0% = Kurs unter unterem Band (Überverkauft, aber kann in Crashs weiter fallen)
   - Enge Bänder (niedrige Volatilität) deuten auf bevorstehende starke Bewegung hin

5. Volumen-Analyse:
   - Hohes Volumen bestätigt Kursbewegungen
   - Niedriges Volumen bei Ausbrüchen = verdächtig, Fehlsignal möglich

6. Volatilität & ATR:
   - Hohe Volatilität → größere Stop-Loss-Abstände nötig
   - ATR hilft bei der Berechnung sinnvoller Stop-Loss und Target-Preise

7. 52-Wochen-Bereich – NUR EIN NEBENFAKTOR:
   - Der 52-Wochen-Bereich ist NICHT der richtige Indikator um zu beurteilen ob eine Aktie überhitzt ist!
   - Aktien in starkem Aufwärtstrend stehen DAUERHAFT nahe dem 52W-Hoch → das ist NORMAL und kein Verkaufsgrund
   - Nutze stattdessen RSI, MACD und Bollinger Bands um Überhitzung zu bewerten
   - Erwähne den 52W-Bereich in deiner Begründung nur nebensächlich, NICHT als Hauptargument

KRITISCH: Der 52-Wochen-Bereich sagt NICHTS über Überhitzung aus. RSI ist dafür der richtige Indikator. Eine Aktie nahe dem 52W-Hoch mit RSI 45 ist NICHT überhitzt. Eine Aktie bei 60% im 52W-Bereich mit RSI 78 IST überhitzt.

ENTSCHEIDE SELBST: Bewerte die Gesamtlage jeder Aktie anhand ALLER Indikatoren mit Fokus auf RSI, MACD und Moving Averages. Es gibt keine starren Regeln.

${request.strategy === 'long' ? `LANGFRISTIGE INVESTMENT-STRATEGIE (10+ Jahre):
- Fokus auf Qualitätsunternehmen mit starken Fundamentaldaten und Wettbewerbsvorteilen (Moat)
- Bevorzuge Unternehmen mit: stabilem Gewinnwachstum, niedriger Verschuldung, starker Marktposition
- Dividendenwachstum und Dividendenhistorie sind wichtige Faktoren
- Technische Indikatoren nutzen für besseres Timing, aber nicht als alleiniges Kaufkriterium
- Empfehle breit diversifizierte Blue-Chip Aktien und etablierte Wachstumsunternehmen
- Stop-Loss großzügiger setzen (20-30% unter Kaufpreis)
- Berücksichtige Megatrends: Digitalisierung, Gesundheit, erneuerbare Energien, demographischer Wandel` : 
request.strategy === 'short' ? `KURZFRISTIGE TRADING-STRATEGIE (Tage bis Wochen):
- Technische Indikatoren sind hier BESONDERS wichtig für Timing
- RSI-Extreme und MACD-Crossovers als Entry/Exit-Signale
- Enge Stop-Loss setzen (ATR-basiert)
- Volumen-Bestätigung bei Ausbrüchen wichtig
- Bollinger Band Breakouts und Mean-Reversion-Strategien beachten` :
`MITTELFRISTIGE STRATEGIE (Wochen bis Monate):
- Kombination aus technischer und fundamentaler Analyse
- Trend-Bestätigung über Moving Averages
- RSI + MACD für Timing
- Moderate Stop-Loss-Abstände`}

═══════════════════════════════════════
GANZHEITLICHE ANALYSE – ÜBER TECHNISCHE INDIKATOREN HINAUS:
═══════════════════════════════════════
Berücksichtige bei deiner Analyse ZUSÄTZLICH zu den technischen Indikatoren:

**FUNDAMENTALANALYSE:** Bewertung (KGV, KUV, PEG), Profitabilität (Margen, FCF), Wachstum (Umsatz/Gewinn YoY), Bilanzqualität (Verschuldung), Wettbewerbsvorteile (Moat), Management-Qualität.

**MAKROÖKONOMIE:** Zinsentwicklung (Fed/EZB), Inflation, Konjunkturzyklus, Anleiherenditen (Yield Curve), Arbeitsmarkt, Geldpolitik (QE/QT). Wie wirkt sich das aktuelle Umfeld auf die analysierten Aktien aus?

**GEOPOLITIK:** Konflikte/Kriege (Energie, Rüstung, Supply Chains), Handelspolitik (Zölle, Sanktionen, US-China), Lieferketten-Risiken, Energiepolitik (Ölpreis, Energiewende).

**SEKTORANALYSE:** Sektorrotation (Zykliker vs. Defensive), branchenspezifische Risiken/Chancen, Megatrends (KI, E-Mobilität, Biotech, Cybersecurity, Cloud), ESG-Regulierung.

**PORTFOLIO-RISIKEN:** Korrelationsrisiko (zu ähnliche Positionen?), Konzentrationsrisiko, Währungsrisiko (EUR/USD bei US-Aktien), Liquiditätsrisiko.

**SENTIMENT & TIMING:** Marktstimmung (Fear & Greed, VIX), Saisonalität, kommende Events (Earnings, Zentralbank-Sitzungen), Institutional Flows.

WICHTIG: Fokussiere in der BEGRÜNDUNG je Aktie auf die 2-3 RELEVANTESTEN Faktoren. Nicht jeder Faktor ist für jede Aktie gleich wichtig. Aber die Makro-/Geopolitik-Lage MUSS in der marketSummary abgebildet werden!

${request.currentPositions?.length ? `
AKTUELLE PORTFOLIO-POSITIONEN (SEHR WICHTIG!):
Diese Aktien besitzt der Nutzer bereits. Berücksichtige dies bei deinen Empfehlungen!
${request.currentPositions.map(p => `- ${p.stock.symbol} (${p.stock.name}): ${p.quantity} Stück, Kaufpreis: ${p.averageBuyPrice.toFixed(2)}, Aktueller Preis: ${p.currentPrice.toFixed(2)}, P/L: ${p.profitLossPercent >= 0 ? '+' : ''}${p.profitLossPercent.toFixed(2)}%`).join('\n')}

${request.strategy === 'long' ? `LANGFRISTIGE STRATEGIE - REGELN FÜR BESTEHENDE POSITIONEN:
- HALTE Qualitätsaktien langfristig, auch bei Kursrückgängen von 20-30%
- Verkaufe NUR bei fundamentaler Verschlechterung des Unternehmens (nicht wegen Kursschwankungen!)
- Gewinne von 50%, 100% oder mehr sind bei langfristigen Investments NORMAL - KEIN Verkaufsgrund!
- Nachkaufen bei Kursrückgängen kann sinnvoll sein (Cost-Average-Effekt)
- Verkaufsempfehlung nur bei: massiver Überbewertung, Verschlechterung der Geschäftsaussichten, bessere Alternativen` 
: `REGELN FÜR BESTEHENDE POSITIONEN:
- Prüfe anhand der technischen Indikatoren ob bestehende Positionen gehalten, nachgekauft oder verkauft werden sollten
- Bei Gewinnmitnahmen: Nutze RSI und Bollinger Bands als Orientierung
- Prüfe ob Stop-Loss-Anpassungen nötig sind (ATR-basiert)`}
` : 'HINWEIS: Der Nutzer hat keine Positionen im Portfolio angegeben.\n'}

${request.previousSignals?.length ? `
🧠 VORHERIGE EMPFEHLUNGEN (KI-GEDÄCHTNIS):
Dies sind deine letzten Empfehlungen. Beziehe dich darauf und erkenne Änderungen:
${request.previousSignals.slice(0, 10).map(s => {
  const age = Math.round((Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60));
  const ageStr = age < 24 ? `vor ${age}h` : `vor ${Math.round(age / 24)}d`;
  return `- ${s.stock.symbol}: ${s.signal} (Konfidenz: ${s.confidence}%, ${ageStr}) - ${s.reasoning.substring(0, 100)}...`;
}).join('\n')}

WICHTIG:
- Wenn sich deine Einschätzung geändert hat, erkläre warum (z.B. RSI hat sich verändert, MACD-Crossover)
- Erkenne an wenn der Nutzer deine Empfehlungen umgesetzt hat
- Wiederhole nicht wortwörtlich - entwickle deine Analyse weiter
` : ''}

${request.activeOrders?.length ? `
📝 AKTIVE ORDERS (WICHTIG - BEWERTE DIESE!):
Der Nutzer hat folgende offene Orders. Bewerte ob diese noch sinnvoll sind:
${request.activeOrders.map(o => {
  const typeLabel = o.orderType === 'limit-buy' ? 'Limit Buy' : o.orderType === 'limit-sell' ? 'Limit Sell' : o.orderType === 'stop-loss' ? 'Stop Loss' : 'Stop Buy';
  return `- ${o.symbol} (${o.name}): ${typeLabel} | Trigger: ${o.triggerPrice.toFixed(2)} | Aktuell: ${o.currentPrice.toFixed(2)} | ${o.quantity} Stück${o.note ? ` | Notiz: ${o.note}` : ''}`;
}).join('\n')}

Bewerte anhand der technischen Indikatoren:
- Sind die Trigger-Preise angesichts der aktuellen Indikatoren noch sinnvoll?
- Stimmen die Stop-Loss Orders mit der ATR und Volatilität überein?
- Sollten Orders angepasst, beibehalten oder storniert werden?
` : ''}

STRATEGIE-KOMPATIBILITÄTSPRÜFUNG (${strategyDesc}):
${request.strategy === 'long' ? `Prüfe für JEDE Aktie (Portfolio UND Watchlist):
- Ist diese Aktie für langfristige Buy & Hold Strategie geeignet?
- WARNUNG bei: Meme-Stocks, hochspekulative Tech-Aktien ohne Gewinne, Penny Stocks, Krypto-bezogene Aktien
- EMPFOHLEN für langfristig: Blue-Chips, Dividenden-Aristokraten, etablierte Marktführer, Qualitätsunternehmen mit Moat
- Bei UNGEEIGNETEN Aktien im Portfolio: Empfehle Verkauf und erkläre warum sie nicht zur Strategie passen` 
: request.strategy === 'short' ? `Prüfe für JEDE Aktie:
- Ist diese Aktie für kurzfristiges Trading geeignet?
- WARNUNG bei: Illiquiden Aktien, zu niedrigem Handelsvolumen
- EMPFOHLEN: Volatile Aktien mit hohem Momentum, liquide Titel
- Achte besonders auf technische Signale und kurzfristige Katalysatoren`
: `Prüfe für JEDE Aktie:
- Ist diese Aktie für mittelfristige Investments (Wochen-Monate) geeignet?
- Balance zwischen Wachstum und Risiko
- Achte auf kommende Earnings, Produktlaunches, Branchentrends`}

WICHTIG - WARNUNGEN AUSGEBEN:
- Füge im "warnings" Array KONKRETE Warnungen hinzu wenn Aktien NICHT zur gewählten Strategie passen
- Format: "⚠️ [SYMBOL] passt nicht zur ${request.strategy === 'long' ? 'langfristigen' : request.strategy === 'short' ? 'kurzfristigen' : 'mittelfristigen'} Strategie: [Grund]"
- Bei Portfolio-Aktien die nicht passen: "🔄 [SYMBOL] im Portfolio: Verkauf empfohlen - [Grund warum ungeeignet]"

AUFGABE:
Analysiere jede Aktie GANZHEITLICH anhand technischer Indikatoren, Fundamentaldaten, Makro-/Geopolitik-Lage und Branchentrends. Gib für jede eine Empfehlung (BUY/SELL/HOLD) mit:
1. Signal (BUY, SELL, oder HOLD)
2. Konfidenz (0-100%)
3. Begründung (2-3 Sätze – Kombiniere technische Signale (RSI, MACD, SMA, BB) mit den RELEVANTESTEN fundamentalen/makro/geopolitischen Faktoren für diese spezifische Aktie)
4. Idealer Einstiegspreis (bei BUY: basierend auf Support-Levels/SMA)
5. Zielpreis (basierend auf Widerstandszonen/Bollinger oberes Band/Fundamentalbewertung)
6. Stop-Loss (basierend auf ATR oder Support-Levels)
7. Risikoeinschätzung (low/medium/high)

Antworte im folgenden JSON-Format:
{
  "signals": [
    {
      "symbol": "AAPL",
      "signal": "BUY",
      "confidence": 75,
      "reasoning": "RSI bei 42 ohne Überhitzung, MACD dreht bullish. Solides iPhone-Zyklus-Wachstum bei KGV 28 fair bewertet. Fed-Zinspause stützt Growth-Aktien. Kurs über SMA200 bestätigt Aufwärtstrend.",
      "idealEntryPrice": 165.00,
      "targetPrice": 180.00,
      "stopLoss": 155.00,
      "riskLevel": "medium"
    }
  ],
  "marketSummary": "Umfassende Zusammenfassung: Makrolage (Zinsen, Inflation, Konjunktur), geopolitische Risiken, Marktsentiment — und was das für die analysierten Aktien bedeutet.",
  "recommendations": ["Empfehlung 1", "Empfehlung 2"],
  "warnings": ["Warnung 1"],
  "suggestedOrders": [
    {
      "symbol": "AAPL",
      "orderType": "limit-buy",
      "quantity": 5,
      "triggerPrice": 160.00,
      "reasoning": "Einstieg nahe SMA50 Support bei 160 EUR..."
    },
    {
      "symbol": "TSLA",
      "orderType": "stop-loss",
      "quantity": 10,
      "triggerPrice": 200.00,
      "reasoning": "Stop-Loss basierend auf 2x ATR unter aktuellem Kurs..."
    }
  ]
}

KRITISCH - SUGGESTED ORDERS SIND PFLICHT:
- Für JEDES BUY-Signal MUSS ein entsprechender "limit-buy" Eintrag in "suggestedOrders" stehen!
- Für JEDES SELL-Signal bei bestehenden Positionen MUSS ein "limit-sell" oder "stop-loss" in "suggestedOrders" stehen!
- suggestedOrders darf NICHT leer sein wenn du BUY oder SELL Signale gibst!
- orderType muss exakt eines von: "limit-buy", "limit-sell", "stop-loss", "stop-buy" sein
- quantity muss eine positive ganze Zahl sein (berechne basierend auf Budget und Preis)
- triggerPrice muss eine positive Zahl sein (bei limit-buy: idealEntryPrice oder leicht unter aktuellem Kurs)

${request.customPrompt ? `
═══════════════════════════════════════
PERSÖNLICHE ANWEISUNGEN DES NUTZERS (UNBEDINGT BEACHTEN!):
═══════════════════════════════════════
${request.customPrompt}
` : ''}
Antworte NUR mit dem JSON, ohne zusätzlichen Text.`;
  }

  private parseAIResponse(content: string, stocks: Stock[], strategy?: InvestmentStrategy): AIAnalysisResponse {
    try {
      // Strip markdown code blocks (```json ... ``` or ``` ... ```)
      let cleaned = content.trim();
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      
      // Extract JSON from response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON found in AI response. Raw content:', content.substring(0, 500));
        throw new Error('No valid JSON in response');
      }

      let jsonStr = jsonMatch[0];
      
      // Attempt to fix truncated JSON (missing closing brackets)
      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.warn('[AI Service] JSON parse failed, attempting to repair truncated JSON...');
        // Count unmatched brackets and add closing ones
        let openBraces = 0, openBrackets = 0;
        let inString = false, escaped = false;
        for (const ch of jsonStr) {
          if (escaped) { escaped = false; continue; }
          if (ch === '\\') { escaped = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === '{') openBraces++;
          else if (ch === '}') openBraces--;
          else if (ch === '[') openBrackets++;
          else if (ch === ']') openBrackets--;
        }
        // Remove trailing incomplete value (after last comma or colon)
        jsonStr = jsonStr.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"{}\[\]]*$/, '');
        jsonStr = jsonStr.replace(/,\s*\{[^}]*$/, '');
        jsonStr = jsonStr.replace(/,\s*$/, '');
        // Re-count after cleanup
        openBraces = 0; openBrackets = 0; inString = false; escaped = false;
        for (const ch of jsonStr) {
          if (escaped) { escaped = false; continue; }
          if (ch === '\\') { escaped = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === '{') openBraces++;
          else if (ch === '}') openBraces--;
          else if (ch === '[') openBrackets++;
          else if (ch === ']') openBrackets--;
        }
        jsonStr += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
        try {
          parsed = JSON.parse(jsonStr);
          console.log('[AI Service] Truncated JSON successfully repaired');
        } catch (e2) {
          console.error('[AI Service] JSON repair failed. Cleaned content:', jsonStr.substring(0, 500));
          throw parseErr;
        }
      }
      
      const signals: InvestmentSignal[] = (parsed.signals || []).map((s: any) => {
        const stock = stocks.find(st => st.symbol === s.symbol);
        if (!stock) return null;

        return {
          id: `${s.symbol}-${Date.now()}`,
          stock,
          signal: s.signal as 'BUY' | 'SELL' | 'HOLD',
          strategy: strategy || ('middle' as InvestmentStrategy),
          confidence: s.confidence || 50,
          reasoning: s.reasoning || '',
          idealEntryPrice: s.idealEntryPrice,
          targetPrice: s.targetPrice,
          stopLoss: s.stopLoss,
          createdAt: new Date(),
          riskLevel: (s.riskLevel || 'medium') as RiskLevel,
        };
      }).filter(Boolean);

      // Handle alternative field names that some AI providers use
      const rawOrders = parsed.suggestedOrders || parsed.suggested_orders || parsed.orders || [];
      
      // Debug: Log what the AI returned
      console.log('[AI Service] Parsed JSON keys:', Object.keys(parsed));
      console.log('[AI Service] Signals:', signals.map(s => `${s.stock.symbol}: ${s.signal} (${s.confidence}%)`));
      console.log('[AI Service] Raw suggestedOrders from AI:', JSON.stringify(rawOrders).substring(0, 500));

      let suggestedOrders: AISuggestedOrder[] = rawOrders.map((o: any) => {
        // Handle alternative field names
        const orderType = o.orderType || o.order_type || o.type || '';
        const triggerPrice = o.triggerPrice || o.trigger_price || o.price || o.limitPrice || o.limit_price || 0;
        const qty = o.quantity || o.qty || o.amount || 0;
        return {
          symbol: o.symbol || o.ticker || '',
          orderType: orderType,
          quantity: typeof qty === 'string' ? parseInt(qty, 10) : qty,
          triggerPrice: typeof triggerPrice === 'string' ? parseFloat(triggerPrice) : triggerPrice,
          reasoning: o.reasoning || o.reason || o.rationale || '',
        };
      }).filter((o: AISuggestedOrder) => o.symbol && o.orderType && o.quantity > 0 && o.triggerPrice > 0);

      console.log('[AI Service] Parsed suggestedOrders after filter:', suggestedOrders.length);

      // Fallback: Wenn die KI BUY/SELL-Signale liefert aber keine suggestedOrders,
      // generiere Orders automatisch aus den Signalen (wichtig für OpenAI/Gemini Kompatibilität)
      if (suggestedOrders.length === 0 && signals.length > 0) {
        const actionableSignals = signals.filter(s => s.signal === 'BUY' || s.signal === 'SELL');
        console.log('[AI Service] Actionable signals (BUY/SELL) for fallback:', actionableSignals.map(s => `${s.stock.symbol}: ${s.signal}`));
        if (actionableSignals.length > 0) {
          console.warn('[AI Service] Keine suggestedOrders von KI erhalten – generiere Fallback-Orders aus Signalen');
          suggestedOrders = actionableSignals.map(signal => {
            if (signal.signal === 'BUY') {
              const buyPrice = signal.idealEntryPrice || signal.stock.price;
              // Budget-basierte Stückzahl: max 10% des Aktienpreises als Positionsgröße, min 1
              const maxInvestment = signal.stock.price * 10; // Fallback: ~10 Stück als Obergrenze
              const quantity = Math.max(1, Math.floor(maxInvestment / buyPrice));
              return {
                symbol: signal.stock.symbol,
                orderType: 'limit-buy' as const,
                quantity,
                triggerPrice: Math.round(buyPrice * 100) / 100,
                reasoning: `[Auto-generiert aus BUY-Signal] ${signal.reasoning}`,
              };
            } else {
              // SELL – Stop-Loss oder Limit-Sell
              const sellPrice = signal.stopLoss || signal.stock.price * 0.95;
              return {
                symbol: signal.stock.symbol,
                orderType: 'stop-loss' as const,
                quantity: 0, // Wird vom Safety-Layer anhand der Position bestimmt
                triggerPrice: Math.round(sellPrice * 100) / 100,
                reasoning: `[Auto-generiert aus SELL-Signal] ${signal.reasoning}`,
              };
            }
          }).filter(o => o.quantity > 0 || o.orderType === 'stop-loss');
        }
      }

      return {
        signals,
        marketSummary: parsed.marketSummary || '',
        recommendations: parsed.recommendations || [],
        warnings: parsed.warnings || [],
        suggestedOrders,
        analyzedAt: new Date(),
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return {
        signals: [],
        marketSummary: 'Analyse konnte nicht verarbeitet werden.',
        recommendations: [],
        warnings: ['Die AI-Antwort konnte nicht geparst werden.'],
        suggestedOrders: [],
        analyzedAt: new Date(),
      };
    }
  }
}

// Singleton instance - API key and provider will be set from settings
let aiServiceInstance: AIService | null = null;
let currentProvider: AIProvider | null = null;
let currentClaudeModel: ClaudeModel | null = null;
let currentOpenaiModel: OpenAIModel | null = null;
let currentGeminiModel: GeminiModel | null = null;

export const getAIService = (apiKey: string, provider: AIProvider = 'claude', claudeModel: ClaudeModel = 'claude-opus-4-6', openaiModel: OpenAIModel = 'gpt-5.2', geminiModel: GeminiModel = 'gemini-2.5-flash'): AIService => {
  if (!aiServiceInstance || aiServiceInstance['apiKey'] !== apiKey || currentProvider !== provider || currentClaudeModel !== claudeModel || currentOpenaiModel !== openaiModel || currentGeminiModel !== geminiModel) {
    aiServiceInstance = new AIService(apiKey, provider, claudeModel, openaiModel, geminiModel);
    currentProvider = provider;
    currentClaudeModel = claudeModel;
    currentOpenaiModel = openaiModel;
    currentGeminiModel = geminiModel;
  }
  return aiServiceInstance;
};
