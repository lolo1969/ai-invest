<?php
/**
 * Server-seitiger Order-Executor (PHP)
 * Prüft aktive Orders gegen aktuelle Marktpreise und führt sie aus.
 */

require_once __DIR__ . '/stateManager.php';
require_once __DIR__ . '/marketData.php';

/**
 * Prüft alle aktiven Orders und führt sie aus wenn die Bedingungen erfüllt sind.
 */
function checkAndExecuteOrders(string $sessionId = 'default'): void {
    $currentState = loadState($sessionId);

    if (empty($currentState['orderSettings']['autoExecute'])) return;

    $activeOrders = array_filter($currentState['orders'], fn($o) => $o['status'] === 'active');
    if (empty($activeOrders)) return;

    $symbols = array_values(array_unique(array_column($activeOrders, 'symbol')));

    try {
        $quotes = getQuotesBatch($symbols);
        $quotesBySymbol = [];
        foreach ($quotes as $q) {
            $quotesBySymbol[$q['symbol']] = $q;
        }

        $stateChanged = false;

        foreach ($activeOrders as $order) {
            $quote = $quotesBySymbol[$order['symbol']] ?? null;
            if (!$quote) continue;

            $currentPrice = $quote['price'];

            // Kein Handel mit Fallback-Daten
            if (!empty($quote['isFallback'])) {
                error_log("[OrderExecutor] ⚠️ Überspringe {$order['symbol']}: Fallback-Daten");
                continue;
            }

            // Preis im State updaten
            foreach ($currentState['orders'] as &$o) {
                if ($o['id'] === $order['id']) {
                    $o['currentPrice'] = $currentPrice;
                    $stateChanged = true;
                    break;
                }
            }
            unset($o);

            // Circuit-Breaker: >25% Preissprung
            if ($order['currentPrice'] > 0) {
                $priceChange = abs(($currentPrice - $order['currentPrice']) / $order['currentPrice']) * 100;
                if ($priceChange > 25) {
                    error_log("[OrderExecutor] ⚠️ Circuit-Breaker für {$order['symbol']}: " . number_format($priceChange, 1) . "% Preissprung");
                    continue;
                }
            }

            // Abgelaufen?
            if (!empty($order['expiresAt']) && strtotime($order['expiresAt']) < time()) {
                foreach ($currentState['orders'] as &$o) {
                    if ($o['id'] === $order['id']) {
                        $o['status'] = 'cancelled';
                        $stateChanged = true;
                        break;
                    }
                }
                unset($o);
                continue;
            }

            // Trigger prüfen
            $shouldExecute = false;
            switch ($order['orderType']) {
                case 'limit-buy':   $shouldExecute = $currentPrice <= $order['triggerPrice']; break;
                case 'limit-sell':  $shouldExecute = $currentPrice >= $order['triggerPrice']; break;
                case 'stop-loss':   $shouldExecute = $currentPrice <= $order['triggerPrice']; break;
                case 'stop-buy':    $shouldExecute = $currentPrice >= $order['triggerPrice']; break;
            }

            if ($shouldExecute) {
                $priceFormatted = number_format($currentPrice, 2);
                error_log("[OrderExecutor] ✅ Order ausführen: {$order['orderType']} {$order['quantity']}x {$order['symbol']} @ {$priceFormatted}€");

                // State wird intern gespeichert durch executeOrder
                executeOrder($order['id'], $currentPrice, $sessionId);
                $stateChanged = false;

                // Log-Eintrag
                $updatedState = loadState($sessionId);
                array_unshift($updatedState['autopilotLog'], [
                    'id' => generateUUID(),
                    'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
                    'type' => 'order-executed',
                    'message' => "✅ [Server] Order ausgeführt: " . strtoupper($order['orderType']) . " {$order['quantity']}x {$order['symbol']} @ {$priceFormatted}€",
                    'symbol' => $order['symbol'],
                    'orderId' => $order['id'],
                ]);
                $updatedState['autopilotLog'] = array_slice($updatedState['autopilotLog'], 0, 200);
                $updatedState['autopilotState']['totalOrdersExecuted'] += 1;
                saveState($updatedState, $sessionId);
            }
        }

        // Preis-Updates speichern wenn nötig
        if ($stateChanged) {
            saveState($currentState, $sessionId);
        }

    } catch (\Throwable $e) {
        error_log('[OrderExecutor] Fehler: ' . $e->getMessage());
    }
}
