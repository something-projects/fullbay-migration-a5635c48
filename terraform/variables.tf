# =============================================================================
# Fullbay Migration - Terraform Variables
# =============================================================================

# -----------------------------------------------------------------------------
# AWS Configuration
# -----------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-west-2"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "fullbay-migration"
}

variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
  default     = "production"
}

# -----------------------------------------------------------------------------
# Network Configuration
# -----------------------------------------------------------------------------

variable "vpc_id" {
  description = "VPC ID to use. If empty, will use default VPC"
  type        = string
  default     = ""
}

variable "subnet_id" {
  description = "Subnet ID for EC2 instance. If empty, will use first available public subnet"
  type        = string
  default     = ""
}

variable "allowed_ssh_cidrs" {
  description = "CIDR blocks allowed to SSH into the EC2 instance"
  type        = list(string)
  default     = ["0.0.0.0/0"]  # WARNING: Restrict this in production!
}

variable "allowed_http_cidrs" {
  description = "CIDR blocks allowed to access HTTP services"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# -----------------------------------------------------------------------------
# EC2 Configuration
# -----------------------------------------------------------------------------

variable "instance_type" {
  description = "EC2 instance type for running Docker containers"
  type        = string
  default     = "t3.medium"

  validation {
    condition     = can(regex("^t3\\.(small|medium|large)|^m5\\.(large|xlarge)$", var.instance_type))
    error_message = "Instance type must be one of: t3.small, t3.medium, t3.large, m5.large, m5.xlarge"
  }
}

variable "volume_size" {
  description = "Root volume size in GB"
  type        = number
  default     = 50

  validation {
    condition     = var.volume_size >= 30 && var.volume_size <= 500
    error_message = "Volume size must be between 30 and 500 GB"
  }
}

variable "ami_id" {
  description = "AMI ID for EC2 instance. If empty, will use latest Ubuntu 22.04 LTS"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Database Configuration (RDS)
# -----------------------------------------------------------------------------

variable "rds_identifier" {
  description = "RDS instance identifier (existing database)"
  type        = string
  default     = "fullbayproduction-copy"
}

variable "mysql_user" {
  description = "MySQL username"
  type        = string
  sensitive   = true
}

variable "mysql_password" {
  description = "MySQL password"
  type        = string
  sensitive   = true
}

variable "mysql_database" {
  description = "MySQL database name"
  type        = string
  default     = "fullbay"
}

# -----------------------------------------------------------------------------
# S3 Configuration
# -----------------------------------------------------------------------------

variable "s3_bucket_name" {
  description = "S3 bucket name for storing transformer output (must be globally unique)"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.s3_bucket_name))
    error_message = "S3 bucket name must be lowercase, 3-63 characters, alphanumeric and hyphens only"
  }
}

variable "s3_prefix" {
  description = "S3 key prefix for organizing files"
  type        = string
  default     = "fullbay-output"
}

variable "s3_lifecycle_days" {
  description = "Number of days before transitioning to Glacier"
  type        = number
  default     = 90
}

# -----------------------------------------------------------------------------
# Application Configuration
# -----------------------------------------------------------------------------

variable "git_repo_url" {
  description = "Git repository URL (HTTPS) for the application code"
  type        = string
}

variable "git_branch" {
  description = "Git branch to checkout"
  type        = string
  default     = "main"
}

variable "docker_compose_file" {
  description = "Docker Compose file to use"
  type        = string
  default     = "docker-compose.yml"
}

# -----------------------------------------------------------------------------
# SSH Key Configuration
# -----------------------------------------------------------------------------

variable "ssh_key_name" {
  description = "Name for the SSH key pair (will be created if doesn't exist)"
  type        = string
  default     = "fullbay-migration-key"
}

# -----------------------------------------------------------------------------
# Tags
# -----------------------------------------------------------------------------

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
