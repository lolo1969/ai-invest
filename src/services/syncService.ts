/**
 * Sync-Service: Synchronisiert den Frontend-State mit dem Backend-Server.
 * 
 * Jeder Browser bekommt automatisch eine eigene Session-ID (via utils/session.ts).
 * Damit sind die Portfolios zwischen verschiedenen Browsern komplett isoliert.
 * 
 * Session ID is sent as Authorization header in every API call.
 */

import { getSessionId } from '../utils/session';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.PROD ? '' : 'http://localhost:3141');
const SYNC_INTERVAL = 15_000;
const DEBOUNCE_PUSH = 3_000;

let serverAvailable = false;
let syncInterval: ReturnType<typeof setInterval> | null = null;
let pushTimeout: ReturnType<typeof setTimeout> | null = null;

// Optimistic Locking
let knownServerVersion = 0;

// Last pushed state for sendBeacon on unload
let lastPendingState: any = null;

export function getCurrentSessionId(): string {
  return getSessionId();
}

/**
 * Auth headers for all API requests.
 * Session ID is sent as Bearer token (not as URL parameter).
 */
function authHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${getSessionId()}`,
  };
}

/**
 * URL bauen (ohne Session-ID im Query-String)
 */
function apiUrl(path: string): string {
  return `${SERVER_URL}${path}`;
}

export function getKnownServerVersion(): number {
  return knownServerVersion;
}

/**
 * Checks if the backend server is reachable
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
      headers: authHeaders(),
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
      headers: authHeaders(),
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
 * Sends the state to the server (push) with version number for conflict detection.
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
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
          console.log('[Sync] ⚠️ Conflict detected – using merged state from server');
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
 * to prevent state loss when the user closes/reloads the page.
 */
export function flushPendingState(): void {
  if (!lastPendingState || !serverAvailable) return;
  
  // sendBeacon kann keine Custom-Headers setzen → Session-ID als URL-Fallback
  const separator = '/api/state'.includes('?') ? '&' : '?';
  const url = `${apiUrl('/api/state')}${separator}session=${getSessionId()}`;
  const body = JSON.stringify({ state: lastPendingState, stateVersion: knownServerVersion });
  
  // sendBeacon is designed for exactly this: send data on unload
  const sent = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
  if (sent) {
    console.log('[Sync] State via sendBeacon geflusht ✅');
    lastPendingState = null;
  }
}

/**
 * Trigger manual autopilot cycle on the server
 */
export async function triggerServerCycle(): Promise<boolean> {
  if (!serverAvailable) return false;
  
  try {
    const response = await fetch(apiUrl('/api/trigger-cycle'), {
      method: 'POST',
      headers: authHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Trigger manual order check on the server
 */
export async function triggerServerOrderCheck(): Promise<boolean> {
  if (!serverAvailable) return false;
  
  try {
    const response = await fetch(apiUrl('/api/check-orders'), {
      method: 'POST',
      headers: authHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Starts periodic synchronization
 */
export function startSync(onServerState: (state: any) => void): () => void {
  // Initial-Check
  checkServerStatus().then(status => {
    if (status.running) {
      console.log('[Sync] Backend-Server gefunden ✅', status);
    } else {
      console.log('[Sync] No backend server found – app runs client-side');
    }
  });

  // Periodisch State vom Server holen
  syncInterval = setInterval(async () => {
    if (!serverAvailable) {
      // Periodically check if server is back
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
 * Returns whether the server is reachable
 */
export function isServerAvailable(): boolean {
  return serverAvailable;
}
