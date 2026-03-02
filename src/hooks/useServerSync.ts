/**
 * Hook für die Synchronisation mit dem Backend-Server.
 * 
 * - Beim Laden: Prüft ob Server verfügbar ist
 * - Pusht State-Änderungen zum Server (debounced)
 * - Holt periodisch State vom Server (falls Server Autopilot/Orders ausgeführt hat)
 */

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { 
  startSync, 
  checkServerStatus, 
  pushState, 
  debouncedPushState 
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

        // Initialer Push: Aktuellen State zum Server schicken
        const currentState = useAppStore.getState();
        pushStateToServer(currentState);
      }
    };

    init();

    return () => {
      if (cleanup) cleanup();
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

function pushStateToServer(state: any) {
  pushState(extractSyncState(state)).then(ok => {
    if (ok) console.log('[ServerSync] Initialer State-Push erfolgreich ✅');
  });
}
