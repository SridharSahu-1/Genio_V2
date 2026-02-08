#!/bin/bash

# Script to permanently add your SSH key to the EC2 instance
# Run this ONCE after connecting via connect-ec2.sh

set -e

INSTANCE_ID="i-0b09cd0fe805d6fe6"
INSTANCE_IP="3.84.220.241"
REGION="us-east-1"
AWS_PROFILE="genio"
SSH_USER="ec2-user"
KEY_FILE_INPUT="${1:-genio-worker-new.pem}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Function to find key file in common locations
find_key_file() {
    local key_name="$1"
    
    # If it's already an absolute path and exists, use it
    if [[ "$key_name" == /* ]] && [ -f "$key_name" ]; then
        echo "$key_name"
        return 0
    fi
    
    # If it exists in current directory
    if [ -f "$key_name" ]; then
        echo "$key_name"
        return 0
    fi
    
    # Check common locations
    local locations=(
        "$HOME/$key_name"
        "$HOME/Downloads/$key_name"
        "$HOME/.ssh/$key_name"
        "./$key_name"
    )
    
    for loc in "${locations[@]}"; do
        if [ -f "$loc" ]; then
            echo "$loc"
            return 0
        fi
    done
    
    return 1
}

echo -e "${GREEN}🔧 Setting up permanent SSH key${NC}"

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
    exit 1
fi

echo "Using key file: $KEY_FILE"

# Extract public key
PUBLIC_KEY=$(ssh-keygen -y -f "$KEY_FILE")

# Get availability zone
export AWS_PROFILE=$AWS_PROFILE
AZ=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query "Reservations[*].Instances[*].Placement.AvailabilityZone" \
  --output text \
  --region $REGION)

# Send key via EC2 Instance Connect
echo -e "${YELLOW}📤 Sending key via EC2 Instance Connect...${NC}"
aws ec2-instance-connect send-ssh-public-key \
  --instance-id $INSTANCE_ID \
  --availability-zone $AZ \
  --instance-os-user $SSH_USER \
  --ssh-public-key "$PUBLIC_KEY" \
  --region $REGION > /dev/null

sleep 1

# Connect and add key permanently
echo -e "${YELLOW}🔑 Adding key to authorized_keys...${NC}"
ssh -i "$KEY_FILE" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    $SSH_USER@$INSTANCE_IP << EOF
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "$PUBLIC_KEY" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "✅ Key added successfully!"
EOF

echo -e "${GREEN}✅ Permanent key setup complete!${NC}"
echo -e "${GREEN}You can now connect directly with: ssh -i $KEY_FILE $SSH_USER@$INSTANCE_IP${NC}"
