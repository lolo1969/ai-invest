import { useAppStore } from '../store/useAppStore';
import { useDashboardData } from './dashboard/useDashboardData';
import { useDashboardAnalysis } from './dashboard/useDashboardAnalysis';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { AnalysisSummaryCard } from './dashboard/AnalysisSummaryCard';
import { DashboardStatsGrid } from './dashboard/DashboardStatsGrid';
import { PortfolioDiagnosePanel } from './dashboard/PortfolioDiagnosePanel';
import { DashboardWatchlist } from './dashboard/DashboardWatchlist';
import { RecentSignalsPanel } from './dashboard/RecentSignalsPanel';

export function Dashboard() {
  const {
    cashBalance,
    initialCapital,
    previousProfit,
    userPositions,
    signals,
    dashboardAnalysisSummary,
    dashboardAnalysisDate,
    isDashboardAnalyzing,
  } = useAppStore();

  const { fetchedStocks, stocks, watchlistStocks, isLoading, isRefetching, refetch, activeApiKey, aiAnalysis } =
    useDashboardData();

  const { runAnalysis } = useDashboardAnalysis({ stocks, aiAnalysis, activeApiKey });

  // Signal counts
  const latestSignals = signals.slice(0, 5);
  const buySignals = signals.filter(s => s.signal === 'BUY').length;
  const sellSignals = signals.filter(s => s.signal === 'SELL').length;

  // Portfolio value calculations — with live Yahoo prices where available
  const portfolioValue = userPositions.reduce((sum, p) => {
    const liveStock = fetchedStocks.find(s => s.symbol === p.symbol);
    const currentPrice = liveStock?.price && liveStock.price > 0 ? liveStock.price : p.currentPrice;
    return sum + p.quantity * currentPrice;
  }, 0);
  const totalInvested = userPositions.reduce((sum, p) => sum + p.quantity * p.buyPrice, 0);
  const totalAssets = cashBalance + portfolioValue;
  const unrealizedProfit = portfolioValue - totalInvested;
  const prevProfit = previousProfit || 0;
  const currentProfit = (initialCapital || 0) > 0 ? totalAssets - (initialCapital || 0) : unrealizedProfit;
  const totalProfit = currentProfit + prevProfit;
  const totalProfitPercent = (initialCapital || 0) > 0 ? (totalProfit / (initialCapital || 1)) * 100 : 0;
  const hasInitialCapital = (initialCapital || 0) > 0;
  const hasPreviousProfit = prevProfit !== 0;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <DashboardHeader
        onRefetch={() => refetch()}
        onRunAnalysis={runAnalysis}
        isRefetching={isRefetching}
        isDashboardAnalyzing={isDashboardAnalyzing}
        isLoading={isLoading}
      />

      <AnalysisSummaryCard summary={dashboardAnalysisSummary} date={dashboardAnalysisDate} />

      <DashboardStatsGrid
        totalAssets={totalAssets}
        cashBalance={cashBalance}
        portfolioValue={portfolioValue}
        totalProfit={totalProfit}
        totalProfitPercent={totalProfitPercent}
        buySignals={buySignals}
        sellSignals={sellSignals}
        hasInitialCapital={hasInitialCapital}
        hasPreviousProfit={hasPreviousProfit}
        previousProfit={prevProfit}
      />

      <PortfolioDiagnosePanel
        userPositions={userPositions}
        fetchedStocks={fetchedStocks}
        cashBalance={cashBalance}
        totalInvested={totalInvested}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <DashboardWatchlist watchlistStocks={watchlistStocks} isLoading={isLoading} />
        <RecentSignalsPanel signals={latestSignals} />
      </div>
    </div>
  );
}
