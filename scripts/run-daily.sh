#!/bin/bash
# Daily Jira summary runner
# Runs weekday report (Mon–Thu), weekly report on Friday

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_DIR}/logs"
LOG_FILE="${LOG_DIR}/run-$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"

# Keep only last 30 days of logs
find "$LOG_DIR" -name "run-*.log" -mtime +30 -delete 2>/dev/null || true

cd "$PROJECT_DIR"

# Friday (5) → weekly report, other days → daily
DAY_OF_WEEK=$(date +%u)  # 1=Mon ... 7=Sun
if [ "$DAY_OF_WEEK" -eq 5 ]; then
  ARGS="--weekly"
else
  ARGS=""
fi

echo "=== $(date '+%Y-%m-%d %H:%M:%S') START (args: ${ARGS:-none}) ===" >> "$LOG_FILE"
node src/index.js $ARGS >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "=== $(date '+%Y-%m-%d %H:%M:%S') END (exit: $EXIT_CODE) ===" >> "$LOG_FILE"

exit $EXIT_CODE
