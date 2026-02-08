#!/bin/bash

# Setup Frontend to Connect to EC2 API

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🌐 Frontend Setup - Connect to EC2 API${NC}"
echo ""

cd client

# Create .env.local if it doesn't exist
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}Creating .env.local file...${NC}"
    cat > .env.local << 'EOF'
# API Endpoint - EC2 Server
NEXT_PUBLIC_API_URL=http://3.84.220.241:5001
EOF
    echo -e "${GREEN}✅ Created .env.local${NC}"
else
    echo -e "${YELLOW}.env.local already exists${NC}"
    if ! grep -q "NEXT_PUBLIC_API_URL" .env.local; then
        echo "" >> .env.local
        echo "NEXT_PUBLIC_API_URL=http://3.84.220.241:5001" >> .env.local
        echo -e "${GREEN}✅ Added NEXT_PUBLIC_API_URL to .env.local${NC}"
    else
        echo -e "${GREEN}✅ NEXT_PUBLIC_API_URL already configured${NC}"
    fi
fi

echo ""
echo -e "${BLUE}📋 Configuration:${NC}"
echo "   API URL: http://3.84.220.241:5001"
echo ""
echo -e "${YELLOW}⚠️  Important:${NC}"
echo "   1. Make sure EC2 Security Group allows port 5001"
echo "   2. Test connection: curl http://3.84.220.241:5001/health"
echo ""
echo -e "${GREEN}✅ Frontend configured!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "   cd client"
echo "   npm run dev"
echo ""
