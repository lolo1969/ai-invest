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
  Upload
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { notificationService } from '../services/notifications';
import type { InvestmentStrategy, RiskLevel, AIProvider } from '../types';

export function Settings() {
  const { settings, updateSettings, userPositions, watchlist, cashBalance, setCashBalance, signals, addSignal, clearSignals } = useAppStore();
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<'success' | 'error' | null>(null);
  const [importStatus, setImportStatus] = useState<'success' | 'error' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export all data as JSON
  const handleExport = () => {
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      settings,
      userPositions,
      watchlist,
      signals,
      cashBalance
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-invest-backup-${new Date().toISOString().split('T')[0]}.json`;
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
        
        // Restore settings (includes watchlist symbols)
        if (importData.settings) {
          updateSettings(importData.settings);
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
        }
        
        // Restore signals
        if (importData.signals && Array.isArray(importData.signals)) {
          clearSignals();
          importData.signals.forEach((signal: any) => {
            addSignal(signal);
          });
        }
        
        // Restore cash balance
        if (importData.cashBalance !== undefined) {
          setCashBalance(importData.cashBalance);
        }
        
        setImportStatus('success');
        setTimeout(() => setImportStatus(null), 3000);
      } catch (error) {
        console.error('Import failed:', error);
        setImportStatus('error');
        setTimeout(() => setImportStatus(null), 3000);
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
            {(['claude', 'openai'] as AIProvider[]).map((provider) => (
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
                {provider === 'openai' && '🟢 GPT-4o (OpenAI)'}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {settings.aiProvider === 'claude' 
              ? 'Claude bietet exzellente Analysefähigkeiten und ist gut für detaillierte Finanzanalysen.'
              : 'GPT-4o ist schnell und liefert strukturierte JSON-Antworten für Finanzanalysen.'}
          </p>
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
          Exportiere alle deine Daten (Einstellungen, Portfolio, Watchlist) als JSON-Datei zum Backup oder zum Übertragen auf ein anderes Gerät.
        </p>

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
          <div className="flex items-center gap-2 text-green-500 text-sm">
            <Check size={16} />
            Import erfolgreich! Daten wurden wiederhergestellt.
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
