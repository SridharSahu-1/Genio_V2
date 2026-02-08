# ⚡ Quick Deploy - Server + Worker

Fastest way to deploy both server and worker together.

## 🚀 One-Command Deploy

```bash
./deploy-aws.sh
```

This will:
1. ✅ Upload your code to EC2
2. ✅ Install Docker & Docker Compose
3. ✅ Build and start both server and worker
4. ✅ Show you the status

## 📝 After Deployment

1. **Connect to EC2:**
   ```bash
   ./connect-ec2.sh
   ```

2. **Edit environment variables:**
   ```bash
   cd ~/Genio_V2
   nano .env.production
   ```
   
   Add your actual values:
   - `MONGO_URI` - Your MongoDB connection string
   - `JWT_SECRET` - Generate with: `openssl rand -base64 32`
   - `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
   - `CORS_ORIGINS` - Your frontend URL (e.g., `https://yourdomain.com`)

3. **Restart services:**
   ```bash
   docker-compose -f docker-compose.prod.yml restart
   # OR if using Docker Compose v2:
   docker compose -f docker-compose.prod.yml restart
   ```

4. **Check logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs -f
   ```

5. **Test server:**
   ```bash
   curl http://3.84.220.241:5001/health
   ```

## 🔧 Common Commands

```bash
# View all logs
docker-compose -f docker-compose.prod.yml logs -f

# View server logs only
docker-compose -f docker-compose.prod.yml logs -f server

# View worker logs only
docker-compose -f docker-compose.prod.yml logs -f worker

# Restart everything
docker-compose -f docker-compose.prod.yml restart

# Stop everything
docker-compose -f docker-compose.prod.yml down

# Start everything
docker-compose -f docker-compose.prod.yml up -d

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build

# Check status
docker-compose -f docker-compose.prod.yml ps
```

## 🐛 Troubleshooting

### Services won't start
- Check `.env.production` has all required variables
- Check logs: `docker-compose -f docker-compose.prod.yml logs`

### Can't access server from outside
- Check EC2 security group allows port 5001
- Check server is running: `docker-compose -f docker-compose.prod.yml ps`

### Worker not processing jobs
- Check Redis is running: `docker-compose -f docker-compose.prod.yml ps redis`
- Check worker logs: `docker-compose -f docker-compose.prod.yml logs worker`

## 📊 Architecture

```
EC2 Instance
├── Server (Port 5001)
│   └── Fastify API
├── Worker
│   └── WhisperX Processing
└── Redis
    └── Job Queue
```

Both server and worker connect to:
- MongoDB (Atlas or external)
- Redis (local container)
- AWS S3 (for video storage)

---

That's it! Your server and worker are now running together on EC2! 🎉
