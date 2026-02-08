#!/bin/bash

# EC2 Connection Script
# This script uses EC2 Instance Connect to add your SSH key and connect

set -e

# Configuration
INSTANCE_ID="i-0b09cd0fe805d6fe6"
INSTANCE_IP="3.84.220.241"
REGION="us-east-1"
AWS_PROFILE="genio"
SSH_USER="ec2-user"
KEY_FILE_INPUT="${1:-genio-worker-new.pem}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to find key file in common locations
find_key_file() {
    local key_name="$1"
    
    # If it's already an absolute path and exists, use it
    if [[ "$key_name" == /* ]] && [ -f "$key_name" ]; then
        echo "$key_name"
        return 0
    fi
    
    # Check common locations (prioritize home directory)
    local locations=(
        "$HOME/$key_name"           # Home directory (most common)
        "$HOME/Downloads/$key_name" # Downloads folder
        "$HOME/.ssh/$key_name"      # SSH directory
        "./$key_name"               # Current directory
    )
    
    for loc in "${locations[@]}"; do
        if [ -f "$loc" ]; then
            echo "$loc"
            return 0
        fi
    done
    
    return 1
}

# Find the key file
KEY_FILE=$(find_key_file "$KEY_FILE_INPUT")

if [ -z "$KEY_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo -e "${RED}❌ Error: Key file '$KEY_FILE_INPUT' not found!${NC}"
    echo ""
    echo "Searched in:"
    echo "  - Current directory"
    echo "  - $HOME/"
    echo "  - $HOME/Downloads/"
    echo "  - $HOME/.ssh/"
    echo ""
    echo "Usage: $0 [path-to-key.pem]"
    echo "Example: $0 ~/genio-worker-new.pem"
    exit 1
fi

echo -e "${GREEN}🔌 Connecting to EC2 Instance${NC}"
echo "Instance ID: $INSTANCE_ID"
echo "IP Address: $INSTANCE_IP"
echo "Key File: $KEY_FILE"
echo ""

# Fix key permissions
echo -e "${YELLOW}🔐 Setting key permissions...${NC}"
chmod 400 "$KEY_FILE"

# Set AWS profile
export AWS_PROFILE=$AWS_PROFILE

# Get availability zone
echo -e "${YELLOW}📍 Getting instance availability zone...${NC}"
AZ=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query "Reservations[*].Instances[*].Placement.AvailabilityZone" \
  --output text \
  --region $REGION 2>/dev/null)

if [ -z "$AZ" ]; then
    echo -e "${RED}❌ Error: Could not get availability zone. Check your AWS credentials.${NC}"
    exit 1
fi

echo "Availability Zone: $AZ"

# Extract public key
echo -e "${YELLOW}🔑 Extracting public key...${NC}"
PUBLIC_KEY=$(ssh-keygen -y -f "$KEY_FILE" 2>/dev/null)

if [ -z "$PUBLIC_KEY" ]; then
    echo -e "${RED}❌ Error: Could not extract public key from $KEY_FILE${NC}"
    exit 1
fi

# Send SSH public key via EC2 Instance Connect
echo -e "${YELLOW}📤 Sending SSH public key via EC2 Instance Connect...${NC}"
RESULT=$(aws ec2-instance-connect send-ssh-public-key \
  --instance-id $INSTANCE_ID \
  --availability-zone $AZ \
  --instance-os-user $SSH_USER \
  --ssh-public-key "$PUBLIC_KEY" \
  --region $REGION 2>&1)

if echo "$RESULT" | grep -q '"Success": true'; then
    echo -e "${GREEN}✅ Public key sent successfully!${NC}"
else
    echo -e "${RED}❌ Error sending public key:${NC}"
    echo "$RESULT"
    exit 1
fi

# Wait a moment for the key to be processed
sleep 1

# Connect via SSH
echo -e "${GREEN}🚀 Connecting via SSH (key valid for 60 seconds)...${NC}"
echo -e "${YELLOW}💡 Tip: Once connected, add your key permanently to ~/.ssh/authorized_keys${NC}"
echo ""

# Try to connect
ssh -i "$KEY_FILE" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    $SSH_USER@$INSTANCE_IP
