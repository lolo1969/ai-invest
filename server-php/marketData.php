<?php
/**
 * Server-seitiger MarketData-Service (PHP)
 * Greift direkt auf Yahoo Finance zu.
 */

// FX-Rate Cache (in-memory für Worker, file-basiert für API)
$fxCacheMemory = [];
$FX_CACHE_TTL = 3600; // 1h in Sekunden

function httpGet(string $url, int $timeout = 10): ?array {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($response === false || $httpCode >= 400) {
        error_log("[MarketData] HTTP {$httpCode} für {$url}: {$error}");
        return null;
    }

    return json_decode($response, true);
}

function httpGetWithRetry(string $url, int $retries = 2, int $delayMs = 1500): ?array {
    for ($attempt = 0; $attempt <= $retries; $attempt++) {
        $result = httpGet($url);
        if ($result !== null) {
            return $result;
        }
        if ($attempt < $retries) {
            $wait = $delayMs * pow(2, $attempt);
            error_log("[MarketData] Retry " . ($attempt + 1) . "/{$retries} in {$wait}ms...");
            usleep($wait * 1000);
        }
    }
    return null;
}

function getFxRateToEur(string $currency): float {
    $cur = strtoupper($currency);
    if ($cur === 'EUR') return 1.0;

    if ($cur === 'GBX' || $cur === 'GBP') {
        $gbpRate = fetchFxRate('GBP');
        return $cur === 'GBX' ? $gbpRate / 100 : $gbpRate;
    }

    return fetchFxRate($cur);
}

function fetchFxRate(string $currency): float {
    global $fxCacheMemory, $FX_CACHE_TTL;

    if (isset($fxCacheMemory[$currency]) && (time() - $fxCacheMemory[$currency]['ts']) < $FX_CACHE_TTL) {
        return $fxCacheMemory[$currency]['rate'];
    }

    $needsInverse = false;
    if ($currency === 'USD') {
        $pair = 'EURUSD=X';
        $needsInverse = true;
    } else {
        $pair = "{$currency}EUR=X";
    }

    $url = "https://query1.finance.yahoo.com/v8/finance/chart/{$pair}?interval=1d&range=1d";
    $data = httpGetWithRetry($url);

    if ($data && isset($data['chart']['result'][0]['meta']['regularMarketPrice'])) {
        $rawRate = $data['chart']['result'][0]['meta']['regularMarketPrice'];
        $rate = $needsInverse ? 1.0 / $rawRate : $rawRate;
        $fxCacheMemory[$currency] = ['rate' => $rate, 'ts' => time()];
        error_log("[FX] 1 {$currency} = " . number_format($rate, 4) . " EUR");
        return $rate;
    }

    // Fallback rates
    $fallbacks = [
        'USD' => 0.92, 'GBP' => 1.17, 'CHF' => 1.05, 'CAD' => 0.68,
        'JPY' => 0.0061, 'SEK' => 0.088, 'DKK' => 0.134, 'NOK' => 0.086,
        'AUD' => 0.60, 'HKD' => 0.118,
    ];
    return $fallbacks[$currency] ?? 1.0;
}

/**
 * Einzelne Aktie laden
 */
function getQuote(string $symbol): ?array {
    $url = "https://query1.finance.yahoo.com/v8/finance/chart/{$symbol}?interval=1d&range=1d";
    $data = httpGetWithRetry($url);

    if (!$data || !isset($data['chart']['result'][0])) return null;

    $result = $data['chart']['result'][0];
    $meta = $result['meta'];
    $price = $meta['regularMarketPrice'] ?? 0;
    $previousClose = $meta['previousClose'] ?? ($meta['chartPreviousClose'] ?? $price);
    $originalCurrency = $meta['currency'] ?? 'USD';

    if (strtoupper($originalCurrency) !== 'EUR') {
        $fxRate = getFxRateToEur($originalCurrency);
        $price *= $fxRate;
        $previousClose *= $fxRate;
    }

    $change = $previousClose > 0 ? $price - $previousClose : 0;
    $changePercent = $previousClose > 0 ? (($price - $previousClose) / $previousClose) * 100 : 0;

    return [
        'symbol' => $meta['symbol'] ?? $symbol,
        'name' => $meta['shortName'] ?? ($meta['longName'] ?? $symbol),
        'price' => $price,
        'change' => $change,
        'changePercent' => $changePercent,
        'currency' => 'EUR',
        'exchange' => $meta['exchangeName'] ?? 'Unknown',
    ];
}

/**
 * Batch-Quotes laden
 */
function getQuotesBatch(array $symbols): array {
    if (empty($symbols)) return [];

    $symbolsStr = implode(',', $symbols);
    error_log("[MarketData] Batch-Quote für " . count($symbols) . " Symbole");

    $url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" . urlencode($symbolsStr) .
           "&fields=symbol,shortName,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,currency,fullExchangeName";

    $data = httpGetWithRetry($url, 2, 2000);

    if (!$data || empty($data['quoteResponse']['result'])) {
        return getQuotesFallback($symbols);
    }

    $quotes = $data['quoteResponse']['result'];

    // Pre-fetch FX rates
    $currencies = [];
    foreach ($quotes as $q) {
        $cur = strtoupper($q['currency'] ?? 'USD');
        if ($cur !== 'EUR') $currencies[$cur] = true;
    }
    $fxRates = ['EUR' => 1.0];
    foreach (array_keys($currencies) as $cur) {
        $fxRates[$cur] = getFxRateToEur($cur);
    }

    $stocks = [];
    foreach ($quotes as $q) {
        $price = $q['regularMarketPrice'] ?? 0;
        $previousClose = $q['regularMarketPreviousClose'] ?? $price;
        $originalCurrency = strtoupper($q['currency'] ?? 'USD');

        if ($originalCurrency !== 'EUR') {
            $rate = $fxRates[$originalCurrency] ?? 1.0;
            $price *= $rate;
            $previousClose *= $rate;
        }

        $change = $previousClose > 0 ? $price - $previousClose : 0;
        $changePercent = $previousClose > 0 ? (($price - $previousClose) / $previousClose) * 100 : 0;

        $stocks[] = [
            'symbol' => $q['symbol'],
            'name' => $q['shortName'] ?? ($q['longName'] ?? $q['symbol']),
            'price' => $price,
            'change' => $change,
            'changePercent' => $changePercent,
            'currency' => 'EUR',
            'exchange' => $q['fullExchangeName'] ?? 'Unknown',
        ];
    }

    return $stocks;
}

