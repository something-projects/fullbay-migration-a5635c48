/**
 * Strategy Manager
 * Orchestrates multiple matching strategies and combines their results
 */

import { IMatchingStrategy, MatchingContext, StrategyResult } from './IMatchingStrategy';
import { AutoCareData, StandardizedPart } from '../../types/AutoCareTypes';

export interface StrategyManagerConfig {
  enablePrioritization: boolean;
  maxStrategiesPerMatch: number;
  combineResults: boolean;
  confidenceThreshold: number;
  maxTotalCandidates: number;
}

export interface CombinedResult {
  candidates: StandardizedPart[];
  topConfidence: number;
  strategiesUsed: string[];
  totalAttempts: number;
  details: string[];
}

export class StrategyManager {
  private strategies: IMatchingStrategy[] = [];
  private config: StrategyManagerConfig;

  constructor(config?: Partial<StrategyManagerConfig>) {
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
   * Register a matching strategy
   */
  addStrategy(strategy: IMatchingStrategy): void {
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
  getStrategies(): IMatchingStrategy[] {
    return [...this.strategies];
  }

  /**
   * Execute matching using appropriate strategies
   */
  async executeMatching(
    context: MatchingContext, 
    autoCareData: AutoCareData
  ): Promise<CombinedResult> {
    const strategiesUsed: string[] = [];
    const allCandidates: StandardizedPart[] = [];
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
        console.warn(`Strategy ${strategy.name} failed:`, error);
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
  private combineAndRankCandidates(candidates: StandardizedPart[]): StandardizedPart[] {
    if (candidates.length === 0) return [];

    // Group by part ID and combine
    const partGroups = new Map<string, StandardizedPart[]>();
    
    for (const candidate of candidates) {
      const partId = candidate.partId || String(candidate.partTerminologyId || '');
      if (!partGroups.has(partId)) {
        partGroups.set(partId, []);
      }
      partGroups.get(partId)!.push(candidate);
    }

    // Create combined parts with best confidence
    const combinedParts: StandardizedPart[] = [];
    
    for (const [partId, parts] of partGroups) {
      if (parts.length === 1) {
        combinedParts.push(parts[0]);
      } else {
        // Combine multiple matches for the same part
        const bestPart = this.combineDuplicateParts(parts);
        combinedParts.push(bestPart);
      }
    }

    // Sort by confidence and limit
    return combinedParts
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, this.config.maxTotalCandidates);
  }

  /**
   * Combine multiple matches for the same part
   */
  private combineDuplicateParts(parts: StandardizedPart[]): StandardizedPart {
    // Use the part with highest confidence as base
    const basePart = parts.reduce((best, current) => 
      (current.confidence || 0) > (best.confidence || 0) ? current : best
    );

    // Combine match types and boost confidence slightly for multiple matches
    const matchTypes = [...new Set(parts.map(p => p.matchType || p.matchingMethod || 'unknown'))];
    const combinedConfidence = Math.min(
      (basePart.confidence || 0) * 1.1, // Small boost for multiple matches
      0.95
    );

    return {
      ...basePart,
      confidence: combinedConfidence,
      matchType: matchTypes.join('+'),
      attributes: {
        ...basePart.attributes,
        multipleMatches: true,
        matchCount: parts.length,
        allMatchTypes: matchTypes
      } as any
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
  updateConfig(config: Partial<StrategyManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): StrategyManagerConfig {
    return { ...this.config };
  }
}