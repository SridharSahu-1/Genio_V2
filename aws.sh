# 1. Verify credentials work
aws sts get-caller-identity --profile genio

# 2. Create ECR repository
aws ecr create-repository --repository-name genio-worker --region us-east-1 --profile genio

# 3. Create ECS cluster
aws ecs create-cluster --cluster-name genio-worker-cluster --region us-east-1 --profile genio

# 4. Get account ID (for Docker commands)
ACCOUNT_ID=$(aws sts get-caller-identity --profile genio --query Account --output text)
echo $ACCOUNT_ID

# 5. Create log group
aws logs create-log-group --log-group-name /ecs/genio-worker --region us-east-1 --profile genio