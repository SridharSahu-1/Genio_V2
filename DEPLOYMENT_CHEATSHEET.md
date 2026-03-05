## Purpose

Quick reference for **what script to run when**, how to **deploy changes**, how to **update env vars after deployment**, and how to **get your Cloudflare tunnel / HTTPS API URL**.

---

## 1. Local development

- **Start backend (server + worker)** from repo root:

  ```bash
  npm install        # first time only (root dev deps like concurrently)
  cd server && npm install
  cd ../worker && npm install
  cd ..
  npm run dev        # runs server + worker
  ```

- **Start frontend** in a second terminal:

  ```bash
  cd client
  npm install        # first time only
  npm run dev        # Next.js dev server on http://localhost:3000
  ```

Use this when you’re actively coding and testing locally (no AWS involvement).

---

## 2. When you change backend code (server or worker)

**Goal:** Deploy new backend code to EC2 without touching the client.

- **Script to run (from repo root on your laptop):**

  ```bash
  ./deploy-to-ec2.sh [path-to-key.pem]
  ```

  - Uploads updated **server** and **worker** code to EC2.
  - Builds Docker images on EC2.
  - Restarts server, worker, and Redis with the existing `.env.production`.
  - Shows container status and basic logs.

- **When to use:** Any time you change:
  - `server/**`
  - `worker/**`
  - Shared backend logic that lives outside the client.

- **You do *not* need to:**
  - Redeploy the client (as long as `NEXT_PUBLIC_API_URL` is a stable URL).
  - Change the API URL in Vercel each time.

> If you only changed backend code, **only** run `./deploy-to-ec2.sh`.

---

## 3. When environment variables change (backend)

You have two options depending on whether you want to edit envs **locally then push** or **directly on EC2**.

### 3.1 Update envs locally then deploy

1. In your local repo root, create or update `.env.production` with the correct values:

   ```env
   NODE_ENV=production
   PORT=5001
   MONGO_URI=...
   JWT_SECRET=...
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_S3_BUCKET=...
   AWS_REGION=us-east-1
   CORS_ORIGINS=https://your-app.vercel.app,https://your-api-url.example.com
   HF_TOKEN=...
   REDIS_* = ...
   ```

2. Run:

   ```bash
   ./deploy-to-ec2.sh [path-to-key.pem]
   ```

   - The script will **upload your local `.env.production` to `~/Genio_V2/.env.production` on EC2** (see step 2.5 in the script) and restart the stack with the new env values.

Use this when you are comfortable editing envs locally and want them source-controlled (or at least reproducible).

### 3.2 Update envs directly on EC2

1. SSH into EC2:

   ```bash
   ./connect-ec2.sh
   cd ~/Genio_V2
   nano .env.production
   ```

2. Edit the variables you need (e.g. new AWS keys, Mongo URI, CORS origins).

3. Restart containers so they pick up the new env:

   ```bash
   docker-compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production up -d
   ```

Use this when you need a **quick hotfix to envs** without a full re‑deploy.

---

## 4. When you change frontend code

Frontend runs on Vercel (or similar). Backend API URL is baked in via `NEXT_PUBLIC_API_URL`.

### 4.1 For code changes only (API URL stays the same)

1. Commit and push your changes to the Git repo.
2. Let Vercel automatically build & deploy, or trigger from the Vercel dashboard.

No backend scripts needed if your API URL didn’t change.

### 4.2 When the API base URL changes (one‑time or rare)

- In Vercel project settings, update:

  ```env
  NEXT_PUBLIC_API_URL=https://your-stable-api-url.example.com
  ```

- Redeploy the client once.

After you have a **stable backend URL** (CloudFront, API Gateway, named Cloudflare Tunnel), you should almost never need to change this again.

---

## 5. Getting your HTTPS / Cloudflare tunnel URL

You have two patterns:

- **Quick tunnel (temporary, testing only).**
- **Named tunnel / stable URL (recommended for production).**

### 5.1 Quick Cloudflare tunnel (temporary)

From your **local machine** in the repo root:

