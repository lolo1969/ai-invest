/**
 * Sync-Service: Synchronisiert den Frontend-State mit dem Backend-Server.
 * 
 * Funktionsweise:
 * - Beim App-Start: Prüft ob Server läuft und lädt neueren State
 * - Bei State-Änderungen: Pusht State zum Server (debounced)
 * - Periodisch: Holt Server-State (falls Server Änderungen gemacht hat)
 * 
 * Wenn der Server nicht erreichbar ist, funktioniert die App wie bisher
 * (rein client-seitig mit localStorage).
 */

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3141';
const SYNC_INTERVAL = 15_000; // Alle 15 Sekunden Server-State holen
const DEBOUNCE_PUSH = 3_000;  // 3 Sekunden Debounce für State-Push

let serverAvailable = false;
let syncInterval: ReturnType<typeof setInterval> | null = null;
let pushTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Prüft ob der Backend-Server erreichbar ist
 */
export async function checkServerStatus(): Promise<{
  running: boolean;
  autopilotEnabled?: boolean;
  autopilotMode?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  activeOrders?: number;
}> {
  try {
    const response = await fetch(`${SERVER_URL}/api/status`, { 
      signal: AbortSignal.timeout(3000) 
    });
    if (response.ok) {
      const data = await response.json();
      serverAvailable = true;
      return data;
    }
  } catch {
    // Server nicht erreichbar
  }
  serverAvailable = false;
  return { running: false };
}

/**
 * Holt den State vom Server (Pull)
 */
export async function pullState(): Promise<any | null> {
  if (!serverAvailable) return null;
  
  try {
    const response = await fetch(`${SERVER_URL}/api/state`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      return data.state || null;
    }
  } catch {
    serverAvailable = false;
  }
  return null;
}

/**
 * Schickt den State zum Server (Push)
 */
export async function pushState(state: any): Promise<boolean> {
  if (!serverAvailable) return false;
  
  try {
    const response = await fetch(`${SERVER_URL}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    serverAvailable = false;
    return false;
  }
}

/**
 * Debounced State-Push (vermeidet Überlastung bei häufigen Änderungen)
 */
export function debouncedPushState(state: any): void {
  if (pushTimeout) clearTimeout(pushTimeout);
  pushTimeout = setTimeout(() => {
    pushState(state).then(ok => {
      if (ok) {
        console.log('[Sync] State zum Server gepusht ✅');
      }
    });
  }, DEBOUNCE_PUSH);
}

/**
 * Manuellen Autopilot-Zyklus auf dem Server auslösen
 */
export async function triggerServerCycle(): Promise<boolean> {
  if (!serverAvailable) return false;
  
  try {
    const response = await fetch(`${SERVER_URL}/api/trigger-cycle`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Manuellen Order-Check auf dem Server auslösen
 */
export async function triggerServerOrderCheck(): Promise<boolean> {
  if (!serverAvailable) return false;
  
  try {
    const response = await fetch(`${SERVER_URL}/api/check-orders`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Startet die periodische Synchronisation
 */
export function startSync(onServerState: (state: any) => void): () => void {
  // Initial-Check
  checkServerStatus().then(status => {
    if (status.running) {
      console.log('[Sync] Backend-Server gefunden ✅', status);
    } else {
      console.log('[Sync] Kein Backend-Server gefunden – App läuft client-seitig');
    }
  });

  // Periodisch State vom Server holen
  syncInterval = setInterval(async () => {
    if (!serverAvailable) {
      // Regelmäßig prüfen ob Server wieder da ist
      await checkServerStatus();
      return;
    }

    const serverState = await pullState();
    if (serverState) {
      onServerState(serverState);
    }
  }, SYNC_INTERVAL);

  // Cleanup-Funktion
  return () => {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
    if (pushTimeout) {
      clearTimeout(pushTimeout);
      pushTimeout = null;
    }
  };
}

/**
 * Gibt zurück ob der Server erreichbar ist
 */
export function isServerAvailable(): boolean {
  return serverAvailable;
}
