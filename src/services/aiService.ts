import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
  InvestmentSignal,
  Stock,
  InvestmentStrategy,
  RiskLevel,
} from '../types';

export class AIService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyzeMarket(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    if (!this.apiKey) {
      throw new Error('Claude API key is required');
    }

    const prompt = this.buildAnalysisPrompt(request);
    
    try {
      // Using fetch to call Claude API directly (browser-compatible)
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
        console.error('API Error Response:', errorText);
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
      console.log('AI API Response:', data);
      const content = data.content[0]?.text || '';

      return this.parseAIResponse(content, request.stocks);
    } catch (error: any) {
      console.error('AI analysis error:', error);
      if (error.message?.includes('Failed to fetch')) {
        throw new Error('Netzwerkfehler: Konnte Claude API nicht erreichen. Prüfe deine Internetverbindung.');
      }
      throw error;
    }
  }

  private buildAnalysisPrompt(request: AIAnalysisRequest): string {
    const strategyDesc = request.strategy === 'short' 
      ? 'kurzfristig (Tage bis Wochen)' 
      : 'mittelfristig (Wochen bis Monate)';
    
    const riskDesc = {
      low: 'konservativ (minimales Risiko)',
      medium: 'ausgewogen (moderates Risiko)',
      high: 'aggressiv (höheres Risiko für höhere Rendite)',
    }[request.riskTolerance];

    const stocksInfo = request.stocks
      .map(s => `${s.symbol} (${s.name}): ${s.price.toFixed(2)} ${s.currency} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)`)
      .join('\n');

    return `Du bist ein erfahrener Investment-Analyst. Analysiere die folgenden Aktien und gib konkrete Kauf-/Verkaufsempfehlungen.

KONTEXT:
- Investmentstrategie: ${strategyDesc}
- Risikotoleranz: ${riskDesc}
- Verfügbares Budget: ${request.budget.toFixed(2)} EUR
- Fokus: Trade Republic (deutsche/europäische und US-Aktien)

AKTUELLE KURSE:
${stocksInfo}

${request.currentPositions?.length ? `
AKTUELLE POSITIONEN:
${request.currentPositions.map(p => `${p.stock.symbol}: ${p.quantity} Stück @ ${p.averageBuyPrice.toFixed(2)} (P/L: ${p.profitLossPercent.toFixed(2)}%)`).join('\n')}
` : ''}

AUFGABE:
Analysiere jede Aktie und gib für jede eine Empfehlung (BUY/SELL/HOLD) mit:
1. Signal (BUY, SELL, oder HOLD)
2. Konfidenz (0-100%)
3. Begründung (2-3 Sätze)
4. Zielpreis (optional)
5. Stop-Loss (optional)
6. Risikoeinschätzung (low/medium/high)

Antworte im folgenden JSON-Format:
{
  "signals": [
    {
      "symbol": "AAPL",
      "signal": "BUY",
      "confidence": 75,
      "reasoning": "Begründung hier...",
      "targetPrice": 180.00,
      "stopLoss": 165.00,
      "riskLevel": "medium"
    }
  ],
  "marketSummary": "Kurze Zusammenfassung der Marktlage...",
  "recommendations": ["Empfehlung 1", "Empfehlung 2"],
  "warnings": ["Warnung 1"]
}

Antworte NUR mit dem JSON, ohne zusätzlichen Text.`;
  }

  private parseAIResponse(content: string, stocks: Stock[]): AIAnalysisResponse {
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
          strategy: 'middle' as InvestmentStrategy,
          confidence: s.confidence || 50,
          reasoning: s.reasoning || '',
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

// Singleton instance - API key will be set from settings
let aiServiceInstance: AIService | null = null;

export const getAIService = (apiKey: string): AIService => {
  if (!aiServiceInstance || aiServiceInstance['apiKey'] !== apiKey) {
    aiServiceInstance = new AIService(apiKey);
  }
  return aiServiceInstance;
};
