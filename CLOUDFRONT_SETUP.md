# How to implement CloudFront for Genio API

Follow these steps in order. After this, you’ll have a **stable HTTPS URL** (e.g. `https://d1234abcd.cloudfront.net`) and won’t need to redeploy the client when you change the backend.

---

## 1. Elastic IP (so EC2 address doesn’t change)

If your EC2 instance is stopped/started, the public IP can change and CloudFront would point at the wrong place. Attach an Elastic IP:

```bash
# Allocate
aws ec2 allocate-address --domain vpc --region us-east-1 --profile genio
# Copy AllocationId (e.g. eipalloc-0abc123...) and optionally PublicIp

# Attach to your instance (use your AllocationId)
aws ec2 associate-address \
  --instance-id i-0b09cd0fe805d6fe6 \
  --allocation-id eipalloc-XXXXXXXXX \
  --region us-east-1 \
  --profile genio
```

If you had scripts using the old public IP, the instance’s **new** public IP is now this Elastic IP (check in EC2 console). Update `connect-ec2.sh` / `deploy-to-ec2.sh` if the IP is hardcoded there.

---

## 2. Security group: allow port 5001

CloudFront (and health checks) must reach your server:

- **EC2** → your instance → **Security** tab → Security group → **Edit inbound rules**
- **Add rule:** Type = **Custom TCP**, Port = **5001**, Source = **0.0.0.0/0**, Save

---

## 3. Server running on EC2

Make sure the API is up on EC2 on port 5001:

```bash
./deploy-to-ec2.sh
```

Then from your machine (use the current EC2 public IP or Elastic IP):

```bash
curl http://YOUR_EC2_IP:5001/health
```

You should get JSON with `"status": "ok"`.

---

## 4. Create CloudFront distribution

From the project root:

```bash
chmod +x setup-cloudfront.sh
./setup-cloudfront.sh
```

The script will use your instance ID to resolve the EC2 public DNS and create a distribution with origin port **5001** and **CachingDisabled**. It will print your **CloudFront URL** (e.g. `https://d1234abcd.cloudfront.net`).

If the script can’t resolve the DNS, pass it explicitly:

```bash
./setup-cloudfront.sh ec2-3-84-220-241.compute-1.amazonaws.com
```

(Get “Public IPv4 DNS” from EC2 → instance → Details.)

Distribution can take **2–5 minutes** to become active. Then:

```bash
curl https://YOUR-CLOUDFRONT-URL/health
```

---

## 5. Vercel: set API URL once

1. **Vercel** → your project → **Settings** → **Environment Variables**
2. Add or edit:
   - **Name:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://d1234abcd.cloudfront.net` (the URL from step 4)
   - **Environments:** Production (and others if you want)
3. **Save** → **Redeploy** the client once so the new URL is baked in.

---

## 6. CORS on the server (EC2)

So the browser allows requests from your Vercel app to the CloudFront URL:

```bash
./connect-ec2.sh
```

On EC2:

```bash
cd ~/Genio_V2
nano .env.production
```

Set (use your real Vercel URL and CloudFront URL):

```env
CORS_ORIGINS=https://your-app.vercel.app,https://d1234abcd.cloudfront.net
```

Restart so the server picks it up:

```bash
docker-compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production up -d
```

---

## Done

- **Stable API URL:** `https://d1234abcd.cloudfront.net` (yours from step 4)
- **Client:** Uses that URL via `NEXT_PUBLIC_API_URL`; no need to change it when you only change server/worker.
- **Routine deploys:** Run `./deploy-to-ec2.sh` when you push backend changes. No client redeploy needed.

For more detail (e.g. doing it manually in the console), see **DEPLOYMENT.md** → Option A.
