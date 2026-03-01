# Genio V2 – Deployment Guide

Single guide for deploying **server** and **worker** on EC2 and exposing a **stable API URL** so you **do not need to redeploy the client** when you push backend changes.

---

## Architecture

| Component | Where it runs | Purpose |
|-----------|----------------|---------|
| **Client** | Vercel | Next.js frontend; calls `NEXT_PUBLIC_API_URL` (set once) |
| **Server** | EC2 (Docker) | Fastify API on port 5001 |
| **Worker** | EC2 (Docker) | Video processing (BullMQ + WhisperX) |
| **Stable URL** | CloudFront / API Gateway / or Cloudflare Tunnel | Stable HTTPS URL so the client never needs redeploy for backend-only changes |

The client is built with one API URL. If that URL never changes, you only redeploy the client when you change frontend code. Backend deploys are done with `./deploy-to-ec2.sh` and do **not** require a client redeploy.

---

## Why the endpoint was changing

- **Quick tunnel** (`cloudflared tunnel --url http://localhost:5001`) gives a **new random URL every time** it starts.
- So after each deploy or tunnel restart you got a new URL → you had to update Vercel’s `NEXT_PUBLIC_API_URL` and redeploy the client.

**Fix:** Use a **stable URL** that never changes:

- **No domain:** Use **AWS CloudFront** (or API Gateway) in front of EC2 → stable `https://xxxxx.cloudfront.net` or `https://xxx.execute-api.region.amazonaws.com`. No domain or Route53 needed. See **Option A** and **Option B** below.
- **Have a domain:** Use a **named Cloudflare Tunnel** with that domain (see **Option C**).

---

## Option A: Stable URL without a domain (AWS CloudFront)

You get a **stable HTTPS URL** like `https://d1234abcd.cloudfront.net`. No domain, no Route53. Set it once in Vercel and never change it.

### Prerequisites

- AWS CLI with profile `genio` (or your profile).
- EC2 instance running server on port 5001.

### Step 1: Give EC2 a fixed IP (Elastic IP)

When the instance is stopped/started, its public IP can change. Allocate an **Elastic IP** and attach it so the origin stays the same.

```bash
aws ec2 allocate-address --domain vpc --region us-east-1 --profile genio
# Note AllocationId and PublicIp

aws ec2 associate-address \
  --instance-id i-0b09cd0fe805d6fe6 \
  --allocation-id eipalloc-xxxxxxxxx \
  --region us-east-1 \
  --profile genio
```

Replace `eipalloc-xxxxxxxxx` with your AllocationId. Update `connect-ec2.sh` and `deploy-to-ec2.sh` if you use the old IP — use the new Elastic IP (or keep using the instance; after association the public IP shown is the Elastic IP).

### Step 2: Security group

EC2 must accept traffic on port 5001. In the **EC2 Security Group** for your instance add an **inbound rule**: Type = Custom TCP, Port = 5001, Source = `0.0.0.0/0`.

### Step 3: Create CloudFront distribution (Console)

1. **AWS Console** → **CloudFront** → **Create distribution**.

2. **Origin:**
   - **Origin domain:** Your EC2 **Public IPv4 DNS** (e.g. `ec2-3-84-220-241.compute-1.amazonaws.com`) — from EC2 → instance → “Public IPv4 DNS”. Do **not** use the raw IP in the console; use this hostname.
   - **Protocol:** HTTP only.
   - **Port:** 5001. (If the console does not allow a custom port, use **Origin request policy** or create the distribution via CLI below.)

3. **Default cache behavior:**
   - **Viewer protocol policy:** Redirect HTTP to HTTPS.
   - **Allowed HTTP methods:** GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE.
   - **Cache policy:** CachingDisabled (so every request hits EC2).

4. Create. Copy the **Distribution domain name** (e.g. `d1234abcd.cloudfront.net`). Your stable API URL is `https://d1234abcd.cloudfront.net`.

**Using AWS CLI** (custom port 5001): replace `EC2_PUBLIC_DNS` with your instance’s “Public IPv4 DNS” (e.g. `ec2-3-84-220-241.compute-1.amazonaws.com`).

```bash
aws cloudfront create-distribution --profile genio --distribution-config '{
  "CallerReference": "genio-api-'$(date +%s)'",
  "Comment": "Genio API",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "GenioEC2",
      "DomainName": "EC2_PUBLIC_DNS",
      "CustomOriginConfig": {
        "HTTPPort": 5001,
        "HTTPSPort": 443,
        "OriginProtocolPolicy": "http-only"
      }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "GenioEC2",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 7,
      "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
    },
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  },
  "DefaultRootObject": "",
  "PriceClass": "PriceClass_All"
}'
```

`4135ea2d-6df8-44a3-9df3-4b5a84be39ad` is the built-in **CachingDisabled** policy. Replace `EC2_PUBLIC_DNS` in the JSON with your actual EC2 public DNS hostname (one line, no extra spaces).

### Step 4: Vercel and CORS

1. **Vercel** → Project → **Settings** → **Environment Variables** → set `NEXT_PUBLIC_API_URL` = `https://d1234abcd.cloudfront.net` (your CloudFront domain). Redeploy the client once.
2. On EC2, in `~/Genio_V2/.env.production` set:
   ```env
   CORS_ORIGINS=https://your-app.vercel.app,https://d1234abcd.cloudfront.net
   ```
   Then: `docker-compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production up -d`

