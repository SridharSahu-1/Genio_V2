# 🚀 Free Deployment Guide - Complete WebApp

This guide will help you deploy your entire application (Client, Server, and Worker) for **FREE** using:
- **Vercel** (Client) - Already deployed ✅
- **Render** (Server) - Free tier
- **Railway** (Worker) - $5/month free credit (best option)
- **MongoDB Atlas** (Database) - Free tier
- **Upstash Redis** (Queue) - Free tier

---

## 📋 Prerequisites

1. ✅ GitHub repository with your code
2. ✅ Vercel account (client already deployed)
3. ✅ Upstash Redis account (already created)
4. ✅ MongoDB Atlas account (free tier)
5. ✅ AWS S3 bucket (for video storage)

---

## 🗄️ Step 1: Set Up Databases

### MongoDB Atlas
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster (M0)
3. Create a database user
4. Whitelist IP: `0.0.0.0/0` (allow all IPs)
5. Get connection string: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

### Upstash Redis
1. Go to [Upstash Console](https://console.upstash.com/)
2. Your Redis database should already exist
3. Get connection details:
   - **Host**: `accepted-wallaby-28584.upstash.io` (from your .env)
   - **Port**: `6379`
   - **Password**: Extract from your Redis URL

**Parse your Redis URL:**
```
redis://default:YOUR_PASSWORD@accepted-wallaby-28584.upstash.io:6379
```
- Password is between `default:` and `@`
- Host is after `@` and before `:6379`

---

## 🖥️ Step 2: Deploy Server to Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `genio-server`
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:prod`
   - **Instance Type**: **Free**

5. **Environment Variables** (Add these):
   ```
   NODE_ENV=production
   PORT=10000
   MONGO_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   REDIS_HOST=accepted-wallaby-28584.upstash.io
   REDIS_PORT=6379
   REDIS_PASSWORD=YOUR_UPSTASH_PASSWORD
   JWT_SECRET=your-super-secret-jwt-key-min-32-chars
   CORS_ORIGINS=https://your-vercel-app.vercel.app
   AWS_ACCESS_KEY_ID=your-aws-key
   AWS_SECRET_ACCESS_KEY=your-aws-secret
   AWS_S3_BUCKET=your-bucket-name
   AWS_REGION=us-east-1
   ```

6. Click **Create Web Service**
7. Wait for deployment (5-10 minutes)
8. Copy your Render URL: `https://genio-server.onrender.com`

**Note**: Render free tier spins down after 15 minutes of inactivity. First request after spin-down takes ~30 seconds.

---

## ⚙️ Step 3: Deploy Worker (Recommended: Fly.io)

**Important**: Railway's free tier has build timeout issues with large Docker images (PyTorch + WhisperX). **Fly.io is recommended** for the worker.

### Option A: Fly.io (Recommended - Best for Free Tier)

Fly.io handles large Docker images better and has more generous free tier limits.

1. **Install Fly CLI**:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login to Fly.io**:
   ```bash
   flyctl auth login
   ```

3. **Navigate to worker directory and deploy**:
   ```bash
   cd worker
   flyctl launch
   ```
   - When prompted:
     - Use existing `fly.toml`? **Yes**
     - App name: `genio-worker` (or your choice)
     - Region: Choose closest (e.g., `iad` for US East)
     - Don't deploy yet, just create the app

4. **Set Environment Variables**:
   ```bash
   flyctl secrets set REDIS_HOST=accepted-wallaby-28584.upstash.io
   flyctl secrets set REDIS_PORT=6379
   flyctl secrets set REDIS_PASSWORD=YOUR_UPSTASH_PASSWORD
   flyctl secrets set AWS_ACCESS_KEY_ID=your-aws-key
   flyctl secrets set AWS_SECRET_ACCESS_KEY=your-aws-secret
   flyctl secrets set AWS_S3_BUCKET=your-bucket-name
   flyctl secrets set AWS_REGION=us-east-1
   flyctl secrets set NODE_ENV=production
   ```

5. **Deploy**:
   ```bash
   flyctl deploy
   ```

6. **Monitor**:
   ```bash
   flyctl logs
   ```

Fly.io free tier includes:
- ✅ 3 shared-cpu VMs
- ✅ 3GB persistent volume
- ✅ 160GB outbound data transfer
- ✅ No build timeout issues

### Option B: Railway (Alternative - May Have Build Timeout)

**Note**: Railway free tier may timeout during Docker build due to large image size (~2-3GB). If you encounter build timeouts, use Fly.io (Option A) instead.

1. Go to [Railway](https://railway.app/)
2. Sign up with GitHub
3. Click **New Project** → **Deploy from GitHub repo**
4. Select your repository
5. **Important**: In Railway settings, set **Root Directory** to: `worker`
6. Railway will auto-detect the `Dockerfile` in the `worker/` directory
7. **Environment Variables** (Add these):
   ```
   NODE_ENV=production
   REDIS_HOST=accepted-wallaby-28584.upstash.io
   REDIS_PORT=6379
   REDIS_PASSWORD=YOUR_UPSTASH_PASSWORD
   AWS_ACCESS_KEY_ID=your-aws-key
   AWS_SECRET_ACCESS_KEY=your-aws-secret
   AWS_S3_BUCKET=your-bucket-name
   AWS_REGION=us-east-1
   HF_TOKEN=your-huggingface-token (if needed)
   ```

8. If build times out, see `RAILWAY_FIX.md` for solutions

---

## 🔗 Step 4: Connect Frontend to Backend

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Add/Update:
   ```
   NEXT_PUBLIC_API_URL=https://genio-server.onrender.com
   ```
3. **Redeploy** your Vercel app

---

## ✅ Step 5: Verify Deployment

1. **Test Server**: Visit `https://genio-server.onrender.com/health`
   - Should return: `{ "status": "ok", "services": { "database": "connected", "redis": "connected" } }`

2. **Test Worker**: Check Railway/Fly.io logs
   - Should see: `✅ Worker ready and listening for jobs on queue 'video-processing'`

3. **Test Full Flow**:
   - Upload a video from your Vercel frontend
   - Check Render logs (server should add job to queue)
   - Check Railway/Fly.io logs (worker should pick up and process)
   - Check S3 bucket (subtitle file should appear)

---

## 💰 Cost Breakdown (All Free for PoC)

- **Vercel**: Free (Client)
- **Render**: Free (Server) - spins down after inactivity
- **Railway**: $5/month free credit (Worker) - enough for ~50-100 hours/month
- **MongoDB Atlas**: Free (512MB storage)
- **Upstash Redis**: Free (10K commands/day)
- **AWS S3**: Free tier (5GB storage, 20K GET requests)

**Total Cost: $0/month** ✅

---

## 🐛 Troubleshooting

### Server spins down on Render
- First request after 15 min inactivity takes ~30 seconds
- Consider upgrading to Starter ($7/month) if needed

### Worker not processing jobs
- Check Railway/Fly.io logs
- Verify Redis connection (check REDIS_HOST and REDIS_PASSWORD)
- Ensure worker is running: Check Railway/Fly.io dashboard

### CORS errors
- Update `CORS_ORIGINS` in Render to include your Vercel URL
- Redeploy Render service

### Redis connection errors
- Verify Upstash password is correct
- Check if Redis database is active in Upstash console
- Ensure `REDIS_HOST` doesn't include `redis://` prefix (just the hostname)

---

## 📊 Monitoring

- **Render**: Dashboard shows logs and metrics
- **Railway**: Dashboard shows usage, logs, and cost
- **Fly.io**: `flyctl logs` or dashboard
- **Upstash**: Console shows Redis commands and usage

---

## 🚀 Next Steps (When Scaling)

When you need to scale beyond free tiers:
1. **Render Starter** ($7/month) - No spin-down, better performance
2. **Railway Pro** ($20/month) - More resources for worker
3. **MongoDB Atlas M10** ($57/month) - Production database
4. **Upstash Pay-as-you-go** - More Redis commands

But for PoC, the free setup works perfectly! 🎉
