<?php
/**
 * Server State Manager (PHP)
 * Verwaltet den App-State als JSON-Dateien pro Session.
 * Jeder Browser/Client bekommt eine eigene Session-ID und damit
 * einen komplett isolierten State (Portfolio, Orders, Einstellungen).
 */

define('DATA_DIR', __DIR__ . '/data');

// Ensure data directory exists
if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}

// Session-ID Validierung: Alphanumerisch + Bindestrich, max 64 Zeichen
// Akzeptiert sowohl alte 12-Zeichen IDs als auch volle UUIDs
function isValidSessionId(string $sessionId): bool {
    return !empty($sessionId) && preg_match('/^[a-zA-Z0-9_-]{1,64}$/', $sessionId);
}

function validateSessionId(string $sessionId): string {
    if (!isValidSessionId($sessionId)) {
        throw new \InvalidArgumentException("Ungültige Session-ID: {$sessionId}");
    }
    return $sessionId;
}

function getStateFilePath(string $sessionId): string {
    $safeId = validateSessionId($sessionId);
    return DATA_DIR . "/state-{$safeId}.json";
}

// Keine Migration mehr zu 'default' – die default-Session wird nicht mehr verwendet.
// state-default.json verbleibt als tote Datei und wird von listSessions() ignoriert.

function getDefaultState(): array {
    return [
        'settings' => [
            'budget' => 1000,
            'strategy' => 'middle',
            'riskTolerance' => 'medium',
            'watchlist' => ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'],
            'notifications' => ['email' => ['enabled' => false], 'telegram' => ['enabled' => false]],
            'apiKeys' => ['claude' => '', 'openai' => '', 'gemini' => '', 'marketData' => ''],
            'aiProvider' => 'gemini',
            'claudeModel' => 'claude-opus-4-6',
            'openaiModel' => 'gpt-5.2',
            'geminiModel' => 'gemini-2.5-flash',
            'customPrompt' => '',
        ],
        'userPositions' => [],
        'cashBalance' => 0,
        'initialCapital' => 0,
        'previousProfit' => 0,
        'watchlist' => [],
        'signals' => [],
        'orders' => [],
        'orderSettings' => [
            'autoExecute' => false,
            'checkIntervalSeconds' => 30,
            'transactionFeeFlat' => 0,
            'transactionFeePercent' => 0,
        ],
        'autopilotSettings' => [
            'enabled' => false,
            'mode' => 'suggest-only',
            'intervalMinutes' => 240,
            'activeHoursOnly' => true,
            'maxTradesPerCycle' => 3,
            'maxPositionPercent' => 20,
            'minCashReservePercent' => 10,
            'minConfidence' => 70,
            'allowBuy' => true,
            'allowSell' => true,
            'allowNewPositions' => false,
            'watchlistOnly' => true,
        ],
        'autopilotLog' => [],
        'autopilotState' => [
            'isRunning' => false,
            'lastRunAt' => null,
            'nextRunAt' => null,
            'cycleCount' => 0,
            'totalOrdersCreated' => 0,
            'totalOrdersExecuted' => 0,
        ],
        'lastAnalysis' => null,
        'lastAnalysisDate' => null,
        'analysisHistory' => [],
        'portfolios' => [],
        'activePortfolioId' => null,
        'priceAlerts' => [],
    ];
}

// Per-Session Cache und Versionierung
$sessionCache = [];
$CACHE_TTL = 1; // 1 second

function getStateVersion(string $sessionId): int {
    global $sessionCache;
    $safeId = validateSessionId($sessionId);
    return $sessionCache[$safeId]['version'] ?? 0;
}

/**
 * Alle aktiven Session-IDs auflisten
 */
