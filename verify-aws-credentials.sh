#!/bin/bash

# Script to verify and update AWS credentials on EC2
# Usage: ./verify-aws-credentials.sh

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
CYAN='\033[0;36m'
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

echo -e "${CYAN}🔍 Verifying AWS credentials on EC2...${NC}"

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

echo "📋 Checking .env.production file..."
if [ ! -f .env.production ]; then
    echo "   ❌ .env.production not found!"
    exit 1
fi

echo ""
echo "🔑 Current AWS credentials in .env.production:"
AWS_ACCESS_KEY=$(grep "^AWS_ACCESS_KEY_ID=" .env.production | cut -d'=' -f2- || echo "NOT SET")
AWS_SECRET_KEY=$(grep "^AWS_SECRET_ACCESS_KEY=" .env.production | cut -d'=' -f2- || echo "NOT SET")

echo "   AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY:0:10}...${AWS_ACCESS_KEY: -4}"
echo "   AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_KEY:0:10}...${AWS_SECRET_KEY: -4}"

# Check if they're placeholders
if [[ "$AWS_ACCESS_KEY" == *"YOUR_AWS"* ]] || [[ "$AWS_ACCESS_KEY" == "" ]]; then
    echo ""
    echo "   ⚠️  WARNING: AWS_ACCESS_KEY_ID appears to be a placeholder or empty!"
    echo "   You need to update it with your actual AWS credentials."
    echo ""
    echo "   To update, run:"
    echo "   nano .env.production"
    echo "   # Then update AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY"
    echo "   # Save and exit, then restart:"
    echo "   docker-compose -f docker-compose.prod.yml restart server"
    exit 1
fi

if [[ "$AWS_SECRET_KEY" == *"YOUR_AWS"* ]] || [[ "$AWS_SECRET_KEY" == "" ]]; then
    echo ""
    echo "   ⚠️  WARNING: AWS_SECRET_ACCESS_KEY appears to be a placeholder or empty!"
    echo "   You need to update it with your actual AWS credentials."
    exit 1
fi

echo ""
echo "✅ Credentials appear to be set (not placeholders)"
echo ""
echo "🔍 Checking what the Docker container sees..."
echo "   (This shows the actual environment variables in the running container)"

CONTAINER_ENV=$(docker exec genio_server env | grep -E "AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY" || echo "Could not read container environment")

if [ -n "$CONTAINER_ENV" ]; then
    echo "$CONTAINER_ENV" | while IFS= read -r line; do
        if [[ "$line" == *"AWS_ACCESS_KEY_ID"* ]]; then
            KEY_VALUE=$(echo "$line" | cut -d'=' -f2-)
            echo "   AWS_ACCESS_KEY_ID in container: ${KEY_VALUE:0:10}...${KEY_VALUE: -4}"
        elif [[ "$line" == *"AWS_SECRET_ACCESS_KEY"* ]]; then
            KEY_VALUE=$(echo "$line" | cut -d'=' -f2-)
            echo "   AWS_SECRET_ACCESS_KEY in container: ${KEY_VALUE:0:10}...${KEY_VALUE: -4}"
        fi
    done
else
    echo "   ⚠️  Could not read container environment variables"
fi

echo ""
echo "📋 Recent server logs (checking for AWS errors):"
docker-compose -f docker-compose.prod.yml logs server --tail=30 | grep -i "aws\|s3\|credential" || echo "   No AWS-related errors in recent logs"

echo ""
echo "💡 If credentials are correct but still getting errors:"
echo "   1. Make sure the AWS credentials are valid and active"
echo "   2. Check that the IAM user has S3 permissions"
echo "   3. Verify the bucket name is correct: $(grep "^AWS_S3_BUCKET=" .env.production | cut -d'=' -f2- || echo 'NOT SET')"
echo "   4. Restart the server: docker-compose -f docker-compose.prod.yml restart server"
ENDSSH

echo ""
echo -e "${GREEN}✅ Verification complete!${NC}"
