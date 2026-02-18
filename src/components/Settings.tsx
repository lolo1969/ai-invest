import { useState, useRef } from 'react';
import { 
  Save, 
  Key, 
  Send, 
  Mail, 
  Target, 
  Shield,
  Check,
  AlertCircle,
  Download,
  Upload,
  MessageSquareText,
  Receipt,
  Wallet,
  TrendingUp
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { notificationService } from '../services/notifications';
import type { InvestmentStrategy, RiskLevel, AIProvider, ClaudeModel, OpenAIModel, GeminiModel } from '../types';

export function Settings() {
  const { 
    settings, updateSettings, 
    userPositions, 
    watchlist, 
    cashBalance, setCashBalance,
    initialCapital, setInitialCapital,
    previousProfit, setPreviousProfit,
    signals, addSignal, clearSignals,
    orders, orderSettings, updateOrderSettings,
    priceAlerts,
    portfolios, activePortfolioId,
    lastAnalysis, lastAnalysisDate,
    analysisHistory,
    autopilotSettings, autopilotLog, autopilotState
  } = useAppStore();
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<'success' | 'error' | null>(null);
  const [importStatus, setImportStatus] = useState<'success' | 'error' | null>(null);
  const [importSummary, setImportSummary] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export all data as JSON
  const handleExport = () => {
    const exportData = {
      version: '1.4',
      exportDate: new Date().toISOString(),
      // Alle Einstellungen (Strategie, Risiko, KI-Anbieter, Modelle, API-Keys, Benachrichtigungen, Custom Prompt)
      settings,
      // Portfolio & Positionen
      userPositions,
      watchlist,
      activePortfolioId,
      portfolios,
      // Finanzdaten (Dashboard)
      cashBalance,
      initialCapital,
      previousProfit,
      // Signale & Orders
      signals,
      orders,
      orderSettings,
      priceAlerts,
      // KI-Analyse
      lastAnalysis,
      lastAnalysisDate,
      analysisHistory,
      // Autopilot
      autopilotSettings,
      autopilotLog,
      autopilotState
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vestia-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import data from JSON file
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target?.result as string);
        const store = useAppStore.getState();
        const summary: string[] = [];
        
        // Restore settings (includes watchlist symbols, strategy, risk, API keys, notifications, custom prompt)
        if (importData.settings) {
          updateSettings(importData.settings);
          summary.push('✅ Einstellungen (Strategie, Risiko, KI-Anbieter, API-Keys, Benachrichtigungen, Custom Prompt)');
        }
        
        // Restore positions - clear existing first, then add imported
        if (importData.userPositions && Array.isArray(importData.userPositions)) {
          // Remove all existing positions
          store.userPositions.forEach((pos: any) => {
            store.removeUserPosition(pos.id);
          });
          // Add imported positions
          importData.userPositions.forEach((pos: any) => {
            store.addUserPosition(pos);
          });
          summary.push(`✅ ${importData.userPositions.length} Portfolio-Positionen`);
        }
        
        // Restore watchlist stocks
        if (importData.watchlist && Array.isArray(importData.watchlist)) {
          // Clear existing watchlist
          store.watchlist.forEach((stock: any) => {
            store.removeFromWatchlist(stock.symbol);
          });
          // Add imported watchlist
          importData.watchlist.forEach((stock: any) => {
            store.addToWatchlist(stock);
          });
          summary.push(`✅ ${importData.watchlist.length} Watchlist-Einträge`);
        }
        
        // Restore signals
        if (importData.signals && Array.isArray(importData.signals)) {
          clearSignals();
          importData.signals.forEach((signal: any) => {
            addSignal(signal);
          });
          summary.push(`✅ ${importData.signals.length} Signale`);
        }
        
        // Restore cash balance
        if (importData.cashBalance !== undefined && importData.cashBalance !== null) {
          setCashBalance(Number(importData.cashBalance));
          summary.push(`✅ Cash-Bestand: ${Number(importData.cashBalance).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`);
        }

        // Restore initial capital
        if (importData.initialCapital !== undefined && importData.initialCapital !== null) {
          setInitialCapital(Number(importData.initialCapital));
          summary.push(`✅ Startkapital: ${Number(importData.initialCapital).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`);
        }

        // Restore previous profit
        if (importData.previousProfit !== undefined && importData.previousProfit !== null) {
          setPreviousProfit(Number(importData.previousProfit));
          summary.push(`✅ Vorherige Gewinne: ${Number(importData.previousProfit).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`);
        }

        // Restore orders
        if (importData.orders && Array.isArray(importData.orders)) {
          // Remove existing orders
          store.orders.forEach((o: any) => store.removeOrder(o.id));
          // Add imported orders
          importData.orders.forEach((o: any) => store.addOrder(o));
          summary.push(`✅ ${importData.orders.length} Orders`);
        }

        // Restore order settings (inkl. Transaktionsgebühren)
        if (importData.orderSettings) {
          store.updateOrderSettings(importData.orderSettings);
          summary.push('✅ Order-Einstellungen (Transaktionsgebühren)');
        }

        // Restore price alerts
        if (importData.priceAlerts && Array.isArray(importData.priceAlerts)) {
          store.priceAlerts.forEach((a: any) => store.removePriceAlert(a.id));
          importData.priceAlerts.forEach((a: any) => store.addPriceAlert(a));
          summary.push(`✅ ${importData.priceAlerts.length} Preisalarme`);
        }

        // Restore portfolios
        if (importData.portfolios && Array.isArray(importData.portfolios)) {
          importData.portfolios.forEach((p: any) => {
            if (!store.portfolios.find((ep: any) => ep.id === p.id)) {
              store.addPortfolio(p);
            }
          });
          summary.push(`✅ ${importData.portfolios.length} Portfolios`);
        }

        // Restore active portfolio
        if (importData.activePortfolioId !== undefined) {
          store.setActivePortfolio(importData.activePortfolioId);
        }

        // Restore last analysis
        if (importData.lastAnalysis !== undefined) {
          store.setLastAnalysis(importData.lastAnalysis);
          if (importData.lastAnalysis) {
            summary.push('✅ Letzte KI-Analyse');
          }
        }

        // Restore analysis history
        if (importData.analysisHistory && Array.isArray(importData.analysisHistory)) {
          store.clearAnalysisHistory();
          // Älteste zuerst hinzufügen, da addAnalysisHistory am Anfang einfügt
          [...importData.analysisHistory].reverse().forEach((entry: any) => {
            store.addAnalysisHistory(entry);
          });
          summary.push(`✅ ${importData.analysisHistory.length} Analyse-Einträge (KI-Gedächtnis)`);
        }

        // Restore autopilot settings
        if (importData.autopilotSettings) {
          store.updateAutopilotSettings(importData.autopilotSettings);
          summary.push('✅ Autopilot-Einstellungen');
        }

        // Restore autopilot log
        if (importData.autopilotLog && Array.isArray(importData.autopilotLog)) {
          store.clearAutopilotLog();
          // Älteste zuerst hinzufügen
          [...importData.autopilotLog].reverse().forEach((entry: any) => {
            store.addAutopilotLog(entry);
          });
          if (importData.autopilotLog.length > 0) {
            summary.push(`✅ ${importData.autopilotLog.length} Autopilot-Log-Einträge`);
          }
        }

        // Restore autopilot state
        if (importData.autopilotState) {
          store.updateAutopilotState(importData.autopilotState);
          summary.push('✅ Autopilot-Status');
        }
        
        console.log('[Backup Import] Version:', importData.version, '| Restored:', summary.length, 'data categories');
        setImportSummary(summary);
        setImportStatus('success');
        setTimeout(() => { setImportStatus(null); setImportSummary([]); }, 15000);
      } catch (error) {
        console.error('Import failed:', error);
        setImportSummary([]);
        setImportStatus('error');
        setTimeout(() => setImportStatus(null), 5000);
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testTelegram = async () => {
    setTesting(true);
    setTestResult(null);
    
    const success = await notificationService.testTelegram(
      settings.notifications.telegram.botToken,
      settings.notifications.telegram.chatId
    );
    
    setTestResult(success ? 'success' : 'error');
    setTesting(false);
  };

  const testEmailJS = async () => {
    setTestingEmail(true);
    setEmailTestResult(null);
    
    const success = await notificationService.testEmail(
      settings.notifications.email.address,
      settings.notifications.email.serviceId,
      settings.notifications.email.templateId,
      settings.notifications.email.publicKey
    );
    
    setEmailTestResult(success ? 'success' : 'error');
    setTestingEmail(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Einstellungen</h1>
        <p className="text-gray-400">Konfiguriere deinen Investment Advisor</p>
      </div>

      {/* Investment Settings */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-6">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Target size={20} className="text-indigo-500" />
          Investment-Einstellungen
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Strategy */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Target size={16} className="inline mr-1" />
              Strategie
            </label>
            <select
              value={settings.strategy}
              onChange={(e) => updateSettings({ strategy: e.target.value as InvestmentStrategy })}
              className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                       text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="short">Kurzfristig (Tage-Wochen)</option>
              <option value="middle">Mittelfristig (Wochen-Monate)</option>
              <option value="long">Langfristig (10+ Jahre)</option>
            </select>
          </div>

          {/* Startkapital */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Wallet size={16} className="inline mr-1" />
              Startkapital (€)
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={initialCapital || ''}
              onChange={(e) => setInitialCapital(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                       text-white focus:outline-none focus:border-indigo-500"
              placeholder="z.B. 10000"
            />
            <p className="text-xs text-gray-500 mt-1">Ursprünglich investierter Betrag für Gesamtgewinn-Berechnung</p>
          </div>

          {/* Vorhergehende Gewinne */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <TrendingUp size={16} className="inline mr-1" />
              Vorhergehende Gewinne/Verluste (€)
            </label>
            <input
              type="number"
              step="0.01"
              value={previousProfit || ''}
              onChange={(e) => setPreviousProfit(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                       text-white focus:outline-none focus:border-indigo-500"
              placeholder="z.B. 1500 oder -300"
            />
            <p className="text-xs text-gray-500 mt-1">Gewinne (+) oder Verluste (-) aus früheren Portfolios, werden mit dem aktuellen Gewinn verrechnet</p>
          </div>

          {/* Risk Tolerance */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Shield size={16} className="inline mr-1" />
              Risikotoleranz
            </label>
            <div className="flex gap-4">
              {(['low', 'medium', 'high'] as RiskLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => updateSettings({ riskTolerance: level })}
                  className={`flex-1 px-4 py-3 rounded-lg border transition-colors ${
                    settings.riskTolerance === level
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-[#252542] border-[#3a3a5a] text-gray-300 hover:border-indigo-500'
                  }`}
                >
                  {level === 'low' && 'Konservativ'}
                  {level === 'medium' && 'Ausgewogen'}
                  {level === 'high' && 'Aggressiv'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Prompt */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <MessageSquareText size={16} className="inline mr-1" />
            Persönliche Anweisungen für die KI
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Hier kannst du der KI spezifische Vorgaben geben, z.B. Präferenzen für ETF-Typen, steuerliche Besonderheiten, Branchen-Ausschlüsse etc.
          </p>
          <textarea
            value={settings.customPrompt || ''}
            onChange={(e) => updateSettings({ customPrompt: e.target.value })}
            placeholder="z.B.: Ich wohne in Luxemburg. Bevorzuge thesaurierende ETFs statt ausschüttende (steuerlich vorteilhafter). Keine Rüstungsaktien. Fokus auf europäische Märkte..."
            rows={4}
            className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500
                     resize-y min-h-[100px]"
          />
          <p className="text-xs text-gray-600 mt-1">
            {(settings.customPrompt || '').length} Zeichen
          </p>
        </div>
      </section>

      {/* Transaction Fees */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-6">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Receipt size={20} className="text-indigo-500" />
          Transaktionsgebühren
        </h2>
        <p className="text-sm text-gray-400">
          Gebühren werden bei jedem Kauf und Verkauf automatisch vom Cash-Bestand abgezogen.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Flat Fee */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Fixe Gebühr pro Trade (€)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={orderSettings.transactionFeeFlat}
              onChange={(e) => updateOrderSettings({ transactionFeeFlat: Math.max(0, parseFloat(e.target.value) || 0) })}
              className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                       text-white focus:outline-none focus:border-indigo-500"
              placeholder="z.B. 1.00"
            />
            <p className="text-xs text-gray-500 mt-1">Fester Betrag pro Transaktion (z.B. 1,00 €)</p>
          </div>

          {/* Percent Fee */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Prozentuale Gebühr pro Trade (%)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={orderSettings.transactionFeePercent}
              onChange={(e) => updateOrderSettings({ transactionFeePercent: Math.max(0, parseFloat(e.target.value) || 0) })}
              className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                       text-white focus:outline-none focus:border-indigo-500"
              placeholder="z.B. 0.25"
            />
            <p className="text-xs text-gray-500 mt-1">Prozent des Ordervolumens (z.B. 0,25%)</p>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-[#252542] rounded-lg p-4">
          <p className="text-sm text-gray-400">Beispielrechnung für eine Order über 1.000 €:</p>
          <p className="text-sm text-white mt-1">
            Fixe Gebühr: {(orderSettings.transactionFeeFlat || 0).toFixed(2)} € + 
            Prozentuale Gebühr: {(1000 * (orderSettings.transactionFeePercent || 0) / 100).toFixed(2)} € = {' '}
            <span className="font-bold text-indigo-400">
              {((orderSettings.transactionFeeFlat || 0) + 1000 * (orderSettings.transactionFeePercent || 0) / 100).toFixed(2)} € Gesamtgebühren
            </span>
          </p>
        </div>
      </section>

      {/* API Keys */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-6">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Key size={20} className="text-indigo-500" />
          API-Schlüssel & KI-Anbieter
        </h2>

        {/* AI Provider Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            KI-Anbieter auswählen
          </label>
          <div className="flex gap-4">
            {(['gemini', 'claude', 'openai'] as AIProvider[]).map((provider) => (
              <button
                key={provider}
                onClick={() => updateSettings({ aiProvider: provider })}
                className={`flex-1 px-4 py-3 rounded-lg border transition-colors ${
                  settings.aiProvider === provider
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-[#252542] border-[#3a3a5a] text-gray-300 hover:border-indigo-500'
                }`}
              >
                {provider === 'claude' && '🟣 Claude (Anthropic)'}
                {provider === 'openai' && '🟢 OpenAI (ChatGPT)'}
                {provider === 'gemini' && '🔵 Gemini (Google)'}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {settings.aiProvider === 'claude' 
              ? 'Claude bietet exzellente Analysefähigkeiten und ist gut für detaillierte Finanzanalysen.'
              : settings.aiProvider === 'gemini'
              ? '🆓 Gemini bietet einen kostenlosen API-Key – ideal zum Einstieg! Hol dir deinen Key auf ai.google.dev'
              : 'OpenAI liefert strukturierte JSON-Antworten für Finanzanalysen.'}
          </p>
        </div>

        {/* Model Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            KI-Modell auswählen
          </label>
          {settings.aiProvider === 'claude' ? (
            <div className="flex gap-3 flex-wrap">
              {([
                { value: 'claude-opus-4-6' as ClaudeModel, label: '🔮 Claude Opus 4.6', desc: 'Beste Qualität (neuestes Modell)' },
                { value: 'claude-sonnet-4-5-20250929' as ClaudeModel, label: '🟣 Claude Sonnet 4.5', desc: 'Schnell & intelligent' },
                { value: 'claude-haiku-4-5-20251001' as ClaudeModel, label: '⚡ Claude Haiku 4.5', desc: 'Am schnellsten' },
              ]).map((model) => (
                <button
                  key={model.value}
                  onClick={() => updateSettings({ claudeModel: model.value })}
                  className={`flex-1 min-w-[140px] px-4 py-3 rounded-lg border transition-colors text-left ${
                    (settings.claudeModel || 'claude-opus-4-6') === model.value
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-[#252542] border-[#3a3a5a] text-gray-300 hover:border-purple-500'
                  }`}
                >
                  <div className="font-medium">{model.label}</div>
                  <div className="text-xs mt-1 opacity-75">{model.desc}</div>
                </button>
              ))}
            </div>
          ) : settings.aiProvider === 'gemini' ? (
            <div className="flex gap-3 flex-wrap">
              {([
                { value: 'gemini-2.5-flash' as GeminiModel, label: '⚡ Gemini 2.5 Flash', desc: 'Schnell & kostenlos' },
                { value: 'gemini-2.5-pro' as GeminiModel, label: '🔵 Gemini 2.5 Pro', desc: 'Leistungsstärkstes Modell' },
              ]).map((model) => (
                <button
                  key={model.value}
                  onClick={() => updateSettings({ geminiModel: model.value })}
                  className={`flex-1 min-w-[140px] px-4 py-3 rounded-lg border transition-colors text-left ${
                    (settings.geminiModel || 'gemini-2.5-flash') === model.value
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-[#252542] border-[#3a3a5a] text-gray-300 hover:border-blue-500'
                  }`}
                >
                  <div className="font-medium">{model.label}</div>
                  <div className="text-xs mt-1 opacity-75">{model.desc}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-3 flex-wrap">
              {([
                { value: 'gpt-5.2' as OpenAIModel, label: '🟢 GPT-5.2', desc: 'Beste Qualität (neuestes Modell)' },
                { value: 'gpt-5-mini' as OpenAIModel, label: '🟡 GPT-5 Mini', desc: 'Schnell & günstig' },
                { value: 'gpt-4o' as OpenAIModel, label: '⚪ GPT-4o', desc: 'Bewährt & zuverlässig' },
              ]).map((model) => (
                <button
                  key={model.value}
                  onClick={() => updateSettings({ openaiModel: model.value })}
                  className={`flex-1 min-w-[140px] px-4 py-3 rounded-lg border transition-colors text-left ${
                    (settings.openaiModel || 'gpt-5.2') === model.value
                      ? 'bg-green-600 border-green-500 text-white'
                      : 'bg-[#252542] border-[#3a3a5a] text-gray-300 hover:border-green-500'
                  }`}
                >
                  <div className="font-medium">{model.label}</div>
                  <div className="text-xs mt-1 opacity-75">{model.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Claude API Key */}
        <div className={settings.aiProvider !== 'claude' ? 'opacity-50' : ''}>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Claude API-Schlüssel (Anthropic)
            {settings.aiProvider === 'claude' && <span className="text-indigo-400 ml-2">• Aktiv</span>}
          </label>
          <input
            type="password"
            value={settings.apiKeys.claude}
            onChange={(e) => updateSettings({ 
              apiKeys: { ...settings.apiKeys, claude: e.target.value } 
            })}
            placeholder="sk-ant-..."
            className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white focus:outline-none focus:border-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-2">
            Erhalte deinen API-Key auf{' '}
            <a 
              href="https://console.anthropic.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-indigo-400 hover:underline"
            >
              console.anthropic.com
            </a>
          </p>
        </div>

        {/* Gemini API Key */}
        <div className={settings.aiProvider !== 'gemini' ? 'opacity-50' : ''}>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Gemini API-Schlüssel (Google)
            {settings.aiProvider === 'gemini' && <span className="text-blue-400 ml-2">• Aktiv</span>}
          </label>
          <input
            type="password"
            value={settings.apiKeys.gemini}
            onChange={(e) => updateSettings({ 
              apiKeys: { ...settings.apiKeys, gemini: e.target.value } 
            })}
            placeholder="AIza..."
            className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white focus:outline-none focus:border-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-2">
            🆓 Kostenloser API-Key auf{' '}
            <a 
              href="https://aistudio.google.com/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              aistudio.google.com/apikey
            </a>
            {' '}– Ideal zum Starten ohne Kosten!
          </p>
        </div>

        {/* OpenAI API Key */}
        <div className={settings.aiProvider !== 'openai' ? 'opacity-50' : ''}>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            OpenAI API-Schlüssel
            {settings.aiProvider === 'openai' && <span className="text-green-400 ml-2">• Aktiv</span>}
          </label>
          <input
            type="password"
            value={settings.apiKeys.openai}
            onChange={(e) => updateSettings({ 
              apiKeys: { ...settings.apiKeys, openai: e.target.value } 
            })}
            placeholder="sk-..."
            className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white focus:outline-none focus:border-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-2">
            Erhalte deinen API-Key auf{' '}
            <a 
              href="https://platform.openai.com/api-keys" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-indigo-400 hover:underline"
            >
              platform.openai.com
            </a>
          </p>
        </div>
      </section>

      {/* Telegram Notifications */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Send size={20} className="text-indigo-500" />
            Telegram Benachrichtigungen
          </h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.notifications.telegram.enabled}
              onChange={(e) => updateSettings({
                notifications: {
                  ...settings.notifications,
                  telegram: { ...settings.notifications.telegram, enabled: e.target.checked }
                }
              })}
              className="w-5 h-5 rounded bg-[#252542] border-[#3a3a5a] text-indigo-600 
                       focus:ring-indigo-500"
            />
            <span className="text-gray-300">Aktiviert</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Bot Token
            </label>
            <input
              type="password"
              value={settings.notifications.telegram.botToken}
              onChange={(e) => updateSettings({
                notifications: {
                  ...settings.notifications,
                  telegram: { ...settings.notifications.telegram, botToken: e.target.value }
                }
              })}
              placeholder="123456789:ABC..."
              className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                       text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Chat ID
            </label>
            <input
              type="text"
              value={settings.notifications.telegram.chatId}
              onChange={(e) => updateSettings({
                notifications: {
                  ...settings.notifications,
                  telegram: { ...settings.notifications.telegram, chatId: e.target.value }
                }
              })}
              placeholder="123456789"
              className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                       text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={testTelegram}
            disabled={testing || !settings.notifications.telegram.botToken || !settings.notifications.telegram.chatId}
            className="px-4 py-2 bg-[#252542] hover:bg-[#3a3a5a] disabled:opacity-50 
                     text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {testing ? 'Teste...' : 'Verbindung testen'}
          </button>
          {testResult === 'success' && (
            <span className="text-green-500 flex items-center gap-1">
              <Check size={16} /> Erfolgreich!
            </span>
          )}
          {testResult === 'error' && (
            <span className="text-red-500 flex items-center gap-1">
              <AlertCircle size={16} /> Fehlgeschlagen
            </span>
          )}
        </div>

        <p className="text-xs text-gray-500">
          1. Erstelle einen Bot via @BotFather auf Telegram<br />
          2. Sende eine Nachricht an deinen Bot<br />
          3. Hole deine Chat-ID via @userinfobot
        </p>
      </section>

      {/* Email Notifications */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Mail size={20} className="text-indigo-500" />
            E-Mail Benachrichtigungen (EmailJS)
          </h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.notifications.email.enabled}
              onChange={(e) => updateSettings({
                notifications: {
                  ...settings.notifications,
                  email: { ...settings.notifications.email, enabled: e.target.checked }
                }
              })}
              className="w-5 h-5 rounded bg-[#252542] border-[#3a3a5a] text-indigo-600 
                       focus:ring-indigo-500"
            />
            <span className="text-gray-300">Aktiviert</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            E-Mail Adresse (Empfänger)
          </label>
          <input
            type="email"
            value={settings.notifications.email.address}
            onChange={(e) => updateSettings({
              notifications: {
                ...settings.notifications,
                email: { ...settings.notifications.email, address: e.target.value }
              }
            })}
            placeholder="deine@email.de"
            className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Service ID
          </label>
          <input
            type="text"
            value={settings.notifications.email.serviceId}
            onChange={(e) => updateSettings({
              notifications: {
                ...settings.notifications,
                email: { ...settings.notifications.email, serviceId: e.target.value }
              }
            })}
            placeholder="service_xxxxxxx"
            className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Template ID
          </label>
          <input
            type="text"
            value={settings.notifications.email.templateId}
            onChange={(e) => updateSettings({
              notifications: {
                ...settings.notifications,
                email: { ...settings.notifications.email, templateId: e.target.value }
              }
            })}
            placeholder="template_xxxxxxx"
            className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Public Key
          </label>
          <input
            type="text"
            value={settings.notifications.email.publicKey}
            onChange={(e) => updateSettings({
              notifications: {
                ...settings.notifications,
                email: { ...settings.notifications.email, publicKey: e.target.value }
              }
            })}
            placeholder="xxxxxxxxxxxxxx"
            className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <button
          onClick={testEmailJS}
          disabled={testingEmail || !settings.notifications.email.address || !settings.notifications.email.serviceId || !settings.notifications.email.templateId || !settings.notifications.email.publicKey}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 
                   disabled:cursor-not-allowed text-white rounded-lg font-medium 
                   transition-colors flex items-center justify-center gap-2"
        >
          {testingEmail ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Teste Verbindung...
            </>
          ) : emailTestResult === 'success' ? (
            <>
              <Check size={20} className="text-green-400" />
              E-Mail erfolgreich gesendet!
            </>
          ) : emailTestResult === 'error' ? (
            <>
              <AlertCircle size={20} className="text-red-400" />
              Fehler - Prüfe deine Einstellungen
            </>
          ) : (
            <>
              <Send size={20} />
              Test E-Mail senden
            </>
          )}
        </button>

        <p className="text-xs text-gray-500">
          1. Erstelle einen Account auf emailjs.com<br />
          2. Verbinde deinen E-Mail Dienst (Gmail, Outlook, etc.)<br />
          3. Erstelle ein Template mit diesen Variablen: to_email, subject, stock_name, stock_symbol, signal_type, price, change, confidence, risk_level, reasoning, target_price, stop_loss, date<br />
          4. Kopiere Service ID, Template ID und Public Key hierher
        </p>
      </section>

      {/* Backup & Restore */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Download size={20} className="text-indigo-500" />
          Backup & Wiederherstellung
        </h2>
        
        <p className="text-gray-400 text-sm">
          Exportiere <strong className="text-gray-300">alle</strong> deine Daten als JSON-Datei zum Backup oder zum Übertragen auf ein anderes Gerät:
        </p>
        <div className="text-xs text-gray-500 grid grid-cols-2 gap-1">
          <span>• Einstellungen & API-Keys</span>
          <span>• Cash-Bestand & Startkapital</span>
          <span>• Portfolio-Positionen</span>
          <span>• Vorherige Gewinne/Verluste</span>
          <span>• Watchlist & Preisalarme</span>
          <span>• Signale & Orders</span>
          <span>• KI-Analyse & Gedächtnis</span>
          <span>• Autopilot-Konfiguration</span>
          <span>• Transaktionsgebühren</span>
          <span>• Custom Prompt</span>
        </div>

        <div className="flex flex-wrap gap-4">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 
                     text-white rounded-lg transition-colors"
          >
            <Download size={18} />
            Daten exportieren (JSON)
          </button>

          <label className="flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 
                          text-white rounded-lg transition-colors cursor-pointer">
            <Upload size={18} />
            Backup importieren
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
        </div>

        {importStatus === 'success' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-500 text-sm font-medium">
              <Check size={16} />
              Import erfolgreich! Folgende Daten wurden wiederhergestellt:
            </div>
            {importSummary.length > 0 && (
              <div className="bg-[#252542] rounded-lg p-3 space-y-1">
                {importSummary.map((item, i) => (
                  <div key={i} className="text-xs text-gray-300">{item}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {importStatus === 'error' && (
          <div className="flex items-center gap-2 text-red-500 text-sm">
            <AlertCircle size={16} />
            Import fehlgeschlagen. Bitte prüfe die Datei.
          </div>
        )}
      </section>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg 
                 font-medium transition-colors flex items-center justify-center gap-2"
      >
        {saved ? (
          <>
            <Check size={20} />
            Gespeichert!
          </>
        ) : (
          <>
            <Save size={20} />
            Einstellungen speichern
          </>
        )}
      </button>
    </div>
  );
}
