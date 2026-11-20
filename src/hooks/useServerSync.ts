/**
 * Hook for synchronization with the backend server.
 * 
 * - On load: Checks if server is available
 * - Pushes state changes to server (debounced, with version number)
 * - Periodically fetches state from server (if server executed autopilot/orders)
 * - Conflict resolution: On conflicts, merged server state is used
 */

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { 
  startSync, 
  checkServerStatus, 
  pushState, 
  debouncedPushState,
  setOnConflictCallback,
  pullState,
  flushPendingState,
  getKnownServerVersion,
} from '../services/syncService';
import { mergeServerStateWithClientConfig } from '../services/serverSyncMerge';

function toTimestamp(value?: string | null): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function useServerSync() {
  const [serverConnected, setServerConnected] = useState(false);
  const [serverInfo, setServerInfo] = useState<any>(null);
  const skipNextPushRef = useRef(false);
  const appliedServerVersionRef = useRef(0);

  // Initial: Check server and start sync
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const init = async () => {
      const status = await checkServerStatus();
      setServerConnected(status.running);
      setServerInfo(status);

      if (status.running) {
        // Conflict-Callback registrieren: Wenn ein Push einen Konflikt erzeugt,
        // we use the server-merged state
        setOnConflictCallback((mergedState) => {
          const currentState = useAppStore.getState();
          const mergedTradeHistory = (mergedState?.tradeHistory?.length ?? 0) > 0
            ? mergedState.tradeHistory
            : currentState.tradeHistory;
          const mergedTaxTransactions = (mergedState?.taxTransactions?.length ?? 0) > 0
            ? mergedState.taxTransactions
            : currentState.taxTransactions;

          skipNextPushRef.current = true;
          useAppStore.setState({
            ...mergeServerStateWithClientConfig(mergedState, currentState),
            tradeHistory: mergedTradeHistory,
            taxTransactions: mergedTaxTransactions,
            // don't overwrite UI state
            isLoading: currentState.isLoading,
            isAnalyzing: currentState.isAnalyzing,
            error: currentState.error,
          });
          console.log('[ServerSync] ⚠️ Conflict resolved – using merged state');
        });

        // Start state sync: If server has a newer state, use it
        cleanup = startSync((serverState) => {
          if (!serverState) return;

          const currentState = useAppStore.getState();
          const serverVersion = getKnownServerVersion();

          if (serverVersion <= appliedServerVersionRef.current) {
            return;
          }

          skipNextPushRef.current = true;
          const localTradeHistory = currentState.tradeHistory || [];
          const localTaxTransactions = currentState.taxTransactions || [];
          const serverTradeHistory = serverState.tradeHistory || [];
          const serverTaxTransactions = serverState.taxTransactions || [];

          useAppStore.setState({
            autopilotState: serverState.autopilotState,
            autopilotLog: serverState.autopilotLog,
            orders: serverState.orders,
            deletedOrderIds: serverState.deletedOrderIds,
            userPositions: serverState.userPositions,
            cashBalance: serverState.cashBalance,
            signals: serverState.signals,
            tradeHistory: serverTradeHistory.length > 0 ? serverTradeHistory : localTradeHistory,
            taxTransactions: serverTaxTransactions.length > 0 ? serverTaxTransactions : localTaxTransactions,
            lastAnalysis: serverState.lastAnalysis,
            lastAnalysisDate: serverState.lastAnalysisDate,
            analysisHistory: serverState.analysisHistory,
          });
          appliedServerVersionRef.current = serverVersion;

          console.log('[ServerSync] Adopted state from server (newer version)');
        });

        // Initial sync:
        // 1) Always load server state first
        // 2) If server has data, use server as source of truth
        // 3) Only if server is empty, initially push local state
        // This prevents a freshly restored server backup
        // from being overwritten by old local state on reload.
        const currentState = useAppStore.getState();
        const localHasData = currentState.userPositions?.length > 0
          || currentState.cashBalance > 0
          || currentState.watchlist?.length > 0;

        const serverData = await pullState();
        const serverHasData = !!(serverData?.state && (
          serverData.state.userPositions?.length > 0
          || serverData.state.cashBalance > 0
          || serverData.state.watchlist?.length > 0
        ));

        if (serverHasData && serverData?.state) {
          const localAnalysisTs = toTimestamp(currentState.lastAnalysisDate);
          const serverAnalysisTs = toTimestamp(serverData.state.lastAnalysisDate);
          const shouldPreferLocal = localHasData && localAnalysisTs > serverAnalysisTs;

          if (shouldPreferLocal) {
            const pushResult = await pushState(extractSyncState(currentState));

            if (pushResult.ok && pushResult.conflict && pushResult.mergedState) {
              skipNextPushRef.current = true;
              useAppStore.setState({
                ...mergeServerStateWithClientConfig(pushResult.mergedState, currentState),
                isLoading: currentState.isLoading,
                isAnalyzing: currentState.isAnalyzing,
                error: currentState.error,
              });
              console.log('[ServerSync] Local analysis was newer – conflict merge adopted ✅');
            } else if (pushResult.ok) {
              console.log('[ServerSync] Local analysis was newer – pushed local state to server ✅');
            } else {
              // Fallback: keep local instead of falling back to older server data
              console.warn('[ServerSync] Local analysis was newer, push failed – local state remains active');
            }
          } else {
            skipNextPushRef.current = true;
            const mergedTradeHistory = (serverData.state.tradeHistory?.length ?? 0) > 0
              ? serverData.state.tradeHistory
              : currentState.tradeHistory;
            const mergedTaxTransactions = (serverData.state.taxTransactions?.length ?? 0) > 0
              ? serverData.state.taxTransactions
              : currentState.taxTransactions;
            const mergedInitialState = mergeServerStateWithClientConfig(serverData.state, currentState);

            const configPushResult = await pushState(extractSyncState(mergedInitialState));

            useAppStore.setState({
              ...(configPushResult.ok && configPushResult.mergedState
                ? mergeServerStateWithClientConfig(configPushResult.mergedState, currentState)
                : mergedInitialState),
              tradeHistory: mergedTradeHistory,
              taxTransactions: mergedTaxTransactions,
              isLoading: currentState.isLoading,
              isAnalyzing: currentState.isAnalyzing,
              error: currentState.error,
            });
            appliedServerVersionRef.current = configPushResult.stateVersion ?? serverData.stateVersion;
            console.log('[ServerSync] Initial server data merged; client configuration takes precedence ✅');
          }
        } else {
          // No portfolio data yet: synchronize the session configuration only.
          const pushResult = await pushState(extractSyncConfig(currentState));

          if (pushResult.ok && pushResult.conflict && pushResult.mergedState) {
            skipNextPushRef.current = true;
            useAppStore.setState({
              ...mergeServerStateWithClientConfig(pushResult.mergedState, currentState),
              isLoading: currentState.isLoading,
              isAnalyzing: currentState.isAnalyzing,
              error: currentState.error,
            });
            appliedServerVersionRef.current = pushResult.stateVersion ?? getKnownServerVersion();
            console.log('[ServerSync] Initial merge – merged state adopted ✅');
          } else if (pushResult.ok) {
            console.log('[ServerSync] Initial state push successful 🙋');
          }
        }
      }
    };

    init();

    // Bei Page-Unload: Pending State sofort flushen
    const handleUnload = () => flushPendingState();
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      if (cleanup) cleanup();
      setOnConflictCallback(null);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

  // Push state changes to server (subscribe to store)
  useEffect(() => {
    if (!serverConnected) return;

    const unsubscribe = useAppStore.subscribe((state) => {
      // Skip to avoid push loops
      if (skipNextPushRef.current) {
        skipNextPushRef.current = false;
        return;
      }
      
      debouncedPushState(extractSyncState(state));
    });

    return unsubscribe;
  }, [serverConnected]);

  // Periodically check server status
  useEffect(() => {
    const interval = setInterval(async () => {
      const status = await checkServerStatus();
      setServerConnected(status.running);
      setServerInfo(status);
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  return { serverConnected, serverInfo };
}

function extractSyncConfig(state: any) {
  return {
    settings: state.settings,
    orderSettings: state.orderSettings,
    autopilotSettings: state.autopilotSettings,
    alpacaSettings: state.alpacaSettings,
    portfolios: state.portfolios,
    activePortfolioId: state.activePortfolioId,
  };
}

/**
 * Extracts the sync-relevant fields from the store state
 */
function extractSyncState(state: any) {
  return {
    settings: state.settings,
    userPositions: state.userPositions,
    cashBalance: state.cashBalance,
    initialCapital: state.initialCapital,
    previousProfit: state.previousProfit,
    watchlist: state.watchlist,
    signals: state.signals,
    orders: state.orders,
    deletedOrderIds: state.deletedOrderIds,
    orderSettings: state.orderSettings,
    lastAnalysis: state.lastAnalysis,
    lastAnalysisDate: state.lastAnalysisDate,
    analysisHistory: state.analysisHistory,
    autopilotSettings: state.autopilotSettings,
    alpacaSettings: state.alpacaSettings,
    autopilotLog: state.autopilotLog,
    autopilotState: state.autopilotState,
    taxTransactions: state.taxTransactions,
    tradeHistory: state.tradeHistory,
    portfolios: state.portfolios,
    activePortfolioId: state.activePortfolioId,
    priceAlerts: state.priceAlerts,
  };
}
