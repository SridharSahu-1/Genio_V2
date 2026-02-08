# 🚀 Deploy CORS Fix to EC2

## Quick Deploy Steps

The code changes are committed locally. Now deploy to EC2:

### Step 1: Run the Deploy Script

```bash
./deploy-to-ec2.sh
```

This will:
1. Upload the updated `server/src/app.ts` to EC2
2. Rebuild the Docker containers with the new code
3. Restart the server with the updated CORS logic

### Step 2: Verify CORS_ORIGINS is Set

After deployment, SSH to EC2 and verify:

```bash
./connect-ec2.sh
# Once connected:
cd ~/Genio_V2
cat .env.production | grep CORS_ORIGINS
```

Make sure it shows:
```
CORS_ORIGINS=*
```

Or with your Vercel domain:
```
CORS_ORIGINS=https://genio-v2.vercel.app,*
```

### Step 3: Restart if Needed

If you need to manually restart after deployment:

```bash
./connect-ec2.sh
# Once connected:
cd ~/Genio_V2
docker-compose -f docker-compose.prod.yml restart server
```

### Step 4: Test from Frontend

After deployment, test your frontend - the CORS error should be resolved!

---

## What Changed

1. **Code Update**: `server/src/app.ts` now handles `*` as a wildcard in CORS_ORIGINS
2. **Environment Variable**: Make sure `CORS_ORIGINS=*` is set in `.env.production` on EC2

Both are needed for CORS to work properly!
