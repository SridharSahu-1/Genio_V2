# 🚀 Deploy Worker to AWS - Step by Step

Complete guide to deploy your worker on AWS. We'll use **AWS ECS Fargate** (serverless containers) - the easiest option.

---

## 📋 Prerequisites

- ✅ AWS Account (free tier available)
- ✅ AWS CLI installed
- ✅ Docker installed locally (for building image)
- ✅ Upstash Redis credentials
- ✅ AWS S3 credentials (already have)

---

## Option 1: AWS ECS Fargate (Recommended - Easiest)

### Step 1: Install AWS CLI

**macOS:**
```bash
brew install awscli
```

**Linux:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**Windows:**
Download from: https://aws.amazon.com/cli/

### Step 2: Configure AWS CLI

```bash
aws configure
```

Enter:
- **AWS Access Key ID**: Your AWS Access Key
- **AWS Secret Access Key**: Your AWS Secret Key
- **Default region**: `us-east-1` (or your preferred region)
- **Default output format**: `json`

### Step 3: Create ECR Repository (Docker Registry)

```bash
aws ecr create-repository --repository-name genio-worker --region us-east-1
```

Save the repository URI (you'll need it).

### Step 4: Build and Push Docker Image

**Navigate to worker directory:**
```bash
cd worker
```

**Get ECR login token:**
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <YOUR_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
```

Replace `<YOUR_ACCOUNT_ID>` with your AWS account ID (12 digits, found in AWS Console top right).

**Build the image:**
```bash
docker build -t genio-worker .
```

**Tag the image:**
```bash
docker tag genio-worker:latest <YOUR_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest
```

**Push to ECR:**
```bash
docker push <YOUR_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest
```

This will take 10-15 minutes (PyTorch is large).

### Step 5: Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name genio-worker-cluster --region us-east-1
```

### Step 6: Create Task Definition

Create a file `task-definition.json`:

```json
{
  "family": "genio-worker",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "4096",
  "containerDefinitions": [
    {
      "name": "genio-worker",
      "image": "<YOUR_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest",
      "essential": true,
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "REDIS_HOST",
          "value": "accepted-wallaby-28584.upstash.io"
        },
        {
          "name": "REDIS_PORT",
          "value": "6379"
        },
        {
          "name": "REDIS_PASSWORD",
          "value": "AW-oAAIncDE4MmJlOWE0ZWFkOTQ0ZDQ0YmYxYjNkNDdkYzZkNzliMXAxMjg1ODQ"
        },
        {
          "name": "AWS_ACCESS_KEY_ID",
          "value": "YOUR_AWS_ACCESS_KEY_ID"
        },
        {
          "name": "AWS_SECRET_ACCESS_KEY",
          "value": "YOUR_AWS_SECRET_KEY"
        },
        {
          "name": "AWS_S3_BUCKET",
          "value": "genio-videos"
        },
        {
          "name": "AWS_REGION",
          "value": "us-east-1"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/genio-worker",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

**Replace:**
- `<YOUR_ACCOUNT_ID>` with your AWS account ID
- `YOUR_AWS_SECRET_KEY` with your actual secret key
- `REDIS_PASSWORD` with your actual Upstash password

**Register the task definition:**
```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json --region us-east-1
```

### Step 7: Create CloudWatch Log Group

```bash
aws logs create-log-group --log-group-name /ecs/genio-worker --region us-east-1
```

### Step 8: Create VPC and Security Group (if needed)

**Get default VPC:**
```bash
aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text
```

Save the VPC ID.

**Get default subnets:**
```bash
aws ec2 describe-subnets --filters "Name=vpc-id,Values=<VPC_ID>" --query "Subnets[0].SubnetId" --output text
```

Save at least one subnet ID.

**Create security group:**
```bash
aws ec2 create-security-group --group-name genio-worker-sg --description "Security group for genio worker" --vpc-id <VPC_ID>
```

Save the security group ID.

### Step 9: Run the Task

```bash
aws ecs run-task \
  --cluster genio-worker-cluster \
  --task-definition genio-worker \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<SUBNET_ID>],securityGroups=[<SECURITY_GROUP_ID>],assignPublicIp=ENABLED}" \
  --region us-east-1
