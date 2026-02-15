import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { runAutopilotCycle } from '../services/autopilotService';

/**
 * Hook für den Autopilot-Timer.
 * Startet/stoppt den Interval basierend auf den Autopilot-Settings.
 */
export function useAutopilot() {
  const { 
    autopilotSettings,
    autopilotState,
    updateAutopilotState,
    addAutopilotLog,
  } = useAppStore();
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRunningRef = useRef(false);

  const startCycle = useCallback(async () => {
    // Verhindere parallele Zyklen
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    
    try {
      await runAutopilotCycle();
    } finally {
      isRunningRef.current = false;
      
      // Nächsten Lauf berechnen
      const store = useAppStore.getState();
      if (store.autopilotSettings.enabled) {
        const nextRun = new Date(Date.now() + store.autopilotSettings.intervalMinutes * 60 * 1000);
        updateAutopilotState({ nextRunAt: nextRun.toISOString() });
      }
    }
  }, [updateAutopilotState]);

  // Manuellen Zyklus auslösen
  const triggerManualCycle = useCallback(async () => {
    if (isRunningRef.current) return;
    
    addAutopilotLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'info',
      message: '🔧 Manueller Zyklus gestartet',
    });
    
    await startCycle();
  }, [startCycle, addAutopilotLog]);

  // Timer starten/stoppen
  useEffect(() => {
    if (!autopilotSettings.enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      updateAutopilotState({ isRunning: false, nextRunAt: null });
      return;
    }

    // Initialer Lauf nach 5 Sekunden (nicht sofort, damit UI sich aufbaut)
    const initialTimeout = setTimeout(() => {
      startCycle();
    }, 5000);

    // Regelmäßiger Interval
    const intervalMs = autopilotSettings.intervalMinutes * 60 * 1000;
    intervalRef.current = setInterval(startCycle, intervalMs);
    
    // Nächsten Lauf anzeigen
    const nextRun = new Date(Date.now() + 5000); // Erster Lauf in 5s
    updateAutopilotState({ nextRunAt: nextRun.toISOString() });

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autopilotSettings.enabled, autopilotSettings.intervalMinutes, startCycle, updateAutopilotState]);

  return { 
    triggerManualCycle,
    isRunning: autopilotState.isRunning,
  };
}
