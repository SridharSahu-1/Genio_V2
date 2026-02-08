# 🌐 Vercel Frontend + EC2 API Setup

Since your frontend is on Vercel (HTTPS), you need to set up HTTPS for your EC2 API endpoint.

## Option 1: Use Domain + Nginx + Let's Encrypt (Recommended - Free)

### Step 1: Get a Domain (if you don't have one)
- Use Route53, Namecheap, or any domain registrar
- Point your domain to EC2 IP: `3.84.220.241`

### Step 2: Install Nginx and Certbot on EC2

```bash
# SSH to EC2
./connect-ec2.sh

# Install Nginx
sudo yum install -y nginx

# Install Certbot
sudo yum install -y certbot python3-certbot-nginx

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Step 3: Configure Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/conf.d/genio.conf
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Step 4: Get SSL Certificate

```bash
# Test nginx config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Follow prompts - certbot will automatically configure SSL
```

### Step 5: Update Security Group

Add inbound rules:
- **Port 80** (HTTP) - Source: `0.0.0.0/0`
- **Port 443** (HTTPS) - Source: `0.0.0.0/0`

### Step 6: Update Vercel Environment Variable

In Vercel Dashboard:
1. Go to your project → Settings → Environment Variables
2. Add:
   - **Name**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://your-domain.com`
3. Redeploy your frontend

### Step 7: Update Server CORS

```bash
# SSH to EC2
./connect-ec2.sh
cd ~/Genio_V2

# Edit .env.production
nano .env.production

# Update CORS_ORIGINS:
CORS_ORIGINS=https://your-vercel-app.vercel.app,https://your-domain.com

# Restart server
docker-compose -f docker-compose.prod.yml restart server
```

---

## Option 2: Use AWS Application Load Balancer (ALB) + ACM

### Step 1: Create Application Load Balancer

1. Go to EC2 → Load Balancers → Create Load Balancer
2. Choose **Application Load Balancer**
3. Configure:
   - **Name**: `genio-alb`
   - **Scheme**: Internet-facing
   - **IP address type**: IPv4
   - **VPC**: Your EC2's VPC
   - **Availability Zones**: Select your EC2's AZs
   - **Security Group**: Create new or use existing (allow 80, 443)

### Step 2: Create Target Group

1. Go to Target Groups → Create
2. Configure:
   - **Target type**: Instances
   - **Protocol**: HTTP
   - **Port**: 5001
   - **VPC**: Your EC2's VPC
3. Register your EC2 instance
4. Health check path: `/health`

### Step 3: Configure ALB Listener

1. In ALB → Listeners → Add listener
2. **Protocol**: HTTPS
3. **Port**: 443
4. **Default SSL certificate**: Request or import from ACM
5. **Default action**: Forward to your target group

### Step 4: Get SSL Certificate from ACM

1. Go to Certificate Manager → Request certificate
2. Choose **Public certificate**
3. Add domain name (e.g., `api.yourdomain.com`)
4. Validation: DNS or Email
5. Once validated, use it in ALB

### Step 5: Update DNS

Point your domain to ALB's DNS name.

### Step 6: Update Vercel

Set `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`

---

## Option 3: Quick Solution - Use EC2 IP with CloudFlare (Free SSL)

### Step 1: Add Domain to CloudFlare

1. Sign up at [Cloudflare](https://cloudflare.com)
2. Add your domain
3. Update nameservers at your domain registrar

### Step 2: Create A Record

1. In Cloudflare DNS:
   - **Type**: A
   - **Name**: `api` (or `@` for root)
   - **IPv4**: `3.84.220.241`
   - **Proxy**: ON (orange cloud) - This enables Cloudflare SSL

### Step 3: Configure SSL

1. Go to SSL/TLS → Overview
2. Set to **Full** or **Full (strict)**
3. Enable **Always Use HTTPS**

### Step 4: Setup Nginx on EC2

```bash
# Install Nginx
sudo yum install -y nginx

# Configure
sudo nano /etc/nginx/conf.d/genio.conf
```

Add:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Step 5: Update Vercel

Set `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`

---

## Quick Setup Script (Option 1 - Nginx + Let's Encrypt)

I'll create a script to automate this:

```bash
./setup-nginx-ssl.sh your-domain.com
```

---

## Update Vercel Environment Variable

**Important:** After setting up HTTPS:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add/Update:
   - **Name**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://your-api-domain.com`
   - **Environment**: Production, Preview, Development
5. **Redeploy** your application

---

## Update Server CORS

After getting your HTTPS endpoint:

```bash
# SSH to EC2
./connect-ec2.sh
cd ~/Genio_V2

# Edit .env.production
nano .env.production

# Update CORS_ORIGINS (add your Vercel domain):
CORS_ORIGINS=https://your-vercel-app.vercel.app,https://your-custom-domain.com,https://api.yourdomain.com

# Restart server
docker-compose -f docker-compose.prod.yml restart server
```

---

## Test Your Setup

```bash
# Test HTTPS endpoint
curl https://your-api-domain.com/health

# Should return:
# {
#   "status": "ok",
#   ...
# }
```

---

## Recommended: Option 1 (Nginx + Let's Encrypt)

**Pros:**
- ✅ Free SSL certificate
- ✅ Automatic renewal
- ✅ Full control
- ✅ Works with any domain

**Cons:**
- ❌ Requires domain name
- ❌ Manual setup

---

**Which option do you want to use?** I can help you set it up!
