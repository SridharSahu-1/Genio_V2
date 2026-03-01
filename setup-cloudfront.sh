#!/bin/bash
# Create a CloudFront distribution in front of your EC2 API (port 5001).
# Gives you a stable HTTPS URL (e.g. https://d1234abcd.cloudfront.net) — no domain needed.
#
# Prerequisites:
#   1. EC2 has an Elastic IP (so the IP doesn't change). See DEPLOYMENT.md Option A Step 1.
#   2. EC2 Security Group allows inbound TCP 5001 from 0.0.0.0/0.
#   3. Server is running on EC2 port 5001 (./deploy-to-ec2.sh already done).
#
# Usage: ./setup-cloudfront.sh [EC2-public-DNS]
#   If you omit the argument, the script will try to get the DNS from your instance ID.

set -e

INSTANCE_ID="${INSTANCE_ID:-i-0b09cd0fe805d6fe6}"
REGION="${REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-genio}"
ORIGIN_PORT="5001"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

export AWS_PROFILE

echo -e "${CYAN}CloudFront setup for Genio API${NC}"
echo ""

# Resolve EC2 public DNS
if [ -n "$1" ]; then
  EC2_DNS="$1"
  echo -e "${GREEN}Using EC2 origin: $EC2_DNS${NC}"
else
  echo -e "${YELLOW}Resolving EC2 Public DNS for instance $INSTANCE_ID...${NC}"
  EC2_DNS=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].PublicDnsName" \
    --output text \
    --region "$REGION" 2>/dev/null || true)
  if [ -z "$EC2_DNS" ] || [ "$EC2_DNS" = "None" ]; then
    echo -e "${RED}Could not get Public DNS for instance $INSTANCE_ID.${NC}"
    echo "  Pass it explicitly: ./setup-cloudfront.sh ec2-3-84-220-241.compute-1.amazonaws.com"
    exit 1
  fi
  echo -e "${GREEN}Origin: $EC2_DNS (port $ORIGIN_PORT)${NC}"
fi

# Build distribution config (use temp file to avoid shell escaping issues)
CALLER_REF="genio-api-$(date +%s)"
CONFIG_FILE=$(mktemp)
cat << EOF > "$CONFIG_FILE"
{
  "CallerReference": "$CALLER_REF",
  "Comment": "Genio API - stable HTTPS URL",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "GenioEC2",
        "DomainName": "$EC2_DNS",
        "CustomOriginConfig": {
          "HTTPPort": $ORIGIN_PORT,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only"
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "GenioEC2",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 7,
      "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
    },
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  },
  "DefaultRootObject": "",
  "PriceClass": "PriceClass_All"
}
EOF

echo ""
echo -e "${YELLOW}Creating CloudFront distribution...${NC}"
OUTPUT=$(aws cloudfront create-distribution --distribution-config "file://$CONFIG_FILE" 2>&1) || true
rm -f "$CONFIG_FILE"

if echo "$OUTPUT" | grep -q "DistributionId"; then
  DIST_ID=$(echo "$OUTPUT" | grep -o '"Id": "[^"]*"' | head -1 | cut -d'"' -f4)
  DOMAIN=$(echo "$OUTPUT" | grep -o '"DomainName": "[^"]*"' | head -1 | cut -d'"' -f4)
  URL="https://$DOMAIN"
  echo ""
  echo -e "${GREEN}CloudFront distribution created.${NC}"
  echo ""
  echo -e "${CYAN}Your stable API URL:${NC}  $URL"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "  1. Vercel → Project → Settings → Environment Variables"
  echo "     Set NEXT_PUBLIC_API_URL = $URL"
  echo "     Then redeploy the client once."
  echo ""
  echo "  2. On EC2, set CORS and restart:"
  echo "     ./connect-ec2.sh"
  echo "     cd ~/Genio_V2 && nano .env.production"
  echo "     Add to CORS_ORIGINS: $URL   (and your Vercel URL)"
  echo "     docker-compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production up -d"
  echo ""
  echo "  3. Test: curl $URL/health"
  echo ""
  echo "Distribution may take 2–5 minutes to become active. Then the URL above will work."
else
  echo -e "${RED}Create failed:${NC}"
  echo "$OUTPUT"
  exit 1
fi
