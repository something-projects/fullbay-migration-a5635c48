import {
  StandardizedPart,
  PartsMatchResult,
  PartsMatchConfig,
  PartsMatchFailureReason
} from '../types/AutoCareTypes';
import { UnifiedMatcher, UnifiedMatcherConfig } from './UnifiedMatcher';
import { AutoCareDataLoader } from './AutoCareDataLoader';
import { AutoCareAggregator } from './AutoCareAggregator';
import { getAutoCareLoader } from '../utils/AutoCareLoader';
import { MatchingStatistics } from './MatchingStatistics';
import * as fs from 'fs';
import * as path from 'path';
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

export interface BatchShopPart {
  id: string;
  name: string;
  entityId: number;
  title?: string;
  description?: string;
  shopNumber?: string;
  vendorNumber?: string;
}

/**
 * Parts Matching Service
 * 
 * Simple wrapper around UnifiedMatcher for backward compatibility
 * Now uses pure JavaScript implementation for better performance
 */
export class PartsMatcher {
  private unifiedMatcher: UnifiedMatcher | null = null;
  private config: PartsMatchConfig;
  private matchingStats: MatchingStatistics;

  // Optional Parquet-backed candidate recall
  private parquetEnabled: boolean = false;
  private parquetDir: string | null = null;
  private duck: DuckDBInstance | null = null;
  private conn: DuckDBConnection | null = null;
  // Map-first inverted index built from enriched parquet
  private tokenToPartIds: Map<string, number[]> = new Map();
  private partCatalog: Map<number, { name: string; description: string } > = new Map();
  private mapIndexReady = false;

  constructor(autoCareData?: any, config?: Partial<PartsMatchConfig>) {
    // Read env overrides for heavy batches
    const envCacheSize = parseInt(process.env.PARTS_MATCHER_CACHE_SIZE || '', 10);
    const envDisableFuzzy = String(process.env.PARTS_MATCHER_DISABLE_FUZZY || (process.env.PARTS_MATCHER_ENABLE_FUZZY === 'false' ? 'true' : '')).toLowerCase() === 'true';

    this.config = {
      enableFuzzyMatch: true,
      fuzzyThreshold: 0.7,
      enableDescriptionMatch: true,
      descriptionThreshold: 0.6,
      enableKeywordMatch: true,
      keywordWeights: {},
      enableAttributeMatch: false,
      attributeWeights: {},
      enableInterchangeMatch: false,
      interchangeQualityPreference: [],
      enableAssetEnrichment: false,
      preferredAssetTypes: [],
      enablePricingFilter: false,
      enableAvailabilityFilter: false,
      preferredAvailabilityStatus: [],
      enableCache: true,
      // Default bigger cache for large runs; can be overridden by env/config
      cacheSize: Number.isFinite(envCacheSize) && envCacheSize > 0 ? envCacheSize : 100000,
      debugMode: false,
      ...config
    };
    
    // Apply env flag to toggle fuzzy matching for very large batches
    if (envDisableFuzzy) {
      this.config.enableFuzzyMatch = false;
    }
    
    // Initialize matching statistics
    this.matchingStats = new MatchingStatistics();
  }

  /**
   * Initialize with data loader paths
   */
  async initialize(vcdbPath: string, pcdbPath: string): Promise<void> {
    const loader = new AutoCareDataLoader();
    const data = await loader.loadData(vcdbPath, pcdbPath);
    
    this.unifiedMatcher = new UnifiedMatcher(
      data.partsIndex,
      data.vehiclesIndex,
      data.fuzzyPartsIndex,
      data.makesByName,
      data.modelsByName,
      {
        enableFuzzyMatch: this.config.enableFuzzyMatch,
        fuzzyThreshold: this.config.fuzzyThreshold,
        enableYearRange: false, // Not applicable for parts
        yearRangeTolerance: 0,
        enableCache: this.config.enableCache,
        cacheSize: this.config.cacheSize,
        debugMode: this.config.debugMode
      }
    );

    // Try enabling Parquet-backed candidate recall (optional)
    await this.initParquetIndex();
  }

  /**
   * Match a single part - synchronous and fast
   */
  async matchPart(
    title?: string,
    description?: string,
    shopNumber?: string,
    vendorNumber?: string
  ): Promise<PartsMatchResult> {
    if (!this.unifiedMatcher) {
      throw new Error('PartsMatcher not initialized. Call initialize() first.');
    }
    // First try existing exact/fuzzy pipeline
    let result = this.unifiedMatcher.matchPart(title, description, shopNumber, vendorNumber);
    if (result.matched) {
      this.matchingStats.recordPartsSuccess(result);
      return result;
    }

    // Fallback: Map-first candidate recall if enabled
    const candidates = await this.matchViaParquet(title || description || shopNumber || vendorNumber, description);

    if (candidates && candidates.length > 0) {
      const [primary, ...alternatives] = candidates;
      result = {
        matched: true,
        standardizedPart: primary,
        alternatives: alternatives.length > 0 ? alternatives : undefined,
        attemptedMethods: ['exact', 'fuzzy', 'keyword'],
        originalData: { title, description, shopNumber, vendorNumber }
      };
      this.matchingStats.recordPartsSuccess(result);
      return result;
    }

    // No match
    this.matchingStats.recordPartsFailure(result);
    return result;
  }

