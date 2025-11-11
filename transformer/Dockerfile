# syntax=docker/dockerfile:1
# Simple production-ish image for Transformer server
# Base on Debian to avoid musl issues with native deps like DuckDB
FROM node:20-bookworm-slim

WORKDIR /app/transformer

# Install basic tools for SSH tunnel stability and AWS CLI for S3 sync
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssh-client curl unzip \
  && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
  && unzip awscliv2.zip \
  && ./aws/install \
  && rm -rf awscliv2.zip aws \
  && rm -rf /var/lib/apt/lists/*

# Install deps
COPY transformer/package.json transformer/package-lock.json transformer/tsconfig.json ./
COPY transformer/scripts ./scripts
COPY transformer/src ./src

RUN npm ci

# Build TypeScript -> dist
RUN npm run build

# Copy AutoCare data and generate Parquet files to cache directory
COPY autocare-data /app/autocare-data
RUN mkdir -p /app/parquet-cache && \
    node scripts/build-parquet.js \
      --vcdb /app/autocare-data/VCdb \
      --pcdb /app/autocare-data/PCdb \
      --out /app/parquet-cache

# Copy and setup entrypoint script
COPY transformer/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production \
    OUTPUT_DIR=/app/output \
    PRETTY_JSON=false

# Shared volumes for data in/out
VOLUME ["/app/output", "/app/customer-output"]

EXPOSE 3001

# Use entrypoint script to initialize Parquet files on startup
ENTRYPOINT ["/docker-entrypoint.sh"]

