# =============================================================================
# Fullbay Migration - Terraform Outputs
# =============================================================================

# -----------------------------------------------------------------------------
# EC2 Instance Information
# -----------------------------------------------------------------------------

output "ec2_instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.app.id
}

output "ec2_public_ip" {
  description = "EC2 public IP address (Elastic IP)"
  value       = aws_eip.app.public_ip
}

output "ec2_private_ip" {
  description = "EC2 private IP address"
  value       = aws_instance.app.private_ip
}

output "ec2_availability_zone" {
  description = "EC2 availability zone"
  value       = aws_instance.app.availability_zone
}

# -----------------------------------------------------------------------------
# SSH Access
# -----------------------------------------------------------------------------

output "ssh_private_key_path" {
  description = "Path to the SSH private key file"
  value       = local_file.private_key.filename
}

output "ssh_command" {
  description = "SSH command to connect to the EC2 instance"
  value       = "ssh -i ${local_file.private_key.filename} ubuntu@${aws_eip.app.public_ip}"
}

# -----------------------------------------------------------------------------
# Application URLs
# -----------------------------------------------------------------------------

output "transformer_url" {
  description = "Transformer API base URL"
  value       = "http://${aws_eip.app.public_ip}:3001"
}

output "transformer_health_url" {
  description = "Transformer health check URL"
  value       = "http://${aws_eip.app.public_ip}:3001/health"
}

output "onboarding_wizard_url" {
  description = "Onboarding Wizard URL"
  value       = "http://${aws_eip.app.public_ip}:4005"
}

output "dashboard_url" {
  description = "Dashboard URL"
  value       = "http://${aws_eip.app.public_ip}:5173"
}

# -----------------------------------------------------------------------------
# S3 Bucket
# -----------------------------------------------------------------------------

output "s3_bucket_name" {
  description = "S3 bucket name for data storage"
  value       = aws_s3_bucket.data.id
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.data.arn
}

output "s3_bucket_region" {
  description = "S3 bucket region"
  value       = aws_s3_bucket.data.region
}

# -----------------------------------------------------------------------------
# IAM Role
# -----------------------------------------------------------------------------

output "iam_role_name" {
  description = "IAM role name for EC2 instance"
  value       = aws_iam_role.ec2.name
}

output "iam_role_arn" {
  description = "IAM role ARN"
  value       = aws_iam_role.ec2.arn
}

# -----------------------------------------------------------------------------
# Database Connection
# -----------------------------------------------------------------------------

output "rds_endpoint" {
  description = "RDS endpoint address"
  value       = data.aws_db_instance.mysql.endpoint
}

output "rds_address" {
  description = "RDS hostname"
  value       = data.aws_db_instance.mysql.address
}

output "rds_port" {
  description = "RDS port"
  value       = data.aws_db_instance.mysql.port
}

# -----------------------------------------------------------------------------
# Security Groups
# -----------------------------------------------------------------------------

output "ec2_security_group_id" {
  description = "EC2 security group ID"
  value       = aws_security_group.ec2.id
}

# -----------------------------------------------------------------------------
# Quick Start Guide
# -----------------------------------------------------------------------------

output "quick_start" {
  description = "Quick start commands"
  value = <<-EOT

    ========================================
    Fullbay Migration - Quick Start Guide
    ========================================

    1. SSH into the instance:
       ${local_file.private_key.filename}
       ssh -i ${local_file.private_key.filename} ubuntu@${aws_eip.app.public_ip}

    2. Check Docker containers status:
       ssh -i ${local_file.private_key.filename} ubuntu@${aws_eip.app.public_ip} 'docker ps'

    3. View application logs:
       ssh -i ${local_file.private_key.filename} ubuntu@${aws_eip.app.public_ip} 'docker-compose -f /opt/fullbay-migration/docker-compose.yml logs -f'

    4. Access services:
       - Transformer API: http://${aws_eip.app.public_ip}:3001
       - Health Check:    http://${aws_eip.app.public_ip}:3001/health
       - Onboarding:      http://${aws_eip.app.public_ip}:4005
       - Dashboard:       http://${aws_eip.app.public_ip}:5173

    5. S3 data location:
       s3://${aws_s3_bucket.data.id}/${var.s3_prefix}/

    ========================================
  EOT
}

# -----------------------------------------------------------------------------
# Connection String for .env file
# -----------------------------------------------------------------------------

output "env_configuration" {
  description = "Environment variables for .env file"
  sensitive   = true
  value = {
    MYSQL_HOST     = data.aws_db_instance.mysql.address
    MYSQL_PORT     = data.aws_db_instance.mysql.port
    MYSQL_DATABASE = var.mysql_database
    MYSQL_USER     = var.mysql_user
    S3_BUCKET      = aws_s3_bucket.data.id
    S3_PREFIX      = var.s3_prefix
    AWS_REGION     = data.aws_region.current.name
    SSH_TUNNEL     = "false"
  }
}
