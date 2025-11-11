#!/bin/bash
set -e

# Restore user-validated data from S3 if configured
if [ -n "$S3_BUCKET" ]; then
  echo "🔄 S3 sync enabled, checking for validated data to restore..."

  S3_PREFIX="${S3_PREFIX:-fullbay-output}"
  S3_CUSTOMER_PATH="s3://${S3_BUCKET}/${S3_PREFIX}/customer-output/"

  # Check if S3 path exists and has data
  if aws s3 ls "$S3_CUSTOMER_PATH" >/dev/null 2>&1; then
    echo "📥 Restoring customer validated data from S3..."
    echo "   Source: $S3_CUSTOMER_PATH"
    echo "   Target: /app/output/"

    # Sync from S3 to local (only user-validated directories)
    if aws s3 sync "$S3_CUSTOMER_PATH" /app/output/ \
      --exclude "*" \
      --include "*/user-validated/*" \
      --quiet; then
      echo "✅ Customer validated data restored from S3"
    else
      echo "⚠️  S3 restore failed, continuing without validated data"
    fi
  else
    echo "ℹ️  No existing validated data found in S3"
  fi
else
  echo "ℹ️  S3 sync disabled (S3_BUCKET not configured)"
fi

# Start the application
exec node dist/server/server/index.js "$@"
