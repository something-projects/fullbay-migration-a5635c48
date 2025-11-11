# Fullbay Migration - Terraform Infrastructure

This directory contains Terraform configuration for deploying the Fullbay Migration infrastructure on AWS.

## Overview

Terraform will create and configure:

- **EC2 Instance**: Running Docker with the migration application
- **S3 Bucket**: For storing transformer output and customer data
- **IAM Role**: EC2 instance profile with S3 access permissions
- **Security Groups**: Network access control for EC2 and RDS
- **SSH Key Pair**: Auto-generated for secure instance access
- **Elastic IP**: Static public IP for consistent access

## Prerequisites

### Required Tools

```bash
# Terraform
terraform --version  # Requires >= 1.0

# AWS CLI (configured with credentials)
aws configure
aws sts get-caller-identity  # Verify access
```

### Required AWS Resources

The following resources must **already exist** (not created by Terraform):

1. **RDS Database**: MySQL instance for Fullbay data
   - Default identifier: `fullbayproduction-copy`
   - Can be customized via `rds_identifier` variable

2. **VPC** (Optional): Can use default VPC or specify existing one

## Quick Start

### 1. Clone and Navigate

```bash
cd terraform
```

### 2. Create Configuration

```bash
# Copy example configuration
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
vim terraform.tfvars
```

**Required variables to set:**
- `s3_bucket_name`: Globally unique S3 bucket name
- `git_repo_url`: Your git repository URL
- `mysql_user`: Database username
- `mysql_password`: Database password

### 3. Initialize Terraform

```bash
terraform init
```

### 4. Plan Deployment

```bash
# Preview what will be created
terraform plan
```

Review the plan carefully before proceeding.

### 5. Deploy Infrastructure

```bash
terraform apply
```

Type `yes` when prompted to confirm.

### 6. Get Connection Information

```bash
# Show all outputs
terraform output

# Get specific values
terraform output ec2_public_ip
terraform output ssh_command

# Quick start guide
terraform output -raw quick_start
```

### 7. Connect to Instance

```bash
# Extract SSH key
terraform output -raw ssh_private_key_path
# Output: terraform/ssh-keys/fullbay-migration-key.pem

# SSH into instance
ssh -i terraform/ssh-keys/fullbay-migration-key.pem ubuntu@$(terraform output -raw ec2_public_ip)
```

## Configuration Variables

### Essential Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `s3_bucket_name` | S3 bucket for data storage (must be unique) | `mycompany-fullbay-data` |
| `git_repo_url` | Git repository URL | `https://github.com/org/repo.git` |
| `mysql_user` | Database username | `admin` |
| `mysql_password` | Database password | `secret123` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `aws_region` | `us-west-2` | AWS region |
| `instance_type` | `t3.medium` | EC2 instance type |
| `volume_size` | `50` | Root volume size (GB) |
| `vpc_id` | `""` (default VPC) | VPC ID to use |
| `rds_identifier` | `fullbayproduction-copy` | Existing RDS instance |
| `git_branch` | `main` | Git branch to deploy |

See `variables.tf` for all available options.

## Application Deployment

### Automatic Setup

The EC2 instance automatically:

1. Installs Docker and Docker Compose
2. Installs AWS CLI
3. Clones your git repository
4. Creates `.env` file with database/S3 configuration
5. Runs `docker-compose up -d`
6. Creates systemd service for auto-restart

### Accessing Services

After deployment (wait ~5 minutes for setup):

```bash
# Get service URLs
INSTANCE_IP=$(terraform output -raw ec2_public_ip)

# Transformer API
curl http://$INSTANCE_IP:3001/health

# Onboarding Wizard
open http://$INSTANCE_IP:4005

# Dashboard
open http://$INSTANCE_IP:5173
```

## Monitoring and Management

### Check Application Status

```bash
# SSH into instance
ssh -i terraform/ssh-keys/fullbay-migration-key.pem ubuntu@$(terraform output -raw ec2_public_ip)

# Check Docker containers
docker ps

# View logs
docker-compose -f /opt/fullbay-migration/docker-compose.yml logs -f

# Run status script
/usr/local/bin/fullbay-status.sh
```

### View Setup Logs

```bash
# SSH into instance
ssh -i terraform/ssh-keys/fullbay-migration-key.pem ubuntu@$(terraform output -raw ec2_public_ip)

# Cloud-init logs (initialization)
sudo tail -f /var/log/cloud-init-output.log

# Application setup logs
sudo tail -f /var/log/fullbay-setup.log
```

### Restart Application

```bash
# SSH into instance
ssh -i terraform/ssh-keys/fullbay-migration-key.pem ubuntu@$(terraform output -raw ec2_public_ip)

# Restart containers
cd /opt/fullbay-migration
docker-compose down
docker-compose up -d

# Or use systemd
sudo systemctl restart fullbay-migration
```

## Updating Infrastructure

### Update Application Code