  /**
   * Batch match multiple parts - delegates to UnifiedMatcher
   */
  async batchMatchParts(parts: BatchShopPart[]): Promise<Map<string, PartsMatchResult>> {
    if (!this.unifiedMatcher) {
      throw new Error('PartsMatcher not initialized. Call initialize() first.');
    }
    
    // First run through fast pipeline
    const results = this.unifiedMatcher.batchMatchParts(parts);

    // If Parquet is enabled, try to upgrade unmatched via candidate recall
    if (this.parquetEnabled) {
      const promises: Promise<void>[] = [];
      for (const part of parts) {
        const existing = results.get(part.id);
        if (existing && existing.matched) continue;
        promises.push((async () => {
          const candidates = await this.matchViaParquet(part.title || part.name, part.description);
          if (candidates && candidates.length > 0) {
            const [primary, ...alternatives] = candidates;
            const upgraded: PartsMatchResult = {
              matched: true,
              standardizedPart: primary,
              alternatives: alternatives.length > 0 ? alternatives : undefined,
              attemptedMethods: ['exact', 'fuzzy', 'keyword'],
              originalData: { title: part.title || part.name, description: part.description, shopNumber: part.shopNumber, vendorNumber: part.vendorNumber }
            };
            this.matchingStats.recordPartsSuccess(upgraded);
            results.set(part.id, upgraded);
          }
        })());
      }
      // Await parquet tasks to deterministically populate results
      await Promise.allSettled(promises);
      return results;
    }
    return results;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.unifiedMatcher?.getCacheStats() || { size: 0, maxSize: 0, enabled: false };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.unifiedMatcher?.clearCache();
  }

  // Legacy methods for backward compatibility
  async generateKnowledgeBase(entityId: number): Promise<any> {
    try {
      // Get AutoCare paths from global loader
      const autoCareLoader = getAutoCareLoader();
      const vcdbPath = autoCareLoader.getVcdbPath();
      const pcdbPath = autoCareLoader.getPcdbPath();
      
      // Create AutoCareAggregator instance to generate actual knowledge base
      const aggregator = new AutoCareAggregator(vcdbPath, pcdbPath);
      await aggregator.initialize();
      
      // Generate the knowledge base using the aggregator
      const knowledgeBase = await aggregator.generateEntityKnowledgeBase(entityId);
      
      await aggregator.close();
      
      // Add failure statistics from current session
      const failureReport = this.matchingStats.generateReport();
      const enhancedKnowledgeBase = {
        ...knowledgeBase,
        failureStatistics: {
          totalFailures: failureReport.partsStats.totalAttempts - failureReport.partsStats.successfulMatches,
          failuresByReason: failureReport.partsStats.failuresByReason,
          commonFailures: failureReport.partsStats.commonFailures,
          sessionStats: {
            totalAttempts: failureReport.partsStats.totalAttempts,
            successfulMatches: failureReport.partsStats.successfulMatches,
            averageConfidence: failureReport.partsStats.averageConfidence
          }
        }
      };
      
      return enhancedKnowledgeBase;
    } catch (error) {
      console.warn(`⚠️  Failed to generate knowledge base for entity ${entityId}:`, (error as Error).message);
      
      // Return fallback structure with required fields
      return {
        entityId,
        totalUniqueParts: 0,
        mostFrequentParts: [],
        failureStatistics: {
          totalFailures: 0,
          failuresByReason: [],
          commonFailures: []
        }
      };
    }
  }

  async getMatchingStatistics(): Promise<any> {
    return {
      totalMatches: 0,
      exactMatches: 0,
      fuzzyMatches: 0,
      keywordMatches: 0,
      averageConfidence: 0,
      timestamp: new Date().toISOString()
    };
  }

  async cleanup(): Promise<void> {
    this.clearCache();
    try {
      if (this.conn && (this.conn as any).closeSync) (this.conn as any).closeSync();
    } catch {}
    try {
      if (this.duck && (this.duck as any).closeSync) (this.duck as any).closeSync();
    } catch {}
  }