After this, only run `./deploy-to-ec2.sh` for server/worker changes; no client redeploy, no domain.

---

## Option B: Stable URL with API Gateway (no domain)

You get a URL like `https://abc123.execute-api.us-east-1.amazonaws.com` (stable, HTTPS, no domain).

1. **API Gateway** → Create **HTTP API**.
2. **Integrations** → Create integration: Type = **HTTP**, URL = `http://YOUR_EC2_ELASTIC_IP:5001` (use Elastic IP from Option A Step 1).
3. **Routes** → Create route: Method = `ANY`, Path = `/{proxy+}`, Integration = that HTTP integration (enable proxy so path/headers are forwarded).
4. **Stages** → copy the **Invoke URL**.
5. Set that as `NEXT_PUBLIC_API_URL` in Vercel; in server `CORS_ORIGINS` include your Vercel URL and this API Gateway URL.

EC2 Security Group must allow port 5001 from the internet (same as Option A).

---

## Option C: Stable URL with a domain (Cloudflare named tunnel)

Do this only if you have (or want to use) a domain. One-time setup; URL stays the same.

### 1. Domain in Cloudflare

- Add a domain to Cloudflare (free plan is enough).  
- If you don’t have a domain, use any cheap/free one (e.g. a free subdomain or a low-cost registrar).

### 2. Install and log in Cloudflare Tunnel on EC2

```bash
./connect-ec2.sh
# On EC2:
cd /tmp
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared
cloudflared tunnel login
```

Complete the browser login and authorize the tunnel.

### 3. Create a named tunnel

```bash
cloudflared tunnel create genio-api
```

Save the **tunnel ID** from the output (e.g. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

### 4. Configure DNS in Cloudflare

Create a **CNAME** in the Cloudflare dashboard:

- **Name:** `api` (or any subdomain you want, e.g. `genio-api`)
- **Target:** `<TUNNEL_ID>.cfargotunnel.com`
- **Proxy:** Proxied (orange cloud)

Your API URL will be: `https://api.yourdomain.com` (or `https://genio-api.yourdomain.com`).

### 5. Tunnel config on EC2

```bash
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

Use (replace `TUNNEL_ID` and the path to the credentials file if different):

```yaml
tunnel: TUNNEL_ID
credentials-file: /home/ec2-user/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:5001
  - service: http_status:404
```

Save and exit.

### 6. Install and run tunnel as a service

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
sudo systemctl status cloudflared
```

Your stable API URL is now **https://api.yourdomain.com** (or whatever hostname you used).

### 7. Set the URL in Vercel (once)

1. Vercel → Project → **Settings** → **Environment Variables**
2. Add or update:
   - **Name:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://api.yourdomain.com` (your stable URL)
   - **Environments:** Production (and Preview/Development if you want)
3. Save. Redeploy the client **once** so the new URL is baked in.

You will **not** need to change this again when you only deploy server/worker.

### 8. CORS on the server

On EC2, in `~/Genio_V2`:

```bash
nano .env.production
```

Set (use your real Vercel URL and API URL):

```env
CORS_ORIGINS=https://your-app.vercel.app,https://api.yourdomain.com
```

Restart so the server picks up env:

```bash
docker-compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production up -d
```

---

## Routine deploys (server + worker only)

When you change **server** or **worker** code:

1. From the project root on your machine:
   ```bash
   ./deploy-to-ec2.sh
   ```
2. Optionally upload an updated `.env.production`: put it in the project root before running the script; it will be copied to EC2 and used by the stack.

You do **not** need to:

- Change `NEXT_PUBLIC_API_URL` in Vercel
- Redeploy the client

Your stable URL (CloudFront, API Gateway, or Cloudflare Tunnel) keeps pointing at EC2; only server/worker are updated.

---

## Useful commands

| Task | Command |
|------|--------|
| SSH to EC2 | `./connect-ec2.sh` |
| Deploy server + worker | `./deploy-to-ec2.sh` |
| Restart server/worker on EC2 | `cd ~/Genio_V2 && docker-compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production up -d` |
| Tunnel status on EC2 (Option C only) | `sudo systemctl status cloudflared` |
| Server logs on EC2 | `docker-compose -f docker-compose.prod.yml logs -f server` |
| Worker logs on EC2 | `docker-compose -f docker-compose.prod.yml logs -f worker` |
| Health check | `curl https://YOUR-STABLE-URL/health` (CloudFront, API Gateway, or api.yourdomain.com) |
| Update only AWS creds on EC2 | `./update-env-aws-credentials.sh <ACCESS_KEY> <SECRET_KEY> [key.pem]` |

---

## Temporary / testing only: quick tunnel

For a **one-off** HTTPS URL (e.g. testing), from your **local** machine:

```bash
./quick-tunnel.sh [path/to/key.pem]
```

This starts a **quick** tunnel on EC2; the URL is **temporary** and will change the next time you run it. Do **not** use this for production. Use **Option A (CloudFront)** or **Option B (API Gateway)** if you don’t have a domain, or **Option C (Cloudflare Tunnel)** if you have one.
