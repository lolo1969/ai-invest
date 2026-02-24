import type { UserPosition } from '../types';

// Parsed row from CSV
export interface ParsedTransaction {
  date?: string;
  type?: 'buy' | 'sell' | 'dividend' | 'unknown';
  isin?: string;
  symbol?: string;
  name: string;
  quantity: number;
  price: number;
  totalAmount: number;
  currency: string;
  raw: Record<string, string>; // Original row data
}

// Aggregated position from multiple transactions
export interface AggregatedPosition {
  isin?: string;
  symbol?: string;
  name: string;
  quantity: number;
  averageBuyPrice: number;
  totalInvested: number;
  currency: string;
  transactions: ParsedTransaction[];
}

// Import result
export interface ImportResult {
  positions: AggregatedPosition[];
  skipped: ParsedTransaction[];
  warnings: string[];
  totalBuyTransactions: number;
  totalSellTransactions: number;
}

// Known column name mappings for Trade Republic and generic German broker CSVs
const COLUMN_MAPS: Record<string, string[]> = {
  isin: ['isin', 'wkn/isin', 'wertpapierkennnummer', 'kennnummer'],
  name: ['name', 'wertpapier', 'bezeichnung', 'produkt', 'instrument', 'titel', 'wertpapiername', 'asset'],
  quantity: ['anzahl', 'stück', 'stueck', 'stk', 'quantity', 'menge', 'anteile', 'shares'],
  price: ['kurs', 'preis', 'price', 'kaufkurs', 'ausführungskurs', 'ausfuehrungskurs', 'einzelpreis'],
  total: ['betrag', 'total', 'gesamt', 'gesamtbetrag', 'summe', 'wert', 'amount', 'volumen'],
  type: ['typ', 'type', 'art', 'transaktion', 'transaktionstyp', 'aktion', 'order', 'seite', 'side'],
  date: ['datum', 'date', 'zeit', 'zeitpunkt', 'buchungsdatum', 'ausführungsdatum', 'valuta'],
  currency: ['währung', 'waehrung', 'currency', 'cur'],
  symbol: ['symbol', 'ticker', 'kürzel', 'kuerzel'],
};

// Detect separator from CSV content
function detectSeparator(content: string): string {
  const firstLine = content.split('\n')[0] || '';
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  
  if (tabCount > semicolonCount && tabCount > commaCount) return '\t';
  if (semicolonCount > commaCount) return ';';
  return ',';
}

