/**
 * Vehicle Strategy Manager
 * Orchestrates multiple vehicle matching strategies and combines their results
 */

import { IVehicleMatchingStrategy, VehicleMatchingContext, VehicleStrategyResult } from './IVehicleMatchingStrategy';
import { AutoCareData, StandardizedVehicle } from '../../types/AutoCareTypes';

export interface VehicleStrategyManagerConfig {
  enablePrioritization: boolean;
  maxStrategiesPerMatch: number;
  combineResults: boolean;
  confidenceThreshold: number;
  maxTotalCandidates: number;
}

export interface VehicleCombinedResult {
  candidates: StandardizedVehicle[];
  topConfidence: number;
  strategiesUsed: string[];
  totalAttempts: number;
  details: string[];
}

export class VehicleStrategyManager {
  private strategies: IVehicleMatchingStrategy[] = [];
  private config: VehicleStrategyManagerConfig;

  constructor(config?: Partial<VehicleStrategyManagerConfig>) {
    this.config = {
      enablePrioritization: true,
      maxStrategiesPerMatch: 5,
      combineResults: true,
      confidenceThreshold: 0.6,
      maxTotalCandidates: 10,
      ...config
    };
  }

  /**
   * Register a vehicle matching strategy
   */
  addStrategy(strategy: IVehicleMatchingStrategy): void {
    this.strategies.push(strategy);
    
    if (this.config.enablePrioritization) {
      // Sort strategies by priority (descending)
      this.strategies.sort((a, b) => b.priority - a.priority);
    }
  }

  /**
   * Remove a strategy by name
   */
  removeStrategy(strategyName: string): boolean {
    const initialLength = this.strategies.length;
    this.strategies = this.strategies.filter(s => s.name !== strategyName);
    return this.strategies.length < initialLength;
  }

  /**
   * Get all registered strategies
   */
  getStrategies(): IVehicleMatchingStrategy[] {
    return [...this.strategies];
  }

  /**
   * Execute vehicle matching using appropriate strategies
   */
  async executeMatching(
    context: VehicleMatchingContext, 
    autoCareData: AutoCareData
  ): Promise<VehicleCombinedResult> {
    const strategiesUsed: string[] = [];
    const allCandidates: StandardizedVehicle[] = [];
    const details: string[] = [];
    let totalAttempts = 0;

    // Filter strategies that can handle this context and are enabled
    const applicableStrategies = this.strategies
      .filter(s => s.enabled && s.canHandle(context))
      .slice(0, this.config.maxStrategiesPerMatch);

    if (applicableStrategies.length === 0) {
      return {
        candidates: [],
        topConfidence: 0,
        strategiesUsed: [],
        totalAttempts: 0,
        details: ['No applicable strategies found for the given context']
      };
    }

    // Execute strategies in priority order
    for (const strategy of applicableStrategies) {
      try {
        const result = await strategy.match(context, autoCareData);
        totalAttempts++;
        strategiesUsed.push(strategy.name);
        
        if (result.details) {
          details.push(`${strategy.name}: ${result.details}`);
        }

        if (result.matched && result.candidates.length > 0) {
          // Filter candidates by confidence threshold
          const qualifiedCandidates = result.candidates.filter(
            c => (c.confidence || 0) >= this.config.confidenceThreshold
          );

          if (qualifiedCandidates.length > 0) {
            allCandidates.push(...qualifiedCandidates);
            
            // If we have high-confidence results from a high-priority strategy,
            // we might stop early to avoid over-processing
            if (strategy.priority >= 90 && qualifiedCandidates[0].confidence! >= 0.9) {
              details.push(`Early exit: High confidence result from ${strategy.name}`);
              break;
            }
          }
        }
      } catch (error) {
        details.push(`${strategy.name}: Error - ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.warn(`Vehicle strategy ${strategy.name} failed:`, error);
      }
    }

    // Combine and deduplicate results
    const finalCandidates = this.config.combineResults 
      ? this.combineAndRankCandidates(allCandidates)
      : allCandidates.slice(0, this.config.maxTotalCandidates);

    const topConfidence = finalCandidates.length > 0 ? (finalCandidates[0].confidence || 0) : 0;

    return {
      candidates: finalCandidates,
      topConfidence,
      strategiesUsed,
      totalAttempts,
      details
    };
  }

  /**
   * Combine results from multiple strategies and eliminate duplicates
   */
  private combineAndRankCandidates(candidates: StandardizedVehicle[]): StandardizedVehicle[] {
    if (candidates.length === 0) return [];

    // Group by base vehicle ID and combine
    const vehicleGroups = new Map<number, StandardizedVehicle[]>();
    
    for (const candidate of candidates) {
      const baseVehicleId = candidate.baseVehicleId;
      if (!vehicleGroups.has(baseVehicleId)) {
        vehicleGroups.set(baseVehicleId, []);
      }
      vehicleGroups.get(baseVehicleId)!.push(candidate);
    }

    // Create combined vehicles with best confidence
    const combinedVehicles: StandardizedVehicle[] = [];
    
    for (const [baseVehicleId, vehicles] of vehicleGroups) {
      if (vehicles.length === 1) {
        combinedVehicles.push(vehicles[0]);
      } else {
        // Combine multiple matches for the same vehicle
        const bestVehicle = this.combineDuplicateVehicles(vehicles);
        combinedVehicles.push(bestVehicle);
      }
    }

    // Sort by confidence and limit
    return combinedVehicles
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, this.config.maxTotalCandidates);
  }

  /**
   * Combine multiple matches for the same vehicle
   */
  private combineDuplicateVehicles(vehicles: StandardizedVehicle[]): StandardizedVehicle {
    // Use the vehicle with highest confidence as base
    const baseVehicle = vehicles.reduce((best, current) => 
      (current.confidence || 0) > (best.confidence || 0) ? current : best
    );

    // Boost confidence slightly for multiple matches
    const combinedConfidence = Math.min(
      (baseVehicle.confidence || 0) * 1.05, // Small boost for multiple matches
      0.98
    );

    return {
      ...baseVehicle,
      confidence: combinedConfidence,
      // Add metadata about multiple matches
      ...(vehicles.length > 1 && {
        multipleMatches: true,
        matchCount: vehicles.length
      })
    };
  }

  /**
   * Enable or disable a strategy
   */
  toggleStrategy(strategyName: string, enabled: boolean): boolean {
    const strategy = this.strategies.find(s => s.name === strategyName);
    if (strategy) {
      strategy.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Update configuration for a specific strategy
   */
  updateStrategyConfig(strategyName: string, config: Record<string, any>): boolean {
    const strategy = this.strategies.find(s => s.name === strategyName);
    if (strategy) {
      strategy.updateConfig(config);
      return true;
    }
    return false;
  }

  /**
   * Get statistics about registered strategies
   */
  getStats() {
    const enabledStrategies = this.strategies.filter(s => s.enabled);
    const disabledStrategies = this.strategies.filter(s => !s.enabled);

    return {
      total: this.strategies.length,
      enabled: enabledStrategies.length,
      disabled: disabledStrategies.length,
      priorityOrder: this.strategies.map(s => ({
        name: s.name,
        priority: s.priority,
        enabled: s.enabled
      }))
    };
  }

  /**
   * Update manager configuration
   */
  updateConfig(config: Partial<VehicleStrategyManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): VehicleStrategyManagerConfig {
    return { ...this.config };
  }
}