#!/bin/bash

# Complete AWS Deployment Script
# Deploys both Server and Worker together on EC2

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTANCE_IP="3.84.220.241"
SSH_USER="ec2-user"
KEY_FILE_INPUT="${1:-genio-worker-new.pem}"
REGION="us-east-1"
AWS_PROFILE="genio"

echo -e "${BLUE}🚀 Genio V2 - Complete AWS Deployment${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Find key file
find_key_file() {
    local key_name="$1"
    if [[ "$key_name" == /* ]] && [ -f "$key_name" ]; then
        echo "$key_name"
        return 0
    fi
    for loc in "$HOME/$key_name" "$HOME/Downloads/$key_name" "./$key_name"; do
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
    exit 1
fi

chmod 400 "$KEY_FILE"

# Use EC2 Instance Connect
echo -e "${YELLOW}🔑 Adding SSH key via EC2 Instance Connect...${NC}"
export AWS_PROFILE="$AWS_PROFILE"

AZ=$(aws ec2 describe-instances \
  --instance-ids i-0b09cd0fe805d6fe6 \
  --query "Reservations[*].Instances[*].Placement.AvailabilityZone" \
  --output text \
  --region "$REGION" 2>/dev/null)

PUBLIC_KEY=$(ssh-keygen -y -f "$KEY_FILE" 2>/dev/null)

aws ec2-instance-connect send-ssh-public-key \
  --instance-id i-0b09cd0fe805d6fe6 \
  --availability-zone "$AZ" \
  --instance-os-user "$SSH_USER" \
  --ssh-public-key "$PUBLIC_KEY" \
  --region "$REGION" > /dev/null 2>&1

sleep 2

echo -e "${GREEN}✅ Connected to EC2${NC}"
echo ""

# Upload code
echo -e "${YELLOW}📤 Uploading code to EC2...${NC}"
rsync -avz --progress \
  -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=no" \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'venv' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.env' \
  --exclude 'dist' \
  --exclude 'temp' \
  --exclude '*.log' \
  --exclude '.DS_Store' \
  ./ "$SSH_USER@$INSTANCE_IP:~/Genio_V2/" || {
    echo -e "${RED}❌ Upload failed${NC}"
    exit 1
}

echo -e "${GREEN}✅ Code uploaded${NC}"
echo ""

# Deploy on EC2
echo -e "${YELLOW}🚀 Deploying on EC2...${NC}"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_USER@$INSTANCE_IP" << 'ENDSSH'
cd ~/Genio_V2

# Install Docker if not installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    sudo yum update -y
    sudo yum install -y docker
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -a -G docker ec2-user
fi

# Install Docker Compose if not installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Use docker compose (v2) if available, otherwise docker-compose (v1)
DOCKER_COMPOSE_CMD="docker-compose"
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
fi

# Create .env file if it doesn't exist
if [ ! -f .env.production ]; then
    echo "📝 Creating .env.production file..."
    cat > .env.production << 'ENVEOF'
NODE_ENV=production
PORT=5001
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_here
REDIS_HOST=redis
REDIS_PORT=6379
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_BUCKET=your_s3_bucket
AWS_REGION=us-east-1
CORS_ORIGINS=https://your-frontend-domain.com
HF_TOKEN=your_huggingface_token
ENVEOF
    echo "⚠️  Please edit .env.production with your actual values!"
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml down || true

# Build and start services
echo "🔨 Building and starting services..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml --env-file .env.production up -d --build

# Show status
echo ""
echo "📊 Container status:"
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml ps

echo ""
echo "📋 Logs (last 20 lines):"
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml logs --tail=20

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Useful commands:"
echo "  - View logs: $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml logs -f"
echo "  - Stop: $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml down"
echo "  - Restart: $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml restart"
ENDSSH

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${BLUE}📋 Next steps:${NC}"
echo "  1. SSH to EC2: ./connect-ec2.sh"
echo "  2. Edit .env.production with your actual values"
echo "  3. Restart: docker-compose -f docker-compose.prod.yml restart"
echo "  4. Check logs: docker-compose -f docker-compose.prod.yml logs -f"
