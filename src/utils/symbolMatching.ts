export function normalizeSymbolBase(symbol: string): string {
  return symbol.trim().toUpperCase().split('.')[0];
}

export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function hasExchangeSuffix(symbol: string): boolean {
  return normalizeSymbol(symbol).includes('.');
}

export function symbolsReferToSameInstrument(left: string, right: string): boolean {
  const leftSymbol = normalizeSymbol(left);
  const rightSymbol = normalizeSymbol(right);

  if (!leftSymbol || !rightSymbol) return false;
  if (leftSymbol === rightSymbol) return true;
  if (normalizeSymbolBase(leftSymbol) !== normalizeSymbolBase(rightSymbol)) return false;

  return !hasExchangeSuffix(leftSymbol) || !hasExchangeSuffix(rightSymbol);
}

export function findExactSymbolMatch<T>(
  symbol: string,
  items: T[],
  getSymbol: (item: T) => string
): T | undefined {
  const target = normalizeSymbol(symbol);
  return items.find((item) => normalizeSymbol(getSymbol(item)) === target);
}

export function findCompatibleSymbolMatch<T>(
  symbol: string,
  items: T[],
  getSymbol: (item: T) => string
): T | undefined {
  const exactMatch = findExactSymbolMatch(symbol, items, getSymbol);
  if (exactMatch) return exactMatch;

  if (hasExchangeSuffix(symbol)) {
    return undefined;
  }

  const compatibleMatches = items.filter((item) =>
    symbolsReferToSameInstrument(symbol, getSymbol(item))
  );

  return compatibleMatches.length === 1 ? compatibleMatches[0] : undefined;
}

export function sumByEquivalentSymbol<T>(
  symbol: string,
  items: T[],
  getSymbol: (item: T) => string,
  getAmount: (item: T) => number
): number {
  return items.reduce((sum, item) => {
    if (!symbolsReferToSameInstrument(symbol, getSymbol(item))) {
      return sum;
    }
    return sum + getAmount(item);
  }, 0);
}