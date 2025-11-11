#!/bin/bash
set -e

# Step 1: Initialize Parquet files
if [ ! -f /app/output/VCdb.parquet ]; then
  echo "📦 Initializing Parquet files to /app/output..."
  cp /app/parquet-cache/*.parquet /app/output/
  cp /app/parquet-cache/*.duckdb /app/output/ 2>/dev/null || true
  echo "✅ Parquet files initialized successfully"
else
  echo "✅ Parquet files already exist, skipping initialization"
fi

# Step 2: Restore data from S3 if configured
if [ -n "$S3_BUCKET" ]; then
  echo "🔄 S3 sync enabled, checking for data to restore..."

  S3_PREFIX="${S3_PREFIX:-fullbay-output}"
  S3_TRANSFORMER_PATH="s3://${S3_BUCKET}/${S3_PREFIX}/transformer-output/"

  # Check if S3 path exists and has data
  if aws s3 ls "$S3_TRANSFORMER_PATH" >/dev/null 2>&1; then
    echo "📥 Restoring transformer output from S3..."
    echo "   Source: $S3_TRANSFORMER_PATH"
    echo "   Target: /app/output/"

    # Sync from S3 to local, exclude Parquet files
    if aws s3 sync "$S3_TRANSFORMER_PATH" /app/output/ \
      --exclude "*.parquet" \
      --exclude "*.duckdb" \
      --quiet; then
      echo "✅ Transformer output restored from S3"
    else
      echo "⚠️  S3 restore failed, continuing with empty output"
    fi
  else
    echo "ℹ️  No existing data found in S3, starting fresh"
  fi
else
  echo "ℹ️  S3 sync disabled (S3_BUCKET not configured)"
fi

# Start the application
exec node dist/server.js "$@"
