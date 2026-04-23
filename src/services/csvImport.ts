import type { TaxTransaction, TradeHistoryEntry, UserPosition } from '../types';

// Parsed row from CSV
export interface ParsedTransaction {
  date?: string;
  type?: 'buy' | 'sell' | 'dividend' | 'interest' | 'cash-in' | 'cash-out' | 'other' | 'unknown';
  isin?: string;
  symbol?: string;
  name: string;
  quantity: number;
  price: number;
  totalAmount: number;
  fees: number;
  withholdingTax: number; // Withholding tax (e.g., for dividends)
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
  mode: 'positions' | 'transactions' | 'unsupported';
  positions: AggregatedPosition[];
  tradeHistory: TradeHistoryEntry[];
  taxTransactions: TaxTransaction[];
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
  fees: ['gebühr', 'gebuehr', 'gebühren', 'gebuehren', 'fee', 'fees', 'kosten', 'spesen'],
  tax: ['steuer', 'tax', 'quellensteuer', 'withholding', 'kapitalertragsteuer'],
  type: ['typ', 'type', 'art', 'transaktion', 'transaktionstyp', 'aktion', 'order', 'seite', 'side'],
  date: ['datum', 'date', 'zeit', 'zeitpunkt', 'buchungsdatum', 'ausführungsdatum', 'valuta', 'datetime'],
  currency: ['währung', 'waehrung', 'currency', 'cur'],
  symbol: ['symbol', 'ticker', 'kürzel', 'kuerzel'],
};

interface PositionLot {
  quantity: number;
  buyPrice: number;
  buyDate?: string;
}

function looksLikeIsin(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/i.test(value.trim());
}

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
  if (['kauf', 'buy', 'kauforder', 'market_buy', 'limit_buy', 'buy order', 'sparplan', 'sparplanausführung'].some(k => lower.includes(k))) return 'buy';
  if (['verkauf', 'sell', 'verkaufsorder', 'market_sell', 'limit_sell', 'sell order', 'stop sell', 'stop-loss'].some(k => lower.includes(k))) return 'sell';
  if (['dividende', 'dividend', 'ausschüttung', 'ausschuettung', 'dividend_payment'].some(k => lower.includes(k))) return 'dividend';
  if (['zinsen', 'interest', '2 % p.a.', '2% p.a.', 'interest_payment'].some(k => lower.includes(k))) return 'interest';
  if (['einzahlung', 'cash in', 'completed', 'transfer_inbound', 'transfer_instant_inbound', 'customer_inpayment'].some(k => lower.includes(k))) return 'cash-in';
  if (['auszahlung', 'sent', 'cash out', 'transfer_outbound', 'transfer_instant_outbound'].some(k => lower.includes(k))) return 'cash-out';
  if (['sonstiges', 'card_transaction', 'card_ordering_fee'].some(k => lower.includes(k))) return 'other';
  return 'unknown';
}

function parseDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const isoDate = new Date(trimmed);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate.toISOString();
  }

  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!match) return undefined;

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const hour = Number(match[4] || 12);
  const minute = Number(match[5] || 0);
  const date = new Date(year, month, day, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// Match CSV header to known column type
function matchColumn(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  for (const [key, aliases] of Object.entries(COLUMN_MAPS)) {
    if (aliases.some(alias => normalized === alias)) {
      return key;
    }
  }
  return null;
}

function parseDelimitedLine(line: string, separator: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === separator && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

// Parse CSV content into rows
function parseCSVRows(content: string, separator: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };
  
  const headers = parseDelimitedLine(lines[0], separator).map(h => h.replace(/^["']|["']$/g, '').trim());
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseDelimitedLine(lines[i], separator).map(v => v.replace(/^["']|["']$/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return { headers, rows };
}

function getTransactionKey(tx: ParsedTransaction): string {
  return [tx.isin || '', tx.symbol || '', tx.name.toUpperCase()].filter(Boolean).join('|');
}

function buildTradeHistory(transactions: ParsedTransaction[]): TradeHistoryEntry[] {
  return transactions
    .filter((tx) => (tx.type === 'buy' || tx.type === 'sell') && tx.quantity > 0 && tx.price > 0)
    .map((tx) => ({
      id: crypto.randomUUID(),
      type: tx.type as 'buy' | 'sell',
      symbol: tx.symbol || tx.isin || tx.name.substring(0, 10).toUpperCase(),
      name: tx.name,
      quantity: Math.round(tx.quantity * 10000) / 10000,
      price: Math.round(tx.price * 100) / 100,
      totalAmount: Math.round(tx.totalAmount * 100) / 100,
      fees: Math.round(tx.fees * 100) / 100,
      date: tx.date || new Date().toISOString(),
      source: 'manual' as const,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function buildTaxTransactions(transactions: ParsedTransaction[], warnings: string[]): TaxTransaction[] {
  const lotsByKey = new Map<string, PositionLot[]>();
  const taxTransactions: TaxTransaction[] = [];

  const orderedTransactions = [...transactions]
    .filter((tx) => (tx.type === 'buy' || tx.type === 'sell') && tx.quantity > 0 && tx.price > 0)
    .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

  for (const tx of orderedTransactions) {
    const key = getTransactionKey(tx);
    if (!key) continue;

    if (tx.type === 'buy') {
      const lots = lotsByKey.get(key) || [];
      lots.push({
        quantity: tx.quantity,
        buyPrice: tx.price,
        buyDate: tx.date,
      });
      lotsByKey.set(key, lots);
      continue;
    }

    let remainingQuantity = tx.quantity;
    const lots = lotsByKey.get(key) || [];
    const initialQuantity = tx.quantity;

    while (remainingQuantity > 0.0000001 && lots.length > 0) {
      const lot = lots[0];
      const matchedQuantity = Math.min(lot.quantity, remainingQuantity);
      const sellDate = tx.date ? new Date(tx.date) : new Date();
      const buyDate = lot.buyDate ? new Date(lot.buyDate) : sellDate;
      const holdingDays = Math.max(0, Math.floor((sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24)));
      const allocatedFees = initialQuantity > 0 ? tx.fees * (matchedQuantity / initialQuantity) : 0;
      const gainLoss = (tx.price - lot.buyPrice) * matchedQuantity - allocatedFees;

      taxTransactions.push({
        id: crypto.randomUUID(),
        symbol: tx.symbol || tx.isin || tx.name.substring(0, 10).toUpperCase(),
        name: tx.name,
        quantity: Math.round(matchedQuantity * 10000) / 10000,
        buyPrice: Math.round(lot.buyPrice * 100) / 100,
        sellPrice: Math.round(tx.price * 100) / 100,
        buyDate: buyDate.toISOString(),
        sellDate: sellDate.toISOString(),
        gainLoss: Math.round(gainLoss * 100) / 100,
        fees: Math.round(allocatedFees * 100) / 100,
        holdingDays,
        taxFree: holdingDays >= 183,
      });

      lot.quantity -= matchedQuantity;
      remainingQuantity -= matchedQuantity;
      if (lot.quantity <= 0.0000001) {
        lots.shift();
      }
    }

    if (remainingQuantity > 0.0000001) {
      warnings.push(`Sale without sufficient purchase stock for ${tx.name} (${remainingQuantity.toFixed(4)} units) could not be completely assigned for tax purposes.`);
    }
  }

  // Dividends: always taxable (Luxembourg: progressive rate)
  for (const tx of transactions.filter((t) => t.type === 'dividend')) {
    if (tx.totalAmount <= 0) continue;
    taxTransactions.push({
      id: crypto.randomUUID(),
      symbol: tx.symbol || tx.isin || tx.name.substring(0, 10).toUpperCase(),
      name: tx.name,
      transactionType: 'dividend',
      quantity: Math.round(tx.quantity * 10000) / 10000,
      buyPrice: 0,
      sellPrice: 0,
      buyDate: tx.date || new Date().toISOString(),
      sellDate: tx.date || new Date().toISOString(),
      gainLoss: Math.round(tx.totalAmount * 100) / 100,
      fees: 0,
      holdingDays: 0,
      taxFree: false,
      withholdingTax: Math.round(tx.withholdingTax * 100) / 100,
    });
  }

  // Interest: taxable (Luxembourg: withholding tax 20% or progressive)
  for (const tx of transactions.filter((t) => t.type === 'interest')) {
    if (tx.totalAmount <= 0) continue;
    taxTransactions.push({
      id: crypto.randomUUID(),
      symbol: 'INTEREST',
      name: tx.name || 'Interest payment',
      transactionType: 'interest',
      quantity: 1,
      buyPrice: 0,
      sellPrice: 0,
      buyDate: tx.date || new Date().toISOString(),
      sellDate: tx.date || new Date().toISOString(),
      gainLoss: Math.round(tx.totalAmount * 100) / 100,
      fees: 0,
      holdingDays: 0,
      taxFree: false,
      withholdingTax: Math.round(tx.withholdingTax * 100) / 100,
    });
  }

  return taxTransactions.sort((a, b) => new Date(b.sellDate).getTime() - new Date(a.sellDate).getTime());
}

interface PositionAccumulator {
  isin?: string;
  symbol?: string;
  name: string;
  currency: string;
  transactions: ParsedTransaction[];
  lots: PositionLot[];
}

function aggregateTransactionsToPositions(transactions: ParsedTransaction[], warnings: string[]): AggregatedPosition[] {
  const positionMap = new Map<string, PositionAccumulator>();

  // Sort chronologically so FIFO works correctly
  const ordered = [...transactions]
    .filter((tx) => (tx.type === 'buy' || tx.type === 'sell') && tx.quantity > 0)
    .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

  for (const tx of ordered) {
    const key = getTransactionKey(tx) || tx.name;
    if (!positionMap.has(key)) {
      positionMap.set(key, {
        isin: tx.isin,
        symbol: tx.symbol,
        name: tx.name,
        currency: tx.currency,
        transactions: [],
        lots: [],
      });
    }

    const pos = positionMap.get(key)!;
    pos.transactions.push(tx);

    if (tx.type === 'buy') {
      // Include fees in the per-share cost basis (matches Trade Republic FIFO method)
      const priceWithFees = tx.quantity > 0 ? (tx.totalAmount + tx.fees) / tx.quantity : tx.price;
      pos.lots.push({ quantity: tx.quantity, buyPrice: priceWithFees });
    } else {
      // FIFO: consume oldest lots first
      let remaining = tx.quantity;
      while (remaining > 0.0000001 && pos.lots.length > 0) {
        const lot = pos.lots[0];
        const matched = Math.min(lot.quantity, remaining);
        lot.quantity -= matched;
        remaining -= matched;
        if (lot.quantity <= 0.0000001) {
          pos.lots.shift();
        }
      }
    }
  }

  const results: AggregatedPosition[] = [];
  const soldOutCount = Array.from(positionMap.values()).filter(
    (p) => p.lots.reduce((s, l) => s + l.quantity, 0) <= 0.0000001,
  ).length;

  for (const pos of positionMap.values()) {
    const totalQty = pos.lots.reduce((s, l) => s + l.quantity, 0);
    if (totalQty <= 0.0000001) continue;

    const totalCost = pos.lots.reduce((s, l) => s + l.quantity * l.buyPrice, 0);
    const averageBuyPrice = totalQty > 0 ? totalCost / totalQty : 0;

    results.push({
      isin: pos.isin,
      symbol: pos.symbol,
      name: pos.name,
      quantity: Math.round(totalQty * 10000) / 10000,
      averageBuyPrice: Math.round(averageBuyPrice * 100) / 100,
      totalInvested: Math.round(totalCost * 100) / 100,
      currency: pos.currency,
      transactions: pos.transactions,
    });
  }

  if (soldOutCount > 0) {
    warnings.push(`${soldOutCount} completely sold position(s) will not be imported into the current portfolio.`);
  }

  return results;
}

export interface FeeOptions {
  transactionFeeFlat?: number;
  transactionFeePercent?: number;
}

// Compute effective fee for a trade: prefer CSV fee if present, otherwise use settings
function effectiveFee(csvFee: number, tradeValue: number, feeOptions?: FeeOptions): number {
  if (csvFee > 0) return csvFee;
  if (!feeOptions) return 0;
  const flat = feeOptions.transactionFeeFlat ?? 0;
  const percent = feeOptions.transactionFeePercent ?? 0;
  return flat + tradeValue * percent / 100;
}

// Main CSV parser
export function parseCSV(content: string, feeOptions?: FeeOptions): ImportResult {
  const warnings: string[] = [];
  const separator = detectSeparator(content);
  const { headers, rows } = parseCSVRows(content, separator);
  
  if (headers.length === 0 || rows.length === 0) {
    return { mode: 'unsupported', positions: [], tradeHistory: [], taxTransactions: [], skipped: [], warnings: ['No data found in the CSV file.'], totalBuyTransactions: 0, totalSellTransactions: 0 };
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
    warnings.push('No column for name or ISIN detected. Detected columns: ' + headers.join(', '));
    return { mode: 'unsupported', positions: [], tradeHistory: [], taxTransactions: [], skipped: [], warnings, totalBuyTransactions: 0, totalSellTransactions: 0 };
  }
  
  if (!hasQuantity && !hasTotal) {
    warnings.push('No column for quantity or amount detected.');
    return { mode: 'unsupported', positions: [], tradeHistory: [], taxTransactions: [], skipped: [], warnings, totalBuyTransactions: 0, totalSellTransactions: 0 };
  }

  const hasPrice = !!reverseMap.price;
  const hasType = !!reverseMap.type;
  const hasDate = !!reverseMap.date;
  const hasDetailedTransactionData = hasType && hasDate && hasQuantity && (hasPrice || hasTotal);
  const isPositionSnapshot = !hasType && hasQuantity && (hasPrice || hasTotal);
  const isAmountOnlyTransactionList = hasType && hasDate && !hasQuantity;
  
  // Parse transactions
  const transactions: ParsedTransaction[] = [];
  const skipped: ParsedTransaction[] = [];
  
  for (const row of rows) {
    const getValue = (colType: string): string => {
      const header = reverseMap[colType];
      return header ? (row[header] || '') : '';
    };
    
    const name = getValue('name') || getValue('isin') || 'Unknown';
    const rawIsin = getValue('isin');
    const rawSymbol = getValue('symbol');
    const isin = rawIsin || (looksLikeIsin(rawSymbol) ? rawSymbol : undefined);
    const symbol = rawSymbol && !looksLikeIsin(rawSymbol) ? rawSymbol : undefined;
    const quantity = parseNumber(getValue('quantity'));
    const price = parseNumber(getValue('price'));
    const total = parseNumber(getValue('total'));
    const fees = Math.abs(parseNumber(getValue('fees')));
    const withholdingTax = Math.abs(parseNumber(getValue('tax')));
    const typeStr = getValue('type');
    const type = typeStr ? detectTransactionType(typeStr) : 'buy';
    const date = parseDate(getValue('date'));
    const currency = getValue('currency') || 'EUR';
    
    // Calculate missing values
    const effectiveQuantity = Math.abs(quantity) > 0 ? Math.abs(quantity) : (price > 0 ? Math.abs(total) / price : 0);
    const rawPrice = price > 0 ? price : (effectiveQuantity > 0 ? Math.abs(total) / effectiveQuantity : 0);
    // Sanity-check: if price×qty deviates >5% from the authoritative total field, the price column is corrupted
    // (e.g. Trade Republic exports sometimes omit the decimal separator: 88.21 → 88210)
    const absTotal = Math.abs(total);
    const computedTotal = rawPrice * effectiveQuantity;
    const effectivePrice = (absTotal > 0 && computedTotal > 0 && Math.abs(computedTotal - absTotal) / absTotal > 0.05)
      ? absTotal / effectiveQuantity
      : rawPrice;
    const effectiveTotal = total !== 0 ? absTotal : (effectiveQuantity * effectivePrice);
    
    const transaction: ParsedTransaction = {
      date,
      type,
      isin,
      symbol,
      name,
      quantity: effectiveQuantity,
      price: effectivePrice,
      totalAmount: effectiveTotal,
      fees,
      withholdingTax,
      currency,
      raw: row,
    };
    
    if ((type === 'buy' || type === 'sell') && effectiveQuantity <= 0) {
      skipped.push(transaction);
    } else {
      transactions.push(transaction);
    }
  }

  if (isAmountOnlyTransactionList) {
    warnings.push('This CSV contains only total amounts without quantity/price. Neither current portfolio holdings nor tax transactions can be calculated correctly. Please use a detailed export file with date, type, quantity, and price.');
    return {
      mode: 'unsupported',
      positions: [],
      tradeHistory: [],
      taxTransactions: [],
      skipped,
      warnings,
      totalBuyTransactions: 0,
      totalSellTransactions: 0,
    };
  }

  if (isPositionSnapshot) {
    const buyLikeTransactions = transactions.map((tx) => ({
      ...tx,
      type: 'buy' as const,
    }));
    const positions = aggregateTransactionsToPositions(buyLikeTransactions, warnings);
    return {
      mode: 'positions',
      positions,
      tradeHistory: [],
      taxTransactions: [],
      skipped,
      warnings,
      totalBuyTransactions: 0,
      totalSellTransactions: 0,
    };
  }

  if (!hasDetailedTransactionData) {
    warnings.push('For complete trade/tax import, at least date, type, quantity, and price or total amount are required.');
    return {
      mode: 'unsupported',
      positions: [],
      tradeHistory: [],
      taxTransactions: [],
      skipped,
      warnings,
      totalBuyTransactions: 0,
      totalSellTransactions: 0,
    };
  }

  // Apply settings-based fee fallback to all trade transactions
  if (feeOptions && (feeOptions.transactionFeeFlat || feeOptions.transactionFeePercent)) {
    for (const tx of transactions) {
      if ((tx.type === 'buy' || tx.type === 'sell') && tx.fees === 0) {
        tx.fees = effectiveFee(0, tx.totalAmount, feeOptions);
      }
    }
  }

  const tradeTransactions = transactions.filter((tx) => tx.type === 'buy' || tx.type === 'sell');
  const totalBuy = tradeTransactions.filter((tx) => tx.type === 'buy').length;
  const totalSell = tradeTransactions.filter((tx) => tx.type === 'sell').length;
  const positions = aggregateTransactionsToPositions(transactions, warnings);
  const tradeHistory = buildTradeHistory(transactions);
  const taxTransactions = buildTaxTransactions(transactions, warnings);

  // Period exports often contain only recent sells (without historical buys in the same file).
  // In this case, detailed FIFO warnings are misleading for merge imports.
  if (totalBuy === 0 && totalSell > 0) {
    const filteredWarnings = warnings.filter((warning) => {
      const lower = warning.toLowerCase();
      return !lower.includes('completely sold position(s)') && !lower.includes('sale without sufficient purchase stock');
    });
    filteredWarnings.push('This file contains only sell transactions for the selected period. FIFO tax matching may require historical buy transactions from earlier exports.');
    warnings.length = 0;
    warnings.push(...filteredWarnings);
  }

  return {
    mode: 'transactions',
    positions,
    tradeHistory,
    taxTransactions,
    skipped,
    warnings,
    totalBuyTransactions: totalBuy,
    totalSellTransactions: totalSell,
  };
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
