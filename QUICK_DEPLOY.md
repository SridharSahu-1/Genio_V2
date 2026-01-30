# ⚡ Quick Deploy Checklist

## 🎯 Free Deployment Stack (All Free for PoC)

| Component | Platform | Cost |
|-----------|----------|------|
| Client (Frontend) | Vercel | ✅ Free |
| Server (API) | Render | ✅ Free |
| Worker (AI Processing) | Railway | ✅ $5/month free credit |
| Database | MongoDB Atlas | ✅ Free |
| Queue | Upstash Redis | ✅ Free |

---

## 📝 Quick Steps

### 1. Get Your Upstash Redis Credentials
From your Redis URL: `redis://default:PASSWORD@HOST:6379`
- **REDIS_HOST**: `accepted-wallaby-28584.upstash.io`
- **REDIS_PORT**: `6379`
- **REDIS_PASSWORD**: Extract from URL (between `default:` and `@`)

### 2. Deploy Server (Render)
1. Go to [Render](https://dashboard.render.com/)
2. New → Web Service → Connect GitHub
3. Root Directory: `server`
4. Build: `npm install && npm run build`
5. Start: `npm run start:prod`
6. Add all env vars (see DEPLOYMENT_GUIDE.md)
7. Copy URL: `https://genio-server.onrender.com`

### 3. Deploy Worker (Railway)
1. Go to [Railway](https://railway.app/)
2. New Project → Deploy from GitHub
3. Root Directory: `worker`
4. Railway auto-detects Dockerfile
5. Add env vars (same Redis/AWS as server)
6. Deploy!

### 4. Update Frontend (Vercel)
1. Vercel Dashboard → Settings → Environment Variables
2. Set: `NEXT_PUBLIC_API_URL=https://genio-server.onrender.com`
3. Redeploy

---

## 🔑 Required Environment Variables

### Server (Render)
```
NODE_ENV=production
MONGO_URI=mongodb+srv://...
REDIS_HOST=accepted-wallaby-28584.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=...
JWT_SECRET=...
CORS_ORIGINS=https://your-app.vercel.app
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
AWS_REGION=us-east-1
```

### Worker (Railway)
```
NODE_ENV=production
REDIS_HOST=accepted-wallaby-28584.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
AWS_REGION=us-east-1
```

---

## ✅ Verify Deployment

1. **Server Health**: `https://genio-server.onrender.com/health`
2. **Worker Logs**: Check Railway dashboard
3. **Test Upload**: Upload video from Vercel app

---

## 📚 Full Guide
See `DEPLOYMENT_GUIDE.md` for detailed instructions.
