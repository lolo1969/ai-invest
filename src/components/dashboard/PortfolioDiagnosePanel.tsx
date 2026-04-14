import type { UserPosition, Stock } from '../../types';

interface PortfolioDiagnosePanelProps {
  userPositions: UserPosition[];
  fetchedStocks: Stock[];
  cashBalance: number;
  totalInvested: number;
}

export function PortfolioDiagnosePanel({
  userPositions,
  fetchedStocks,
  cashBalance,
  totalInvested,
}: PortfolioDiagnosePanelProps) {
  const positionsDetail = userPositions
    .map(p => {
      const liveStock = fetchedStocks.find(s => s.symbol === p.symbol);
      const usedPrice = liveStock?.price && liveStock.price > 0 ? liveStock.price : p.currentPrice;
      const value = p.quantity * usedPrice;
      const priceSource = liveStock?.price && liveStock.price > 0 ? 'Yahoo' : 'Gespeichert';
      return { ...p, usedPrice, value, priceSource, livePrice: liveStock?.price || 0 };
    })
    .sort((a, b) => b.value - a.value);

  const total = positionsDetail.reduce((s, p) => s + p.value, 0);

  return (
    <details className="bg-[#1a1a2e] rounded-xl border border-[#252542] overflow-hidden">
      <summary className="px-6 py-3 cursor-pointer text-sm text-gray-400 hover:text-white transition-colors flex items-center justify-between">
        <span>🔍 Portfolio-Diagnose ({userPositions.length} Positionen)</span>
        <span className="text-white font-mono">
          {total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
        </span>
      </summary>
      <div className="px-6 pb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-[#252542]">
              <th className="pb-2">Symbol</th>
              <th className="pb-2">Name</th>
              <th className="pb-2 text-right">Stk</th>
              <th className="pb-2 text-right">Kauf €</th>
              <th className="pb-2 text-right">Aktuell €</th>
              <th className="pb-2 text-right">Quelle</th>
              <th className="pb-2 text-right">Wert €</th>
              <th className="pb-2 text-right">G/V €</th>
            </tr>
          </thead>
          <tbody>
            {positionsDetail.map(p => {
              const pnl = p.value - p.quantity * p.buyPrice;
              return (
                <tr key={p.id} className="border-b border-[#252542]/50 hover:bg-[#252542]/30">
                  <td className="py-1.5 font-mono text-indigo-400">{p.symbol}</td>
                  <td className="py-1.5 text-gray-300 truncate max-w-[150px]">{p.name}</td>
                  <td className="py-1.5 text-right text-gray-300">{p.quantity}</td>
                  <td className="py-1.5 text-right text-gray-400 font-mono">{p.buyPrice.toFixed(2)}</td>
                  <td className="py-1.5 text-right text-white font-mono">{p.usedPrice.toFixed(2)}</td>
                  <td
                    className={`py-1.5 text-right text-xs ${
                      p.priceSource === 'Yahoo' ? 'text-green-400' : 'text-orange-400'
                    }`}
                  >
                    {p.priceSource}
                  </td>
                  <td className="py-1.5 text-right text-white font-mono font-semibold">
                    {p.value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className={`py-1.5 text-right font-mono ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {pnl >= 0 ? '+' : ''}
                    {pnl.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#252542] font-semibold">
              <td colSpan={6} className="pt-2 text-gray-300">
                Summe Portfolio
              </td>
              <td className="pt-2 text-right text-white font-mono">
                {total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td
                className={`pt-2 text-right font-mono ${
                  total - totalInvested >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {total - totalInvested >= 0 ? '+' : ''}
                {(total - totalInvested).toLocaleString('de-DE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
            <tr>
              <td colSpan={6} className="pt-1 text-gray-500 text-xs">
                + Cash
              </td>
              <td className="pt-1 text-right text-gray-400 font-mono text-xs">
                {cashBalance.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={6} className="pt-1 text-indigo-400 font-semibold">
                = Gesamtvermögen
              </td>
              <td className="pt-1 text-right text-indigo-400 font-mono font-semibold">
                {(total + cashBalance).toLocaleString('de-DE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  );
}
