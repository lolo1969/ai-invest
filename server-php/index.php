<?php
/**
 * Vestia Backend Server (PHP)
 * 
 * REST API für Frontend-Synchronisation.
 * Ersetzt den Node.js-Server komplett.
 * 
 * Endpoints:
 *   GET  /api/status         – Server-Status
 *   GET  /api/state          – State laden
 *   POST /api/state          – State pushen (mit Conflict Detection)
 *   POST /api/state/merge    – Partielle State-Updates
 *   POST /api/trigger-cycle  – Autopilot-Zyklus manuell auslösen
 *   POST /api/check-orders   – Order-Check manuell auslösen
 *   GET  /api/logs           – Autopilot-Logs
 */

require_once __DIR__ . '/stateManager.php';
require_once __DIR__ . '/marketData.php';
require_once __DIR__ . '/autopilotRunner.php';
require_once __DIR__ . '/orderExecutor.php';

// ─── CORS Headers ────────────────────────────────────
// In Produktion: Auf die eigene Domain einschränken
$allowedOrigin = getenv('CORS_ORIGIN') ?: '*';
header("Access-Control-Allow-Origin: {$allowedOrigin}");
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

// Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

// ─── Helpers ─────────────────────────────────────────

function sendJSON(mixed $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit();
}

function sendError(string $message, int $status = 400): void {
    sendJSON(['error' => $message], $status);
}

function getRequestBody(): array {
    $raw = file_get_contents('php://input');
    if (empty($raw)) return [];
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : [];
}

// ─── Routing ─────────────────────────────────────────

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// PATH_INFO hat Vorrang (gesetzt vom router.php)
if (!empty($_SERVER['PATH_INFO'])) {
    $path = $_SERVER['PATH_INFO'];
} else {
    // Entferne Prefix falls hinter einem Unterverzeichnis
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    if (str_starts_with($uri, $scriptName)) {
        $path = substr($uri, strlen($scriptName));
    } else {
        $basePath = dirname($scriptName);
        if ($basePath !== '/' && str_starts_with($uri, $basePath)) {
            $path = substr($uri, strlen($basePath));
        } else {
            $path = $uri;
        }
    }
}
if (empty($path)) $path = '/';

// Session-ID aus Authorization-Header (bevorzugt) oder Query-Fallback (für sendBeacon)
$sessionId = null;
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
    $sessionId = $matches[1];
} else {
    // Fallback für sendBeacon (kann keine Custom-Headers setzen)
    $sessionId = $_GET['session'] ?? null;
}

// Session MUSS vorhanden sein – kein Fallback auf 'default'
if (!$sessionId || !isValidSessionId($sessionId)) {
    sendError('Missing or invalid session ID. Provide Authorization: Bearer <sessionId> header.', 401);
}

try {
    // ─── GET /api/status ─────────────
    if ($path === '/api/status' && $method === 'GET') {
        $state = loadState($sessionId);
        $activeOrders = array_filter($state['orders'], fn($o) => $o['status'] === 'active');
        sendJSON([
            'running' => true,
            'sessionId' => $sessionId,
            'serverType' => 'php',
            'autopilotEnabled' => $state['autopilotSettings']['enabled'] ?? false,
            'autopilotMode' => $state['autopilotSettings']['mode'] ?? 'suggest-only',
            'lastRunAt' => $state['autopilotState']['lastRunAt'] ?? null,
            'nextRunAt' => $state['autopilotState']['nextRunAt'] ?? null,
            'cycleCount' => $state['autopilotState']['cycleCount'] ?? 0,
            'totalOrdersCreated' => $state['autopilotState']['totalOrdersCreated'] ?? 0,
            'totalOrdersExecuted' => $state['autopilotState']['totalOrdersExecuted'] ?? 0,
            'activeOrders' => count($activeOrders),
            'orderAutoExecute' => $state['orderSettings']['autoExecute'] ?? false,
        ]);
    }

    // ─── GET /api/state ──────────────
    if ($path === '/api/state' && $method === 'GET') {
        $state = loadState($sessionId);
        sendJSON([
            'state' => $state,
            'stateVersion' => getStateVersion($sessionId),
            'sessionId' => $sessionId,
        ]);
    }

    // ─── POST /api/state ─────────────
    if ($path === '/api/state' && $method === 'POST') {
        $body = getRequestBody();
        if (empty($body['state'])) {
            sendError('Missing "state" field');
        }

        $clientVersion = is_numeric($body['stateVersion'] ?? null) ? (int)$body['stateVersion'] : 0;
        $result = mergeClientState($body['state'], $clientVersion, $sessionId);
        invalidateCache($sessionId);

        sendJSON([
            'ok' => true,
            'message' => $result['conflict'] ? 'State gemerged (Konflikt aufgelöst)' : 'State synchronisiert',
            'stateVersion' => $result['serverVersion'],
            'conflict' => $result['conflict'],
            'state' => $result['conflict'] ? $result['merged'] : null,
            'sessionId' => $sessionId,
        ]);
    }

    // ─── POST /api/state/merge ───────
    if ($path === '/api/state/merge' && $method === 'POST') {
        $body = getRequestBody();
        $current = loadState($sessionId);
        $merged = array_merge($current, $body);
        saveState($merged, $sessionId);
        invalidateCache($sessionId);

        sendJSON(['ok' => true, 'sessionId' => $sessionId]);
    }

    // ─── POST /api/trigger-cycle ─────
    if ($path === '/api/trigger-cycle' && $method === 'POST') {
        $state = loadState($sessionId);
        if (!empty($state['autopilotState']['isRunning'])) {
            sendJSON(['ok' => false, 'message' => 'Zyklus läuft bereits'], 409);
        }

        // Synchron ausführen (PHP blockiert ohnehin pro Request)
        runAutopilotCycle($sessionId);
        sendJSON(['ok' => true, 'message' => 'Zyklus abgeschlossen', 'sessionId' => $sessionId]);
    }

    // ─── POST /api/check-orders ──────
    if ($path === '/api/check-orders' && $method === 'POST') {
        checkAndExecuteOrders($sessionId);
        sendJSON(['ok' => true, 'message' => 'Order-Check abgeschlossen', 'sessionId' => $sessionId]);
    }

    // ─── GET /api/logs ───────────────
    if ($path === '/api/logs' && $method === 'GET') {
        $state = loadState($sessionId);
        $limit = min(max((int)($_GET['limit'] ?? 50), 1), 200);
        sendJSON(['logs' => array_slice($state['autopilotLog'], 0, $limit)]);
    }

    // ─── 404 ─────────────────────────
    sendError('Not found', 404);

} catch (\Throwable $e) {
    error_log('[Server] Request-Fehler: ' . $e->getMessage());
    sendError($e->getMessage(), 500);
}
