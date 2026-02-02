import { useState } from 'react';
import { 
  Briefcase, 
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  Plus,
  Trash2,
  Brain,
  RefreshCw,
  X,
  Wallet,
  Edit3,
  Check
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { marketDataService } from '../services/marketData';
import emailjs from '@emailjs/browser';
import type { UserPosition } from '../types';

export function Portfolio() {
  const { 
    settings, 
    userPositions, 
    addUserPosition, 
    removeUserPosition,
    updateUserPosition,
    cashBalance,
    setCashBalance,
    setError 
  } = useAppStore();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState('');
  const [editingPosition, setEditingPosition] = useState<string | null>(null);
  const [editSymbol, setEditSymbol] = useState('');
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');
  const [editingQuantity, setEditingQuantity] = useState<string | null>(null);
  const [editQuantityValue, setEditQuantityValue] = useState('');
  const [editingBuyPrice, setEditingBuyPrice] = useState<string | null>(null);
  const [editBuyPriceValue, setEditBuyPriceValue] = useState('');
  
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

  // Calculate totals
  const totalInvested = userPositions.reduce((sum, p) => sum + (p.quantity * p.buyPrice), 0);
  const totalCurrentValue = userPositions.reduce((sum, p) => sum + (p.quantity * p.currentPrice), 0);
  const totalProfitLoss = totalCurrentValue - totalInvested;
  const totalProfitLossPercent = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

  const handleAddPosition = () => {
    if ((!formData.symbol && !formData.isin) || !formData.quantity || !formData.buyPrice || !formData.currentPrice) {
      return;
    }

    const newPosition: UserPosition = {
      id: `pos-${Date.now()}`,
      symbol: formData.symbol.toUpperCase() || formData.isin.toUpperCase(),
      isin: formData.isin.toUpperCase() || undefined,
      name: formData.name || formData.symbol.toUpperCase() || formData.isin.toUpperCase(),
      quantity: parseFloat(formData.quantity),
      buyPrice: parseFloat(formData.buyPrice),
      currentPrice: parseFloat(formData.currentPrice),
      currency: formData.currency
    };

    addUserPosition(newPosition);
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

  // Refresh live prices for all positions
  const refreshPrices = async () => {
    if (userPositions.length === 0) return;
    
    setRefreshingPrices(true);
    let updatedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    
    try {
      for (const position of userPositions) {
        // Use symbol if available, otherwise try ISIN
        const symbolToFetch = position.symbol && position.symbol !== position.isin 
          ? position.symbol 
          : position.isin || position.symbol;
        
        try {
          console.log(`Fetching price for ${symbolToFetch}...`);
          const quote = await marketDataService.getQuote(symbolToFetch);
          console.log(`Result for ${symbolToFetch}:`, quote);
          
          if (quote && quote.price > 0) {
            updateUserPosition(position.id, { currentPrice: quote.price });
            updatedCount++;
          } else {
            errors.push(`${position.name}: Kein Kurs gefunden`);
            failedCount++;
          }
        } catch (e) {
          errors.push(`${position.name}: Fehler beim Abruf`);
          failedCount++;
        }
      }
      
      if (errors.length > 0) {
        setError(`${updatedCount} aktualisiert, ${failedCount} fehlgeschlagen: ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`);
      }
    } catch (error: any) {
      setError('Fehler beim Aktualisieren der Kurse: ' + error.message);
    } finally {
      setRefreshingPrices(false);
    }
  };

  // AI Portfolio Analysis
  const analyzePortfolio = async () => {
    if (!settings.apiKeys.claude) {
      setError('Bitte füge deinen Claude API-Schlüssel in den Einstellungen hinzu.');
      return;
    }

    if (userPositions.length === 0) {
      setError('Füge zuerst Positionen zu deinem Portfolio hinzu.');
      return;
    }

    setAnalyzing(true);
    setAnalysisResult(null);

    try {
      // Build portfolio context
      const portfolioSummary = userPositions.map(p => {
        const pl = getProfitLoss(p);
        const identifier = p.isin ? `${p.name} (ISIN: ${p.isin})` : `${p.symbol} (${p.name})`;
        return `${identifier}: ${p.quantity} Stück, Kaufpreis: ${p.buyPrice.toFixed(2)} ${p.currency}, Aktuell: ${p.currentPrice.toFixed(2)} ${p.currency}, P/L: ${pl.percent >= 0 ? '+' : ''}${pl.percent.toFixed(2)}% (${pl.absolute >= 0 ? '+' : ''}${pl.absolute.toFixed(2)} ${p.currency})`;
      }).join('\n');

      // Direct API call for portfolio analysis
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKeys.claude,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: `Du bist ein erfahrener Investment-Analyst. Analysiere mein aktuelles Portfolio und gib konkrete Empfehlungen.

MEIN PORTFOLIO:
${portfolioSummary}

GESAMTWERT:
- Investiert: ${totalInvested.toFixed(2)} EUR
- Aktueller Wert: ${totalCurrentValue.toFixed(2)} EUR  
- Gewinn/Verlust: ${totalProfitLoss >= 0 ? '+' : ''}${totalProfitLoss.toFixed(2)} EUR (${totalProfitLossPercent >= 0 ? '+' : ''}${totalProfitLossPercent.toFixed(2)}%)

VERFÜGBARES CASH: ${cashBalance.toFixed(2)} EUR

MEINE STRATEGIE:
- Anlagehorizont: ${settings.strategy === 'short' ? 'Kurzfristig (Tage-Wochen)' : 'Mittelfristig (Wochen-Monate)'}
- Risikotoleranz: ${settings.riskTolerance === 'low' ? 'Konservativ' : settings.riskTolerance === 'medium' ? 'Ausgewogen' : 'Aggressiv'}

HEUTIGES DATUM: ${new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}

AUFGABE:

📊 **1. PORTFOLIO-ANALYSE**
Analysiere jede Position:
- HALTEN, NACHKAUFEN, TEILVERKAUF oder VERKAUFEN
- Begründung (2-3 Sätze)
- Konkreter Aktionsvorschlag mit Zielpreis

📈 **2. GESAMTBEWERTUNG**
- Diversifikations-Check (Branchen, Regionen, Risiko)
- Risiko-Einschätzung des Gesamtportfolios

🆕 **3. NEUE KAUFEMPFEHLUNGEN** (WICHTIG!)
Basierend auf meinem verfügbaren Cash von ${cashBalance.toFixed(2)} EUR und meiner Strategie:
- Empfehle 3-5 konkrete Aktien/ETFs zum Kauf
- Für jede Empfehlung: Name, Ticker-Symbol, aktueller ungefährer Kurs in EUR
- Begründung warum diese Aktie jetzt interessant ist
- Vorgeschlagene Investitionssumme in EUR
- Berücksichtige aktuelle Markttrends 2025/2026

🎯 **4. AKTIONSPLAN**
- Priorisierte Liste der nächsten Schritte
- Was sofort tun, was beobachten

Antworte auf Deutsch mit Emojis für bessere Übersicht.`
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const data = await response.json();
      const content = data.content[0]?.text || 'Keine Antwort erhalten';
      
      setAnalysisResult(content);

      // Send to Telegram if enabled
      if (settings.notifications.telegram.enabled) {
        await fetch(
          `https://api.telegram.org/bot${settings.notifications.telegram.botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: settings.notifications.telegram.chatId,
              text: `📊 *Portfolio-Analyse*\n\n${content.substring(0, 4000)}`,
              parse_mode: 'Markdown',
            }),
          }
        );
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
              subject: '📊 AI Invest Portfolio-Analyse',
              stock_name: 'Portfolio-Analyse',
              stock_symbol: 'PORTFOLIO',
              signal_type: 'ANALYSE',
              price: `${totalCurrentValue.toFixed(2)} EUR`,
              change: `${totalProfitLossPercent >= 0 ? '+' : ''}${totalProfitLossPercent.toFixed(2)}%`,
              confidence: '-',
              risk_level: settings.riskTolerance === 'low' ? 'Niedrig' : settings.riskTolerance === 'medium' ? 'Mittel' : 'Hoch',
              reasoning: content.substring(0, 2000),
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
      setError(error.message || 'Analyse fehlgeschlagen');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Mein Portfolio</h1>
          <p className="text-gray-400">Verwalte und analysiere deine Aktien</p>
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
          {/* Kurse aktualisieren Button deaktiviert - Preise weichen von Broker ab
          <button
            onClick={refreshPrices}
            disabled={refreshingPrices || userPositions.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
                     disabled:bg-blue-600/50 text-white rounded-lg transition-colors"
          >
            {refreshingPrices ? (
              <>
                <RefreshCw className="animate-spin" size={18} />
                Aktualisiere...
              </>
            ) : (
              <>
                <RefreshCw size={18} />
                Kurse aktualisieren
              </>
            )}
          </button>
          */}
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
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Symbol
                  </label>
                  <input
                    type="text"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                    placeholder="z.B. AAPL, MSFT"
                    className="w-full px-4 py-2 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                             text-white focus:outline-none focus:border-indigo-500"
                  />
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
              <p className="text-xs text-gray-500">Gib Symbol ODER ISIN ein (eines reicht)</p>

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
                    Kaufpreis *
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
                disabled={(!formData.symbol && !formData.isin) || !formData.quantity || !formData.buyPrice || !formData.currentPrice}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 
                         text-white rounded-lg font-medium transition-colors"
              >
                Position hinzufügen
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
                  <th className="px-6 py-4 text-right">G/V</th>
                  <th className="px-6 py-4 text-center">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {userPositions.map((position) => {
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
                        {editingQuantity === position.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editQuantityValue}
                              onChange={(e) => setEditQuantityValue(e.target.value)}
                              className="w-20 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-sm text-right"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const newQuantity = parseFloat(editQuantityValue);
                                  if (newQuantity > 0) {
                                    updateUserPosition(position.id, { quantity: newQuantity });
                                  }
                                  setEditingQuantity(null);
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                const newQuantity = parseFloat(editQuantityValue);
                                if (newQuantity > 0) {
                                  updateUserPosition(position.id, { quantity: newQuantity });
                                }
                                setEditingQuantity(null);
                              }}
                              className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingQuantity(null)}
                              className="p-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-white">{position.quantity}</span>
                            <button
                              onClick={() => {
                                setEditQuantityValue(position.quantity.toString());
                                setEditingQuantity(position.id);
                              }}
                              className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                              title="Anzahl bearbeiten"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>
                        )}
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
                            <span className="text-white font-medium">
                              {position.currentPrice.toFixed(2)} {position.currency}
                            </span>
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
                          </div>
                        )}
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
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => removeUserPosition(position.id)}
                          className="p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Analysis Result */}
      {analysisResult && (
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-indigo-500/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Brain size={20} className="text-indigo-500" />
              KI-Portfolio-Analyse
            </h2>
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
