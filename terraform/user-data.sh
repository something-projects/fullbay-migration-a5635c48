#!/bin/bash
# =============================================================================
# Fullbay Migration - EC2 User Data Script
# Automatically sets up Docker and runs the application
# =============================================================================

set -e  # Exit on error
set -x  # Print commands (for debugging in /var/log/cloud-init-output.log)

# -----------------------------------------------------------------------------
# Configuration (injected by Terraform)
# -----------------------------------------------------------------------------

GIT_REPO_URL="${git_repo_url}"
GIT_BRANCH="${git_branch}"
DOCKER_COMPOSE_FILE="${docker_compose_file}"
MYSQL_HOST="${mysql_host}"
MYSQL_USER="${mysql_user}"
MYSQL_PASSWORD="${mysql_password}"
MYSQL_DATABASE="${mysql_database}"
S3_BUCKET="${s3_bucket}"
S3_PREFIX="${s3_prefix}"
AWS_REGION="${aws_region}"

APP_DIR="/opt/fullbay-migration"
LOG_FILE="/var/log/fullbay-setup.log"

# -----------------------------------------------------------------------------
# Logging Function
# -----------------------------------------------------------------------------

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# -----------------------------------------------------------------------------
# System Update
# -----------------------------------------------------------------------------

log "Starting Fullbay Migration setup..."
log "Updating system packages..."

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

# -----------------------------------------------------------------------------
# Install Docker
# -----------------------------------------------------------------------------

log "Installing Docker..."

# Install prerequisites
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    jq \
    unzip

# Add Docker GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start Docker service
systemctl enable docker
systemctl start docker

# Add ubuntu user to docker group
usermod -aG docker ubuntu

log "Docker installed successfully"
docker --version
docker compose version

# -----------------------------------------------------------------------------
# Install AWS CLI (if not already installed)
# -----------------------------------------------------------------------------

log "Installing AWS CLI..."

if ! command -v aws &> /dev/null; then
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"
    unzip -q /tmp/awscliv2.zip -d /tmp
    /tmp/aws/install
    rm -rf /tmp/awscliv2.zip /tmp/aws
fi

log "AWS CLI installed"
aws --version

# -----------------------------------------------------------------------------
# Clone Application Repository
# -----------------------------------------------------------------------------

log "Cloning application repository..."

mkdir -p "$APP_DIR"
cd /opt

if [ ! -d "$APP_DIR/.git" ]; then
    git clone --branch "$GIT_BRANCH" "$GIT_REPO_URL" "$APP_DIR"
else
    cd "$APP_DIR"
    git pull origin "$GIT_BRANCH"
fi

cd "$APP_DIR"
log "Repository cloned to $APP_DIR"

# -----------------------------------------------------------------------------
# Create .env File
# -----------------------------------------------------------------------------

log "Creating .env file..."

cat > "$APP_DIR/.env" <<EOF
# Database Configuration (Direct RDS Connection)
MYSQL_HOST=$MYSQL_HOST
MYSQL_USER=$MYSQL_USER
MYSQL_PASSWORD=$MYSQL_PASSWORD
MYSQL_DATABASE=$MYSQL_DATABASE
SSH_TUNNEL=false

# S3 Configuration (Uses EC2 IAM Role)
S3_BUCKET=$S3_BUCKET
S3_PREFIX=$S3_PREFIX
AWS_REGION=$AWS_REGION

# Application Configuration
OUTPUT_DIR=/app/output
PRETTY_JSON=false
EOF

chmod 600 "$APP_DIR/.env"
chown ubuntu:ubuntu "$APP_DIR/.env"

log ".env file created"

# -----------------------------------------------------------------------------
# Create Docker Compose Override (if needed)
# -----------------------------------------------------------------------------

log "Setting up Docker Compose configuration..."

# Ensure output directories exist
mkdir -p "$APP_DIR/output"
mkdir -p "$APP_DIR/customer-output"
chown -R ubuntu:ubuntu "$APP_DIR"

# -----------------------------------------------------------------------------
# Pull Docker Images
# -----------------------------------------------------------------------------

log "Pulling Docker images..."
cd "$APP_DIR"
docker compose -f "$DOCKER_COMPOSE_FILE" pull || log "Failed to pull images (will build instead)"

# -----------------------------------------------------------------------------
# Start Application
# -----------------------------------------------------------------------------

log "Starting application with Docker Compose..."
cd "$APP_DIR"

# Build and start services
docker compose -f "$DOCKER_COMPOSE_FILE" up -d --build

log "Docker Compose started successfully"

# -----------------------------------------------------------------------------
# Create Systemd Service for Auto-restart
# -----------------------------------------------------------------------------

log "Creating systemd service..."

cat > /etc/systemd/system/fullbay-migration.service <<EOF
[Unit]
Description=Fullbay Migration Docker Compose Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker compose -f $DOCKER_COMPOSE_FILE up -d
ExecStop=/usr/bin/docker compose -f $DOCKER_COMPOSE_FILE down
User=ubuntu
Group=ubuntu

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable fullbay-migration.service

log "Systemd service created and enabled"

# -----------------------------------------------------------------------------
# Setup Log Rotation
# -----------------------------------------------------------------------------

log "Setting up log rotation..."

cat > /etc/logrotate.d/fullbay-migration <<EOF
$LOG_FILE {
    weekly
    rotate 4
    compress
    missingok
    notifempty
    create 0644 root root
}
EOF

# -----------------------------------------------------------------------------
# Setup Monitoring Script
# -----------------------------------------------------------------------------

log "Creating monitoring script..."

cat > /usr/local/bin/fullbay-status.sh <<'EOF'
#!/bin/bash
echo "=========================================="
echo "Fullbay Migration - System Status"
echo "=========================================="
echo ""
echo "Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Disk Usage:"
df -h /opt/fullbay-migration
echo ""
echo "Recent Logs:"
docker compose -f /opt/fullbay-migration/docker-compose.yml logs --tail=20
EOF

chmod +x /usr/local/bin/fullbay-status.sh

log "Monitoring script created: /usr/local/bin/fullbay-status.sh"

# -----------------------------------------------------------------------------
# Wait for Services to be Ready
# -----------------------------------------------------------------------------

log "Waiting for services to be ready..."
sleep 30

# Check if transformer is responding
for i in {1..10}; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health | grep -q "200"; then
        log "Transformer service is healthy!"
        break
    else
        log "Waiting for transformer service... (attempt $i/10)"
        sleep 10
    fi
done

# -----------------------------------------------------------------------------
# Final Status
# -----------------------------------------------------------------------------

log "==========================================  "
log "Setup completed successfully!"
log "=========================================="
log ""
log "Application directory: $APP_DIR"
log "Environment file: $APP_DIR/.env"
log "Docker Compose file: $APP_DIR/$DOCKER_COMPOSE_FILE"
log ""
log "Check status with: /usr/local/bin/fullbay-status.sh"
log "View logs: docker compose -f $APP_DIR/$DOCKER_COMPOSE_FILE logs -f"
log ""
log "Services:"
log "  - Transformer:       http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3001"
log "  - Onboarding Wizard: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):4005"
log "  - Dashboard:         http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):5173"
log ""
log "=========================================="

# Create status file
echo "SETUP_COMPLETED=$(date)" > /var/lib/cloud/instance/fullbay-setup-complete

log "User data script completed successfully"
