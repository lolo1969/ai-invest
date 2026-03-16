<?php
/**
 * Server-seitiger Autopilot-Runner (PHP)
 * Repliziert die Logik aus autopilotRunner.ts für den PHP-Server-Kontext.
 */

require_once __DIR__ . '/stateManager.php';
require_once __DIR__ . '/marketData.php';

// ─── Helpers ──────────────────────────────────────────

function createLogEntry(string $type, string $message, ?string $details = null, ?string $symbol = null, ?string $orderId = null): array {
    return [
        'id' => generateUUID(),
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        'type' => $type,
        'message' => $message,
        'details' => $details,
        'symbol' => $symbol,
        'orderId' => $orderId,
    ];
}

function getTimeInZone(string $tz): array {
    $dt = new DateTimeImmutable('now', new DateTimeZone($tz));
    return [
        'hours' => (int)$dt->format('G'),
        'minutes' => (int)$dt->format('i'),
        'day' => (int)$dt->format('w'),
    ];
}

function isMarketOpen(): array {
    $eu = getTimeInZone('Europe/Berlin');
    if ($eu['day'] >= 1 && $eu['day'] <= 5) {
        $euTime = $eu['hours'] * 60 + $eu['minutes'];
        if ($euTime >= 9 * 60 && $euTime < 17 * 60 + 30) {
            return ['open' => true, 'market' => 'EU (Xetra)'];
        }
    }
    $us = getTimeInZone('America/New_York');
    if ($us['day'] >= 1 && $us['day'] <= 5) {
        $usTime = $us['hours'] * 60 + $us['minutes'];
        if ($usTime >= 9 * 60 + 30 && $usTime < 16 * 60) {
            return ['open' => true, 'market' => 'US (NYSE)'];
        }
    }
    return ['open' => false];
}

// ─── AI Service (direkte API-Calls) ──────────────────

function callAI(string $prompt, array $appSettings): string {
    $provider = $appSettings['aiProvider'] ?? 'gemini';
    $apiKeys = $appSettings['apiKeys'] ?? [];

    $apiKey = match ($provider) {
        'openai' => $apiKeys['openai'] ?? '',
        'gemini' => $apiKeys['gemini'] ?? '',
        default => $apiKeys['claude'] ?? '',
    };

    if (empty($apiKey)) throw new \RuntimeException('Kein API-Key konfiguriert');

    if ($provider === 'claude') {
        $response = httpPostJSON('https://api.anthropic.com/v1/messages', [
            'model' => $appSettings['claudeModel'] ?? 'claude-opus-4-6',
            'max_tokens' => 32768,
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ], [
            'Content-Type: application/json',
            "x-api-key: {$apiKey}",
            'anthropic-version: 2023-06-01',
        ]);
        return $response['content'][0]['text'] ?? '';
    }

    if ($provider === 'openai') {
        $response = httpPostJSON('https://api.openai.com/v1/chat/completions', [
            'model' => $appSettings['openaiModel'] ?? 'gpt-5.2',
            'messages' => [['role' => 'user', 'content' => $prompt]],
            'max_tokens' => 16384,
            'temperature' => 0.3,
        ], [
            'Content-Type: application/json',
            "Authorization: Bearer {$apiKey}",
        ]);
        return $response['choices'][0]['message']['content'] ?? '';
    }

    if ($provider === 'gemini') {
        $model = $appSettings['geminiModel'] ?? 'gemini-2.5-flash';
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";
        $response = httpPostJSON($url, [
            'contents' => [['parts' => [['text' => $prompt]]]],
            'generationConfig' => ['temperature' => 0.3, 'maxOutputTokens' => 16384],
        ], ['Content-Type: application/json']);
        return $response['candidates'][0]['content']['parts'][0]['text'] ?? '';
    }

    throw new \RuntimeException("Unbekannter AI-Provider: {$provider}");
}

function httpPostJSON(string $url, array $body, array $headers = [], int $maxRetries = 2): array {
    for ($attempt = 0; $attempt <= $maxRetries; $attempt++) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($body),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 120,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false) {
            if ($attempt < $maxRetries) {
                $wait = 5 * pow(2, $attempt);
                error_log("[AI API] Netzwerkfehler - Retry " . ($attempt + 1) . "/{$maxRetries} in {$wait}s...");
                sleep($wait);
                continue;
            }
            throw new \RuntimeException('AI API Netzwerkfehler');
        }

        if (in_array($httpCode, [429, 529, 503]) && $attempt < $maxRetries) {
            $wait = 5 * pow(2, $attempt);
            error_log("[AI API] Status {$httpCode} - Retry " . ($attempt + 1) . "/{$maxRetries} in {$wait}s...");
            sleep($wait);
            continue;
        }

        if ($httpCode >= 400) {
            throw new \RuntimeException("AI API Error (HTTP {$httpCode}): " . substr($response, 0, 500));
        }

        $decoded = json_decode($response, true);
        if ($decoded === null) {
            throw new \RuntimeException('AI API Antwort konnte nicht geparst werden');
        }
        return $decoded;
    }
    throw new \RuntimeException('Max retries exceeded');
}

