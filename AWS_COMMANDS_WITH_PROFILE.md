# 🔧 AWS Commands with --profile genio

All AWS CLI commands need `--profile genio` to use the correct credentials.

---

## ✅ Step-by-Step Commands (With Profile)

### Step 1: Get Your Account ID

```bash
aws sts get-caller-identity --profile genio --query Account --output text
```

Save this 12-digit number (e.g., `123456789012`).

### Step 2: Create ECR Repository

```bash
aws ecr create-repository --repository-name genio-worker --region us-east-1 --profile genio
```

### Step 3: Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name genio-worker-cluster --region us-east-1 --profile genio
```

### Step 4: Get Account ID (for Docker commands)

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --profile genio --query Account --output text)
echo $ACCOUNT_ID
```

### Step 5: Login to ECR (Docker)

```bash
aws ecr get-login-password --region us-east-1 --profile genio | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
```

### Step 6: Build Docker Image

```bash
cd worker
docker build -t genio-worker .
```

### Step 7: Tag Docker Image

```bash
docker tag genio-worker:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest
```

### Step 8: Push Docker Image

```bash
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest
```

### Step 9: Create CloudWatch Log Group

```bash
aws logs create-log-group --log-group-name /ecs/genio-worker --region us-east-1 --profile genio
```

### Step 10: Update Task Definition

Edit `worker/task-definition.json`:
- Replace `<YOUR_ACCOUNT_ID>` with your actual account ID
- Replace `REPLACE_WITH_YOUR_AWS_SECRET_KEY` with: `YOUR_AWS_SECRET_ACCESS_KEY`
- Update `REDIS_PASSWORD` if needed

### Step 11: Register Task Definition

```bash
cd worker
aws ecs register-task-definition --cli-input-json file://task-definition.json --region us-east-1 --profile genio
```

### Step 12: Get VPC Resources

```bash
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --profile genio)
echo "VPC ID: $VPC_ID"

SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[0].SubnetId" --output text --profile genio)
echo "Subnet ID: $SUBNET_ID"

SG_ID=$(aws ec2 create-security-group --group-name genio-worker-sg --description "Genio worker security group" --vpc-id $VPC_ID --query 'GroupId' --output text --profile genio)
echo "Security Group ID: $SG_ID"
```

### Step 13: Run ECS Task

```bash
aws ecs run-task \
  --cluster genio-worker-cluster \
  --task-definition genio-worker \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --region us-east-1 \
  --profile genio
```

### Step 14: Check Logs

```bash
aws logs tail /ecs/genio-worker --follow --region us-east-1 --profile genio
```

---

## 🔍 Verify Commands Work

Test your credentials:
```bash
aws sts get-caller-identity --profile genio
```

Should return your account info. If it works, all other commands will work too.

---

## 📝 Quick Copy-Paste Script

Here's everything in one script (run from project root):

```bash
# Set account ID variable
ACCOUNT_ID=$(aws sts get-caller-identity --profile genio --query Account --output text)
echo "Account ID: $ACCOUNT_ID"

# Create ECR repository
aws ecr create-repository --repository-name genio-worker --region us-east-1 --profile genio

# Create ECS cluster
aws ecs create-cluster --cluster-name genio-worker-cluster --region us-east-1 --profile genio

# Create log group
aws logs create-log-group --log-group-name /ecs/genio-worker --region us-east-1 --profile genio

# Login to ECR
aws ecr get-login-password --region us-east-1 --profile genio | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Build, tag, and push Docker image
cd worker
docker build -t genio-worker .
docker tag genio-worker:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest

# Update task-definition.json with your account ID first, then:
aws ecs register-task-definition --cli-input-json file://task-definition.json --region us-east-1 --profile genio

# Get VPC resources
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --profile genio)
SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[0].SubnetId" --output text --profile genio)
SG_ID=$(aws ec2 create-security-group --group-name genio-worker-sg --description "Genio worker" --vpc-id $VPC_ID --query 'GroupId' --output text --profile genio)

# Run task
aws ecs run-task \
  --cluster genio-worker-cluster \
  --task-definition genio-worker \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --region us-east-1 \
  --profile genio

# Check logs
aws logs tail /ecs/genio-worker --follow --region us-east-1 --profile genio
```

---

## ⚠️ Important Notes

1. **Always use `--profile genio`** with AWS CLI commands
2. **Docker commands** (build, tag, push) don't need `--profile`
3. **Update task-definition.json** with your account ID before registering
4. **All AWS CLI commands** need the profile flag

---

## 🐛 If You Still Get Errors

1. **Verify credentials work:**
   ```bash
   aws sts get-caller-identity --profile genio
   ```

2. **Check profile exists:**
   ```bash
   cat ~/.aws/credentials | grep -A 2 "\[genio\]"
   ```

3. **Make sure you're using `--profile genio`** on every AWS CLI command

---

That's it! Just add `--profile genio` to every AWS CLI command and you're good to go! 🚀
