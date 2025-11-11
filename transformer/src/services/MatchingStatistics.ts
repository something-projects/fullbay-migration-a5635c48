import { 
  VehicleMatchFailureReason, 
  PartsMatchFailureReason, 
  VehicleMatchResult, 
  PartsMatchResult 
} from '../types/AutoCareTypes';

// Statistics interfaces
export interface FailureSummary {
  reason: string;
  count: number;
  percentage: number;
  sampleDetails: string[];
}

export interface MatchingReport {
  totalAttempts: number;
  successfulMatches: number;
  failedMatches: number;
  successRate: number;
  
  vehicleStats: {
    totalAttempts: number;
    successfulMatches: number;
    failuresByReason: FailureSummary[];
    commonFailures: string[];
    averageConfidence: number;
  };
  
  partsStats: {
    totalAttempts: number;
    successfulMatches: number;
    failuresByReason: FailureSummary[];
    commonFailures: string[];
    averageConfidence: number;
  };
  
  performance: {
    averageProcessingTime: number;
    slowestOperations: { type: string; time: number; details: string }[];
  };
  
  recommendedImprovements: string[];
}

export interface FailureDetail {
  reason: string;
  details: string;
  searchTerms?: string[];
  attemptedMethods?: string[];
  timestamp: Date;
}

/**
 * Statistics collector for analyzing matching failures and success patterns
 * Helps identify areas for improvement in vehicle and parts matching
 */
export class MatchingStatistics {
  private vehicleFailures: Map<VehicleMatchFailureReason, FailureDetail[]> = new Map();
  private partsFailures: Map<PartsMatchFailureReason, FailureDetail[]> = new Map();
  private vehicleSuccesses: Array<{ confidence: number; methods: string[] }> = [];
  private partsSuccesses: Array<{ confidence: number; methods: string[] }> = [];
  private processingTimes: Array<{ type: string; time: number; details: string }> = [];
  
  private vehicleAttempts = 0;
  private partsAttempts = 0;

  /**
   * Record a vehicle matching failure
   */
  recordVehicleFailure(result: VehicleMatchResult): void {
    this.vehicleAttempts++;
    
    if (!result.matched && result.failureReason) {
      if (!this.vehicleFailures.has(result.failureReason)) {
        this.vehicleFailures.set(result.failureReason, []);
      }
      
      const failures = this.vehicleFailures.get(result.failureReason)!;
      failures.push({
        reason: result.failureReason,
        details: result.failureDetails || 'No details provided',
        attemptedMethods: result.attemptedMethods,
        timestamp: new Date()
      });
      
      // Keep only the last 100 failures per reason to prevent memory issues
      if (failures.length > 100) {
        failures.splice(0, failures.length - 100);
      }
    }
  }

  /**
   * Record a vehicle matching success
   */
  recordVehicleSuccess(result: VehicleMatchResult): void {
    this.vehicleAttempts++;
    
    if (result.matched && result.standardizedVehicle) {
      this.vehicleSuccesses.push({
        confidence: result.standardizedVehicle.confidence,
        methods: result.attemptedMethods || []
      });
    }
  }

  /**
   * Record a parts matching failure
   */
  recordPartsFailure(result: PartsMatchResult): void {
    this.partsAttempts++;
    
    if (!result.matched && result.failureReason) {
      if (!this.partsFailures.has(result.failureReason)) {
        this.partsFailures.set(result.failureReason, []);
      }
      
      const failures = this.partsFailures.get(result.failureReason)!;
      failures.push({
        reason: result.failureReason,
        details: result.failureDetails || 'No details provided',
        searchTerms: result.searchTerms,
        attemptedMethods: result.attemptedMethods,
        timestamp: new Date()
      });
      
      // Keep only the last 100 failures per reason to prevent memory issues
      if (failures.length > 100) {
        failures.splice(0, failures.length - 100);
      }
    }
  }

  /**
   * Record a parts matching success
   */
  recordPartsSuccess(result: PartsMatchResult): void {
    this.partsAttempts++;
    
    if (result.matched && result.standardizedPart) {
      this.partsSuccesses.push({
        confidence: result.standardizedPart.confidence || 0,
        methods: result.attemptedMethods || []
      });
    }
  }

  /**
   * Record processing time for performance analysis
   */
  recordProcessingTime(type: string, timeMs: number, details: string = ''): void {
    this.processingTimes.push({ type, time: timeMs, details });
    
    // Keep only the last 1000 entries
    if (this.processingTimes.length > 1000) {
      this.processingTimes.splice(0, this.processingTimes.length - 1000);
    }
  }

