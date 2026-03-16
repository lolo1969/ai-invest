/**
 * Vestia Backend Server
 * 
 * Löst das Problem: Autopilot und Order-Ausführung laufen nur im Browser.
 * Dieser Server läuft als eigenständiger Node.js-Prozess und übernimmt:
 * - Autopilot-Zyklen auf konfigurierbarem Intervall
 * - Order-Ausführung alle 30 Sekunden
 * - State-Synchronisation mit dem Frontend per REST API
 * 
 * Start: npm run server
 * Dev:   npm run server:dev
 */

import http from 'node:http';
import { loadState, saveState, invalidateCache, stateFileExists, getStateFilePath, getStateVersion, mergeClientState, listSessions, type ServerState } from './stateManager.js';
import { runAutopilotCycle } from './autopilotRunner.js';
import { checkAndExecuteOrders } from './orderExecutor.js';

const PORT = parseInt(process.env.VESTIA_PORT || '3141', 10);

// ─── Scheduler ───────────────────────────────────────

let autopilotInterval: ReturnType<typeof setInterval> | null = null;
let orderCheckInterval: ReturnType<typeof setInterval> | null = null;
let isRunningCycle = false;

function startScheduler(): void {
  console.log('[Scheduler] Starte...');
  
  // Order-Execution: alle 30s – über ALLE Sessions
  orderCheckInterval = setInterval(async () => {
    try {
      for (const sessionId of listSessions()) {
        await checkAndExecuteOrders(sessionId);
      }
    } catch (err) {
      console.error('[Scheduler] Order-Check Fehler:', err);
    }
  }, 30_000);
  
  // Autopilot: Intervall aus Settings
  scheduleAutopilot();
  
  console.log('[Scheduler] Aktiv ✅');
}

function scheduleAutopilot(): void {
  // Alten Interval stoppen
  if (autopilotInterval) {
    clearInterval(autopilotInterval);
    autopilotInterval = null;
  }

  // Prüfe über ALLE Sessions ob Autopilot aktiv ist
  const sessions = listSessions();
  let shortestInterval = Infinity;
  let anyEnabled = false;

  for (const sessionId of sessions) {
    const state = loadState(sessionId);
    if (state.autopilotSettings.enabled) {
      anyEnabled = true;
      shortestInterval = Math.min(shortestInterval, state.autopilotSettings.intervalMinutes);
    }
  }

  if (!anyEnabled) {
    console.log('[Scheduler] Autopilot deaktiviert (keine Session aktiv)');
    return;
  }

  const intervalMs = shortestInterval * 60 * 1000;
  console.log(`[Scheduler] Autopilot-Intervall: ${shortestInterval} Minuten (kürzestes aktives Intervall)`);

  // Sofort prüfen ob ein Zyklus fällig ist
  setTimeout(() => runCycle(), 10_000);

  // Regelmäßiger Interval
  autopilotInterval = setInterval(() => runCycle(), intervalMs);
}

async function runCycle(): Promise<void> {
  if (isRunningCycle) {
    console.log('[Scheduler] Zyklus läuft bereits, überspringe');
    return;
  }
  isRunningCycle = true;
  
  try {
    // Über ALLE Sessions mit aktivem Autopilot iterieren
    for (const sessionId of listSessions()) {
      const state = loadState(sessionId);
      if (!state.autopilotSettings.enabled) continue;

      // Prüfe ob Zyklus fällig ist
      const intervalMs = state.autopilotSettings.intervalMinutes * 60 * 1000;
      const lastRun = state.autopilotState.lastRunAt
        ? new Date(state.autopilotState.lastRunAt).getTime()
        : 0;
      const timeSinceLastRun = Date.now() - lastRun;
      
      if (timeSinceLastRun < intervalMs) continue;

      console.log(`[Scheduler] 🔄 Autopilot-Zyklus für Session "${sessionId}" (${new Date().toLocaleString('de-DE')})`);
      await runAutopilotCycle(sessionId);
      
      // Nächsten Lauf berechnen
      const updatedState = loadState(sessionId);
      if (updatedState.autopilotSettings.enabled) {
        const nextRun = new Date(Date.now() + updatedState.autopilotSettings.intervalMinutes * 60 * 1000);
        updatedState.autopilotState.nextRunAt = nextRun.toISOString();
        saveState(updatedState, sessionId);
      }
      console.log(`[Scheduler] ✅ Zyklus für Session "${sessionId}" abgeschlossen`);
    }
  } catch (err) {
    console.error('[Scheduler] ❌ Zyklus-Fehler:', err);
  } finally {
    isRunningCycle = false;
  }
}

