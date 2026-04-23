<?php
/**
 * Alpaca Paper Trading Service (PHP)
 *
 * PHP-Parity zum TypeScript AlpacaService.
 * Sendet Orders an die Alpaca Paper Trading REST API.
 *
 * Verwendung:
 *   require_once __DIR__ . '/alpacaService.php';
 *   $result = submitAlpacaOrder($order, $executedPrice, $keyId, $keySecret, $paper);
 */

declare(strict_types=1);

const ALPACA_PAPER_BASE_URL = 'https://paper-api.alpaca.markets';
const ALPACA_LIVE_BASE_URL  = 'https://api.alpaca.markets';

/**
 * Maps an internal orderType string to Alpaca side + type.
 *
 * @param string $orderType  One of: limit-buy, limit-sell, stop-loss, stop-buy
 * @return array{side: string, type: string}
 * @throws InvalidArgumentException
 */
function alpacaMapOrderType(string $orderType): array {
    switch ($orderType) {
        case 'limit-buy':   return ['side' => 'buy',  'type' => 'limit'];
        case 'stop-buy':    return ['side' => 'buy',  'type' => 'stop'];
        case 'limit-sell':  return ['side' => 'sell', 'type' => 'limit'];
        case 'stop-loss':   return ['side' => 'sell', 'type' => 'stop'];
        default:
            throw new \InvalidArgumentException("Unknown orderType: {$orderType}");
    }
}

/**
 * Perform a JSON GET/POST request to the Alpaca API with retry logic.
 *
 * @param string              $url
 * @param string              $keyId
 * @param string              $keySecret
 * @param array<mixed>|null   $body      null = GET, array = POST JSON body
 * @param int                 $maxRetries
 * @return array<mixed>|null  Decoded JSON response or null on failure
 */
function alpacaHttpRequest(
    string $url,
    string $keyId,
    string $keySecret,
    ?array $body = null,
    int $maxRetries = 2
): ?array {
    $headers = [
        'APCA-API-KEY-ID: ' . $keyId,
        'APCA-API-SECRET-KEY: ' . $keySecret,
        'Content-Type: application/json',
    ];

    $delay = 1500; // ms

    for ($attempt = 0; $attempt <= $maxRetries; $attempt++) {
        $ch = curl_init($url);
        if ($ch === false) {
            error_log('[Alpaca] curl_init failed');
            return null;
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 15,
        ]);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        $raw      = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr  = curl_error($ch);
        curl_close($ch);

        if ($curlErr !== '') {
            error_log("[Alpaca] curl error (attempt {$attempt}): {$curlErr}");
            if ($attempt < $maxRetries) {
                usleep($delay * 1000 * (int)pow(2, $attempt));
                continue;
            }
            return null;
        }

        if ($httpCode === 429 || $httpCode === 503) {
            if ($attempt < $maxRetries) {
                usleep($delay * 1000 * (int)pow(2, $attempt));
                continue;
            }
            error_log("[Alpaca] Rate-limited after {$maxRetries} retries (HTTP {$httpCode})");
            return null;
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            error_log("[Alpaca] HTTP {$httpCode}: " . substr((string)$raw, 0, 300));
            return null;
        }

        $decoded = json_decode((string)$raw, true);
        if (!is_array($decoded)) {
            error_log("[Alpaca] Invalid JSON response");
            return null;
        }

        return $decoded;
    }

    return null;
}

/**
 * Fetch Alpaca account details (used for connection test).
 *
 * @param string $keyId
 * @param string $keySecret
 * @param bool   $paper
 * @return array<mixed>|null
 */
function getAlpacaAccount(string $keyId, string $keySecret, bool $paper = true): ?array {
    $base = $paper ? ALPACA_PAPER_BASE_URL : ALPACA_LIVE_BASE_URL;
    return alpacaHttpRequest("{$base}/v2/account", $keyId, $keySecret);
}

/**
 * Submit an order to Alpaca after internal execution.
 *
 * @param array<mixed> $order          Internal order array (keys: id, symbol, orderType, quantity, triggerPrice)
 * @param float        $executedPrice  Price at which the order was internally executed
 * @param string       $keyId
 * @param string       $keySecret
 * @param bool         $paper
 * @return string|null  Alpaca order ID on success, null on failure
 */
function submitAlpacaOrder(
    array $order,
    float $executedPrice,
    string $keyId,
    string $keySecret,
    bool $paper = true
): ?string {
    if (trim($keyId) === '' || trim($keySecret) === '') {
        error_log('[Alpaca] submitAlpacaOrder: missing credentials');
        return null;
    }

    try {
        $mapped = alpacaMapOrderType((string)($order['orderType'] ?? ''));
    } catch (\InvalidArgumentException $e) {
        error_log('[Alpaca] ' . $e->getMessage());
        return null;
    }

    $price = $executedPrice > 0 ? $executedPrice : (float)($order['triggerPrice'] ?? 0);

    $body = [
        'symbol'           => (string)($order['symbol']   ?? ''),
        'qty'              => (string)($order['quantity']  ?? 1),
        'side'             => $mapped['side'],
        'type'             => $mapped['type'],
        'time_in_force'    => 'gtc',
        'client_order_id'  => (string)($order['id']       ?? ''),
    ];

    if ($mapped['type'] === 'limit') {
        $body['limit_price'] = number_format($price, 2, '.', '');
    } elseif ($mapped['type'] === 'stop') {
        $body['stop_price'] = number_format($price, 2, '.', '');
    }

    $base   = $paper ? ALPACA_PAPER_BASE_URL : ALPACA_LIVE_BASE_URL;
    $result = alpacaHttpRequest("{$base}/v2/orders", $keyId, $keySecret, $body);

    if ($result === null) {
        error_log("[Alpaca] submitAlpacaOrder failed for {$body['symbol']}");
        return null;
    }

    $alpacaId = $result['id'] ?? null;
    if ($alpacaId) {
        error_log("[Alpaca] Order submitted: {$body['symbol']} → {$alpacaId}");
    }

    return is_string($alpacaId) ? $alpacaId : null;
}
