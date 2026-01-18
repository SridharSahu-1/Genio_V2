#!/bin/bash

# Script to check logs from all services
# Usage: ./check-logs.sh [video-id]

VIDEO_ID="${1:-}"

echo "═══════════════════════════════════════════════════════════"
echo "📊 GENIO V2 - LOG CHECKER"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📦 Docker Services Logs:${NC}"
echo ""

if [ -z "$VIDEO_ID" ]; then
    echo "Recent worker logs:"
    docker-compose logs --tail=50 worker 2>&1 | tail -30
else
    echo "Worker logs for video $VIDEO_ID:"
    docker-compose logs --tail=200 worker 2>&1 | grep -i "$VIDEO_ID" | tail -50
fi

echo ""
echo -e "${YELLOW}⚠️  Server Logs:${NC}"
echo "   The server runs separately (NOT in Docker)"
echo "   Check the terminal where you ran: cd server && npm run dev"
echo "   OR look for server output in your terminal"
echo ""

if [ -n "$VIDEO_ID" ]; then
    echo -e "${BLUE}Searching for video ID in recent logs...${NC}"
    echo ""
    
    # Check worker logs
    echo "Worker logs:"
    docker-compose logs --tail=500 worker 2>&1 | grep -i "$VIDEO_ID" | tail -20
    echo ""
fi

echo -e "${GREEN}✅ To monitor in real-time:${NC}"
echo "   docker-compose logs -f worker"
echo ""
