/**
 * Base Matcher Class
 * Provides common functionality for all AutoCare matchers
 */

import { TextProcessor } from '../../utils/TextProcessor';
import { AutoCareData } from '../../types/AutoCareTypes';

export interface BaseMatchResult {
  matched: boolean;
  failureReason?: string;
  failureDetails?: string;
  attemptedMethods?: string[];
  searchTerms?: string[];
  confidenceScores?: Record<string, number>;
  originalData?: any;
}

export interface BaseMatchConfig {
  enableFuzzyMatch?: boolean;
  fuzzyThreshold?: number;
  enableCache?: boolean;
  cacheSize?: number;
  debugMode?: boolean;
}

/**
 * Abstract base class for all AutoCare matchers
 */
export abstract class BaseMatcher<TResult extends BaseMatchResult, TConfig extends BaseMatchConfig> {
  protected autoCareData: AutoCareData;
  protected config: TConfig;
  protected matchCache: Map<string, TResult>;
  protected maxCacheSize: number;

  constructor(autoCareData: AutoCareData, config: TConfig) {
    this.autoCareData = autoCareData;
    this.config = config;
    this.matchCache = new Map();
    this.maxCacheSize = config.cacheSize || 10000;
  }

  /**
   * Abstract method for specific matching logic
   */
  protected abstract performMatch(...args: any[]): TResult;

  /**
   * Get normalized cache key for consistent caching
   */
  protected getCacheKey(...args: any[]): string {
    return args
      .filter(arg => arg != null)
      .map(arg => {
        if (typeof arg === 'string' && arg.trim().length > 0) {
          return TextProcessor.normalize(arg);
        }
        return String(arg || '');
      })
      .join('|');
  }

  /**
   * Get cached result or perform match
   */
  protected getFromCacheOrMatch(cacheKey: string, matchFn: () => TResult): TResult {
    if (this.config.enableCache !== false && this.matchCache.has(cacheKey)) {
      return this.matchCache.get(cacheKey)!;
    }

    const result = matchFn();
    
    if (this.config.enableCache !== false) {
      this.setCacheEntry(cacheKey, result);
    }

    return result;
  }

  /**
   * Set cache entry with size management
   */
  protected setCacheEntry(key: string, result: TResult): void {
    // If cache is full, remove oldest entry (simple FIFO)
    if (this.matchCache.size >= this.maxCacheSize) {
      const firstKey = this.matchCache.keys().next().value;
      if (firstKey !== undefined) {
        this.matchCache.delete(firstKey);
      }
    }
    
    this.matchCache.set(key, result);
  }

  /**
   * Common text normalization
   */
  protected normalizeName(name: string): string {
    return TextProcessor.normalize(name);
  }

  /**
   * Calculate similarity between two strings
   */
  protected calculateSimilarity(str1: string, str2: string): number {
    return TextProcessor.calculateSimilarity(str1, str2);
  }

  /**
   * Calculate Levenshtein distance
   */
  protected levenshteinDistance(str1: string, str2: string): number {
    return TextProcessor.levenshteinDistance(str1, str2);
  }

  /**
   * Extract keywords from text
   */
  protected extractKeywords(text: string): string[] {
    return TextProcessor.extractKeywords(text);
  }

  /**
   * Check if text contains all required keywords
   */
  protected containsAllKeywords(text: string, keywords: string[]): boolean {
    return TextProcessor.containsAllKeywords(text, keywords);
  }

