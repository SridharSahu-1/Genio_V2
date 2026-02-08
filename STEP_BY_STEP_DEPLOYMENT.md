# 🚀 Step-by-Step Deployment Guide

Complete guide to deploy your Server and Worker for FREE.

---

## 📋 Prerequisites Checklist

Before starting, make sure you have:
- [ ] GitHub repository with your code pushed
- [ ] MongoDB Atlas account (free tier)
- [ ] Upstash Redis account (already created)
- [ ] AWS S3 bucket with credentials
- [ ] Vercel account (client already deployed)

---

## 🗄️ Step 1: Get Your Database Credentials

### 1.1 MongoDB Atlas Connection String

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Click **"Create"** or select your existing cluster
3. Click **"Connect"** on your cluster
4. Choose **"Connect your application"**
5. Copy the connection string (looks like):
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<password>` with your actual database password
7. **Save this** - you'll need it for the server

### 1.2 Upstash Redis Credentials

1. Go to [Upstash Console](https://console.upstash.com/)
2. Click on your Redis database
3. You'll see your Redis URL (from your .env file):
   ```
   redis://default:PASSWORD@accepted-wallaby-28584.upstash.io:6379
   ```
4. Extract:
   - **Host**: `accepted-wallaby-28584.upstash.io`
   - **Port**: `6379`
   - **Password**: The part between `default:` and `@`
5. **Save these** - you'll need them for both server and worker

---

## 🖥️ Step 2: Deploy Server to Render

### 2.1 Create Render Account

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Sign up with **GitHub** (recommended)
3. Authorize Render to access your repositories

### 2.2 Create Web Service

1. Click **"New +"** button (top right)
2. Select **"Web Service"**
3. Connect your GitHub repository:
   - Click **"Connect account"** if not connected
   - Select your repository: `Genio_V2` (or your repo name)
   - Click **"Connect"**

### 2.3 Configure Server Settings

Fill in the following:

- **Name**: `genio-server` (or your choice)
- **Root Directory**: `server` ⚠️ **IMPORTANT**
- **Environment**: `Node`
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm run start:prod`
- **Instance Type**: Select **"Free"**

⚠️ **Important**: Make sure `package.json` is committed to your GitHub repo. If you just added the build script, commit and push:
```bash
git add server/package.json
git commit -m "Add build script to package.json"
git push
```

### 2.4 Add Environment Variables

Scroll down to **"Environment Variables"** section and click **"Add Environment Variable"** for each:

```
NODE_ENV = production
```

```
PORT = 10000
```

```
MONGO_URI = mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```
*(Replace with your actual MongoDB connection string)*

```
REDIS_HOST = accepted-wallaby-28584.upstash.io
```

```
REDIS_PORT = 6379
```

```
REDIS_PASSWORD = YOUR_UPSTASH_PASSWORD
```
*(Extract from your Redis URL - the part between `default:` and `@`)*

```
JWT_SECRET = your-super-secret-jwt-key-minimum-32-characters-long
```
*(Generate a random string, at least 32 characters)*

```
CORS_ORIGINS = https://your-vercel-app.vercel.app
```
*(Replace with your actual Vercel frontend URL)*

```
AWS_ACCESS_KEY_ID = your-aws-access-key
```

```
AWS_SECRET_ACCESS_KEY = your-aws-secret-key
```

```
AWS_S3_BUCKET = your-bucket-name
```