// Parse a number from German/European format (1.234,56) or US format (1,234.56)
function parseNumber(value: string): number {
  if (!value) return 0;
  let cleaned = value.replace(/[€$£\s]/g, '').trim();
  
  // Handle negative values in parentheses: (123,45)
  const isNeg = cleaned.startsWith('(') && cleaned.endsWith(')') || cleaned.startsWith('-');
  cleaned = cleaned.replace(/[()]/g, '').replace(/^-/, '');
  
  // German format: 1.234,56 → detect by comma as decimal separator
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      // German: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // Could be German decimal (123,45) or US thousands (1,234)
    // If digits after comma are exactly 2 or 1, likely decimal
    const afterComma = cleaned.split(',').pop() || '';
    if (afterComma.length <= 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  
  const num = parseFloat(cleaned);
  return isNeg ? -Math.abs(num) : (isNaN(num) ? 0 : num);
}

// Detect transaction type from string
function detectTransactionType(value: string): ParsedTransaction['type'] {
  const lower = value.toLowerCase().trim();
  if (['kauf', 'buy', 'kauforder', 'market_buy', 'limit_buy', 'sparplan', 'sparplanausführung'].some(k => lower.includes(k))) return 'buy';
  if (['verkauf', 'sell', 'verkaufsorder', 'market_sell', 'limit_sell'].some(k => lower.includes(k))) return 'sell';
  if (['dividende', 'dividend', 'ausschüttung', 'ausschuettung'].some(k => lower.includes(k))) return 'dividend';
  return 'unknown';
}

// Match CSV header to known column type
function matchColumn(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  for (const [key, aliases] of Object.entries(COLUMN_MAPS)) {
    if (aliases.some(alias => normalized === alias || normalized.includes(alias))) {
      return key;
    }
  }
  return null;
}

// Parse CSV content into rows
function parseCSVRows(content: string, separator: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };
  
  const headers = lines[0].split(separator).map(h => h.replace(/^["']|["']$/g, '').trim());
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(separator).map(v => v.replace(/^["']|["']$/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return { headers, rows };
}

// Main CSV parser
export function parseCSV(content: string): ImportResult {
  const warnings: string[] = [];
  const separator = detectSeparator(content);
  const { headers, rows } = parseCSVRows(content, separator);
  
  if (headers.length === 0 || rows.length === 0) {
    return { positions: [], skipped: [], warnings: ['Keine Daten in der CSV-Datei gefunden.'], totalBuyTransactions: 0, totalSellTransactions: 0 };
  }
  
  // Map headers to known columns
  const columnMapping: Record<string, string> = {}; // csvHeader → columnType
  for (const header of headers) {
    const match = matchColumn(header);
    if (match) {
      columnMapping[header] = match;
    }
  }
  
  // Find which header maps to which type
  const reverseMap: Record<string, string> = {}; // columnType → csvHeader
  for (const [csvHeader, colType] of Object.entries(columnMapping)) {
    reverseMap[colType] = csvHeader;
  }
  
  // Check if we have minimum required columns
  const hasName = !!reverseMap.name;
  const hasQuantity = !!reverseMap.quantity;
  const hasTotal = !!reverseMap.total;
  
  if (!hasName && !reverseMap.isin) {
    warnings.push('Keine Spalte für Name oder ISIN erkannt. Erkannte Spalten: ' + headers.join(', '));
    return { positions: [], skipped: [], warnings, totalBuyTransactions: 0, totalSellTransactions: 0 };
  }
  
  if (!hasQuantity && !hasTotal) {
    warnings.push('Keine Spalte für Anzahl oder Betrag erkannt.');
    return { positions: [], skipped: [], warnings, totalBuyTransactions: 0, totalSellTransactions: 0 };
  }
  
  // Parse transactions
  const transactions: ParsedTransaction[] = [];
  const skipped: ParsedTransaction[] = [];
  
  for (const row of rows) {
    const getValue = (colType: string): string => {
      const header = reverseMap[colType];
      return header ? (row[header] || '') : '';
    };
    
    const name = getValue('name') || getValue('isin') || 'Unbekannt';
    const isin = getValue('isin') || undefined;
    const symbol = getValue('symbol') || undefined;
    const quantity = parseNumber(getValue('quantity'));
    const price = parseNumber(getValue('price'));
    const total = parseNumber(getValue('total'));
    const typeStr = getValue('type');
    const type = typeStr ? detectTransactionType(typeStr) : 'buy'; // Default to buy
    const date = getValue('date') || undefined;
    const currency = getValue('currency') || 'EUR';
    
    // Calculate missing values
    const effectivePrice = price > 0 ? price : (quantity > 0 ? Math.abs(total) / quantity : 0);
    const effectiveTotal = total !== 0 ? Math.abs(total) : (quantity * effectivePrice);
    const effectiveQuantity = quantity > 0 ? quantity : (effectivePrice > 0 ? Math.abs(total) / effectivePrice : 0);
    
    const transaction: ParsedTransaction = {
      date,
      type,
      isin,
      symbol,
      name,
      quantity: effectiveQuantity,
      price: effectivePrice,
      totalAmount: effectiveTotal,
      currency,
      raw: row,
    };
    
    if (effectiveQuantity <= 0 && type !== 'dividend') {
      skipped.push(transaction);
    } else {
      transactions.push(transaction);
    }
  }
  
  // Aggregate buy/sell transactions into positions
  const positionMap = new Map<string, AggregatedPosition>();
  let totalBuy = 0;
  let totalSell = 0;
  
  for (const tx of transactions) {
    if (tx.type === 'dividend') continue; // Skip dividends for positions
    
    const key = tx.isin || tx.name; // Group by ISIN or name
    
    if (!positionMap.has(key)) {
      positionMap.set(key, {
        isin: tx.isin,
        symbol: tx.symbol,
        name: tx.name,
        quantity: 0,
        averageBuyPrice: 0,
        totalInvested: 0,
        currency: tx.currency,
        transactions: [],
      });
    }
    
    const pos = positionMap.get(key)!;
    pos.transactions.push(tx);
    
    if (tx.type === 'buy') {
      totalBuy++;
      const newQty = pos.quantity + tx.quantity;
      pos.averageBuyPrice = (pos.averageBuyPrice * pos.quantity + tx.price * tx.quantity) / newQty;
      pos.quantity = newQty;
      pos.totalInvested += tx.totalAmount;
    } else if (tx.type === 'sell') {
      totalSell++;
      pos.quantity -= tx.quantity;
      if (pos.quantity < 0) pos.quantity = 0;
    }
  }
  
  // Filter out positions with 0 or negative quantity (fully sold)
  const positions = Array.from(positionMap.values()).filter(p => p.quantity > 0);
  const soldOut = Array.from(positionMap.values()).filter(p => p.quantity <= 0);
  
  if (soldOut.length > 0) {
    warnings.push(`${soldOut.length} komplett verkaufte Position(en) übersprungen.`);
  }
  
  return { positions, skipped, warnings, totalBuyTransactions: totalBuy, totalSellTransactions: totalSell };
}

// Convert aggregated positions to UserPositions for the Store
export function toUserPositions(aggregated: AggregatedPosition[]): UserPosition[] {
  return aggregated.map((pos, idx) => ({
    id: `import-${Date.now()}-${idx}`,
    symbol: pos.symbol || pos.isin || pos.name.substring(0, 10).toUpperCase(),
    isin: pos.isin,
    name: pos.name,
    quantity: Math.round(pos.quantity * 10000) / 10000, // 4 decimal precision
    buyPrice: Math.round(pos.averageBuyPrice * 100) / 100,
    currentPrice: Math.round(pos.averageBuyPrice * 100) / 100, // Will be updated via Yahoo later
    currency: pos.currency || 'EUR',
    useYahooPrice: true, // Auto-update prices
  }));
}

// Detect if the text content looks like it was extracted from a Trade Republic PDF
export function detectTradeRepublicFormat(content: string): boolean {
  const trKeywords = ['trade republic', 'TRADE REPUBLIC', 'Trade Republic Bank'];
  return trKeywords.some(kw => content.toLowerCase().includes(kw.toLowerCase()));
}
