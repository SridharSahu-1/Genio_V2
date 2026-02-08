# ⚡ AWS Worker Deployment - Quick Start

## 🎯 Recommended: ECS Fargate (Easiest)

### Prerequisites
```bash
# Install AWS CLI
brew install awscli  # macOS
# or download from aws.amazon.com/cli

# Configure
aws configure
# Enter: Access Key, Secret Key, Region (us-east-1), Format (json)
```

### 1. Create ECR Repository
```bash
aws ecr create-repository --repository-name genio-worker --region us-east-1
```

### 2. Build & Push Docker Image
```bash
cd worker

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build
docker build -t genio-worker .

# Tag
docker tag genio-worker:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest

# Push (takes 10-15 min)
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest
```

### 3. Create Task Definition

Create `task-definition.json`:
```json
{
  "family": "genio-worker",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "4096",
  "containerDefinitions": [{
    "name": "genio-worker",
    "image": "<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest",
    "essential": true,
    "environment": [
      {"name": "NODE_ENV", "value": "production"},
      {"name": "REDIS_HOST", "value": "accepted-wallaby-28584.upstash.io"},
      {"name": "REDIS_PORT", "value": "6379"},
      {"name": "REDIS_PASSWORD", "value": "YOUR_UPSTASH_PASSWORD"},
      {"name": "AWS_ACCESS_KEY_ID", "value": "YOUR_AWS_ACCESS_KEY_ID"},
      {"name": "AWS_SECRET_ACCESS_KEY", "value": "YOUR_AWS_SECRET"},
      {"name": "AWS_S3_BUCKET", "value": "genio-videos"},
      {"name": "AWS_REGION", "value": "us-east-1"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/genio-worker",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]
}
```

### 4. Register Task & Create Resources
```bash
# Create log group
aws logs create-log-group --log-group-name /ecs/genio-worker --region us-east-1

# Create cluster
aws ecs create-cluster --cluster-name genio-worker-cluster --region us-east-1

# Register task
aws ecs register-task-definition --cli-input-json file://task-definition.json --region us-east-1

# Get VPC and subnet
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)
SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[0].SubnetId" --output text)
SG_ID=$(aws ec2 create-security-group --group-name genio-worker-sg --description "Genio worker SG" --vpc-id $VPC_ID --query 'GroupId' --output text)

# Run task
aws ecs run-task \
  --cluster genio-worker-cluster \
  --task-definition genio-worker \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --region us-east-1
```

### 5. Check Logs
```bash
aws logs tail /ecs/genio-worker --follow --region us-east-1
```

---

## 💰 Cost
- **ECS Fargate**: ~$0.04/hour (~$30/month for 24/7)
- **Free tier**: No ECS Fargate free tier
- **Alternative**: EC2 t2.micro is free but has only 1GB RAM (not enough for PyTorch)

---

## ✅ Verify
Look for in logs:
```
✅ Worker ready and listening for jobs on queue 'video-processing'
```

---

See `DEPLOY_WORKER_AWS.md` for detailed instructions and alternatives!
