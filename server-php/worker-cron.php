#!/usr/bin/env php
<?php
/**
 * Vestia Cron Worker
 * 
 * Wird per Cronjob jede Minute aufgerufen und führt aus:
 * - Order-Check & Ausführung für alle Sessions
 * - Autopilot-Zyklen wenn fällig (basierend auf intervalMinutes)
 * 
 * Cronjob einrichten (jede Minute):
 *   * * * * * php /pfad/zu/server-php/worker-cron.php >> /pfad/zu/server-php/data/cron.log 2>&1
 * 
 * Lock-Mechanismus verhindert parallele Ausführungen.
 */

set_time_limit(120); // Max 2 Minuten pro Lauf

require_once __DIR__ . '/stateManager.php';
require_once __DIR__ . '/marketData.php';
require_once __DIR__ . '/autopilotRunner.php';
require_once __DIR__ . '/orderExecutor.php';

// ─── Lock-Mechanismus ────────────────────────────────
// Verhindert dass der Cron-Job doppelt läuft falls ein Zyklus
// länger als 1 Minute dauert.

$lockFile = __DIR__ . '/data/cron.lock';

if (file_exists($lockFile)) {
    $lockTime = (int)file_get_contents($lockFile);
    $age = time() - $lockTime;
    if ($age < 300) {
        // Lock jünger als 5 Minuten → anderer Prozess läuft noch
        echo "[Cron] " . date('Y-m-d H:i:s') . " – Übersprungen (Lock aktiv, {$age}s alt)\n";
        exit(0);
    }
    // Lock älter als 5 Minuten → stale Lock, entfernen
    echo "[Cron] " . date('Y-m-d H:i:s') . " – Stale Lock entfernt ({$age}s alt)\n";
}

// Lock setzen
file_put_contents($lockFile, (string)time(), LOCK_EX);

// Lock am Ende immer entfernen
register_shutdown_function(function () use ($lockFile) {
    @unlink($lockFile);
});

// ─── Haupt-Logik ─────────────────────────────────────

$startTime = microtime(true);
$sessions = listSessions();
$now = time();

echo "[Cron] " . date('Y-m-d H:i:s') . " – Start (" . count($sessions) . " Sessions)\n";

foreach ($sessions as $sid) {
    // Cache invalidieren um frische Daten zu lesen
    invalidateCache($sid);

    // 1. Order-Check
    try {
        checkAndExecuteOrders($sid);
    } catch (\Throwable $e) {
        echo "[Cron] Order-Fehler ({$sid}): {$e->getMessage()}\n";
    }

    // 2. Autopilot-Zyklus (wenn fällig)
    try {
        $state = loadState($sid);

        if (empty($state['autopilotSettings']['enabled'])) continue;

        $intervalSec = ($state['autopilotSettings']['intervalMinutes'] ?? 240) * 60;
        $lastRun = !empty($state['autopilotState']['lastRunAt'])
            ? strtotime($state['autopilotState']['lastRunAt'])
            : 0;
        $timeSinceLastRun = $now - $lastRun;

        if ($timeSinceLastRun < $intervalSec) continue;

        echo "[Cron] 🔄 Autopilot für \"{$sid}\" (letzter Lauf vor " . round($timeSinceLastRun / 60) . " Min.)\n";

        runAutopilotCycle($sid);

        // Nächsten Lauf berechnen
        $updatedState = loadState($sid);
        if (!empty($updatedState['autopilotSettings']['enabled'])) {
            $nextRun = gmdate('Y-m-d\TH:i:s\Z', time() + ($updatedState['autopilotSettings']['intervalMinutes'] ?? 240) * 60);
            $updatedState['autopilotState']['nextRunAt'] = $nextRun;
            saveState($updatedState, $sid);
        }

        echo "[Cron] ✅ Autopilot für \"{$sid}\" abgeschlossen\n";

    } catch (\Throwable $e) {
        echo "[Cron] Autopilot-Fehler ({$sid}): {$e->getMessage()}\n";
    }
}

$elapsed = round((microtime(true) - $startTime) * 1000);
echo "[Cron] " . date('Y-m-d H:i:s') . " – Fertig ({$elapsed}ms)\n";
