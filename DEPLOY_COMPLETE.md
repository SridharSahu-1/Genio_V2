# 🚀 Complete Deployment Guide - Server + Worker

This guide shows you how to deploy both the **Server** and **Worker** together on AWS.

---

## 📋 Deployment Options

### Option 1: EC2 with Docker Compose (Recommended - Easiest)
Deploy both server and worker on a single EC2 instance using Docker Compose.

**Pros:**
- ✅ Simple setup
- ✅ Both services on one instance
- ✅ Easy to manage
- ✅ Cost-effective

**Cons:**
- ❌ Single point of failure
- ❌ Limited scalability

### Option 2: ECS Fargate (Scalable)
Deploy server and worker as separate ECS services.

**Pros:**
- ✅ Auto-scaling
- ✅ High availability
- ✅ Serverless (no server management)

**Cons:**
- ❌ More complex setup
- ❌ Higher cost

### Option 3: Separate EC2 Instances
Deploy server and worker on separate EC2 instances.

**Pros:**
- ✅ Better isolation
- ✅ Can scale independently

**Cons:**
- ❌ More expensive
- ❌ More complex management

---

## 🎯 Option 1: EC2 with Docker Compose (Recommended)

### Prerequisites

- ✅ EC2 instance running (you already have one)
- ✅ Code uploaded to EC2 (use `./upload-to-ec2.sh`)
- ✅ AWS credentials configured

### Step 1: Upload Code to EC2

```bash
# From your local machine
./upload-to-ec2.sh
```

### Step 2: Connect to EC2

```bash
./connect-ec2.sh
```

### Step 3: Install Docker & Docker Compose (on EC2)

```bash
# Install Docker
sudo yum update -y
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Log out and back in for group changes
exit
# Then reconnect: ./connect-ec2.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### Step 4: Create Environment File (on EC2)

```bash
cd ~/Genio_V2
nano .env.production
```

Add your environment variables:

```env
NODE_ENV=production
PORT=5001

# MongoDB (use MongoDB Atlas or your MongoDB URI)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/genio?retryWrites=true&w=majority

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-super-secret-jwt-key-here

# Redis (local Redis in Docker)
REDIS_HOST=redis
REDIS_PORT=6379

# AWS S3
AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_S3_BUCKET=genio-videos
AWS_REGION=us-east-1

# CORS (your frontend URL)
CORS_ORIGINS=https://your-frontend-domain.com,https://www.your-frontend-domain.com

# Hugging Face Token (for worker)
HF_TOKEN=your-huggingface-token
```

Save: `Ctrl+X`, then `Y`, then `Enter`

### Step 5: Build and Start Services (on EC2)

```bash
cd ~/Genio_V2

# Build and start all services
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

This will:
- Build server Docker image
- Build worker Docker image
- Start Redis container
- Start server container
- Start worker container

### Step 6: Check Status

```bash
# Check running containers
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Check server logs only
docker-compose -f docker-compose.prod.yml logs -f server

# Check worker logs only
docker-compose -f docker-compose.prod.yml logs -f worker
```

### Step 7: Configure Security Group

In AWS Console:
1. Go to EC2 → Security Groups
2. Find your instance's security group
3. Add inbound rule:
   - **Type**: Custom TCP
   - **Port**: 5001
   - **Source**: 0.0.0.0/0 (or your IP for security)

### Step 8: Test Deployment

```bash
# Test server health
curl http://3.84.220.241:5001/health

# Should return:
# {
#   "status": "ok",
#   "timestamp": "...",
#   "services": {
#     "database": "connected",
#     "redis": "connected"
#   }
# }
```

---

## 🎯 Option 2: Automated Deployment Script

Use the automated script to deploy everything:

```bash
# From your local machine
./deploy-aws.sh
```

This script will:
1. Upload code to EC2
2. Install Docker & Docker Compose
3. Create .env.production template
4. Build and start all services

**Note**: You'll still need to edit `.env.production` on EC2 with your actual values.

---

## 🔧 Management Commands

### On EC2 Instance:

