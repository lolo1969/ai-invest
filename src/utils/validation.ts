// Validation utilities for user inputs

// Stock symbol validation (e.g., AAPL, MSFT, BRK.B)
export function isValidSymbol(symbol: string): boolean {
  if (!symbol || typeof symbol !== 'string') return false;
  const trimmed = symbol.trim().toUpperCase();
  // Allow 1-10 alphanumeric characters, optionally with a dot (e.g., BRK.B)
  return /^[A-Z0-9]{1,10}(\.[A-Z0-9]{1,5})?$/.test(trimmed);
}

// ISIN validation (12 characters: 2 letters + 9 alphanumeric + 1 check digit)
export function isValidISIN(isin: string): boolean {
  if (!isin || typeof isin !== 'string') return false;
  const trimmed = isin.trim().toUpperCase();
  // Basic format check
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(trimmed)) return false;
  
  // Checksum validation (Luhn algorithm)
  const converted = trimmed.split('').map(char => {
    const code = char.charCodeAt(0);
    return code >= 65 ? (code - 55).toString() : char;
  }).join('');
  
  let sum = 0;
  for (let i = converted.length - 1; i >= 0; i--) {
    let digit = parseInt(converted[i], 10);
    if ((converted.length - i) % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  
  return sum % 10 === 0;
}

// Price validation (positive number with up to 2 decimal places)
export function isValidPrice(price: string | number): boolean {
  if (typeof price === 'number') {
    return !isNaN(price) && price >= 0;
  }
  if (typeof price !== 'string' || !price.trim()) return false;
  const num = parseFloat(price.replace(',', '.'));
  return !isNaN(num) && num >= 0;
}

// Quantity validation (positive integer or decimal for fractional shares)
export function isValidQuantity(quantity: string | number): boolean {
  if (typeof quantity === 'number') {
    return !isNaN(quantity) && quantity > 0;
  }
  if (typeof quantity !== 'string' || !quantity.trim()) return false;
  const num = parseFloat(quantity.replace(',', '.'));
  return !isNaN(num) && num > 0;
}

// Email validation
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

// Telegram chat ID validation (numeric, can be negative for groups)
export function isValidTelegramChatId(chatId: string): boolean {
  if (!chatId || typeof chatId !== 'string') return false;
  return /^-?\d+$/.test(chatId.trim());
}

// API key validation (non-empty string with minimum length)
export function isValidAPIKey(key: string, minLength = 20): boolean {
  if (!key || typeof key !== 'string') return false;
  return key.trim().length >= minLength;
}

// Parse price string to number (handles both . and , as decimal separator)
export function parsePrice(price: string): number {
  if (!price) return 0;
  const normalized = price.trim().replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : Math.max(0, parsed);
}

// Parse quantity string to number
export function parseQuantity(quantity: string): number {
  if (!quantity) return 0;
  const normalized = quantity.trim().replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : Math.max(0, parsed);
}

// Format price for display
export function formatPrice(price: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

// Format percentage for display
export function formatPercent(percent: number): string {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

// Sanitize user input (remove potentially dangerous characters)
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove HTML brackets
    .slice(0, 1000); // Limit length
}

// Validation result type
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// Validate position form data
export function validatePositionForm(data: {
  symbol: string;
  isin?: string;
  name: string;
  quantity: string;
  buyPrice: string;
  currentPrice: string;
}): ValidationResult {
  if (!data.symbol && !data.isin) {
    return { isValid: false, error: 'Symbol oder ISIN ist erforderlich' };
  }

  if (data.symbol && !isValidSymbol(data.symbol)) {
    return { isValid: false, error: 'Ungültiges Symbol-Format' };
  }

  if (data.isin && !isValidISIN(data.isin)) {
    return { isValid: false, error: 'Ungültiges ISIN-Format' };
  }

  if (!isValidQuantity(data.quantity)) {
    return { isValid: false, error: 'Ungültige Anzahl (muss größer als 0 sein)' };
  }

  if (!isValidPrice(data.buyPrice)) {
    return { isValid: false, error: 'Ungültiger Kaufpreis' };
  }

  if (!isValidPrice(data.currentPrice)) {
    return { isValid: false, error: 'Ungültiger aktueller Preis' };
  }

  return { isValid: true };
}

// Validate price alert form data
export function validatePriceAlertForm(data: {
  symbol: string;
  targetPrice: string;
}): ValidationResult {
  if (!data.symbol || !isValidSymbol(data.symbol)) {
    return { isValid: false, error: 'Bitte wähle eine gültige Aktie' };
  }

  if (!isValidPrice(data.targetPrice) || parsePrice(data.targetPrice) <= 0) {
    return { isValid: false, error: 'Bitte gib einen gültigen Zielpreis ein' };
  }

  return { isValid: true };
}
