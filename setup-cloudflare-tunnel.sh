#!/bin/bash

# Setup Cloudflare Tunnel for EC2 API (No Domain Needed!)
# This provides a free HTTPS endpoint

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTANCE_ID="i-0b09cd0fe805d6fe6"
INSTANCE_IP="3.84.220.241"
REGION="us-east-1"
AWS_PROFILE="genio"
SSH_USER="ec2-user"
KEY_FILE_INPUT="${1:-genio-worker-new.pem}"

echo -e "${BLUE}☁️  Cloudflare Tunnel Setup for EC2 API${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "This will set up a free HTTPS endpoint without needing a domain!"
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
echo -e "${YELLOW}🔑 Establishing SSH connection via EC2 Instance Connect...${NC}"
export AWS_PROFILE="$AWS_PROFILE"

AZ=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query "Reservations[*].Instances[*].Placement.AvailabilityZone" \
  --output text \
  --region "$REGION" 2>/dev/null || echo "")

if [ -z "$AZ" ]; then
    echo -e "${YELLOW}⚠️  Could not get availability zone, trying direct SSH...${NC}"
else
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

echo -e "${GREEN}✅ SSH connection ready${NC}"
echo ""

echo -e "${YELLOW}📦 Installing Cloudflare Tunnel on EC2...${NC}"

ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_USER@$INSTANCE_IP" << 'ENDSSH'
set -e

echo "📥 Downloading cloudflared..."
cd /tmp
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
sudo mv cloudflared /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

echo "✅ cloudflared installed"
cloudflared --version

echo ""
echo "🔐 Next step: Authentication"
echo "   Run this command to authenticate:"
echo "   cloudflared tunnel login"
echo ""
echo "   This will give you a URL to visit in your browser"
echo "   After authenticating, come back here"
ENDSSH

echo ""
echo -e "${GREEN}✅ Cloudflare Tunnel installed!${NC}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo "1. SSH to EC2:"
echo "   ./connect-ec2.sh"
echo ""
echo "2. Authenticate with Cloudflare:"
echo "   cloudflared tunnel login"
echo "   (Follow the prompts - it will open a browser or give you a URL)"
echo ""
echo "3. Create a tunnel:"
echo "   cloudflared tunnel create genio-api"
echo "   (Save the tunnel ID that's displayed)"
echo ""
echo "4. Create config file:"
echo "   sudo mkdir -p /etc/cloudflared"
echo "   sudo nano /etc/cloudflared/config.yml"
echo ""
echo "   Add this (replace TUNNEL_ID with your actual tunnel ID):"
echo "   ---"
echo "   tunnel: TUNNEL_ID"
echo "   credentials-file: /home/ec2-user/.cloudflared/TUNNEL_ID.json"
echo "   "
echo "   ingress:"
echo "     - hostname: genio-api-\$(openssl rand -hex 4).trycloudflare.com"
echo "       service: http://localhost:5001"
echo "     - service: http_status:404"
echo ""
echo "5. Run the tunnel:"
echo "   sudo cloudflared tunnel --config /etc/cloudflared/config.yml run"
echo ""
echo "6. Or install as a service (permanent):"
echo "   sudo cloudflared service install"
echo "   sudo systemctl start cloudflared"
echo "   sudo systemctl enable cloudflared"
echo ""
echo -e "${CYAN}💡 The tunnel will give you an HTTPS URL like:${NC}"
echo "   https://genio-api-xxxxx.trycloudflare.com"
echo ""
echo -e "${GREEN}✅ Use that URL in your Vercel environment variable!${NC}"