```bash
cd ~/Genio_V2

# View all logs
docker-compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker-compose -f docker-compose.prod.yml logs -f server
docker-compose -f docker-compose.prod.yml logs -f worker

# Restart services
docker-compose -f docker-compose.prod.yml restart

# Stop services
docker-compose -f docker-compose.prod.yml down

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build

# Check status
docker-compose -f docker-compose.prod.yml ps

# View resource usage
docker stats
```

---

## 🎯 Option 3: ECS Fargate (Advanced)

For production with auto-scaling, deploy to ECS Fargate.

### Step 1: Create ECR Repositories

```bash
export AWS_PROFILE=genio

# Create repositories
aws ecr create-repository --repository-name genio-server --region us-east-1
aws ecr create-repository --repository-name genio-worker --region us-east-1
```

### Step 2: Build and Push Images

```bash
# Get account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile genio)

# Login to ECR
aws ecr get-login-password --region us-east-1 --profile genio | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Build and push server
cd server
docker build -t genio-server .
docker tag genio-server:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/genio-server:latest
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/genio-server:latest

# Build and push worker
cd ../worker
docker build -t genio-worker .
docker tag genio-worker:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest
```

### Step 3: Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name genio-cluster --region us-east-1 --profile genio
```

### Step 4: Create Task Definitions

See `server/task-definition.json` and `worker/task-definition.json` (create these files).

### Step 5: Create Services

Create ECS services for both server and worker.

---

## 📊 Architecture

```
┌─────────────────┐
│   Frontend      │ (Vercel/Netlify)
│   (Next.js)     │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────┐
│   Server        │ (EC2:5001 or ECS)
│   (Fastify)     │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│ MongoDB│ │ Redis  │
│ (Atlas)│ │ (EC2)  │
└────────┘ └────┬───┘
                │
                ▼
         ┌──────────┐
         │  Worker  │ (EC2 or ECS)
         │(WhisperX)│
         └────┬─────┘
              │
              ▼
         ┌──────────┐
         │   S3     │
         │ (Videos) │
         └──────────┘
```

---

## 🔐 Security Checklist

- [ ] Change default MongoDB credentials
- [ ] Use strong JWT_SECRET (generate with `openssl rand -base64 32`)
- [ ] Configure CORS_ORIGINS with your actual domain
- [ ] Use AWS Secrets Manager for sensitive data (production)
- [ ] Enable HTTPS (use Application Load Balancer or CloudFront)
- [ ] Restrict security group to specific IPs (not 0.0.0.0/0)
- [ ] Enable CloudWatch monitoring
- [ ] Set up backup for MongoDB

---

## 💰 Cost Estimation

### EC2 Option:
- **t3.medium** (2 vCPU, 4GB RAM): ~$30/month
- **Data transfer**: ~$10/month
- **Total**: ~$40/month

### ECS Fargate Option:
- **Server** (1 vCPU, 2GB): ~$30/month
- **Worker** (2 vCPU, 4GB): ~$60/month
- **Total**: ~$90/month

---

## 🐛 Troubleshooting

### Server won't start
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs server

# Common issues:
# - MongoDB connection failed → Check MONGO_URI
# - Redis connection failed → Check Redis is running
# - Port 5001 already in use → Stop other services
```

### Worker won't start
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs worker

# Common issues:
# - Redis connection failed → Check REDIS_HOST
# - HF_TOKEN missing → Add to .env.production
# - Out of memory → Increase instance size
```

### Can't connect from outside
- Check security group allows port 5001
- Check server is listening on 0.0.0.0 (not localhost)

---

## ✅ Quick Start (Recommended)

```bash
# 1. Upload code
./upload-to-ec2.sh

# 2. Deploy (automated)
./deploy-aws.sh

# 3. Edit environment variables on EC2
./connect-ec2.sh
cd ~/Genio_V2
nano .env.production
# Add your actual values

# 4. Restart services
docker-compose -f docker-compose.prod.yml restart
```

---

Choose the option that works best for you! **Option 1 (EC2 with Docker Compose)** is recommended for getting started quickly.