```
AWS_REGION = us-east-1
```
*(Or your bucket's region)*

### 2.5 Deploy Server

1. Click **"Create Web Service"** at the bottom
2. Wait for deployment (5-10 minutes)
3. You'll see build logs in real-time
4. Once deployed, copy your server URL: `https://genio-server.onrender.com`
   *(Or whatever name you chose)*

### 2.6 Verify Server Deployment

1. Open a new browser tab
2. Visit: `https://your-server-name.onrender.com/health`
3. You should see:
   ```json
   {
     "status": "ok",
     "services": {
       "database": "connected",
       "redis": "connected"
     }
   }
   ```

✅ **Server is deployed!**

---

## ⚙️ Step 3: Deploy Worker to Fly.io

### 3.1 Install Fly CLI

**On macOS/Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

**On Windows (PowerShell):**
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

**Verify installation:**
```bash
flyctl version
```

### 3.2 Login to Fly.io

```bash
flyctl auth login
```

This will open a browser window. Sign up/login with GitHub.

### 3.3 Navigate to Worker Directory

```bash
cd worker
```

Make sure you're in the `worker/` directory (you should see `Dockerfile` and `package.json`).

### 3.4 Initialize Fly.io App

```bash
flyctl launch
```

You'll be prompted with questions:

1. **"Would you like to copy its configuration to the new app?"**
   - Type: `Yes` (to use the existing `fly.toml`)

2. **"App Name"**
   - Type: `genio-worker` (or your choice)
   - Press Enter

3. **"Select Organization"**
   - Select your personal organization
   - Press Enter

4. **"Select Region"**
   - Choose closest region (e.g., `iad` for US East, `sjc` for US West)
   - Press Enter

5. **"Would you like to set up a Postgresql database now?"**
   - Type: `No`
   - Press Enter

6. **"Would you like to set up an Upstash Redis database now?"**
   - Type: `No` (you already have one)
   - Press Enter

7. **"Would you like to deploy now?"**
   - Type: `No` (we'll set env vars first)
   - Press Enter

### 3.5 Set Environment Variables (Secrets)

Run these commands one by one (replace with your actual values):

```bash
flyctl secrets set NODE_ENV=production
```

```bash
flyctl secrets set REDIS_HOST=accepted-wallaby-28584.upstash.io
```

```bash
flyctl secrets set REDIS_PORT=6379
```

```bash
flyctl secrets set REDIS_PASSWORD=YOUR_UPSTASH_PASSWORD
```
*(Replace with your actual Upstash password)*

```bash
flyctl secrets set AWS_ACCESS_KEY_ID=your-aws-access-key
```

```bash
flyctl secrets set AWS_SECRET_ACCESS_KEY=your-aws-secret-key
```

```bash
flyctl secrets set AWS_S3_BUCKET=your-bucket-name
```

```bash
flyctl secrets set AWS_REGION=us-east-1
```

**Verify secrets are set:**
```bash
flyctl secrets list
```

### 3.6 Deploy Worker

```bash
flyctl deploy
```

This will:
1. Build the Docker image (takes 10-15 minutes - PyTorch is large!)
2. Push to Fly.io
3. Deploy the worker

**Watch the logs** - you'll see the build progress.

### 3.7 Verify Worker Deployment

**Check logs:**
```bash
flyctl logs
```

You should see:
```
✅ Running in cloud/Docker environment - worker enabled
🔗 Worker connecting to Redis at accepted-wallaby-28584.upstash.io:6379
✅ Worker ready and listening for jobs on queue 'video-processing'
```

**Check worker status:**
```bash
flyctl status
```

✅ **Worker is deployed!**

---

## 🔗 Step 4: Connect Frontend to Backend

### 4.1 Update Vercel Environment Variables

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add or update:
   - **Key**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://genio-server.onrender.com`
   - **Environment**: Production (and Preview if needed)
5. Click **"Save"**

### 4.2 Redeploy Frontend

1. Go to **Deployments** tab
2. Click **"..."** on the latest deployment
3. Click **"Redeploy"**
4. Wait for deployment to complete

✅ **Frontend is connected!**

---

## ✅ Step 5: Test the Complete System

### 5.1 Test Server Health

Visit: `https://genio-server.onrender.com/health`

Should return:
```json
{
  "status": "ok",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### 5.2 Test Full Flow

1. **Open your Vercel app**: `https://your-app.vercel.app`
2. **Login/Register** a test user
3. **Upload a video**
4. **Monitor the process**:
   - Check Render logs (server processing)
   - Check Fly.io logs: `flyctl logs` (worker processing)
   - Check S3 bucket (subtitle file should appear)

### 5.3 Monitor Logs

**Server logs (Render):**
- Go to Render Dashboard → Your Service → **Logs** tab

**Worker logs (Fly.io):**
```bash
cd worker
flyctl logs
```

---

## 🐛 Troubleshooting

### Server Issues

**Problem**: Server shows "degraded" status
- **Solution**: Check MongoDB and Redis credentials in Render environment variables

**Problem**: CORS errors
- **Solution**: Update `CORS_ORIGINS` in Render to include your Vercel URL

**Problem**: Server spins down after 15 minutes
- **Solution**: This is normal for Render free tier. First request after spin-down takes ~30 seconds

### Worker Issues

**Problem**: Worker not connecting to Redis
- **Solution**: 
  ```bash
  flyctl secrets list
  ```
  Verify `REDIS_HOST` and `REDIS_PASSWORD` are correct

**Problem**: Worker not processing jobs
- **Solution**: Check logs:
  ```bash
  flyctl logs
  ```
  Look for connection errors

**Problem**: Build fails on Fly.io
- **Solution**: Make sure you're in the `worker/` directory when running `flyctl deploy`

### General Issues

**Problem**: Can't find environment variables
- **Solution**: Double-check spelling and that you're in the correct directory

**Problem**: Deployment takes too long
- **Solution**: This is normal! Docker build with PyTorch takes 10-15 minutes

---

## 📊 Monitoring Your Deployment

### Render (Server)
- **Dashboard**: [Render Dashboard](https://dashboard.render.com/)
- **Logs**: Service → Logs tab
- **Metrics**: Service → Metrics tab

### Fly.io (Worker)
- **Dashboard**: [Fly.io Dashboard](https://fly.io/dashboard)
- **Logs**: `flyctl logs` or Dashboard → Logs
- **Status**: `flyctl status`

### Upstash (Redis)
- **Dashboard**: [Upstash Console](https://console.upstash.com/)
- **Metrics**: Database → Metrics tab

---

## 🎉 Success Checklist

- [ ] Server deployed on Render
- [ ] Server health check returns "ok"
- [ ] Worker deployed on Fly.io
- [ ] Worker logs show "ready and listening"
- [ ] Frontend updated with server URL
- [ ] Test upload works end-to-end

---

## 💰 Cost Summary

| Service | Cost |
|---------|------|
| Render (Server) | ✅ Free |
| Fly.io (Worker) | ✅ Free (3 shared VMs) |
| MongoDB Atlas | ✅ Free (512MB) |
| Upstash Redis | ✅ Free (10K commands/day) |
| Vercel (Client) | ✅ Free |
| **Total** | **$0/month** 🎉 |

---

## 🚀 Next Steps

Once everything is working:
1. Monitor usage in each platform's dashboard
2. Set up alerts if needed
3. Consider upgrading when you scale beyond free tiers

**You're all set! Your entire webapp is now deployed for FREE!** 🎊
