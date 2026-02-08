#!/bin/bash

# Quick Cloudflare Tunnel - Get HTTPS URL in 30 seconds
# This creates a temporary tunnel for immediate use

INSTANCE_IP="3.84.220.241"
SSH_USER="ec2-user"
KEY_FILE_INPUT="${1:-genio-worker-new.pem}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}⚡ Quick Cloudflare Tunnel${NC}"
echo -e "${BLUE}==========================${NC}"
echo ""
echo "This will give you an HTTPS URL immediately!"
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
    exit 1
fi

chmod 400 "$KEY_FILE"

# Use EC2 Instance Connect
INSTANCE_ID="i-0b09cd0fe805d6fe6"
REGION="us-east-1"
AWS_PROFILE="genio"

export AWS_PROFILE="$AWS_PROFILE"

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

echo -e "${YELLOW}📦 Installing cloudflared (if needed)...${NC}"

ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_USER@$INSTANCE_IP" << 'ENDSSH'
# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "Installing cloudflared..."
    cd /tmp
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
    sudo mv cloudflared /usr/local/bin/cloudflared
    sudo chmod +x /usr/local/bin/cloudflared
    echo "✅ Installed"
else
    echo "✅ Already installed"
fi
ENDSSH

echo ""
echo -e "${CYAN}🚀 Starting Cloudflare Tunnel...${NC}"
echo ""
echo -e "${YELLOW}This will give you an HTTPS URL. Press Ctrl+C to stop.${NC}"
echo ""
echo -e "${GREEN}Your HTTPS endpoint will appear below:${NC}"
echo ""

# Run tunnel in foreground so user can see the URL
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_USER@$INSTANCE_IP" \
  "cloudflared tunnel --url http://localhost:5001"
