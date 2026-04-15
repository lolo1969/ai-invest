import { useState, useEffect } from 'react';
import { 
  Landmark, 
  TrendingDown, 
  Clock,
  ShieldCheck, 
  ShieldAlert,
  Trash2,
  Plus,
  Info,
  Calendar,
  Edit3,
  Check,
  X,
  Coins,
  Percent
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

// Luxemburger Steuerregeln:
// - Spekulationsfrist: 6 Monate (183 Tage)
// - Haltedauer >= 6 Monate: Veräußerungsgewinn steuerfrei (bei Beteiligung < 10%)
// - Haltedauer < 6 Monate: Steuerpflichtig (progressiver Satz 0-45,78% inkl. Solidaritätszuschlag)
// - Freibetrag: 500 € auf kurzfristige Spekulationsgewinne
// - Verluste aus Spekulationsgeschäften können gegen Spekulationsgewinne verrechnet werden

const LUX_SPECULATION_DAYS = 183; // ~6 Monate
const LUX_EXEMPTION_AMOUNT = 500; // EUR Freibetrag auf kurzfristige Gewinne

export function Taxes() {
  const { taxTransactions, addTaxTransaction, removeTaxTransaction, clearTaxTransactions, userPositions } = useAppStore();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTx, setEditingTx] = useState<string | null>(null);
  const [editBuyDate, setEditBuyDate] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // Auto-Fix: Kaufdaten aus Buy-Orders nachschlagen für Transaktionen mit holdingDays === 0
  useEffect(() => {
    const store = useAppStore.getState();
    const unknownDateTxs = store.taxTransactions.filter(
      tx => (!tx.transactionType || tx.transactionType === 'capital-gain') && tx.holdingDays === 0
    );
    if (unknownDateTxs.length === 0) return;

    let fixed = 0;
    for (const tx of unknownDateTxs) {
      // 1. Ausgeführte Buy-Orders durchsuchen
      const buyOrder = store.orders
        .filter(o => o.status === 'executed'
          && (o.orderType === 'limit-buy' || o.orderType === 'stop-buy')
          && o.symbol === tx.symbol
          && o.executedAt != null)
        .sort((a, b) => new Date(a.executedAt!).getTime() - new Date(b.executedAt!).getTime())[0];

      let foundBuyDate: Date | null = null;
      if (buyOrder) {
        foundBuyDate = new Date(buyOrder.executedAt!);
      }

      // 2. Fallback: Trade-History
      if (!foundBuyDate) {
        const buyTrade = store.tradeHistory
          ?.filter(t => t.type === 'buy' && t.symbol === tx.symbol)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        if (buyTrade) {
          foundBuyDate = new Date(buyTrade.date);
        }
      }

      if (foundBuyDate) {
        const sellDate = new Date(tx.sellDate);
        const holdingDays = Math.floor((sellDate.getTime() - foundBuyDate.getTime()) / (1000 * 60 * 60 * 24));
        if (holdingDays > 0) {
          const taxFree = holdingDays >= LUX_SPECULATION_DAYS;
          const gainLoss = (tx.sellPrice - tx.buyPrice) * tx.quantity - tx.fees;
          removeTaxTransaction(tx.id);
          addTaxTransaction({
            ...tx,
            buyDate: foundBuyDate.toISOString(),
            holdingDays,
            taxFree,
            gainLoss,
          });
          fixed++;
        }
      }
    }
    if (fixed > 0) {
      console.log(`[Steuern] ${fixed} Transaktion(en) automatisch mit Kaufdatum aus Orders/History ergänzt`);
    }
  }, []); // Nur beim ersten Render

  // Form state für manuelle Erfassung
  const [formData, setFormData] = useState({
    symbol: '',
    name: '',
    quantity: '',
    buyPrice: '',
    sellPrice: '',
    buyDate: '',
    sellDate: new Date().toISOString().split('T')[0],
    fees: '0',
  });

  // Filter Transaktionen für gewähltes Jahr
  const yearTransactions = taxTransactions.filter(tx => {
    const sellYear = new Date(tx.sellDate).getFullYear();
    return sellYear === selectedYear;
  });

  // Verfügbare Jahre
  const availableYears = [...new Set(taxTransactions.map(tx => new Date(tx.sellDate).getFullYear()))].sort((a, b) => b - a);
  if (!availableYears.includes(new Date().getFullYear())) {
    availableYears.unshift(new Date().getFullYear());
  }

  // Aufgeteilt nach Transaktionsart
  const capitalGainTransactions = yearTransactions.filter(tx => !tx.transactionType || tx.transactionType === 'capital-gain');
  const dividendTransactions = yearTransactions.filter(tx => tx.transactionType === 'dividend');
  const interestTransactions = yearTransactions.filter(tx => tx.transactionType === 'interest');

  // Berechnungen nach Luxemburger Steuerrecht
  const taxableTransactions = capitalGainTransactions.filter(tx => !tx.taxFree); // < 6 Monate Haltedauer
  const taxFreeTransactions = capitalGainTransactions.filter(tx => tx.taxFree);  // >= 6 Monate

  const shortTermGains = taxableTransactions
    .filter(tx => tx.gainLoss > 0)
    .reduce((sum, tx) => sum + tx.gainLoss, 0);

  const shortTermLosses = taxableTransactions
    .filter(tx => tx.gainLoss < 0)
    .reduce((sum, tx) => sum + tx.gainLoss, 0); // Negativer Wert

  const longTermGains = taxFreeTransactions
    .filter(tx => tx.gainLoss > 0)
    .reduce((sum, tx) => sum + tx.gainLoss, 0);

  const longTermLosses = taxFreeTransactions
    .filter(tx => tx.gainLoss < 0)
    .reduce((sum, tx) => sum + tx.gainLoss, 0);

  // Netto kurzfristige Gewinne (Gewinne - Verluste)
  const netShortTermGainLoss = shortTermGains + shortTermLosses; // Verluste sind bereits negativ

  // Zu versteuernder Betrag: Netto-Spekulationsgewinn minus Freibetrag (500 €)
  const taxableAmount = Math.max(0, netShortTermGainLoss - LUX_EXEMPTION_AMOUNT);

  // Gesamtgewinn/-verlust
  const totalGainLoss = yearTransactions.reduce((sum, tx) => sum + tx.gainLoss, 0);
  const totalFees = yearTransactions.reduce((sum, tx) => sum + tx.fees, 0);

  // Dividenden & Zinsen
  const dividendIncome = dividendTransactions.reduce((sum, tx) => sum + tx.gainLoss, 0);
  const dividendWithholdingTax = dividendTransactions.reduce((sum, tx) => sum + (tx.withholdingTax || 0), 0);
  const interestIncome = interestTransactions.reduce((sum, tx) => sum + tx.gainLoss, 0);
  const interestWithholdingTax = interestTransactions.reduce((sum, tx) => sum + (tx.withholdingTax || 0), 0);

  // Unrealisierte Gewinne (offene Positionen)
  const unrealizedGains = userPositions.reduce((sum, p) => sum + (p.currentPrice - p.buyPrice) * p.quantity, 0);

  // Manuelle Transaktion hinzufügen
  const handleAddTransaction = () => {
    const qty = parseFloat(formData.quantity);
    const buyPrice = parseFloat(formData.buyPrice);
    const sellPrice = parseFloat(formData.sellPrice);
    const fees = parseFloat(formData.fees) || 0;

    if (!formData.symbol || !qty || !buyPrice || !sellPrice || !formData.buyDate || !formData.sellDate) return;

    const buyDate = new Date(formData.buyDate);
    const sellDate = new Date(formData.sellDate);
    const holdingDays = Math.floor((sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24));
    const gainLoss = (sellPrice - buyPrice) * qty - fees;
    const taxFree = holdingDays >= LUX_SPECULATION_DAYS;

    addTaxTransaction({
      id: crypto.randomUUID(),
      symbol: formData.symbol.toUpperCase(),
      name: formData.name || formData.symbol.toUpperCase(),
      quantity: qty,
      buyPrice,
      sellPrice,
      buyDate: buyDate.toISOString(),
      sellDate: sellDate.toISOString(),
      gainLoss,
      fees,
      holdingDays,
      taxFree,
    });

    setFormData({ symbol: '', name: '', quantity: '', buyPrice: '', sellPrice: '', buyDate: '', sellDate: new Date().toISOString().split('T')[0], fees: '0' });
    setShowAddForm(false);
  };

  // Kaufdatum einer Transaktion bearbeiten
  const handleUpdateBuyDate = (txId: string) => {
    const tx = taxTransactions.find(t => t.id === txId);
    if (!tx || !editBuyDate) return;
    
    const newBuyDate = new Date(editBuyDate);
    const sellDate = new Date(tx.sellDate);
    const holdingDays = Math.floor((sellDate.getTime() - newBuyDate.getTime()) / (1000 * 60 * 60 * 24));
    const taxFree = holdingDays >= LUX_SPECULATION_DAYS;
    
    // Remove old and add updated
    removeTaxTransaction(txId);
    addTaxTransaction({
      ...tx,
      buyDate: newBuyDate.toISOString(),
      holdingDays,
      taxFree,
    });
    
    setEditingTx(null);
    setEditBuyDate('');
  };

  const formatCurrency = (amount: number) => 
    amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (isoString: string) => 
    new Date(isoString).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Landmark className="w-8 h-8 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Steuern</h1>
            <p className="text-gray-400 text-sm">Luxemburger Steuerrecht · Kapitalerträge</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-[#1a1a3e] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-3 py-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 text-sm font-medium"
          >
            <Plus size={16} />
            Transaktion
          </button>
        </div>
      </div>

      {/* Info-Box: Luxemburger Steuerregeln */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-200">
            <p className="font-medium mb-1">Luxemburger Steuerrecht – Kapitalerträge aus Wertpapieren</p>
            <ul className="list-disc list-inside space-y-0.5 text-blue-300/80">
              <li><strong>Haltedauer &lt; 6 Monate:</strong> Spekulationsgewinne steuerpflichtig (progressiver Satz bis 45,78%)</li>
              <li><strong>Haltedauer ≥ 6 Monate:</strong> Veräußerungsgewinne steuerfrei (bei Beteiligung unter 10%)</li>
              <li><strong>Freibetrag:</strong> 500 € auf kurzfristige Spekulationsgewinne pro Jahr</li>
              <li><strong>Verlustverrechnung:</strong> Kurzfristige Verluste können gegen kurzfristige Gewinne verrechnet werden</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Steuer-Übersicht Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Zu versteuernder Betrag */}
        <div className="bg-[#1a1a3e] rounded-xl p-4 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Landmark className="w-5 h-5 text-amber-400" />
            <span className="text-sm text-gray-400">Zu versteuern ({selectedYear})</span>
          </div>
          <div className={`text-2xl font-bold ${taxableAmount > 0 ? 'text-amber-400' : 'text-green-400'}`}>
            {formatCurrency(taxableAmount)} €
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {netShortTermGainLoss > LUX_EXEMPTION_AMOUNT 
              ? `Nach Abzug von ${LUX_EXEMPTION_AMOUNT} € Freibetrag`
              : netShortTermGainLoss > 0 
                ? `Unter Freibetrag (${LUX_EXEMPTION_AMOUNT} €)`
                : 'Keine steuerpflichtigen Gewinne'}
          </p>
        </div>

        {/* Steuerpflichtige Gewinne (kurzfristig) */}
        <div className="bg-[#1a1a3e] rounded-xl p-4 border border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            <span className="text-sm text-gray-400">Spekulationsgewinne</span>
          </div>
          <div className="text-2xl font-bold text-red-400">
            {formatCurrency(shortTermGains)} €
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {taxableTransactions.filter(tx => tx.gainLoss > 0).length} Transaktion(en) · &lt; 6 Monate
          </p>
        </div>

        {/* Verlustverrechnung */}
        <div className="bg-[#1a1a3e] rounded-xl p-4 border border-orange-500/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-orange-400" />
            <span className="text-sm text-gray-400">Verlustverrechnung</span>
          </div>
          <div className="text-2xl font-bold text-orange-400">
            {formatCurrency(shortTermLosses)} €
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {taxableTransactions.filter(tx => tx.gainLoss < 0).length} Verlust-Transaktion(en)
          </p>
        </div>

        {/* Steuerfreie Gewinne (langfristig) */}
        <div className="bg-[#1a1a3e] rounded-xl p-4 border border-green-500/20">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-green-400" />
            <span className="text-sm text-gray-400">Steuerfreie Gewinne</span>
          </div>
          <div className="text-2xl font-bold text-green-400">
            {formatCurrency(longTermGains)} €
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {taxFreeTransactions.filter(tx => tx.gainLoss > 0).length} Transaktion(en) · ≥ 6 Monate
          </p>
        </div>
      </div>

      {/* Dividenden & Zinsen Cards */}
      {(dividendTransactions.length > 0 || interestTransactions.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {dividendTransactions.length > 0 && (
            <div className="bg-[#1a1a3e] rounded-xl p-4 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Coins className="w-5 h-5 text-purple-400" />
                <span className="text-sm text-gray-400">Dividendenerträge</span>
              </div>
              <div className="text-2xl font-bold text-purple-400">{formatCurrency(dividendIncome)} €</div>
              <p className="text-xs text-gray-500 mt-1">
                {dividendTransactions.length} Zahlung(en)
                {dividendWithholdingTax > 0 && ` · ${formatCurrency(dividendWithholdingTax)} € Quellensteuer einbehalten`}
              </p>
            </div>
          )}
          {interestTransactions.length > 0 && (
            <div className="bg-[#1a1a3e] rounded-xl p-4 border border-cyan-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="w-5 h-5 text-cyan-400" />
                <span className="text-sm text-gray-400">Zinserträge</span>
              </div>
              <div className="text-2xl font-bold text-cyan-400">{formatCurrency(interestIncome)} €</div>
              <p className="text-xs text-gray-500 mt-1">
                {interestTransactions.length} Zahlung(en)
                {interestWithholdingTax > 0 && ` · ${formatCurrency(interestWithholdingTax)} € Quellensteuer einbehalten`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Zusammenfassung */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Steuerberechnung Detail */}
        <div className="bg-[#1a1a3e] rounded-xl p-5 border border-gray-700/50">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Landmark className="w-5 h-5 text-amber-400" />
            Steuerberechnung {selectedYear}
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-gray-300">
              <span>Kurzfristige Gewinne (&lt; 6 Mon.)</span>
              <span className="font-medium text-red-400">+{formatCurrency(shortTermGains)} €</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Kurzfristige Verluste (&lt; 6 Mon.)</span>
              <span className="font-medium text-orange-400">{formatCurrency(shortTermLosses)} €</span>
            </div>
            <div className="border-t border-gray-700 pt-2 flex justify-between text-gray-200">
              <span className="font-medium">Netto Spekulationsgewinn</span>
              <span className={`font-bold ${netShortTermGainLoss >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {netShortTermGainLoss >= 0 ? '+' : ''}{formatCurrency(netShortTermGainLoss)} €
              </span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Freibetrag</span>
              <span className="font-medium text-green-400">-{formatCurrency(Math.min(LUX_EXEMPTION_AMOUNT, Math.max(0, netShortTermGainLoss)))} €</span>
            </div>
            <div className="border-t border-gray-700 pt-2 flex justify-between">
              <span className="font-bold text-white text-base">Zu versteuernder Betrag</span>
              <span className={`font-bold text-base ${taxableAmount > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                {formatCurrency(taxableAmount)} €
              </span>
            </div>
            <div className="border-t border-gray-700 pt-3 mt-2 space-y-2">
              <div className="flex justify-between text-gray-400">
                <span>Steuerfreie Gewinne (≥ 6 Mon.)</span>
                <span className="text-green-400">+{formatCurrency(longTermGains)} €</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Langfristige Verluste (≥ 6 Mon.)</span>
                <span className="text-orange-400">{formatCurrency(longTermLosses)} €</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Transaktionsgebühren gesamt</span>
                <span className="text-red-300">-{formatCurrency(totalFees)} €</span>
              </div>
              <div className="flex justify-between text-gray-200 font-medium">
                <span>Gesamtgewinn/-verlust {selectedYear}</span>
                <span className={totalGainLoss >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(totalGainLoss)} €
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Unrealisierte Positionen */}
        <div className="bg-[#1a1a3e] rounded-xl p-5 border border-gray-700/50">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-400" />
            Offene Positionen – Steuer-Vorschau
          </h3>
          {userPositions.length === 0 ? (
            <p className="text-gray-500 text-sm">Keine offenen Positionen.</p>
          ) : (
            <div className="space-y-2">
              {userPositions.map(pos => {
                const unrealized = (pos.currentPrice - pos.buyPrice) * pos.quantity;
                const isGain = unrealized >= 0;
                return (
                  <div key={pos.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#0f0f23]/50">
                    <div>
                      <span className="text-white font-medium text-sm">{pos.symbol}</span>
                      <span className="text-gray-500 text-xs ml-2">{pos.quantity} Stk.</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-medium ${isGain ? 'text-green-400' : 'text-red-400'}`}>
                        {isGain ? '+' : ''}{formatCurrency(unrealized)} €
                      </span>
                      <p className="text-xs text-gray-500">
                        Kaufpreis nicht datiert
                      </p>
                    </div>
                  </div>
                );
              })}
              <div className="border-t border-gray-700 pt-3 flex justify-between">
                <span className="text-gray-300 font-medium text-sm">Unrealisiert gesamt</span>
                <span className={`font-bold ${unrealizedGains >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {unrealizedGains >= 0 ? '+' : ''}{formatCurrency(unrealizedGains)} €
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                <Info size={12} className="inline mr-1" />
                Hinweis: Ohne Kaufdatum kann die Haltedauer nicht ermittelt werden.
                Beim Verkauf wird die Transaktion erfasst – Kaufdatum kann nachträglich im Steuer-Tab korrigiert werden.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Kapitalgewinne Tabelle */}
      <div className="bg-[#1a1a3e] rounded-xl p-5 border border-gray-700/50 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            Veräußerungen {selectedYear}
          </h3>
          {yearTransactions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{capitalGainTransactions.length} Transaktion(en)</span>
              {confirmClear ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-red-400">Alle löschen?</span>
                  <button
                    onClick={() => { clearTaxTransactions(); setConfirmClear(false); }}
                    className="p-1 text-red-400 hover:bg-red-500/20 rounded"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="p-1 text-gray-400 hover:bg-gray-500/20 rounded"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {capitalGainTransactions.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Keine Veräußerungen in {selectedYear}</p>
            <p className="text-xs mt-1">Verkäufe werden automatisch erfasst oder können manuell hinzugefügt werden.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700/50">
                  <th className="text-left py-2 px-2 font-medium">Symbol</th>
                  <th className="text-right py-2 px-2 font-medium">Stück</th>
                  <th className="text-right py-2 px-2 font-medium">Kauf</th>
                  <th className="text-right py-2 px-2 font-medium">Verkauf</th>
                  <th className="text-center py-2 px-2 font-medium">Kaufdatum</th>
                  <th className="text-center py-2 px-2 font-medium">Verkaufdatum</th>
                  <th className="text-right py-2 px-2 font-medium">Haltetage</th>
                  <th className="text-right py-2 px-2 font-medium">Gewinn/Verlust</th>
                  <th className="text-center py-2 px-2 font-medium">Status</th>
                  <th className="text-center py-2 px-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {capitalGainTransactions
                  .sort((a, b) => new Date(b.sellDate).getTime() - new Date(a.sellDate).getTime())
                  .map(tx => (
                  <tr key={tx.id} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                    <td className="py-2.5 px-2">
                      <span className="text-white font-medium">{tx.symbol}</span>
                      {tx.name !== tx.symbol && (
                        <span className="text-gray-500 text-xs block">{tx.name}</span>
                      )}
                    </td>
                    <td className="text-right py-2.5 px-2 text-gray-300">{tx.quantity}</td>
                    <td className="text-right py-2.5 px-2 text-gray-300">{formatCurrency(tx.buyPrice)} €</td>
                    <td className="text-right py-2.5 px-2 text-gray-300">{formatCurrency(tx.sellPrice)} €</td>
                    <td className="text-center py-2.5 px-2">
                      {editingTx === tx.id ? (
                        <div className="flex items-center gap-1 justify-center">
                          <input
                            type="date"
                            value={editBuyDate}
                            onChange={(e) => setEditBuyDate(e.target.value)}
                            className="bg-[#0f0f23] border border-gray-600 rounded px-1.5 py-0.5 text-white text-xs w-28"
                            autoFocus
                          />
                          <button
                            onClick={() => handleUpdateBuyDate(tx.id)}
                            className="p-0.5 text-green-400 hover:bg-green-500/20 rounded"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => { setEditingTx(null); setEditBuyDate(''); }}
                            className="p-0.5 text-gray-400 hover:bg-gray-500/20 rounded"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`cursor-pointer hover:text-amber-400 ${tx.holdingDays === 0 ? 'text-amber-500 italic' : 'text-gray-300'}`}
                          onClick={() => { 
                            setEditingTx(tx.id); 
                            setEditBuyDate(tx.holdingDays === 0 ? '' : new Date(tx.buyDate).toISOString().split('T')[0]); 
                          }}
                          title="Klicken zum Bearbeiten"
                        >
                          {tx.holdingDays === 0 ? (
                            <span className="flex items-center justify-center gap-1">
                              <Edit3 size={10} />
                              unbekannt
                            </span>
                          ) : (
                            formatDate(tx.buyDate)
                          )}
                        </button>
                      )}
                    </td>
                    <td className="text-center py-2.5 px-2 text-gray-300">{formatDate(tx.sellDate)}</td>
                    <td className="text-right py-2.5 px-2">
                      <span className={`${tx.holdingDays >= LUX_SPECULATION_DAYS ? 'text-green-400' : tx.holdingDays === 0 ? 'text-gray-500' : 'text-red-400'}`}>
                        {tx.holdingDays === 0 ? '–' : `${tx.holdingDays}d`}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-2">
                      <span className={`font-medium ${tx.gainLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.gainLoss >= 0 ? '+' : ''}{formatCurrency(tx.gainLoss)} €
                      </span>
                    </td>
                    <td className="text-center py-2.5 px-2">
                      {tx.taxFree ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs">
                          <ShieldCheck size={12} />
                          Frei
                        </span>
                      ) : tx.holdingDays === 0 ? (
                        <button
                          type="button"
                          onClick={() => { 
                            setEditingTx(tx.id); 
                            setEditBuyDate(''); 
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs cursor-pointer hover:bg-amber-500/20"
                          title="Kaufdatum setzen um Steuerstatus zu ermitteln"
                        >
                          <Edit3 size={12} />
                          Datum setzen
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs">
                          <ShieldAlert size={12} />
                          Pflichtig
                        </span>
                      )}
                    </td>
                    <td className="text-center py-2.5 px-2">
                      <button
                        onClick={() => removeTaxTransaction(tx.id)}
                        className="p-1 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded"
                        title="Transaktion löschen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dividenden & Zinsen Tabelle */}
      {(dividendTransactions.length > 0 || interestTransactions.length > 0) && (
        <div className="bg-[#1a1a3e] rounded-xl p-5 border border-gray-700/50 mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
            <Coins className="w-5 h-5 text-purple-400" />
            Dividenden &amp; Zinsen {selectedYear}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700/50">
                  <th className="text-left py-2 px-2 font-medium">Art</th>
                  <th className="text-left py-2 px-2 font-medium">Gesellschaft</th>
                  <th className="text-right py-2 px-2 font-medium">Stück</th>
                  <th className="text-center py-2 px-2 font-medium">Datum</th>
                  <th className="text-right py-2 px-2 font-medium">Brutto</th>
                  <th className="text-right py-2 px-2 font-medium">Quellensteuer</th>
                  <th className="text-center py-2 px-2 font-medium">Status</th>
                  <th className="text-center py-2 px-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {[...dividendTransactions, ...interestTransactions]
                  .sort((a, b) => new Date(b.sellDate).getTime() - new Date(a.sellDate).getTime())
                  .map(tx => (
                  <tr key={tx.id} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                    <td className="py-2.5 px-2">
                      {tx.transactionType === 'dividend' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-xs">
                          <Coins size={10} /> Dividende
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs">
                          <Percent size={10} /> Zinsen
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="text-white font-medium">{tx.name}</span>
                      {tx.symbol && tx.symbol !== 'ZINSEN' && tx.symbol !== tx.name && (
                        <span className="text-gray-500 text-xs block">{tx.symbol}</span>
                      )}
                    </td>
                    <td className="text-right py-2.5 px-2 text-gray-300">
                      {tx.quantity > 0 && tx.transactionType === 'dividend' ? tx.quantity : '–'}
                    </td>
                    <td className="text-center py-2.5 px-2 text-gray-300">{formatDate(tx.sellDate)}</td>
                    <td className="text-right py-2.5 px-2">
                      <span className="font-medium text-green-400">+{formatCurrency(tx.gainLoss)} €</span>
                    </td>
                    <td className="text-right py-2.5 px-2">
                      {(tx.withholdingTax || 0) > 0 ? (
                        <span className="text-orange-400">-{formatCurrency(tx.withholdingTax || 0)} €</span>
                      ) : (
                        <span className="text-gray-600">–</span>
                      )}
                    </td>
                    <td className="text-center py-2.5 px-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs">
                        <ShieldAlert size={12} />
                        Pflichtig
                      </span>
                    </td>
                    <td className="text-center py-2.5 px-2">
                      <button
                        onClick={() => removeTaxTransaction(tx.id)}
                        className="p-1 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded"
                        title="Transaktion löschen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manuelle Transaktion hinzufügen Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a3e] rounded-xl p-6 w-full max-w-lg border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Transaktion manuell erfassen</h3>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Symbol *</label>
                  <input
                    type="text"
                    placeholder="z.B. AAPL"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                    className="w-full bg-[#0f0f23] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    placeholder="z.B. Apple Inc."
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-[#0f0f23] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Stückzahl *</label>
                <input
                  type="number"
                  placeholder="Anzahl"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className="w-full bg-[#0f0f23] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  min="0"
                  step="any"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Kaufpreis (€) *</label>
                  <input
                    type="number"
                    placeholder="Kauf pro Stk."
                    value={formData.buyPrice}
                    onChange={(e) => setFormData({ ...formData, buyPrice: e.target.value })}
                    className="w-full bg-[#0f0f23] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Verkaufspreis (€) *</label>
                  <input
                    type="number"
                    placeholder="Verkauf pro Stk."
                    value={formData.sellPrice}
                    onChange={(e) => setFormData({ ...formData, sellPrice: e.target.value })}
                    className="w-full bg-[#0f0f23] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Kaufdatum *</label>
                  <input
                    type="date"
                    value={formData.buyDate}
                    onChange={(e) => setFormData({ ...formData, buyDate: e.target.value })}
                    className="w-full bg-[#0f0f23] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Verkaufdatum *</label>
                  <input
                    type="date"
                    value={formData.sellDate}
                    onChange={(e) => setFormData({ ...formData, sellDate: e.target.value })}
                    className="w-full bg-[#0f0f23] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Gebühren (€)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={formData.fees}
                  onChange={(e) => setFormData({ ...formData, fees: e.target.value })}
                  className="w-full bg-[#0f0f23] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  min="0"
                  step="0.01"
                />
              </div>

              {/* Vorschau */}
              {formData.buyPrice && formData.sellPrice && formData.quantity && formData.buyDate && formData.sellDate && (
                <div className="bg-[#0f0f23] rounded-lg p-3 text-sm">
                  {(() => {
                    const qty = parseFloat(formData.quantity) || 0;
                    const bp = parseFloat(formData.buyPrice) || 0;
                    const sp = parseFloat(formData.sellPrice) || 0;
                    const fees = parseFloat(formData.fees) || 0;
                    const gl = (sp - bp) * qty - fees;
                    const bd = new Date(formData.buyDate);
                    const sd = new Date(formData.sellDate);
                    const days = Math.floor((sd.getTime() - bd.getTime()) / (1000 * 60 * 60 * 24));
                    const free = days >= LUX_SPECULATION_DAYS;
                    return (
                      <div className="space-y-1">
                        <div className="flex justify-between text-gray-400">
                          <span>Gewinn/Verlust</span>
                          <span className={gl >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {gl >= 0 ? '+' : ''}{formatCurrency(gl)} €
                          </span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Haltedauer</span>
                          <span className={free ? 'text-green-400' : 'text-red-400'}>{days} Tage</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Steuerstatus</span>
                          {free ? (
                            <span className="text-green-400 flex items-center gap-1">
                              <ShieldCheck size={12} /> Steuerfrei
                            </span>
                          ) : (
                            <span className="text-red-400 flex items-center gap-1">
                              <ShieldAlert size={12} /> Steuerpflichtig
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 py-2 bg-gray-700/50 text-gray-300 rounded-lg hover:bg-gray-700 text-sm"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleAddTransaction}
                  disabled={!formData.symbol || !formData.quantity || !formData.buyPrice || !formData.sellPrice || !formData.buyDate || !formData.sellDate}
                  className="flex-1 py-2 bg-amber-500 text-black rounded-lg hover:bg-amber-400 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Hinzufügen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Taxes;
