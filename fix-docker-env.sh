#!/bin/bash

# Script to fix Docker environment variables by restarting containers with .env.production
# This ensures containers pick up the updated credentials from .env.production

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

echo -e "${YELLOW}🔧 Fixing Docker environment variables...${NC}"

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

echo "📋 Verifying .env.production exists..."
if [ ! -f .env.production ]; then
    echo "   ❌ .env.production not found!"
    exit 1
fi

echo "✅ .env.production found"
echo ""
echo "🛑 Stopping containers..."
docker-compose -f docker-compose.prod.yml down

echo ""
echo "🚀 Starting containers with .env.production..."
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

echo ""
echo "⏳ Waiting for containers to start..."
sleep 5

echo ""
echo "🔍 Verifying environment variables in container..."
CONTAINER_AWS_KEY=$(docker exec genio_server env | grep "^AWS_ACCESS_KEY_ID=" | cut -d'=' -f2- || echo "NOT FOUND")
CONTAINER_AWS_SECRET=$(docker exec genio_server env | grep "^AWS_SECRET_ACCESS_KEY=" | cut -d'=' -f2- || echo "NOT FOUND")

if [[ "$CONTAINER_AWS_KEY" == *"YOUR_AWS"* ]] || [[ "$CONTAINER_AWS_KEY" == "NOT FOUND" ]]; then
    echo "   ❌ AWS_ACCESS_KEY_ID still not set correctly in container!"
    echo "   Value: ${CONTAINER_AWS_KEY:0:20}..."
else
    echo "   ✅ AWS_ACCESS_KEY_ID is set: ${CONTAINER_AWS_KEY:0:10}...${CONTAINER_AWS_KEY: -4}"
fi

if [[ "$CONTAINER_AWS_SECRET" == *"YOUR_AWS"* ]] || [[ "$CONTAINER_AWS_SECRET" == "NOT FOUND" ]]; then
    echo "   ❌ AWS_SECRET_ACCESS_KEY still not set correctly in container!"
    echo "   Value: ${CONTAINER_AWS_SECRET:0:20}..."
else
    echo "   ✅ AWS_SECRET_ACCESS_KEY is set: ${CONTAINER_AWS_SECRET:0:10}...${CONTAINER_AWS_SECRET: -4}"
fi

echo ""
echo "📋 Container status:"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "✅ Containers restarted with .env.production"
echo ""
echo "💡 If credentials are still wrong, check:"
echo "   1. .env.production has correct values (not placeholders)"
echo "   2. File format is correct (no extra spaces, quotes, etc.)"
echo "   3. Restart again: docker-compose -f docker-compose.prod.yml restart server"
ENDSSH

echo ""
echo -e "${GREEN}✅ Docker environment fix complete!${NC}"
