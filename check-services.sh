#!/bin/bash

# Quick check of all services

cd "$(dirname "$0")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔍 Checking Genio V2 Services..."
echo "================================"
echo ""

# Check Docker services
echo "📦 Docker Services:"
if docker-compose ps mongo | grep -q Up; then
    echo -e "   MongoDB: ${GREEN}✓ Running${NC}"
else
    echo -e "   MongoDB: ${RED}✗ Stopped${NC}"
fi

if docker-compose ps redis | grep -q Up; then
    echo -e "   Redis: ${GREEN}✓ Running${NC}"
else
    echo -e "   Redis: ${RED}✗ Stopped${NC}"
fi

if docker-compose ps worker | grep -q Up; then
    echo -e "   Worker: ${GREEN}✓ Running${NC}"
else
    echo -e "   Worker: ${RED}✗ Stopped${NC}"
fi

echo ""

# Check if server is running
echo "🖥️  Server Process:"
if ps aux | grep -E "nodemon.*server|ts-node.*server" | grep -v grep > /dev/null; then
    echo -e "   Fastify Server: ${GREEN}✓ Running${NC}"
    ps aux | grep -E "nodemon.*server|ts-node.*server" | grep -v grep | awk '{print "      PID: " $2 " (" $11 ")"}'
else
    echo -e "   Fastify Server: ${RED}✗ Not Running${NC}"
    echo -e "   ${YELLOW}Start with: cd server && npm run dev${NC}"
fi

echo ""

# Check worker is ready
echo "👷 Worker Status:"
if docker-compose logs worker --tail=1 | grep -q "Worker ready"; then
    echo -e "   Status: ${GREEN}✓ Ready and listening${NC}"
else
    echo -e "   Status: ${YELLOW}⚠ Check logs${NC}"
fi

echo ""
echo "📝 To start monitoring logs:"
echo "   ./monitor-logs.sh"
echo ""
echo "📝 To start all services:"
echo "   ./start-services.sh"
echo ""