function listSessions(): array {
    $files = glob(DATA_DIR . '/state-*.json');
    if ($files === false) return [];

    $sessions = [];
    foreach ($files as $file) {
        $basename = basename($file);
        $id = preg_replace('/^state-(.+)\.json$/', '$1', $basename);
        // 'default' Session überspringen – sie enthält keine eigenen User-Daten
        if ($id === 'default') continue;
        if (preg_match('/^[a-zA-Z0-9_-]{1,64}$/', $id)) {
            $sessions[] = $id;
        }
    }
    return $sessions;
}

/**
 * Deep merge two arrays recursively
 */
function deepMerge(array $base, array $override): array {
    $merged = $base;
    foreach ($override as $key => $value) {
        if (is_array($value) && isset($merged[$key]) && is_array($merged[$key])
            && !array_is_list($value) && !array_is_list($merged[$key])) {
            $merged[$key] = deepMerge($merged[$key], $value);
        } else {
            $merged[$key] = $value;
        }
    }
    return $merged;
}

/**
 * State aus Datei laden (mit Cache), session-basiert
 */
function loadState(string $sessionId): array {
    global $sessionCache, $CACHE_TTL;
    $safeId = validateSessionId($sessionId);
    $now = microtime(true);

    if (isset($sessionCache[$safeId]) && ($now - $sessionCache[$safeId]['readTime']) < $CACHE_TTL) {
        return $sessionCache[$safeId]['state'];
    }

    $stateFile = getStateFilePath($safeId);
    try {
        if (file_exists($stateFile)) {
            $raw = file_get_contents($stateFile);
            $parsed = json_decode($raw, true);
            if ($parsed !== null) {
                $stateData = $parsed['state'] ?? $parsed;
                $state = deepMerge(getDefaultState(), $stateData);
                $version = $parsed['stateVersion'] ?? ($sessionCache[$safeId]['version'] ?? 0);
                $sessionCache[$safeId] = ['state' => $state, 'readTime' => $now, 'version' => $version];
                return $state;
            }
        }
    } catch (\Throwable $e) {
        error_log("[StateManager] Fehler beim Laden (Session {$safeId}): " . $e->getMessage());
    }

    $state = getDefaultState();
    $sessionCache[$safeId] = ['state' => $state, 'readTime' => $now, 'version' => 0];
    return $state;
}

/**
 * State atomar speichern (temp-file + rename)
 */
