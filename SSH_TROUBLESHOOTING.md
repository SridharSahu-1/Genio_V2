# SSH Connection Troubleshooting

## Issue: Permission Denied After Fixing File Permissions

If you've fixed the file permissions (`chmod 400 genio-worker.pem`) but still get permission denied, try these solutions:

## 1. Check the Correct Username

The username depends on your AMI type:

```bash
# Amazon Linux 2 / Amazon Linux 2023
ssh -i genio-worker.pem ec2-user@3.84.220.241

# Ubuntu
ssh -i genio-worker.pem ubuntu@3.84.220.241

# Debian
ssh -i genio-worker.pem admin@3.84.220.241

# RHEL / CentOS
ssh -i genio-worker.pem ec2-user@3.84.220.241

# SUSE
ssh -i genio-worker.pem ec2-user@3.84.220.241
```

**Try Ubuntu first:**
```bash
ssh -i genio-worker.pem ubuntu@3.84.220.241
```

## 2. Verify Key File Location and Permissions

```bash
# Check if file exists and permissions
ls -la genio-worker.pem

# Should show: -r-------- (400) or -rw------- (600)
# If not, fix it:
chmod 400 genio-worker.pem

# Verify the file is readable
cat genio-worker.pem | head -1
# Should show: -----BEGIN RSA PRIVATE KEY----- or -----BEGIN OPENSSH PRIVATE KEY-----
```

## 3. Check Instance Status and IP

```bash
# Check if instance is running (use your AWS profile)
aws ec2 describe-instances \
  --filters "Name=ip-address,Values=3.84.220.241" \
  --query "Reservations[*].Instances[*].[InstanceId,State.Name,PublicIpAddress,KeyName]" \
  --output table \
  --profile genio
```

## 4. Verify Security Group Allows SSH

```bash
# Get security group for the instance
aws ec2 describe-instances \
  --filters "Name=ip-address,Values=3.84.220.241" \
  --query "Reservations[*].Instances[*].SecurityGroups[*].[GroupId,GroupName]" \
  --output table \
  --profile genio

# Check security group rules (replace sg-xxxxx with actual group ID)
aws ec2 describe-security-groups \
  --group-ids sg-xxxxx \
  --query "SecurityGroups[*].IpPermissions" \
  --output table \
  --profile genio
```

**Make sure port 22 (SSH) is open from your IP or 0.0.0.0/0**

## 5. Try Verbose SSH for More Details

```bash
ssh -v -i genio-worker.pem ec2-user@3.84.220.241
# or
ssh -vvv -i genio-worker.pem ec2-user@3.84.220.241
```

This will show exactly where the connection is failing.

## 6. Verify Key Pair Matches Instance

```bash
# Get the key pair name for the instance
aws ec2 describe-instances \
  --filters "Name=ip-address,Values=3.84.220.241" \
  --query "Reservations[*].Instances[*].KeyName" \
  --output text \
  --profile genio
```

Make sure this matches the key pair you used when launching the instance.

## 7. Check if Instance is Running

```bash
aws ec2 describe-instances \
  --filters "Name=ip-address,Values=3.84.220.241" \
  --query "Reservations[*].Instances[*].[InstanceId,State.Name,PublicIpAddress]" \
  --output table \
  --profile genio
```

If state is not "running", start it:
```bash
# Get instance ID first
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=ip-address,Values=3.84.220.241" \
  --query "Reservations[*].Instances[*].InstanceId" \
  --output text \
  --profile genio)

# Start instance
aws ec2 start-instances --instance-ids $INSTANCE_ID --profile genio
```

## 8. Common Solutions

### Solution A: Try Different Username
```bash
# Most common issue - wrong username
ssh -i genio-worker.pem ubuntu@3.84.220.241
```

### Solution B: Use Full Path to Key
```bash
ssh -i ~/genio-worker.pem ec2-user@3.84.220.241
# or
ssh -i ~/Downloads/genio-worker.pem ec2-user@3.84.220.241
```

### Solution C: Check Key Format
```bash
# If key is in wrong format, convert it
ssh-keygen -p -f genio-worker.pem -m pem
```

### Solution D: Add to SSH Config
Create/edit `~/.ssh/config`:
```
Host genio-worker
    HostName 3.84.220.241
    User ec2-user
    IdentityFile ~/genio-worker.pem
    IdentitiesOnly yes
```

Then connect with:
```bash
ssh genio-worker
```

## 9. Quick Diagnostic Script

Run this to check everything:

```bash
#!/bin/bash
export AWS_PROFILE=genio

echo "=== Checking Instance Status ==="
aws ec2 describe-instances \
  --filters "Name=ip-address,Values=3.84.220.241" \
  --query "Reservations[*].Instances[*].[InstanceId,State.Name,PublicIpAddress,KeyName,ImageId]" \
  --output table

echo -e "\n=== Checking Key File ==="
if [ -f genio-worker.pem ]; then
    ls -la genio-worker.pem
    echo "Key file exists"
else
    echo "Key file NOT found!"
fi

echo -e "\n=== Trying SSH with verbose output ==="
ssh -v -i genio-worker.pem ec2-user@3.84.220.241 2>&1 | tail -20
```

## Most Likely Fix

**Try Ubuntu username first:**
```bash
ssh -i genio-worker.pem ubuntu@3.84.220.241
```

If that doesn't work, check the AMI type in AWS Console to determine the correct username.
