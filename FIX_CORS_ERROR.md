# 🔧 Fix CORS Error for Vercel Frontend

## Problem
Getting CORS error when frontend at `https://genio-v2.vercel.app` tries to access API at `https://hong-armed-ali-boss.trycloudflare.com`

## Solution

I've updated the server code to handle `*` as a wildcard in CORS_ORIGINS. Now you need to update the server's environment variable.

### Option 1: Allow All Origins (Quick Fix)

1. **SSH to your EC2 server:**
   ```bash
   ./connect-ec2.sh
   ```

2. **Update the .env.production file:**
   ```bash
   cd ~/Genio_V2
   nano .env.production
   ```

3. **Set CORS_ORIGINS to allow all (or add your Vercel domain):**
   ```bash
   CORS_ORIGINS=*
   ```
   
   OR add your Vercel domain:
   ```bash
   CORS_ORIGINS=https://genio-v2.vercel.app,https://genio-v2-git-*.vercel.app,*
   ```
   
   (The `*` at the end allows all origins, including preview deployments)

4. **Restart the server:**
   ```bash
   docker-compose -f docker-compose.prod.yml restart server
   ```

### Option 2: Add Specific Vercel Domains (More Secure)

1. **SSH to EC2:**
   ```bash
   ./connect-ec2.sh
   ```

2. **Update .env.production:**
   ```bash
   cd ~/Genio_V2
   nano .env.production
   ```

3. **Add your Vercel domains:**
   ```bash
   CORS_ORIGINS=https://genio-v2.vercel.app,https://genio-v2-git-*.vercel.app,https://genio-v2-*.vercel.app
   ```
   
   This allows:
   - Production: `https://genio-v2.vercel.app`
   - Preview deployments: `https://genio-v2-git-*-*.vercel.app`
   - Branch deployments: `https://genio-v2-*-*.vercel.app`

4. **Restart server:**
   ```bash
   docker-compose -f docker-compose.prod.yml restart server
   ```

### Option 3: Update via Deploy Script

If you want to update the deploy script to include Vercel domains by default:

1. **Edit `deploy-to-ec2.sh`** and update line 340:
   ```bash
   echo "CORS_ORIGINS=https://genio-v2.vercel.app,https://genio-v2-*.vercel.app,*"
   ```

2. **Redeploy** (this will update the .env.production file)

---

## Verify the Fix

After updating and restarting, test with:

```bash
curl -H "Origin: https://genio-v2.vercel.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://hong-armed-ali-boss.trycloudflare.com/api/auth/login -v
```

You should see `Access-Control-Allow-Origin: https://genio-v2.vercel.app` in the response headers.

---

## Quick One-Liner Fix

If you just want to quickly allow all origins:

```bash
./connect-ec2.sh
# Once connected:
cd ~/Genio_V2 && sed -i 's/CORS_ORIGINS=.*/CORS_ORIGINS=*/' .env.production && docker-compose -f docker-compose.prod.yml restart server
```

---

## Important Notes

1. **Code Update Required**: Make sure you've pushed the updated `server/src/app.ts` that handles `*` wildcard
2. **Restart Required**: After changing CORS_ORIGINS, you must restart the server
3. **Cloudflare Tunnel**: Your API URL `https://hong-armed-ali-boss.trycloudflare.com` is a temporary Cloudflare tunnel. Consider setting up a permanent domain for production.

---

**After fixing, your frontend should be able to make API requests without CORS errors!**
