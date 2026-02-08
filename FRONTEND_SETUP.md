# 🌐 Frontend Setup - Connect to EC2 API

## Quick Setup

### 1. Configure Frontend Environment

The frontend is already configured to use the EC2 endpoint. The `.env.local` file has been created with:

```env
NEXT_PUBLIC_API_URL=http://3.84.220.241:5001
```

### 2. Update Server CORS (if needed)

If you're deploying the frontend to a different domain (like Vercel), update the server's CORS settings:

**On EC2:**
```bash
ssh -i ~/genio-worker-new.pem ec2-user@3.84.220.241
cd ~/Genio_V2
nano .env.production
```

Update `CORS_ORIGINS`:
```env
CORS_ORIGINS=http://localhost:3000,https://your-frontend-domain.com
```

Then restart:
```bash
docker-compose -f docker-compose.prod.yml restart server
```

### 3. Configure EC2 Security Group

**Important:** Make sure your EC2 Security Group allows inbound traffic on port 5001.

1. Go to [AWS Console → EC2 → Security Groups](https://console.aws.amazon.com/ec2/v2/home#SecurityGroups:)
2. Find your instance's security group
3. Click **"Edit inbound rules"**
4. Add rule:
   - **Type**: Custom TCP
   - **Port**: 5001
   - **Source**: 
     - For testing: `0.0.0.0/0` (allows from anywhere)
     - For production: Your specific IP or frontend domain IP

### 4. Test the Connection

**From your local machine:**
```bash
# Test health endpoint
curl http://3.84.220.241:5001/health

# Should return:
# {
#   "status": "ok",
#   "timestamp": "...",
#   "services": {
#     "database": "connected",
#     "redis": "connected"
#   }
# }
```

### 5. Run Frontend Locally

```bash
cd client
npm install  # If not already done
npm run dev
```

The frontend will now connect to your EC2 API at `http://3.84.220.241:5001`

### 6. Deploy Frontend (Optional)

If you want to deploy the frontend to Vercel/Netlify:

**Vercel:**
1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Import your repository
4. Add environment variable:
   - **Name**: `NEXT_PUBLIC_API_URL`
   - **Value**: `http://3.84.220.241:5001`
5. Deploy

**Netlify:**
1. Push your code to GitHub
2. Go to [Netlify](https://netlify.com)
3. Import your repository
4. Add environment variable in Site settings → Environment variables
5. Deploy

**Important:** After deploying to a domain, update the server's `CORS_ORIGINS` to include your frontend domain.

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser:
1. Check `CORS_ORIGINS` in `.env.production` on EC2
2. Make sure your frontend URL is included
3. Restart the server: `docker-compose -f docker-compose.prod.yml restart server`

### Connection Refused

If you can't connect:
1. Check EC2 Security Group allows port 5001
2. Check server is running: `docker-compose -f docker-compose.prod.yml ps`
3. Check server logs: `docker-compose -f docker-compose.prod.yml logs server`

### Socket.io Connection Issues

Socket.io uses the same `NEXT_PUBLIC_API_URL`. Make sure:
1. The environment variable is set correctly
2. The server is running and accessible
3. CORS is configured properly

## Your Endpoints

- **API Base**: `http://3.84.220.241:5001`
- **Health Check**: `http://3.84.220.241:5001/health`
- **Auth**: `http://3.84.220.241:5001/api/auth/register`
- **Videos**: `http://3.84.220.241:5001/api/videos`

---

**That's it! Your frontend is now connected to your EC2 API!** 🎉