  /**
   * Find best match from candidates
   */
  protected findBestMatch<T extends { name?: string; title?: string }>(
    target: string,
    candidates: T[],
    minSimilarity: number = 0.7,
    nameExtractor?: (item: T) => string
  ): { item: T; similarity: number } | null {
    let bestMatch: { item: T; similarity: number } | null = null;
    
    for (const candidate of candidates) {
      const candidateName = nameExtractor 
        ? nameExtractor(candidate)
        : (candidate.name || candidate.title || '');
      
      if (!candidateName) continue;
      
      const similarity = this.calculateSimilarity(target, candidateName);
      
      if (similarity >= minSimilarity && 
          (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { item: candidate, similarity };
      }
    }
    
    return bestMatch;
  }

  /**
   * Create failure result with tracking information
   */
  protected createFailureResult(
    failureReason: string,
    failureDetails: string,
    attemptedMethods: string[] = [],
    searchTerms: string[] = [],
    confidenceScores: Record<string, number> = {},
    originalData?: any
  ): TResult {
    return {
      matched: false,
      failureReason,
      failureDetails,
      attemptedMethods,
      searchTerms,
      confidenceScores,
      originalData
    } as TResult;
  }

  /**
   * Log debug information if debug mode is enabled
   */
  protected debug(message: string, ...args: any[]): void {
    if (this.config.debugMode) {
      console.log(`[${this.constructor.name}] ${message}`, ...args);
    }
  }

  /**
   * Record method attempt for failure tracking
   */
  protected recordAttempt(
    attemptedMethods: string[], 
    methodName: string,
    searchTerms?: string[],
    confidenceScores?: Record<string, number>,
    searchTerm?: string,
    confidence?: number
  ): void {
    attemptedMethods.push(methodName);
    
    if (searchTerm && searchTerms) {
      searchTerms.push(searchTerm);
    }
    
    if (confidence !== undefined && confidenceScores && searchTerm) {
      confidenceScores[`${methodName}_${searchTerm}`] = confidence;
    }
  }

  /**
   * Try fuzzy matching with configurable threshold
   */
  protected tryFuzzyMatch<T>(
    target: string,
    candidates: Map<string, T> | T[],
    nameExtractor?: (item: T) => string,
    threshold?: number
  ): { item: T; similarity: number; key?: string } | null {
    if (!this.config.enableFuzzyMatch) {
      return null;
    }

    const fuzzyThreshold = threshold || this.config.fuzzyThreshold || 0.7;
    let bestMatch: { item: T; similarity: number; key?: string } | null = null;

    if (candidates instanceof Map) {
      for (const [key, candidate] of candidates) {
        const candidateName = nameExtractor ? nameExtractor(candidate) : key;
        const similarity = this.calculateSimilarity(target, candidateName);
        
        if (similarity >= fuzzyThreshold && 
            (!bestMatch || similarity > bestMatch.similarity)) {
          bestMatch = { item: candidate, similarity, key };
        }
      }
    } else {
      for (const candidate of candidates) {
        const candidateName = nameExtractor ? nameExtractor(candidate) : String(candidate);
        const similarity = this.calculateSimilarity(target, candidateName);
        
        if (similarity >= fuzzyThreshold && 
            (!bestMatch || similarity > bestMatch.similarity)) {
          bestMatch = { item: candidate, similarity };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.matchCache.size,
      maxSize: this.maxCacheSize,
      hitRate: this.getCacheHitRate()
    };
  }

  /**
   * Calculate cache hit rate (simplified tracking)
   */
  private getCacheHitRate(): number {
    // This is a simplified implementation
    // In production, you might want to track hits/misses separately
    return this.matchCache.size > 0 ? 0.8 : 0; // Placeholder
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.matchCache.clear();
  }

  /**
   * Get configuration
   */
  getConfig(): TConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Validate input parameters
   */
  protected validateInput(value: any, paramName: string, required: boolean = true): boolean {
    if (required && (value === null || value === undefined)) {
      this.debug(`Missing required parameter: ${paramName}`);
      return false;
    }
    
    if (typeof value === 'string' && value.trim().length === 0) {
      this.debug(`Empty string parameter: ${paramName}`);
      return false;
    }
    
    return true;
  }

  /**
   * Sanitize and prepare search terms
   */
  protected prepareSearchTerms(input: string): string[] {
    if (!input) return [];
    
    const normalized = this.normalizeName(input);
    const keywords = this.extractKeywords(normalized);
    
    // Remove very short or common terms
    return keywords.filter(keyword => 
      keyword.length > 2 && 
      !this.isCommonStopWord(keyword)
    );
  }

  /**
   * Check if word is a common stop word
   */
  private isCommonStopWord(word: string): boolean {
    const stopWords = new Set([
      'and', 'or', 'the', 'for', 'with', 'auto', 'part', 'parts',
      'oem', 'original', 'replacement', 'genuine', 'aftermarket'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Extract numeric values from text for technical specifications
   */
  protected extractNumericValues(text: string): number[] {
    return TextProcessor.extractNumbers(text);
  }

  /**
   * Check if two numeric values are approximately equal
   */
  protected approximatelyEqual(val1: number, val2: number, tolerance: number = 0.1): boolean {
    return Math.abs(val1 - val2) <= tolerance;
  }
}