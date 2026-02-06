import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
  InvestmentSignal,
  Stock,
  InvestmentStrategy,
  RiskLevel,
  AIProvider,
} from '../types';

export class AIService {
  private apiKey: string;
  private provider: AIProvider;

  constructor(apiKey: string, provider: AIProvider = 'claude') {
    this.apiKey = apiKey;
    this.provider = provider;
  }

  async analyzeMarket(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    if (!this.apiKey) {
      throw new Error(`${this.provider === 'claude' ? 'Claude' : 'OpenAI'} API key is required`);
    }

    const prompt = this.buildAnalysisPrompt(request);
    
    try {
      if (this.provider === 'openai') {
        return await this.callOpenAI(prompt, request.stocks, request.strategy);
      } else {
        return await this.callClaude(prompt, request.stocks, request.strategy);
      }
    } catch (error: any) {
      console.error('AI analysis error:', error);
      if (error.message?.includes('Failed to fetch')) {
        throw new Error(`Netzwerkfehler: Konnte ${this.provider === 'claude' ? 'Claude' : 'OpenAI'} API nicht erreichen. Prüfe deine Internetverbindung.`);
      }
      throw error;
    }
  }

  private async callClaude(prompt: string, stocks: Stock[], strategy?: InvestmentStrategy): Promise<AIAnalysisResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
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
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4096,
        messages: [
          {
            role: 'system',
            content: 'Du bist ein erfahrener Investment-Analyst. Antworte immer im angeforderten JSON-Format.',
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
        
        // Add 52-week range data if available
        if (s.week52High && s.week52Low) {
          const positionInRange = s.week52ChangePercent ?? 0;
          const positionStr = positionInRange.toFixed(0);
          info += ` | 52W: ${s.week52Low.toFixed(2)}-${s.week52High.toFixed(2)} (${positionStr}% im Bereich)`;
          
          // Add warnings for overheated stocks
          if (positionInRange > 100) {
            info += ' ⚠️ ÜBER 52W-HOCH - EXTREM ÜBERHITZT!';
          } else if (positionInRange > 90) {
            info += ' ⚠️ ÜBERHITZT - KEIN KAUF!';
          } else if (positionInRange > 80) {
            info += ' ⚡ Nahe 52W-Hoch - Vorsicht';
          } else if (positionInRange < 20) {
            info += ' ✅ Nahe 52W-Tief - Guter Einstieg möglich';
          }
        }
        
        // Mark if user already owns this stock
        const existingPosition = request.currentPositions?.find(p => p.stock.symbol === s.symbol);
        if (existingPosition) {
          info += ` [BEREITS IM PORTFOLIO: ${existingPosition.quantity} Stück]`;
        }
        
        return info;
      })
      .join('\n');