// ─── AI Response Parser ──────────────────────────────

function parseAIResponse(string $content, array $stocks, string $strategy = 'middle'): array {
    // Extract JSON from response
    if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $content, $matches)) {
        $jsonStr = $matches[1];
    } elseif (preg_match('/(\{[\s\S]*\})/', $content, $matches)) {
        $jsonStr = $matches[1];
    } else {
        return [
            'signals' => [],
            'marketSummary' => substr($content, 0, 500),
            'recommendations' => [],
            'warnings' => [],
            'suggestedOrders' => [],
            'analyzedAt' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
    }

    $parsed = json_decode(trim($jsonStr), true);
    if (!$parsed) {
        return [
            'signals' => [],
            'marketSummary' => substr($content, 0, 500),
            'recommendations' => [],
            'warnings' => [],
            'suggestedOrders' => [],
            'analyzedAt' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
    }

    $signals = [];
    foreach ($parsed['signals'] ?? [] as $s) {
        $stockData = null;
        foreach ($stocks as $st) {
            if ($st['symbol'] === ($s['symbol'] ?? '')) {
                $stockData = $st;
                break;
            }
        }
        if (!$stockData) {
            $stockData = [
                'symbol' => $s['symbol'] ?? '', 'name' => $s['name'] ?? ($s['symbol'] ?? ''),
                'price' => 0, 'change' => 0, 'changePercent' => 0, 'currency' => 'EUR', 'exchange' => '',
            ];
        }
        $signals[] = [
            'id' => generateUUID(),
            'stock' => $stockData,
            'signal' => $s['signal'] ?? 'HOLD',
            'strategy' => $strategy,
            'confidence' => $s['confidence'] ?? 50,
            'reasoning' => $s['reasoning'] ?? '',
            'idealEntryPrice' => $s['idealEntryPrice'] ?? null,
            'targetPrice' => $s['targetPrice'] ?? null,
            'stopLoss' => $s['stopLoss'] ?? null,
            'createdAt' => gmdate('Y-m-d\TH:i:s\Z'),
            'riskLevel' => $s['riskLevel'] ?? 'medium',
        ];
    }

    $suggestedOrders = [];
    foreach ($parsed['suggestedOrders'] ?? ($parsed['orders'] ?? []) as $o) {
        $suggestedOrders[] = [
            'symbol' => $o['symbol'] ?? '',
            'orderType' => $o['orderType'] ?? ($o['type'] ?? 'limit-buy'),
            'quantity' => $o['quantity'] ?? 0,
            'triggerPrice' => $o['triggerPrice'] ?? ($o['price'] ?? 0),
            'reasoning' => $o['reasoning'] ?? ($o['reason'] ?? ''),
        ];
    }

    return [
        'signals' => $signals,
        'marketSummary' => $parsed['marketSummary'] ?? ($parsed['summary'] ?? substr($content, 0, 500)),
        'recommendations' => $parsed['recommendations'] ?? [],
        'warnings' => $parsed['warnings'] ?? [],
        'suggestedOrders' => $suggestedOrders,
        'analyzedAt' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

// ─── Prompt Builder ──────────────────────────────────

function buildAnalysisPrompt(array $data): string {
    $strategyMap = [
        'short' => 'Kurzfristig (Tage bis Wochen)',
        'middle' => 'Mittelfristig (Wochen bis Monate)',
        'long' => 'Langfristig (Monate bis Jahre)',
    ];

    $stocks = $data['stocks'] ?? [];
    $strategy = $data['strategy'] ?? 'middle';
    $riskTolerance = $data['riskTolerance'] ?? 'medium';
    $budget = $data['budget'] ?? 0;
    $positions = $data['positions'] ?? [];
    $activeOrders = $data['activeOrders'] ?? [];
    $customPrompt = $data['customPrompt'] ?? '';

    // Technische Indikatoren
    $indicatorsText = '';
    foreach ($stocks as $stock) {
        if (isset($stock['technicalIndicators'])) {
            $ti = $stock['technicalIndicators'];
            $indicatorsText .= "\n{$stock['symbol']}: ";
            if ($ti['rsi14'] !== null) $indicatorsText .= sprintf("RSI(14)=%.1f ", $ti['rsi14']);
            if ($ti['macd'] !== null) $indicatorsText .= sprintf("MACD=%.2f ", $ti['macd']);
            if ($ti['sma50'] !== null) $indicatorsText .= sprintf("SMA50=%.2f ", $ti['sma50']);
            if ($ti['sma200'] !== null) $indicatorsText .= sprintf("SMA200=%.2f ", $ti['sma200']);
        }
    }

    $prompt = "Du bist ein professioneller KI-Investmentberater. Analysiere folgende Aktien und gib Handlungsempfehlungen.

STRATEGIE: " . ($strategyMap[$strategy] ?? $strategy) . "
RISIKOTOLERANZ: {$riskTolerance}
VERFÜGBARES BUDGET: " . number_format($budget, 2) . " EUR";

    if (!empty($data['initialCapital'])) {
        $prompt .= "\nSTARTKAPITAL: " . number_format($data['initialCapital'], 2) . " EUR";
    }
    if (!empty($data['totalAssets'])) {
        $prompt .= "\nGESAMTVERMÖGEN: " . number_format($data['totalAssets'], 2) . " EUR";
    }
    if (isset($data['totalProfit'])) {
        $prompt .= "\nGESAMTGEWINN: " . number_format($data['totalProfit'], 2) . " EUR (" . number_format($data['totalProfitPercent'] ?? 0, 1) . "%)";
    }
    if (!empty($data['transactionFeeFlat']) || !empty($data['transactionFeePercent'])) {
        $prompt .= "\nTRANSAKTIONSGEBÜHREN: " . ($data['transactionFeeFlat'] ?? 0) . "€ fix + " . ($data['transactionFeePercent'] ?? 0) . "% variabel";
    }

    $prompt .= "\n\nAKTIEN ZUR ANALYSE:\n";
    foreach ($stocks as $s) {
        $line = "{$s['symbol']} ({$s['name']}): " . number_format($s['price'], 2) . " EUR, Veränderung: " . number_format($s['changePercent'], 2) . "%";
        if (isset($s['week52High'])) {
            $line .= ", 52W: " . number_format($s['week52Low'], 2) . "-" . number_format($s['week52High'], 2);
        }
        $prompt .= $line . "\n";
    }

    if ($indicatorsText) {
        $prompt .= "\nTECHNISCHE INDIKATOREN:{$indicatorsText}\n";
    }

    if (!empty($positions)) {
        $prompt .= "\nAKTUELLES PORTFOLIO:\n";
        foreach ($positions as $p) {
            $prompt .= "{$p['symbol']} ({$p['name']}): {$p['quantity']}x @ " . number_format($p['buyPrice'], 2) . " EUR (aktuell: " . number_format($p['currentPrice'], 2) . " EUR)\n";
        }
    }

    if (!empty($activeOrders)) {
        $prompt .= "\nAKTIVE ORDERS:\n";
        foreach ($activeOrders as $o) {
            $prompt .= strtoupper($o['orderType']) . " {$o['quantity']}x {$o['symbol']} @ " . number_format($o['triggerPrice'], 2) . " EUR\n";
        }
    }

    if ($customPrompt) {
        $prompt .= "\nZUSÄTZLICHE ANWEISUNGEN:\n{$customPrompt}\n";
    }

    $prompt .= '
Antworte AUSSCHLIESSLICH als JSON im folgenden Format:
```json
{
  "marketSummary": "Kurze Marktanalyse...",
  "signals": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "signal": "BUY",
      "confidence": 75,
      "reasoning": "Begründung...",
      "idealEntryPrice": 150.00,
      "targetPrice": 170.00,
      "stopLoss": 140.00,
      "riskLevel": "medium"
    }
  ],
  "suggestedOrders": [
    {
      "symbol": "AAPL",
      "orderType": "limit-buy",
      "quantity": 5,
      "triggerPrice": 150.00,
      "reasoning": "Begründung für die Order..."
    }
  ],
  "recommendations": ["Empfehlung 1", "Empfehlung 2"],
  "warnings": ["Warnung 1"]
}
```

WICHTIG:
- orderType muss eines sein: "limit-buy", "limit-sell", "stop-loss", "stop-buy"
- Alle Preise in EUR
- quantity muss eine ganze Zahl > 0 sein
- confidence von 0-100
- Bei Verkaufsorders (limit-sell, stop-loss): Nur für Aktien im Portfolio
- triggerPrice: Der Preis bei dem die Order ausgelöst werden soll';

    return $prompt;
}

// ─── Safety Rules ────────────────────────────────────

function applySafetyRules(array $suggestedOrders, array $currentState, array &$logEntries): array {
    $settings = $currentState['autopilotSettings'];
    $cashBalance = $currentState['cashBalance'] ?? 0;
    $userPositions = $currentState['userPositions'] ?? [];
    $orders = $currentState['orders'] ?? [];
    $orderSettings = $currentState['orderSettings'] ?? [];

    $totalPortfolioValue = $cashBalance;
    foreach ($userPositions as $p) {
        $totalPortfolioValue += ($p['currentPrice'] ?? 0) * ($p['quantity'] ?? 0);
    }

    // Reserviertes Cash durch aktive Buy-Orders
    $reservedCash = 0;
    foreach ($orders as $o) {
        if (in_array($o['status'], ['active', 'pending']) && in_array($o['orderType'], ['limit-buy', 'stop-buy'])) {
            $oCost = $o['triggerPrice'] * $o['quantity'];
            $oFee = ($orderSettings['transactionFeeFlat'] ?? 0) + $oCost * ($orderSettings['transactionFeePercent'] ?? 0) / 100;
            $reservedCash += $oCost + $oFee;
        }
    }
    $availableCash = $cashBalance - $reservedCash;

    // Reservierte Aktien durch Sell-Orders
    $reservedShares = [];
    foreach ($orders as $o) {
        if (in_array($o['status'], ['active', 'pending']) && in_array($o['orderType'], ['limit-sell', 'stop-loss'])) {
            $reservedShares[$o['symbol']] = ($reservedShares[$o['symbol']] ?? 0) + $o['quantity'];
        }
    }

    $approved = [];
    $tradesThisCycle = 0;

    foreach ($suggestedOrders as $order) {
        if ($tradesThisCycle >= ($settings['maxTradesPerCycle'] ?? 3)) {
            $logEntries[] = createLogEntry('skipped', "⏭️ {$order['symbol']}: Max. Trades pro Zyklus erreicht", null, $order['symbol']);
            continue;
        }

        $isBuy = in_array($order['orderType'], ['limit-buy', 'stop-buy']);
        $isSell = in_array($order['orderType'], ['limit-sell', 'stop-loss']);

        if ($isBuy && empty($settings['allowBuy'])) {
            $logEntries[] = createLogEntry('skipped', "⏭️ {$order['symbol']}: Käufe deaktiviert", null, $order['symbol']);
            continue;
        }
        if ($isSell && empty($settings['allowSell'])) {
            $logEntries[] = createLogEntry('skipped', "⏭️ {$order['symbol']}: Verkäufe deaktiviert", null, $order['symbol']);
            continue;
        }

        if ($isBuy && empty($settings['allowNewPositions'])) {
            $existing = array_filter($userPositions, fn($p) => $p['symbol'] === $order['symbol']);
            if (empty($existing)) {
                $logEntries[] = createLogEntry('skipped', "⏭️ {$order['symbol']}: Neue Positionen nicht erlaubt", null, $order['symbol']);
                continue;
            }
        }

        if (!empty($settings['watchlistOnly'])) {
            $watchlistSymbols = $currentState['settings']['watchlist'] ?? [];
            $portfolioSymbols = array_column($userPositions, 'symbol');
            if (!in_array($order['symbol'], $watchlistSymbols) && !in_array($order['symbol'], $portfolioSymbols)) {
                $logEntries[] = createLogEntry('skipped', "⏭️ {$order['symbol']}: Nicht in Watchlist/Portfolio", null, $order['symbol']);
                continue;
            }
        }

        // Position-Größe
        if ($isBuy && $totalPortfolioValue > 0) {
            $orderValue = $order['triggerPrice'] * $order['quantity'];
            $existingValue = 0;
            foreach ($userPositions as $p) {
                if ($p['symbol'] === $order['symbol']) {
                    $existingValue += ($p['currentPrice'] ?? 0) * ($p['quantity'] ?? 0);
                }
            }
            $positionPercent = (($existingValue + $orderValue) / $totalPortfolioValue) * 100;
            $maxPercent = $settings['maxPositionPercent'] ?? 20;
            if ($positionPercent > $maxPercent) {
                $logEntries[] = createLogEntry('skipped', "⏭️ {$order['symbol']}: Position wäre " . number_format($positionPercent, 1) . "% > Max {$maxPercent}%", null, $order['symbol']);
                continue;
            }
        }

        // Cash prüfen
        if ($isBuy) {
            $orderCost = $order['triggerPrice'] * $order['quantity'];
            $orderFee = ($orderSettings['transactionFeeFlat'] ?? 0) + $orderCost * ($orderSettings['transactionFeePercent'] ?? 0) / 100;
            $totalOrderCost = $orderCost + $orderFee;
            $cashAfter = $availableCash - $totalOrderCost;
            $cashPercentAfter = $totalPortfolioValue > 0 ? ($cashAfter / $totalPortfolioValue) * 100 : 0;

            $minCash = $settings['minCashReservePercent'] ?? 10;
            if ($cashPercentAfter < $minCash) {
                $logEntries[] = createLogEntry('skipped', "⏭️ {$order['symbol']}: Cash-Reserve wäre " . number_format($cashPercentAfter, 1) . "% < Min {$minCash}%", null, $order['symbol']);
                continue;
            }
            if ($totalOrderCost > $availableCash) {
                $logEntries[] = createLogEntry('skipped', "⏭️ {$order['symbol']}: Nicht genug Cash (" . number_format($totalOrderCost, 2) . "€ > " . number_format($availableCash, 2) . "€)", null, $order['symbol']);
                continue;
            }
            $availableCash -= $totalOrderCost;
        }

        // Aktien prüfen
        if ($isSell) {
            $position = null;
            foreach ($userPositions as $p) {
                if ($p['symbol'] === $order['symbol']) {
                    $position = $p;
                    break;
                }
            }
            $reserved = $reservedShares[$order['symbol']] ?? 0;
            $available = ($position['quantity'] ?? 0) - $reserved;
            if (!$position || $available < $order['quantity']) {
                $logEntries[] = createLogEntry('skipped', "⏭️ {$order['symbol']}: Nicht genug Aktien ({$available} frei, benötigt {$order['quantity']})", null, $order['symbol']);
                continue;
            }
            $reservedShares[$order['symbol']] = $reserved + $order['quantity'];
        }

        $approved[] = $order;
        $tradesThisCycle++;
    }

    return $approved;
}

// ─── Haupt-Zyklus ────────────────────────────────────

function runAutopilotCycle(string $sessionId = 'default'): void {
    $currentState = loadState($sessionId);
    $settings = $currentState['autopilotSettings'];
    $logEntries = [];

    if (empty($settings['enabled'])) return;

    // Vollautomatisch → Auto-Ausführung sicherstellen
    if (($settings['mode'] ?? '') === 'full-auto' && empty($currentState['orderSettings']['autoExecute'])) {
        $currentState['orderSettings']['autoExecute'] = true;
    }

    $cycleId = substr(generateUUID(), 0, 8);
    $logEntries[] = createLogEntry('info', "🔄 [Server-PHP] Autopilot-Zyklus #{$cycleId} gestartet (Session: {$sessionId})");
    $currentState['autopilotState']['isRunning'] = true;
    saveState($currentState, $sessionId);

    try {
        // 0. Abgelaufene Orders bereinigen
        $now = time();
        $expiredCount = 0;
        foreach ($currentState['orders'] as &$o) {
            if (in_array($o['status'], ['active', 'pending']) && !empty($o['expiresAt']) && strtotime($o['expiresAt']) < $now) {
                $o['status'] = 'cancelled';
                $expiredCount++;
                $logEntries[] = createLogEntry('info', "⏰ Order abgelaufen: " . strtoupper($o['orderType']) . " {$o['quantity']}x {$o['symbol']}", null, $o['symbol'], $o['id']);
            }
        }
        unset($o);
        if ($expiredCount > 0) {
            $logEntries[] = createLogEntry('info', "🧹 {$expiredCount} abgelaufene Order(s) storniert");
        }

        // 0b. Doppelte Sell-Orders bereinigen
        $activeSells = array_filter($currentState['orders'], function ($o) {
            return in_array($o['status'], ['active', 'pending']) && in_array($o['orderType'], ['limit-sell', 'stop-loss']);
        });

        $sellsBySymbol = [];
        foreach ($activeSells as $o) {
            $sellsBySymbol[$o['symbol']][] = $o;
        }
        $duplicatesCancelled = 0;
        foreach ($sellsBySymbol as $symbol => $sellOrders) {
            if (count($sellOrders) <= 1) continue;
            usort($sellOrders, fn($a, $b) => strtotime($a['createdAt']) - strtotime($b['createdAt']));
            $kept = [];
            foreach ($sellOrders as $sellOrder) {
                $isDuplicate = false;
                foreach ($kept as $k) {
                    if (abs($k['triggerPrice'] - $sellOrder['triggerPrice']) / $k['triggerPrice'] <= 0.05) {
                        $isDuplicate = true;
                        break;
                    }
                }
                if ($isDuplicate) {
                    foreach ($currentState['orders'] as &$o) {
                        if ($o['id'] === $sellOrder['id']) {
                            $o['status'] = 'cancelled';
                            $duplicatesCancelled++;
                            $logEntries[] = createLogEntry('info', "🧹 Doppelte Sell-Order storniert: " . strtoupper($o['orderType']) . " {$o['quantity']}x {$symbol} @ " . number_format($o['triggerPrice'], 2) . "€", null, $symbol, $o['id']);
                            break;
                        }
                    }
                    unset($o);
                } else {
                    $kept[] = $sellOrder;
                }
            }
        }

        // 1. Marktzeiten prüfen
        $marketStatus = isMarketOpen();
        if (!empty($settings['activeHoursOnly']) && !$marketStatus['open']) {
            $logEntries[] = createLogEntry('info', '⏰ Alle Märkte geschlossen – Zyklus übersprungen');
            $currentState['autopilotState']['isRunning'] = false;
            $currentState['autopilotState']['lastRunAt'] = gmdate('Y-m-d\TH:i:s\Z');
            $currentState['autopilotLog'] = array_slice(array_merge($logEntries, $currentState['autopilotLog']), 0, 200);
            saveState($currentState, $sessionId);
            return;
        }
        if ($marketStatus['open']) {
            $logEntries[] = createLogEntry('info', "📈 Markt offen: {$marketStatus['market']}");
        }

        // 2. API-Key prüfen
        $provider = $currentState['settings']['aiProvider'] ?? 'gemini';
        $apiKey = match ($provider) {
            'openai' => $currentState['settings']['apiKeys']['openai'] ?? '',
            'gemini' => $currentState['settings']['apiKeys']['gemini'] ?? '',
            default => $currentState['settings']['apiKeys']['claude'] ?? '',
        };

        if (empty($apiKey)) {
            $logEntries[] = createLogEntry('error', '❌ Kein API-Key konfiguriert – Autopilot pausiert');
            $currentState['autopilotState']['isRunning'] = false;
            $currentState['autopilotLog'] = array_slice(array_merge($logEntries, $currentState['autopilotLog']), 0, 200);
            saveState($currentState, $sessionId);
            return;
        }

        // 3. Kursdaten laden
        $logEntries[] = createLogEntry('info', '📊 Lade aktuelle Kursdaten...');

        $portfolioSymbols = array_column($currentState['userPositions'], 'symbol');
        $watchlistSymbols = $currentState['settings']['watchlist'] ?? [];
        $allSymbols = array_values(array_unique(array_merge($portfolioSymbols, $watchlistSymbols)));

        if (empty($allSymbols)) {
            $logEntries[] = createLogEntry('warning', '⚠️ Keine Aktien in Watchlist oder Portfolio');
            $currentState['autopilotState']['isRunning'] = false;
            $currentState['autopilotState']['lastRunAt'] = gmdate('Y-m-d\TH:i:s\Z');
            $currentState['autopilotLog'] = array_slice(array_merge($logEntries, $currentState['autopilotLog']), 0, 200);
            saveState($currentState, $sessionId);
            return;
        }

        $stocks = getQuotesWithRange($allSymbols);
        $logEntries[] = createLogEntry('info', "✅ " . count($stocks) . " Kurse geladen");

        // Watchlist im State updaten
        foreach ($stocks as $stock) {
            $idx = array_search($stock['symbol'], array_column($currentState['watchlist'], 'symbol'));
            if ($idx !== false) {
                $currentState['watchlist'][$idx] = $stock;
            } else {
                $currentState['watchlist'][] = $stock;
            }
        }

        // 4. KI-Analyse
        $logEntries[] = createLogEntry('analysis', "🧠 KI-Analyse gestartet ({$provider})...");

        $portfolioVal = 0;
        foreach ($currentState['userPositions'] as $p) {
            $portfolioVal += ($p['currentPrice'] ?? 0) * ($p['quantity'] ?? 0);
        }
        $totalAssetsVal = ($currentState['cashBalance'] ?? 0) + $portfolioVal;
        $totalInvestedVal = 0;
        foreach ($currentState['userPositions'] as $p) {
            $totalInvestedVal += ($p['quantity'] ?? 0) * ($p['buyPrice'] ?? 0);
        }
        $initCap = $currentState['initialCapital'] ?? 0;
        $profitVal = $initCap > 0 ? $totalAssetsVal - $initCap : $portfolioVal - $totalInvestedVal;
        $prevProfitVal = $currentState['previousProfit'] ?? 0;
        $combinedProfit = $profitVal + $prevProfitVal;
        $profitPctVal = $initCap > 0 ? ($combinedProfit / max($initCap, 1)) * 100 : 0;
        $os = $currentState['orderSettings'] ?? [];

        // Verfügbares Cash
        $reservedCash = 0;
        foreach ($currentState['orders'] as $o) {
            if (in_array($o['status'], ['active', 'pending']) && in_array($o['orderType'], ['limit-buy', 'stop-buy'])) {
                $oCost = $o['triggerPrice'] * $o['quantity'];
                $oFee = ($os['transactionFeeFlat'] ?? 0) + $oCost * ($os['transactionFeePercent'] ?? 0) / 100;
                $reservedCash += $oCost + $oFee;
            }
        }
        $availCash = max(0, ($currentState['cashBalance'] ?? 0) - $reservedCash);

        // Positionen mit aktuellem Preis
        $currentPositions = [];
        foreach ($currentState['userPositions'] as $up) {
            $stockData = null;
            foreach ($stocks as $s) {
                if ($s['symbol'] === $up['symbol']) {
                    $stockData = $s;
                    break;
                }
            }
            $currentPrice = (!empty($up['useYahooPrice']) && $stockData) ? $stockData['price'] : $up['currentPrice'];
            $pos = $up;
            $pos['currentPrice'] = $currentPrice;
            $currentPositions[] = $pos;
        }

        $prompt = buildAnalysisPrompt([
            'stocks' => $stocks,
            'strategy' => $currentState['settings']['strategy'] ?? 'middle',
            'riskTolerance' => $currentState['settings']['riskTolerance'] ?? 'medium',
            'budget' => $availCash,
            'positions' => $currentPositions,
            'signals' => array_slice($currentState['signals'], 0, 10),
            'activeOrders' => array_filter($currentState['orders'], fn($o) => $o['status'] === 'active'),
            'customPrompt' => $currentState['settings']['customPrompt'] ?? '',
            'initialCapital' => $initCap > 0 ? $initCap : null,
            'totalAssets' => $totalAssetsVal,
            'portfolioValue' => $portfolioVal,
            'totalProfit' => $initCap > 0 ? $combinedProfit : null,
            'totalProfitPercent' => $initCap > 0 ? $profitPctVal : null,
            'transactionFeeFlat' => $os['transactionFeeFlat'] ?? null,
            'transactionFeePercent' => $os['transactionFeePercent'] ?? null,
            'previousProfit' => $prevProfitVal !== 0 ? $prevProfitVal : null,
        ]);

        $aiResponse = callAI($prompt, $currentState['settings']);
        $analysisResponse = parseAIResponse($aiResponse, $stocks, $currentState['settings']['strategy'] ?? 'middle');

        $sigCount = count($analysisResponse['signals']);
        $ordCount = count($analysisResponse['suggestedOrders']);
        $logEntries[] = createLogEntry('analysis', "✅ Analyse abgeschlossen: {$sigCount} Signale, {$ordCount} Order-Vorschläge", $analysisResponse['marketSummary']);

        // Signale loggen und speichern
        foreach ($analysisResponse['signals'] as $signal) {
            $sym = $signal['stock']['symbol'] ?? ($signal['symbol'] ?? '');
            $sig = $signal['signal'] ?? 'HOLD';
            $conf = $signal['confidence'] ?? 0;
            $logEntries[] = createLogEntry('info', "📊 Signal: {$sym} → {$sig} ({$conf}%)", substr($signal['reasoning'] ?? '', 0, 200), $sym);
            array_unshift($currentState['signals'], $signal);
            $currentState['signals'] = array_slice($currentState['signals'], 0, 50);
        }

        // Analyse speichern
        $currentState['lastAnalysis'] = $analysisResponse['marketSummary'];
        $currentState['lastAnalysisDate'] = gmdate('Y-m-d\TH:i:s\Z');

        $totalValue = $portfolioVal + ($currentState['cashBalance'] ?? 0);
        $snapPositions = [];
        foreach ($currentState['userPositions'] as $p) {
            $snapPositions[] = [
                'symbol' => $p['symbol'], 'name' => $p['name'], 'quantity' => $p['quantity'],
                'buyPrice' => $p['buyPrice'], 'currentPrice' => $p['currentPrice'],
            ];
        }
        array_unshift($currentState['analysisHistory'], [
            'id' => generateUUID(),
            'date' => gmdate('Y-m-d\TH:i:s\Z'),
            'analysisText' => $analysisResponse['marketSummary'],
            'portfolioSnapshot' => [
                'positions' => $snapPositions,
                'cashBalance' => $currentState['cashBalance'],
                'totalValue' => $totalValue,
            ],
            'watchlistSymbols' => $allSymbols,
            'strategy' => $currentState['settings']['strategy'] ?? 'middle',
            'aiProvider' => $provider,
        ]);
        $currentState['analysisHistory'] = array_slice($currentState['analysisHistory'], 0, 5);

        // 5. Order-Vorschläge verarbeiten
        $suggestedOrders = $analysisResponse['suggestedOrders'] ?? [];

        // Fix-up: SELL-Orders mit quantity 0
        foreach ($suggestedOrders as &$order) {
            if (($order['quantity'] ?? 0) === 0) {
                $isSell = in_array($order['orderType'], ['limit-sell', 'stop-loss']);
                if ($isSell) {
                    foreach ($currentState['userPositions'] as $p) {
                        if ($p['symbol'] === $order['symbol']) {
                            $order['quantity'] = $p['quantity'];
                            break;
                        }
                    }
                }
            }
        }
        unset($order);

        if (empty($suggestedOrders)) {
            $logEntries[] = createLogEntry('info', '📝 Keine Order-Vorschläge von der KI');
        } else {
            $approvedOrders = applySafetyRules($suggestedOrders, $currentState, $logEntries);

            if (empty($approvedOrders)) {
                $logEntries[] = createLogEntry('info', '🛡️ Alle Vorschläge von Safety-Regeln abgelehnt');
            } else {
                $mode = $settings['mode'] ?? 'suggest-only';
                if ($mode === 'suggest-only') {
                    foreach ($approvedOrders as $order) {
                        $priceFormatted = number_format($order['triggerPrice'], 2);
                        $logEntries[] = createLogEntry('info', "💡 Vorschlag: " . strtoupper($order['orderType']) . " {$order['quantity']}x {$order['symbol']} @ {$priceFormatted}€", $order['reasoning'] ?? '', $order['symbol']);
                    }
                } else {
                    $ordersCreated = 0;
                    foreach ($approvedOrders as $suggested) {
                        $isSellOrder = in_array($suggested['orderType'], ['limit-sell', 'stop-loss']);

                        // Duplikat-Sell-Schutz
                        if ($isSellOrder) {
                            $existingSells = array_filter($currentState['orders'], function ($o) use ($suggested) {
                                return in_array($o['status'], ['active', 'pending'])
                                    && $o['symbol'] === $suggested['symbol']
                                    && in_array($o['orderType'], ['limit-sell', 'stop-loss']);
                            });
                            $similarSell = null;
                            foreach ($existingSells as $es) {
                                if (abs($es['triggerPrice'] - $suggested['triggerPrice']) / $es['triggerPrice'] <= 0.05) {
                                    $similarSell = $es;
                                    break;
                                }
                            }
                            if ($similarSell) {
                                $logEntries[] = createLogEntry('skipped', "⏭️ {$suggested['symbol']}: Sell-Order übersprungen – bereits vorhanden", null, $suggested['symbol']);
                                continue;
                            }
                            $totalSellQty = 0;
                            foreach ($existingSells as $es) {
                                $totalSellQty += $es['quantity'];
                            }
                            $position = null;
                            foreach ($currentState['userPositions'] as $p) {
                                if ($p['symbol'] === $suggested['symbol']) {
                                    $position = $p;
                                    break;
                                }
                            }
                            if ($position && ($totalSellQty + $suggested['quantity']) > $position['quantity']) {
                                $logEntries[] = createLogEntry('skipped', "⏭️ {$suggested['symbol']}: Sell-Order übersprungen – Überverkauf", null, $suggested['symbol']);
                                continue;
                            }
                        }

                        // Bestehende Autopilot-Orders gleichen Typs stornieren
                        foreach ($currentState['orders'] as &$o) {
                            if (in_array($o['status'], ['active', 'pending'])
                                && $o['symbol'] === $suggested['symbol']
                                && $o['orderType'] === $suggested['orderType']
                                && str_starts_with($o['note'] ?? '', '🤖 Autopilot:')) {
                                $o['status'] = 'cancelled';
                                $logEntries[] = createLogEntry('info', "🔄 Bestehende Order storniert: {$o['orderType']} {$o['symbol']}", null, $o['symbol'], $o['id']);
                            }
                        }
                        unset($o);

                        $stockData = null;
                        foreach ($stocks as $s) {
                            if ($s['symbol'] === $suggested['symbol']) {
                                $stockData = $s;
                                break;
                            }
                        }

                        $orderStatus = $mode === 'confirm-each' ? 'pending' : 'active';
                        $expiresAt = gmdate('Y-m-d\TH:i:s\Z', time() + 7 * 24 * 3600);

                        $newOrder = [
                            'id' => generateUUID(),
                            'symbol' => $suggested['symbol'],
                            'name' => $stockData['name'] ?? $suggested['symbol'],
                            'orderType' => $suggested['orderType'],
                            'quantity' => $suggested['quantity'],
                            'triggerPrice' => $suggested['triggerPrice'],
                            'currentPrice' => $stockData['price'] ?? $suggested['triggerPrice'],
                            'status' => $orderStatus,
                            'createdAt' => gmdate('Y-m-d\TH:i:s\Z'),
                            'expiresAt' => $expiresAt,
                            'note' => "🤖 Autopilot: " . ($suggested['reasoning'] ?? ''),
                        ];

                        $currentState['orders'][] = $newOrder;
                        $ordersCreated++;

                        $priceFormatted = number_format($suggested['triggerPrice'], 2);
                        $logEntries[] = createLogEntry(
                            'order-created',
                            "📦 Order erstellt: " . strtoupper($suggested['orderType']) . " {$suggested['quantity']}x {$suggested['symbol']} @ {$priceFormatted}€",
                            $suggested['reasoning'] ?? '',
                            $suggested['symbol'],
                            $newOrder['id']
                        );
                    }

                    $currentState['autopilotState']['totalOrdersCreated'] = ($currentState['autopilotState']['totalOrdersCreated'] ?? 0) + $ordersCreated;
                }
            }
        }

        // Warnungen
        foreach ($analysisResponse['warnings'] ?? [] as $warning) {
            $logEntries[] = createLogEntry('warning', "⚠️ {$warning}");
        }

        $logEntries[] = createLogEntry('info', "✅ Zyklus #{$cycleId} abgeschlossen");

        $currentState['autopilotState']['isRunning'] = false;
        $currentState['autopilotState']['lastRunAt'] = gmdate('Y-m-d\TH:i:s\Z');
        $currentState['autopilotState']['cycleCount'] = ($currentState['autopilotState']['cycleCount'] ?? 0) + 1;

    } catch (\Throwable $e) {
        $logEntries[] = createLogEntry('error', "❌ Fehler im Zyklus: {$e->getMessage()}", $e->getTraceAsString());
        $currentState['autopilotState']['isRunning'] = false;
        $currentState['autopilotState']['lastRunAt'] = gmdate('Y-m-d\TH:i:s\Z');
    }

    // Alle Logs auf einmal speichern
    $currentState['autopilotLog'] = array_slice(array_merge($logEntries, $currentState['autopilotLog']), 0, 200);
    saveState($currentState, $sessionId);
}
