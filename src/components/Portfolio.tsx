import { useState, useEffect, useRef } from 'react';
import { 
  Briefcase, 
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  Plus,
  Brain,
  RefreshCw,
  X,
  Wallet,
  Edit3,
  Check,
  ShoppingCart,
  ArrowRightLeft
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { marketDataService } from '../services/marketData';
import emailjs from '@emailjs/browser';
import type { UserPosition, AnalysisHistoryEntry } from '../types';

interface SymbolSuggestion {
  symbol: string;
  name: string;
  price?: number;
  changePercent?: number;
  loading?: boolean;
}

export function Portfolio() {
  const { 
    settings, 
    userPositions, 
    addUserPosition, 
    updateUserPosition,
    removeUserPosition,
    watchlist,
    cashBalance,
    setCashBalance,
    setError,
    orderSettings
  } = useAppStore();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const { lastAnalysis: analysisResult, lastAnalysisDate, setLastAnalysis: setAnalysisResult, addAnalysisHistory, isAnalyzing: analyzing, setAnalyzing } = useAppStore();
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState('');
  const [editingPosition, setEditingPosition] = useState<string | null>(null);
  const [editSymbol, setEditSymbol] = useState('');
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');

  const [editingBuyPrice, setEditingBuyPrice] = useState<string | null>(null);
  const [editBuyPriceValue, setEditBuyPriceValue] = useState('');
  const [tradeAction, setTradeAction] = useState<{ positionId: string; type: 'buy' | 'sell' } | null>(null);
  const [tradeQuantity, setTradeQuantity] = useState('');
  const [yahooPrices, setYahooPrices] = useState<Record<string, number>>({});
  const [loadingYahooPrices, setLoadingYahooPrices] = useState(false);
  const [symbolSuggestions, setSymbolSuggestions] = useState<SymbolSuggestion[]>([]);
  const [searchingSymbol, setSearchingSymbol] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const symbolSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    symbol: '',
    isin: '',
    name: '',
    quantity: '',
    buyPrice: '',
    currentPrice: '',
    currency: 'EUR'
  });

  // Execute instant trade at current market price
  const executeTrade = (positionId: string, type: 'buy' | 'sell', quantity: number) => {
    const position = userPositions.find(p => p.id === positionId);
    if (!position || quantity <= 0) return;

    const price = yahooPrices[positionId] ?? position.currentPrice;
    const totalCost = price * quantity;
    
    // Transaktionsgebühren berechnen
    const fee = (orderSettings.transactionFeeFlat || 0) + totalCost * (orderSettings.transactionFeePercent || 0) / 100;

    // WICHTIG: Immer den aktuellen Cash-Wert aus dem Store lesen (nicht aus der Closure!)
    const currentCash = useAppStore.getState().cashBalance;

    if (type === 'buy') {
      if (totalCost + fee > currentCash) {
        setError(`Nicht genügend Cash. Benötigt: ${(totalCost + fee).toFixed(2)} € (inkl. ${fee.toFixed(2)} € Gebühren), Verfügbar: ${currentCash.toFixed(2)} €`);
        return;
      }
      // Nachkaufen: Durchschnittspreis berechnen
      const newTotalQty = position.quantity + quantity;
      const avgBuyPrice = (position.buyPrice * position.quantity + price * quantity) / newTotalQty;
      updateUserPosition(positionId, { quantity: newTotalQty, buyPrice: avgBuyPrice, currentPrice: price });
      setCashBalance(currentCash - totalCost - fee);
    } else {
      if (quantity > position.quantity) {
        setError(`Nicht genügend Aktien. Verfügbar: ${position.quantity}`);
        return;
      }
      const newQty = position.quantity - quantity;
      if (newQty <= 0) {
        // Position komplett verkaufen
        removeUserPosition(positionId);
      } else {
        updateUserPosition(positionId, { quantity: newQty, currentPrice: price });
      }
      setCashBalance(currentCash + totalCost - fee);
    }
    setTradeAction(null);
    setTradeQuantity('');
  };

  // Calculate totals
  const totalInvested = userPositions.reduce((sum, p) => sum + (p.quantity * p.buyPrice), 0);
  const totalCurrentValue = userPositions.reduce((sum, p) => sum + (p.quantity * p.currentPrice), 0);
  const totalProfitLoss = totalCurrentValue - totalInvested;
  const totalProfitLossPercent = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

  // Timestamp for last update
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch Yahoo prices function - extracted for manual refresh
  const fetchYahooPrices = async () => {
    if (userPositions.length === 0) return;
    
    console.log('[Yahoo] Fetching prices for', userPositions.length, 'positions...');
    setLoadingYahooPrices(true);
    const prices: Record<string, number> = {};
    
    // Get current positions from store to avoid stale closure
    const currentPositions = useAppStore.getState().userPositions;
    
    for (const position of currentPositions) {
      const symbolToFetch = position.symbol && position.symbol !== position.isin 
        ? position.symbol 
        : position.isin || position.symbol;
      
      console.log('[Yahoo] Fetching:', symbolToFetch);
      try {
        const quote = await marketDataService.getQuote(symbolToFetch);
        console.log('[Yahoo] Result for', symbolToFetch, ':', quote);
        if (quote && quote.price > 0 && !isNaN(quote.price)) {
          prices[position.id] = quote.price;
          // Auto-update if useYahooPrice is enabled
          if (position.useYahooPrice) {
            console.log('[Yahoo] Auto-updating position', position.id, 'to price:', quote.price);
            useAppStore.getState().updateUserPosition(position.id, { currentPrice: quote.price });
          }
        }
      } catch (e) {
        console.error('[Yahoo] Error fetching', symbolToFetch, ':', e);
      }
    }
    
    console.log('[Yahoo] Final prices:', prices);
    setYahooPrices(prices);
    setLoadingYahooPrices(false);
    setLastUpdate(new Date());
  };

  // Fetch Yahoo Finance prices for comparison
  useEffect(() => {
    // Fetch immediately on mount
    fetchYahooPrices();
    
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchYahooPrices, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch when positions change or useYahooPrice toggles change
  const positionCount = userPositions.length;
  const yahooEnabledSignature = userPositions.map(p => `${p.id}:${p.useYahooPrice}`).join(',');
  
  useEffect(() => {
    if (positionCount > 0) {
      console.log('[Yahoo] Positions or settings changed, refetching...');
      fetchYahooPrices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionCount, yahooEnabledSignature]);

  // Symbol search with debounce
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

  const [addingPosition, setAddingPosition] = useState(false);

  const handleAddPosition = async () => {
    if ((!formData.symbol && !formData.isin) || !formData.quantity || !formData.currentPrice) {
      return;
    }

    const quantity = parseFloat(formData.quantity);
    let buyPrice: number;

    // Kaufpreis automatisch ermitteln, wenn nicht angegeben
    if (formData.buyPrice && parseFloat(formData.buyPrice) > 0) {
      buyPrice = parseFloat(formData.buyPrice);
    } else {
      setAddingPosition(true);
      try {
        const symbol = formData.symbol || formData.isin;
        const quote = await marketDataService.getQuote(symbol);
        if (quote && quote.price > 0) {
          buyPrice = quote.price;
        } else {
          // Fallback: aktuellen Preis aus dem Formular verwenden
          buyPrice = parseFloat(formData.currentPrice);
        }
      } catch {
        // Fallback: aktuellen Preis aus dem Formular verwenden
        buyPrice = parseFloat(formData.currentPrice);
      } finally {
        setAddingPosition(false);
      }
    }

    const totalCost = buyPrice * quantity;
    
    // Transaktionsgebühren berechnen
    const fee = (orderSettings.transactionFeeFlat || 0) + totalCost * (orderSettings.transactionFeePercent || 0) / 100;

    // WICHTIG: Immer den aktuellen Cash-Wert aus dem Store lesen (nicht aus der Closure!)
    const currentCash = useAppStore.getState().cashBalance;

    // Cash-Prüfung
    if (totalCost + fee > currentCash) {
      setError(`Nicht genügend Cash. Benötigt: ${(totalCost + fee).toFixed(2)} € (inkl. ${fee.toFixed(2)} € Gebühren), Verfügbar: ${currentCash.toFixed(2)} €`);
      return;
    }

    const newPosition: UserPosition = {
      id: `pos-${Date.now()}`,
      symbol: formData.symbol.toUpperCase() || formData.isin.toUpperCase(),
      isin: formData.isin.toUpperCase() || undefined,
      name: formData.name || formData.symbol.toUpperCase() || formData.isin.toUpperCase(),
      quantity,
      buyPrice,
      currentPrice: parseFloat(formData.currentPrice),
      currency: formData.currency
    };

    addUserPosition(newPosition);
    setCashBalance(currentCash - totalCost - fee);
    setFormData({ symbol: '', isin: '', name: '', quantity: '', buyPrice: '', currentPrice: '', currency: 'EUR' });
    setShowAddForm(false);
  };

  const getProfitLoss = (position: UserPosition) => {
    const invested = position.quantity * position.buyPrice;
    const current = position.quantity * position.currentPrice;
    return {
      absolute: current - invested,
      percent: ((current - invested) / invested) * 100
    };
  };

  // AI Portfolio Analysis
  const analyzePortfolio = async () => {
    const activeApiKey = settings.aiProvider === 'openai' 
      ? settings.apiKeys.openai 
      : settings.aiProvider === 'gemini'
      ? settings.apiKeys.gemini
      : settings.apiKeys.claude;
    const providerName = settings.aiProvider === 'openai' ? 'OpenAI' : settings.aiProvider === 'gemini' ? 'Google Gemini' : 'Claude';
    
    if (!activeApiKey) {
      setError(`Bitte füge deinen ${providerName} API-Schlüssel in den Einstellungen hinzu.`);
      return;
    }

    if (userPositions.length === 0) {
      setError('Füge zuerst Positionen zu deinem Portfolio hinzu.');
      return;
    }

    setAnalyzing(true);
    // Alte Analyse NICHT löschen, damit sie während des Ladens sichtbar bleibt
    // setAnalysisResult(null); — wird erst bei Erfolg überschrieben

    try {
      // 52-Wochen-Daten laden (wie Autopilot) für konsistente Analyse
      const portfolioSymbols = userPositions.map(p => p.symbol);
      const watchlistSymbolsList = watchlist.map(s => s.symbol);
      const allSymbolsForQuotes = [...new Set([...portfolioSymbols, ...watchlistSymbolsList])];
      let stocksWithRange: import('../types').Stock[] = [];
      try {
        stocksWithRange = await marketDataService.getQuotesWithRange(allSymbolsForQuotes);
      } catch (e) {
        console.warn('[Portfolio] Konnte 52W-Daten nicht laden, fahre ohne fort:', e);
      }

      // Build portfolio context with 52-week data (harmonized with Autopilot)
      const portfolioSummary = userPositions.map(p => {
        const pl = getProfitLoss(p);
        const identifier = p.isin ? `${p.name} (ISIN: ${p.isin})` : `${p.symbol} (${p.name})`;
        let info = `${identifier}: ${p.quantity} Stück, Kaufpreis: ${p.buyPrice.toFixed(2)} ${p.currency}, Aktuell: ${p.currentPrice.toFixed(2)} ${p.currency}, P/L: ${pl.percent >= 0 ? '+' : ''}${pl.percent.toFixed(2)}% (${pl.absolute >= 0 ? '+' : ''}${pl.absolute.toFixed(2)} ${p.currency})`;
        
        // 52-Wochen-Daten hinzufügen (gleich wie in aiService.buildAnalysisPrompt)
        const stockData = stocksWithRange.find(s => s.symbol === p.symbol);
        if (stockData?.week52High && stockData?.week52Low) {
          const positionInRange = stockData.week52ChangePercent ?? 0;
          info += ` | 52W: ${stockData.week52Low.toFixed(2)}-${stockData.week52High.toFixed(2)} (${positionInRange.toFixed(0)}% im Bereich)`;
          if (positionInRange > 100) info += ' ⚠️ ÜBER 52W-HOCH - EXTREM ÜBERHITZT!';
          else if (positionInRange > 90) info += ' ⚠️ ÜBERHITZT';
          else if (positionInRange > 80) info += ' ⚡ Nahe 52W-Hoch - Vorsicht';
          else if (positionInRange < 20) info += ' ✅ Nahe 52W-Tief';
        }
        return info;
      }).join('\n');

      // Direct API call for portfolio analysis - use selected provider
      const isOpenAI = settings.aiProvider === 'openai';
      const isGemini = settings.aiProvider === 'gemini';
      const apiUrl = isOpenAI 
        ? 'https://api.openai.com/v1/chat/completions'
        : isGemini
        ? `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel || 'gemini-2.5-flash'}:generateContent?key=${activeApiKey}`
        : 'https://api.anthropic.com/v1/messages';
      const apiHeaders: Record<string, string> = isOpenAI
        ? {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeApiKey}`,
          }
        : isGemini
        ? {
            'Content-Type': 'application/json',
          }
        : {
            'Content-Type': 'application/json',
            'x-api-key': activeApiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          };

      // Build watchlist context (stocks NOT in portfolio, for new recommendations)
      // Mit 52W-Daten angereichert (harmonisiert mit Autopilot/aiService)
      const portfolioSymbolsUpper = userPositions.map(p => p.symbol.toUpperCase());
      const watchlistOnly = watchlist.filter(s => !portfolioSymbolsUpper.includes(s.symbol.toUpperCase()));
      const watchlistSummary = watchlistOnly.length > 0
        ? watchlistOnly.map(s => {
            const stockData = stocksWithRange.find(sq => sq.symbol === s.symbol);
            let info = `${s.symbol} (${s.name}): ${(stockData?.price ?? s.price)?.toFixed(2) ?? '?'} ${s.currency} (${(stockData?.changePercent ?? s.changePercent) != null ? ((stockData?.changePercent ?? s.changePercent!) >= 0 ? '+' : '') + (stockData?.changePercent ?? s.changePercent!).toFixed(2) + '%' : '?'})`;
            if (stockData?.week52High && stockData?.week52Low) {
              const posInRange = stockData.week52ChangePercent ?? 0;
              info += ` | 52W: ${stockData.week52Low.toFixed(2)}-${stockData.week52High.toFixed(2)} (${posInRange.toFixed(0)}% im Bereich)`;
              if (posInRange > 100) info += ' ⚠️ ÜBER 52W-HOCH!';
              else if (posInRange > 90) info += ' ⚠️ ÜBERHITZT';
              else if (posInRange > 80) info += ' ⚡ Nahe 52W-Hoch';
              else if (posInRange < 20) info += ' ✅ Nahe 52W-Tief';
            }
            return info;
          }).join('\n')
        : 'Keine Watchlist-Aktien vorhanden.';

      // Build AI memory context from previous analyses
      const memoryContext = (() => {
        const history = useAppStore.getState().analysisHistory;
        if (history.length === 0) return '';

        const lastEntry = history[0];
        const lastDate = new Date(lastEntry.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        
        // Detect changes since last analysis
        const prevPositions = lastEntry.portfolioSnapshot.positions;
        const currentSymbols = userPositions.map(p => p.symbol.toUpperCase());
        const prevSymbols = prevPositions.map(p => p.symbol.toUpperCase());
        
        const newPositions = userPositions.filter(p => !prevSymbols.includes(p.symbol.toUpperCase()));
        const removedPositions = prevPositions.filter(p => !currentSymbols.includes(p.symbol.toUpperCase()));
        const changedPositions = userPositions.filter(p => {
          const prev = prevPositions.find(pp => pp.symbol.toUpperCase() === p.symbol.toUpperCase());
          if (!prev) return false;
          return prev.quantity !== p.quantity || Math.abs(prev.buyPrice - p.buyPrice) > 0.01;
        });

        const prevCash = lastEntry.portfolioSnapshot.cashBalance;
        const cashChanged = Math.abs(prevCash - cashBalance) > 0.01;

        const prevWatchlistSymbols = lastEntry.watchlistSymbols || [];
        const currentWatchlistSymbols = watchlist.map(s => s.symbol.toUpperCase());
        const newWatchlistItems = currentWatchlistSymbols.filter(s => !prevWatchlistSymbols.includes(s));
        const removedWatchlistItems = prevWatchlistSymbols.filter(s => !currentWatchlistSymbols.includes(s));

        let changes = '';
        if (newPositions.length > 0) {
          changes += `\n✅ NEU GEKAUFT seit letzter Analyse:\n${newPositions.map(p => `  - ${p.name} (${p.symbol}): ${p.quantity} Stück zu ${p.buyPrice.toFixed(2)} ${p.currency}`).join('\n')}`;
        }
        if (removedPositions.length > 0) {
          changes += `\n❌ VERKAUFT seit letzter Analyse:\n${removedPositions.map(p => `  - ${p.name} (${p.symbol}): ${p.quantity} Stück (war zu ${p.buyPrice.toFixed(2)})`).join('\n')}`;
        }
        if (changedPositions.length > 0) {
          changes += `\n🔄 POSITION GEÄNDERT seit letzter Analyse:\n${changedPositions.map(p => {
            const prev = prevPositions.find(pp => pp.symbol.toUpperCase() === p.symbol.toUpperCase())!;
            const qtyChange = p.quantity !== prev.quantity ? ` Menge: ${prev.quantity} → ${p.quantity}` : '';
            const priceChange = Math.abs(prev.buyPrice - p.buyPrice) > 0.01 ? ` Kaufpreis: ${prev.buyPrice.toFixed(2)} → ${p.buyPrice.toFixed(2)}` : '';
            return `  - ${p.name} (${p.symbol}):${qtyChange}${priceChange}`;
          }).join('\n')}`;
        }
        if (cashChanged) {
          changes += `\n💰 CASH GEÄNDERT: ${prevCash.toFixed(2)} EUR → ${cashBalance.toFixed(2)} EUR`;
        }
        if (newWatchlistItems.length > 0) {
          changes += `\n👀 NEU AUF WATCHLIST: ${newWatchlistItems.join(', ')}`;
        }
        if (removedWatchlistItems.length > 0) {
          changes += `\n🗑️ VON WATCHLIST ENTFERNT: ${removedWatchlistItems.join(', ')}`;
        }

        const noChanges = !newPositions.length && !removedPositions.length && !changedPositions.length && !cashChanged && !newWatchlistItems.length && !removedWatchlistItems.length;

        // Smart truncation: preserve buy recommendations section which often appears later in the text
        const buildPrevAnalysisSummary = (text: string, maxLen: number): string => {
          if (text.length <= maxLen) return text;
          
          // Try to find and preserve the "Neue Kaufempfehlungen" / recommendations section
          const recPatterns = [
            /🆕.*?(?:KAUFEMPFEHLUNG|Kaufempfehlung)/i,
            /(?:neue|new).*?(?:kaufempfehlung|empfehlung|recommendation)/i,
            /🎯.*?(?:AKTIONSPLAN|Aktionsplan)/i,
          ];
          
          let recSectionStart = -1;
          for (const pattern of recPatterns) {
            const match = text.search(pattern);
            if (match > maxLen && match !== -1) {
              recSectionStart = match;
              break;
            }
          }
          
          if (recSectionStart > 0) {
            // Include beginning + recommendations section
            const firstPartLen = Math.floor(maxLen * 0.55);
            const secondPartLen = maxLen - firstPartLen - 50; // reserve space for separator
            const firstPart = text.substring(0, firstPartLen);
            const secondPart = text.substring(recSectionStart, recSectionStart + secondPartLen);
            return firstPart + '\n... (Portfolio-Bewertung gekürzt) ...\n' + secondPart + (recSectionStart + secondPartLen < text.length ? '\n... (gekürzt)' : '');
          }
          
          // Fallback: simple truncation with higher limit
          return text.substring(0, maxLen) + '\n... (gekürzt)';
        };
        
        const prevAnalysisTruncated = buildPrevAnalysisSummary(lastEntry.analysisText, 5000);

        return `
═══════════════════════════════════════
🧠 KI-GEDÄCHTNIS: LETZTE ANALYSE (${lastDate})
═══════════════════════════════════════
${prevAnalysisTruncated}

═══════════════════════════════════════
📋 ÄNDERUNGEN SEIT LETZTER ANALYSE:
═══════════════════════════════════════
${noChanges ? '⚪ Keine Änderungen am Portfolio seit der letzten Analyse.' : changes}

WICHTIG FÜR DIESE ANALYSE:
- Beziehe dich auf deine vorherige Analyse und erkenne an, welche Empfehlungen bereits umgesetzt wurden
- Wenn der Nutzer Aktien gekauft hat die du empfohlen hast, bestätige dies positiv
- Wenn Empfehlungen NICHT umgesetzt wurden, wiederhole sie falls noch aktuell, oder aktualisiere sie
- Vermeide es, die gleichen Empfehlungen wortwörtlich zu wiederholen - entwickle die Analyse weiter
- Gib einen kurzen Abschnitt "📝 Umsetzungs-Check" am Anfang, der zusammenfasst was seit letztem Mal passiert ist

`;
      })();

      // Letzte Autopilot-Signale einbinden für Konsistenz zwischen Portfolio und Autopilot
      const autopilotSignalsContext = (() => {
        const allSignals = useAppStore.getState().signals || [];
        const recentSignals = allSignals.slice(0, 10);
        if (recentSignals.length === 0) return '';
        const signalLines = recentSignals.map(s => {
          const age = Math.round((Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60));
          const ageStr = age < 24 ? 'vor ' + age + 'h' : 'vor ' + Math.round(age / 24) + 'd';
          return '- ' + s.stock.symbol + ': ' + s.signal + ' (Konfidenz: ' + s.confidence + '%, ' + ageStr + ') - ' + s.reasoning.substring(0, 120) + '...';
        }).join('\n');
        return '═══════════════════════════════════════\n🤖 LETZTE AUTOPILOT-SIGNALE (für konsistente Bewertung):\n═══════════════════════════════════════\nDiese Signale wurden vom Autopilot-Modul generiert. Deine Portfolio-Analyse sollte mit diesen Einschätzungen konsistent sein, es sei denn neue Informationen rechtfertigen eine Abweichung.\n' + signalLines + '\n\nWICHTIG: Wenn deine Einschätzung von den Autopilot-Signalen abweicht, erkläre warum!\n';
      })();

      const promptContent = `Du bist ein erfahrener Investment-Analyst. Analysiere mein aktuelles Portfolio und gib konkrete Empfehlungen.

═══════════════════════════════════════
MEIN PORTFOLIO (NUR diese ${userPositions.length} Positionen besitze ich!):
═══════════════════════════════════════
${portfolioSummary}

GESAMTWERT:
- Investiert: ${totalInvested.toFixed(2)} EUR
- Aktueller Wert: ${totalCurrentValue.toFixed(2)} EUR  
- Gewinn/Verlust: ${totalProfitLoss >= 0 ? '+' : ''}${totalProfitLoss.toFixed(2)} EUR (${totalProfitLossPercent >= 0 ? '+' : ''}${totalProfitLossPercent.toFixed(2)}%)

VERFÜGBARES CASH: ${cashBalance.toFixed(2)} EUR
GESAMTVERMÖGEN (Cash + Portfolio): ${(cashBalance + totalCurrentValue).toFixed(2)} EUR
${(useAppStore.getState().initialCapital || 0) > 0 ? (() => {
  const store = useAppStore.getState();
  const initCap = store.initialCapital;
  const prevProfit = store.previousProfit || 0;
  const currentProfit = (cashBalance + totalCurrentValue) - initCap;
  const combinedProfit = currentProfit + prevProfit;
  return `STARTKAPITAL: ${initCap.toFixed(2)} EUR
GESAMTGEWINN (realisiert + unrealisiert): ${combinedProfit >= 0 ? '+' : ''}${combinedProfit.toFixed(2)} EUR (${(combinedProfit / initCap * 100).toFixed(1)}%)${prevProfit !== 0 ? `
Davon aus früheren Portfolios: ${prevProfit >= 0 ? '+' : ''}${prevProfit.toFixed(2)} EUR` : ''}`;
})() : ''}
${(orderSettings.transactionFeeFlat || orderSettings.transactionFeePercent) ? `TRANSAKTIONSGEBÜHREN: ${orderSettings.transactionFeeFlat ? `${orderSettings.transactionFeeFlat.toFixed(2)} € fix` : ''}${orderSettings.transactionFeeFlat && orderSettings.transactionFeePercent ? ' + ' : ''}${orderSettings.transactionFeePercent ? `${orderSettings.transactionFeePercent}% vom Volumen` : ''} pro Trade
HINWEIS: Berücksichtige die Gebühren bei Kauf-/Verkaufsempfehlungen! Bei kleinen Positionen können Gebühren den Gewinn schmälern.` : ''}

MEINE STRATEGIE:
- Anlagehorizont: ${settings.strategy === 'short' ? 'Kurzfristig (Tage-Wochen)' : settings.strategy === 'middle' ? 'Mittelfristig (Wochen-Monate)' : 'Langfristig (10+ Jahre, Buy & Hold)'}
- Risikotoleranz: ${settings.riskTolerance === 'low' ? 'Konservativ' : settings.riskTolerance === 'medium' ? 'Ausgewogen' : 'Aggressiv'}

${settings.strategy === 'long' ? `═══════════════════════════════════════
📏 BEWERTUNGSREGELN (LANGFRISTIGE STRATEGIE 10+ Jahre):
═══════════════════════════════════════
- Fokus auf Qualitätsunternehmen mit starken Fundamentaldaten und Wettbewerbsvorteilen (Moat)
- Bevorzuge Unternehmen mit: stabilem Gewinnwachstum, niedriger Verschuldung, starker Marktposition
- Dividendenwachstum und Dividendenhistorie sind wichtige Faktoren
- Kurzfristige Kursschwankungen sind weniger relevant - Fokus auf langfristiges Wachstumspotenzial
- Der 52W-Bereich ist bei langfristigen Investments weniger kritisch, aber günstige Einstiegspreise sind trotzdem wünschenswert
- Bei langfristigen Investments können auch Aktien nahe dem 52W-Hoch gekauft werden, wenn die Fundamentaldaten stimmen
- Stop-Loss ist bei langfristigen Investments weniger relevant - setze ihn großzügiger (20-30% unter Kaufpreis)
- Berücksichtige Megatrends: Digitalisierung, Gesundheit, erneuerbare Energien, demographischer Wandel
- HALTE Qualitätsaktien langfristig, auch bei Kursrückgängen von 20-30%
- Verkaufe NUR bei fundamentaler Verschlechterung des Unternehmens (nicht wegen Kursschwankungen!)
- Gewinne von 50%, 100% oder mehr sind bei langfristigen Investments NORMAL - KEIN Verkaufsgrund!
- Bei Gewinnern: HALTEN und weiterlaufen lassen, solange Fundamentaldaten stimmen
- Verkaufsempfehlung nur bei: massiver Überbewertung (KGV >50), Verschlechterung der Geschäftsaussichten, bessere Alternativen
- WARNUNG bei: Meme-Stocks, hochspekulative Tech-Aktien ohne Gewinne, Penny Stocks, Krypto-bezogene Aktien` 
: settings.strategy === 'short' ? `═══════════════════════════════════════
📏 BEWERTUNGSREGELN (KURZFRISTIGE STRATEGIE Tage-Wochen):
═══════════════════════════════════════
- TIMING-ANALYSE & BEWERTUNG anhand 52-Wochen-Bereich:
- KAUF nur empfehlen wenn der Preis unter 50% im 52W-Bereich liegt (guter Einstieg)
- Bei 50-70% im Bereich: HALTEN oder vorsichtiger Kauf nur bei sehr starken Fundamentaldaten
- Bei 70-90% im Bereich: HALTEN oder VERKAUFEN empfehlen (teuer bewertet)
- NIEMALS KAUF empfehlen bei >90% im Bereich - diese Aktien sind ÜBERHITZT!
- Bei >100% (über 52W-Hoch): STARKE VERKAUFSWARNUNG, extrem überhitzt
- Achte besonders auf technische Signale und kurzfristige Katalysatoren
- Bei Gewinn >20% und hoher 52W-Position: Empfehle Teilverkauf oder Gewinnmitnahme`
: `═══════════════════════════════════════
📏 BEWERTUNGSREGELN (MITTELFRISTIGE STRATEGIE Wochen-Monate):
═══════════════════════════════════════
- TIMING-ANALYSE & BEWERTUNG anhand 52-Wochen-Bereich:
- KAUF nur empfehlen wenn der Preis unter 50% im 52W-Bereich liegt (guter Einstieg)
- Bei 50-70% im Bereich: HALTEN oder vorsichtiger Kauf nur bei sehr starken Fundamentaldaten
- Bei 70-90% im Bereich: HALTEN oder VERKAUFEN empfehlen (teuer bewertet)
- NIEMALS KAUF empfehlen bei >90% im Bereich - diese Aktien sind ÜBERHITZT!
- Bei >100% (über 52W-Hoch): STARKE VERKAUFSWARNUNG, extrem überhitzt
- Balance zwischen Wachstum und Risiko
- Achte auf kommende Earnings, Produktlaunches, Branchentrends
- Bei Gewinn >20% und hoher 52W-Position: Empfehle Teilverkauf oder Gewinnmitnahme`}

═══════════════════════════════════════
MEINE WATCHLIST (beobachtete Aktien, die ich NICHT besitze):
═══════════════════════════════════════
${watchlistSummary}

HEUTIGES DATUM: ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

${(() => {
  const activeOrders = useAppStore.getState().orders.filter(o => o.status === 'active');
  if (activeOrders.length === 0) return '';
  const orderTypeLabels: Record<string, string> = { 'limit-buy': 'Limit Buy', 'limit-sell': 'Limit Sell', 'stop-loss': 'Stop Loss', 'stop-buy': 'Stop Buy' };
  return `═══════════════════════════════════════
📝 MEINE AKTIVEN ORDERS (diese Orders existieren bereits!):
═══════════════════════════════════════
${activeOrders.map(o => `- ${o.symbol} (${o.name}): ${orderTypeLabels[o.orderType] || o.orderType} | Trigger: ${o.triggerPrice.toFixed(2)} EUR | Menge: ${o.quantity} Stück${o.note ? ` | ${o.note}` : ''}`).join('\n')}

WICHTIG: Empfehle KEINE Orders die bereits oben aufgelistet sind!
- Wenn eine Order für ein Symbol+Typ bereits existiert, erwähne sie NICHT erneut als neue Empfehlung
- Du kannst bestehende Orders bewerten (ob sie noch sinnvoll sind)
- Nur wenn eine bestehende Order angepasst werden sollte, empfehle eine neue mit anderem Trigger-Preis
`;
})()}
${memoryContext}
${autopilotSignalsContext}
═══════════════════════════════════════
AUFGABE:
═══════════════════════════════════════

📊 **1. PORTFOLIO-ANALYSE** (NUR meine ${userPositions.length} oben gelisteten Positionen!)
WICHTIG: Analysiere AUSSCHLIESSLICH die Positionen die oben unter "MEIN PORTFOLIO" aufgelistet sind.
Erfinde KEINE zusätzlichen Positionen! Füge KEINE Watchlist-Aktien hier hinzu!

⚠️ DU MUSST JEDE EINZELNE DER ${userPositions.length} POSITIONEN BEWERTEN! Keine auslassen!
Hier ist die vollständige Liste der zu bewertenden Positionen:
${userPositions.map((p, i) => `  ${i + 1}. ${p.name} (${p.symbol})`).join('\n')}

Für JEDE dieser ${userPositions.length} Positionen MUSS eine Bewertung enthalten sein:
- HALTEN, NACHKAUFEN, TEILVERKAUF oder VERKAUFEN
- Begründung (2-3 Sätze)
- Konkreter Aktionsvorschlag mit Zielpreis

📈 **2. GESAMTBEWERTUNG**
- Diversifikations-Check (Branchen, Regionen, Risiko)
- Risiko-Einschätzung des Gesamtportfolios

🆕 **3. NEUE KAUFEMPFEHLUNGEN** (aus Watchlist und darüber hinaus)
Basierend auf meinem verfügbaren Cash von ${cashBalance.toFixed(2)} EUR und meiner Strategie:
- Prüfe zuerst meine Watchlist-Aktien oben und empfehle die besten daraus
- Ergänze mit weiteren Aktien/ETFs falls nötig (insgesamt 3-5 Empfehlungen)
- Für jede Empfehlung: Name, Ticker-Symbol, aktueller ungefährer Kurs in EUR
- Begründung warum diese Aktie jetzt interessant ist
- Vorgeschlagene Investitionssumme in EUR
- Berücksichtige aktuelle Markttrends 2025/2026
- WICHTIG: Empfehle hier KEINE Aktien die ich bereits im Portfolio habe!

📝 **4. BESTEHENDE ORDERS BEWERTEN** (falls vorhanden)
- Sind die aktiven Orders noch sinnvoll?
- Müssen Trigger-Preise angepasst werden?
- Sollten Orders storniert werden?

🎯 **5. AKTIONSPLAN**
- Priorisierte Liste der nächsten Schritte
- Was sofort tun, was beobachten
- WIEDERHOLE KEINE Orders die bereits aktiv sind!

${settings.customPrompt ? `
═══════════════════════════════════════
⚙️ PERSÖNLICHE ANWEISUNGEN (UNBEDINGT BEACHTEN!):
═══════════════════════════════════════
${settings.customPrompt}
` : ''}
Antworte auf Deutsch mit Emojis für bessere Übersicht.`;

      const modelName = isOpenAI 
        ? (settings.openaiModel || 'gpt-5.2')
        : isGemini
        ? (settings.geminiModel || 'gemini-2.5-flash')
        : (settings.claudeModel || 'claude-opus-4-6');
      const modelDisplayNames: Record<string, string> = {
        'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5',
        'claude-opus-4-6': 'Claude Opus 4.6',
        'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
        'gpt-5.2': 'OpenAI GPT-5.2',
        'gpt-5-mini': 'OpenAI GPT-5 Mini',
        'gpt-4o': 'OpenAI GPT-4o',
        'gemini-2.5-flash': 'Google Gemini 2.5 Flash',
        'gemini-2.5-pro': 'Google Gemini 2.5 Pro',
      };
      const modelDisplayName = modelDisplayNames[modelName] || modelName;

      const apiBody = isOpenAI
        ? JSON.stringify({
            model: modelName,
            max_completion_tokens: 16384,
            messages: [
              { role: 'system', content: 'Du bist ein erfahrener Investment-Analyst. Antworte auf Deutsch mit Emojis.' },
              { role: 'user', content: promptContent },
            ],
          })
        : isGemini
        ? JSON.stringify({
            contents: [{ parts: [{ text: promptContent }] }],
            systemInstruction: { parts: [{ text: 'Du bist ein erfahrener Investment-Analyst. Antworte auf Deutsch mit Emojis.' }] },
            generationConfig: { maxOutputTokens: 16384, temperature: 0.7 },
          })
        : JSON.stringify({
            model: modelName,
            max_tokens: 16384,
            messages: [
              { role: 'user', content: promptContent },
            ],
          });

      // Retry bei Overloaded (529), Rate Limit (429), Service Unavailable (503)
      let response: Response | null = null;
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: apiHeaders,
          body: apiBody,
        });

        if ((response.status === 429 || response.status === 529 || response.status === 503) && attempt < maxRetries) {
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : (5000 * Math.pow(2, attempt));
          console.warn(`[Portfolio-Analyse] Status ${response.status} - Retry ${attempt + 1}/${maxRetries} in ${waitMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }
        break;
      }

      if (!response || !response.ok) {
        const errorText = response ? await response.text() : 'Keine Antwort';
        let errorMsg = `API-Fehler ${response?.status || 'unbekannt'}`;
        // Benutzerfreundliche Meldung bei Overloaded
        if (response?.status === 529 || errorText.toLowerCase().includes('overloaded')) {
          errorMsg = 'Der KI-Server ist momentan überlastet. Bitte versuche es in 1-2 Minuten erneut.';
        } else {
          try {
            const errorJson = JSON.parse(errorText);
            errorMsg = errorJson.error?.message || errorJson.error?.type || errorMsg;
          } catch {
            if (errorText.length < 500) errorMsg = errorText;
          }
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const content = isOpenAI 
        ? (data.choices?.[0]?.message?.content)
        : isGemini
        ? (data.candidates?.[0]?.content?.parts?.[0]?.text)
        : (data.content?.[0]?.text);
      
      if (!content) {
        console.error('API response without content:', JSON.stringify(data).slice(0, 500));
        throw new Error('KI hat keine Antwort geliefert. Bitte erneut versuchen.');
      }

      setAnalysisResult(content);

      // Save analysis to history for AI memory
      const historyEntry: AnalysisHistoryEntry = {
        id: `analysis-${Date.now()}`,
        date: new Date().toISOString(),
        analysisText: content,
        portfolioSnapshot: {
          positions: userPositions.map(p => ({
            symbol: p.symbol,
            name: p.name,
            quantity: p.quantity,
            buyPrice: p.buyPrice,
            currentPrice: p.currentPrice,
          })),
          cashBalance,
          totalValue: totalCurrentValue,
        },
        watchlistSymbols: watchlist.map(s => s.symbol.toUpperCase()),
        strategy: settings.strategy,
        aiProvider: settings.aiProvider,
      };
      addAnalysisHistory(historyEntry);

      // Send to Telegram if enabled - split into multiple messages if needed
      if (settings.notifications.telegram.enabled) {
        const telegramHeader = `📊 *Portfolio-Analyse*\n🤖 KI-Modell: ${modelDisplayName}\n\n`;
        const maxTelegramLength = 4096;
        const headerLength = telegramHeader.length;
        const chunkSize = maxTelegramLength - headerLength - 50; // Reserve space for part indicators
        
        // Split content into chunks at line breaks
        const splitContentForTelegram = (text: string, maxLen: number): string[] => {
          const chunks: string[] = [];
          let remaining = text;
          while (remaining.length > 0) {
            if (remaining.length <= maxLen) {
              chunks.push(remaining);
              break;
            }
            // Find last newline before maxLen
            let splitAt = remaining.lastIndexOf('\n', maxLen);
            if (splitAt <= 0) splitAt = maxLen;
            chunks.push(remaining.substring(0, splitAt));
            remaining = remaining.substring(splitAt).trimStart();
          }
          return chunks;
        };

        const chunks = splitContentForTelegram(content, chunkSize);
        const totalParts = chunks.length;

        for (let i = 0; i < chunks.length; i++) {
          const partIndicator = totalParts > 1 ? `(Teil ${i + 1}/${totalParts})\n` : '';
          const messageText = i === 0 
            ? `${telegramHeader}${partIndicator}${chunks[i]}`
            : `📊 *Portfolio-Analyse* ${partIndicator}\n${chunks[i]}`;
          
          try {
            await fetch(
              `https://api.telegram.org/bot${settings.notifications.telegram.botToken}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: settings.notifications.telegram.chatId,
                  text: messageText,
                  parse_mode: 'Markdown',
                }),
              }
            );
          } catch (telegramError) {
            console.error(`Failed to send Telegram part ${i + 1}:`, telegramError);
            // Retry without Markdown parse_mode in case of formatting issues
            try {
              await fetch(
                `https://api.telegram.org/bot${settings.notifications.telegram.botToken}/sendMessage`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: settings.notifications.telegram.chatId,
                    text: messageText,
                  }),
                }
              );
            } catch (retryError) {
              console.error(`Telegram retry failed for part ${i + 1}:`, retryError);
            }
          }
          // Small delay between messages to avoid rate limiting
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      // Send to Email if enabled
      console.log('Email settings check:', {
        enabled: settings.notifications.email.enabled,
        hasServiceId: !!settings.notifications.email.serviceId,
        hasTemplateId: !!settings.notifications.email.templateId,
        hasPublicKey: !!settings.notifications.email.publicKey,
        hasAddress: !!settings.notifications.email.address
      });
      
      if (settings.notifications.email.enabled && 
          settings.notifications.email.serviceId && 
          settings.notifications.email.templateId && 
          settings.notifications.email.publicKey) {
        console.log('Attempting to send email...');
        try {
          await emailjs.send(
            settings.notifications.email.serviceId,
            settings.notifications.email.templateId,
            {
              to_email: settings.notifications.email.address,
              subject: `📊 AI Invest Portfolio-Analyse (${modelDisplayName})`,
              stock_name: 'Portfolio-Analyse',
              stock_symbol: 'PORTFOLIO',
              signal_type: `ANALYSE (${modelDisplayName})`,
              price: `${totalCurrentValue.toFixed(2)} EUR`,
              change: `${totalProfitLossPercent >= 0 ? '+' : ''}${totalProfitLossPercent.toFixed(2)}%`,
              confidence: '-',
              risk_level: settings.riskTolerance === 'low' ? 'Niedrig' : settings.riskTolerance === 'medium' ? 'Mittel' : 'Hoch',
              reasoning: `🤖 KI-Modell: ${modelDisplayName}\n\n${content}`,
              target_price: '-',
              stop_loss: '-',
              date: new Date().toLocaleString('de-DE'),
            },
            settings.notifications.email.publicKey
          );
          console.log('Portfolio analysis email sent successfully');
        } catch (emailError) {
          console.error('Failed to send portfolio analysis email:', emailError);
        }
      }

    } catch (error: any) {
      console.error('Portfolio analysis error:', error);
      const msg = error.message || 'Analyse fehlgeschlagen';
      // Fehlermeldung kürzen falls es ein riesiger API-Response ist
      setError(msg.length > 300 ? msg.slice(0, 300) + '...' : msg);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Mein Portfolio</h1>
          <p className="text-gray-400">
            Verwalte und analysiere deine Aktien
            {lastUpdate && (
              <span className="ml-2 text-xs text-gray-500">
                • Preise aktualisiert: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 
                     text-white rounded-lg transition-colors"
          >
            <Plus size={18} />
            Position hinzufügen
          </button>
          <button
            onClick={analyzePortfolio}
            disabled={analyzing || userPositions.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 
                     disabled:bg-green-600/50 text-white rounded-lg transition-colors"
          >
            {analyzing ? (
              <>
                <RefreshCw className="animate-spin" size={18} />
                Analysiere...
              </>
            ) : (
              <>
                <Brain size={18} />
                KI-Analyse
              </>
            )}
          </button>
          <button
            onClick={fetchYahooPrices}
            disabled={loadingYahooPrices || userPositions.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
                     disabled:bg-blue-600/50 text-white rounded-lg transition-colors"
            title={lastUpdate ? `Zuletzt aktualisiert: ${lastUpdate.toLocaleTimeString()}` : 'Noch nicht aktualisiert'}
          >
            {loadingYahooPrices ? (
              <>
                <RefreshCw className="animate-spin" size={18} />
                Lade...
              </>
            ) : (
              <>
                <RefreshCw size={18} />
                Preise aktualisieren
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Cash Balance Card */}
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542]">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-500/20 rounded-lg">
              <Wallet size={24} className="text-yellow-500" />
            </div>
            <div className="flex-1">
              <p className="text-gray-400 text-sm">Verfügbares Cash</p>
              {editingCash ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    className="w-24 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-lg"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      setCashBalance(parseFloat(cashInput) || 0);
                      setEditingCash(false);
                    }}
                    className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                  >
                    <Check size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-yellow-500">
                    {cashBalance.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                  </p>
                  <button
                    onClick={() => {
                      setCashInput(cashBalance.toString());
                      setEditingCash(true);
                    }}
                    className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                  >
                    <Edit3 size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542]">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500/20 rounded-lg">
              <Briefcase size={24} className="text-indigo-500" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Positionen</p>
              <p className="text-2xl font-bold text-white">{userPositions.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542]">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <DollarSign size={24} className="text-blue-500" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Investiert</p>
              <p className="text-2xl font-bold text-white">
                {totalInvested.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542]">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <PieChart size={24} className="text-purple-500" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Aktueller Wert</p>
              <p className="text-2xl font-bold text-white">
                {totalCurrentValue.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              </p>
            </div>
          </div>
        </div>

        <div className={`rounded-xl p-6 border ${
          totalProfitLoss >= 0 
            ? 'bg-green-500/10 border-green-500/30' 
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${
              totalProfitLoss >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'
            }`}>
              {totalProfitLoss >= 0 ? (
                <TrendingUp size={24} className="text-green-500" />
              ) : (
                <TrendingDown size={24} className="text-red-500" />
              )}
            </div>
            <div>
              <p className="text-gray-400 text-sm">Gewinn/Verlust</p>
              <p className={`text-2xl font-bold ${
                totalProfitLoss >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {totalProfitLoss >= 0 ? '+' : ''}{totalProfitLoss.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                <span className="text-sm ml-2">
                  ({totalProfitLossPercent >= 0 ? '+' : ''}{totalProfitLossPercent.toFixed(2)}%)
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Position Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-md border border-[#252542]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Position hinzufügen</h2>
              <button 
                onClick={() => setShowAddForm(false)}
                className="p-1 hover:bg-[#252542] rounded"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Symbol
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.symbol}
                      onChange={(e) => handleSymbolSearch(e.target.value)}
                      onFocus={() => { if (symbolSuggestions.length > 0) setShowSuggestions(true); }}
                      placeholder="z.B. AAPL, MSFT"
                      autoComplete="off"
                      className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                               text-white focus:outline-none focus:border-indigo-500"
                    />
                    {searchingSymbol && (
                      <RefreshCw size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" />
                    )}
                  </div>
                  {/* Symbol Suggestions Dropdown */}
                  {showSuggestions && symbolSuggestions.length > 0 && (
                    <div className="absolute z-[60] left-0 right-0 mt-1 bg-[#1e1e3a] border border-[#3a3a5a] rounded-lg shadow-xl overflow-hidden"
                         style={{ width: 'calc(200% + 1rem)' }}>
                      {symbolSuggestions.map((s) => (
                        <button
                          key={s.symbol}
                          type="button"
                          onClick={() => selectSuggestion(s)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[#252542] 
                                   transition-colors text-left border-b border-[#252542] last:border-b-0"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-white text-sm">{s.symbol}</span>
                            <span className="text-gray-400 text-xs ml-2 truncate">{s.name}</span>
                          </div>
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            {s.loading ? (
                              <RefreshCw size={12} className="text-gray-500 animate-spin" />
                            ) : s.price !== undefined && !isNaN(s.price) ? (
                              <>
                                <span className="text-white font-medium text-sm">{s.price.toFixed(2)} €</span>
                                {s.changePercent !== undefined && !isNaN(s.changePercent) && (
                                  <span className={`text-xs font-medium ${s.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-500 text-xs">—</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    ISIN
                  </label>
                  <input
                    type="text"
                    value={formData.isin}
                    onChange={(e) => setFormData({ ...formData, isin: e.target.value })}
                    placeholder="z.B. US0378331005"
                    className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                             text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">Gib Symbol ODER ISIN ein (eines reicht) – Vorschläge erscheinen beim Tippen</p>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="z.B. Apple Inc."
                  className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                           text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Anzahl Aktien *
                </label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="z.B. 10"
                  step="0.001"
                  className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                           text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Kaufpreis <span className="text-gray-500 text-xs">(optional)</span>
                  </label>
                  <input
                    type="number"
                    value={formData.buyPrice}
                    onChange={(e) => setFormData({ ...formData, buyPrice: e.target.value })}
                    placeholder="150.00"
                    step="0.01"
                    className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                             text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Aktueller Preis *
                  </label>
                  <input
                    type="number"
                    value={formData.currentPrice}
                    onChange={(e) => setFormData({ ...formData, currentPrice: e.target.value })}
                    placeholder="178.50"
                    step="0.01"
                    className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                             text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Währung
                </label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                           text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>

              <button
                onClick={handleAddPosition}
                disabled={addingPosition || ((!formData.symbol && !formData.isin) || !formData.quantity || !formData.currentPrice)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 
                         text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {addingPosition ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Preis wird ermittelt...</>
                ) : (
                  'Position hinzufügen'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Positions Table */}
      <div className="bg-[#1a1a2e] rounded-xl border border-[#252542] overflow-hidden">
        <div className="p-6 border-b border-[#252542]">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Briefcase size={18} className="text-indigo-500" />
            Meine Positionen
          </h2>
        </div>

        {userPositions.length === 0 ? (
          <div className="p-12 text-center">
            <Briefcase size={48} className="mx-auto text-gray-500 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Noch keine Positionen</h3>
            <p className="text-gray-400 max-w-md mx-auto">
              Füge deine aktuellen Aktien hinzu, um eine KI-Analyse zu erhalten.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm bg-[#252542]/50">
                  <th className="px-6 py-4">Symbol / ISIN</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4 text-right">Anzahl</th>
                  <th className="px-6 py-4 text-right">Kaufpreis</th>
                  <th className="px-6 py-4 text-right">Aktuell</th>
                  <th className="px-6 py-4 text-right">Wert</th>
                  <th className="px-6 py-4 text-right">G/V</th>
                  <th className="px-6 py-4 text-center">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {[...userPositions]
                  .sort((a, b) => (b.quantity * b.currentPrice) - (a.quantity * a.currentPrice))
                  .map((position) => {
                  const pl = getProfitLoss(position);
                  return (
                    <tr 
                      key={position.id} 
                      className="border-b border-[#252542] hover:bg-[#252542]/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        {editingPosition === position.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editSymbol}
                              onChange={(e) => setEditSymbol(e.target.value.toUpperCase())}
                              placeholder="z.B. SAP.DE"
                              className="w-24 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm"
                              autoFocus
                            />
                            <button
                              onClick={() => {
                                updateUserPosition(position.id, { symbol: editSymbol });
                                setEditingPosition(null);
                              }}
                              className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingPosition(null)}
                              className="p-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div>
                              <span className="font-bold text-white">
                                {position.symbol || '-'}
                              </span>
                              {position.isin && (
                                <span className="block text-xs text-gray-500 font-mono mt-0.5">
                                  {position.isin}
                                </span>
                              )}
                              <span className="block text-xs text-yellow-500 mt-0.5" title="Yahoo Finance Preis">
                                {loadingYahooPrices ? 'Lade Yahoo...' : 
                                 yahooPrices[position.id] !== undefined ? 
                                   `Yahoo: ${yahooPrices[position.id].toFixed(2)} EUR` : 
                                   'Yahoo: nicht verfügbar'}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setEditSymbol(position.symbol || '');
                                setEditingPosition(position.id);
                              }}
                              className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                              title="Symbol bearbeiten"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-300">{position.name}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-white">{position.quantity}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {editingBuyPrice === position.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editBuyPriceValue}
                              onChange={(e) => setEditBuyPriceValue(e.target.value)}
                              className="w-20 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-right"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const newBuyPrice = parseFloat(editBuyPriceValue);
                                  if (newBuyPrice > 0) {
                                    updateUserPosition(position.id, { buyPrice: newBuyPrice });
                                  }
                                  setEditingBuyPrice(null);
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                const newBuyPrice = parseFloat(editBuyPriceValue);
                                if (newBuyPrice > 0) {
                                  updateUserPosition(position.id, { buyPrice: newBuyPrice });
                                }
                                setEditingBuyPrice(null);
                              }}
                              className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingBuyPrice(null)}
                              className="p-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-gray-400">{position.buyPrice.toFixed(2)} {position.currency}</span>
                            <button
                              onClick={() => {
                                setEditBuyPriceValue(position.buyPrice.toString());
                                setEditingBuyPrice(position.id);
                              }}
                              className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                              title="Kaufpreis bearbeiten"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {editingPrice === position.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="number"
                              step="0.01"
                              value={editPriceValue}
                              onChange={(e) => setEditPriceValue(e.target.value)}
                              className="w-20 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-right"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const newPrice = parseFloat(editPriceValue);
                                  if (newPrice > 0) {
                                    console.log('Saving new price:', newPrice, 'for position:', position.id);
                                    updateUserPosition(position.id, { currentPrice: newPrice });
                                  }
                                  setEditingPrice(null);
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                const newPrice = parseFloat(editPriceValue);
                                console.log('Button clicked. New price:', newPrice, 'for position:', position.id);
                                if (newPrice > 0) {
                                  updateUserPosition(position.id, { currentPrice: newPrice });
                                }
                                setEditingPrice(null);
                              }}
                              className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingPrice(null)}
                              className="p-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <div className="text-right">
                              <span className="text-white font-medium">
                                {position.currentPrice.toFixed(2)} {position.currency}
                              </span>
                              {yahooPrices[position.id] !== undefined && (
                                <span className="block text-xs text-yellow-500 mt-0.5">
                                  Yahoo: {yahooPrices[position.id].toFixed(2)} EUR
                                </span>
                              )}
                              {loadingYahooPrices && yahooPrices[position.id] === undefined && (
                                <span className="block text-xs text-gray-500 mt-0.5 animate-pulse">
                                  Lade...
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => {
                                  setEditPriceValue(position.currentPrice.toString());
                                  setEditingPrice(position.id);
                                }}
                                className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                                title="Preis bearbeiten"
                              >
                                <Edit3 size={12} />
                              </button>
                              {yahooPrices[position.id] !== undefined && (
                                <button
                                  onClick={() => {
                                    updateUserPosition(position.id, { 
                                      currentPrice: yahooPrices[position.id],
                                      useYahooPrice: !position.useYahooPrice 
                                    });
                                  }}
                                  className={`p-1 rounded text-xs ${
                                    position.useYahooPrice 
                                      ? 'bg-yellow-500/30 text-yellow-400' 
                                      : 'hover:bg-[#252542] text-gray-500 hover:text-yellow-400'
                                  }`}
                                  title={position.useYahooPrice ? 'Yahoo Live-Preis aktiv' : 'Yahoo-Preis übernehmen'}
                                >
                                  <RefreshCw size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-white font-medium">
                          {(position.quantity * position.currentPrice).toFixed(2)} {position.currency}
                        </div>
                        <div className="text-xs text-gray-400">
                          {totalCurrentValue > 0 ? ((position.quantity * position.currentPrice) / totalCurrentValue * 100).toFixed(1) : '0.0'}%
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className={`font-medium ${pl.absolute >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          <div className="flex items-center justify-end gap-1">
                            {pl.absolute >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                            {pl.absolute >= 0 ? '+' : ''}{pl.absolute.toFixed(2)} {position.currency}
                          </div>
                          <div className="text-xs">
                            ({pl.percent >= 0 ? '+' : ''}{pl.percent.toFixed(2)}%)
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {tradeAction?.positionId === position.id ? (
                          <div className="flex flex-col items-center gap-2">
                            <div className="text-xs font-medium text-gray-300">
                              {tradeAction.type === 'buy' ? '📈 Nachkaufen' : '📉 Verkaufen'}
                            </div>
                            <div className="text-xs text-gray-500">
                              Kurs: {(yahooPrices[position.id] ?? position.currentPrice).toFixed(2)} €
                            </div>
                            <input
                              type="number"
                              step="1"
                              min="1"
                              max={tradeAction.type === 'sell' ? position.quantity : undefined}
                              value={tradeQuantity}
                              onChange={(e) => setTradeQuantity(e.target.value)}
                              placeholder="Anzahl"
                              className="w-20 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-center"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const qty = parseFloat(tradeQuantity);
                                  if (qty > 0) executeTrade(position.id, tradeAction.type, qty);
                                }
                                if (e.key === 'Escape') { setTradeAction(null); setTradeQuantity(''); }
                              }}
                            />
                            {tradeQuantity && parseFloat(tradeQuantity) > 0 && (() => {
                              const qty = parseFloat(tradeQuantity);
                              const tradeTotal = qty * (yahooPrices[position.id] ?? position.currentPrice);
                              const tradeFee = (orderSettings.transactionFeeFlat || 0) + tradeTotal * (orderSettings.transactionFeePercent || 0) / 100;
                              return (
                                <div className="text-xs text-gray-400">
                                  = {tradeTotal.toFixed(2)} €
                                  {tradeFee > 0 && (
                                    <span className="text-yellow-400 ml-1">(+{tradeFee.toFixed(2)} € Geb.)</span>
                                  )}
                                </div>
                              );
                            })()}
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  const qty = parseFloat(tradeQuantity);
                                  if (qty > 0) executeTrade(position.id, tradeAction.type, qty);
                                }}
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  tradeAction.type === 'buy'
                                    ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                                    : 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                                }`}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => { setTradeAction(null); setTradeQuantity(''); }}
                                className="px-2 py-1 bg-gray-500/20 hover:bg-gray-500/30 rounded text-gray-400 text-xs"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => { setTradeAction({ positionId: position.id, type: 'buy' }); setTradeQuantity(''); }}
                              className="p-1.5 hover:bg-green-500/20 text-green-500 rounded-lg transition-colors"
                              title="Nachkaufen"
                            >
                              <ShoppingCart size={16} />
                            </button>
                            <button
                              onClick={() => { setTradeAction({ positionId: position.id, type: 'sell' }); setTradeQuantity(position.quantity.toString()); }}
                              className="p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                              title="Verkaufen"
                            >
                              <ArrowRightLeft size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Analysis Loading */}
      {analyzing && (
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-indigo-500/30 animate-pulse">
          <div className="flex items-center gap-3">
            <RefreshCw className="animate-spin text-indigo-400" size={20} />
            <span className="text-indigo-300 font-medium">KI-Analyse läuft... Dies kann bis zu 60 Sekunden dauern.</span>
          </div>
        </div>
      )}

      {/* AI Analysis Result */}
      {analysisResult && (
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-indigo-500/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Brain size={20} className="text-indigo-500" />
              KI-Portfolio-Analyse
            </h2>
            {lastAnalysisDate && (
              <span className="text-xs text-gray-500">
                {new Date(lastAnalysisDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => setAnalysisResult(null)}
              className="p-1 hover:bg-[#252542] rounded"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>
          <div className="prose prose-invert max-w-none">
            <div className="text-gray-300 whitespace-pre-wrap leading-relaxed">
              {analysisResult}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
