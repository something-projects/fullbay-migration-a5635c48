/**
 * Vehicle Matching Strategy Interface
 * Defines the contract for vehicle matching strategies
 */

import { AutoCareData, StandardizedVehicle, VehicleMatchResult } from '../../types/AutoCareTypes';

export interface VehicleMatchingContext {
  make?: string;
  model?: string;
  year?: number;
  subModel?: string;
  engineInfo?: string;
  transmissionInfo?: string;
  bodyInfo?: string;
  vin?: string;
  entityId?: number;
}

export interface VehicleStrategyResult {
  matched: boolean;
  candidates: StandardizedVehicle[];
  confidence: number;
  details?: string;
}

export interface IVehicleMatchingStrategy {
  readonly name: string;
  readonly priority: number;
  enabled: boolean;

  /**
   * Check if this strategy can handle the given context
   */
  canHandle(context: VehicleMatchingContext): boolean;

  /**
   * Execute the matching strategy
   */
  match(context: VehicleMatchingContext, autoCareData: AutoCareData): Promise<VehicleStrategyResult>;

  /**
   * Update strategy configuration
   */
  updateConfig(config: Record<string, any>): void;
}

/**
 * Base class for vehicle matching strategies
 */
export abstract class BaseVehicleMatchingStrategy implements IVehicleMatchingStrategy {
  abstract readonly name: string;
  abstract readonly priority: number;
  public enabled: boolean = true;
  protected config: Record<string, any> = {};

  protected getDefaultConfig(): Record<string, any> {
    return {};
  }

  constructor(config?: Record<string, any>) {
    this.config = { ...this.getDefaultConfig(), ...config };
  }

  abstract canHandle(context: VehicleMatchingContext): boolean;
  abstract match(context: VehicleMatchingContext, autoCareData: AutoCareData): Promise<VehicleStrategyResult>;

  updateConfig(config: Record<string, any>): void {
    this.config = { ...this.config, ...config };
  }

  protected createSuccessResult(
    candidates: StandardizedVehicle[],
    confidence: number,
    details?: string
  ): VehicleStrategyResult {
    return {
      matched: candidates.length > 0,
      candidates,
      confidence,
      details
    };
  }

  protected createFailureResult(details?: string): VehicleStrategyResult {
    return {
      matched: false,
      candidates: [],
      confidence: 0,
      details
    };
  }

  protected createStandardizedVehicle(
    makeId: number,
    makeName: string,
    modelId: number,
    modelName: string,
    year: number,
    baseVehicleId: number,
    confidence: number,
    vehicleId?: number,
    subModelId?: number,
    subModelName?: string
  ): StandardizedVehicle {
    return {
      makeId,
      makeName,
      modelId,
      modelName,
      year,
      baseVehicleId,
      vehicleId,
      subModelId,
      subModelName,
      confidence
    };
  }

  protected normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  protected calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    const maxLength = Math.max(str1.length, str2.length);
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLength);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(0).map(() => Array(str1.length + 1).fill(0));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1,     // deletion
          matrix[j][i - 1] + 1,     // insertion
          matrix[j - 1][i - 1] + cost // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}