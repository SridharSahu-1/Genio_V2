#!/bin/bash

# Monitor all services during video upload/processing
# Usage: ./monitor-all.sh [video-id]

VIDEO_ID="${1:-}"
LOG_DIR="/tmp/genio-logs-$(date +%s)"
mkdir -p "$LOG_DIR"

echo "═══════════════════════════════════════════════════════════"
echo "📊 GENIO V2 - END-TO-END LOG MONITORING"
echo "═══════════════════════════════════════════════════════════"
echo "Log Directory: $LOG_DIR"
echo "Video ID: ${VIDEO_ID:-'ALL'}"
echo ""
echo "Monitoring:"
echo "  - Worker logs"
echo "  - Server logs (if available)"
echo "  - Docker services"
echo ""
echo "Press Ctrl+C to stop monitoring"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to monitor worker logs
monitor_worker() {
    echo -e "${BLUE}📋 Worker Logs:${NC}"
    echo ""
    
    if [ -z "$VIDEO_ID" ]; then
        docker-compose logs -f --tail=50 worker 2>&1 | while IFS= read -r line; do
            # Color code logs
            if echo "$line" | grep -qiE "ERROR|❌|Failed|failed|error|NoSuchKey|key does not exist"; then
                echo -e "${RED}$line${NC}"
            elif echo "$line" | grep -qiE "WARNING|⚠️|warning"; then
                echo -e "${YELLOW}$line${NC}"
            elif echo "$line" | grep -qiE "✅|SUCCESS|success|Processing|🔄|🟢|📥|📤|DOWNLOADING"; then
                echo -e "${GREEN}$line${NC}"
            else
                echo "$line"
            fi
        done
    else
        docker-compose logs -f --tail=50 worker 2>&1 | grep --line-buffered -i "$VIDEO_ID" | while IFS= read -r line; do
            # Color code logs
            if echo "$line" | grep -qiE "ERROR|❌|Failed|failed|error|NoSuchKey|key does not exist"; then
                echo -e "${RED}$line${NC}"
            elif echo "$line" | grep -qiE "WARNING|⚠️|warning"; then
                echo -e "${YELLOW}$line${NC}"
            elif echo "$line" | grep -qiE "✅|SUCCESS|success|Processing|🔄|🟢|📥|📤|DOWNLOADING"; then
                echo -e "${GREEN}$line${NC}"
            else
                echo "$line"
            fi
        done
    fi
}

# Start monitoring
monitor_worker
