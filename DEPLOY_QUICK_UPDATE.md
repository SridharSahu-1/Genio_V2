# Quick Update Guide - Deploy Latest Code to EC2

This guide shows you how to quickly push your latest server and worker code to EC2 and restart the services.

## Quick Method (Recommended)

Use the automated script:

```bash
./quick-update-ec2.sh [path-to-key.pem]
```

Example:
```bash
./quick-update-ec2.sh ~/genio-worker-new.pem
```

This script will:
1. Upload latest code (server/, worker/, docker-compose.prod.yml)
2. Rebuild Docker images
3. Restart containers

## Manual Method

If you prefer to do it manually:

### Step 1: Upload Code

```bash
# Set your key file path
KEY_FILE="~/genio-worker-new.pem"
INSTANCE_IP="3.84.220.241"
SSH_USER="ec2-user"

# Upload code
rsync -avz --progress \
  -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=no" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='venv' \
  --exclude='dist' \
  --exclude='temp' \
  --exclude='client' \
  ./ "$SSH_USER@$INSTANCE_IP:~/Genio_V2/"
```

### Step 2: SSH into EC2 and Restart Services

```bash
ssh -i $KEY_FILE $SSH_USER@$INSTANCE_IP
```

Once connected:

```bash
cd ~/Genio_V2

# Stop containers
docker-compose -f docker-compose.prod.yml down
# OR if using Docker Compose v2:
docker compose -f docker-compose.prod.yml down

# Rebuild images
cd server && docker build -t genio_v2_server:latest . && cd ..
cd worker && docker build -t genio_v2_worker:latest . && cd ..

# Start services
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
# OR:
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### Step 3: Verify Services

```bash
# Check container status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# View server logs only
docker-compose -f docker-compose.prod.yml logs -f server

# View worker logs only
docker-compose -f docker-compose.prod.yml logs -f worker
```

## Important Notes

1. **Environment Variables**: The `.env.production` file on EC2 contains your production credentials. It won't be overwritten by the update script.

2. **Build Requirements**: Make sure you've built the TypeScript code locally before deploying:
   ```bash
   cd server && npm run build
   cd ../worker && npm run build
   ```

3. **Docker Compose Version**: The script detects whether you're using `docker-compose` (v1) or `docker compose` (v2) automatically.

4. **Full Deployment**: For a complete fresh deployment (including environment setup), use:
   ```bash
   ./deploy-to-ec2.sh [path-to-key.pem]
   ```

## Troubleshooting

### Services won't start
```bash
# Check logs for errors
docker-compose -f docker-compose.prod.yml logs

# Check if images were built
docker images | grep genio_v2
```

### Code not updating
```bash
# Force rebuild without cache
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

### Worker not connecting to Redis
- Check `.env.production` on EC2 has correct Redis credentials
- Verify `REDIS_TLS` setting matches your Redis provider
- Check worker logs: `docker-compose -f docker-compose.prod.yml logs worker`

## Quick Commands Reference

```bash
# Restart services (without rebuild)
docker-compose -f docker-compose.prod.yml restart

# Restart specific service
docker-compose -f docker-compose.prod.yml restart server
docker-compose -f docker-compose.prod.yml restart worker

# Stop all services
docker-compose -f docker-compose.prod.yml down

# View real-time logs
docker-compose -f docker-compose.prod.yml logs -f

# Check service health
curl http://localhost:5001/health
```
