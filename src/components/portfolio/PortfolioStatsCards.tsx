import { useState } from 'react';
import {
  Wallet,
  Briefcase,
  DollarSign,
  PieChart as PieChartIcon,
  TrendingUp,
  TrendingDown,
  Edit3,
  Check,
} from 'lucide-react';

interface PortfolioStatsCardsProps {
  cashBalance: number;
  userPositionsCount: number;
  totalInvested: number;
  totalCurrentValue: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  getAvailableCash: () => { currentCash: number; reservedCash: number; availableCash: number };
  setCashBalance: (n: number) => void;
}

export function PortfolioStatsCards({
  cashBalance,
  userPositionsCount,
  totalInvested,
  totalCurrentValue,
  totalProfitLoss,
  totalProfitLossPercent,
  getAvailableCash,
  setCashBalance,
}: PortfolioStatsCardsProps) {
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState('');

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
      {/* Cash Balance Card */}
      <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-6 border border-[#252542] col-span-2 md:col-span-1">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2 md:p-3 bg-yellow-500/20 rounded-lg">
            <Wallet size={20} className="text-yellow-500 md:w-6 md:h-6" />
          </div>
          <div className="flex-1">
            <p className="text-gray-400 text-xs md:text-sm">Verfügbares Cash</p>
            {editingCash ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  className="w-24 px-2 py-1 bg-[#252542] border border-[#3a3a5c] rounded text-white text-lg"
                  autoFocus
                />
                <button
                  onClick={() => {
                    setCashBalance(parseFloat(cashInput) || 0);
                    setEditingCash(false);
                  }}
                  className="p-1 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500"
                >
                  <Check size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-lg md:text-2xl font-bold text-yellow-500">
                    {cashBalance.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                  </p>
                  {(() => {
                    const { reservedCash, availableCash } = getAvailableCash();
                    if (reservedCash > 0) {
                      return (
                        <p className="text-xs text-orange-400 mt-0.5">
                          davon {reservedCash.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € reserviert
                          <span className="text-gray-500"> → frei: {availableCash.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span>
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
                <button
                  onClick={() => {
                    setCashInput(cashBalance.toString());
                    setEditingCash(true);
                  }}
                  className="p-1 hover:bg-[#252542] rounded text-gray-400 hover:text-white"
                >
                  <Edit3 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-6 border border-[#252542]">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2 md:p-3 bg-indigo-500/20 rounded-lg">
            <Briefcase size={20} className="text-indigo-500 md:w-6 md:h-6" />
          </div>
          <div>
            <p className="text-gray-400 text-xs md:text-sm">Positionen</p>
            <p className="text-lg md:text-2xl font-bold text-white">{userPositionsCount}</p>
          </div>
        </div>
      </div>

      <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-6 border border-[#252542]">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2 md:p-3 bg-blue-500/20 rounded-lg">
            <DollarSign size={20} className="text-blue-500 md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-gray-400 text-xs md:text-sm">Investiert</p>
            <p className="text-lg md:text-2xl font-bold text-white truncate">
              {totalInvested.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[#1a1a2e] rounded-xl p-3 md:p-6 border border-[#252542]">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2 md:p-3 bg-purple-500/20 rounded-lg">
            <PieChartIcon size={20} className="text-purple-500 md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-gray-400 text-xs md:text-sm">Aktueller Wert</p>
            <p className="text-lg md:text-2xl font-bold text-white truncate">
              {totalCurrentValue.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
            </p>
          </div>
        </div>
      </div>

      <div className={`rounded-xl p-3 md:p-6 border col-span-2 md:col-span-1 ${
        totalProfitLoss >= 0
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-red-500/10 border-red-500/30'
      }`}>
        <div className="flex items-center gap-3 md:gap-4">
          <div className={`p-2 md:p-3 rounded-lg ${
            totalProfitLoss >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'
          }`}>
            {totalProfitLoss >= 0 ? (
              <TrendingUp size={24} className="text-green-500" />
            ) : (
              <TrendingDown size={24} className="text-red-500" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-gray-400 text-xs md:text-sm">Gewinn/Verlust</p>
            <p className={`text-lg md:text-2xl font-bold ${
              totalProfitLoss >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {totalProfitLoss >= 0 ? '+' : ''}{totalProfitLoss.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              <span className="text-xs md:text-sm ml-1 md:ml-2">
                ({totalProfitLossPercent >= 0 ? '+' : ''}{totalProfitLossPercent.toFixed(2)}%)
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
