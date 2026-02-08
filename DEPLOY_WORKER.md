# 🚀 Deploy Worker to Fly.io - Step by Step

Complete guide to deploy your worker for video processing.

---

## 📋 Prerequisites

- ✅ Client deployed on Vercel
- ✅ Server deployed on Render
- ✅ Upstash Redis credentials ready
- ✅ AWS S3 credentials ready

---

## Step 1: Install Fly CLI

### macOS/Linux:
```bash
curl -L https://fly.io/install.sh | sh
```

### Windows (PowerShell):
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

### Verify Installation:
```bash
flyctl version
```

You should see something like: `flyctl v0.x.x`

---

## Step 2: Login to Fly.io

```bash
flyctl auth login
```

This will:
1. Open your browser
2. Ask you to sign up/login (use GitHub for easy setup)
3. Authorize Fly.io

**After login**, you'll see: `Successfully logged in as <your-email>`

---

## Step 3: Navigate to Worker Directory

```bash
cd worker
```

Make sure you're in the `worker/` directory. You should see:
- `Dockerfile`
- `fly.toml`
- `package.json`
- `src/` folder

---

## Step 4: Initialize Fly.io App

```bash
flyctl launch
```

You'll be prompted with questions. Answer as follows:

### Question 1: "Would you like to copy its configuration to the new app?"
**Answer**: `Yes` (to use the existing `fly.toml`)

### Question 2: "App Name"
**Answer**: `genio-worker` (or press Enter to use default)

### Question 3: "Select Organization"
**Answer**: Select your personal organization (usually your username)

### Question 4: "Select Region"
**Answer**: Choose the closest region:
- `iad` - US East (Virginia) - Recommended for US
- `sjc` - US West (San Jose)
- `lhr` - Europe (London)
- `nrt` - Asia (Tokyo)

Type the region code (e.g., `iad`) and press Enter.

### Question 5: "Would you like to set up a Postgresql database now?"
**Answer**: `No`

### Question 6: "Would you like to set up an Upstash Redis database now?"
**Answer**: `No` (you already have one)

### Question 7: "Would you like to deploy now?"
**Answer**: `No` (we'll set environment variables first)

---

## Step 5: Set Environment Variables (Secrets)

Set these one by one. **Replace the values with your actual credentials:**

### Basic Settings:
```bash
flyctl secrets set NODE_ENV=production
```

### Redis Connection (Upstash):
```bash
flyctl secrets set REDIS_HOST=accepted-wallaby-28584.upstash.io
```

```bash
flyctl secrets set REDIS_PORT=6379
```

```bash
flyctl secrets set REDIS_PASSWORD=AW-oAAIncDE4MmJlOWE0ZWFkOTQ0ZDQ0YmYxYjNkNDdkYzZkNzliMXAxMjg1ODQ
```
*(Replace with your actual Upstash password - extract from your Redis URL)*

### AWS S3 Credentials:
```bash
flyctl secrets set AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
```
*(Replace with your actual AWS Access Key)*

```bash
flyctl secrets set AWS_SECRET_ACCESS_KEY=your-aws-secret-key
```
*(Replace with your actual AWS Secret Key)*

```bash
flyctl secrets set AWS_S3_BUCKET=genio-videos
```
*(Replace with your actual bucket name)*

```bash
flyctl secrets set AWS_REGION=us-east-1
```
*(Replace with your bucket's region if different)*

### Verify All Secrets Are Set:
```bash
flyctl secrets list
```

You should see all the variables listed.

---

## Step 6: Deploy the Worker

```bash
flyctl deploy
```

**This will take 10-15 minutes** because:
- Docker needs to build the image
- PyTorch is large (~2GB)
- WhisperX and dependencies need to be installed

**Watch the logs** - you'll see:
1. Building Docker image
2. Installing system dependencies (ffmpeg, git)
3. Installing Python packages (PyTorch, WhisperX)
4. Installing Node.js packages
5. Building TypeScript
6. Pushing to Fly.io
7. Deploying

**Be patient!** The build process is normal and takes time.

---

## Step 7: Verify Deployment

### Check Worker Status:
```bash
flyctl status
```

Should show:
- App: `genio-worker`
- Status: `running`
- Region: `iad` (or your chosen region)

### Check Worker Logs:
```bash
flyctl logs
```

You should see:
```
✅ Running in cloud/Docker environment - worker enabled
🔗 Worker connecting to Redis at accepted-wallaby-28584.upstash.io:6379
✅ Worker ready and listening for jobs on queue 'video-processing'
```

If you see connection errors, check your Redis credentials.

---

## Step 8: Test the Complete System

1. **Go to your Vercel app**: `https://your-app.vercel.app`
2. **Login/Register**
3. **Upload a test video**
4. **Monitor the process**:
   - Check Render logs (server should add job to queue)
   - Check Fly.io logs: `flyctl logs` (worker should process)
   - Check S3 bucket (subtitle file should appear)

---

## 🐛 Troubleshooting

### Problem: Build fails
**Solution**: 
- Make sure you're in the `worker/` directory
- Check that `Dockerfile` exists
- Try: `flyctl deploy --verbose` for more details

### Problem: Worker not connecting to Redis
**Solution**:
```bash
flyctl secrets list
```
Verify `REDIS_HOST` and `REDIS_PASSWORD` are correct.

### Problem: Worker not processing jobs
**Solution**:
- Check logs: `flyctl logs`
- Verify Redis connection in logs
- Make sure server is adding jobs to the queue

### Problem: "App not found"
**Solution**:
- Make sure you ran `flyctl launch` first
- Check you're in the correct directory

### Problem: Build timeout
**Solution**:
- Fly.io free tier should handle this fine
- If it times out, try again (sometimes network issues)

---

## 📊 Monitor Your Worker

### View Logs in Real-Time:
```bash
flyctl logs
```

### View Logs with Timestamps:
```bash
flyctl logs --timestamps
```

### View Specific Number of Lines:
```bash
flyctl logs -n 100
```

### Check Worker Status:
```bash
flyctl status
```

### View App Info:
```bash
flyctl info
```

---

## 💰 Cost

Fly.io free tier includes:
- ✅ 3 shared-cpu VMs
- ✅ 3GB persistent volume
- ✅ 160GB outbound data transfer
- ✅ Perfect for PoC!

---

## ✅ Success Checklist

- [ ] Fly CLI installed
- [ ] Logged in to Fly.io
- [ ] App created with `flyctl launch`
- [ ] All environment variables set
- [ ] Worker deployed successfully
- [ ] Logs show "Worker ready and listening"
- [ ] Test upload works end-to-end

---

## 🎉 You're Done!

Your complete stack is now deployed:
- ✅ **Client** (Vercel)
- ✅ **Server** (Render)
- ✅ **Worker** (Fly.io)

All for **FREE**! 🎊

---

## 🔄 Updating the Worker

If you make changes to the worker code:

1. **Commit and push** to GitHub
2. **Redeploy**:
   ```bash
   cd worker
   flyctl deploy
   ```

That's it! Fly.io will rebuild and redeploy automatically.
