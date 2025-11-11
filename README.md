# Fullbay Data Migration Tools

Dockerized data processing pipeline for Fullbay customer migrations.

## Components

- **transformer**: Data processing service (port 3001)
- **dashboard**: Data visualization frontend (port 3002)
- **onboarding-wizard**: Customer onboarding UI (port 3005/4005)

## Setup

### 1. Install dependencies

```bash
# Install transformer dependencies
cd transformer && pnpm install

# Install dashboard dependencies
cd ../dashboard && pnpm install

# Install onboarding-wizard dependencies
cd ../onboarding-wizard && pnpm install
```

### 2. Prepare AutoCare Data

Copy AutoCare source data to the `autocare-data/` directory:

```bash
# Copy VCdb JSON files
cp -r /path/to/AutoCare_VCdb_*/*.json autocare-data/VCdb/

# Copy PCdb JSON files
cp -r /path/to/AutoCare_PCdb_*/*.json autocare-data/PCdb/
```

**Note**: Parquet files will be automatically generated during Docker build. No manual build step required.

### 3. Run with Docker

#### AWS Production Deployment

AWS deployment uses IAM Role for S3 access, no static credentials needed:

```bash
# 1. Configure environment variables
cp .env.aws.example .env
# Edit .env to set RDS endpoint and S3 bucket

# 2. Start services (simple command)
docker-compose up -d

# 3. View logs
docker-compose logs -f

# 4. Stop services
docker-compose down
```

**Requirements**:
- EC2 instance with attached IAM Role having S3 read/write permissions
- RDS accessible within the same VPC
- Environment variables only need database and S3 bucket configuration

#### Local Development

Local development requires SSH tunnel and AWS static credentials:

```bash
# 1. Ensure .env contains all local development configuration
#    (SSH_TUNNEL, REMOTE_HOST, AWS_ACCESS_KEY_ID, etc.)

# 2. Start services (requires specifying both config files)
docker-compose -f docker-compose.yml -f docker-compose.local.yml up -d

# 3. View logs
docker-compose -f docker-compose.yml -f docker-compose.local.yml logs -f

# 4. Stop services
docker-compose -f docker-compose.yml -f docker-compose.local.yml down
```

**Simplified Commands** (optional):

```bash
# Create shell alias
alias dc-local='docker-compose -f docker-compose.yml -f docker-compose.local.yml'

# Use simplified commands
dc-local up -d
dc-local logs -f
dc-local down
```

## AutoCare Data

Parquet files are automatically generated during Docker build and initialized on container startup:

**Build Stage**:
- Reads AutoCare source data from `autocare-data/` directory (~500MB JSON files)
- Generates optimized Parquet files using DuckDB (~70MB total)
- Caches Parquet files in `/app/parquet-cache` within the image
- **Deletes source JSON files** to minimize image size

**Runtime Stage**:
- **First startup**: Automatically copies Parquet files from cache to `/app/output` volume
- **Subsequent startups**: Detects existing files and skips initialization (milliseconds)
- Files are persisted on host in `./output/` directory

**Generated Parquet files**:
- `VCdb.parquet` - Vehicle configuration database (3.1MB)
- `VCdb_keys.parquet` - Vehicle key variants index (12MB)
- `PCdb.parquet` - Parts classification database (1.7MB)
- `PCdb_enriched.parquet` - Parts with aliases, descriptions, relationships (4.1MB)
- `PCdb_tokens.parquet` - Parts search token index (1.1MB)
- `autocare.duckdb` - DuckDB database file (50MB)

**Image size impact**: +70MB (Parquet only), source data not retained in image.

## Development

### Run services locally (without Docker)

```bash
# Terminal 1: Transformer
cd transformer
pnpm build
pnpm server

# Terminal 2: Dashboard
cd dashboard
pnpm dev

# Terminal 3: Onboarding Wizard
cd onboarding-wizard
pnpm dev
```

### Environment Variables

Environment variable configuration differs by deployment environment:

#### AWS Production (`.env` - based on `.env.aws.example`)

```bash
# Database configuration (RDS in VPC)
MYSQL_HOST=your-rds-endpoint.rds.amazonaws.com
MYSQL_USER=your-username
MYSQL_PASSWORD=your-password
MYSQL_DATABASE=fullbay

# S3 configuration (uses IAM Role, no credentials needed)
S3_BUCKET=your-bucket-name
S3_PREFIX=fullbay-output
AWS_REGION=us-east-1
# Note: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not needed
```

#### Local Development (`.env` - full configuration)

