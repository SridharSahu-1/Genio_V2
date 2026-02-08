# 🔧 AWS Credentials Fix

## Problem
You're getting "The security token included in the request is invalid" because AWS CLI is using the `[default]` profile which has fake credentials (`foo`/`bar`).

## Solution: Use the `genio` Profile

You have the correct credentials in the `[genio]` profile. Use it in one of these ways:

### Option 1: Use --profile flag (Recommended)

Add `--profile genio` to all AWS CLI commands:

```bash
# Create ECR repository
aws ecr create-repository --repository-name genio-worker --region us-east-1 --profile genio

# Get login token
aws ecr get-login-password --region us-east-1 --profile genio | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# All other commands
aws ecs create-cluster --cluster-name genio-worker-cluster --region us-east-1 --profile genio
```

### Option 2: Set AWS_PROFILE Environment Variable

```bash
export AWS_PROFILE=genio

# Now all commands work without --profile
aws ecr create-repository --repository-name genio-worker --region us-east-1
aws ecs create-cluster --cluster-name genio-worker-cluster --region us-east-1
```

### Option 3: Update Default Profile (Permanent)

Replace the `[default]` credentials with your `[genio]` credentials:

```bash
# Edit credentials file
nano ~/.aws/credentials
```

Change:
```
[default]
aws_access_key_id = foo
aws_secret_access_key = bar
```

To:
```
[default]
aws_access_key_id = YOUR_AWS_ACCESS_KEY_ID
aws_secret_access_key = YOUR_AWS_SECRET_ACCESS_KEY
```

**Note**: This makes `genio` the default profile for all AWS CLI commands.

---

## Quick Fix: Run This Now

```bash
# Set profile for this session
export AWS_PROFILE=genio

# Verify it's working
aws sts get-caller-identity --profile genio

# Create repository
aws ecr create-repository --repository-name genio-worker --region us-east-1 --profile genio
```

You should see your account ID and user info, then the repository will be created successfully.

---

## Updated Commands with Profile

Here are all the commands you'll need, with `--profile genio` added:

```bash
# 1. Get account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile genio)
echo $ACCOUNT_ID

# 2. Create ECR repository
aws ecr create-repository --repository-name genio-worker --region us-east-1 --profile genio

# 3. Login to ECR
aws ecr get-login-password --region us-east-1 --profile genio | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# 4. Build & push (no profile needed for docker)
docker build -t genio-worker .
docker tag genio-worker:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/genio-worker:latest

# 5. Create resources
aws logs create-log-group --log-group-name /ecs/genio-worker --region us-east-1 --profile genio
aws ecs create-cluster --cluster-name genio-worker-cluster --region us-east-1 --profile genio

# 6. Register task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json --region us-east-1 --profile genio

# 7. Get VPC resources
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --profile genio)
SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[0].SubnetId" --output text --profile genio)
SG_ID=$(aws ec2 create-security-group --group-name genio-worker-sg --description "Genio worker" --vpc-id $VPC_ID --query 'GroupId' --output text --profile genio)

# 8. Run task
aws ecs run-task \
  --cluster genio-worker-cluster \
  --task-definition genio-worker \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --region us-east-1 \
  --profile genio

# 9. Check logs
aws logs tail /ecs/genio-worker --follow --region us-east-1 --profile genio
```

---

## Verify Your Credentials

Test if your credentials work:

```bash
aws sts get-caller-identity --profile genio
```

Should return:
```json
{
    "UserId": "...",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/..."
}
```

If this works, your credentials are valid and you can proceed!
