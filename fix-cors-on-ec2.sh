#!/bin/bash

# Quick script to fix CORS on EC2
# This script SSHs to EC2 and ensures CORS_ORIGINS is set correctly

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

echo -e "${YELLOW}🔧 Fixing CORS configuration on EC2...${NC}"

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

echo "📝 Checking current CORS_ORIGINS setting..."
if [ -f .env.production ]; then
    CURRENT_CORS=$(grep "^CORS_ORIGINS=" .env.production | cut -d'=' -f2- || echo "")
    echo "   Current value: $CURRENT_CORS"
    
    if [ "$CURRENT_CORS" != "*" ]; then
        echo "   ⚠️  CORS_ORIGINS is not set to '*', updating..."
        sed -i 's/^CORS_ORIGINS=.*/CORS_ORIGINS=*/' .env.production
        echo "   ✅ Updated CORS_ORIGINS=*"
    else
        echo "   ✅ CORS_ORIGINS is already set to '*'"
    fi
else
    echo "   ❌ .env.production not found, creating it..."
    echo "CORS_ORIGINS=*" >> .env.production
    echo "   ✅ Created .env.production with CORS_ORIGINS=*"
fi

echo ""
echo "🔄 Restarting server to apply changes..."
docker-compose -f docker-compose.prod.yml restart server

echo ""
echo "⏳ Waiting for server to restart..."
sleep 5

echo ""
echo "✅ CORS fix applied! The server should now accept requests from any origin."
echo ""
echo "📋 To verify, check the server logs:"
echo "   docker-compose -f docker-compose.prod.yml logs server | tail -20"
ENDSSH

echo -e "${GREEN}✅ CORS fix complete!${NC}"
echo ""
echo "The server should now accept requests from your Vercel frontend."
echo "Test it by making a request from your frontend app."
