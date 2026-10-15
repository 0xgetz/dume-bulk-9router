#!/usr/bin/env bash
cd "$(dirname "$0")"
export DUME_ACCOUNTS="${DUME_ACCOUNTS:-$PWD/accounts.json}"
export PORT="${PORT:-8790}"
pkill -f "src/adapter.js" 2>/dev/null
sleep 0.5
setsid nohup node src/adapter.js >> adapter.log 2>&1 < /dev/null &
echo "adapter started pid $! -> adapter.log"
