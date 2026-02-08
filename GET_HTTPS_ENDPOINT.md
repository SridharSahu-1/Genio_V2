# ⚡ Get HTTPS Endpoint for Vercel - Quick Guide

## Fastest Method: Cloudflare Tunnel (5 minutes)

### Step 1: SSH to EC2

```bash
./connect-ec2.sh
```

### Step 2: Install Cloudflare Tunnel

```bash
# Download and install
cd /tmp
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

# Verify
cloudflared --version
```

### Step 3: Run Quick Tunnel (Temporary - For Testing)

```bash
# This gives you an HTTPS URL immediately (no login needed for quick tunnels)
cloudflared tunnel --url http://localhost:5001
```

**You'll see output like:**
```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it:                                            |
|  https://xxxxx-xxxxx-xxxxx.trycloudflare.com                                              |
+--------------------------------------------------------------------------------------------+
```

**Copy that URL!** That's your HTTPS endpoint.

### Step 4: Add to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add:
   - **Name**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://xxxxx-xxxxx-xxxxx.trycloudflare.com` (the URL from step 3)
   - **Environment**: Production, Preview, Development
5. Click **Save**
6. **Redeploy** your application

### Step 5: Update Server CORS

```bash
# Still on EC2
cd ~/Genio_V2
nano .env.production

# Update CORS_ORIGINS (add your Vercel domain):
CORS_ORIGINS=https://your-vercel-app.vercel.app,https://xxxxx-xxxxx-xxxxx.trycloudflare.com

# Restart server
docker-compose -f docker-compose.prod.yml restart server
```

---

## Permanent Solution (Recommended)

The quick tunnel above is temporary. For a permanent solution:

### Step 1: Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

Follow the prompts - it will open a browser or give you a URL to visit.

### Step 2: Create Named Tunnel

```bash
cloudflared tunnel create genio-api
```

Save the tunnel ID that's displayed.

### Step 3: Create Config

```bash
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

Paste (replace `TUNNEL_ID` with your actual ID):
```yaml
tunnel: TUNNEL_ID
credentials-file: /home/ec2-user/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: genio-api-abc123.trycloudflare.com
    service: http://localhost:5001
  - service: http_status:404
```

### Step 4: Install as Service

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# Check status
sudo systemctl status cloudflared
```

### Step 5: Get Your URL

The tunnel will show your URL. Use it in Vercel.

---

## Your Vercel Environment Variable

**Name:** `NEXT_PUBLIC_API_URL`  
**Value:** `https://xxxxx-xxxxx-xxxxx.trycloudflare.com`

---

## Test Your Endpoint

```bash
# From your local machine
curl https://xxxxx-xxxxx-xxxxx.trycloudflare.com/health
```

Should return JSON with status "ok".

---

**That's it! Your Vercel app can now connect to your EC2 API via HTTPS!** 🎉
