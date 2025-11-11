// Analytics data types
export interface OverviewData {
  totalEntities: number;
  entitiesWithAutocare: number;
  dataCompleteness: string;
  vehicleStats: {
    totalVehicles: number;
    matchedVehicles: number;
    matchRate: string;
    averageConfidence: string;
  };
  partsStats: {
    totalParts: number;
    matchedParts: number;
    matchRate: string;
    averageConfidence: string;
  };
  processingTime: number;
}

export interface VehicleMatchingData {
  totalVehicles: number;
  exactMatches: number;
  fuzzyMatches: number;
  noMatches: number;
  confidenceDistribution: Array<{
    entityId: string;
    confidence: number;
    vehicles: number;
  }>;
  failureReasons: Array<{
    reason: string;
    count: number;
  }>;
  brandYearHeatmap: Record<string, any>;
  matchRateDistribution: Array<{
    entityId: string;
    matchRate: number;
    totalVehicles: number;
  }>;
  failureAnalytics?: {
    uniqueFailureCount: number;
    topFailurePatterns: Array<{
      pattern: string;
      count: number;
      percentage: number;
    }>;
  };
  processingTime: number;
}

export interface PartsMatchingData {
  totalParts: number;
  matchedParts: number;
  exactMatches: number;
  fuzzyMatches: number;
  descriptionMatches: number;
  keywordMatches: number;
  noMatches: number;
  failureReasons: Array<{
    reason: string;
    count: number;
  }>;
  commonFailures: Array<{
    partName: string;
    count: number;
  }>;
  matchRateDistribution: Array<{
    entityId: string;
    matchRate: number;
    totalParts: number;
  }>;
  confidenceDistribution: Array<{
    entityId: string;
    confidence: number;
    parts: number;
  }>;
  processingTime: number;
}

export interface FilterOptions {
  entityIds?: string[];
  matchRateRange?: [number, number];
  confidenceRange?: [number, number];
  dateRange?: [Date, Date];
  searchTerm?: string;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  color?: string;
  [key: string]: any;
}

export interface AnalyticsState {
  overview: OverviewData | null;
  vehicleMatching: VehicleMatchingData | null;
  partsMatching: PartsMatchingData | null;
  loading: {
    overview: boolean;
    vehicleMatching: boolean;
    partsMatching: boolean;
  };
  error: string | null;
  lastUpdated: Date | null;
  filters: FilterOptions;
}
