# 🔧 Fix Docker Environment Variables - Manual Steps

The SSH connection is timing out. Use these manual steps:

## Step 1: Connect to EC2

```bash
./connect-ec2.sh
```

## Step 2: Once Connected, Run These Commands

```bash
cd ~/Genio_V2

# Verify .env.production has correct credentials
cat .env.production | grep AWS_ACCESS_KEY_ID
cat .env.production | grep AWS_SECRET_ACCESS_KEY

# Stop containers
docker-compose -f docker-compose.prod.yml down

# Start containers with .env.production file
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# Wait a few seconds
sleep 5

# Verify the container now has the correct credentials
docker exec genio_server env | grep AWS_ACCESS_KEY_ID
docker exec genio_server env | grep AWS_SECRET_ACCESS_KEY

# Check container status
docker-compose -f docker-compose.prod.yml ps

# Check server logs
docker-compose -f docker-compose.prod.yml logs server --tail=20
```

## What This Does

1. **Stops containers** - This ensures they're completely stopped
2. **Starts with --env-file** - This makes Docker Compose read `.env.production` and pass variables to containers
3. **Verifies** - Checks that containers now see the real credentials (not placeholders)

## Expected Output

After running, you should see:
- `AWS_ACCESS_KEY_ID` starting with `AKIA...` (not `YOUR_AWS_ACCESS_KEY_ID`)
- `AWS_SECRET_ACCESS_KEY` with your actual secret (not `YOUR_AWS_SECRET_ACCESS_KEY`)

## If Still Not Working

If the container still shows placeholders, check:

1. **File format** - Make sure `.env.production` has no quotes around values:
   ```bash
   # ✅ Correct:
   AWS_ACCESS_KEY_ID=AKIAQMLJCG7QOGUGS6DI
   
   # ❌ Wrong:
   AWS_ACCESS_KEY_ID="AKIAQMLJCG7QOGUGS6DI"
   ```

2. **No spaces** - Make sure there are no spaces around the `=`:
   ```bash
   # ✅ Correct:
   AWS_ACCESS_KEY_ID=AKIA...
   
   # ❌ Wrong:
   AWS_ACCESS_KEY_ID = AKIA...
   ```

3. **File location** - Make sure you're in `~/Genio_V2` when running docker-compose

After fixing, your uploads should work! 🎉
