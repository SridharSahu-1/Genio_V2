# 🔧 Render Deployment Fix Guide

## Issues Found

1. **Redis Connection Error**: `REDIS_HOST` is set to full URL instead of just hostname
2. **MongoDB Connection Error**: Render IPs not whitelisted in MongoDB Atlas

---

## ✅ Fix 1: Redis Environment Variables in Render

### Current (WRONG):
```
REDIS_HOST = redis://default:AW-oAAIncDE4MmJlOWE0ZWFkOTQ0ZDQ0YmYxYjNkNDdkYzZkNzliMXAxMjg1ODQ@accepted-wallaby-28584.upstash.io
```

### Correct Settings:

1. Go to **Render Dashboard** → Your Service → **Environment** tab

2. Update `REDIS_HOST` to **ONLY the hostname**:
   ```
   REDIS_HOST = accepted-wallaby-28584.upstash.io
   ```
   *(Remove the `redis://default:...@` part)*

3. Make sure `REDIS_PORT` is set:
   ```
   REDIS_PORT = 6379
   ```

4. Make sure `REDIS_PASSWORD` is set to **ONLY the password**:
   ```
   REDIS_PASSWORD = AW-oAAIncDE4MmJlOWE0ZWFkOTQ0ZDQ0YmYxYjNkNDdkYzZkNzliMXAxMjg1ODQ
   ```
   *(Just the password part, without the `redis://default:` prefix)*

5. **Save** the environment variables

6. **Redeploy** your service

---

## ✅ Fix 2: MongoDB Atlas IP Whitelist

### Problem:
MongoDB Atlas blocks connections from IPs not in the whitelist. Render uses dynamic IPs.

### Solution:

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Click on your **Cluster**
3. Click **"Network Access"** (left sidebar)
4. Click **"Add IP Address"**
5. Click **"Allow Access from Anywhere"** button
   - This adds `0.0.0.0/0` to whitelist
   - ⚠️ **Security Note**: For production, consider whitelisting specific IPs, but for PoC this is fine
6. Click **"Confirm"**

**Alternative (More Secure)**: If you want to be more specific:
- Go to Render Dashboard → Your Service → **Metrics** or **Logs**
- Find Render's IP addresses (they may change)
- Add those specific IPs to MongoDB whitelist

But for PoC, `0.0.0.0/0` (allow all) is fine.

---

## 📋 Complete Environment Variables Checklist

Make sure these are set correctly in Render:

```
NODE_ENV = production
PORT = 10000
MONGO_URI = mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
REDIS_HOST = accepted-wallaby-28584.upstash.io
REDIS_PORT = 6379
REDIS_PASSWORD = AW-oAAIncDE4MmJlOWE0ZWFkOTQ0ZDQ0YmYxYjNkNDdkYzZkNzliMXAxMjg1ODQ
JWT_SECRET = your-super-secret-jwt-key-minimum-32-characters
CORS_ORIGINS = https://your-vercel-app.vercel.app
AWS_ACCESS_KEY_ID = your-aws-key
AWS_SECRET_ACCESS_KEY = your-aws-secret
AWS_S3_BUCKET = your-bucket-name
AWS_REGION = us-east-1
```

---

## 🔄 After Fixing

1. **Save** all environment variables in Render
2. **Redeploy** your service (or it will auto-redeploy)
3. Check **Logs** tab - you should see:
   - ✅ MongoDB connection successful
   - ✅ Redis connection successful
   - ✅ Server running on port 10000

---

## ✅ Verify It's Working

1. Visit: `https://your-server.onrender.com/health`
2. Should return:
   ```json
   {
     "status": "ok",
     "services": {
       "database": "connected",
       "redis": "connected"
     }
   }
   ```

---

## 🎉 Done!

Your server should now be working correctly!
