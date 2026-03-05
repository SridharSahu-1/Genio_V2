#!/bin/bash

# Deploy Server + Worker to EC2 and Link to Endpoint
# This script uploads both server and worker, connects them, and exposes the API endpoint

set -e

# Configuration
INSTANCE_ID="i-0b09cd0fe805d6fe6"
INSTANCE_IP="3.84.220.241"
REGION="us-east-1"
AWS_PROFILE="genio"
SSH_USER="ec2-user"
KEY_FILE_INPUT="${1:-genio-worker-new.pem}"
SERVER_PORT="5001"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Genio V2 - Server + Worker Deployment to EC2        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
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
    echo ""
    echo "Searched in:"
    echo "  - $HOME/"
    echo "  - $HOME/Downloads/"
    echo "  - $HOME/.ssh/"
    echo "  - Current directory"
    echo ""
    echo "Usage: $0 [path-to-key.pem]"
    exit 1
fi

chmod 400 "$KEY_FILE"
echo -e "${GREEN}✅ Key file found: $KEY_FILE${NC}"
echo ""

# Step 1: Connect via EC2 Instance Connect
echo -e "${YELLOW}🔑 Step 1/5: Establishing SSH connection...${NC}"
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

# Step 1.5: Free disk space on EC2 to avoid "No space left on device"
echo -e "${YELLOW}🧹 Step 1.5/5: Freeing disk space on EC2...${NC}"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_USER@$INSTANCE_IP" << 'FREESPACE'
set -e
echo "   Checking disk space before cleanup..."
df -h /home 2>/dev/null || df -h ~ 2>/dev/null || true
echo "   Removing old deploy archive if present..."
rm -f /tmp/genio-deploy.tar.gz 2>/dev/null || true
echo "   Pruning Docker (images, containers, build cache)..."
docker system prune -af 2>/dev/null || true
docker builder prune -af 2>/dev/null || true
echo "   Cleaning Docker volumes (unused only)..."
docker volume prune -f 2>/dev/null || true
echo "   Checking disk space after cleanup..."
df -h /home 2>/dev/null || df -h ~ 2>/dev/null || true
echo "   ✅ Disk cleanup done"
FREESPACE
echo -e "${GREEN}✅ Disk space ready${NC}"
echo ""

# Step 2: Upload Server and Worker code
echo -e "${YELLOW}📤 Step 2/5: Uploading Server and Worker code...${NC}"
echo -e "${CYAN}   Uploading: server/, worker/, docker-compose.prod.yml, server/Dockerfile${NC}"

# Create a more robust rsync with better exclusions
echo -e "${CYAN}   Excluding: venv, node_modules, dist, temp, and large binary files${NC}"

rsync -avz --progress \
  -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -o ServerAliveCountMax=3" \
  --exclude='.git' \
  --exclude='.git/**' \
  --exclude='node_modules' \
  --exclude='node_modules/**' \
  --exclude='venv' \
  --exclude='venv/**' \
  --exclude='__pycache__' \
  --exclude='__pycache__/**' \
  --exclude='*.pyc' \
  --exclude='*.pyo' \
  --exclude='*.pyd' \
  --exclude='.env*' \
  --exclude='dist' \
  --exclude='dist/**' \
  --exclude='temp' \
  --exclude='temp/**' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  --exclude='uploads' \
  --exclude='uploads/**' \
  --exclude='*.dylib' \
  --exclude='*.so' \
  --exclude='*.dll' \
  --exclude='*.whl' \
  --exclude='*.egg' \
  --exclude='*.egg-info' \
  --exclude='*.tar.gz' \
  --exclude='*.zip' \
  --exclude='client' \
  --exclude='client/**' \
  ./ "$SSH_USER@$INSTANCE_IP:~/Genio_V2/" || {
    echo -e "${YELLOW}⚠️  Rsync failed, trying alternative method with tar...${NC}"
    
    # Alternative: Use tar + ssh for more reliable transfer
    echo -e "${CYAN}   Creating archive (excluding large files)...${NC}"
    # COPYFILE_DISABLE=1 avoids macOS ._* resource fork files (saves space, cleaner extract)
    COPYFILE_DISABLE=1 tar --exclude='.git' \
        --exclude='node_modules' \
        --exclude='venv' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='.env*' \
        --exclude='dist' \
        --exclude='temp' \
        --exclude='*.log' \
        --exclude='.DS_Store' \
        --exclude='uploads' \
        --exclude='*.dylib' \
        --exclude='*.so' \
        --exclude='client' \
        -czf /tmp/genio-deploy.tar.gz \
        server/ worker/ docker-compose.prod.yml 2>/dev/null || {
        echo -e "${RED}❌ Failed to create archive${NC}"
        exit 1
    }
    
    echo -e "${CYAN}   Uploading archive...${NC}"
    scp -i "$KEY_FILE" \
        -o StrictHostKeyChecking=no \
        -o ServerAliveInterval=60 \
        /tmp/genio-deploy.tar.gz "$SSH_USER@$INSTANCE_IP:/tmp/" || {
        echo -e "${RED}❌ Upload failed${NC}"
        rm -f /tmp/genio-deploy.tar.gz
        exit 1
    }
    
    echo -e "${CYAN}   Extracting on EC2...${NC}"
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_USER@$INSTANCE_IP" << 'EXTRACT'
        mkdir -p ~/Genio_V2
        cd ~/Genio_V2
        tar -xzf /tmp/genio-deploy.tar.gz
        rm -f /tmp/genio-deploy.tar.gz
        echo "✅ Archive extracted"
