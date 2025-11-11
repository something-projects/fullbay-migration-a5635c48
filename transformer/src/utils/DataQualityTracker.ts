/**
 * DataQualityTracker - Track data processing quality and skip statistics
 */

export interface DataIssue {
  type: 'missing_required' | 'invalid_format' | 'relationship_broken' | 'empty_value';
  entity: string;
  entityId: string | number;
  field: string;
  value: any;
  message: string;
  timestamp: string;
}

export interface ProcessingStats {
  totalRecords: number;
  processedRecords: number;
  skippedRecords: number;
  errorRecords: number;
  successRate: number;
}

export interface EntityStats {
  [entityName: string]: ProcessingStats;
}

export class DataQualityTracker {
  private issues: DataIssue[] = [];
  private entityStats: EntityStats = {};
  
  /**
   * Initialize entity statistics
   */
  initEntityStats(entityName: string): void {
    if (!this.entityStats[entityName]) {
      this.entityStats[entityName] = {
        totalRecords: 0,
        processedRecords: 0,
        skippedRecords: 0,
        errorRecords: 0,
        successRate: 0
      };
    }
  }

  /**
   * Record data issue
   */
  recordIssue(issue: Omit<DataIssue, 'timestamp'>): void {
    this.issues.push({
      ...issue,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Record missing required field
   */
  recordMissingRequired(entity: string, entityId: string | number, field: string, value: any): void {
    this.recordIssue({
      type: 'missing_required',
      entity,
      entityId,
      field,
      value,
      message: `Required field '${field}' is missing or null for ${entity} ${entityId}`
    });
  }

  /**
   * Record broken relationship data
   */
  recordBrokenRelationship(entity: string, entityId: string | number, field: string, foreignId: any): void {
    this.recordIssue({
      type: 'relationship_broken',
      entity,
      entityId,
      field,
      value: foreignId,
      message: `Foreign key '${field}' references non-existent record: ${foreignId} for ${entity} ${entityId}`
    });
  }

  /**
   * Update entity statistics - total count
   */
  incrementTotal(entityName: string, count: number = 1): void {
    this.initEntityStats(entityName);
    this.entityStats[entityName].totalRecords += count;
  }

  /**
   * Update entity statistics - successfully processed
   */
  incrementProcessed(entityName: string, count: number = 1): void {
    this.initEntityStats(entityName);
    this.entityStats[entityName].processedRecords += count;
    this.updateSuccessRate(entityName);
  }

  /**
   * Update entity statistics - skipped records
   */
  incrementSkipped(entityName: string, count: number = 1): void {
    this.initEntityStats(entityName);
    this.entityStats[entityName].skippedRecords += count;
    this.updateSuccessRate(entityName);
  }

  /**
   * Update entity statistics - error records
   */
  incrementError(entityName: string, count: number = 1): void {
    this.initEntityStats(entityName);
    this.entityStats[entityName].errorRecords += count;
    this.updateSuccessRate(entityName);
  }

  /**
   * Update success rate
   */
  private updateSuccessRate(entityName: string): void {
    const stats = this.entityStats[entityName];
    if (stats.totalRecords > 0) {
      stats.successRate = (stats.processedRecords / stats.totalRecords) * 100;
    }
  }

  /**
   * Check if field can be null
   */
  isFieldNullable(entityName: string, fieldName: string): boolean {
    // Define required field rules
    const requiredFields: { [entity: string]: string[] } = {
      'Entity': ['entityId', 'legalName'],
      'Customer': ['customerId', 'entityId', 'legalName'],
      'CustomerUnit': ['customerUnitId', 'customerId', 'number'],
      'RepairOrder': ['repairOrderId', 'customerId', 'customerUnitId']
    };

    const entityRequired = requiredFields[entityName] || [];
    return !entityRequired.includes(fieldName);
  }

  /**
   * Validate data integrity
   */
  validateRequiredField(entityName: string, entityId: string | number, fieldName: string, value: any): boolean {
    // Check if it's a required field
    if (!this.isFieldNullable(entityName, fieldName)) {
      if (value === null || value === undefined || value === '') {
        this.recordMissingRequired(entityName, entityId, fieldName, value);
        return false;
      }
    }
    return true;
  }

  /**
   * Validate entity integrity - check all required fields
   */
  validateEntity(entityName: string, entity: any): boolean {
    const entityId = entity[entityName.toLowerCase() + 'Id'] || entity.id || 'unknown';
    let isValid = true;

    // Get required fields list
    const requiredFields: { [entity: string]: string[] } = {
      'Entity': ['entityId', 'legalName'],
      'Customer': ['customerId', 'entityId', 'legalName'],
      'CustomerUnit': ['customerUnitId', 'customerId', 'number'],
      'RepairOrder': ['repairOrderId', 'customerId', 'customerUnitId']
    };

    const entityRequired = requiredFields[entityName] || [];
    
    for (const field of entityRequired) {
      if (!this.validateRequiredField(entityName, entityId, field, entity[field])) {
        isValid = false;
      }
    }

    return isValid;
  }

  /**
   * Get data quality report
   */
  getQualityReport(): {
    summary: {
      totalIssues: number;
      totalRecords: number;
      overallSuccessRate: number;
    };
    entityStats: EntityStats;
    issues: DataIssue[];
    issuesByType: { [type: string]: number };
  } {
    // Calculate overall statistics
    const totalRecords = Object.values(this.entityStats).reduce((sum, stats) => sum + stats.totalRecords, 0);
    const totalProcessed = Object.values(this.entityStats).reduce((sum, stats) => sum + stats.processedRecords, 0);
    const overallSuccessRate = totalRecords > 0 ? (totalProcessed / totalRecords) * 100 : 0;

    // Count issues by type
    const issuesByType = this.issues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {} as { [type: string]: number });

    return {
      summary: {
        totalIssues: this.issues.length,
        totalRecords,
        overallSuccessRate: Math.round(overallSuccessRate * 100) / 100
      },
      entityStats: this.entityStats,
      issues: this.issues,
      issuesByType
    };
  }

  /**
   * Generate data quality report string
   */
  generateReport(): string {
    const report = this.getQualityReport();
    
    let output = '\n📊 Data Quality Report\n';
    output += '========================\n\n';
    
    // Overall statistics
    output += `📈 Overall Statistics:\n`;
    output += `   Total Records: ${report.summary.totalRecords}\n`;
    output += `   Success Rate: ${report.summary.overallSuccessRate}%\n`;
    output += `   Total Issues: ${report.summary.totalIssues}\n\n`;

    // Statistics by entity
    output += `📋 Entity Statistics:\n`;
    for (const [entityName, stats] of Object.entries(report.entityStats)) {
      output += `   ${entityName}:\n`;
      output += `     Total: ${stats.totalRecords}\n`;
      output += `     Processed: ${stats.processedRecords}\n`;
      output += `     Skipped: ${stats.skippedRecords}\n`;
      output += `     Errors: ${stats.errorRecords}\n`;
      output += `     Success Rate: ${Math.round(stats.successRate * 100) / 100}%\n\n`;
    }

    // Issue type statistics
    if (Object.keys(report.issuesByType).length > 0) {
      output += `⚠️  Issues by Type:\n`;
      for (const [type, count] of Object.entries(report.issuesByType)) {
        output += `   ${type}: ${count}\n`;
      }
      output += '\n';
    }

    // Detailed issue list (showing first 10 only)
    if (report.issues.length > 0) {
      output += `🚨 Recent Issues (showing first 10):\n`;
      const recentIssues = report.issues.slice(0, 10);
      for (const issue of recentIssues) {
        output += `   [${issue.type}] ${issue.entity} ${issue.entityId}: ${issue.message}\n`;
      }
      if (report.issues.length > 10) {
        output += `   ... and ${report.issues.length - 10} more issues\n`;
      }
    }

    return output;
  }

  /**
   * Clear statistics data
   */
  reset(): void {
    this.issues = [];
    this.entityStats = {};
  }
}