```bash
# Database configuration (remote RDS)
MYSQL_HOST=your-database-host
MYSQL_USER=your-username
MYSQL_PASSWORD=your-password
MYSQL_DATABASE=fullbay

# SSH tunnel (required for local development)
SSH_TUNNEL=true
SSH_TUNNEL_PORT=55306
REMOTE_HOST=gateway-server
REMOTE_USER=ssh-username
SSH_PASSWORD=ssh-password

# S3 configuration (local uses static credentials)
S3_BUCKET=your-bucket-name
S3_PREFIX=fullbay-output
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Architecture

```
fullbay-migration/
├── dashboard/                  # React frontend for data visualization
│   ├── Dockerfile
│   └── src/
├── transformer/                # Data processing backend
│   ├── Dockerfile
│   ├── scripts/
│   │   └── build-parquet.js
│   └── src/
├── onboarding-wizard/          # Customer onboarding UI
│   ├── Dockerfile
│   ├── server/                # Express backend
│   └── src/                   # React frontend
├── autocare-data/             # Parquet files (generated)
│   ├── VCdb.parquet
│   ├── PCdb_enriched.parquet
│   └── ...
├── scripts/                   # Utility scripts
├── docker-compose.yml         # AWS production configuration (default)
├── docker-compose.local.yml   # Local development override
├── .env                       # Environment variables (local development)
└── .env.aws.example          # AWS environment variables template
```

## S3 Sync (Optional)

The system supports **bi-directional automatic syncing** with Amazon S3 for data persistence and disaster recovery:

### How It Works

**Bi-Directional Sync** - Data flows both ways between local storage and S3:

#### 📥 Container Startup (S3 → Local)
1. **Transformer**: Restores all entity data from `s3://.../transformer-output/` to `/app/output/`
2. **Onboarding Wizard**: Restores user-validated data from `s3://.../customer-output/` to `/app/output/`

#### 📤 Processing Complete (Local → S3)
1. **Transformer Output**: When each entity completes processing, its full directory (`output/{entityId}/`) is synced to S3
2. **User-Validated Data**: When onboarding review is completed, validated data (`output/{entityId}/user-validated/`) is synced to S3

**Benefits**: EC2 container restarts won't lose data - everything automatically restores from S3

### Configuration

Set these environment variables in your `.env` file:

```bash
S3_BUCKET=your-bucket-name          # Required to enable S3 sync
S3_PREFIX=fullbay-output            # Optional, default: "fullbay-output"
AWS_REGION=us-east-1                # Optional, default: "us-east-1"
AWS_ACCESS_KEY_ID=your-access-key   # Required if S3_BUCKET is set
AWS_SECRET_ACCESS_KEY=your-secret   # Required if S3_BUCKET is set
```

**To disable S3 sync**: Simply leave `S3_BUCKET` empty or remove it from `.env`

### S3 Structure

```
s3://your-bucket/fullbay-output/
├── transformer-output/
│   ├── 1/                    # Entity 1 data
│   │   ├── entity.json
│   │   ├── customers/
│   │   └── service-orders/
│   ├── 2/                    # Entity 2 data
│   └── ...
└── customer-output/
    └── {entityId}/
        └── user-validated/   # User-reviewed data from onboarding
            ├── customers/
            ├── parts.json
            └── review-summary.json
```

### Features

- ✅ **Bi-directional sync** - automatic backup on completion, automatic restore on startup
- ✅ **Disaster recovery** - container restarts on EC2 recover data from S3
- ✅ **Non-blocking** - sync failures won't interrupt processing or prevent startup
- ✅ **Incremental** - only syncs changed files
- ✅ **Optional** - easily enabled/disabled via environment variables

### Disaster Recovery

If your EC2 instance or containers restart:

1. **Transformer container** starts and automatically restores all processed entity data from S3
2. **Onboarding-wizard container** starts and automatically restores all user-validated data from S3
3. Work continues from where it left off - no data loss

**Note**: Parquet files are never synced to S3 (they're regenerated on first startup and cached in the image)

## Troubleshooting

### Parquet files not initialized
- **First startup**: Container automatically copies Parquet files to `./output/` directory
- **Check logs**: Look for "📦 Initializing Parquet files to /app/output..."
- **Reinitialize**: Delete `./output/*.parquet` and restart container
- **Verify files**: Run `docker exec transformer ls -lh /app/output/`

### Docker build fails
- Ensure AutoCare source data is in `autocare-data/VCdb/` and `autocare-data/PCdb/`
- Check that `autocare-data/` contains required JSON files (Make.json, Model.json, etc.)
- Verify sufficient disk space (~1GB for build process)

### Docker build slow
- First build generates Parquet files (~1-3 minutes)
- Subsequent builds use layer cache (much faster)
- Image size: ~1GB total (includes Node.js base + dependencies + Parquet)

### Services can't connect
- Check port conflicts (3001, 3002, 3005, 4005)
- Verify Docker network configuration
- Check environment variables in docker-compose.yml
- Ensure SSH tunnel credentials are correct (if using remote database)
