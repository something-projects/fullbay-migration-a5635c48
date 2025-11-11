# =============================================================================
# Fullbay Migration - Main Terraform Configuration
# =============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(
      {
        Project     = var.project_name
        Environment = var.environment
        ManagedBy   = "Terraform"
      },
      var.tags
    )
  }
}

# =============================================================================
# Data Sources - Reference Existing Resources
# =============================================================================

# Get default VPC if vpc_id is not provided
data "aws_vpc" "selected" {
  id      = var.vpc_id != "" ? var.vpc_id : null
  default = var.vpc_id == "" ? true : null
}

# Get available subnets in the VPC
data "aws_subnets" "available" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.selected.id]
  }
}

# Get first available subnet if not specified
data "aws_subnet" "selected" {
  id = var.subnet_id != "" ? var.subnet_id : data.aws_subnets.available.ids[0]
}

# Get existing RDS instance
data "aws_db_instance" "mysql" {
  db_instance_identifier = var.rds_identifier
}

# Get latest Ubuntu 22.04 LTS AMI
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}

# Get current region
data "aws_region" "current" {}

# =============================================================================
# SSH Key Pair - Auto-generate
# =============================================================================

# Generate private key
resource "tls_private_key" "ssh" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

# Create AWS key pair
resource "aws_key_pair" "deployer" {
  key_name   = var.ssh_key_name
  public_key = tls_private_key.ssh.public_key_openssh

  tags = {
    Name = "${var.project_name}-key"
  }
}

# Save private key to local file
resource "local_file" "private_key" {
  content         = tls_private_key.ssh.private_key_pem
  filename        = "${path.module}/ssh-keys/${var.ssh_key_name}.pem"
  file_permission = "0600"
}

# =============================================================================
# S3 Bucket - Data Storage
# =============================================================================

resource "aws_s3_bucket" "data" {
  bucket = var.s3_bucket_name

  tags = {
    Name = "${var.project_name}-data"
  }
}

# Enable versioning
resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Enable encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle policy - transition to Glacier
resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    id     = "archive-old-data"
    status = "Enabled"

    transition {
      days          = var.s3_lifecycle_days
      storage_class = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# =============================================================================
# IAM Role - EC2 to S3 Access
# =============================================================================

# IAM role for EC2
resource "aws_iam_role" "ec2" {
  name = "${var.project_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ec2-role"
  }
}

# IAM policy for S3 access
resource "aws_iam_role_policy" "s3_access" {
  name = "${var.project_name}-s3-access"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.data.arn,
          "${aws_s3_bucket.data.arn}/*"
        ]
      }
    ]
  })
}

# IAM instance profile
resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.ec2.name

  tags = {
    Name = "${var.project_name}-ec2-profile"
  }
}

# =============================================================================
# Security Groups
# =============================================================================

# Security group for EC2 instance
resource "aws_security_group" "ec2" {
  name        = "${var.project_name}-ec2-sg"
  description = "Security group for Fullbay migration EC2 instance"
  vpc_id      = data.aws_vpc.selected.id

  # SSH access
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.allowed_ssh_cidrs
  }

  # Transformer API
  ingress {
    description = "Transformer API"
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = var.allowed_http_cidrs
  }

  # Onboarding Wizard
  ingress {
    description = "Onboarding Wizard"
    from_port   = 4005
    to_port     = 4005
    protocol    = "tcp"
    cidr_blocks = var.allowed_http_cidrs
  }

  # Dashboard
  ingress {
    description = "Dashboard"
    from_port   = 5173
    to_port     = 5173
    protocol    = "tcp"
    cidr_blocks = var.allowed_http_cidrs
  }

  # Outbound - allow all
  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ec2-sg"
  }
}

# Security group for RDS access (if RDS security group allows modification)
resource "aws_security_group_rule" "rds_from_ec2" {
  count = can(data.aws_db_instance.mysql.vpc_security_groups) ? 1 : 0

  type                     = "ingress"
  from_port                = 3306
  to_port                  = 3306
  protocol                 = "tcp"
  security_group_id        = try(data.aws_db_instance.mysql.vpc_security_groups[0], "")
  source_security_group_id = aws_security_group.ec2.id
  description              = "Allow MySQL access from migration EC2"
}

# =============================================================================
# EC2 Instance - Main Application Server
# =============================================================================

resource "aws_instance" "app" {
  ami                    = var.ami_id != "" ? var.ami_id : data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deployer.key_name
  subnet_id              = data.aws_subnet.selected.id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  root_block_device {
    volume_size           = var.volume_size
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true

    tags = {
      Name = "${var.project_name}-root-volume"
    }
  }

  user_data = templatefile("${path.module}/user-data.sh", {
    git_repo_url         = var.git_repo_url
    git_branch           = var.git_branch
    docker_compose_file  = var.docker_compose_file
    mysql_host           = data.aws_db_instance.mysql.address
    mysql_user           = var.mysql_user
    mysql_password       = var.mysql_password
    mysql_database       = var.mysql_database
    s3_bucket            = aws_s3_bucket.data.id
    s3_prefix            = var.s3_prefix
    aws_region           = data.aws_region.current.name
  })

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"  # IMDSv2
    http_put_response_hop_limit = 1
  }

  tags = {
    Name = "${var.project_name}-app"
  }

  depends_on = [
    aws_iam_role_policy.s3_access,
    aws_security_group.ec2
  ]
}

# Elastic IP for consistent public access
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Name = "${var.project_name}-eip"
  }
}