function saveState(array $state, string $sessionId): void {
    global $sessionCache;
    $safeId = validateSessionId($sessionId);

    $cached = $sessionCache[$safeId] ?? null;
    $newVersion = ($cached['version'] ?? 0) + 1;

    $data = json_encode([
        'version' => '1.0.0',
        'stateVersion' => $newVersion,
        'sessionId' => $safeId,
        'lastModified' => gmdate('Y-m-d\TH:i:s\Z'),
        'source' => 'server-php',
        'state' => $state,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

    $stateFile = getStateFilePath($safeId);
    $tmpFile = $stateFile . '.tmp';
    file_put_contents($tmpFile, $data, LOCK_EX);
    rename($tmpFile, $stateFile);

    $sessionCache[$safeId] = ['state' => $state, 'readTime' => microtime(true), 'version' => $newVersion];
}

/**
 * Cache invalidieren
 */
function invalidateCache(string $sessionId): void {
    global $sessionCache;
    $safeId = validateSessionId($sessionId);
    unset($sessionCache[$safeId]);
}

/**
 * Intelligenter Merge: Client-State mit Server-State
 */
function mergeClientState(array $clientState, int $clientVersion, string $sessionId): array {
    $safeId = validateSessionId($sessionId);
    $current = loadState($safeId);
    $currentVersion = getStateVersion($safeId);
    $conflict = $clientVersion > 0 && $clientVersion < $currentVersion;

    if ($conflict) {
        error_log("[StateManager] Conflict (Session {$safeId}): Client v{$clientVersion} vs Server v{$currentVersion} – merging");
        $merged = smartMerge($current, $clientState);
        saveState($merged, $safeId);
        return ['merged' => $merged, 'conflict' => true, 'serverVersion' => getStateVersion($safeId)];
    } else {
        $merged = deepMerge($current, $clientState);
        saveState($merged, $safeId);
        return ['merged' => $merged, 'conflict' => false, 'serverVersion' => getStateVersion($safeId)];
    }
}

/**
 * Smart Merge: Kombiniert Server-State und Client-State intelligent.
 */
function smartMerge(array $server, array $client): array {
    $merged = $server;

    // Settings: Client gewinnt
    if (isset($client['settings'])) {
        $merged['settings'] = array_merge($server['settings'] ?? [], $client['settings']);
    }

    // Positionen: Per ID mergen
    if (isset($client['userPositions'])) {
        $serverPosMap = [];
        foreach ($server['userPositions'] as $p) {
            $serverPosMap[$p['id']] = $p;
        }
        $mergedPositions = $server['userPositions'];
        foreach ($client['userPositions'] as $clientPos) {
            if (!isset($serverPosMap[$clientPos['id']])) {
                $mergedPositions[] = $clientPos;
            }
        }
        $merged['userPositions'] = $mergedPositions;
    }

    // Orders: Per ID mergen
    if (isset($client['orders'])) {
        $serverOrderMap = [];
        foreach ($server['orders'] as $o) {
            $serverOrderMap[$o['id']] = $o;
        }
        $mergedOrders = $server['orders'];
        $statusPriority = ['pending' => 0, 'active' => 1, 'executed' => 2, 'cancelled' => 2, 'expired' => 2];
        foreach ($client['orders'] as $clientOrder) {
            if (!isset($serverOrderMap[$clientOrder['id']])) {
                $mergedOrders[] = $clientOrder;
            } else {
                $serverOrder = $serverOrderMap[$clientOrder['id']];
                $clientPrio = $statusPriority[$clientOrder['status']] ?? 0;
                $serverPrio = $statusPriority[$serverOrder['status']] ?? 0;
                if ($clientPrio > $serverPrio) {
                    $idx = array_search($clientOrder['id'], array_column($mergedOrders, 'id'));
                    if ($idx !== false) {
                        $mergedOrders[$idx] = $clientOrder;
                    }
                }
            }
        }
        $merged['orders'] = array_values($mergedOrders);
    }

    // Watchlist: Union
    if (isset($client['watchlist'])) {
        $serverSymbols = array_column($server['watchlist'], 'symbol');
        foreach ($client['watchlist'] as $item) {
            if (!in_array($item['symbol'], $serverSymbols)) {
                $merged['watchlist'][] = $item;
            }
        }
    }

    // Signals: Union per ID
    if (isset($client['signals'])) {
        $serverSignalIds = array_column($server['signals'], 'id');
        foreach ($client['signals'] as $sig) {
            if (!in_array($sig['id'] ?? '', $serverSignalIds)) {
                $merged['signals'][] = $sig;
            }
        }
    }

    // Autopilot-Settings: Client gewinnt
    if (isset($client['autopilotSettings'])) {
        $merged['autopilotSettings'] = array_merge($server['autopilotSettings'] ?? [], $client['autopilotSettings']);
    }

    // Autopilot-Log: Union per ID
    if (isset($client['autopilotLog'])) {
        $serverLogIds = array_column($server['autopilotLog'], 'id');
        foreach ($client['autopilotLog'] as $entry) {
            if (!in_array($entry['id'] ?? '', $serverLogIds)) {
                $merged['autopilotLog'][] = $entry;
            }
        }
        usort($merged['autopilotLog'], function ($a, $b) {
            return strtotime($b['timestamp'] ?? '0') - strtotime($a['timestamp'] ?? '0');
        });
        $merged['autopilotLog'] = array_slice($merged['autopilotLog'], 0, 200);
    }

    // Order-Settings: Client gewinnt
    if (isset($client['orderSettings'])) {
        $merged['orderSettings'] = array_merge($server['orderSettings'] ?? [], $client['orderSettings']);
    }

    // Price Alerts: Per ID mergen
    if (isset($client['priceAlerts'])) {
        $serverAlertIds = array_column($server['priceAlerts'], 'id');
        foreach ($client['priceAlerts'] as $alert) {
            if (!in_array($alert['id'] ?? '', $serverAlertIds)) {
                $merged['priceAlerts'][] = $alert;
            }
        }
    }

    // Analysis: Neuer gewinnt
    if (!empty($client['lastAnalysisDate']) && !empty($server['lastAnalysisDate'])) {
        if (strtotime($client['lastAnalysisDate']) > strtotime($server['lastAnalysisDate'])) {
            $merged['lastAnalysis'] = $client['lastAnalysis'] ?? $server['lastAnalysis'];
            $merged['lastAnalysisDate'] = $client['lastAnalysisDate'];
        }
    } elseif (!empty($client['lastAnalysisDate'])) {
        $merged['lastAnalysis'] = $client['lastAnalysis'] ?? null;
        $merged['lastAnalysisDate'] = $client['lastAnalysisDate'];
    }

    // Portfolios, capital: Client gewinnt
    if (isset($client['portfolios'])) $merged['portfolios'] = $client['portfolios'];
    if (isset($client['activePortfolioId'])) $merged['activePortfolioId'] = $client['activePortfolioId'];
    if (isset($client['initialCapital'])) $merged['initialCapital'] = $client['initialCapital'];
    if (isset($client['previousProfit'])) $merged['previousProfit'] = $client['previousProfit'];

    return $merged;
}

/**
 * State partiell updaten
 */
function updateState(array $partial, string $sessionId): array {
    $current = loadState($sessionId);
    $updated = array_merge($current, $partial);
    saveState($updated, $sessionId);
    return $updated;
}

/**
 * Order hinzufügen (mit Duplikat-Check)
 */
function addOrder(array $order, string $sessionId): void {
    $s = loadState($sessionId);

    $isBuy = in_array($order['orderType'], ['limit-buy', 'stop-buy']);
    $isSell = in_array($order['orderType'], ['limit-sell', 'stop-loss']);

    $sameDirection = array_filter($s['orders'], function ($o) use ($order, $isBuy, $isSell) {
        if (!in_array($o['status'], ['active', 'pending'])) return false;
        if ($o['symbol'] !== $order['symbol']) return false;
        if ($isBuy && in_array($o['orderType'], ['limit-buy', 'stop-buy'])) return true;
        if ($isSell && in_array($o['orderType'], ['limit-sell', 'stop-loss'])) return true;
        return false;
    });

    foreach ($sameDirection as $o) {
        if ($o['triggerPrice'] == 0 || $order['triggerPrice'] == 0) continue;
        $priceDiff = abs($o['triggerPrice'] - $order['triggerPrice']) / $o['triggerPrice'];
        if ($priceDiff <= 0.05) {
            error_log("[StateManager] Order abgelehnt: Duplikat für {$order['symbol']}");
            return;
        }
    }

    $s['orders'][] = $order;
    saveState($s, $sessionId);
}

/**
 * Order stornieren
 */
function cancelOrder(string $orderId, string $sessionId): void {
    $s = loadState($sessionId);
    foreach ($s['orders'] as &$o) {
        if ($o['id'] === $orderId) {
            $o['status'] = 'cancelled';
        }
    }
    unset($o);
    saveState($s, $sessionId);
}

/**
 * Order ausführen
 */
function executeOrder(string $orderId, float $executedPrice, string $sessionId): void {
    $s = loadState($sessionId);
    $orderIdx = null;
    foreach ($s['orders'] as $i => $o) {
        if ($o['id'] === $orderId) {
            $orderIdx = $i;
            break;
        }
    }
    if ($orderIdx === null) return;

    $order = &$s['orders'][$orderIdx];
    if (!in_array($order['status'], ['active', 'pending'])) return;

    // Trigger validieren
    $triggerMet = true;
    switch ($order['orderType']) {
        case 'limit-buy': $triggerMet = $executedPrice <= $order['triggerPrice']; break;
        case 'limit-sell': $triggerMet = $executedPrice >= $order['triggerPrice']; break;
        case 'stop-loss': $triggerMet = $executedPrice <= $order['triggerPrice']; break;
        case 'stop-buy': $triggerMet = $executedPrice >= $order['triggerPrice']; break;
    }
    if (!$triggerMet) {
        error_log("[executeOrder] Trigger nicht erfüllt für {$order['symbol']}");
        return;
    }

    $totalCost = $executedPrice * $order['quantity'];
    $fee = ($s['orderSettings']['transactionFeeFlat'] ?? 0) +
           $totalCost * ($s['orderSettings']['transactionFeePercent'] ?? 0) / 100;

    if (in_array($order['orderType'], ['limit-buy', 'stop-buy'])) {
        // Kauf
        if ($totalCost + $fee > $s['cashBalance']) {
            $order['status'] = 'cancelled';
            $order['note'] = ($order['note'] ?? '') . ' ❌ Storniert: Nicht genug Cash';
            saveState($s, $sessionId);
            return;
        }
        $s['cashBalance'] = round($s['cashBalance'] - $totalCost - $fee, 2);

        $existingIdx = null;
        foreach ($s['userPositions'] as $pi => $p) {
            if ($p['symbol'] === $order['symbol']) {
                $existingIdx = $pi;
                break;
            }
        }

        if ($existingIdx !== null) {
            $existing = &$s['userPositions'][$existingIdx];
            $totalQty = $existing['quantity'] + $order['quantity'];
            $existing['buyPrice'] = ($existing['buyPrice'] * $existing['quantity'] + $executedPrice * $order['quantity']) / $totalQty;
            $existing['quantity'] = $totalQty;
            $existing['currentPrice'] = $executedPrice;
        } else {
            $s['userPositions'][] = [
                'id' => generateUUID(),
                'symbol' => $order['symbol'],
                'name' => $order['name'],
                'quantity' => $order['quantity'],
                'buyPrice' => $executedPrice,
                'currentPrice' => $executedPrice,
                'currency' => 'EUR',
                'useYahooPrice' => true,
            ];
        }
    } else {
        // Verkauf
        $existingIdx = null;
        foreach ($s['userPositions'] as $pi => $p) {
            if ($p['symbol'] === $order['symbol']) {
                $existingIdx = $pi;
                break;
            }
        }
        if ($existingIdx === null || $s['userPositions'][$existingIdx]['quantity'] < $order['quantity']) {
            $order['status'] = 'cancelled';
            $order['note'] = ($order['note'] ?? '') . ' ❌ Storniert: Nicht genug Aktien';
            saveState($s, $sessionId);
            return;
        }
        $s['cashBalance'] = round($s['cashBalance'] + $totalCost - $fee, 2);
        $s['userPositions'][$existingIdx]['quantity'] -= $order['quantity'];
        if ($s['userPositions'][$existingIdx]['quantity'] <= 0) {
            array_splice($s['userPositions'], $existingIdx, 1);
        } else {
            $s['userPositions'][$existingIdx]['currentPrice'] = $executedPrice;
        }
    }

    $order['status'] = 'executed';
    $order['executedAt'] = gmdate('Y-m-d\TH:i:s\Z');
    $order['executedPrice'] = $executedPrice;
    saveState($s, $sessionId);
}

/**
 * Prüfe ob mindestens eine State-Datei existiert
 */
function stateFileExists(): bool {
    $files = glob(DATA_DIR . '/state-*.json');
    return !empty($files);
}

/**
 * UUID v4 generieren
 */
function generateUUID(): string {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}
