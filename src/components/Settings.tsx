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
  TrendingUp,
  Trash2,
  Brain,
  Zap
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { notificationService } from '../services/notifications';
import { createAlpacaService } from '../services/alpacaService';
import type { InvestmentStrategy, RiskLevel, AIProvider, AILanguage, ClaudeModel, OpenAIModel, GeminiModel } from '../types';

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
    lastAnalysis, lastAnalysisDate, setLastAnalysis,
    analysisHistory, clearAnalysisHistory,
    autopilotSettings, autopilotLog, autopilotState,
    alpacaSettings, updateAlpacaSettings,
  } = useAppStore();
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<'success' | 'error' | null>(null);
  const [testingAlpaca, setTestingAlpaca] = useState(false);
  const [alpacaTestResult, setAlpacaTestResult] = useState<{ ok: boolean; info?: string } | null>(null);
  const [importStatus, setImportStatus] = useState<'success' | 'error' | null>(null);
  const [importSummary, setImportSummary] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export all data as JSON
  const handleExport = () => {
    const exportData = {
      version: '1.10.5',
      exportDate: new Date().toISOString(),
      // All settings (Strategy, Risk, AI Provider, Models, API Keys, Notifications, Custom Prompt)
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
      // Signals & Orders
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
          summary.push('✅ Settings (Strategy, Risk, AI Provider, API Keys, Notifications, Custom Prompt)');
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
          summary.push(`✅ ${importData.userPositions.length} Portfolio Positions`);
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
          summary.push(`✅ ${importData.watchlist.length} Watchlist Entries`);
        }
        
        // Restore signals
        if (importData.signals && Array.isArray(importData.signals)) {
          clearSignals();
          importData.signals.forEach((signal: any) => {
            addSignal(signal);
          });
          summary.push(`✅ ${importData.signals.length} Signals`);
        }
        
        // Restore cash balance
        if (importData.cashBalance !== undefined && importData.cashBalance !== null) {
          setCashBalance(Number(importData.cashBalance));
          summary.push(`✅ Cash Balance: ${Number(importData.cashBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })} €`);
        }

        // Restore initial capital
        if (importData.initialCapital !== undefined && importData.initialCapital !== null) {
          setInitialCapital(Number(importData.initialCapital));
          summary.push(`✅ Initial Capital: ${Number(importData.initialCapital).toLocaleString('en-US', { minimumFractionDigits: 2 })} €`);
        }

        // Restore previous profit
        if (importData.previousProfit !== undefined && importData.previousProfit !== null) {
          setPreviousProfit(Number(importData.previousProfit));
          summary.push(`✅ Previous Profits: ${Number(importData.previousProfit).toLocaleString('en-US', { minimumFractionDigits: 2 })} €`);
        }

        // Restore orders
        if (importData.orders && Array.isArray(importData.orders)) {
          // Remove existing orders
          store.orders.forEach((o: any) => store.removeOrder(o.id));
          // Add imported orders
          importData.orders.forEach((o: any) => store.addOrder(o));
          summary.push(`✅ ${importData.orders.length} Orders`);
        }

        // Restore order settings (including transaction fees)
        if (importData.orderSettings) {
          store.updateOrderSettings(importData.orderSettings);
          summary.push('✅ Order Settings (Transaction Fees)');
        }

        // Restore price alerts
        if (importData.priceAlerts && Array.isArray(importData.priceAlerts)) {
          store.priceAlerts.forEach((a: any) => store.removePriceAlert(a.id));
          importData.priceAlerts.forEach((a: any) => store.addPriceAlert(a));
          summary.push(`✅ ${importData.priceAlerts.length} Price Alerts`);
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
            summary.push('✅ Last AI Analysis');
          }
        }

        // Restore analysis history
        if (importData.analysisHistory && Array.isArray(importData.analysisHistory)) {
          store.clearAnalysisHistory();
          // Add oldest first, since addAnalysisHistory inserts at the beginning
          [...importData.analysisHistory].reverse().forEach((entry: any) => {
            store.addAnalysisHistory(entry);
          });
          summary.push(`✅ ${importData.analysisHistory.length} Analysis entries (AI Memory)`);
        }

        // Restore autopilot settings
        if (importData.autopilotSettings) {
          store.updateAutopilotSettings(importData.autopilotSettings);
          summary.push('✅ Autopilot Settings');
        }

        // Restore autopilot log
        if (importData.autopilotLog && Array.isArray(importData.autopilotLog)) {
          store.clearAutopilotLog();
          // Add oldest first
          [...importData.autopilotLog].reverse().forEach((entry: any) => {
            store.addAutopilotLog(entry);
          });
          if (importData.autopilotLog.length > 0) {
            summary.push(`✅ ${importData.autopilotLog.length} Autopilot Log Entries`);
          }
        }

        // Restore autopilot state
        if (importData.autopilotState) {
          store.updateAutopilotState(importData.autopilotState);
          summary.push('✅ Autopilot Status');
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

  const testAlpaca = async () => {
    setTestingAlpaca(true);
    setAlpacaTestResult(null);
    try {
      const alpaca = createAlpacaService(
        settings.apiKeys.alpacaKeyId,
        settings.apiKeys.alpacaKeySecret,
        alpacaSettings.paper
      );
      if (!alpaca) {
        setAlpacaTestResult({ ok: false, info: 'API Key ID oder Secret fehlt.' });
        return;
      }
      const account = await alpaca.getAccount();
      setAlpacaTestResult({
        ok: true,
        info: `Konto ${account.account_number} · Status: ${account.status} · Kaufkraft: ${Number(account.buying_power).toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${account.currency}`,
      });
    } catch (err: any) {
      setAlpacaTestResult({ ok: false, info: err?.message ?? 'Verbindung fehlgeschlagen.' });
    } finally {
      setTestingAlpaca(false);
    }
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
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4 md:space-y-6">
      <div className="pt-12 lg:pt-0">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-400">Configure your Investment Advisor</p>
      </div>

      {/* Investment Settings */}
      <section className="bg-[#1a1a2e] rounded-xl p-4 md:p-6 border border-[#252542] space-y-4 md:space-y-6">
        <h2 className="text-lg md:text-xl font-semibold text-white flex items-center gap-2">
          <Target size={18} className="text-indigo-500" />
          Investment Settings
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Strategy */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Target size={16} className="inline mr-1" />
              Strategy
            </label>
            <select
              value={settings.strategy}
              onChange={(e) => updateSettings({ strategy: e.target.value as InvestmentStrategy })}
              className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                       text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="short">Short-term (Days-Weeks)</option>
              <option value="middle">Mid-term (Weeks-Months)</option>
              <option value="long">Long-term (10+ Years)</option>
            </select>
          </div>

          {/* Startkapital */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Wallet size={16} className="inline mr-1" />
              Initial Capital (€)
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={initialCapital || ''}
              onChange={(e) => setInitialCapital(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                       text-white focus:outline-none focus:border-indigo-500"
              placeholder="e.g. 10000"
            />
            <p className="text-xs text-gray-500 mt-1">Originally invested amount for total profit calculation</p>
          </div>

          {/* Previous profits */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <TrendingUp size={16} className="inline mr-1" />
              Previous Profits/Losses (€)
            </label>
            <input
              type="number"
              step="0.01"
              value={previousProfit || ''}
              onChange={(e) => setPreviousProfit(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                       text-white focus:outline-none focus:border-indigo-500"
              placeholder="e.g. 1500 or -300"
            />
            <p className="text-xs text-gray-500 mt-1">Profits (+) or losses (-) from previous portfolios, offset against current gains</p>
          </div>

          {/* Risk Tolerance */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Shield size={16} className="inline mr-1" />
              Risk Tolerance
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
                  {level === 'low' && 'Conservative'}
                  {level === 'medium' && 'Balanced'}
                  {level === 'high' && 'Aggressive'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* AI Output Language */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <Brain size={16} className="inline mr-1" />
            AI Analysis Language
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Language for all AI analysis outputs (signals, summaries, recommendations).
          </p>
          <div className="flex gap-3">
            {([
              { value: 'en', label: '🇬🇧 English' },
              { value: 'de', label: '🇩🇪 Deutsch' },
              { value: 'fr', label: '🇫🇷 Français' },
            ] as { value: AILanguage; label: string }[]).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => updateSettings({ aiLanguage: value })}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                  (settings.aiLanguage || 'en') === value
                    ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                    : 'bg-[#252542] border-[#3a3a5a] text-gray-400 hover:border-indigo-500/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Prompt */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <MessageSquareText size={16} className="inline mr-1" />
            Custom Instructions for AI
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Provide the AI with specific instructions, e.g., ETF preferences, tax considerations, sector exclusions, etc.
          </p>
          <textarea
            value={settings.customPrompt || ''}
            onChange={(e) => updateSettings({ customPrompt: e.target.value })}
            placeholder="e.g.: I live in Luxembourg. Prefer accumulating ETFs over distributing ones (tax advantageous). No weapons stocks. Focus on European markets..."
            rows={4}
            className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500
                     resize-y min-h-[100px]"
          />
          <p className="text-xs text-gray-600 mt-1">
            {(settings.customPrompt || '').length} characters
          </p>
        </div>
      </section>

      {/* Transaction Fees */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-6">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Receipt size={20} className="text-indigo-500" />
          Transaction Fees
        </h2>
        <p className="text-sm text-gray-400">
          Fees are automatically deducted from cash balance on every buy and sell.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Flat Fee */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Fixed Fee per Trade (€)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={orderSettings.transactionFeeFlat}
              onChange={(e) => updateOrderSettings({ transactionFeeFlat: Math.max(0, parseFloat(e.target.value) || 0) })}
              className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                       text-white focus:outline-none focus:border-indigo-500"
              placeholder="e.g. 1.00"
            />
            <p className="text-xs text-gray-500 mt-1">Fixed amount per transaction (e.g., 1.00 €)</p>
          </div>

          {/* Percent Fee */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Percentage Fee per Trade (%)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={orderSettings.transactionFeePercent}
              onChange={(e) => updateOrderSettings({ transactionFeePercent: Math.max(0, parseFloat(e.target.value) || 0) })}
              className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                       text-white focus:outline-none focus:border-indigo-500"
              placeholder="e.g. 0.25"
            />
            <p className="text-xs text-gray-500 mt-1">Percent of order volume (e.g., 0.25%)</p>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-[#252542] rounded-lg p-4">
          <p className="text-sm text-gray-400">Example calculation for a €1,000 order:</p>
          <p className="text-sm text-white mt-1">
            Fixed Fee: {(orderSettings.transactionFeeFlat || 0).toFixed(2)} € + 
            Percentage Fee: {(1000 * (orderSettings.transactionFeePercent || 0) / 100).toFixed(2)} € = {' '}
            <span className="font-bold text-indigo-400">
              {((orderSettings.transactionFeeFlat || 0) + 1000 * (orderSettings.transactionFeePercent || 0) / 100).toFixed(2)} € Total Fees
            </span>
          </p>
        </div>
      </section>

      {/* API Keys */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-6">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Key size={20} className="text-indigo-500" />
          API Keys & AI Provider
        </h2>

        {/* AI Provider Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Select AI Provider
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
              ? 'Claude offers excellent analysis capabilities and is ideal for detailed financial analyses.'
              : settings.aiProvider === 'gemini'
              ? '🆓 Gemini offers a free API key – perfect for getting started! Get your key at ai.google.dev'
              : 'OpenAI provides structured JSON responses for financial analysis.'}
          </p>
        </div>

        {/* Model Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Select AI Model
          </label>
          {settings.aiProvider === 'claude' ? (
            <div className="flex gap-3 flex-wrap">
              {([                { value: 'claude-opus-4-6' as ClaudeModel, label: '🔮 Claude Opus 4.6', desc: 'Best quality (latest model)' },
                { value: 'claude-sonnet-4-6' as ClaudeModel, label: '🟣 Claude Sonnet 4.6', desc: 'Fast & intelligent' },
                { value: 'claude-haiku-4-5-20251001' as ClaudeModel, label: '⚡ Claude Haiku 4.5', desc: 'Fastest' },
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
                { value: 'gemini-2.5-flash' as GeminiModel, label: '⚡ Gemini 2.5 Flash', desc: 'Fast & free' },
                { value: 'gemini-2.5-pro' as GeminiModel, label: '🔵 Gemini 2.5 Pro', desc: 'Most powerful model' },
                { value: 'gemini-2.5-flash-lite' as GeminiModel, label: '💨 Gemini 2.5 Flash-Lite', desc: 'Cheapest & fastest' },
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
                { value: 'gpt-5.4' as OpenAIModel, label: '🟢 GPT-5.4', desc: 'Best quality (latest model)' },
                { value: 'gpt-5.4-mini' as OpenAIModel, label: '🟡 GPT-5.4 Mini', desc: 'Fast & inexpensive' },
                { value: 'gpt-5.4-nano' as OpenAIModel, label: '⚪ GPT-5.4 Nano', desc: 'Most inexpensive' },
              ]).map((model) => (
                <button
                  key={model.value}
                  onClick={() => updateSettings({ openaiModel: model.value })}
                  className={`flex-1 min-w-[140px] px-4 py-3 rounded-lg border transition-colors text-left ${
                    (settings.openaiModel || 'gpt-5.4') === model.value
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
            Claude API Key (Anthropic)
            {settings.aiProvider === 'claude' && <span className="text-indigo-400 ml-2">• Active</span>}
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
            Get your API key at{' '}
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
            Gemini API Key (Google)
            {settings.aiProvider === 'gemini' && <span className="text-blue-400 ml-2">• Active</span>}
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
            🆓 Free API key at{' '}
            <a 
              href="https://aistudio.google.com/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              aistudio.google.com/apikey
            </a>
            {' '}– Perfect for getting started without costs!
          </p>
        </div>

        {/* OpenAI API Key */}
        <div className={settings.aiProvider !== 'openai' ? 'opacity-50' : ''}>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            OpenAI API Key
            {settings.aiProvider === 'openai' && <span className="text-green-400 ml-2">• Active</span>}
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
            Get your API key at{' '}
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

        {/* Finnhub API Key (for live news) */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Finnhub API Key
            <span className="text-gray-500 ml-2 font-normal">(optional – for live news)</span>
            {settings.apiKeys.marketData && <span className="text-green-400 ml-2">• Configured</span>}
          </label>
          <input
            type="password"
            value={settings.apiKeys.marketData}
            onChange={(e) => updateSettings({
              apiKeys: { ...settings.apiKeys, marketData: e.target.value }
            })}
            placeholder="Finnhub API-Key..."
            className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white focus:outline-none focus:border-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-2">
            Finnhub provides live news for macro & geopolitics context in AI analysis. Without this key the app uses Yahoo Finance News (limited). Free at{' '}
            <a 
              href="https://finnhub.io/register" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-indigo-400 hover:underline"
            >
              finnhub.io
            </a>
          </p>
        </div>
      </section>

      {/* Alpaca Paper Trading */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Zap size={20} className="text-yellow-400" />
          Alpaca Paper Trading
        </h2>
        <p className="text-gray-400 text-sm">
          Verbinde Vestia mit einem Alpaca Paper-Trading-Konto. Ausgeführte Orders werden parallel an Alpaca übermittelt – das interne Portfolio bleibt die primäre Datenquelle.
        </p>

        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <span className="text-gray-300 text-sm font-medium">Alpaca aktivieren</span>
          <button
            onClick={() => updateAlpacaSettings({ enabled: !alpacaSettings.enabled })}
            className={`relative w-12 h-6 rounded-full transition-colors ${alpacaSettings.enabled ? 'bg-yellow-500' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${alpacaSettings.enabled ? 'translate-x-6' : ''}`} />
          </button>
        </div>

        {/* API Key ID */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            API Key ID
            {settings.apiKeys.alpacaKeyId && <span className="text-green-400 ml-2">• Konfiguriert</span>}
          </label>
          <input
            type="password"
            value={settings.apiKeys.alpacaKeyId}
            onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, alpacaKeyId: e.target.value } })}
            placeholder="PK..."
            className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white focus:outline-none focus:border-yellow-500"
          />
        </div>

        {/* API Secret */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            API Secret Key
          </label>
          <input
            type="password"
            value={settings.apiKeys.alpacaKeySecret}
            onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, alpacaKeySecret: e.target.value } })}
            placeholder="Secret..."
            className="w-full px-4 py-3 bg-[#252542] border border-[#3a3a5a] rounded-lg 
                     text-white focus:outline-none focus:border-yellow-500"
          />
          <p className="text-xs text-gray-500 mt-2">
            Paper-Trading-Keys unter{' '}
            <a
              href="https://app.alpaca.markets/paper/dashboard/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="text-yellow-400 hover:underline"
            >
              app.alpaca.markets → Paper Dashboard
            </a>{' '}
            (API Keys → Generate New Key).
          </p>
        </div>

        {/* Connection test */}
        <div className="flex items-center gap-3">
          <button
            onClick={testAlpaca}
            disabled={testingAlpaca || !settings.apiKeys.alpacaKeyId || !settings.apiKeys.alpacaKeySecret}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 
                     border border-yellow-600/40 rounded-lg text-yellow-300 text-sm transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testingAlpaca ? (
              <span className="animate-spin text-base">⟳</span>
            ) : (
              <Zap size={16} />
            )}
            Verbindung testen
          </button>
          {alpacaTestResult && (
            <span className={`text-sm ${alpacaTestResult.ok ? 'text-green-400' : 'text-red-400'}`}>
              {alpacaTestResult.ok ? '✓' : '✗'} {alpacaTestResult.info}
            </span>
          )}
        </div>
      </section>

      {/* AI Memory */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Brain size={20} className="text-purple-500" />
          AI Memory
        </h2>
        <p className="text-gray-400 text-sm">
          The AI remembers the last {analysisHistory.length > 0 ? analysisHistory.length : 0} analyses to recognize changes and provide better recommendations.
          If you want to start fresh, you can clear the memory here.
        </p>
        {analysisHistory.length > 0 && (
          <div className="bg-[#252542] rounded-lg p-3 space-y-1">
            {analysisHistory.map((entry, i) => (
              <div key={entry.id || i} className="text-xs text-gray-400 flex justify-between">
                <span>{new Date(entry.date).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="text-gray-500">{entry.watchlistSymbols?.length || 0} stocks · {entry.aiProvider}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => {
            if (window.confirm('Really clear AI memory? The AI will then start without context from previous analyses.')) {
              clearAnalysisHistory();
              setLastAnalysis(null);
            }
          }}
          disabled={analysisHistory.length === 0 && !lastAnalysis}
          className="flex items-center gap-2 px-4 py-3 bg-red-600/20 hover:bg-red-600/40 border border-red-600/30
                   text-red-400 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 size={18} />
          Clear AI Memory ({analysisHistory.length} entries)
        </button>
      </section>

      {/* Telegram Benachrichtigungen */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Send size={20} className="text-indigo-500" />
            Telegram Notifications
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-gray-300 text-sm">Enabled</span>
            <button
              onClick={() => updateSettings({
                notifications: {
                  ...settings.notifications,
                  telegram: { ...settings.notifications.telegram, enabled: !settings.notifications.telegram.enabled }
                }
              })}
              className={`toggle-switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                settings.notifications.telegram.enabled ? 'bg-indigo-500' : 'bg-gray-600'
              }`}
              style={{ minWidth: '2.75rem', minHeight: '1.5rem', maxWidth: '2.75rem', maxHeight: '1.5rem' }}
            >
              <span className={`inline-block h-4 w-4 shrink-0 transform rounded-full bg-white transition-transform ${
                settings.notifications.telegram.enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
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
            {testing ? 'Testing...' : 'Test connection'}
          </button>
          {testResult === 'success' && (
            <span className="text-green-500 flex items-center gap-1">
              <Check size={16} /> Successful!
            </span>
          )}
          {testResult === 'error' && (
            <span className="text-red-500 flex items-center gap-1">
              <AlertCircle size={16} /> Failed
            </span>
          )}
        </div>

        <p className="text-xs text-gray-500">
          1. Create a bot via @BotFather on Telegram<br />
          2. Send a message to your bot<br />
          3. Get your chat ID via @userinfobot
        </p>
      </section>

      {/* Email Notifications */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Mail size={20} className="text-indigo-500" />
            Email Notifications (EmailJS)
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-gray-300 text-sm">Enabled</span>
            <button
              onClick={() => updateSettings({
                notifications: {
                  ...settings.notifications,
                  email: { ...settings.notifications.email, enabled: !settings.notifications.email.enabled }
                }
              })}
              className={`toggle-switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                settings.notifications.email.enabled ? 'bg-indigo-500' : 'bg-gray-600'
              }`}
              style={{ minWidth: '2.75rem', minHeight: '1.5rem', maxWidth: '2.75rem', maxHeight: '1.5rem' }}
            >
              <span className={`inline-block h-4 w-4 shrink-0 transform rounded-full bg-white transition-transform ${
                settings.notifications.email.enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Email Address (Recipient)
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
            placeholder="your@email.com"
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
              Testing connection...
            </>
          ) : emailTestResult === 'success' ? (
            <>
              <Check size={20} className="text-green-400" />
              Email sent successfully!
            </>
          ) : emailTestResult === 'error' ? (
            <>
              <AlertCircle size={20} className="text-red-400" />
              Error - Check your settings
            </>
          ) : (
            <>
              <Send size={20} />
              Send Test Email
            </>
          )}
        </button>

        <p className="text-xs text-gray-500">
          1. Create an account at emailjs.com<br />
          2. Connect your email service (Gmail, Outlook, etc.)<br />
          3. Create a template with these variables: to_email, subject, stock_name, stock_symbol, signal_type, price, change, confidence, risk_level, reasoning, target_price, stop_loss, date<br />
          4. Copy Service ID, Template ID and Public Key here
        </p>
      </section>

      {/* Backup & Restore */}
      <section className="bg-[#1a1a2e] rounded-xl p-6 border border-[#252542] space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Download size={20} className="text-indigo-500" />
          Backup & Restore
        </h2>
        
        <p className="text-gray-400 text-sm">
          Export <strong className="text-gray-300">all</strong> your data as JSON file for backup or to transfer to another device:
        </p>
        <div className="text-xs text-gray-500 grid grid-cols-2 gap-1">
          <span>• Settings & API Keys</span>
          <span>• Cash balance & Initial capital</span>
          <span>• Portfolio positions</span>
          <span>• Previous profits/losses</span>
          <span>• Watchlist & Price alerts</span>
          <span>• Signals & Orders</span>
          <span>• AI analysis & Memory</span>
          <span>• Autopilot configuration</span>
          <span>• Transaction fees</span>
          <span>• Custom prompt</span>
        </div>

        <div className="flex flex-wrap gap-4">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 
                     text-white rounded-lg transition-colors"
          >
            <Download size={18} />
            Export Data (JSON)
          </button>

          <label className="flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 
                          text-white rounded-lg transition-colors cursor-pointer">
            <Upload size={18} />
            Import Backup
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
              Import successful! The following data was restored:
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
            Import failed. Please check the file.
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
            Saved!
          </>
        ) : (
          <>
            <Save size={20} />
            Save Settings
          </>
        )}
      </button>
    </div>
  );
}
