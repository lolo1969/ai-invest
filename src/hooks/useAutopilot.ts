import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { runAutopilotCycle } from '../services/autopilotService';

/**
 * Hook for autopilot timer.
 * Starts/stops the interval based on autopilot settings.
 * Used in App.tsx so it runs persistently (doesn't restart on navigation).
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
    // Prevent parallel cycles
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    
    try {
      await runAutopilotCycle();
    } finally {
      isRunningRef.current = false;
      
      // Calculate next run
      const store = useAppStore.getState();
      if (store.autopilotSettings.enabled) {
        const nextRun = new Date(Date.now() + store.autopilotSettings.intervalMinutes * 60 * 1000);
        updateAutopilotState({ nextRunAt: nextRun.toISOString() });
      }
    }
  }, [updateAutopilotState]);

  // Trigger manual cycle
  const triggerManualCycle = useCallback(async () => {
    if (isRunningRef.current) return;
    
    addAutopilotLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'info',
      message: '🔧 Manual cycle started',
    });
    
    await startCycle();
  }, [startCycle, addAutopilotLog]);

  // Start/stop timer
  useEffect(() => {
    if (!autopilotSettings.enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      updateAutopilotState({ isRunning: false, nextRunAt: null });
      return;
    }

    // Regular interval
    const intervalMs = autopilotSettings.intervalMinutes * 60 * 1000;

    // Read lastRunAt directly from store (avoids stale closure)
    const currentLastRunAt = useAppStore.getState().autopilotState.lastRunAt;
    const lastRun = currentLastRunAt ? new Date(currentLastRunAt).getTime() : 0;
    const timeSinceLastRun = Date.now() - lastRun;
    const shouldRunNow = timeSinceLastRun >= intervalMs;

    let initialTimeout: ReturnType<typeof setTimeout> | null = null;
    if (shouldRunNow) {
      // First run after 5s if last run was long enough ago
      initialTimeout = setTimeout(() => {
        startCycle();
      }, 5000);
      updateAutopilotState({ nextRunAt: new Date(Date.now() + 5000).toISOString() });
    } else {
      // Last run was recent — set next run to interval end
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
