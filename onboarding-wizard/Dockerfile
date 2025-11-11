# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

WORKDIR /app/onboarding-wizard

# Install AWS CLI for S3 sync
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
  && unzip awscliv2.zip \
  && ./aws/install \
  && rm -rf awscliv2.zip aws \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build client and server
RUN npm run build

# Copy and setup entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Shared volumes for data in/out
VOLUME ["/app/output", "/app/customer-output"]

ENV NODE_ENV=production \
    PORT=4005

EXPOSE 4005

ENTRYPOINT ["/docker-entrypoint.sh"]
