/**
 * Sync-Service: Synchronisiert den Frontend-State mit dem Backend-Server.
 * 
 * Jeder Browser bekommt automatisch eine eigene Session-ID.
 * Damit sind die Portfolios zwischen verschiedenen Browsern komplett isoliert.
 * 
 * Session-ID wird im localStorage gespeichert und bei jedem API-Call mitgeschickt.
 */

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3141';
const SYNC_INTERVAL = 15_000;
const DEBOUNCE_PUSH = 3_000;
const SESSION_KEY = 'vestia-session-id';

let serverAvailable = false;
let syncInterval: ReturnType<typeof setInterval> | null = null;
let pushTimeout: ReturnType<typeof setTimeout> | null = null;

// Optimistic Locking
let knownServerVersion = 0;

// Letzter gepushter State für sendBeacon bei Unload
let lastPendingState: any = null;

/**
 * Session-ID generieren oder aus localStorage laden.
 * Jeder Browser bekommt eine einzigartige ID → komplett isolierter State.
 */
function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID().slice(0, 12);
    localStorage.setItem(SESSION_KEY, sessionId);
    console.log(`[Sync] Neue Session-ID generiert: ${sessionId}`);
  }
  return sessionId;
}

export function getCurrentSessionId(): string {
  return getSessionId();
}

/**
 * URL mit Session-ID-Parameter bauen
 */
function apiUrl(path: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${SERVER_URL}${path}${separator}session=${getSessionId()}`;
}

export function getKnownServerVersion(): number {
  return knownServerVersion;
}

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
    const response = await fetch(apiUrl('/api/status'), { 
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
 * Holt den State vom Server (Pull) inkl. Versionsnummer
 */
export async function pullState(): Promise<{ state: any; stateVersion: number } | null> {
  if (!serverAvailable) return null;
  
  try {
    const response = await fetch(apiUrl('/api/state'), {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.stateVersion !== undefined) {
        knownServerVersion = data.stateVersion;
      }
      return { state: data.state || null, stateVersion: data.stateVersion || 0 };
    }
  } catch {
    serverAvailable = false;
  }
  return null;
}

/**
 * Schickt den State zum Server (Push) mit Versionsnummer für Conflict Detection.
 * Returns the server response including conflict info and merged state.
 */
export async function pushState(state: any): Promise<{
  ok: boolean;
  conflict?: boolean;
  stateVersion?: number;
  mergedState?: any;
}> {
  if (!serverAvailable) return { ok: false };
  
  try {
    const response = await fetch(apiUrl('/api/state'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, stateVersion: knownServerVersion }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.stateVersion !== undefined) {
        knownServerVersion = data.stateVersion;
      }
      return {
        ok: true,
        conflict: data.conflict || false,
        stateVersion: data.stateVersion,
        mergedState: data.state || undefined,
      };
    }
    return { ok: false };
  } catch {
    serverAvailable = false;
    return { ok: false };
  }
}

/**
 * Debounced State-Push mit Conflict-Callback
 */
let onConflictCallback: ((mergedState: any) => void) | null = null;

export function setOnConflictCallback(cb: (mergedState: any) => void): void {
  onConflictCallback = cb;
}

export function debouncedPushState(state: any): void {
  lastPendingState = state;
  if (pushTimeout) clearTimeout(pushTimeout);
  pushTimeout = setTimeout(() => {
    lastPendingState = null;
    pushState(state).then(result => {
      if (result.ok) {
        if (result.conflict && result.mergedState && onConflictCallback) {
          console.log('[Sync] ⚠️ Konflikt erkannt – übernehme gemergten State vom Server');
          onConflictCallback(result.mergedState);
        } else {
          console.log('[Sync] State zum Server gepusht ✅');
        }
      }
    });
  }, DEBOUNCE_PUSH);
}

/**
 * Sofort-Push via sendBeacon – wird bei Page-Unload aufgerufen,
 * damit kein State verloren geht wenn der User die Seite schließt/neulädt.
 */
export function flushPendingState(): void {
  if (!lastPendingState || !serverAvailable) return;
  
  const url = apiUrl('/api/state');
  const body = JSON.stringify({ state: lastPendingState, stateVersion: knownServerVersion });
  
  // sendBeacon ist für genau diesen Zweck gedacht: Daten beim Unload senden
  const sent = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
  if (sent) {
    console.log('[Sync] State via sendBeacon geflusht ✅');
    lastPendingState = null;
  }
}

/**
 * Manuellen Autopilot-Zyklus auf dem Server auslösen
 */
export async function triggerServerCycle(): Promise<boolean> {
  if (!serverAvailable) return false;
  
  try {
    const response = await fetch(apiUrl('/api/trigger-cycle'), {
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
    const response = await fetch(apiUrl('/api/check-orders'), {
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

    const result = await pullState();
    if (result?.state) {
      onServerState(result.state);
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