EXTRACT
    
    rm -f /tmp/genio-deploy.tar.gz
    echo -e "${GREEN}✅ Code uploaded using alternative method${NC}"
}

# Verify upload: critical files must exist on EC2
echo -e "${CYAN}   Verifying upload on EC2...${NC}"
VERIFY_MSG=$(ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_USER@$INSTANCE_IP" "
    cd ~/Genio_V2 2>/dev/null || { echo 'DIR_MISSING'; exit 1; }
    if [ ! -f server/Dockerfile ]; then echo 'DOCKERFILE_MISSING'; exit 1; fi
    if [ ! -f server/package.json ]; then echo 'PACKAGE_JSON_MISSING'; exit 1; fi
    if [ ! -f worker/Dockerfile ]; then echo 'WORKER_DOCKERFILE_MISSING'; exit 1; fi
    if [ ! -f docker-compose.prod.yml ]; then echo 'COMPOSE_MISSING'; exit 1; fi
    echo 'OK'
" 2>/dev/null || echo "VERIFY_FAILED")

case "$VERIFY_MSG" in
    OK) ;;
    DIR_MISSING)
        echo -e "${RED}❌ Upload verification failed: ~/Genio_V2 not found on EC2${NC}"
        exit 1
        ;;
    DOCKERFILE_MISSING)
        echo -e "${RED}❌ Upload verification failed: server/Dockerfile missing on EC2 (disk full?)${NC}"
        echo -e "${YELLOW}   Free space on EC2 and run this script again.${NC}"
        exit 1
        ;;
    PACKAGE_JSON_MISSING)
        echo -e "${RED}❌ Upload verification failed: server/package.json missing on EC2${NC}"
        exit 1
        ;;
    WORKER_DOCKERFILE_MISSING)
        echo -e "${RED}❌ Upload verification failed: worker/Dockerfile missing on EC2${NC}"
        exit 1
        ;;
    COMPOSE_MISSING)
        echo -e "${RED}❌ Upload verification failed: docker-compose.prod.yml missing on EC2${NC}"
        exit 1
        ;;
    *)
        echo -e "${RED}❌ Upload verification failed: $VERIFY_MSG${NC}"
        exit 1
        ;;
esac
echo -e "${GREEN}✅ Code uploaded successfully${NC}"
echo ""

# Step 2.5: Upload local .env.production if present (so updated env is used)
if [ -f .env.production ]; then
    echo -e "${YELLOW}📄 Uploading local .env.production to EC2...${NC}"
    scp -i "$KEY_FILE" -o StrictHostKeyChecking=no .env.production "$SSH_USER@$INSTANCE_IP:~/Genio_V2/.env.production" && \
        echo -e "${GREEN}✅ .env.production uploaded (will be used by containers)${NC}" || \
        echo -e "${YELLOW}⚠️  Could not upload .env.production; EC2 will use/create its own${NC}"
    echo ""
