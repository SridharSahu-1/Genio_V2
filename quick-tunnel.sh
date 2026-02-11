#!/bin/bash

# Quick Cloudflare Tunnel - Get HTTPS URL in 30 seconds
# This creates a temporary tunnel for immediate use

INSTANCE_IP="3.84.220.241"
SSH_USER="ec2-user"
KEY_FILE_INPUT="${1:-genio-worker-new.pem}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# This script must run on your LOCAL machine (Mac/Linux), not on EC2.
# It uses your local PEM key to SSH into EC2 and start the tunnel there.
if [ "$USER" = "ec2-user" ] || [ -n "$EC2_INSTANCE_ID" ] || [[ "$(hostname 2>/dev/null)" == ip-* ]]; then
    echo -e "${RED}❌ You are running this script ON EC2.${NC}"
    echo ""
    echo "This script must be run from your LOCAL machine (your Mac/PC), where"
    echo "your PEM key file is stored. It will use the key to connect to EC2"
    echo "and start the tunnel — the key is never copied to EC2."
    echo ""
    echo -e "${YELLOW}Do this instead:${NC}"
    echo "  1. Exit EC2: type  exit"
    echo "  2. On your local machine, open a terminal in the project folder:"
    echo "     cd ~/Codes/Practice/Genio_V2"
    echo "  3. Run:  ./quick-tunnel.sh ~/genio-worker-new.pem"
    echo "     (or:  ./quick-tunnel.sh  if the key is in \$HOME or \$HOME/.ssh)"
    echo ""
    echo "The PEM key stays on your computer; EC2 Instance Connect is used to"
    echo "grant access temporarily when you run the script locally."
    exit 1
fi

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