```bash
# SSH into instance
ssh -i terraform/ssh-keys/fullbay-migration-key.pem ubuntu@$(terraform output -raw ec2_public_ip)

# Pull latest code
cd /opt/fullbay-migration
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

### Update Infrastructure

```bash
# Modify terraform.tfvars or *.tf files
vim terraform.tfvars

# Plan changes
terraform plan

# Apply changes
terraform apply
```

## Remote State Management (Optional)

For team collaboration, use remote state with S3 + DynamoDB.

### Setup Remote State

```bash
# 1. Create S3 bucket
aws s3 mb s3://your-company-terraform-state --region us-west-2
aws s3api put-bucket-versioning \
  --bucket your-company-terraform-state \
  --versioning-configuration Status=Enabled

# 2. Create DynamoDB table
aws dynamodb create-table \
  --table-name terraform-state-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-west-2

# 3. Configure backend
cp backend.tf.example backend.tf
# Edit backend.tf with your bucket/table names

# 4. Migrate state
terraform init -migrate-state
```

## Cost Estimation

Approximate monthly costs (us-west-2):

| Resource | Configuration | Cost/month |
|----------|---------------|------------|
| EC2 t3.medium | 24/7 | ~$30 |
| EBS Volume | 50 GB gp3 | ~$4 |
| Elastic IP | Attached | $0 |
| S3 Storage | 100 GB | ~$2.30 |
| Data Transfer | Variable | ~$5-10 |
| **Total** | | **~$40-50** |

Cost optimization tips:
- Use smaller instance type (t3.small) if workload allows
- Enable S3 lifecycle rules (included by default)
- Stop EC2 when not in use (development environments)

## Troubleshooting

### SSH Connection Refused

```bash
# Check if instance is running
terraform output ec2_instance_id
aws ec2 describe-instance-status --instance-ids $(terraform output -raw ec2_instance_id)

# Check security group rules
aws ec2 describe-security-groups --group-ids $(terraform output -raw ec2_security_group_id)
```

### Application Not Starting

```bash
# SSH into instance and check logs
ssh -i terraform/ssh-keys/fullbay-migration-key.pem ubuntu@$(terraform output -raw ec2_public_ip)
sudo tail -f /var/log/cloud-init-output.log
docker ps -a
docker-compose logs
```

### Database Connection Issues

```bash
# Verify RDS security group allows EC2
# Check that EC2 security group is added to RDS ingress rules

# Test connection from EC2
ssh -i terraform/ssh-keys/fullbay-migration-key.pem ubuntu@$(terraform output -raw ec2_public_ip)
mysql -h $(terraform output -raw rds_address) -u <user> -p
```

### S3 Access Denied

```bash
# Verify IAM role is attached
terraform output iam_role_arn
aws iam get-role --role-name $(terraform output -raw iam_role_name)

# Check from EC2
ssh -i terraform/ssh-keys/fullbay-migration-key.pem ubuntu@$(terraform output -raw ec2_public_ip)
aws s3 ls s3://$(terraform output -raw s3_bucket_name)/
```

## Cleanup

### Destroy All Resources

```bash
# Preview what will be destroyed
terraform plan -destroy

# Destroy infrastructure
terraform destroy
```

**Warning**: This will permanently delete:
- EC2 instance
- Elastic IP
- SSH key pair
- Security groups
- IAM roles

**S3 bucket** requires manual deletion if it contains data:

```bash
# Empty bucket first
aws s3 rm s3://$(terraform output -raw s3_bucket_name) --recursive

# Then run terraform destroy again
terraform destroy
```

## Security Best Practices

### Production Deployment

Before deploying to production:

1. **Restrict SSH Access**:
   ```hcl
   allowed_ssh_cidrs = ["YOUR_IP/32"]  # Your office/VPN IP
   ```

2. **Restrict HTTP Access** (if applicable):
   ```hcl
   allowed_http_cidrs = ["YOUR_IP/32"]
   ```

3. **Use Remote State**:
   - Configure S3 backend for team collaboration
   - Enable state encryption

4. **Rotate SSH Keys**:
   ```bash
   terraform taint tls_private_key.ssh
   terraform apply
   ```

5. **Enable CloudWatch Monitoring**:
   - EC2 detailed monitoring
   - Log aggregation
   - Alerts for critical metrics

6. **Regular Backups**:
   - S3 versioning (enabled by default)
   - EBS snapshots
   - RDS automated backups

## Support

For issues or questions:

1. Check `/var/log/cloud-init-output.log` on EC2
2. Check `/var/log/fullbay-setup.log` on EC2
3. Review Terraform output: `terraform output`
4. Check application logs: `docker-compose logs`

## File Structure

```
terraform/
├── main.tf                   # Main infrastructure configuration
├── variables.tf              # Variable definitions
├── outputs.tf                # Output values
├── user-data.sh              # EC2 initialization script
├── terraform.tfvars.example  # Configuration example
├── backend.tf.example        # Remote state example
├── .gitignore                # Git ignore rules
├── README.md                 # This file
└── ssh-keys/                 # Generated SSH keys (gitignored)
    └── fullbay-migration-key.pem
```