fi

# Step 3: Deploy and Start Services
echo -e "${YELLOW}🚀 Step 3/5: Deploying Server and Worker on EC2...${NC}"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_USER@$INSTANCE_IP" << ENDSSH
set -e

cd ~/Genio_V2

echo "📦 Checking Docker installation..."

# Install Docker if needed
if ! command -v docker &> /dev/null; then
    echo "   Installing Docker..."
    sudo yum update -y
    sudo yum install -y docker
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -a -G docker ec2-user
    echo "   ✅ Docker installed"
else
    echo "   ✅ Docker already installed"
fi

# Install Docker Compose if needed
DOCKER_COMPOSE_CMD="docker-compose"
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    echo "   Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "   ✅ Docker Compose installed"
elif docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
    echo "   ✅ Docker Compose v2 detected"
else
    echo "   ✅ Docker Compose already installed"
fi

# Ensure user is in docker group (may need logout/login)
sudo usermod -a -G docker ec2-user 2>/dev/null || true

# Try to install/enable Docker Buildx (optional, will fallback to regular build if fails)
echo "🔧 Checking Docker Buildx..."
if ! docker buildx version &> /dev/null 2>&1; then
    echo "   Attempting to install Docker Buildx..."
    mkdir -p ~/.docker/cli-plugins 2>/dev/null || true
    curl -SL https://github.com/docker/buildx/releases/download/v0.17.0/buildx-v0.17.0.linux-amd64 -o ~/.docker/cli-plugins/docker-buildx 2>/dev/null && \
    chmod +x ~/.docker/cli-plugins/docker-buildx 2>/dev/null && \
    docker buildx install 2>/dev/null && \
    docker buildx create --use --name builder 2>/dev/null || true
    if docker buildx version &> /dev/null 2>&1; then
        echo "   ✅ Docker Buildx installed"
    else
        echo "   ⚠️  Buildx installation failed, will use regular docker build"
    fi
else
    echo "   ✅ Docker Buildx already available"
fi

# Use existing .env.production if present (e.g. uploaded from local); otherwise create template
if [ -f .env.production ]; then
    echo "📝 Using existing .env.production on EC2"
else
    echo "📝 Creating .env.production template..."
    cat > .env.production << 'ENVEOF'
NODE_ENV=production
PORT=5001
MONGO_URI=mongodb+srv://YOUR_MONGO_USER:YOUR_MONGO_PASSWORD@cluster0.xxxxx.mongodb.net/genio?retryWrites=true&w=majority
JWT_SECRET=change-this-to-a-random-secret-key
REDIS_HOST=accepted-wallaby-28584.upstash.io
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=YOUR_UPSTASH_REDIS_PASSWORD
REDIS_TLS=true
AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
AWS_S3_BUCKET=genio-videos
AWS_REGION=us-east-1
CORS_ORIGINS=*
HF_TOKEN=your_huggingface_token
ENVEOF
    echo "   ⚠️  Created .env.production - please update with your values!"
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
\$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml down 2>/dev/null || true

# Build and start services
echo "🔨 Building Server and Worker containers..."

# Use regular docker build (works without buildx)
# Docker Compose uses {project}_{service} format for image names
# Project name is directory name (Genio_V2 -> genio_v2)
PROJECT_NAME="genio_v2"

echo "   Building server image..."
if cd server && docker build -t \${PROJECT_NAME}_server:latest .; then
    cd ..
    echo "   ✅ Server image built"
else
    cd ..
    echo "   ❌ Server build failed"
    exit 1
fi

echo "   Building worker image..."
if cd worker && docker build -t \${PROJECT_NAME}_worker:latest .; then
    cd ..
    echo "   ✅ Worker image built"
else
    cd ..
    echo "   ❌ Worker build failed"
    exit 1
fi

echo "   ✅ All images built successfully"
echo "   Image names: \${PROJECT_NAME}_server, \${PROJECT_NAME}_worker"

echo "🚀 Starting Server and Worker..."
# Make sure we're in the right directory
cd ~/Genio_V2

