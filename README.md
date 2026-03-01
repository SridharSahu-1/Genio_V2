# Genio V2 - AI Video Platform

## Architecture
- **Frontend**: Next.js 14, Shadcn/UI, Tailwind (Port: 3000)
- **Backend**: Fastify, Mongoose, BullMQ (Port: 5001)
- **Worker**: Node.js + Python (WhisperX) — **must be running for video processing**
- **Infrastructure**: Docker (MongoDB, Redis)

## Setup

1. **Start Infrastructure** (MongoDB, Redis):
   ```bash
   docker-compose up -d
   ```

2. **Backend + Worker** (both required for upload → subtitle generation):
   - **Option A – one command from repo root** (recommended):
     ```bash
     npm install
     npm run dev
     ```
     This runs the **server** and **worker** together. Keep this terminal open.
   - **Option B – two terminals**:
     - Terminal 1 (server):
       ```bash
       cd server && npm install && npm run dev
       ```
     - Terminal 2 (worker):
       ```bash
       cd worker && npm install && npm run dev
       ```
   **Important:** If only the server is running, uploads will succeed but jobs will sit in the queue and videos will never get subtitles. You must have the **worker** running for processing.

3. **Frontend** (separate terminal):
   ```bash
   cd client
   npm install
   npm run dev
   ```

## Python Requirements
The worker expects a python environment with `whisperx` installed.
```bash
pip install git+https://github.com/m-bain/whisperx.git
pip install torch torchvision torchaudio
```

## Features
- User Auth (JWT)
- Video Upload (Direct to AWS S3)
- AI Subtitle Generation (WhisperX)
- Progress Tracking
- Dashboard

## Environment Variables

### Server (`server/.env`)
```env
NODE_ENV=development
PORT=5001
MONGO_URI=mongodb://admin:password123@localhost:27018/genio?authSource=admin
JWT_SECRET=your-super-secret-jwt-key
REDIS_HOST=localhost
REDIS_PORT=6379
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-s3-bucket-name
CORS_ORIGINS=http://localhost:3000
```

### Worker (`worker/.env`)
```env
NODE_ENV=development
REDIS_HOST=localhost
REDIS_PORT=6379
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-s3-bucket-name
HF_TOKEN=your-huggingface-token
```

### Client (`client/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:5001
```

## Production deployment (EC2 + Vercel)

Server and worker run on EC2; the client is on Vercel. To get a **stable API URL** so you don’t have to redeploy the client when you push backend changes, use a **named Cloudflare Tunnel** (one-time setup). See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full guide.

- **Routine deploy (server/worker only):** `./deploy-to-ec2.sh` — no client redeploy needed.
- **SSH to EC2:** `./connect-ec2.sh`

## AWS Deployment Checklist

Before deploying to AWS, ensure:

1. ✅ All environment variables are set (no hardcoded values)
2. ✅ JWT_SECRET is a strong random string (use `openssl rand -base64 32`)
3. ✅ MongoDB credentials are secure (not default values)
4. ✅ CORS_ORIGINS is set to your production domain(s)
5. ✅ AWS S3 bucket exists and has proper permissions
6. ✅ Health check endpoint is accessible at `/health`
7. ✅ All services can connect to Redis and MongoDB
8. ✅ Worker has access to Python environment with WhisperX

## Health Check

The server provides a health check endpoint:
```bash
curl http://localhost:5001/health
```

This returns the status of database and Redis connections.