```bash
./quick-tunnel.sh [path/to/key.pem]
```

- This:
  - Ensures `cloudflared` is installed on EC2.
  - Starts a tunnel like:

    ```text
    https://xxxxx-xxxxx-xxxxx.trycloudflare.com
    ```

- **Limitations:**
  - URL changes every time you run it.
  - Tunnel dies when the process stops.
  - Good for testing, **not** for production or stable `NEXT_PUBLIC_API_URL`.

### 5.2 Named Cloudflare tunnel (stable URL, with or without your own domain)

> Summary of `CLOUDFLARE_TUNNEL_GUIDE.md` and `GET_HTTPS_ENDPOINT.md`.

Run these once to set up a **permanent tunnel service on EC2**:

1. **SSH into EC2:**

   ```bash
   ./connect-ec2.sh
   ```

2. **Install and log in cloudflared (if not already):**

   ```bash
   cd /tmp
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
   sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
   sudo chmod +x /usr/local/bin/cloudflared

   cloudflared tunnel login
   ```

   - Follow the browser link and authorize with your Cloudflare account.

3. **Create a named tunnel:**

   ```bash
   cloudflared tunnel create genio-api
   ```

   - Save the printed **tunnel ID** and credentials JSON path.

4. **Create tunnel config (`/etc/cloudflared/config.yml`):**

   ```bash
   sudo mkdir -p /etc/cloudflared
   sudo nano /etc/cloudflared/config.yml
   ```

   Example for a stable `trycloudflare.com` hostname:

   ```yaml
   tunnel: YOUR_TUNNEL_ID
   credentials-file: /home/ec2-user/.cloudflared/YOUR_TUNNEL_ID.json

   ingress:
     - hostname: genio-api-abc123.trycloudflare.com
       service: http://localhost:5001
     - service: http_status:404
   ```

   - The `hostname` value here is the **stable tunnel URL**:

     ```text
     https://genio-api-abc123.trycloudflare.com
     ```

5. **Run tunnel as a systemd service:**

   ```bash
   sudo cloudflared service install
   sudo systemctl start cloudflared
   sudo systemctl enable cloudflared
   sudo systemctl status cloudflared
   ```

6. **How to “get to know” your tunnel URL later:**

   - SSH into EC2 and check the config:

     ```bash
     ./connect-ec2.sh
     sudo cat /etc/cloudflared/config.yml
     ```

     - The `hostname:` line is your API URL (e.g. `genio-api-abc123.trycloudflare.com`).

   - Or check Cloudflare dashboard → Tunnels / DNS entries.

7. **Use this URL in Vercel and CORS:**

   - Vercel env:

     ```env
     NEXT_PUBLIC_API_URL=https://genio-api-abc123.trycloudflare.com
     ```

   - On EC2, in `~/Genio_V2/.env.production`:

     ```env
     CORS_ORIGINS=https://your-app.vercel.app,https://genio-api-abc123.trycloudflare.com
     ```

   - Restart backend:

     ```bash
     cd ~/Genio_V2
     docker-compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production up -d
     ```

Once this is set, **your tunnel URL is stable**. You only need `./deploy-to-ec2.sh` for future backend changes.

---

## 6. Quick decision table

- **“I changed backend code (server/worker)”**  
  → Run `./deploy-to-ec2.sh`. Nothing else.

- **“I changed backend env vars”**  
  → Either:
  - Update local `.env.production` → run `./deploy-to-ec2.sh`, **or**
  - SSH, edit `~/Genio_V2/.env.production`, then restart with Docker Compose.

- **“I changed frontend only”**  
  → Commit & push → let Vercel deploy (no EC2 script needed).

- **“I need a one‑off HTTPS URL for testing”**  
  → Run `./quick-tunnel.sh [key.pem]` and copy the printed `https://...trycloudflare.com`.

- **“I want a permanent HTTPS URL for production”**  
  → Set up a named tunnel (or CloudFront / API Gateway) once, use that URL in `NEXT_PUBLIC_API_URL` and `CORS_ORIGINS`, then only use `./deploy-to-ec2.sh` for backend updates.

