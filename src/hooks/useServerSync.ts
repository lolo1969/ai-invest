/**
 * Hook für die Synchronisation mit dem Backend-Server.
 * 
 * - Beim Laden: Prüft ob Server verfügbar ist
 * - Pusht State-Änderungen zum Server (debounced, mit Versionsnummer)
 * - Holt periodisch State vom Server (falls Server Autopilot/Orders ausgeführt hat)
 * - Conflict Resolution: Bei Konflikten wird der gemergte Server-State übernommen
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

export function useServerSync() {
  const [serverConnected, setServerConnected] = useState(false);
  const [serverInfo, setServerInfo] = useState<any>(null);
  const skipNextPushRef = useRef(false);

  // Initial: Server checken und Sync starten
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const init = async () => {
      const status = await checkServerStatus();
      setServerConnected(status.running);
      setServerInfo(status);

      if (status.running) {
        // Conflict-Callback registrieren: Wenn ein Push einen Konflikt erzeugt,
        // übernehmen wir den Server-gemergten State
        setOnConflictCallback((mergedState) => {
          skipNextPushRef.current = true;
          useAppStore.setState({
            ...mergedState,
            // UI-State nicht überschreiben
            isLoading: useAppStore.getState().isLoading,
            isAnalyzing: useAppStore.getState().isAnalyzing,
            error: useAppStore.getState().error,
          });
          console.log('[ServerSync] ⚠️ Konflikt aufgelöst – gemergten State übernommen');
        });

        // State-Sync starten: Wenn Server einen neueren State hat, übernehmen
        cleanup = startSync((serverState) => {
          if (!serverState) return;

          // Vergleiche Timestamps um zu entscheiden wer aktueller ist
          const currentState = useAppStore.getState();
          
          // Autopilot-State vom Server hat Vorrang (er führt die Zyklen aus)
          const serverLastRun = serverState.autopilotState?.lastRunAt;
          const localLastRun = currentState.autopilotState?.lastRunAt;
          
          if (serverLastRun && (!localLastRun || new Date(serverLastRun) > new Date(localLastRun))) {
            // Server hat neuere Autopilot-Daten → mergen
            skipNextPushRef.current = true; // Verhindere Push-Schleife
            
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
            
            console.log('[ServerSync] State vom Server übernommen (neuere Autopilot-Daten)');
          }
        });

        // Initialer Sync:
        // 1) Immer zuerst Server-State laden
        // 2) Wenn Server Daten hat, Server als Source of Truth verwenden
        // 3) Nur wenn Server leer ist, lokalen State initial pushen
        // Dadurch wird verhindert, dass ein frisch eingespieltes Server-Backup
        // beim Reload durch alten lokalen State überschrieben wird.
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
          skipNextPushRef.current = true;
          useAppStore.setState({
            ...serverData.state,
            isLoading: currentState.isLoading,
            isAnalyzing: currentState.isAnalyzing,
            error: currentState.error,
          });
          console.log('[ServerSync] Initialer State vom Server geladen (Server hat Vorrang) ✅');
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
            console.log('[ServerSync] Initialer Merge – gemergten State übernommen ✅');
          } else if (pushResult.ok) {
            console.log('[ServerSync] Initialer State-Push erfolgreich ✅');
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

  // State-Änderungen zum Server pushen (subscribe auf Store)
  useEffect(() => {
    if (!serverConnected) return;

    const unsubscribe = useAppStore.subscribe((state) => {
      // Skip um Push-Schleifen zu vermeiden
      if (skipNextPushRef.current) {
        skipNextPushRef.current = false;
        return;
      }
      
      debouncedPushState(extractSyncState(state));
    });

    return unsubscribe;
  }, [serverConnected]);

  // Periodisch Server-Status prüfen
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
 * Extrahiert die sync-relevanten Felder aus dem Store-State
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