// ─── HTTP Server (für Frontend-Sync) ─────────────────

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJSON(res: http.ServerResponse, data: any, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function sendError(res: http.ServerResponse, message: string, status = 400): void {
  sendJSON(res, { error: message }, status);
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  
  // Session-ID aus Query-Parameter extrahieren (jeder Browser hat seine eigene)
  const sessionId = url.searchParams.get('session') || 'default';

  try {
    // ─── GET /api/status ─────────────
    if (path === '/api/status' && req.method === 'GET') {
      const state = loadState(sessionId);
      sendJSON(res, {
        running: true,
        sessionId,
        autopilotEnabled: state.autopilotSettings.enabled,
        autopilotMode: state.autopilotSettings.mode,
        lastRunAt: state.autopilotState.lastRunAt,
        nextRunAt: state.autopilotState.nextRunAt,
        cycleCount: state.autopilotState.cycleCount,
        totalOrdersCreated: state.autopilotState.totalOrdersCreated,
        totalOrdersExecuted: state.autopilotState.totalOrdersExecuted,
        activeOrders: state.orders.filter(o => o.status === 'active').length,
        orderAutoExecute: state.orderSettings.autoExecute,
        stateFile: getStateFilePath(sessionId),
      });
      return;
    }

    // ─── GET /api/state ──────────────
    if (path === '/api/state' && req.method === 'GET') {
      const state = loadState(sessionId);
      sendJSON(res, { state, stateVersion: getStateVersion(sessionId), sessionId });
      return;
    }

    // ─── POST /api/state ─────────────
    // Frontend schickt seinen State + Version + Session-ID
    // Conflict-aware: Merged intelligent statt blind zu überschreiben
    if (path === '/api/state' && req.method === 'POST') {
      const body = await parseBody(req);
      const parsed = JSON.parse(body);
      
      if (!parsed.state) {
        sendError(res, 'Missing "state" field');
        return;
      }

      const clientVersion = typeof parsed.stateVersion === 'number' ? parsed.stateVersion : 0;
      const result = mergeClientState(parsed.state, clientVersion, sessionId);
      invalidateCache(sessionId);
      
      // Scheduler neu konfigurieren falls Autopilot-Settings geändert
      scheduleAutopilot();
      
      sendJSON(res, { 
        ok: true, 
        message: result.conflict ? 'State gemerged (Konflikt aufgelöst)' : 'State synchronisiert',
        stateVersion: result.serverVersion,
        conflict: result.conflict,
        state: result.conflict ? result.merged : undefined,
        sessionId,
      });
      return;
    }

    // ─── POST /api/state/merge ───────
    // Partielle State-Updates (nur geänderte Felder)
    if (path === '/api/state/merge' && req.method === 'POST') {
      const body = await parseBody(req);
      const parsed = JSON.parse(body);
      
      const current = loadState(sessionId);
      const merged = { ...current, ...parsed };
      saveState(merged, sessionId);
      invalidateCache(sessionId);
      
      // Scheduler neu konfigurieren falls nötig
      if (parsed.autopilotSettings) {
        scheduleAutopilot();
      }
      
      sendJSON(res, { ok: true, sessionId });
      return;
    }

    // ─── POST /api/trigger-cycle ─────
    if (path === '/api/trigger-cycle' && req.method === 'POST') {
      if (isRunningCycle) {
        sendJSON(res, { ok: false, message: 'Zyklus läuft bereits' }, 409);
        return;
      }
      
      // Asynchron starten für diese Session
      (async () => {
        isRunningCycle = true;
        try {
          await runAutopilotCycle(sessionId);
        } catch (err) {
          console.error('[Manual Cycle] Fehler:', err);
        } finally {
          isRunningCycle = false;
        }
      })();
      sendJSON(res, { ok: true, message: 'Zyklus gestartet', sessionId });
      return;
    }

    // ─── POST /api/check-orders ──────
    if (path === '/api/check-orders' && req.method === 'POST') {
      checkAndExecuteOrders(sessionId).catch(err => console.error('[Manual Order Check] Fehler:', err));
      sendJSON(res, { ok: true, message: 'Order-Check gestartet', sessionId });
      return;
    }

    // ─── GET /api/logs ───────────────
    if (path === '/api/logs' && req.method === 'GET') {
      const state = loadState(sessionId);
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      sendJSON(res, { logs: state.autopilotLog.slice(0, limit) });
      return;
    }

    // ─── GET /api/sessions ───────────
    // Liste aller aktiven Sessions
    if (path === '/api/sessions' && req.method === 'GET') {
      sendJSON(res, { sessions: listSessions() });
      return;
    }

    // ─── 404 ─────────────────────────
    sendError(res, 'Not found', 404);

  } catch (err: any) {
    console.error('[Server] Request-Fehler:', err);
    sendError(res, err.message || 'Internal Server Error', 500);
  }
});

// ─── Startup ─────────────────────────────────────────

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║          🚀 Vestia Backend Server               ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Port:        ${PORT}                              ║`);
  console.log(`║  State-Datei: server/data/state.json             ║`);
  console.log(`║  API:         http://localhost:${PORT}/api/status    ║`);
  console.log('╠══════════════════════════════════════════════════╣');

  if (!stateFileExists()) {
    console.log('║  ⚠️  Kein State gefunden!                        ║');
    console.log('║  → Öffne die App im Browser und der State        ║');
    console.log('║    wird automatisch synchronisiert.               ║');
  } else {
    const sessions = listSessions();
    console.log(`║  Sessions:    ${sessions.length} aktiv                            ║`);
    for (const sid of sessions) {
      const state = loadState(sid);
      const positions = state.userPositions.length;
      const autopilot = state.autopilotSettings.enabled ? '✅' : '❌';
      console.log(`║    ${sid.padEnd(12)} ${positions} Pos. | Autopilot: ${autopilot}       ║`);
    }
  }

  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Scheduler starten
  startScheduler();

  // Initialer Order-Check über alle Sessions
  setTimeout(() => {
    for (const sid of listSessions()) {
      checkAndExecuteOrders(sid).catch(err => console.error(`[Init] Order-Check Fehler (${sid}):`, err));
    }
  }, 5000);
});

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Herunterfahren...');
  if (autopilotInterval) clearInterval(autopilotInterval);
  if (orderCheckInterval) clearInterval(orderCheckInterval);
  server.close(() => {
    console.log('[Server] Beendet ✅');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n[Server] SIGTERM empfangen, fahre herunter...');
  if (autopilotInterval) clearInterval(autopilotInterval);
  if (orderCheckInterval) clearInterval(orderCheckInterval);
  server.close(() => process.exit(0));
});

// Unhandled Errors loggen, nicht crashen
process.on('unhandledRejection', (err) => {
  console.error('[Server] Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
});
