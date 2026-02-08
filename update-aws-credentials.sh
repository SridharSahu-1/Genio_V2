#!/bin/bash

# Script to update AWS credentials on EC2
# Usage: ./update-aws-credentials.sh [access-key-id] [secret-access-key]

set -e

INSTANCE_ID="i-0b09cd0fe805d6fe6"
INSTANCE_IP="3.84.220.241"
REGION="us-east-1"
AWS_PROFILE="genio"
SSH_USER="ec2-user"
KEY_FILE_INPUT="${3:-genio-worker-new.pem}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ -z "$1" ] || [ -z "$2" ]; then
    echo -e "${RED}❌ Error: AWS credentials required${NC}"
    echo ""
    echo "Usage: $0 <AWS_ACCESS_KEY_ID> <AWS_SECRET_ACCESS_KEY> [key-file.pem]"
    echo ""
    echo "Example:"
    echo "  $0 AKIAIOSFODNN7EXAMPLE wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    echo ""
    echo "Or run interactively (credentials will be prompted securely):"
    echo "  $0"
    exit 1
fi

AWS_ACCESS_KEY_ID="$1"
AWS_SECRET_ACCESS_KEY="$2"

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

echo -e "${YELLOW}🔧 Updating AWS credentials on EC2...${NC}"

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

ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_USER@$INSTANCE_IP" << ENDSSH
set -e

cd ~/Genio_V2

echo "📝 Updating AWS credentials in .env.production..."

# Backup the file first
cp .env.production .env.production.backup.\$(date +%s) 2>/dev/null || true

# Update AWS credentials
if [ -f .env.production ]; then
    # Update or add AWS_ACCESS_KEY_ID
    if grep -q "^AWS_ACCESS_KEY_ID=" .env.production; then
        sed -i "s|^AWS_ACCESS_KEY_ID=.*|AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID|" .env.production
    else
        echo "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID" >> .env.production
    fi
    
    # Update or add AWS_SECRET_ACCESS_KEY
    if grep -q "^AWS_SECRET_ACCESS_KEY=" .env.production; then
        sed -i "s|^AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY|" .env.production
    else
        echo "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY" >> .env.production
    fi
    
    echo "   ✅ AWS credentials updated"
else
    echo "   ❌ .env.production not found!"
    exit 1
fi

echo ""
echo "🔄 Restarting server to apply changes..."
docker-compose -f docker-compose.prod.yml restart server

echo ""
echo "⏳ Waiting for server to restart..."
sleep 5

echo ""
echo "✅ AWS credentials updated and server restarted!"
echo ""
echo "📋 To verify, check the server logs:"
echo "   docker-compose -f docker-compose.prod.yml logs server | grep -i aws | tail -5"
ENDSSH

echo -e "${GREEN}✅ AWS credentials updated successfully!${NC}"
echo ""
echo "The server has been restarted with the new credentials."
echo "Try your upload request again."