    return `Du bist ein erfahrener Investment-Analyst. Analysiere die folgenden Aktien und gib konkrete Kauf-/Verkaufsempfehlungen.

KONTEXT:
- Investmentstrategie: ${strategyDesc}
- Risikotoleranz: ${riskDesc}
- Verfügbares Budget: ${request.budget.toFixed(2)} EUR
- Fokus: Deutsche/europäische und US-Aktien

AKTUELLE KURSE (mit 52-Wochen-Bereich):
${stocksInfo}

${request.strategy === 'long' ? `LANGFRISTIGE INVESTMENT-STRATEGIE (10+ Jahre):
- Fokus auf Qualitätsunternehmen mit starken Fundamentaldaten und Wettbewerbsvorteilen (Moat)
- Bevorzuge Unternehmen mit: stabilem Gewinnwachstum, niedriger Verschuldung, starker Marktposition
- Dividendenwachstum und Dividendenhistorie sind wichtige Faktoren
- Kurzfristige Kursschwankungen sind weniger relevant - Fokus auf langfristiges Wachstumspotenzial
- Der 52W-Bereich ist bei langfristigen Investments weniger kritisch, aber günstige Einstiegspreise sind trotzdem wünschenswert
- Empfehle breit diversifizierte Blue-Chip Aktien und etablierte Wachstumsunternehmen
- Bei langfristigen Investments können auch Aktien nahe dem 52W-Hoch gekauft werden, wenn die Fundamentaldaten stimmen
- Stop-Loss ist bei langfristigen Investments weniger relevant - setze ihn großzügiger (20-30% unter Kaufpreis)
- Berücksichtige Megatrends: Digitalisierung, Gesundheit, erneuerbare Energien, demographischer Wandel` : 
`WICHTIG - TIMING-ANALYSE & BEWERTUNG:
- Berücksichtige den 52-Wochen-Bereich für optimale Einstiegs-/Ausstiegspunkte
- KAUF nur empfehlen wenn der Preis unter 50% im 52W-Bereich liegt (guter Einstieg)
- Bei 50-70% im Bereich: HOLD oder vorsichtiger Kauf nur bei sehr starken Fundamentaldaten
- Bei 70-90% im Bereich: HOLD oder VERKAUF empfehlen (teuer bewertet)
- NIEMALS KAUF empfehlen bei >90% im Bereich - diese Aktien sind ÜBERHITZT!
- Bei >100% (über 52W-Hoch): STARKE VERKAUFSWARNUNG, extrem überhitzt
- Bei HOLD: Gib konkret an, bei welchem Preis ein guter Einstieg wäre

STRIKTE REGELN FÜR ÜBERHITZTE AKTIEN:
- Aktien über 90% im 52W-Bereich dürfen NICHT zum Kauf empfohlen werden
- Stattdessen: HOLD mit Hinweis auf idealen Einstiegspreis oder SELL wenn stark überhitzt
- Begründe warum die Aktie aktuell zu teuer ist`}

${request.currentPositions?.length ? `
AKTUELLE PORTFOLIO-POSITIONEN (SEHR WICHTIG!):
Diese Aktien besitzt der Nutzer bereits. Berücksichtige dies bei deinen Empfehlungen!
${request.currentPositions.map(p => `- ${p.stock.symbol} (${p.stock.name}): ${p.quantity} Stück, Kaufpreis: ${p.averageBuyPrice.toFixed(2)}, Aktueller Preis: ${p.currentPrice.toFixed(2)}, P/L: ${p.profitLossPercent >= 0 ? '+' : ''}${p.profitLossPercent.toFixed(2)}%`).join('\n')}

${request.strategy === 'long' ? `LANGFRISTIGE STRATEGIE - REGELN FÜR BESTEHENDE POSITIONEN:
- HALTE Qualitätsaktien langfristig, auch bei Kursrückgängen von 20-30%
- Verkaufe NUR bei fundamentaler Verschlechterung des Unternehmens (nicht wegen Kursschwankungen!)
- Gewinne von 50%, 100% oder mehr sind bei langfristigen Investments NORMAL - KEIN Verkaufsgrund!
- Nachkaufen bei Kursrückgängen kann sinnvoll sein (Cost-Average-Effekt)
- Fokus auf: Dividendenwachstum, Gewinnentwicklung, Marktposition - NICHT auf kurzfristige Kursbewegungen
- Bei Gewinnern: HALTEN und weiterlaufen lassen, solange Fundamentaldaten stimmen
- Verkaufsempfehlung nur bei: massiver Überbewertung (KGV >50), Verschlechterung der Geschäftsaussichten, bessere Alternativen` 
: `WICHTIG für Positionen (kurz-/mittelfristig):
- Empfehle KEINEN KAUF für Aktien die der Nutzer bereits besitzt (es sei denn zum Nachkaufen bei gutem Einstieg)
- Bei Gewinn >20% und hoher 52W-Position: Empfehle Teilverkauf oder Gewinnmitnahme
- Prüfe ob bestehende Positionen verkauft werden sollten (Überbewertung, Stop-Loss erreicht)`}
` : 'HINWEIS: Der Nutzer hat keine Positionen im Portfolio angegeben.\n'}

STRATEGIE-KOMPATIBILITÄTSPRÜFUNG (${strategyDesc}):
${request.strategy === 'long' ? `Prüfe für JEDE Aktie (Portfolio UND Watchlist):
- Ist diese Aktie für langfristige Buy & Hold Strategie geeignet?
- WARNUNG bei: Meme-Stocks, hochspekulative Tech-Aktien ohne Gewinne, Penny Stocks, Krypto-bezogene Aktien
- EMPFOHLEN für langfristig: Blue-Chips, Dividenden-Aristokraten, etablierte Marktführer, Qualitätsunternehmen mit Moat
- Bei UNGEEIGNETEN Aktien im Portfolio: Empfehle Verkauf und erkläre warum sie nicht zur Strategie passen
- Bei UNGEEIGNETEN Aktien in Watchlist: KEIN KAUF empfehlen, stattdessen Warnung ausgeben` 
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
Analysiere jede Aktie und gib für jede eine Empfehlung (BUY/SELL/HOLD) mit:
1. Signal (BUY, SELL, oder HOLD)
2. Konfidenz (0-100%)
3. Begründung (2-3 Sätze, berücksichtige die Position im 52W-Bereich)
4. Idealer Einstiegspreis (bei BUY: Warte-Preis falls aktuell zu hoch)
5. Zielpreis
6. Stop-Loss
7. Risikoeinschätzung (low/medium/high)

Antworte im folgenden JSON-Format:
{
  "signals": [
    {
      "symbol": "AAPL",
      "signal": "BUY",
      "confidence": 75,
      "reasoning": "Begründung hier, inkl. Timing-Empfehlung basierend auf 52W-Bereich...",
      "idealEntryPrice": 165.00,
      "targetPrice": 180.00,
      "stopLoss": 155.00,
      "riskLevel": "medium"
    }
  ],
  "marketSummary": "Kurze Zusammenfassung der Marktlage...",
  "recommendations": ["Empfehlung 1", "Empfehlung 2"],
  "warnings": ["Warnung 1"]
}

Antworte NUR mit dem JSON, ohne zusätzlichen Text.`;
  }

  private parseAIResponse(content: string, stocks: Stock[], strategy?: InvestmentStrategy): AIAnalysisResponse {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
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

      return {
        signals,
        marketSummary: parsed.marketSummary || '',
        recommendations: parsed.recommendations || [],
        warnings: parsed.warnings || [],
        analyzedAt: new Date(),
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return {
        signals: [],
        marketSummary: 'Analyse konnte nicht verarbeitet werden.',
        recommendations: [],
        warnings: ['Die AI-Antwort konnte nicht geparst werden.'],
        analyzedAt: new Date(),
      };
    }
  }
}

// Singleton instance - API key and provider will be set from settings
let aiServiceInstance: AIService | null = null;
let currentProvider: AIProvider | null = null;

export const getAIService = (apiKey: string, provider: AIProvider = 'claude'): AIService => {
  if (!aiServiceInstance || aiServiceInstance['apiKey'] !== apiKey || currentProvider !== provider) {
    aiServiceInstance = new AIService(apiKey, provider);
    currentProvider = provider;
  }
  return aiServiceInstance;
};
