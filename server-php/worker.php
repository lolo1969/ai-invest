#!/usr/bin/env php
<?php
/**
 * Vestia Background Worker (PHP)
 * 
 * Läuft als Endlosschleife im Hintergrund und übernimmt:
 * - Order-Ausführung alle 30 Sekunden (über ALLE Sessions)
 * - Autopilot-Zyklen auf konfigurierbarem Intervall (über ALLE Sessions)
 * 
 * Start: php server-php/worker.php
 * Background: nohup php server-php/worker.php > server-php/worker.log 2>&1 &
 * 
 * Für Produktion: Als systemd-Service oder via Supervisor einrichten.
 */

// Unbegrenzte Laufzeit
set_time_limit(0);
ini_set('memory_limit', '256M');

// Signal-Handler für graceful shutdown
$running = true;
if (function_exists('pcntl_signal')) {
    pcntl_signal(SIGINT, function () use (&$running) {
        echo "\n[Worker] SIGINT empfangen, fahre herunter...\n";
        $running = false;
    });
    pcntl_signal(SIGTERM, function () use (&$running) {
        echo "\n[Worker] SIGTERM empfangen, fahre herunter...\n";
        $running = false;
    });
}

require_once __DIR__ . '/stateManager.php';
require_once __DIR__ . '/marketData.php';
require_once __DIR__ . '/autopilotRunner.php';
require_once __DIR__ . '/orderExecutor.php';

// ─── Konfiguration ──────────────────────────────────

$ORDER_CHECK_INTERVAL = 30;  // Sekunden
$isRunningCycle = false;

// ─── Startup Banner ──────────────────────────────────

echo "\n";
echo "╔══════════════════════════════════════════════════╗\n";
echo "║          🚀 Vestia PHP Background Worker         ║\n";
echo "╠══════════════════════════════════════════════════╣\n";
echo "║  Order-Check:   alle {$ORDER_CHECK_INTERVAL}s                          ║\n";
echo "║  Data-Dir:      server-php/data/                 ║\n";
echo "╠══════════════════════════════════════════════════╣\n";

if (!stateFileExists()) {
    echo "║  ⚠️  Kein State gefunden!                        ║\n";
    echo "║  → Öffne die App im Browser für Auto-Sync        ║\n";
} else {
    $sessions = listSessions();
    $count = count($sessions);
    echo "║  Sessions:    {$count} aktiv                            ║\n";
    foreach ($sessions as $sid) {
        $state = loadState($sid);
        $positions = count($state['userPositions']);
        $autopilot = !empty($state['autopilotSettings']['enabled']) ? '✅' : '❌';
        $sidPadded = str_pad($sid, 12);
        echo "║    {$sidPadded} {$positions} Pos. | Autopilot: {$autopilot}       ║\n";
    }
}

echo "╚══════════════════════════════════════════════════╝\n";
echo "\n";
echo "[Worker] Gestartet – " . date('d.m.Y H:i:s') . "\n";

// ─── Initialer Order-Check ───────────────────────────

sleep(5);
foreach (listSessions() as $sid) {
    try {
        checkAndExecuteOrders($sid);
    } catch (\Throwable $e) {
        echo "[Worker] Init Order-Check Fehler ({$sid}): {$e->getMessage()}\n";
    }
}

// ─── Haupt-Loop ─────────────────────────────────────

$lastOrderCheck = time();
$lastAutopilotCheck = time();

while ($running) {
    // Signal-Handler aufrufen (falls verfügbar)
    if (function_exists('pcntl_signal_dispatch')) {
        pcntl_signal_dispatch();
    }

    $now = time();

    // ── Order-Check (alle 30s) ──
    if ($now - $lastOrderCheck >= $ORDER_CHECK_INTERVAL) {
        $lastOrderCheck = $now;
        foreach (listSessions() as $sid) {
            try {
                // Cache invalidieren um frische Daten zu haben
                invalidateCache($sid);
                checkAndExecuteOrders($sid);
            } catch (\Throwable $e) {
                echo "[Worker] Order-Check Fehler ({$sid}): {$e->getMessage()}\n";
            }
        }
    }

    // ── Autopilot-Check ──
    if (!$isRunningCycle) {
        foreach (listSessions() as $sid) {
            try {
                // Cache invalidieren
                invalidateCache($sid);
                $state = loadState($sid);

                if (empty($state['autopilotSettings']['enabled'])) continue;

                $intervalMs = ($state['autopilotSettings']['intervalMinutes'] ?? 240) * 60;
                $lastRun = !empty($state['autopilotState']['lastRunAt'])
                    ? strtotime($state['autopilotState']['lastRunAt'])
                    : 0;
                $timeSinceLastRun = $now - $lastRun;

                if ($timeSinceLastRun < $intervalMs) continue;

                $isRunningCycle = true;
                $dateStr = date('d.m.Y H:i:s');
                echo "[Worker] 🔄 Autopilot-Zyklus für Session \"{$sid}\" ({$dateStr})\n";

                runAutopilotCycle($sid);

                // Nächsten Lauf berechnen
                $updatedState = loadState($sid);
                if (!empty($updatedState['autopilotSettings']['enabled'])) {
                    $nextRun = gmdate('Y-m-d\TH:i:s\Z', time() + ($updatedState['autopilotSettings']['intervalMinutes'] ?? 240) * 60);
                    $updatedState['autopilotState']['nextRunAt'] = $nextRun;
                    saveState($updatedState, $sid);
                }

                echo "[Worker] ✅ Zyklus für Session \"{$sid}\" abgeschlossen\n";
                $isRunningCycle = false;

            } catch (\Throwable $e) {
                echo "[Worker] ❌ Autopilot-Fehler ({$sid}): {$e->getMessage()}\n";
                $isRunningCycle = false;
            }
        }
    }

    // 5 Sekunden warten, um CPU zu schonen
    sleep(5);
}

echo "[Worker] Beendet ✅\n";
