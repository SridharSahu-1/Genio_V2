#!/bin/bash

# Quick script to test your deployed endpoint

INSTANCE_IP="3.84.220.241"
SERVER_PORT="5001"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🧪 Testing Genio API Endpoint${NC}"
echo ""

ENDPOINT="http://$INSTANCE_IP:$SERVER_PORT"

echo -e "${YELLOW}Testing Health Endpoint...${NC}"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$ENDPOINT/health" 2>/dev/null)
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Health check passed!${NC}"
    echo -e "${CYAN}Response:${NC}"
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
else
    echo -e "${RED}❌ Health check failed (HTTP $HTTP_CODE)${NC}"
    echo "$BODY"
fi

echo ""
echo -e "${CYAN}📍 Your API Endpoints:${NC}"
echo -e "   Health:  $ENDPOINT/health"
echo -e "   API:     $ENDPOINT/api"
echo -e "   Register: $ENDPOINT/api/auth/register"
echo -e "   Login:   $ENDPOINT/api/auth/login"
echo ""
