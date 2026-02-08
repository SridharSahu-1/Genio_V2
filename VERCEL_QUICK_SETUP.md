# ⚡ Quick Setup for Vercel Frontend

Since Vercel uses HTTPS, you need an HTTPS endpoint for your API. Here are the **fastest options**:

## 🚀 Option 1: Cloudflare (Easiest - 5 minutes)

### Step 1: Add Domain to Cloudflare
1. Sign up at [cloudflare.com](https://cloudflare.com) (free)
2. Add your domain
3. Update nameservers at your domain registrar

### Step 2: Create DNS Record
1. In Cloudflare DNS, add:
   - **Type**: A
   - **Name**: `api` (or `@`)
   - **IPv4**: `3.84.220.241`
   - **Proxy**: ✅ ON (orange cloud) - **This gives you free SSL!**

### Step 3: Setup Nginx on EC2
```bash
# SSH to EC2
./connect-ec2.sh

# Install Nginx
sudo yum install -y nginx

# Create config
sudo nano /etc/nginx/conf.d/genio.conf
```

Paste:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;  # Replace with your domain

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
# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Step 4: Update Security Group
Add inbound rules:
- Port 80 (HTTP)
- Port 443 (HTTPS)

### Step 5: Update Vercel
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add/Update:
   - **Name**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://api.yourdomain.com`
3. Redeploy

### Step 6: Update Server CORS
```bash
# On EC2
cd ~/Genio_V2
nano .env.production

# Update CORS_ORIGINS:
CORS_ORIGINS=https://your-vercel-app.vercel.app,https://api.yourdomain.com

# Restart
docker-compose -f docker-compose.prod.yml restart server
```

---

## 🚀 Option 2: Nginx + Let's Encrypt (Free SSL)

If you have a domain:

```bash
# Run the setup script
./setup-nginx-ssl.sh your-domain.com

# Then get SSL certificate
./connect-ec2.sh
sudo certbot --nginx -d your-domain.com
```

Then update Vercel with: `https://your-domain.com`

---

## 🚀 Option 3: Use IP with Temporary Solution (Not Recommended)

**Warning:** This won't work with HTTPS frontend due to mixed content.

If you need a quick test, you can temporarily:
1. Use HTTP endpoint (not secure)
2. Or use a service like [ngrok](https://ngrok.com) for testing

---

## ✅ Recommended: Cloudflare (Option 1)

**Why:**
- ✅ Free SSL certificate
- ✅ Works immediately
- ✅ No certificate management
- ✅ CDN included

**Your API endpoint will be:**
```
https://api.yourdomain.com
```

---

## 📋 Quick Checklist

- [ ] Domain added to Cloudflare (or use Let's Encrypt)
- [ ] DNS points to `3.84.220.241`
- [ ] Nginx installed and configured on EC2
- [ ] Security Group allows ports 80 and 443
- [ ] Vercel environment variable updated
- [ ] Server CORS updated with Vercel domain
- [ ] Test: `curl https://api.yourdomain.com/health`

---

**Need help?** Tell me which option you want to use and I'll guide you through it!