```

**Replace:**
- `<SUBNET_ID>` with your subnet ID
- `<SECURITY_GROUP_ID>` with your security group ID

### Step 10: Monitor Logs

```bash
aws logs tail /ecs/genio-worker --follow --region us-east-1
```

You should see:
```
✅ Running in cloud/Docker environment - worker enabled
🔗 Worker connecting to Redis at accepted-wallaby-28584.upstash.io:6379
✅ Worker ready and listening for jobs on queue 'video-processing'
```

---

## Option 2: AWS EC2 (Free Tier Option)

### Step 1: Launch EC2 Instance

1. Go to [EC2 Console](https://console.aws.amazon.com/ec2/)
2. Click **"Launch Instance"**
3. Configure:
   - **Name**: `genio-worker`
   - **AMI**: Amazon Linux 2023 (free tier)
   - **Instance Type**: `t3.small` (2 vCPU, 2GB RAM) - **NOT free tier, but needed for PyTorch**
     - For free tier: `t2.micro` (1 vCPU, 1GB) - **Won't work for PyTorch**
   - **Key Pair**: Create new or use existing
   - **Network Settings**: Allow SSH (port 22)
   - **Storage**: 20GB (free tier)

4. Click **"Launch Instance"**

### Step 2: Connect to EC2

```bash
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>
```gene

### Step 3: Install Docker on EC2

```bash
sudo yum update -y
sudo yum install docker -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user
```

Log out and back in for group changes.

### Step 4: Install Docker Compose (optional)

```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### Step 5: Clone Your Repository

```bash
git clone https://github.com/your-username/Genio_V2.git
cd Genio_V2/worker
```

### Step 6: Create .env File

```bash
nano .env
```

Add:
```
NODE_ENV=production
REDIS_HOST=accepted-wallaby-28584.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=AW-oAAIncDE4MmJlOWE0ZWFkOTQ0ZDQ0YmYxYjNkNDdkYzZkNzliMXAxMjg1ODQ
AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_KEY
AWS_S3_BUCKET=genio-videos
AWS_REGION=us-east-1
```

Save: `Ctrl+X`, then `Y`, then `Enter`

### Step 7: Build and Run Docker Container

```bash
docker build -t genio-worker .
docker run -d --env-file .env --name genio-worker --restart unless-stopped genio-worker
```

### Step 8: Check Logs

```bash
docker logs -f genio-worker
```

---

## Option 3: AWS App Runner (Simplest - But Paid)

App Runner is simpler but costs ~$0.007 per vCPU-hour (not free tier).

1. Go to [App Runner Console](https://console.aws.amazon.com/apprunner/)
2. Create service
3. Source: ECR (use the image from Step 4 above)
4. Configure environment variables
5. Deploy

---

## 💰 Cost Comparison

| Option | Cost | Difficulty |
|--------|------|------------|
| **ECS Fargate** | ~$0.04/hour (~$30/month) | Medium |
| **EC2 t3.small** | ~$0.02/hour (~$15/month) | Medium |
| **EC2 t2.micro** | Free (but won't work - too little RAM) | Easy |
| **App Runner** | ~$0.007/vCPU-hour | Easy |

**Note**: AWS free tier includes 750 hours/month of t2.micro, but it only has 1GB RAM which is insufficient for PyTorch.

---

## ✅ Recommended: ECS Fargate

**Pros:**
- ✅ Serverless (no server management)
- ✅ Auto-scaling
- ✅ Pay only when running
- ✅ Easy to update

**Cons:**
- ❌ Not free (but reasonable cost)
- ❌ More setup steps

---

## 🐛 Troubleshooting

### ECS Task Fails to Start
- Check CloudWatch logs
- Verify environment variables
- Check security group allows outbound traffic

### EC2 Out of Memory
- Upgrade to t3.medium (4GB RAM)
- Or use ECS Fargate with 4GB

### Docker Build Fails
- Increase EC2 instance size temporarily
- Or build locally and push to ECR

---

## 📊 Monitoring

### ECS:
```bash
aws ecs list-tasks --cluster genio-worker-cluster
aws logs tail /ecs/genio-worker --follow
```

### EC2:
```bash
docker ps
docker logs genio-worker
```

---

## 🎉 Success!

Once deployed, your worker will:
- ✅ Connect to Upstash Redis
- ✅ Process video jobs from the queue
- ✅ Upload subtitles to S3
- ✅ Run 24/7

---

## 💡 Cost Optimization Tips

1. **Stop EC2 when not in use** (if using EC2)
2. **Use ECS Scheduled Tasks** (run only during business hours)
3. **Monitor CloudWatch** for unexpected costs
4. **Set up billing alerts** in AWS

---

Choose the option that works best for you! ECS Fargate is recommended for ease of use.
