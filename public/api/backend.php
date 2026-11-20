<?php

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
if (!is_string($requestPath) || !str_starts_with($requestPath, '/api/')) {
    http_response_code(400);
    exit;
}

$_SERVER['PATH_INFO'] = $requestPath;
require dirname(__DIR__, 2) . '/server-php/index.php';
