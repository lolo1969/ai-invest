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
import { loadState, saveState, invalidateCache, stateFileExists, getStateFilePath, type ServerState } from './stateManager.js';
import { runAutopilotCycle } from './autopilotRunner.js';
import { checkAndExecuteOrders } from './orderExecutor.js';

const PORT = parseInt(process.env.VESTIA_PORT || '3141', 10);

// ─── Scheduler ───────────────────────────────────────

let autopilotInterval: ReturnType<typeof setInterval> | null = null;
let orderCheckInterval: ReturnType<typeof setInterval> | null = null;
let isRunningCycle = false;

function startScheduler(): void {
  console.log('[Scheduler] Starte...');
  
  // Order-Execution: alle 30s
  orderCheckInterval = setInterval(async () => {
    try {
      await checkAndExecuteOrders();
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

  const state = loadState();
  if (!state.autopilotSettings.enabled) {
    console.log('[Scheduler] Autopilot deaktiviert');
    return;
  }

  const intervalMs = state.autopilotSettings.intervalMinutes * 60 * 1000;
  console.log(`[Scheduler] Autopilot-Intervall: ${state.autopilotSettings.intervalMinutes} Minuten`);

  // Prüfe ob ein Zyklus fällig ist
  const lastRun = state.autopilotState.lastRunAt
    ? new Date(state.autopilotState.lastRunAt).getTime()
    : 0;
  const timeSinceLastRun = Date.now() - lastRun;
  
  if (timeSinceLastRun >= intervalMs) {
    // Sofort starten (nach 10s Verzögerung)
    console.log('[Scheduler] Erster Zyklus in 10 Sekunden...');
    setTimeout(() => runCycle(), 10_000);
  } else {
    const nextIn = intervalMs - timeSinceLastRun;
    console.log(`[Scheduler] Nächster Zyklus in ${Math.round(nextIn / 60000)} Minuten`);
    setTimeout(() => runCycle(), nextIn);
  }

  // Regelmäßiger Interval
  autopilotInterval = setInterval(() => runCycle(), intervalMs);

  // Next-Run updaten
  const nextRunAt = new Date(Date.now() + Math.min(timeSinceLastRun >= intervalMs ? 10_000 : intervalMs - timeSinceLastRun, intervalMs));
  state.autopilotState.nextRunAt = nextRunAt.toISOString();
  saveState(state);
}

async function runCycle(): Promise<void> {
  if (isRunningCycle) {
    console.log('[Scheduler] Zyklus läuft bereits, überspringe');
    return;
  }
  isRunningCycle = true;
  
  try {
    console.log(`[Scheduler] 🔄 Autopilot-Zyklus gestartet (${new Date().toLocaleString('de-DE')})`);
    await runAutopilotCycle();
    console.log('[Scheduler] ✅ Zyklus abgeschlossen');
    
    // Nächsten Lauf berechnen
    const state = loadState();
    if (state.autopilotSettings.enabled) {
      const nextRun = new Date(Date.now() + state.autopilotSettings.intervalMinutes * 60 * 1000);
      state.autopilotState.nextRunAt = nextRun.toISOString();
      saveState(state);
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

  try {
    // ─── GET /api/status ─────────────
    if (path === '/api/status' && req.method === 'GET') {
      const state = loadState();
      sendJSON(res, {
        running: true,
        autopilotEnabled: state.autopilotSettings.enabled,
        autopilotMode: state.autopilotSettings.mode,
        lastRunAt: state.autopilotState.lastRunAt,
        nextRunAt: state.autopilotState.nextRunAt,
        cycleCount: state.autopilotState.cycleCount,
        totalOrdersCreated: state.autopilotState.totalOrdersCreated,
        totalOrdersExecuted: state.autopilotState.totalOrdersExecuted,
        activeOrders: state.orders.filter(o => o.status === 'active').length,
        orderAutoExecute: state.orderSettings.autoExecute,
        stateFile: getStateFilePath(),
      });
      return;
    }

    // ─── GET /api/state ──────────────
    if (path === '/api/state' && req.method === 'GET') {
      const state = loadState();
      sendJSON(res, { state });
      return;
    }

    // ─── POST /api/state ─────────────
    // Frontend schickt seinen kompletten State hierher
    if (path === '/api/state' && req.method === 'POST') {
      const body = await parseBody(req);
      const parsed = JSON.parse(body);
      
      if (!parsed.state) {
        sendError(res, 'Missing "state" field');
        return;
      }

      saveState(parsed.state);
      invalidateCache();
      
      // Scheduler neu konfigurieren falls Autopilot-Settings geändert
      scheduleAutopilot();
      
      sendJSON(res, { ok: true, message: 'State synchronisiert' });
      return;
    }

    // ─── POST /api/state/merge ───────
    // Partielle State-Updates (nur geänderte Felder)
    if (path === '/api/state/merge' && req.method === 'POST') {
      const body = await parseBody(req);
      const parsed = JSON.parse(body);
      
      const current = loadState();
      const merged = { ...current, ...parsed };
      saveState(merged);
      invalidateCache();
      
      // Scheduler neu konfigurieren falls nötig
      if (parsed.autopilotSettings) {
        scheduleAutopilot();
      }
      
      sendJSON(res, { ok: true });
      return;
    }

    // ─── POST /api/trigger-cycle ─────
    if (path === '/api/trigger-cycle' && req.method === 'POST') {
      if (isRunningCycle) {
        sendJSON(res, { ok: false, message: 'Zyklus läuft bereits' }, 409);
        return;
      }
      
      // Asynchron starten, sofort antworten
      runCycle().catch(err => console.error('[Manual Cycle] Fehler:', err));
      sendJSON(res, { ok: true, message: 'Zyklus gestartet' });
      return;
    }

    // ─── POST /api/check-orders ──────
    if (path === '/api/check-orders' && req.method === 'POST') {
      checkAndExecuteOrders().catch(err => console.error('[Manual Order Check] Fehler:', err));
      sendJSON(res, { ok: true, message: 'Order-Check gestartet' });
      return;
    }

    // ─── GET /api/logs ───────────────
    if (path === '/api/logs' && req.method === 'GET') {
      const state = loadState();
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      sendJSON(res, { logs: state.autopilotLog.slice(0, limit) });
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
    const state = loadState();
    console.log(`║  Autopilot:   ${state.autopilotSettings.enabled ? '✅ Aktiv' : '❌ Deaktiviert'}                      ║`);
    console.log(`║  Modus:       ${state.autopilotSettings.mode.padEnd(20)}         ║`);
    console.log(`║  Intervall:   ${state.autopilotSettings.intervalMinutes} Minuten                        ║`);
    console.log(`║  Orders:      ${state.orders.filter(o => o.status === 'active').length} aktiv                            ║`);
    console.log(`║  Auto-Execute:${state.orderSettings.autoExecute ? ' ✅ Ja' : ' ❌ Nein'}                           ║`);
  }

  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Scheduler starten
  startScheduler();

  // Initialer Order-Check
  setTimeout(() => {
    checkAndExecuteOrders().catch(err => console.error('[Init] Order-Check Fehler:', err));
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
