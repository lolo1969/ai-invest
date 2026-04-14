import { TrendingUp, TrendingDown, Wallet, Target } from 'lucide-react';
import { StatCard } from './StatCard';

interface DashboardStatsGridProps {
  totalAssets: number;
  cashBalance: number;
  portfolioValue: number;
  totalProfit: number;
  totalProfitPercent: number;
  buySignals: number;
  sellSignals: number;
  hasInitialCapital: boolean;
  hasPreviousProfit: boolean;
  previousProfit: number;
}

export function DashboardStatsGrid({
  totalAssets,
  cashBalance,
  portfolioValue,
  totalProfit,
  totalProfitPercent,
  buySignals,
  sellSignals,
  hasInitialCapital,
  hasPreviousProfit,
  previousProfit,
}: DashboardStatsGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
      <StatCard
        title="Gesamtvermögen"
        value={`${totalAssets.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
        icon={<Wallet size={24} />}
        color="indigo"
      />
      <StatCard
        title="Verfügbares Cash"
        value={`${cashBalance.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
        icon={<Wallet size={24} />}
        color="yellow"
      />
      <StatCard
        title="Portfolio-Wert"
        value={`${portfolioValue.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
        icon={<Target size={24} />}
        color="blue"
      />
      <StatCard
        title={hasInitialCapital ? 'Gesamtgewinn' : 'Unrealisierter Gewinn'}
        value={`${totalProfit >= 0 ? '+' : ''}${totalProfit.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €${hasInitialCapital ? ` (${totalProfitPercent >= 0 ? '+' : ''}${totalProfitPercent.toFixed(1)}%)` : ''}`}
        subtitle={
          hasPreviousProfit
            ? `Davon vorh. Portfolios: ${previousProfit >= 0 ? '+' : ''}${previousProfit.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
            : undefined
        }
        icon={totalProfit >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
        color={totalProfit >= 0 ? 'green' : 'red'}
      />
      <StatCard
        title="Kaufsignale"
        value={buySignals.toString()}
        icon={<TrendingUp size={24} />}
        color="green"
      />
      <StatCard
        title="Verkaufssignale"
        value={sellSignals.toString()}
        icon={<TrendingDown size={24} />}
        color="red"
      />
    </div>
  );
}