/**
 * Fallback: Einzeln laden falls Batch fehlschlägt
 */
function getQuotesFallback(array $symbols): array {
    $results = [];
    foreach (array_chunk($symbols, 5) as $batch) {
        foreach ($batch as $symbol) {
            $quote = getQuote($symbol);
            if ($quote !== null) {
                $results[] = $quote;
            }
        }
        usleep(500000); // 500ms Pause
    }
    return $results;
}

/**
 * Historische Daten laden (für technische Indikatoren)
 */
function getHistoricalData(string $symbol, string $range = '1y'): array {
    $interval = $range === '1d' ? '5m' : '1d';
    $url = "https://query1.finance.yahoo.com/v8/finance/chart/{$symbol}?interval={$interval}&range={$range}";
    $data = httpGetWithRetry($url);

    if (!$data || !isset($data['chart']['result'][0])) return [];

    $result = $data['chart']['result'][0];
    $timestamps = $result['timestamp'] ?? [];
    $quote = $result['indicators']['quote'][0] ?? [];

    $historicalData = [];
    foreach ($timestamps as $i => $ts) {
        $historicalData[] = [
            'date' => gmdate('Y-m-d\TH:i:s\Z', $ts),
            'open' => $quote['open'][$i] ?? 0,
            'high' => $quote['high'][$i] ?? 0,
            'low' => $quote['low'][$i] ?? 0,
            'close' => $quote['close'][$i] ?? 0,
            'volume' => $quote['volume'][$i] ?? 0,
        ];
    }
    return $historicalData;
}

/**
 * Technische Indikatoren berechnen (vereinfacht)
 */
function calculateTechnicalIndicators(array $data): array {
    if (count($data) < 14) return ['rsi14' => null, 'macd' => null, 'sma50' => null, 'sma200' => null];

    $closes = array_column($data, 'close');
    $closes = array_filter($closes, fn($v) => $v > 0);
    $closes = array_values($closes);
    $n = count($closes);

    // RSI(14)
    $rsi14 = null;
    if ($n >= 15) {
        $gains = 0;
        $losses = 0;
        for ($i = $n - 14; $i < $n; $i++) {
            $diff = $closes[$i] - $closes[$i - 1];
            if ($diff > 0) $gains += $diff;
            else $losses += abs($diff);
        }
        $avgGain = $gains / 14;
        $avgLoss = $losses / 14;
        $rs = $avgLoss > 0 ? $avgGain / $avgLoss : 100;
        $rsi14 = 100 - (100 / (1 + $rs));
    }

    // SMA50
    $sma50 = null;
    if ($n >= 50) {
        $sma50 = array_sum(array_slice($closes, -50)) / 50;
    }

    // SMA200
    $sma200 = null;
    if ($n >= 200) {
        $sma200 = array_sum(array_slice($closes, -200)) / 200;
    }

    // MACD (12, 26, 9)
    $macd = null;
    if ($n >= 26) {
        $ema12 = calculateEMA(array_slice($closes, -26), 12);
        $ema26 = calculateEMA(array_slice($closes, -26), 26);
        $macd = $ema12 - $ema26;
    }

    return [
        'rsi14' => $rsi14,
        'macd' => $macd,
        'sma50' => $sma50,
        'sma200' => $sma200,
    ];
}

function calculateEMA(array $values, int $period): float {
    $k = 2.0 / ($period + 1);
    $ema = $values[0];
    for ($i = 1; $i < count($values); $i++) {
        $ema = $values[$i] * $k + $ema * (1 - $k);
    }
    return $ema;
}

/**
 * Quotes mit 52-Wochen-Range und technischen Indikatoren
 */
function getQuotesWithRange(array $symbols): array {
    $basicQuotes = getQuotesBatch($symbols);
    if (empty($basicQuotes)) return [];

    $enriched = [];
    foreach (array_chunk($basicQuotes, 3) as $batchIdx => $batch) {
        foreach ($batch as $quote) {
            $historicalData = getHistoricalData($quote['symbol'], '1y');
            if (!empty($historicalData)) {
                $highs = array_filter(array_column($historicalData, 'high'), fn($h) => $h > 0);
                $lows = array_filter(array_column($historicalData, 'low'), fn($l) => $l > 0);
                $indicators = calculateTechnicalIndicators($historicalData);

                if (!empty($highs) && !empty($lows)) {
                    $week52High = max($highs);
                    $week52Low = min($lows);
                    $range = $week52High - $week52Low;
                    $week52ChangePercent = $range > 0 ? (($quote['price'] - $week52Low) / $range) * 100 : 50;
                    $quote['week52High'] = $week52High;
                    $quote['week52Low'] = $week52Low;
                    $quote['week52ChangePercent'] = $week52ChangePercent;
                }
                $quote['technicalIndicators'] = $indicators;
            }
            $enriched[] = $quote;
        }
        if ($batchIdx < floor(count($basicQuotes) / 3)) {
            usleep(400000); // 400ms Pause
        }
    }

    return $enriched;
}
