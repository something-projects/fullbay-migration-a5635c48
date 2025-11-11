/**
 * Matching Strategy Interface
 * Defines the contract for all matching strategies
 */

import { AutoCareData, StandardizedPart, PartsMatchResult } from '../../types/AutoCareTypes';

export interface MatchingContext {
  title?: string;
  description?: string;
  shopNumber?: string;
  vendorNumber?: string;
  keywords?: string[];
  attributes?: Record<string, any>;
}

export interface StrategyResult {
  matched: boolean;
  candidates: StandardizedPart[];
  confidence: number;
  methodName: string;
  searchTerms: string[];
  details?: string;
}

/**
 * Base interface for all matching strategies
 */
export interface IMatchingStrategy {
  /**
   * Strategy name for identification
   */
  readonly name: string;

  /**
   * Strategy priority (higher = tried first)
   */
  readonly priority: number;

  /**
   * Whether this strategy is enabled
   */
  enabled: boolean;

  /**
   * Execute the matching strategy
   */
  match(context: MatchingContext, autoCareData: AutoCareData): Promise<StrategyResult>;

  /**
   * Check if this strategy can handle the given context
   */
  canHandle(context: MatchingContext): boolean;

  /**
   * Get strategy configuration
   */
  getConfig(): Record<string, any>;

  /**
   * Update strategy configuration
   */
  updateConfig(config: Record<string, any>): void;
}

/**
 * Abstract base class for matching strategies
 */
export abstract class BaseMatchingStrategy implements IMatchingStrategy {
  abstract readonly name: string;
  abstract readonly priority: number;
  
  protected config: Record<string, any>;
  public enabled: boolean = true;

  constructor(config: Record<string, any> = {}) {
    this.config = { ...this.getDefaultConfig(), ...config };
  }

  abstract match(context: MatchingContext, autoCareData: AutoCareData): Promise<StrategyResult>;
  abstract canHandle(context: MatchingContext): boolean;

  /**
   * Get default configuration for this strategy
   */
  protected getDefaultConfig(): Record<string, any> {
    return {};
  }

  /**
   * Get current configuration
   */
  getConfig(): Record<string, any> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Record<string, any>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Create a successful result
   */
  protected createSuccessResult(
    candidates: StandardizedPart[],
    confidence: number,
    searchTerms: string[],
    details?: string
  ): StrategyResult {
    return {
      matched: candidates.length > 0,
      candidates,
      confidence,
      methodName: this.name,
      searchTerms,
      details
    };
  }

  /**
   * Create a failed result
   */
  protected createFailureResult(
    searchTerms: string[],
    details?: string
  ): StrategyResult {
    return {
      matched: false,
      candidates: [],
      confidence: 0,
      methodName: this.name,
      searchTerms,
      details
    };
  }

  /**
   * Normalize text for matching
   */
  protected normalize(text: string): string {
    if (!text) return '';
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Extract keywords from text
   */
  protected extractKeywords(text: string): string[] {
    if (!text) return [];
    
    const normalized = this.normalize(text);
    const words = normalized.split(/\s+/).filter(word => 
      word.length > 2 && !this.isStopWord(word)
    );
    
    return [...new Set(words)];
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'or', 'for', 'with', 'auto', 'part', 'parts',
      'oem', 'original', 'replacement', 'genuine', 'aftermarket'
    ]);
    return stopWords.has(word.toLowerCase());
  }
}