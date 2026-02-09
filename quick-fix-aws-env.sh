#!/bin/bash

# Quick script to fix AWS credentials in Docker containers after deployment

set -e

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
NC='\033[0m'

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
    exit 1
fi

chmod 400 "$KEY_FILE"
export AWS_PROFILE="$AWS_PROFILE"

echo -e "${YELLOW}🔧 Fixing AWS credentials in Docker containers...${NC}"

# Get availability zone and send SSH key via EC2 Instance Connect
AZ=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query "Reservations[*].Instances[*].Placement.AvailabilityZone" \
  --output text \
  --region "$REGION" 2>/dev/null || echo "")

if [ -n "$AZ" ]; then
    PUBLIC_KEY=$(ssh-keygen -y -f "$KEY_FILE" 2>/dev/null || echo "")
    if [ -n "$PUBLIC_KEY" ]; then
        aws ec2-instance-connect send-ssh-public-key \
          --instance-id "$INSTANCE_ID" \
          --availability-zone "$AZ" \
          --instance-os-user "$SSH_USER" \
          --ssh-public-key "$PUBLIC_KEY" \
          --region "$REGION" > /dev/null 2>&1 || true
        sleep 2
    fi
fi

ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_USER@$INSTANCE_IP" << 'ENDSSH'
set -e

cd ~/Genio_V2

echo "📋 Checking .env.production..."
if [ ! -f .env.production ]; then
    echo "   ❌ .env.production not found!"
    exit 1
fi

echo "✅ .env.production exists"
echo ""
echo "🔄 Restarting containers with .env.production..."

# Stop containers
docker-compose -f docker-compose.prod.yml down

# Create override file if it doesn't exist
if [ ! -f docker-compose.override.yml ]; then
    cat > docker-compose.override.yml << 'EOF'
services:
  server:
    image: genio_v2_server:latest
  worker:
    image: genio_v2_worker:latest
EOF
    echo "   ✅ Created docker-compose.override.yml"
fi

# Start with env file
docker-compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production up -d

echo ""
echo "⏳ Waiting for containers to start..."
sleep 5

echo ""
echo "🔍 Verifying AWS credentials in container..."
CONTAINER_KEY=$(docker exec genio_server env | grep "^AWS_ACCESS_KEY_ID=" | cut -d'=' -f2- || echo "NOT FOUND")

if [[ "$CONTAINER_KEY" == *"YOUR_AWS"* ]] || [[ "$CONTAINER_KEY" == "NOT FOUND" ]]; then
    echo "   ❌ AWS_ACCESS_KEY_ID still wrong: ${CONTAINER_KEY:0:20}..."
    echo ""
    echo "   Checking .env.production file:"
    grep "^AWS_ACCESS_KEY_ID=" .env.production || echo "   AWS_ACCESS_KEY_ID not found in .env.production"
    exit 1
else
    echo "   ✅ AWS_ACCESS_KEY_ID is correct: ${CONTAINER_KEY:0:10}...${CONTAINER_KEY: -4}"
fi

echo ""
echo "✅ Containers restarted with correct credentials!"
echo ""
echo "📋 Container status:"
docker-compose -f docker-compose.prod.yml ps
ENDSSH

echo ""
echo -e "${GREEN}✅ Fix complete!${NC}"
