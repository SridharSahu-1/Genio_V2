# ☁️ Cloudflare Tunnel - Complete Setup Guide

## What is Cloudflare Tunnel?

Cloudflare Tunnel provides a **free HTTPS endpoint** without needing:
- ❌ A domain name
- ❌ DNS configuration
- ❌ SSL certificates
- ❌ Port forwarding

Perfect for connecting your Vercel frontend to EC2 API!

---

## Step-by-Step Setup

### Step 1: Install Cloudflare Tunnel

```bash
# SSH to EC2
./connect-ec2.sh

# Download and install cloudflared
cd /tmp
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

# Verify
cloudflared --version
```

### Step 2: Authenticate with Cloudflare

```bash
# This will open a browser or give you a URL
cloudflared tunnel login
```

**What happens:**
1. You'll get a URL like: `https://one.dash.cloudflare.com/...`
2. Open it in your browser
3. Sign in to Cloudflare (free account)
4. Authorize the tunnel
5. Done!

### Step 3: Create a Tunnel

```bash
# Create tunnel named "genio-api"
cloudflared tunnel create genio-api
```

**Output will show:**
```
Created tunnel genio-api with id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Save this tunnel ID!**

### Step 4: Create Config File

```bash
# Create config directory
sudo mkdir -p /etc/cloudflared

# Create config file
sudo nano /etc/cloudflared/config.yml
```

**Paste this (replace TUNNEL_ID with your actual ID):**

```yaml
tunnel: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
credentials-file: /home/ec2-user/.cloudflared/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json

ingress:
  - hostname: genio-api-$(openssl rand -hex 4).trycloudflare.com
    service: http://localhost:5001
  - service: http_status:404
```

**Or use a fixed hostname (better for production):**

```yaml
tunnel: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
credentials-file: /home/ec2-user/.cloudflared/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json

ingress:
  - hostname: genio-api-abc123.trycloudflare.com
    service: http://localhost:5001
  - service: http_status:404
```

### Step 5: Run the Tunnel

**Option A: Test Run (temporary)**
```bash
sudo cloudflared tunnel --config /etc/cloudflared/config.yml run
```

You'll see output like:
```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it:                                            |
|  https://genio-api-xxxxx.trycloudflare.com                                                |
+--------------------------------------------------------------------------------------------+
```

**Option B: Install as Service (permanent)**
```bash
# Install as systemd service
sudo cloudflared service install

# Start the service
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# Check status
sudo systemctl status cloudflared

# View logs
sudo journalctl -u cloudflared -f
```

### Step 6: Get Your HTTPS URL

The tunnel will display your URL. It will be something like:
```
https://genio-api-xxxxx.trycloudflare.com
```

**This is your API endpoint!**

---

## Update Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add/Update:
   - **Name**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://genio-api-xxxxx.trycloudflare.com`
   - **Environment**: Production, Preview, Development
5. **Redeploy** your application

---

## Update Server CORS

```bash
# SSH to EC2
./connect-ec2.sh
cd ~/Genio_V2

# Edit .env.production
nano .env.production

# Update CORS_ORIGINS:
CORS_ORIGINS=https://your-vercel-app.vercel.app,https://genio-api-xxxxx.trycloudflare.com

# Restart server
docker-compose -f docker-compose.prod.yml restart server
```

---

## Test Your Setup

```bash
# Test the tunnel endpoint
curl https://genio-api-xxxxx.trycloudflare.com/health

# Should return:
# {
#   "status": "ok",
#   ...
# }
```

---

## Troubleshooting

### Tunnel Not Starting

```bash
# Check logs
sudo journalctl -u cloudflared -f

# Check config
sudo cloudflared tunnel --config /etc/cloudflared/config.yml --loglevel debug run
```

### Connection Refused

Make sure your server is running:
```bash
docker-compose -f docker-compose.prod.yml ps
```

### CORS Errors

Make sure you've updated `CORS_ORIGINS` in `.env.production` and restarted the server.

---

## Benefits

- ✅ **Free** - No cost
- ✅ **HTTPS** - Secure connection
- ✅ **No Domain** - Works without a domain
- ✅ **Stable** - URL doesn't change (if you use fixed hostname)
- ✅ **Production Ready** - Used by many companies
- ✅ **Easy Setup** - Just a few commands

---

## Your API Endpoint

After setup, your API will be available at:
```
https://genio-api-xxxxx.trycloudflare.com
```

Use this in your Vercel environment variable!

---

**That's it! Your Vercel frontend can now connect to your EC2 API via HTTPS!** 🎉
