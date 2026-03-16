#!/bin/bash
#
# Vestia PHP Server Starter
#
# Startet den PHP Built-in-Server (API) und den Background-Worker.
#
# Verwendung:
#   ./server-php/start.sh          # Startet beides
#   ./server-php/start.sh api      # Nur API-Server
#   ./server-php/start.sh worker   # Nur Background-Worker
#   ./server-php/start.sh stop     # Alles stoppen
#

DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=${VESTIA_PHP_PORT:-3141}
PID_DIR="${DIR}/data"
API_PID_FILE="${PID_DIR}/api.pid"
WORKER_PID_FILE="${PID_DIR}/worker.pid"
WORKER_LOG="${PID_DIR}/worker.log"

mkdir -p "$PID_DIR"

start_api() {
    if [ -f "$API_PID_FILE" ] && kill -0 "$(cat "$API_PID_FILE")" 2>/dev/null; then
        echo "⚠️  API-Server läuft bereits (PID $(cat "$API_PID_FILE"))"
        return
    fi
    echo "🚀 Starte PHP API-Server auf Port ${PORT}..."
    php -S "0.0.0.0:${PORT}" -t "$DIR" "$DIR/router.php" &
    echo $! > "$API_PID_FILE"
    echo "✅ API-Server gestartet (PID $!)"
}

start_worker() {
    if [ -f "$WORKER_PID_FILE" ] && kill -0 "$(cat "$WORKER_PID_FILE")" 2>/dev/null; then
        echo "⚠️  Worker läuft bereits (PID $(cat "$WORKER_PID_FILE"))"
        return
    fi
    echo "🚀 Starte Background-Worker..."
    php "$DIR/worker.php" >> "$WORKER_LOG" 2>&1 &
    echo $! > "$WORKER_PID_FILE"
    echo "✅ Worker gestartet (PID $!, Log: $WORKER_LOG)"
}

stop_all() {
    if [ -f "$API_PID_FILE" ]; then
        PID=$(cat "$API_PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            echo "🛑 API-Server gestoppt (PID $PID)"
        fi
        rm -f "$API_PID_FILE"
    fi
    if [ -f "$WORKER_PID_FILE" ]; then
        PID=$(cat "$WORKER_PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            echo "🛑 Worker gestoppt (PID $PID)"
        fi
        rm -f "$WORKER_PID_FILE"
    fi
    echo "✅ Alles gestoppt"
}

case "${1:-all}" in
    api)
        start_api
        ;;
    worker)
        start_worker
        ;;
    stop)
        stop_all
        ;;
    all|*)
        start_api
        start_worker
        echo ""
        echo "╔══════════════════════════════════════════════════╗"
        echo "║  Vestia PHP Server                               ║"
        echo "║  API:    http://localhost:${PORT}/api/status        ║"
        echo "║  Worker: Background (Log: data/worker.log)       ║"
        echo "║  Stop:   ./server-php/start.sh stop              ║"
        echo "╚══════════════════════════════════════════════════╝"
        ;;
esac
