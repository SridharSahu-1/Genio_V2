# 🌐 Solutions Without a Domain

Since you don't have a domain, here are your options:

## Option 1: Cloudflare Tunnel (Recommended - Free, No Domain Needed!)

Cloudflare Tunnel provides a free HTTPS endpoint without needing a domain!

### Step 1: Install Cloudflare Tunnel on EC2

```bash
# SSH to EC2
./connect-ec2.sh

# Download cloudflared
cd /tmp
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

# Verify installation
cloudflared --version
```

### Step 2: Authenticate with Cloudflare

```bash
# Login (will open browser or give you a link)
cloudflared tunnel login
```

### Step 3: Create Tunnel

```bash
# Create a tunnel
cloudflared tunnel create genio-api

# This will give you a tunnel ID - save it!
```

### Step 4: Create Config File

```bash
# Create config directory
sudo mkdir -p /etc/cloudflared

# Create config
sudo nano /etc/cloudflared/config.yml
```

Add:
```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /home/ec2-user/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: genio-api-<random>.trycloudflare.com
    service: http://localhost:5001
  - service: http_status:404
```

### Step 5: Run Tunnel

```bash
# Run tunnel (for testing)
cloudflared tunnel --config /etc/cloudflared/config.yml run

# Or create a service (permanent)
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

### Step 6: Get Your HTTPS URL

The tunnel will give you a URL like:
```
https://genio-api-xxxxx.trycloudflare.com
```

### Step 7: Update Vercel

1. Go to Vercel Dashboard → Environment Variables
2. Set `NEXT_PUBLIC_API_URL` to your Cloudflare Tunnel URL
3. Redeploy

---

## Option 2: Get a Free Domain

### Option 2a: Freenom (Free .tk, .ml, .ga domains)

1. Go to [freenom.com](https://freenom.com)
2. Search for a free domain (e.g., `genio-api.tk`)
3. Register it (free for 1 year)
4. Point DNS to `3.84.220.241`
5. Use Cloudflare (free SSL) or Let's Encrypt

### Option 2b: GitHub Student Pack

If you're a student:
- Get free domain from Namecheap (via GitHub Student Pack)
- Or use other student benefits

### Option 2c: Use a Subdomain Service

Some services offer free subdomains:
- [No-IP](https://www.noip.com) - Free dynamic DNS
- [DuckDNS](https://www.duckdns.org) - Free subdomain

---

## Option 3: Use ngrok (Temporary - For Testing)

**Note:** This is for testing only. The URL changes each time.

```bash
# On EC2
./connect-ec2.sh

# Install ngrok
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar -xzf ngrok-v3-stable-linux-amd64.tgz
sudo mv ngrok /usr/local/bin/

# Sign up at ngrok.com and get your authtoken
ngrok config add-authtoken YOUR_TOKEN

# Run tunnel
ngrok http 5001
```

This gives you: `https://xxxxx.ngrok.io`

**Limitations:**
- URL changes on restart (unless paid plan)
- Not suitable for production

---

## Option 4: AWS Route53 (Paid but Reliable)

1. Go to Route53 → Hosted Zones
2. Create hosted zone for a domain you'll buy
3. Or use Route53 to create a subdomain on an existing domain

---

## ✅ Recommended: Cloudflare Tunnel (Option 1)

**Why:**
- ✅ Completely free
- ✅ No domain needed
- ✅ HTTPS included
- ✅ Stable URL (doesn't change)
- ✅ Works with Vercel
- ✅ Production-ready

**Your API endpoint will be:**
```
https://genio-api-xxxxx.trycloudflare.com
```

---

## Quick Setup Script for Cloudflare Tunnel

I'll create a script to automate this:

```bash
./setup-cloudflare-tunnel.sh
```

This will:
1. Install cloudflared
2. Guide you through authentication
3. Create tunnel
4. Set up as a service
5. Give you the HTTPS URL

---

## After Setup

1. **Update Vercel:**
   - Set `NEXT_PUBLIC_API_URL` to your Cloudflare Tunnel URL

2. **Update Server CORS:**
   ```bash
   # On EC2
   cd ~/Genio_V2
   nano .env.production
   
   # Add your Vercel domain and Cloudflare URL:
   CORS_ORIGINS=https://your-vercel-app.vercel.app,https://genio-api-xxxxx.trycloudflare.com
   
   # Restart
   docker-compose -f docker-compose.prod.yml restart server
   ```

---

**Which option do you want to use?** I recommend Cloudflare Tunnel - it's free and works perfectly!
