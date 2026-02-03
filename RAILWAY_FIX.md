# 🔧 Railway Build Timeout Fix

## Problem
Railway build is timing out during the "importing to docker" phase. This happens because:
1. The Docker image is very large (~2-3GB with PyTorch + WhisperX)
2. Railway's free tier has build time limits
3. The image import process is slow for large images

## Solutions

### Solution 1: Use Railway Build Settings (Try This First)

1. Go to Railway Dashboard → Your Service → Settings
2. Scroll to **Build Settings**
3. Increase **Build Timeout** if available (or check for any build limits)
4. Make sure **Root Directory** is set to `worker`
5. Redeploy

### Solution 2: Use Fly.io Instead (Recommended for Free Tier)

Fly.io handles large Docker images better and has more generous free tier limits.

**Quick Switch to Fly.io:**

1. Install Fly CLI:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. Login:
   ```bash
   flyctl auth login
   ```

3. Deploy from worker directory:
   ```bash
   cd worker
   flyctl launch
   ```
   - When prompted, use existing `fly.toml` (already configured)
   - Don't deploy now, just create the app

4. Set environment variables:
   ```bash
   flyctl secrets set REDIS_HOST=accepted-wallaby-28584.upstash.io
   flyctl secrets set REDIS_PORT=6379
   flyctl secrets set REDIS_PASSWORD=YOUR_PASSWORD
   flyctl secrets set AWS_ACCESS_KEY_ID=your-key
   flyctl secrets set AWS_SECRET_ACCESS_KEY=your-secret
   flyctl secrets set AWS_S3_BUCKET=your-bucket
   flyctl secrets set AWS_REGION=us-east-1
   flyctl secrets set NODE_ENV=production
   ```

5. Deploy:
   ```bash
   flyctl deploy
   ```

### Solution 3: Optimize Dockerfile Further

If you want to stick with Railway, try the optimized Dockerfile:

1. Rename current Dockerfile:
   ```bash
   cd worker
   mv Dockerfile Dockerfile.original
   mv Dockerfile.optimized Dockerfile
   ```

2. Commit and push to trigger rebuild

### Solution 4: Use Railway Pro (If Budget Allows)

Railway Pro ($20/month) has:
- Longer build timeouts
- Better build performance
- More resources

But for PoC, Fly.io free tier is better.

## Recommended: Switch to Fly.io

Fly.io is better suited for this use case because:
- ✅ Handles large Docker images well
- ✅ Free tier is generous (3 shared-cpu VMs)
- ✅ No build timeout issues
- ✅ Better for CPU-intensive workloads

The `fly.toml` is already configured in the root directory.