# Create a temporary docker-compose override to use pre-built images
cat > docker-compose.override.yml << 'COMPOSE_EOF'
services:
  server:
    image: genio_v2_server:latest
  worker:
    image: genio_v2_worker:latest
COMPOSE_EOF

# Create/Update .env.production only if we did not upload one (file was created by template above)
if [ -f .env.production ] && ! grep -q "JWT_SECRET=change-this" .env.production 2>/dev/null; then
    echo "📝 Using existing .env.production (uploaded or already configured)"
else
    echo "📝 Creating/updating .env.production file..."

    # Generate a secure JWT_SECRET if not already set
    if [ -f .env.production ] && grep -q "^JWT_SECRET=" .env.production && ! grep -q "JWT_SECRET=change-this" .env.production; then
        JWT_SECRET=\$(grep "^JWT_SECRET=" .env.production | cut -d'=' -f2-)
        echo "   Using existing JWT_SECRET"
    else
        JWT_SECRET=\$(openssl rand -base64 32 2>/dev/null || echo "genio-secret-\$(date +%s)-\$RANDOM")
        echo "   Generated new JWT_SECRET"
    fi

    EXISTING_AWS_KEY=\$(grep "^AWS_ACCESS_KEY_ID=" .env.production 2>/dev/null | cut -d'=' -f2- || echo "")
    EXISTING_AWS_SECRET=\$(grep "^AWS_SECRET_ACCESS_KEY=" .env.production 2>/dev/null | cut -d'=' -f2- || echo "")
    if [[ "\$EXISTING_AWS_KEY" != "" ]] && [[ "\$EXISTING_AWS_KEY" != *"YOUR_AWS"* ]] && [[ "\$EXISTING_AWS_KEY" != *"your"* ]]; then
        USE_EXISTING_AWS=true
    else
        USE_EXISTING_AWS=false
    fi

    {
        echo "NODE_ENV=production"
        echo "PORT=5001"
        echo "MONGO_URI=mongodb+srv://YOUR_MONGO_USER:YOUR_MONGO_PASSWORD@cluster0.xxxxx.mongodb.net/genio?retryWrites=true&w=majority"
        echo "JWT_SECRET=\${JWT_SECRET}"
        echo "REDIS_HOST=accepted-wallaby-28584.upstash.io"
        echo "REDIS_PORT=6379"
        echo "REDIS_USERNAME=default"
        echo "REDIS_PASSWORD=YOUR_UPSTASH_REDIS_PASSWORD"
        echo "REDIS_TLS=true"
        if [ "\$USE_EXISTING_AWS" = "true" ]; then
            echo "AWS_ACCESS_KEY_ID=\${EXISTING_AWS_KEY}"
            echo "AWS_SECRET_ACCESS_KEY=\${EXISTING_AWS_SECRET}"
        else
            echo "AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID"
            echo "AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY"
        fi
        echo "AWS_S3_BUCKET=genio-videos"
        echo "AWS_REGION=us-east-1"
        echo "CORS_ORIGINS=*"
        echo "HF_TOKEN=your_huggingface_token"
    } > .env.production
    echo "   ✅ .env.production file created"
fi
echo "   📋 Verifying environment variables..."
if [ -f .env.production ]; then
    echo "   ✅ File exists"
    # Show first few lines (without sensitive data)
    head -n 5 .env.production | sed 's/PASSWORD=.*/PASSWORD=***/' | sed 's/SECRET=.*/SECRET=***/'
else
    echo "   ❌ File not found!"
    exit 1
fi

# Start services using pre-built images (override file takes precedence)
echo "   Starting containers..."
\$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production up -d

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 10

# Show status
echo ""
echo "📊 Container Status:"
\$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml ps

echo ""
echo "📋 Recent Logs:"
\$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml logs --tail=30

echo ""
echo "✅ Deployment complete!"
ENDSSH

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

echo ""

# Step 4: Verify Services
echo -e "${YELLOW}🔍 Step 4/5: Verifying services...${NC}"
sleep 5

