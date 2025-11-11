import { execSync } from 'child_process';

/**
 * S3 Sync Utility
 *
 * Provides simple S3 sync functionality using AWS CLI:
 * 1. After each entity is fully processed in transformer
 * 2. After user-validated data is exported in onboarding-wizard
 *
 * Configuration via environment variables:
 * - S3_BUCKET: S3 bucket name (required, sync disabled if not set)
 * - S3_PREFIX: Path prefix in S3 (optional, default: "fullbay-output")
 * - AWS_REGION: AWS region (optional, default: "us-east-1")
 * - AWS_ACCESS_KEY_ID: AWS credentials (required if S3_BUCKET is set)
 * - AWS_SECRET_ACCESS_KEY: AWS credentials (required if S3_BUCKET is set)
 */

export class S3Sync {
  private bucket: string | null = null;
  private prefix: string;
  private enabled: boolean;

  constructor() {
    this.bucket = process.env.S3_BUCKET || null;
    this.prefix = process.env.S3_PREFIX || 'fullbay-output';
    this.enabled = !!this.bucket;

    if (this.enabled) {
      console.log(`✅ S3 sync enabled: s3://${this.bucket}/${this.prefix}`);
    } else {
      console.log('ℹ️  S3 sync disabled (S3_BUCKET not configured)');
    }
  }

  /**
   * Check if S3 sync is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Sync a local directory to S3 using AWS CLI
   *
   * @param localDir - Absolute path to local directory
   * @param s3SubPath - Sub-path under S3_PREFIX (e.g., "transformer-output/123")
   * @param label - Optional label for logging
   */
  async syncDirectory(localDir: string, s3SubPath: string, label?: string): Promise<void> {
    if (!this.enabled || !this.bucket) {
      return;
    }

    const displayLabel = label || s3SubPath;
    const s3Path = `s3://${this.bucket}/${this.prefix}/${s3SubPath}/`;

    try {
      console.log(`📤 Syncing ${displayLabel} to S3...`);
      const startTime = Date.now();

      // Use AWS CLI for efficient sync
      execSync(`aws s3 sync "${localDir}" "${s3Path}" --quiet`, {
        stdio: 'inherit',
        env: process.env
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Synced to S3 in ${duration}s`);
    } catch (error) {
      console.error(`❌ S3 sync failed for ${displayLabel}:`, error);
      // Don't throw - sync failure should not break main processing
    }
  }
}

// Singleton instance
let s3SyncInstance: S3Sync | null = null;

/**
 * Get or create S3Sync singleton instance
 */
export function getS3Sync(): S3Sync {
  if (!s3SyncInstance) {
    s3SyncInstance = new S3Sync();
  }
  return s3SyncInstance;
}
