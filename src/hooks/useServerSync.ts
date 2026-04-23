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
} from '../services/syncService';

function toTimestamp(value?: string | null): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function useServerSync() {
  const [serverConnected, setServerConnected] = useState(false);
  const [serverInfo, setServerInfo] = useState<any>(null);
  const skipNextPushRef = useRef(false);

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
          skipNextPushRef.current = true;
          useAppStore.setState({
            ...mergedState,
            // don't overwrite UI state
            isLoading: useAppStore.getState().isLoading,
            isAnalyzing: useAppStore.getState().isAnalyzing,
            error: useAppStore.getState().error,
          });
          console.log('[ServerSync] ⚠️ Conflict resolved – using merged state');
        });

        // Start state sync: If server has a newer state, use it
        cleanup = startSync((serverState) => {
          if (!serverState) return;

          // Compare timestamps to decide who is more current
          const currentState = useAppStore.getState();
          
          // Server autopilot state takes precedence (it runs the cycles)
          const serverLastRun = serverState.autopilotState?.lastRunAt;
          const localLastRun = currentState.autopilotState?.lastRunAt;
          
          if (serverLastRun && (!localLastRun || new Date(serverLastRun) > new Date(localLastRun))) {
            // Server has newer autopilot data → merge
            skipNextPushRef.current = true; // Prevent push loop
            
            useAppStore.setState({
              autopilotState: serverState.autopilotState,
              autopilotLog: serverState.autopilotLog,
              orders: serverState.orders,
              userPositions: serverState.userPositions,
              cashBalance: serverState.cashBalance,
              signals: serverState.signals,
              lastAnalysis: serverState.lastAnalysis,
              lastAnalysisDate: serverState.lastAnalysisDate,
              analysisHistory: serverState.analysisHistory,
            });
            
            console.log('[ServerSync] Adopted state from server (newer autopilot data)');
          }
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
                ...pushResult.mergedState,
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
            useAppStore.setState({
              ...serverData.state,
              isLoading: currentState.isLoading,
              isAnalyzing: currentState.isAnalyzing,
              error: currentState.error,
            });
            console.log('[ServerSync] Initial state loaded from server (server takes precedence) ✅');
          }
        } else if (localHasData) {
          // Server leer → lokalen State pushen
          const pushResult = await pushState(extractSyncState(currentState));

          if (pushResult.ok && pushResult.conflict && pushResult.mergedState) {
            skipNextPushRef.current = true;
            useAppStore.setState({
              ...pushResult.mergedState,
              isLoading: currentState.isLoading,
              isAnalyzing: currentState.isAnalyzing,
              error: currentState.error,
            });
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
      setOnConflictCallback(() => {});
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
    orderSettings: state.orderSettings,
    lastAnalysis: state.lastAnalysis,
    lastAnalysisDate: state.lastAnalysisDate,
    analysisHistory: state.analysisHistory,
    autopilotSettings: state.autopilotSettings,
    autopilotLog: state.autopilotLog,
    autopilotState: state.autopilotState,
    portfolios: state.portfolios,
    activePortfolioId: state.activePortfolioId,
    priceAlerts: state.priceAlerts,
  };
}
