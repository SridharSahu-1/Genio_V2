#!/bin/bash

# Monitor all logs for Genio V2
# This script monitors Docker worker and provides real-time error tracking

cd "$(dirname "$0")"

echo "🔍 Starting log monitoring for Genio V2..."
echo "Press Ctrl+C to stop"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored log sections
print_section() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Monitor Docker worker logs with filtering
print_section "📋 Docker Worker Logs (filtered)"
docker-compose logs -f worker 2>&1 | while IFS= read -r line; do
    # Color code different log levels
    if echo "$line" | grep -qE "ERROR|❌|Failed|failed|error"; then
        echo -e "${RED}$line${NC}"
    elif echo "$line" | grep -qE "WARNING|⚠️|warning"; then
        echo -e "${YELLOW}$line${NC}"
    elif echo "$line" | grep -qE "✅|SUCCESS|success|Processing|🔄|🟢|📥|📤"; then
        echo -e "${GREEN}$line${NC}"
    else
        echo "$line"
    fi
done
