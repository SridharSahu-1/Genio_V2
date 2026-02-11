#!/bin/bash

# Quick Update Script - Push code and restart services on EC2
# This is faster than full deployment - just updates code and restarts containers

set -e

# Configuration
INSTANCE_ID="i-0b09cd0fe805d6fe6"
INSTANCE_IP="3.84.220.241"
REGION="us-east-1"
AWS_PROFILE="genio"
SSH_USER="ec2-user"
KEY_FILE_INPUT="${1:-genio-worker-new.pem}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Quick Update - Server & Worker to EC2         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Find key file
find_key_file() {
    local key_name="$1"
    if [[ "$key_name" == /* ]] && [ -f "$key_name" ]; then
        echo "$key_name"
        return 0
    fi
    for loc in "$HOME/$key_name" "$HOME/Downloads/$key_name" "$HOME/.ssh/$key_name" "./$key_name"; do
        if [ -f "$loc" ]; then
            echo "$loc"
            return 0
        fi
    done
    return 1
}

KEY_FILE=$(find_key_file "$KEY_FILE_INPUT")

if [ -z "$KEY_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo -e "${RED}❌ Key file not found: $KEY_FILE_INPUT${NC}"
    echo "Usage: $0 [path-to-key.pem]"
    exit 1
fi

chmod 400 "$KEY_FILE"
echo -e "${GREEN}✅ Key file found: $KEY_FILE${NC}"
echo ""

# Step 1: Upload code
echo -e "${YELLOW}📤 Step 1/3: Uploading code to EC2...${NC}"
echo -e "${CYAN}   Uploading: server/, worker/, docker-compose.prod.yml${NC}"

rsync -avz --progress \
  -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=no -o ServerAliveInterval=60" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='venv' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.env*' \
  --exclude='dist' \
  --exclude='temp' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  --exclude='uploads' \
  --exclude='client' \
  ./ "$SSH_USER@$INSTANCE_IP:~/Genio_V2/" || {
    echo -e "${RED}❌ Upload failed${NC}"
    exit 1
}

echo -e "${GREEN}✅ Code uploaded${NC}"
echo ""

# Step 2: Rebuild and restart services
echo -e "${YELLOW}🔨 Step 2/3: Rebuilding and restarting services...${NC}"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_USER@$INSTANCE_IP" << 'ENDSSH'
set -e

cd ~/Genio_V2

# Determine docker-compose command
DOCKER_COMPOSE_CMD="docker-compose"
if ! command -v docker-compose &> /dev/null && docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
fi

echo "🛑 Stopping existing containers..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml down

echo "🔨 Rebuilding images..."
PROJECT_NAME="genio_v2"

echo "   Building server..."
cd server
docker build -t ${PROJECT_NAME}_server:latest . || {
    echo "❌ Server build failed"
    exit 1
}
cd ..

echo "   Building worker..."
cd worker
docker build -t ${PROJECT_NAME}_worker:latest . || {
    echo "❌ Worker build failed"
    exit 1
}
cd ..

echo "🚀 Starting services..."
# Create override file for pre-built images
cat > docker-compose.override.yml << 'COMPOSE_EOF'
services:
  server:
    image: genio_v2_server:latest
  worker:
    image: genio_v2_worker:latest
COMPOSE_EOF

# Start services
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production up -d

echo "⏳ Waiting for services to start..."
sleep 10

echo ""
echo "📊 Container Status:"
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml ps

echo ""
echo "📋 Recent Logs:"
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml logs --tail=20

echo ""
echo "✅ Services restarted!"
ENDSSH

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Update failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Update complete!${NC}"
echo ""
echo -e "${BLUE}📋 Useful Commands:${NC}"
echo -e "   ${CYAN}View logs:${NC}     ssh -i $KEY_FILE $SSH_USER@$INSTANCE_IP 'cd ~/Genio_V2 && docker-compose -f docker-compose.prod.yml logs -f'"
echo -e "   ${CYAN}Server logs:${NC}   ssh -i $KEY_FILE $SSH_USER@$INSTANCE_IP 'cd ~/Genio_V2 && docker-compose -f docker-compose.prod.yml logs -f server'"
echo -e "   ${CYAN}Worker logs:${NC}   ssh -i $KEY_FILE $SSH_USER@$INSTANCE_IP 'cd ~/Genio_V2 && docker-compose -f docker-compose.prod.yml logs -f worker'"
echo ""