  /**
   * Generate comprehensive matching report
   */
  generateReport(): MatchingReport {
    const vehicleSuccessCount = this.vehicleSuccesses.length;
    const vehicleFailureCount = this.vehicleAttempts - vehicleSuccessCount;
    const partsSuccessCount = this.partsSuccesses.length;
    const partsFailureCount = this.partsAttempts - partsSuccessCount;
    
    const totalAttempts = this.vehicleAttempts + this.partsAttempts;
    const totalSuccesses = vehicleSuccessCount + partsSuccessCount;

    // Calculate vehicle failure summaries
    const vehicleFailuresByReason: FailureSummary[] = [];
    for (const [reason, failures] of this.vehicleFailures) {
      const count = failures.length;
      const percentage = this.vehicleAttempts > 0 ? (count / this.vehicleAttempts) * 100 : 0;
      const sampleDetails = failures.map(f => f.details);
      
      vehicleFailuresByReason.push({
        reason,
        count,
        percentage,
        sampleDetails
      });
    }
    vehicleFailuresByReason.sort((a, b) => b.count - a.count);

    // Calculate parts failure summaries
    const partsFailuresByReason: FailureSummary[] = [];
    for (const [reason, failures] of this.partsFailures) {
      const count = failures.length;
      const percentage = this.partsAttempts > 0 ? (count / this.partsAttempts) * 100 : 0;
      const sampleDetails = failures.map(f => f.details); 
      
      partsFailuresByReason.push({
        reason,
        count,
        percentage,
        sampleDetails
      });
    }
    partsFailuresByReason.sort((a, b) => b.count - a.count);

    // Calculate average confidence scores
    const vehicleAvgConfidence = this.vehicleSuccesses.length > 0 
      ? this.vehicleSuccesses.reduce((sum, s) => sum + s.confidence, 0) / this.vehicleSuccesses.length 
      : 0;
    
    const partsAvgConfidence = this.partsSuccesses.length > 0 
      ? this.partsSuccesses.reduce((sum, s) => sum + s.confidence, 0) / this.partsSuccesses.length 
      : 0;

    // Performance analysis
    const avgProcessingTime = this.processingTimes.length > 0 
      ? this.processingTimes.reduce((sum, p) => sum + p.time, 0) / this.processingTimes.length 
      : 0;
    
    const slowestOperations = [...this.processingTimes]
      .sort((a, b) => b.time - a.time)
      .slice(0, 50); // Show more slow operations

    // Generate improvement recommendations
    const recommendations = this.generateRecommendations(vehicleFailuresByReason, partsFailuresByReason);

    return {
      totalAttempts,
      successfulMatches: totalSuccesses,
      failedMatches: totalAttempts - totalSuccesses,
      successRate: totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 0,
      
      vehicleStats: {
        totalAttempts: this.vehicleAttempts,
        successfulMatches: vehicleSuccessCount,
        failuresByReason: vehicleFailuresByReason,
        commonFailures: vehicleFailuresByReason.map(f => f.reason),
        averageConfidence: vehicleAvgConfidence
      },
      
      partsStats: {
        totalAttempts: this.partsAttempts,
        successfulMatches: partsSuccessCount,
        failuresByReason: partsFailuresByReason,
        commonFailures: partsFailuresByReason.map(f => f.reason),
        averageConfidence: partsAvgConfidence
      },
      
      performance: {
        averageProcessingTime: avgProcessingTime,
        slowestOperations
      },
      
      recommendedImprovements: recommendations
    };
  }

  /**
   * Get the most common failure reasons across both vehicles and parts
   */
  getMostCommonFailures(): { vehicle: FailureSummary[], parts: FailureSummary[] } {
    const report = this.generateReport();
    return {
      vehicle: report.vehicleStats.failuresByReason,
      parts: report.partsStats.failuresByReason
    };
  }

  /**
   * Generate actionable improvement recommendations based on failure patterns
   */
  private generateRecommendations(vehicleFailures: FailureSummary[], partsFailures: FailureSummary[]): string[] {
    const recommendations: string[] = [];
    
    // Vehicle recommendations
    if (vehicleFailures.length > 0) {
      const topVehicleFailure = vehicleFailures[0];
      switch (topVehicleFailure.reason) {
        case VehicleMatchFailureReason.MAKE_NOT_IN_AUTOCARE:
          recommendations.push('Add more make synonyms and abbreviations to improve make matching');
          break;
        case VehicleMatchFailureReason.MODEL_NOT_IN_AUTOCARE:
          recommendations.push('Expand model name normalization and synonym mapping');
          break;
        case VehicleMatchFailureReason.INVALID_YEAR:
        case VehicleMatchFailureReason.YEAR_NOT_SUPPORTED:
          recommendations.push('Consider increasing year range tolerance or adding more vehicle years to database');
          break;
        case VehicleMatchFailureReason.LOW_CONFIDENCE:
          recommendations.push('Lower fuzzy matching threshold or improve text normalization');
          break;
      }
    }
    
    // Parts recommendations
    if (partsFailures.length > 0) {
      const topPartsFailure = partsFailures[0];
      switch (topPartsFailure.reason) {
        case PartsMatchFailureReason.EXACT_MATCH_FAILED:
          recommendations.push('Expand parts name synonyms and abbreviations database');
          break;
        case PartsMatchFailureReason.FUZZY_MATCH_FAILED:
          recommendations.push('Adjust fuzzy matching parameters for parts or improve text preprocessing');
          break;
        case PartsMatchFailureReason.ATTRIBUTE_MATCH_FAILED:
          recommendations.push('Enhance attribute extraction algorithms for better parts matching');
          break;
        case PartsMatchFailureReason.KEYWORD_SEARCH_FAILED:
          recommendations.push('Expand keyword matching dictionary with more part-specific terms');
          break;
      }
    }
    
    return recommendations;
  }

  /**
   * Clear all collected statistics
   */
  clear(): void {
    this.vehicleFailures.clear();
    this.partsFailures.clear();
    this.vehicleSuccesses = [];
    this.partsSuccesses = [];
    this.processingTimes = [];
    this.vehicleAttempts = 0;
    this.partsAttempts = 0;
  }

  /**
   * Export statistics to JSON for external analysis
   */
  exportToJson(): string {
    const report = this.generateReport();
    return JSON.stringify(report, null, 2);
  }
}