import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { runAutopilotCycle } from '../services/autopilotService';

/**
 * Hook für den Autopilot-Timer.
 * Startet/stoppt den Interval basierend auf den Autopilot-Settings.
 * Wird in App.tsx verwendet, damit er persistent läuft (nicht bei Navigation neu startet).
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
  const hasRunInitial = useRef(false);

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
      hasRunInitial.current = false;
      updateAutopilotState({ isRunning: false, nextRunAt: null });
      return;
    }

    // Regelmäßiger Interval
    const intervalMs = autopilotSettings.intervalMinutes * 60 * 1000;

    // lastRunAt direkt aus dem Store lesen (vermeidet stale Closure)
    const currentLastRunAt = useAppStore.getState().autopilotState.lastRunAt;
    const lastRun = currentLastRunAt ? new Date(currentLastRunAt).getTime() : 0;
    const timeSinceLastRun = Date.now() - lastRun;
    const shouldRunNow = !hasRunInitial.current && timeSinceLastRun >= intervalMs;

    let initialTimeout: ReturnType<typeof setTimeout> | null = null;
    if (shouldRunNow) {
      // Erster Lauf nach 5s wenn letzter Lauf lang genug her
      initialTimeout = setTimeout(() => {
        startCycle();
      }, 5000);
      hasRunInitial.current = true;
      updateAutopilotState({ nextRunAt: new Date(Date.now() + 5000).toISOString() });
    } else if (!hasRunInitial.current) {
      // Letzter Lauf war kürzlich — nächsten Lauf auf Intervall-Ende setzen
      hasRunInitial.current = true;
      const nextRunTime = lastRun + intervalMs;
      const delay = Math.max(nextRunTime - Date.now(), 5000);
      initialTimeout = setTimeout(() => {
        startCycle();
      }, delay);
      updateAutopilotState({ nextRunAt: new Date(Date.now() + delay).toISOString() });
    }

    intervalRef.current = setInterval(startCycle, intervalMs);

    return () => {
      if (initialTimeout) clearTimeout(initialTimeout);
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
