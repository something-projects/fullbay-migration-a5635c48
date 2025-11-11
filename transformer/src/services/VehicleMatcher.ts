import {
  AutoCareData,
  StandardizedVehicle,
  StandardizedPart,
  VehicleMatchResult,
  VehicleMatchConfig,
  VehicleMatchFailureReason,
  VCdbMake,
  VCdbModel
} from '../types/AutoCareTypes';
import { UnifiedMatcher, UnifiedMatcherConfig } from './UnifiedMatcher';
import * as fs from 'fs';
import * as path from 'path';
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import { AutoCareDataLoader } from './AutoCareDataLoader';
import { VINDecoder } from './VINDecoder';

/**
 * Vehicle information from Parquet for SubModel matching
 */
interface VehicleInfo {
  vehicleConfigId: number;
  actualMake: string;
  actualModel: string;
  subModel: string;
  year: number;
  engine?: string;
}

/**
 * Parquet match result with metadata
 */
interface ParquetMatchResult {
  make: string;
  model: string;
  year: number;
  confidence: number;
  method: string; // 匹配方法名，用于 attemptedMethods
  subModel?: string;
}

/**
 * Vehicle Matching Service
 *
 * Simple wrapper around UnifiedMatcher for backward compatibility
 * Now uses pure JavaScript implementation for better performance
 */
export class VehicleMatcher {
  private unifiedMatcher: UnifiedMatcher | null = null;
  private config: VehicleMatchConfig;
  private parquetEnabled: boolean = false;
  private parquetDir: string | null = null;
  private duck: DuckDBInstance | null = null;
  private conn: DuckDBConnection | null = null;
  private vcdbKeyToId: Map<string, number> = new Map();
  private vcdbKey3ToId: Map<string, number> = new Map();
  // SubModel索引：make|submodel|year -> VehicleInfo[]
  private vcdbSubModelIndex: Map<string, VehicleInfo[]> = new Map();

  constructor(autoCareData?: AutoCareData, config?: Partial<VehicleMatchConfig>) {
    this.config = {
      enableFuzzyMatch: true,
      fuzzyThreshold: 0.8,
      enableYearRange: true,
      yearRangeTolerance: 2,
      enableCache: true,
      cacheSize: 10000,
      debugMode: false,
      ...config
    };

    // If AutoCareData is provided, initialize UnifiedMatcher for backward compatibility
    if (autoCareData) {
      this.initializeFromAutoCareData(autoCareData);
    }
  }

  private initializeFromAutoCareData(autoCareData: AutoCareData): void {
    // Build vehicle index from AutoCareData
    const vehiclesIndex = new Map<string, StandardizedVehicle>();
    
    console.log('🔧 Building vehicle index from AutoCare data...');
    let vehicleCount = 0;
    
    for (const [baseVehicleId, baseVehicle] of autoCareData.vcdb.baseVehicles) {
      const make = autoCareData.vcdb.makes.get(baseVehicle.MakeID);
      const model = autoCareData.vcdb.models.get(baseVehicle.ModelID);
      
      if (make && model) {
        // Create normalized key (same format as UnifiedMatcher expects)
        const key = this.getVehicleKey(make.MakeName, model.ModelName, baseVehicle.YearID);
        
        const standardized: StandardizedVehicle = {
          makeId: baseVehicle.MakeID,
          makeName: make.MakeName,
          modelId: baseVehicle.ModelID,
          modelName: model.ModelName,
          year: baseVehicle.YearID,
          baseVehicleId: baseVehicle.BaseVehicleID,
          confidence: 1.0
        };
        
        vehiclesIndex.set(key, standardized);
        vehicleCount++;
      }
    }
    
    console.log(`   ✅ Built vehicle index with ${vehicleCount} entries`);
    
    // Create empty indexes for parts (parts matching uses different mechanism)
    const partsIndex = new Map<string, StandardizedPart>();
    const fuzzyPartsIndex = new Map<string, StandardizedPart[]>();
    
    // Extract make and model lookup maps from AutoCareData
    const makesByName = autoCareData.vcdb.makesByName;
    const modelsByName = autoCareData.vcdb.modelsByName;
    
    this.unifiedMatcher = new UnifiedMatcher(
      partsIndex,
      vehiclesIndex,
      fuzzyPartsIndex,
      makesByName,
      modelsByName,
      {
        enableFuzzyMatch: this.config.enableFuzzyMatch,
        fuzzyThreshold: this.config.fuzzyThreshold,
        enableYearRange: this.config.enableYearRange,
        yearRangeTolerance: this.config.yearRangeTolerance,
        enableCache: this.config.enableCache,
        cacheSize: this.config.cacheSize,
        debugMode: this.config.debugMode
      }
    );
  }

