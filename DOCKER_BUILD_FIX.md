# 🔧 Docker Build Fix

## Problem
You're trying to build from the root directory, but the Dockerfile is in the `worker/` directory.

## Solution

### Navigate to worker directory first:

```bash
cd worker
```

### Then build:

```bash
docker build -t genio-worker .
```

---

## Complete Docker Commands (From worker directory)

```bash
# 1. Navigate to worker directory
cd worker

# 2. Build the image
docker build -t genio-worker .

# 3. Get your account ID (if not already set)
ACCOUNT_ID=$(aws sts get-caller-identity --profile genio --query Account --output text)
echo $ACCOUNT_ID

# 4. Tag the image
docker tag genio-worker:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest

# 5. Push to ECR
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest
```

---

## Quick Fix

Just run:
```bash
cd worker && docker build -t genio-worker .
```

That's it! The Dockerfile is in the `worker/` directory, so you need to be there when building.
