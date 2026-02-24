import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, AlertTriangle, Check, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { parseCSV, toUserPositions, type ImportResult, type AggregatedPosition } from '../services/csvImport';
import { useAppStore } from '../store/useAppStore';
import { marketDataService } from '../services/marketData';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CSVImportModal({ isOpen, onClose }: CSVImportModalProps) {
  const { addUserPosition, userPositions } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [, setCsvContent] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<Set<number>>(new Set());
  const [showSkipped, setShowSkipped] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [priceResults, setPriceResults] = useState<Record<string, number>>({});
  const [dragActive, setDragActive] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const reset = () => {
    setStep('upload');
    setCsvContent('');
    setImportResult(null);
    setSelectedPositions(new Set());
    setShowSkipped(false);
    setImportProgress(0);
    setImportedCount(0);
    setFetchingPrices(false);
    setPriceResults({});
    setPasteMode(false);
    setPasteText('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processCSV = useCallback((content: string) => {
    setCsvContent(content);
    const result = parseCSV(content);
    setImportResult(result);
    // Select all positions by default
    setSelectedPositions(new Set(result.positions.map((_, i) => i)));
    setStep('preview');
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

  // Fetch current prices for selected positions
  const fetchCurrentPrices = async () => {
    if (!importResult) return;
    setFetchingPrices(true);
    const prices: Record<string, number> = {};
    
    for (const idx of selectedPositions) {
      const pos = importResult.positions[idx];
      const lookupSymbol = pos.symbol || pos.isin || pos.name;
      try {
        const quote = await marketDataService.getQuote(lookupSymbol);
        if (quote && quote.price > 0) {
          prices[`${idx}`] = quote.price;
        }
      } catch {
        // Price fetch failed, will use buy price as fallback
      }
    }
    
    setPriceResults(prices);
    setFetchingPrices(false);
  };

  // Import selected positions into the store
  const importPositions = async () => {
    if (!importResult) return;
    setStep('importing');
    
    const selectedList = importResult.positions.filter((_, i) => selectedPositions.has(i));
    const userPos = toUserPositions(selectedList);
    
    // Apply fetched prices
    for (let i = 0; i < userPos.length; i++) {
      const origIdx = Array.from(selectedPositions)[i];
      const fetchedPrice = priceResults[`${origIdx}`];
      if (fetchedPrice) {
        userPos[i].currentPrice = Math.round(fetchedPrice * 100) / 100;
      }
    }

    // Check for duplicates (by ISIN or symbol)
    const existingISINs = new Set(userPositions.filter(p => p.isin).map(p => p.isin!.toUpperCase()));
    const existingSymbols = new Set(userPositions.map(p => p.symbol.toUpperCase()));
    
    let imported = 0;
    for (const pos of userPos) {
      const isDuplicate = 
        (pos.isin && existingISINs.has(pos.isin.toUpperCase())) ||
        existingSymbols.has(pos.symbol.toUpperCase());
      
      if (!isDuplicate) {
        addUserPosition(pos);
        imported++;
      }
      setImportProgress(Math.round(((imported) / userPos.length) * 100));
    }
    
    setImportedCount(imported);
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
              <h2 className="text-xl font-semibold text-white">Portfolio importieren</h2>
              <p className="text-sm text-gray-400">CSV-Datei von Trade Republic oder anderem Broker</p>
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
                <p className="text-white text-lg mb-2">CSV-Datei hierher ziehen oder klicken</p>
                <p className="text-gray-400 text-sm">
                  Unterstützt: Trade Republic, Scalable Capital, ING, comdirect und andere Broker-CSVs
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
                  {pasteMode ? 'Datei-Upload anzeigen' : 'Oder CSV-Text manuell einfügen'}
                </button>
              </div>

              {pasteMode && (
                <div className="space-y-3">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={`CSV-Daten hier einfügen, z.B.:\n\nName;ISIN;Anzahl;Kaufkurs;Währung\nApple Inc.;US0378331005;10;142.50;EUR\nMicrosoft;US5949181045;5;310.00;EUR`}
                    className="w-full h-48 bg-[#0d0d1a] border border-[#252542] rounded-lg p-4 text-white font-mono text-sm
                             placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <button
                    onClick={handlePasteImport}
                    disabled={!pasteText.trim()}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/30 
                             text-white rounded-lg transition-colors font-medium"
                  >
                    CSV verarbeiten
                  </button>
                </div>
              )}

              {/* Help Section */}
              <div className="bg-[#0d0d1a] rounded-xl p-4 border border-[#252542]">
                <h3 className="text-white font-medium mb-2">💡 So exportierst du dein Portfolio:</h3>
                <div className="text-sm text-gray-400 space-y-2">
                  <p><strong className="text-gray-300">Trade Republic:</strong> Nutze <a href="https://github.com/pytr-org/pytr" target="_blank" rel="noopener" className="text-indigo-400 hover:underline">pytr</a> oder erstelle eine CSV manuell aus deinen Abrechnungen.</p>
                  <p><strong className="text-gray-300">Scalable Capital:</strong> Portfolio → Export → CSV-Download</p>
                  <p><strong className="text-gray-300">Portfolio Performance:</strong> Datei → Exportieren → CSV</p>
                  <p><strong className="text-gray-300">Manuell:</strong> Erstelle eine CSV mit den Spalten: Name, ISIN, Anzahl, Kaufkurs, Währung</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && importResult && (
            <div className="space-y-4">
              {/* Warnings */}
              {importResult.warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={18} className="text-yellow-500" />
                    <span className="text-yellow-400 font-medium">Hinweise</span>
                  </div>
                  {importResult.warnings.map((w, i) => (
                    <p key={i} className="text-yellow-300 text-sm">{w}</p>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">{importResult.positions.length}</p>
                  <p className="text-xs text-gray-400">Positionen erkannt</p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">{importResult.totalBuyTransactions}</p>
                  <p className="text-xs text-gray-400">Käufe</p>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-400">{importResult.totalSellTransactions}</p>
                  <p className="text-xs text-gray-400">Verkäufe</p>
                </div>
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
                        Alle auswählen ({selectedPositions.size}/{importResult.positions.length})
                      </span>
                    </label>
                    <button
                      onClick={fetchCurrentPrices}
                      disabled={fetchingPrices || selectedPositions.size === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600/20 hover:bg-blue-600/30 
                               disabled:opacity-40 text-blue-400 rounded-lg transition-colors"
                    >
                      {fetchingPrices ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      Aktuelle Preise laden
                    </button>
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
                    {showSkipped ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {importResult.skipped.length} übersprungene Einträge
                  </button>
                  {showSkipped && (
                    <div className="mt-2 space-y-1">
                      {importResult.skipped.map((s, i) => (
                        <div key={i} className="text-xs text-gray-500 bg-[#0d0d1a] px-3 py-2 rounded">
                          {s.name} – Keine gültige Menge erkannt
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {importResult.positions.length === 0 && (
                <div className="text-center py-8">
                  <AlertTriangle size={48} className="mx-auto text-yellow-500 mb-4" />
                  <p className="text-white text-lg">Keine importierbaren Positionen gefunden</p>
                  <p className="text-gray-400 text-sm mt-2">
                    Prüfe das Format deiner CSV-Datei. Benötigt werden mindestens: Name/ISIN und Anzahl/Betrag.
                  </p>
                  <button
                    onClick={reset}
                    className="mt-4 px-4 py-2 bg-[#252542] hover:bg-[#2a2a4a] text-white rounded-lg transition-colors"
                  >
                    Nochmal versuchen
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="text-center py-12">
              <Loader2 size={48} className="mx-auto text-indigo-400 animate-spin mb-4" />
              <p className="text-white text-lg">Importiere Positionen...</p>
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
              <p className="text-white text-2xl font-bold mb-2">Import abgeschlossen!</p>
              <p className="text-gray-400">
                {importedCount} {importedCount === 1 ? 'Position' : 'Positionen'} erfolgreich importiert.
                {importResult && selectedPositions.size - importedCount > 0 && (
                  <span className="text-yellow-400">
                    {' '}({selectedPositions.size - importedCount} Duplikate übersprungen)
                  </span>
                )}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Aktuelle Kurse werden automatisch über Yahoo Finance aktualisiert.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#252542] p-4 flex justify-between">
          {step === 'preview' && (
            <>
              <button
                onClick={reset}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Zurück
              </button>
              <button
                onClick={importPositions}
                disabled={selectedPositions.size === 0}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600/30
                         text-white rounded-lg transition-colors font-medium"
              >
                <Check size={18} />
                {selectedPositions.size} {selectedPositions.size === 1 ? 'Position' : 'Positionen'} importieren
              </button>
            </>
          )}
          {(step === 'done' || step === 'upload') && (
            <div className="ml-auto">
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-[#252542] hover:bg-[#2a2a4a] text-white rounded-lg transition-colors"
              >
                {step === 'done' ? 'Fertig' : 'Abbrechen'}
              </button>
            </div>
          )}
        </div>
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
      className={`flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a2e]/50 transition-colors cursor-pointer
        ${isDuplicate ? 'opacity-50' : ''}`}
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
          <span>{position.transactions.length} Transaktion(en)</span>
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
