import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, AlertTriangle, Check, X, Loader2 } from 'lucide-react';
import { parseCSV, toUserPositions, type ImportResult, type AggregatedPosition } from '../services/csvImport';
import { useAppStore } from '../store/useAppStore';
import { marketDataService } from '../services/marketData';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CSVImportModal({ isOpen, onClose }: CSVImportModalProps) {
  const {
    addUserPosition,
    userPositions,
    addTradeHistory,
    tradeHistory,
    addTaxTransaction,
    taxTransactions,
    orderSettings,
    cashBalance,
    setCashBalance,
  } = useAppStore();
    const { clearUserPositions, clearTradeHistory, clearTaxTransactions } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [, setCsvContent] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<Set<number>>(new Set());
  const [showSkipped, setShowSkipped] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importedSummary, setImportedSummary] = useState({ positions: 0, trades: 0, taxes: 0, cash: 0 });
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [priceResults, setPriceResults] = useState<Record<string, number>>({});
  const [resolvedSymbols, setResolvedSymbols] = useState<Record<string, string>>({});
  const [dragActive, setDragActive] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');

  const reset = () => {
    setStep('upload');
    setCsvContent('');
    setImportResult(null);
    setSelectedPositions(new Set());
    setShowSkipped(false);
    setImportProgress(0);
    setImportedSummary({ positions: 0, trades: 0, taxes: 0, cash: 0 });
    setFetchingPrices(false);
    setPriceResults({});
    setResolvedSymbols({});
    setPasteMode(false);
    setPasteText('');
    setImportMode('merge');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processCSV = useCallback((content: string) => {
    setCsvContent(content);
    const result = parseCSV(content, {
      transactionFeeFlat: orderSettings?.transactionFeeFlat,
      transactionFeePercent: orderSettings?.transactionFeePercent,
    });
    setImportResult(result);
    // Select all positions by default
    setSelectedPositions(new Set(result.positions.map((_, i) => i)));
    setStep('preview');
  // fetchCurrentPrices will be auto-triggered via useEffect
  }, []);

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) processCSV(content);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  const handlePasteImport = () => {
    if (pasteText.trim()) {
      processCSV(pasteText.trim());
    }
  };

  const togglePosition = (index: number) => {
    setSelectedPositions(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (importResult) {
      if (selectedPositions.size === importResult.positions.length) {
        setSelectedPositions(new Set());
      } else {
        setSelectedPositions(new Set(importResult.positions.map((_, i) => i)));
      }
    }
  };

  const normalizeAssetName = (value: string): string => {
    return value
      .toLowerCase()
      .replace(/\((acc|dist|adr|a|b|vz\.)\)/gi, ' ')
      .replace(/\b(acc|dist|adr|etf|ucits|usd|eur|gbp)\b/gi, ' ')
      .replace(/[.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const scoreSearchResult = (query: string, candidate: { symbol: string; name: string }): number => {
    const normalizedQuery = normalizeAssetName(query);
    const normalizedName = normalizeAssetName(candidate.name);
    if (!normalizedQuery || !normalizedName) return 0;
    if (normalizedName === normalizedQuery) return 100;
    if (normalizedName.startsWith(normalizedQuery)) return 90;
    if (normalizedName.includes(normalizedQuery)) return 75;

    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    const nameTokens = new Set(normalizedName.split(' ').filter(Boolean));
    const tokenMatches = queryTokens.filter(token => nameTokens.has(token)).length;
    return tokenMatches * 10;
  };

  const resolveQuoteForPosition = async (position: AggregatedPosition): Promise<{ price?: number; symbol?: string }> => {
    const directLookup = position.symbol || position.isin || position.name;
    const triedSymbols = new Set<string>();

    const tryQuote = async (candidateSymbol?: string): Promise<{ price?: number; symbol?: string } | null> => {
      if (!candidateSymbol || triedSymbols.has(candidateSymbol)) return null;
      triedSymbols.add(candidateSymbol);
      const quote = await marketDataService.getQuote(candidateSymbol);
      if (quote && quote.price > 0) {
        return { price: quote.price, symbol: quote.symbol || candidateSymbol };
      }
      return null;
    };

    const directResult = await tryQuote(directLookup);
    if (directResult) return directResult;

    if (position.isin) {
      const isinResults = await marketDataService.searchStocks(position.isin);
      for (const candidate of isinResults.slice(0, 5)) {
        const result = await tryQuote(candidate.symbol);
        if (result) return result;
      }
    }

    if (position.name) {
      const searchResults = await marketDataService.searchStocks(position.name);
      const rankedCandidates = searchResults
        .map(candidate => ({ candidate, score: scoreSearchResult(position.name, candidate) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      for (const { candidate } of rankedCandidates) {
        const result = await tryQuote(candidate.symbol);
        if (result) return result;
      }

      const normalizedName = normalizeAssetName(position.name);
      if (normalizedName && normalizedName !== position.name.toLowerCase()) {
        const normalizedResults = await marketDataService.searchStocks(normalizedName);
        for (const candidate of normalizedResults.slice(0, 5)) {
          const result = await tryQuote(candidate.symbol);
          if (result) return result;
        }
      }
    }

    return {};
  };

  // Auto-trigger price/symbol fetch when preview is shown
  useEffect(() => {
    if (step === 'preview' && importResult && importResult.mode !== 'unsupported' && !fetchingPrices) {
      fetchCurrentPrices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, importResult]);

  // Fetch current prices for selected positions
  const fetchCurrentPrices = async () => {
    if (!importResult) return;
    setFetchingPrices(true);
    const prices: Record<string, number> = {};
    const symbols: Record<string, string> = {};

    // Resolve selected positions (for current price + ticker)
    for (const idx of selectedPositions) {
      const pos = importResult.positions[idx];
      try {
        const resolved = await resolveQuoteForPosition(pos);

        if (resolved.price && resolved.price > 0) {
          prices[`${idx}`] = resolved.price;
        }
        if (resolved.symbol) {
          symbols[`${idx}`] = resolved.symbol;
        }
      } catch {
        // Price fetch failed, will use buy price as fallback
      }
    }

    // Also resolve ISINs that appear only in trade history (fully sold positions)
    // Build a deduplicated list of ISIN+name pairs from trade history not yet resolved via positions
    const resolvedIsins = new Set(
      Array.from(selectedPositions).map(idx => importResult.positions[idx]?.isin?.toUpperCase()).filter(Boolean)
    );
    const tradeIsinMap = new Map<string, string>(); // ISIN → name
    for (const trade of importResult.tradeHistory) {
      const isin = importResult.positions.find(p =>
        (p.isin && p.isin.toUpperCase() === trade.symbol.toUpperCase()) ||
        p.symbol === trade.symbol
      )?.isin;
      // trade.symbol may itself be an ISIN if looksLikeIsin
      const rawIsin = /^[A-Z]{2}[A-Z0-9]{9}\d$/i.test(trade.symbol) ? trade.symbol.toUpperCase() : isin?.toUpperCase();
      if (rawIsin && !resolvedIsins.has(rawIsin)) {
        tradeIsinMap.set(rawIsin, trade.name);
      }
    }
    for (const [isin, name] of tradeIsinMap.entries()) {
      try {
        const searchResults = await marketDataService.searchStocks(isin);
        const fallbackSearchResults = searchResults.length > 0 ? searchResults : await marketDataService.searchStocks(name);
        const rankedCandidates = fallbackSearchResults
          .map(candidate => ({ candidate, score: scoreSearchResult(name, candidate) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        for (const { candidate } of rankedCandidates) {
          const quote = await marketDataService.getQuote(candidate.symbol);
          if (quote && quote.price > 0) {
            symbols[`isin:${isin}`] = candidate.symbol;
            break;
          }
        }
      } catch {
        // ignore
      }
    }

    setPriceResults(prices);
    setResolvedSymbols(symbols);
    setFetchingPrices(false);
  };

  // Import selected positions into the store
  const importPositions = async () => {
    if (!importResult) return;
    setStep('importing');
    
    const selectedIndices = Array.from(selectedPositions).sort((a, b) => a - b);
    const selectedList = importResult.positions.filter((_, i) => selectedPositions.has(i));
    const userPos = toUserPositions(selectedList);
    const hasCashImport = importResult.totalCashIn > 0 || importResult.totalCashOut > 0;
    const totalOperations = userPos.length + importResult.tradeHistory.length + importResult.taxTransactions.length + (hasCashImport ? 1 : 0) || 1;
    let processed = 0;
    
    // Apply fetched prices and resolved symbols
    // Build ISIN→Yahoo-Ticker map so trade history and taxes also get proper symbols
    const isinToTicker: Record<string, string> = {};
    for (let i = 0; i < userPos.length; i++) {
      const origIdx = selectedIndices[i];
      const fetchedPrice = priceResults[`${origIdx}`];
      const resolvedSymbol = resolvedSymbols[`${origIdx}`];
      if (fetchedPrice) {
        userPos[i].currentPrice = Math.round(fetchedPrice * 100) / 100;
      }
      if (resolvedSymbol && resolvedSymbol !== userPos[i].symbol) {
        userPos[i].symbol = resolvedSymbol;
      }
      // Map ISIN → resolved Yahoo ticker
      const posIsin = importResult.positions[origIdx]?.isin;
      if (posIsin && resolvedSymbol) {
        isinToTicker[posIsin.toUpperCase()] = resolvedSymbol;
      }
    }

    // Also resolve ISINs from non-selected positions (e.g. all trades/taxes include buys that may not be in selected positions)
    // Attempt resolution for any ISIN not yet in the map
    const allIsins = new Set<string>();
    for (const pos of importResult.positions) {
      if (pos.isin) allIsins.add(pos.isin.toUpperCase());
    }
    for (const isin of allIsins) {
      if (!isinToTicker[isin]) {
        const pos = importResult.positions.find(p => p.isin?.toUpperCase() === isin);
        if (pos?.symbol) {
          isinToTicker[isin] = pos.symbol;
        }
      }
    }
    // Include fully-sold positions resolved via trade-history ISIN search
    for (const [key, ticker] of Object.entries(resolvedSymbols)) {
      if (key.startsWith('isin:')) {
        const isin = key.slice(5);
        if (!isinToTicker[isin]) isinToTicker[isin] = ticker;
      }
    }

    // Check for duplicates (by ISIN or symbol)
    // Overwrite mode: clear all existing data first
    if (importMode === 'overwrite') {
      clearUserPositions();
      clearTradeHistory();
      clearTaxTransactions();
    }
    const existingISINs = importMode === 'overwrite' ? new Set<string>() : new Set(userPositions.filter(p => p.isin).map(p => p.isin!.toUpperCase()));
    const existingSymbols = importMode === 'overwrite' ? new Set<string>() : new Set(userPositions.map(p => p.symbol.toUpperCase()));
    const existingTradeKeys = importMode === 'overwrite' ? new Set<string>() : new Set(
      tradeHistory.map((entry) => [entry.type, entry.symbol.toUpperCase(), entry.quantity, entry.price, entry.totalAmount, entry.date].join('|'))
    );
    const existingTaxKeys = importMode === 'overwrite' ? new Set<string>() : new Set(
      taxTransactions.map((entry) => [entry.symbol.toUpperCase(), entry.quantity, entry.buyPrice, entry.sellPrice, entry.buyDate, entry.sellDate].join('|'))
    );
    
    let importedPositions = 0;
    for (const pos of userPos) {
      const isDuplicate = 
        (pos.isin && existingISINs.has(pos.isin.toUpperCase())) ||
        existingSymbols.has(pos.symbol.toUpperCase());
      
      if (!isDuplicate) {
        addUserPosition(pos);
        importedPositions++;
      }
      processed++;
      setImportProgress(Math.round((processed / totalOperations) * 100));
    }

    let importedTrades = 0;
    for (const trade of importResult.tradeHistory) {
      // Prefer resolved Yahoo ticker over raw ISIN symbol
      const resolvedSym = isinToTicker[trade.symbol.toUpperCase()] || trade.symbol;
      const resolvedTrade = resolvedSym !== trade.symbol ? { ...trade, symbol: resolvedSym } : trade;
      const key = [resolvedTrade.type, resolvedTrade.symbol.toUpperCase(), resolvedTrade.quantity, resolvedTrade.price, resolvedTrade.totalAmount, resolvedTrade.date].join('|');
      if (!existingTradeKeys.has(key)) {
        addTradeHistory(resolvedTrade);
        existingTradeKeys.add(key);
        importedTrades++;
      }
      processed++;
      setImportProgress(Math.round((processed / totalOperations) * 100));
    }

    let importedTaxes = 0;
    for (const taxTx of importResult.taxTransactions) {
      // Prefer resolved Yahoo ticker over raw ISIN symbol
      const resolvedSym = isinToTicker[taxTx.symbol.toUpperCase()] || taxTx.symbol;
      const resolvedTax = resolvedSym !== taxTx.symbol ? { ...taxTx, symbol: resolvedSym } : taxTx;
      const key = [resolvedTax.symbol.toUpperCase(), resolvedTax.quantity, resolvedTax.buyPrice, resolvedTax.sellPrice, resolvedTax.buyDate, resolvedTax.sellDate].join('|');
      if (!existingTaxKeys.has(key)) {
        addTaxTransaction(resolvedTax);
        existingTaxKeys.add(key);
        importedTaxes++;
      }
      processed++;
      setImportProgress(Math.round((processed / totalOperations) * 100));
    }

    let appliedCash = 0;
    if (hasCashImport) {
      const nextCashBalance = importMode === 'overwrite'
        ? importResult.netCashChange
        : cashBalance + importResult.netCashChange;
      setCashBalance(nextCashBalance);
      appliedCash = importResult.netCashChange;
      processed++;
      setImportProgress(Math.round((processed / totalOperations) * 100));
    }
    
    setImportedSummary({ positions: importedPositions, trades: importedTrades, taxes: importedTaxes, cash: appliedCash });
    setStep('done');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a2e] rounded-2xl border border-[#252542] w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#252542]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Upload size={20} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Import Portfolio</h2>
              <p className="text-sm text-gray-400">Import a CSV export from your broker or portfolio tool</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-[#252542] rounded-lg transition-colors">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Drag & Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
                  ${dragActive 
                    ? 'border-indigo-500 bg-indigo-500/10' 
                    : 'border-[#252542] hover:border-indigo-500/50 hover:bg-[#252542]/50'
                  }`}
              >
                <FileText size={48} className="mx-auto text-gray-500 mb-4" />
                <p className="text-white text-lg mb-2">Drag CSV file here or click</p>
                <p className="text-gray-400 text-sm">
                  Works with many broker and portfolio CSV exports when the required columns are included
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.tsv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>

              {/* Or paste manually */}
              <div className="text-center">
                <button
                  onClick={() => setPasteMode(!pasteMode)}
                  className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
                >
                  {pasteMode ? 'Show file upload' : 'Or paste CSV text manually'}
                </button>
              </div>

              {pasteMode && (
                <div className="space-y-3">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={`Paste CSV data here, e.g.:\n\nName;ISIN;Quantity;Purchase Price;Currency\nApple Inc.;US0378331005;10;142.50;EUR\nMicrosoft;US5949181045;5;310.00;EUR`}
                    className="w-full h-48 bg-[#0d0d1a] border border-[#252542] rounded-lg p-4 text-white font-mono text-sm
                             placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <button
                    onClick={handlePasteImport}
                    disabled={!pasteText.trim()}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/30 
                             text-white rounded-lg transition-colors font-medium"
                  >
                    CSV Process
                  </button>
                </div>
              )}

              {/* Help Section */}
              <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#252542]">
                <h3 className="text-white font-medium mb-2">💡 CSV requirements</h3>
                <div className="text-sm text-gray-400 space-y-2">
                  <p><strong className="text-gray-300">For positions:</strong> Include at least name or symbol, quantity, purchase price and ideally ISIN plus currency.</p>
                  <p><strong className="text-gray-300">For trade history and taxes:</strong> Include date, transaction type, quantity and price or total amount.</p>
                  <p><strong className="text-gray-300">Important:</strong> Files that only contain totals or cash movements without quantity and instrument details are not sufficient for a full import.</p>
                  <p><strong className="text-gray-300">Tip:</strong> Exports from brokers and tools such as Portfolio Performance usually work if those fields are present.</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && importResult && (
            <div className="space-y-4">
              {/* Import Mode */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => setImportMode('merge')}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    importMode === 'merge'
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-[#252542] bg-[#0d0d1a] hover:border-gray-600'
                  }`}
                >
                  <div className="text-sm font-medium text-white">Merge</div>
                  <div className="mt-1 text-xs text-gray-400">
                    Add new entries, keep existing positions and tax data.
                  </div>
                </button>
                <button
                  onClick={() => setImportMode('overwrite')}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    importMode === 'overwrite'
                      ? 'border-red-500 bg-red-500/10'
                      : 'border-[#252542] bg-[#0d0d1a] hover:border-gray-600'
                  }`}
                >
                  <div className="text-sm font-medium text-white">Overwrite</div>
                  <div className="mt-1 text-xs text-gray-400">
                    Delete existing positions, trade history and tax data before import.
                  </div>
                </button>
              </div>

              {/* Warnings */}
              {importResult.warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={18} className="text-yellow-500" />
                    <span className="text-yellow-400 font-medium">Warnings</span>
                  </div>
                  {importResult.warnings.map((w, i) => (
                    <p key={i} className="text-yellow-300 text-sm">{w}</p>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">{importResult.positions.length}</p>
                  <p className="text-xs text-gray-400">Positions detected</p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">{importResult.totalBuyTransactions}</p>
                  <p className="text-xs text-gray-400">Purchases</p>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-400">{importResult.totalSellTransactions}</p>
                  <p className="text-xs text-gray-400">Sales</p>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-purple-400">
                    {importResult.taxTransactions.filter(tx => !tx.transactionType || tx.transactionType === 'capital-gain').length}
                  </p>
                  <p className="text-xs text-gray-400">Tax lines</p>
                </div>
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-cyan-400">
                    {importResult.taxTransactions.filter(tx => tx.transactionType === 'dividend' || tx.transactionType === 'interest').length}
                  </p>
                  <p className="text-xs text-gray-400">Div. / Interest</p>
                </div>
              </div>

              {(importResult.totalCashIn > 0 || importResult.totalCashOut > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-emerald-400">+{importResult.totalCashIn.toFixed(2)} EUR</p>
                    <p className="text-xs text-gray-400">Cash In</p>
                  </div>
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-rose-400">-{importResult.totalCashOut.toFixed(2)} EUR</p>
                    <p className="text-xs text-gray-400">Cash Out</p>
                  </div>
                  <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 text-center">
                    <p className={`text-lg font-bold ${importResult.netCashChange >= 0 ? 'text-indigo-300' : 'text-orange-300'}`}>
                      {importResult.netCashChange >= 0 ? '+' : ''}{importResult.netCashChange.toFixed(2)} EUR
                    </p>
                    <p className="text-xs text-gray-400">Net Cash Change</p>
                  </div>
                </div>
              )}

              <div className="bg-[#0d0d1a] rounded-lg border border-[#252542] p-3 text-sm text-gray-300">
                {importResult.mode === 'positions' && 'This file contains a holdings snapshot. Only current portfolio positions will be imported.'}
                {importResult.mode === 'transactions' && (() => {
                  const capGain = importResult.taxTransactions.filter(tx => !tx.transactionType || tx.transactionType === 'capital-gain').length;
                  const divInt = importResult.taxTransactions.filter(tx => tx.transactionType === 'dividend' || tx.transactionType === 'interest').length;
                  return `This file contains detailed transactions. Current positions, ${importResult.tradeHistory.length} trade history entries, ${capGain} tax disposals${divInt > 0 ? ` and ${divInt} dividends/interest` : ''} will be imported.`;
                })()}
                {importResult.mode === 'unsupported' && 'This file is not sufficient for correct portfolio/tax import. The hints above show which fields are missing.'}
              </div>

              {/* Position List */}
              {importResult.positions.length > 0 && (
                <div className="bg-[#0d0d1a] rounded-xl border border-[#252542] overflow-hidden">
                  <div className="flex items-center justify-between p-3 border-b border-[#252542]">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPositions.size === importResult.positions.length}
                        onChange={toggleAll}
                        className="w-4 h-4 rounded border-gray-500 bg-transparent accent-indigo-500"
                      />
                      <span className="text-sm text-gray-300">
                        Select all ({selectedPositions.size}/{importResult.positions.length})
                      </span>
                    </label>
                    {fetchingPrices && (
                      <span className="flex items-center gap-1.5 text-xs text-blue-400">
                        <Loader2 size={13} className="animate-spin" />
                        Prices are being loaded…
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-[#252542] max-h-[40vh] overflow-y-auto">
                    {importResult.positions.map((pos, idx) => (
                      <PositionRow
                        key={idx}
                        position={pos}
                        index={idx}
                        selected={selectedPositions.has(idx)}
                        onToggle={() => togglePosition(idx)}
                        currentPrice={priceResults[`${idx}`]}
                        existingSymbols={new Set(userPositions.map(p => p.symbol.toUpperCase()))}
                        existingISINs={new Set(userPositions.filter(p => p.isin).map(p => p.isin!.toUpperCase()))}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Skipped Items */}
              {importResult.skipped.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowSkipped(!showSkipped)}
                    className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300"
                  >
                  </button>
                  {showSkipped && (
                    <div className="mt-2 space-y-1">
                      {importResult.skipped.map((s, i) => (
                        <div key={i} className="text-xs text-gray-500 bg-[#0d0d1a] px-3 py-2 rounded">
                          {s.name} – No valid quantity detected
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {importResult.positions.length === 0 && (
                <div className="text-center py-8">
                  <AlertTriangle size={48} className="mx-auto text-yellow-500 mb-4" />
                  <p className="text-white text-lg">
                    {importResult.mode === 'unsupported' ? 'CSV format not sufficient for portfolio/tax import' : 'No importable positions found'}
                  </p>
                  <p className="text-gray-400 text-sm mt-2">
                    {importResult.mode === 'transactions'
                      ? 'No open positions detected. Trade history and tax data can still be imported.'
                      : 'Check the format of your CSV file. For taxes you need at least date, type, quantity and price/total amount.'}
                  </p>
                  <button
                    onClick={reset}
                    className="mt-4 px-4 py-2 bg-[#252542] hover:bg-[#2a2a4a] text-white rounded-lg transition-colors"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="text-center py-12">
              <Loader2 size={48} className="mx-auto text-indigo-400 animate-spin mb-4" />
              <p className="text-white text-lg">Importing data...</p>
              <div className="mt-4 w-64 mx-auto bg-[#252542] rounded-full h-2">
                <div 
                  className="bg-indigo-500 rounded-full h-2 transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <div className="text-center py-12">
              <div className="p-4 bg-green-500/20 rounded-full w-20 h-20 mx-auto flex items-center justify-center mb-4">
                <Check size={40} className="text-green-400" />
              </div>
              <p className="text-white text-2xl font-bold mb-2">Import completed!</p>
              <p className="text-gray-400">
                {importedSummary.positions} {importedSummary.positions === 1 ? 'Position' : 'Positions'}, {importedSummary.trades} {importedSummary.trades === 1 ? 'Trade' : 'Trades'} and {importedSummary.taxes} {importedSummary.taxes === 1 ? 'Tax transaction' : 'Tax transactions'} imported.
                {importedSummary.cash !== 0 && (
                  <span className="text-indigo-300">
                    {' '}Cash {importedSummary.cash > 0 ? 'increased' : 'decreased'} by {Math.abs(importedSummary.cash).toFixed(2)} EUR.
                  </span>
                )}
                {importResult && selectedPositions.size - importedSummary.positions > 0 && (
                  <span className="text-yellow-400">
                    {' '}({selectedPositions.size - importedSummary.positions} position duplicates skipped)
                  </span>
                )}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Current prices for imported positions will be automatically updated via Yahoo Finance.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && (
          <div className="flex items-center justify-between p-6 border-t border-[#252542] shrink-0">
            <button onClick={reset} className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">
              Back
            </button>
            <div className="flex items-center gap-3">
              {importMode === 'overwrite' && (
                <span className="text-xs text-red-400 flex items-center gap-1">
                  ⚠ Existing data will be deleted
                </span>
              )}
              <button
                onClick={importPositions}
                disabled={!importResult || importResult.mode === 'unsupported' || (selectedPositions.size === 0 && importResult.tradeHistory.length === 0 && importResult.taxTransactions.length === 0)}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                Start Import
              </button>
            </div>
          </div>
        )}
        {step === 'done' && (
          <div className="flex justify-end p-6 border-t border-[#252542] shrink-0">
            <button onClick={handleClose} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium">
              Fertig
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Individual position row component
function PositionRow({ 
  position, 
  index: _index, 
  selected, 
  onToggle, 
  currentPrice,
  existingSymbols,
  existingISINs,
}: {
  position: AggregatedPosition;
  index: number;
  selected: boolean;
  onToggle: () => void;
  currentPrice?: number;
  existingSymbols: Set<string>;
  existingISINs: Set<string>;
}) {
  const isDuplicate = 
    (position.isin && existingISINs.has(position.isin.toUpperCase())) ||
    (position.symbol && existingSymbols.has(position.symbol.toUpperCase()));

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a2e]/50 transition-colors cursor-pointer${isDuplicate ? ' opacity-50' : ''}`}
      onClick={onToggle}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="w-4 h-4 rounded border-gray-500 bg-transparent accent-indigo-500 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium truncate">{position.name}</span>
          {isDuplicate && (
            <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">
              Duplikat
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {position.isin && <span>ISIN: {position.isin}</span>}
          {position.symbol && <span>Symbol: {position.symbol}</span>}
          <span>{position.transactions.length} Transaction(s)</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-white font-medium">
          {position.quantity.toFixed(position.quantity % 1 === 0 ? 0 : 4)} Stk.
        </div>
        <div className="text-xs text-gray-400">
          Ø {position.averageBuyPrice.toFixed(2)} {position.currency}
          {currentPrice && (
            <span className={currentPrice >= position.averageBuyPrice ? 'text-green-400' : 'text-red-400'}>
              {' → '}{currentPrice.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
