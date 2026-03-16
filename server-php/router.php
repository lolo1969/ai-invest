<?php
/**
 * Router für PHP Built-in Server
 * Leitet alle /api/* Requests an index.php weiter.
 * Statische Dateien werden direkt serviert.
 */

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// API-Requests → index.php
if (str_starts_with($uri, '/api/') || $uri === '/api') {
    // REQUEST_URI und PATH_INFO setzen für index.php
    $_SERVER['PATH_INFO'] = $uri;
    require __DIR__ . '/index.php';
    return true;
}

// Statische Dateien → PHP Built-in Server default
return false;
