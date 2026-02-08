# ⚡ Quick Frontend Setup

## Step 1: Create Environment File

Create `.env.local` in the `client` directory:

```bash
cd client
echo "NEXT_PUBLIC_API_URL=http://3.84.220.241:5001" > .env.local
```

Or manually create `client/.env.local` with:
```env
NEXT_PUBLIC_API_URL=http://3.84.220.241:5001
```

## Step 2: Configure EC2 Security Group

1. Go to [AWS Console → EC2 → Security Groups](https://console.aws.amazon.com/ec2/v2/home#SecurityGroups:)
2. Select your instance's security group
3. Click **"Edit inbound rules"**
4. Add rule:
   - **Type**: Custom TCP
   - **Port**: 5001
   - **Source**: `0.0.0.0/0` (for testing) or your IP

## Step 3: Test Connection

```bash
curl http://3.84.220.241:5001/health
```

Should return JSON with status "ok".

## Step 4: Run Frontend

```bash
cd client
npm run dev
```

Open http://localhost:3000 - it will connect to your EC2 API!

## Step 5: Update CORS (if deploying frontend)

If deploying frontend to Vercel/Netlify, update server CORS:

```bash
# SSH to EC2
./connect-ec2.sh

# Edit .env.production
cd ~/Genio_V2
nano .env.production

# Update CORS_ORIGINS:
CORS_ORIGINS=http://localhost:3000,https://your-frontend-domain.com

# Restart server
docker-compose -f docker-compose.prod.yml restart server
```

---

**That's it! Your frontend is connected!** 🎉