  // ===== Private helpers: Parquet-backed (Map-first) candidate recall =====
  private async initParquetIndex(): Promise<void> {
    // Resolve output directory
    const candidates: string[] = [];
    if (process.env.OUTPUT_DIR) candidates.push(process.env.OUTPUT_DIR);
    // Common defaults when running from transformer root
    candidates.push(path.resolve(process.cwd(), '../output'));
    candidates.push(path.resolve(process.cwd(), 'output'));
    // When running from dist
    candidates.push(path.resolve(__dirname, '../../../output'));
    candidates.push(path.resolve(__dirname, '../../output'));

    let foundDir: string | null = null;
    for (const dir of candidates) {
      const tokens = path.join(dir, 'PCdb_tokens.parquet');
      const enriched = path.join(dir, 'PCdb_enriched.parquet');
      if (fs.existsSync(tokens) && fs.existsSync(enriched)) {
        foundDir = dir;
        break;
      }
    }

    if (!foundDir) {
      this.parquetEnabled = false;
      return;
    }

    try {
      this.duck = await DuckDBInstance.create(':memory:');
      this.conn = await this.duck.connect();
      this.parquetDir = foundDir;
      this.parquetEnabled = true;
      console.log(`🦆 PartsMatcher: Parquet candidate recall enabled (${foundDir})`);

      // Build Map-first inverted index from enriched parquet (uses DuckDB only during init)
      const enrichedPath = path.join(foundDir, 'PCdb_enriched.parquet').replace(/'/g, "''");
      const res = await this.conn.runAndReadAll(`
        SELECT part_id, part_name, COALESCE(part_description, '') AS part_description,
               LOWER(searchable_text) AS st
        FROM read_parquet('${enrichedPath}')
      `);
      const rows = res.getRowObjects();
      for (const row of rows) {
        const partId = Number((row as any).part_id);
        const name = String((row as any).part_name || '');
        const desc = String((row as any).part_description || '');
        const st = String((row as any).st || '');
        if (!Number.isFinite(partId)) continue;
        this.partCatalog.set(partId, { name, description: desc });
        // Tokenize searchable_text (>=3 chars)
        const toks = st.split(/\s+/g).filter(t => t.length >= 3);
        for (const t of toks) {
          let arr = this.tokenToPartIds.get(t);
          if (!arr) {
            arr = [];
            this.tokenToPartIds.set(t, arr);
          }
          arr.push(partId);
        }
      }
      // Release DuckDB; runtime匹配只用内存Map
      try { if (this.conn && (this.conn as any).closeSync) (this.conn as any).closeSync(); } catch {}
      try { if (this.duck && (this.duck as any).closeSync) (this.duck as any).closeSync(); } catch {}
      this.conn = null as any;
      this.duck = null as any;
      this.mapIndexReady = true;
      console.log(`🗂️  PartsMatcher: Built token index for ${this.partCatalog.size} parts, ${this.tokenToPartIds.size} tokens`);
    } catch (e) {
      console.warn('⚠️  PartsMatcher: Failed to build Map index from Parquet:', (e as Error).message);
      this.parquetEnabled = false;
    }
  }

  private normalizeForTokens(text?: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private expandTokensWithSynonyms(tokens: string[]): string[] {
    // Common abbreviations/synonyms aligned with AutoCareAggregator
    const syn: Record<string, string[]> = {
      'ac': ['air', 'conditioning'], 'a/c': ['air', 'conditioning'],
      'eng': ['engine'], 'eng.': ['engine'],
      'hyd': ['hydraulic'], 'hyd.': ['hydraulic'], 'hydr': ['hydraulic'],
      'batt': ['battery'],
      'trans': ['transmission'], 'diff': ['differential'],
      'alt': ['alternator'], 'gen': ['generator'],
      'elec': ['electrical'], 'mech': ['mechanical']
    };
    const out = [...tokens];
    for (const t of tokens) {
      if (syn[t]) out.push(...syn[t]);
    }
    return Array.from(new Set(out));
  }

  private async matchViaParquet(name?: string, description?: string): Promise<StandardizedPart[] | null> {
    if (!this.parquetEnabled || !this.mapIndexReady) return null;
    const input = this.normalizeForTokens(name || description || '');
    if (!input) return null;
    let tokens = input.split(' ').filter(t => t.length >= 3).slice(0, 30);
    tokens = this.expandTokensWithSynonyms(tokens);
    if (tokens.length === 0) return null;

    const counter = new Map<number, number>();
    for (const t of tokens) {
      const arr = this.tokenToPartIds.get(t);
      if (!arr) continue;
      for (const pid of arr) {
        counter.set(pid, (counter.get(pid) || 0) + 1);
      }
    }
    if (counter.size === 0) return null;

    const scored = Array.from(counter.entries())
      .map(([pid, matched]) => {
        const info = this.partCatalog.get(pid) || { name: '', description: '' };
        const score = matched / Math.max(tokens.length, 1);
        return { pid, matched, score, info };
      })
      .sort((a, b) => b.score - a.score || b.matched - a.matched)
      .slice(0, 5);

    const threshold = this.config.descriptionThreshold || 0.6;
    if (scored.length === 0 || scored[0].score < threshold) return null;

    const candidates: StandardizedPart[] = scored.map((s, idx) => ({
      partId: String(s.pid),
      partTerminologyId: s.pid,
      partTerminologyName: s.info.name,
      partName: s.info.name,
      descriptions: s.info.description ? [s.info.description] : [],
      confidence: Math.min(0.9, Math.max(0.6, s.score)),
      matchingMethod: 'keyword',
      source: 'autocare_parquet_map',
      isAlternative: idx !== 0
    }));
    return candidates;
  }
}
