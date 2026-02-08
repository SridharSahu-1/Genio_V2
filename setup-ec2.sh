#!/bin/bash

# EC2 Setup Script - Install dependencies and clone repository
# Run this on your EC2 instance after connecting

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Setting up EC2 instance for Genio Worker${NC}"
echo ""

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo -e "${RED}❌ Cannot detect OS${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 Installing Git...${NC}"
if [ "$OS" == "amzn" ] || [ "$OS" == "rhel" ] || [ "$OS" == "centos" ]; then
    # Amazon Linux / RHEL / CentOS
    sudo yum update -y
    sudo yum install -y git
elif [ "$OS" == "ubuntu" ] || [ "$OS" == "debian" ]; then
    # Ubuntu / Debian
    sudo apt-get update -y
    sudo apt-get install -y git
else
    echo -e "${RED}❌ Unsupported OS: $OS${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Git installed${NC}"
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git installation failed${NC}"
    exit 1
fi

echo -e "${YELLOW}📥 Setting up repository access...${NC}"
echo ""
echo "For a PRIVATE repository, you have 3 options:"
echo ""
echo "Option 1: Use SSH Key (Recommended)"
echo "  1. Generate SSH key on EC2: ssh-keygen -t ed25519 -C 'ec2-genio'"
echo "  2. Add public key to GitHub: cat ~/.ssh/id_ed25519.pub"
echo "  3. Clone with SSH: git clone git@github.com:your-username/Genio_V2.git"
echo ""
echo "Option 2: Use Personal Access Token"
echo "  1. Create token on GitHub: Settings → Developer settings → Personal access tokens"
echo "  2. Clone with token: git clone https://TOKEN@github.com/your-username/Genio_V2.git"
echo ""
echo "Option 3: Upload code directly (if repo is small)"
echo "  1. Use scp or rsync from your local machine"
echo ""

read -p "Do you want to set up SSH key for GitHub? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}🔑 Generating SSH key...${NC}"
    if [ ! -f ~/.ssh/id_ed25519 ]; then
        ssh-keygen -t ed25519 -C "ec2-genio-worker" -f ~/.ssh/id_ed25519 -N ""
        echo -e "${GREEN}✅ SSH key generated${NC}"
    else
        echo -e "${YELLOW}⚠️  SSH key already exists${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}📋 Your public key (add this to GitHub):${NC}"
    echo "=========================================="
    cat ~/.ssh/id_ed25519.pub
    echo "=========================================="
    echo ""
    echo "1. Go to: https://github.com/settings/keys"
    echo "2. Click 'New SSH key'"
    echo "3. Paste the key above"
    echo "4. Press Enter when done..."
    read
    
    # Test GitHub connection
    echo -e "${YELLOW}🧪 Testing GitHub SSH connection...${NC}"
    ssh -T git@github.com -o StrictHostKeyChecking=no || true
fi

echo ""
echo -e "${YELLOW}📂 Ready to clone repository${NC}"
echo "Enter your repository URL:"
echo "  - SSH: git@github.com:username/Genio_V2.git"
echo "  - HTTPS: https://github.com/username/Genio_V2.git"
read -p "Repository URL: " REPO_URL

if [ -z "$REPO_URL" ]; then
    echo -e "${RED}❌ No repository URL provided${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}📥 Cloning repository...${NC}"
if [ -d "Genio_V2" ]; then
    echo -e "${YELLOW}⚠️  Genio_V2 directory already exists. Removing...${NC}"
    rm -rf Genio_V2
fi

git clone "$REPO_URL" Genio_V2

if [ ! -d "Genio_V2" ]; then
    echo -e "${RED}❌ Clone failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Repository cloned successfully!${NC}"
echo ""
echo -e "${GREEN}📁 Next steps:${NC}"
echo "  cd Genio_V2/worker"
echo "  # Continue with your deployment..."