# Re-send Instance Connect key so verification SSH works (temp key may have expired)
AZ=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --query "Reservations[*].Instances[*].Placement.AvailabilityZone" --output text --region "$REGION" 2>/dev/null || true)
if [ -n "$AZ" ]; then
    PUBLIC_KEY=$(ssh-keygen -y -f "$KEY_FILE" 2>/dev/null || true)
    if [ -n "$PUBLIC_KEY" ]; then
        aws ec2-instance-connect send-ssh-public-key --instance-id "$INSTANCE_ID" --availability-zone "$AZ" --instance-os-user "$SSH_USER" --ssh-public-key "$PUBLIC_KEY" --region "$REGION" >/dev/null 2>&1 || true
        sleep 2
    fi
fi

# Use IdentitiesOnly=yes so only our PEM is used (avoids "Permission denied" from other keys)
SSH_OPTS=(-i "$KEY_FILE" -o StrictHostKeyChecking=no -o IdentitiesOnly=yes)

# Check if server is responding
HEALTH_CHECK=$(ssh "${SSH_OPTS[@]}" "$SSH_USER@$INSTANCE_IP" \
  "curl -s -o /dev/null -w '%{http_code}' http://localhost:$SERVER_PORT/health || echo '000'" 2>/dev/null || echo "000")

if [ "$HEALTH_CHECK" = "200" ]; then
    echo -e "${GREEN}✅ Server is running and healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Server health check returned: $HEALTH_CHECK${NC}"
    echo -e "${CYAN}   This might be normal if services are still starting...${NC}"
fi

# Check containers
CONTAINER_STATUS=$(ssh "${SSH_OPTS[@]}" "$SSH_USER@$INSTANCE_IP" \
  "cd ~/Genio_V2 && (docker-compose -f docker-compose.prod.yml ps 2>/dev/null || docker compose -f docker-compose.prod.yml ps 2>/dev/null) | grep -c 'Up' || echo '0'" 2>/dev/null || echo "0")

echo -e "${GREEN}✅ Containers running: $CONTAINER_STATUS${NC}"
echo ""

# Step 5: Display Endpoint Information
echo -e "${YELLOW}🌐 Step 5/5: Endpoint Information${NC}"
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    API ENDPOINT                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}📍 Server (on EC2):${NC}"
echo -e "   ${CYAN}http://$INSTANCE_IP:$SERVER_PORT${NC} (use Cloudflare Tunnel for HTTPS)"
echo ""
echo -e "${GREEN}🔗 Stable URL for client:${NC}"
echo -e "   Use a named Cloudflare Tunnel (one-time setup) so the API URL never changes."
echo -e "   Then you do not need to redeploy the client when you push server/worker changes."
echo -e "   See ${CYAN}DEPLOYMENT.md${NC} for setup."
echo ""
echo -e "${GREEN}🔗 Health / API:${NC}"
echo -e "   ${CYAN}Health:${NC} http://$INSTANCE_IP:$SERVER_PORT/health"
echo -e "   ${CYAN}API:${NC}    http://$INSTANCE_IP:$SERVER_PORT/api"
echo ""
echo -e "${YELLOW}⚠️  Important:${NC}"
echo -e "   1. For HTTPS and a stable URL: set up a named tunnel once (DEPLOYMENT.md)."
echo -e "   2. To use updated env: put .env.production in project root and re-run deploy; or on EC2:"
echo -e "      ${CYAN}cd ~/Genio_V2 && nano .env.production${NC} then restart:"
echo -e "      ${CYAN}docker-compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production up -d${NC}"
echo ""
echo -e "${BLUE}📋 Useful Commands:${NC}"
echo -e "   ${CYAN}View logs:${NC}     docker-compose -f docker-compose.prod.yml logs -f"
echo -e "   ${CYAN}Server logs:${NC}   docker-compose -f docker-compose.prod.yml logs -f server"
echo -e "   ${CYAN}Worker logs:${NC}   docker-compose -f docker-compose.prod.yml logs -f worker"
echo -e "   ${CYAN}Restart:${NC}       docker-compose -f docker-compose.prod.yml restart"
echo -e "   ${CYAN}Status:${NC}        docker-compose -f docker-compose.prod.yml ps"
echo ""
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
