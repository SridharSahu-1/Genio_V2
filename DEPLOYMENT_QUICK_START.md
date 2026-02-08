# 🚀 Quick Start - Deploy Server + Worker to EC2

## One-Command Deployment

```bash
./deploy-to-ec2.sh
```

This script will:
1. ✅ Upload server and worker code to EC2
2. ✅ Install Docker & Docker Compose (if needed)
3. ✅ Build Docker images for both services
4. ✅ Start Server, Worker, and Redis
5. ✅ Display your API endpoint

## After Deployment

### 1. Configure Environment Variables

SSH to EC2:
```bash
./connect-ec2.sh
```

Edit environment file:
```bash
cd ~/Genio_V2
nano .env.production
```

**Required Variables:**
```env
# MongoDB (use MongoDB Atlas or your MongoDB URI)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/genio?retryWrites=true&w=majority

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-super-secret-jwt-key-here

# AWS Credentials
AWS_ACCESS_KEY_ID=AKIAQMLJCG7QOGUGS6DI
AWS_SECRET_ACCESS_KEY=your-actual-secret-key

# S3 Bucket
AWS_S3_BUCKET=genio-videos
AWS_REGION=us-east-1

# CORS (your frontend URL)
CORS_ORIGINS=https://your-frontend-domain.com

# Hugging Face Token (for worker)
HF_TOKEN=your-huggingface-token
```

### 2. Restart Services

```bash
docker-compose -f docker-compose.prod.yml restart
```

### 3. Test Your Endpoint

```bash
# From your local machine
curl http://3.84.220.241:5001/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "...",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

## Your API Endpoint

**Base URL:** `http://3.84.220.241:5001`

**Available Endpoints:**
- Health: `http://3.84.220.241:5001/health`
- API: `http://3.84.220.241:5001/api`
- Auth: `http://3.84.220.241:5001/api/auth/register`
- Videos: `http://3.84.220.241:5001/api/videos`

## Important: Security Group Configuration

Make sure your EC2 Security Group allows inbound traffic on port **5001**:

1. Go to AWS Console → EC2 → Security Groups
2. Select your instance's security group
3. Add inbound rule:
   - **Type**: Custom TCP
   - **Port**: 5001
   - **Source**: 
     - `0.0.0.0/0` (for testing - not recommended for production)
     - Or your specific IP for better security

## Management Commands

```bash
# SSH to EC2
./connect-ec2.sh

# View all logs
docker-compose -f docker-compose.prod.yml logs -f

# View server logs only
docker-compose -f docker-compose.prod.yml logs -f server

# View worker logs only
docker-compose -f docker-compose.prod.yml logs -f worker

# Restart all services
docker-compose -f docker-compose.prod.yml restart

# Stop all services
docker-compose -f docker-compose.prod.yml down

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build

# Check status
docker-compose -f docker-compose.prod.yml ps
```

## Architecture

```
EC2 Instance (3.84.220.241)
├── Server (Port 5001) ← Your API Endpoint
│   └── Fastify API
├── Worker
│   └── WhisperX Video Processing
└── Redis
    └── Job Queue
```

**External Services:**
- MongoDB (Atlas or external) ← Database
- AWS S3 ← Video Storage

## Troubleshooting

### Server not responding
```bash
# Check if server container is running
docker-compose -f docker-compose.prod.yml ps

# Check server logs
docker-compose -f docker-compose.prod.yml logs server

# Common issues:
# - MongoDB connection failed → Check MONGO_URI
# - Port 5001 already in use → Stop other services
```

### Worker not processing jobs
```bash
# Check worker logs
docker-compose -f docker-compose.prod.yml logs worker

# Check Redis connection
docker-compose -f docker-compose.prod.yml logs redis

# Common issues:
# - Redis connection failed → Check REDIS_HOST
# - AWS credentials missing → Check .env.production
```

### Can't access from outside
- Check EC2 Security Group allows port 5001
- Check server is running: `docker-compose -f docker-compose.prod.yml ps`
- Test locally on EC2: `curl http://localhost:5001/health`

## Next Steps

1. ✅ Deploy: `./deploy-to-ec2.sh`
2. ✅ Configure: Edit `.env.production` on EC2
3. ✅ Test: `curl http://3.84.220.241:5001/health`
4. ✅ Update frontend: Point `NEXT_PUBLIC_API_URL` to `http://3.84.220.241:5001`
5. ✅ Deploy frontend: Deploy to Vercel/Netlify with new API URL

---

**That's it! Your Server and Worker are now running together on EC2!** 🎉