  /**
   * Generate vehicle lookup key (same format as UnifiedMatcher)
   */
  private getVehicleKey(make: string, model: string, year: number): string {
    return `${this.normalizeName(make)}|${this.normalizeName(model)}|${year}`;
  }

  /**
   * Normalize name for consistent matching
   */
  private normalizeName(name: string): string {
    return name.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '')
      .trim();
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
        enableYearRange: this.config.enableYearRange,
        yearRangeTolerance: this.config.yearRangeTolerance,
        enableCache: this.config.enableCache,
        cacheSize: this.config.cacheSize,
        debugMode: this.config.debugMode
      }
    );

    await this.initParquetIndex();
  }

  /**
   * Match vehicle data to AutoCare standards - now synchronous!
   */
  matchVehicle(
    make?: string, 
    model?: string, 
    year?: number,
    subModel?: string,
    engineInfo?: string,
    transmissionInfo?: string,
    bodyInfo?: string,
    vin?: string,
    entityId?: number
  ): VehicleMatchResult {
    if (!this.unifiedMatcher) {
      throw new Error('VehicleMatcher not initialized. Call initialize() first.');
    }
    // Attempt layered Parquet matching first (if enabled)
    const parquetResult = this.matchViaParquet(make, model, year, vin);
    if (parquetResult) {
      const result = this.unifiedMatcher.matchVehicle(
        parquetResult.make, parquetResult.model, parquetResult.year
      );
      if (result.matched && result.standardizedVehicle) {
        // Set attempted methods from parquet result
        result.attemptedMethods = [parquetResult.method, ...(result.attemptedMethods || [])];
        // Apply match metadata from parquet result
        result.standardizedVehicle.confidence = parquetResult.confidence;
        if (parquetResult.subModel) {
          result.standardizedVehicle.subModelName = parquetResult.subModel;
        }
        return result;
      }
    }

    return this.unifiedMatcher.matchVehicle(make, model, year);
  }

  /**
   * Legacy synchronous method - now just calls main method
   */
  matchVehicleSync(make?: string, model?: string, year?: number): VehicleMatchResult {
    return this.matchVehicle(make, model, year);
  }

  /**
   * Batch match vehicles - delegates to UnifiedMatcher
   */
  batchMatchVehicles(vehicles: { id: string; make: string; model: string; year: number; entityId: number }[]): Map<string, VehicleMatchResult> {
    if (!this.unifiedMatcher) {
      throw new Error('VehicleMatcher not initialized. Call initialize() first.');
    }
    return this.unifiedMatcher.batchMatchVehicles(vehicles);
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
    try { if (this.conn && (this.conn as any).closeSync) (this.conn as any).closeSync(); } catch {}
    try { if (this.duck && (this.duck as any).closeSync) (this.duck as any).closeSync(); } catch {}
  }

  // ===== Private helpers: Parquet-backed key lookup =====
  private asyncInit: Promise<void> | null = null;
  async enableParquetIndex(preferredDir?: string): Promise<void> {
    await this.initParquetIndex(preferredDir);
  }

  private initParquetIndex(preferredDir?: string): Promise<void> {
    if (this.asyncInit) return this.asyncInit;
    this.asyncInit = (async () => {
      const candidates: string[] = [];
      if (preferredDir) candidates.push(preferredDir);
      if (process.env.OUTPUT_DIR) candidates.push(process.env.OUTPUT_DIR);
      candidates.push(path.resolve(process.cwd(), '../output'));
      candidates.push(path.resolve(process.cwd(), 'output'));
      candidates.push(path.resolve(__dirname, '../../../output'));
      candidates.push(path.resolve(__dirname, '../../output'));

      let found: string | null = null;
      for (const dir of candidates) {
        const vk = path.join(dir, 'VCdb_keys.parquet');
        const vv = path.join(dir, 'VCdb.parquet');
        if (fs.existsSync(vk) && fs.existsSync(vv)) { found = dir; break; }
      }
      if (!found) { this.parquetEnabled = false; return; }

      try {
        this.duck = await DuckDBInstance.create(':memory:');
        this.conn = await this.duck.connect();
        this.parquetDir = found;
        this.parquetEnabled = true;
        console.log(`🦆 VehicleMatcher: Parquet key lookup enabled (${found})`);

        // Preload VCdb keys into memory for sync lookup
        const vv = path.join(found, 'VCdb.parquet').replace(/'/g, "''");
        const res = await (this.conn as any).runAndReadAll(`
          SELECT key_norm, make, model, year, submodel, engine, vehicle_config_id FROM read_parquet('${vv}')
        `);
        for (const row of res.getRowObjects()) {
          const key5 = String((row as any).key_norm || '');
          const m = String((row as any).make || '');
          const mdl = String((row as any).model || '');
          const yr = Number((row as any).year || 0);
          const sm = String((row as any).submodel || '');
          const eng = String((row as any).engine || '');
          const id = Number((row as any).vehicle_config_id || 0);

          if (key5) this.vcdbKeyToId.set(key5, id);

          // Build normalized 3-segment key consistent with UnifiedMatcher
          const k3 = this.buildNormalized3Key(m, mdl, yr);
          if (k3) this.vcdbKey3ToId.set(k3, id);

          // Build SubModel index: make|submodel|year -> VehicleInfo[]
          // This allows matching when user provides SubModel as Model field
          if (sm && sm.trim()) {
            const info: VehicleInfo = {
              vehicleConfigId: id,
              actualMake: m,
              actualModel: mdl,
              subModel: sm,
              year: yr,
              engine: eng || undefined
            };

            // Index full SubModel (e.g., "pro lf687" -> "prolf687")
            const smKey = this.buildSubModelKey(m, sm, yr);
            if (smKey) {
              if (!this.vcdbSubModelIndex.has(smKey)) {
                this.vcdbSubModelIndex.set(smKey, []);
              }
              this.vcdbSubModelIndex.get(smKey)!.push(info);
            }

            // Also index individual tokens from SubModel
            // (e.g., "pro lf687" -> ["pro", "lf687"])
            const tokens = sm.split(/\s+/).filter(t => t.length > 2); // Ignore very short tokens
            for (const token of tokens) {
              const tokenKey = this.buildSubModelKey(m, token, yr);
              if (tokenKey && tokenKey !== smKey) { // Avoid duplicate indexing
                if (!this.vcdbSubModelIndex.has(tokenKey)) {
                  this.vcdbSubModelIndex.set(tokenKey, []);
                }
                this.vcdbSubModelIndex.get(tokenKey)!.push(info);
              }
            }
          }
        }
        console.log(`🗝️  VehicleMatcher: Loaded ${this.vcdbKeyToId.size} VCdb keys (5-seg), ${this.vcdbKey3ToId.size} keys (3-seg norm), ${this.vcdbSubModelIndex.size} SubModel entries`);
      } catch (e) {
        console.warn('⚠️  VehicleMatcher: Failed to init DuckDB for Parquet:', (e as Error).message);
        this.parquetEnabled = false;
      }
    })();
    return this.asyncInit;
  }

  // Expose year tolerance for aggregator alignment
  getYearRangeTolerance(): number {
    return this.config.enableYearRange ? (this.config.yearRangeTolerance || 0) : 0;
  }

  private normalizeParquetComponent(s?: string): string {
    if (!s) return '';
    return s.toLowerCase().trim();
  }

  private toParquetKey(make?: string, model?: string, year?: number, submodel?: string, engine?: string): string {
    const mke = this.normalizeParquetComponent(make);
    const mdl = this.normalizeParquetComponent(model);
    const yr = year ? String(year) : '0';
    const sm = this.normalizeParquetComponent(submodel);
    const eng = this.normalizeParquetComponent(engine);
    return `${mke}|${mdl}|${yr}|${sm}|${eng}`;
  }

  private insertDashBetweenLetterDigit(text: string): string {
    return text.replace(/([a-zA-Z])(\d)/g, '$1-$2');
  }

  /**
   * Layered Parquet matching strategy
   * Layer 1: Standard match (make|model|year)
   * Layer 2: SubModel fallback (make|submodel_as_model|year)
   * Layer 3: VIN decode year extraction
   * Layer 4: Fuzzy match without year
   */
  private matchViaParquet(make?: string, model?: string, year?: number, vin?: string): ParquetMatchResult | null {
    if (!this.parquetEnabled || !this.parquetDir) return null;
    if (!make || !model) return null;

    const makeNorm = this.normalizeName(make);
    const modelNorm = this.normalizeName(model);
    const tol = this.getYearRangeTolerance();

    // Layer 1: Standard match with year tolerance
    if (year) {
      const layer1Result = this.tryStandardMatch(makeNorm, modelNorm, year, tol);
      if (layer1Result) {
        return {
          make,
          model,
          year: layer1Result.year,
          confidence: 0.95,
          method: 'parquet_standard'
        };
      }

      // Layer 2: SubModel fallback match
      const layer2Result = this.trySubModelMatch(makeNorm, modelNorm, year, tol);
      if (layer2Result) {
        return {
          make,
          model: layer2Result.actualModel,
          year: layer2Result.year,
          confidence: 0.85,
          method: 'parquet_submodel_fallback',
          subModel: layer2Result.subModel
        };
      }
    }

    // Layer 3: VIN decode year extraction
    if (!year && vin) {
      const decodedYear = VINDecoder.decodeYearFromVIN(vin);
      if (decodedYear) {
        // Try standard match with decoded year
        const layer3StandardResult = this.tryStandardMatch(makeNorm, modelNorm, decodedYear, tol);
        if (layer3StandardResult) {
          return {
            make,
            model,
            year: layer3StandardResult.year,
            confidence: 0.75,
            method: 'parquet_vin_decode_standard'
          };
        }

        // Try SubModel match with decoded year
        const layer3SubModelResult = this.trySubModelMatch(makeNorm, modelNorm, decodedYear, tol);
        if (layer3SubModelResult) {
          return {
            make,
            model: layer3SubModelResult.actualModel,
            year: layer3SubModelResult.year,
            confidence: 0.70,
            method: 'parquet_vin_decode_submodel',
            subModel: layer3SubModelResult.subModel
          };
        }
      }
    }

    // Layer 4: Fuzzy match without year (return latest year)
    const layer4Result = this.tryFuzzyNoYearMatch(makeNorm, modelNorm);
    if (layer4Result) {
      return {
        make,
        model,
        year: layer4Result.year,
        confidence: 0.50,
        method: 'parquet_fuzzy_no_year'
      };
    }

    return null;
  }

  /**
   * Try standard match: make|model|year with year tolerance
   */
  private tryStandardMatch(makeNorm: string, modelNorm: string, year: number, tol: number): { year: number } | null {
    for (let off = 0; off <= tol; off++) {
      const candidates = off === 0 ? [year] : [year - off, year + off];
      for (const y of candidates) {
        if (!y || y <= 0) continue;
        const key3 = `${makeNorm}|${modelNorm}|${y}`;
        if (this.vcdbKey3ToId.has(key3)) {
          return { year: y };
        }
      }
    }
    return null;
  }

  /**
   * Try SubModel fallback match: make|submodel|year
   * When user provides SubModel in Model field (e.g., "LF687")
   */
  private trySubModelMatch(makeNorm: string, modelNorm: string, year: number, tol: number): VehicleInfo | null {
    for (let off = 0; off <= tol; off++) {
      const candidates = off === 0 ? [year] : [year - off, year + off];
      for (const y of candidates) {
        if (!y || y <= 0) continue;
        const smKey = `${makeNorm}|${modelNorm}|${y}`;
        const matches = this.vcdbSubModelIndex.get(smKey);
        if (matches && matches.length > 0) {
          // Return the first match (could enhance to return all as alternatives)
          return matches[0];
        }
      }
    }
    return null;
  }

  /**
   * Try fuzzy match without year: make|model
   * Returns latest year match
   */
  private tryFuzzyNoYearMatch(makeNorm: string, modelNorm: string): { year: number } | null {
    // Scan all keys for matching make|model prefix
    let latestYear = 0;
    for (const [key3, _id] of this.vcdbKey3ToId.entries()) {
      const parts = key3.split('|');
      if (parts.length === 3 && parts[0] === makeNorm && parts[1] === modelNorm) {
        const y = parseInt(parts[2], 10);
        if (!isNaN(y) && y > latestYear) {
          latestYear = y;
        }
      }
    }
    return latestYear > 0 ? { year: latestYear } : null;
  }

  private buildNormalized3Key(make?: string, model?: string, year?: number): string {
    if (!make || !model || !year) return '';
    const mk = this.normalizeName(String(make));
    const md = this.normalizeName(String(model));
    return `${mk}|${md}|${Number(year)}`;
  }

  /**
   * Build SubModel-based key for fallback matching
   * Format: make|submodel|year (normalized)
   */
  private buildSubModelKey(make?: string, subModel?: string, year?: number): string {
    if (!make || !subModel || !year) return '';
    const mk = this.normalizeName(String(make));
    const sm = this.normalizeName(String(subModel));
    return `${mk}|${sm}|${Number(year)}`;
  }
}
