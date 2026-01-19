#!/bin/bash

# Start all services for Genio V2
# This script starts Docker services and monitors logs

set -e

cd "$(dirname "$0")"

echo "🚀 Starting Genio V2 Services..."
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Start Docker services (MongoDB and Redis only - worker runs locally)
echo -e "${YELLOW}[1/3]${NC} Starting Docker services (MongoDB, Redis)..."
docker-compose up -d
sleep 3

# 2. Clear Redis queue
echo -e "${YELLOW}[2/3]${NC} Clearing Redis queue..."
docker exec genio_redis redis-cli FLUSHDB > /dev/null 2>&1 || echo "   (Redis not ready yet)"

# 3. Check service status
echo -e "${YELLOW}[3/3]${NC} Checking service status..."
docker-compose ps

echo ""
echo -e "${GREEN}✅ Docker services started!${NC}"
echo ""
echo "📊 Service Status:"
echo "   - MongoDB: $(docker-compose ps mongo | grep -q Up && echo -e "${GREEN}Running${NC}" || echo -e "${RED}Stopped${NC}")"
echo "   - Redis: $(docker-compose ps redis | grep -q Up && echo -e "${GREEN}Running${NC}" || echo -e "${RED}Stopped${NC}")"
echo ""
echo "📝 Next steps:"
echo "   1. Start the worker locally: cd worker && npm run dev"
echo "   2. Start the server: cd server && npm run dev"
echo "   3. Start the client: cd client && npm run dev"
echo ""
echo "⚠️  Note: Worker runs locally (not in Docker) to avoid memory issues"
echo ""
