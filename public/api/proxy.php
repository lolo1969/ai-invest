<?php
/**
 * Sicherer CORS Proxy für Yahoo Finance API
 * Mit Rate-Limiting, Referrer-Check und Logging
 */

// ============================================
// KONFIGURATION
// ============================================
$ALLOWED_DOMAINS = [
    'invest.manes.lu',
    'localhost',
    '127.0.0.1',
];
$RATE_LIMIT_REQUESTS = 200;  // Max Requests pro Zeitfenster
$RATE_LIMIT_WINDOW = 60;     // Zeitfenster in Sekunden
$LOG_FILE = __DIR__ . '/proxy_access.log';
$RATE_LIMIT_FILE = __DIR__ . '/rate_limits.json';

// ============================================
// CORS Headers
// ============================================
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ============================================
// HILFSFUNKTIONEN
// ============================================

function logAccess($message, $isError = false) {
    global $LOG_FILE;
    $timestamp = date('Y-m-d H:i:s');
    $ip = getClientIP();
    $type = $isError ? 'ERROR' : 'INFO';
    $logLine = "[$timestamp] [$type] [$ip] $message\n";
    
    // Nur bei Fehlern oder verdächtigen Aktivitäten loggen
    if ($isError) {
        file_put_contents($LOG_FILE, $logLine, FILE_APPEND | LOCK_EX);
    }
}

function getClientIP() {
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($ips[0]);
    }
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

function checkReferrer() {
    global $ALLOWED_DOMAINS;
    
    $referrer = $_SERVER['HTTP_REFERER'] ?? '';
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    
    // Prüfe Referrer oder Origin
    $checkUrl = $referrer ?: $origin;
    
    if (empty($checkUrl)) {
        // Erlaube direkte API-Aufrufe (z.B. für Tests)
        // In Produktion könnte man das strenger machen
        return true;
    }
    
    $parsedUrl = parse_url($checkUrl);
    $host = $parsedUrl['host'] ?? '';
    
    foreach ($ALLOWED_DOMAINS as $domain) {
        if ($host === $domain || strpos($host, $domain) !== false) {
            return true;
        }
    }
    
    return false;
}

function checkRateLimit() {
    global $RATE_LIMIT_REQUESTS, $RATE_LIMIT_WINDOW, $RATE_LIMIT_FILE;
    
    $ip = getClientIP();
    $now = time();
    
    // Lade Rate-Limit-Daten
    $rateLimits = [];
    if (file_exists($RATE_LIMIT_FILE)) {
        $content = file_get_contents($RATE_LIMIT_FILE);
        $rateLimits = json_decode($content, true) ?: [];
    }
    
    // Bereinige alte Einträge
    foreach ($rateLimits as $key => $data) {
        if ($data['window_start'] < $now - $RATE_LIMIT_WINDOW) {
            unset($rateLimits[$key]);
        }
    }
    
    // Prüfe aktuellen IP-Eintrag
    if (!isset($rateLimits[$ip])) {
        $rateLimits[$ip] = [
            'count' => 0,
            'window_start' => $now
        ];
    }
    
    // Fenster zurücksetzen wenn abgelaufen
    if ($rateLimits[$ip]['window_start'] < $now - $RATE_LIMIT_WINDOW) {
        $rateLimits[$ip] = [
            'count' => 0,
            'window_start' => $now
        ];
    }
    
    // Zähler erhöhen
    $rateLimits[$ip]['count']++;
    
    // Speichern
    file_put_contents($RATE_LIMIT_FILE, json_encode($rateLimits), LOCK_EX);
    
    // Prüfen ob Limit überschritten
    return $rateLimits[$ip]['count'] <= $RATE_LIMIT_REQUESTS;
}

// ============================================
// SICHERHEITSPRÜFUNGEN
// ============================================

// 1. Nur GET erlauben
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    logAccess('Blocked: Invalid method ' . $_SERVER['REQUEST_METHOD'], true);
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

// 2. Referrer prüfen
if (!checkReferrer()) {
    logAccess('Blocked: Invalid referrer ' . ($_SERVER['HTTP_REFERER'] ?? 'none'), true);
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden: Invalid origin']);
    exit();
}

// 3. Rate-Limiting prüfen
if (!checkRateLimit()) {
    logAccess('Blocked: Rate limit exceeded', true);
    http_response_code(429);
    echo json_encode(['error' => 'Too many requests. Please wait and try again.']);
    exit();
}

// 4. URL prüfen
$url = isset($_GET['url']) ? $_GET['url'] : '';

if (empty($url)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing URL parameter']);
    exit();
}

// 5. Nur Yahoo Finance URLs erlauben (Sicherheit)
$allowedHosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
$parsedUrl = parse_url($url);
$urlHost = $parsedUrl['host'] ?? '';

if (!in_array($urlHost, $allowedHosts)) {
    logAccess('Blocked: Invalid target URL ' . $url, true);
    http_response_code(400);
    echo json_encode(['error' => 'Invalid URL. Only Yahoo Finance URLs allowed.']);
    exit();
}

// ============================================
// PROXY REQUEST
// ============================================

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept: application/json',
        'Accept-Language: en-US,en;q=0.9',
    ],
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

// Fehlerbehandlung
if ($error) {
    logAccess('cURL error: ' . $error, true);
    http_response_code(500);
    echo json_encode(['error' => 'Proxy request failed']);
    exit();
}

// Response weiterleiten
http_response_code($httpCode);
echo $response;
