#!/bin/bash

# Setup Nginx + SSL for EC2 API
# Usage: ./setup-nginx-ssl.sh your-domain.com

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Domain name required${NC}"
    echo "Usage: $0 your-domain.com"
    exit 1
fi

DOMAIN="$1"
INSTANCE_IP="3.84.220.241"
SSH_USER="ec2-user"
KEY_FILE_INPUT="${2:-genio-worker-new.pem}"

echo -e "${BLUE}🔒 Setting up Nginx + SSL for EC2 API${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""
echo "Domain: $DOMAIN"
echo "EC2 IP: $INSTANCE_IP"
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

# Connect and setup
echo -e "${YELLOW}🔑 Connecting to EC2...${NC}"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_USER@$INSTANCE_IP" << ENDSSH
set -e

echo "📦 Installing Nginx..."
sudo yum update -y
sudo yum install -y nginx

echo "📦 Installing Certbot..."
sudo yum install -y certbot python3-certbot-nginx

echo "🔧 Configuring Nginx..."
sudo tee /etc/nginx/conf.d/genio.conf > /dev/null << NGINX_EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Increase timeouts for long-running requests
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
    }
}
NGINX_EOF

echo "✅ Nginx configured"

# Test nginx config
echo "🧪 Testing Nginx configuration..."
sudo nginx -t

# Start and enable nginx
echo "🚀 Starting Nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

echo "✅ Nginx started"
echo ""
echo "📋 Next steps:"
echo "   1. Make sure your domain DNS points to $INSTANCE_IP"
echo "   2. Run: sudo certbot --nginx -d $DOMAIN"
echo "   3. Update Security Group to allow ports 80 and 443"
ENDSSH

echo ""
echo -e "${GREEN}✅ Nginx installed and configured!${NC}"
echo ""
echo -e "${YELLOW}⚠️  Important next steps:${NC}"
echo "   1. Make sure your domain DNS A record points to: $INSTANCE_IP"
echo "   2. Update EC2 Security Group to allow:"
echo "      - Port 80 (HTTP)"
echo "      - Port 443 (HTTPS)"
echo ""
echo -e "${BLUE}📋 To get SSL certificate, SSH to EC2 and run:${NC}"
echo "   ./connect-ec2.sh"
echo "   sudo certbot --nginx -d $DOMAIN"
echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
