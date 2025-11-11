import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import { VehicleMatchResult, StandardizedVehicle, AutoCareData, VCdbBaseVehicle, VCdbVehicle, VehicleMatchFailureReason } from '../types/AutoCareTypes';
import { VehicleMatcher } from './VehicleMatcher';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Vehicle Aggregation Interface
 */
export interface VehicleMatch {
  originalMake?: string;
  originalModel?: string;
  originalYear?: number;
  makeId?: number;
  makeName?: string;
  modelId?: number;
  modelName?: string;
  year?: number;
  baseVehicleId?: number;
  confidence: number;
  matchingMethod: 'exact' | 'fuzzy' | 'partial' | 'inferred';
}

/**
 * Shop Vehicle for batch processing
 */
export interface BatchShopVehicle {
  id: string;
  make?: string;
  model?: string;
  year?: number;
  entityId: number;
}

/**
 * Vehicle Aggregator Service using DuckDB for efficient batch processing
 * 
 * This service loads AutoCare VCdb data into DuckDB and provides high-performance
 * batch vehicle matching capabilities for standardizing fleet vehicle information.
 */
export class VehicleAggregator {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  private isLoaded = false;
  private vehicleMatcher: VehicleMatcher | null = null;
  private parquetDir: string | null = null;
  private parquetMode = false;
  private mapOnly = true; // Default to Map-first; disable DuckDB unless explicitly needed

  constructor(
    private vcdbPath: string,
    private autoCareData?: AutoCareData,
    vehicleMatcher?: VehicleMatcher
  ) {
    this.vehicleMatcher = vehicleMatcher || null;
    // Allow override via env to force DuckDB path when needed
    if (process.env.VEHICLE_AGG_USE_DUCKDB === 'true') {
      this.mapOnly = false;
    }
  }

  /**
   * Initialize DuckDB with AutoCare VCdb data
   */
  async initialize(): Promise<void> {
    if (this.mapOnly) {
      // Map-only mode: no DuckDB initialization needed
      this.isLoaded = true;
      console.log('🗺️  VehicleAggregator: Map-only mode enabled (DuckDB disabled)');
      return;
    }
    if (this.isLoaded) return;

    console.log('🚀 Initializing VehicleAggregator with DuckDB...');
    const startTime = Date.now();

    try {
      // Create DuckDB instance
      this.instance = await DuckDBInstance.create(':memory:');
      this.connection = await this.instance.connect();

      // Prefer Parquet-backed VCdb if available (faster startup)
      const usedParquet = await this.initFromParquetIfAvailable();
      if (usedParquet) {
        await this.createParquetViews();
      } else {
        // Load VCdb data from JSON and create views (fallback)
        await this.loadVCdbData();
        await this.createMatchingViews();
      }

      this.isLoaded = true;
      const duration = Date.now() - startTime;
      console.log(`✅ VehicleAggregator initialized in ${duration}ms`);
    } catch (error) {
      console.error('❌ Failed to initialize VehicleAggregator:', error);
      throw error;
    }
  }

  /**
   * Detect Parquet assets and set up directory
   */
  private async initFromParquetIfAvailable(): Promise<boolean> {
    const candidates: string[] = [];
    if (process.env.OUTPUT_DIR) candidates.push(process.env.OUTPUT_DIR);
    candidates.push(path.resolve(process.cwd(), '../output'));
    candidates.push(path.resolve(process.cwd(), 'output'));
    candidates.push(path.resolve(__dirname, '../../../output'));
    candidates.push(path.resolve(__dirname, '../../output'));

    for (const dir of candidates) {
      const vv = path.join(dir, 'VCdb.parquet');
      if (fs.existsSync(vv)) {
        this.parquetDir = dir;
        this.parquetMode = true;
        console.log(`🦆 VehicleAggregator: Using Parquet VCdb at ${dir}`);
        return true;
      }
    }
    this.parquetMode = false;
    return false;
  }

  /**
   * Build views from Parquet (no JSON load)
   */
  private async createParquetViews(): Promise<void> {
    if (!this.connection) throw new Error('Connection not initialized');
    if (!this.parquetDir) throw new Error('Parquet directory not set');

    const vv = path.join(this.parquetDir, 'VCdb.parquet').replace(/'/g, "''");
    const vk = path.join(this.parquetDir, 'VCdb_keys.parquet').replace(/'/g, "''");

    // Create a unified vehicle combinations view compatible with existing queries
    await this.connection.run(`
      CREATE VIEW vehicle_combinations AS
      SELECT 
        CAST(vehicle_config_id AS INTEGER) AS BaseVehicleID,
        NULL::INTEGER AS MakeID,
        make AS MakeName,
        NULL::INTEGER AS ModelID,
        model AS ModelName,
        CAST(year AS INTEGER) AS Year,
        UPPER(TRIM(make)) AS normalized_make,
        UPPER(TRIM(model)) AS normalized_model
      FROM read_parquet('${vv}')
    `);

    // Lightweight row view for direct lookups by vehicle_config_id
    await this.connection.run(`
      CREATE VIEW vcdb_rows AS
      SELECT 
        CAST(vehicle_config_id AS INTEGER) AS vehicle_config_id,
        LOWER(TRIM(make)) AS make,
        LOWER(TRIM(model)) AS model,
        CAST(year AS INTEGER) AS year
      FROM read_parquet('${vv}')
    `);

    // Keys: build 3-segment projection for fast join
    await this.connection.run(`
      CREATE VIEW vcdb_keys_all AS
      SELECT vehicle_config_id, key, source FROM read_parquet('${vk}')
    `);

    await this.connection.run(`
      CREATE VIEW vcdb_keys_3seg AS
      SELECT DISTINCT vehicle_config_id,
             LOWER(SPLIT_PART(key, '|', 1)) || '|' ||
             LOWER(SPLIT_PART(key, '|', 2)) || '|' ||
             SPLIT_PART(key, '|', 3) AS key3,
             source
      FROM vcdb_keys_all
    `);

    // Normalized versions aligned with UnifiedMatcher.normalizeName
    await this.connection.run(`
      CREATE VIEW vcdb_keys_3seg_norm AS
      SELECT DISTINCT vehicle_config_id,
             REPLACE(LOWER(REGEXP_REPLACE(SPLIT_PART(key, '|', 1), '[^a-zA-Z0-9_\\s]', '', 'g')), ' ', '')
             || '|' ||
             REPLACE(LOWER(REGEXP_REPLACE(SPLIT_PART(key, '|', 2), '[^a-zA-Z0-9_\\s]', '', 'g')), ' ', '')
             || '|' ||
             SPLIT_PART(key, '|', 3) AS key3,
             source
      FROM vcdb_keys_all
    `);

    await this.connection.run(`
      CREATE VIEW vcdb_rows_norm AS
      SELECT 
        CAST(vehicle_config_id AS INTEGER) AS vehicle_config_id,
        REPLACE(LOWER(REGEXP_REPLACE(make, '[^a-zA-Z0-9_\\s]', '', 'g')), ' ', '') AS make_norm,
        REPLACE(LOWER(REGEXP_REPLACE(model, '[^a-zA-Z0-9_\\s]', '', 'g')), ' ', '') AS model_norm,
        CAST(year AS INTEGER) AS year
      FROM read_parquet('${vv}')
    `);

    // Log counts for visibility
    const cnt = await this.connection.runAndReadAll(`SELECT COUNT(*) AS c FROM vehicle_combinations`);
    console.log(`📊 Loaded vehicle_combinations from Parquet: ${cnt.getRowObjects()[0].c} rows`);
  }

  /**
   * Batch match vehicles to AutoCare VCdb standards
   */
  async batchMatchVehicles(vehicles: BatchShopVehicle[]): Promise<Map<string, VehicleMatchResult>> {
    console.log(`🔍 Batch matching ${vehicles.length} vehicles...`);
    const startTime = Date.now();
    const results = new Map<string, VehicleMatchResult>();

    // Map-only fast path
    if (this.mapOnly) {
      if (!this.vehicleMatcher) throw new Error('VehicleMatcher is required for map-only mode');

      for (const v of vehicles) {
        const id = String(v.id);
        const hasMake = !!(v.make && v.make.trim());
        const hasModel = !!(v.model && v.model.trim());
        const hasYear = typeof v.year === 'number' && Number.isFinite(v.year) && (v.year || 0) > 0;

        if (!hasMake || !hasModel || !hasYear) {
          // Produce typed failure as before
          let failureReason: VehicleMatchFailureReason;
          let failureDetails = '';
          if (!hasMake) {
            failureReason = VehicleMatchFailureReason.MISSING_MAKE;
            failureDetails = 'Vehicle make not provided';
          } else if (!hasModel) {
            failureReason = VehicleMatchFailureReason.MISSING_MODEL;
            failureDetails = 'Vehicle model not provided';
          } else {
            failureReason = VehicleMatchFailureReason.MISSING_YEAR;
            failureDetails = 'Vehicle year not provided';
          }
          results.set(id, {
            matched: false,
            failureReason,
            failureDetails,
            alternatives: [],
            originalData: { make: v.make, model: v.model, year: v.year },
            searchAttempts: { make: v.make, model: v.model, year: v.year }
          });
          continue;
        }

        let r: VehicleMatchResult;
        try {
          r = this.vehicleMatcher.matchVehicle(v.make, v.model, v.year);
        } catch (e) {
          // On unexpected error, mark unmatched with diagnostic
          results.set(id, {
            matched: false,
            failureReason: VehicleMatchFailureReason.VEHICLE_NOT_IN_AUTOCARE,
            failureDetails: `Matcher error: ${(e as Error).message}`,
            alternatives: [],
            originalData: { make: v.make, model: v.model, year: v.year },
            searchAttempts: { make: v.make, model: v.model, year: v.year }
          });
          continue;
        }

        if (r.matched && r.standardizedVehicle) {
          // Already in desired shape; just set
          results.set(id, r);
        } else {
          // Unmatched with explicit reason
          results.set(id, {
            matched: false,
            failureReason: VehicleMatchFailureReason.VEHICLE_NOT_IN_AUTOCARE,
            failureDetails: `${v.make} ${v.model} ${v.year} not found in AutoCare VCdb database`,
            alternatives: r.alternatives || [],
            originalData: { make: v.make, model: v.model, year: v.year },
            searchAttempts: { make: v.make, model: v.model, year: v.year }
          });
        }
      }

      const duration = Date.now() - startTime;
      const matchedCount = Array.from(results.values()).filter(r => r.matched).length;
      console.log(`✅ Map-only vehicle matching completed: ${matchedCount}/${vehicles.length} matched in ${duration}ms`);
      return results;
    }

    // DuckDB path (fallback when explicitly enabled)
    if (!this.connection) {
      throw new Error('VehicleAggregator not initialized');
    }

    try {
      // Create temporary table with shop vehicles
      await this.createShopVehiclesTable(vehicles);

      // Perform batch matching query
      const matches = this.parquetMode
        ? await this.executeMatchingQueryParquet()
        : await this.executeMatchingQueryLegacy();

      // Process results (same as before)
      for (const match of matches) {
        if (!match.id) continue;
        const rawYear = match.original_year !== undefined && match.original_year !== null
          ? Number(match.original_year) : undefined;
        const originalYear = typeof rawYear === 'number' && Number.isFinite(rawYear) ? rawYear : undefined;

        const vehicleMatch: VehicleMatch = {
          originalMake: match.original_make,
          originalModel: match.original_model,
          originalYear,
          makeId: match.make_id,
          makeName: match.make_name,
          modelId: match.model_id,
          modelName: match.model_name,
          year: match.year,
          baseVehicleId: match.base_vehicle_id,
          confidence: Number(match.confidence) || 0,
          matchingMethod: match.matching_method as 'exact' | 'fuzzy' | 'partial' | 'inferred'
        };

        let matcherResult: VehicleMatchResult | undefined;
        if (this.vehicleMatcher && vehicleMatch.originalMake && vehicleMatch.originalModel && vehicleMatch.originalYear) {
          try {
            matcherResult = this.vehicleMatcher.matchVehicle(
              vehicleMatch.originalMake,
              vehicleMatch.originalModel,
              vehicleMatch.originalYear
            );
          } catch {}
        }

        const matched = (vehicleMatch.confidence || 0) > 0 || (matcherResult?.matched ?? false);
        if (matched) {
          const standardizedVehicle = this.createStandardizedVehicle(vehicleMatch, matcherResult);
          const alternatives = this.prepareVehicleAlternatives(matcherResult?.alternatives, standardizedVehicle);
          results.set(String(match.id), {
            matched: true,
            standardizedVehicle,
            alternatives,
            originalData: { make: vehicleMatch.originalMake, model: vehicleMatch.originalModel, year: vehicleMatch.originalYear }
          });
        }
      }

      // Add unmatched
      for (const vehicle of vehicles) {
        if (!results.has(vehicle.id)) {
          let failureReason: VehicleMatchFailureReason;
          let failureDetails = '';
          if (!vehicle.make || vehicle.make.trim() === '') {
            failureReason = VehicleMatchFailureReason.MISSING_MAKE;
            failureDetails = 'Vehicle make not provided';
          } else if (!vehicle.model || vehicle.model.trim() === '') {
            failureReason = VehicleMatchFailureReason.MISSING_MODEL;
            failureDetails = 'Vehicle model not provided';
          } else if (!vehicle.year || vehicle.year <= 0) {
            failureReason = VehicleMatchFailureReason.MISSING_YEAR;
            failureDetails = 'Vehicle year not provided';
          } else if (vehicle.year < 1900 || vehicle.year > new Date().getFullYear() + 2) {
            failureReason = VehicleMatchFailureReason.INVALID_YEAR;
            failureDetails = `Year ${vehicle.year} is outside valid range (1900-${new Date().getFullYear() + 2})`;
          } else {
            failureReason = VehicleMatchFailureReason.VEHICLE_NOT_IN_AUTOCARE;
            failureDetails = `${vehicle.make} ${vehicle.model} ${vehicle.year} not found in AutoCare VCdb database`;
          }
          results.set(vehicle.id, {
            matched: false,
            failureReason,
            failureDetails,
            alternatives: [],
            originalData: { make: vehicle.make, model: vehicle.model, year: vehicle.year },
            searchAttempts: { make: vehicle.make, model: vehicle.model, year: vehicle.year }
          });
        }
      }

      const duration = Date.now() - startTime;
      const matchedCount = Array.from(results.values()).filter(r => r.matched).length;
      console.log(`✅ Batch vehicle matching completed: ${matchedCount}/${vehicles.length} matched in ${duration}ms`);
      return results;
    } catch (error) {
      console.error('❌ Batch vehicle matching failed:', error);
      throw error;
    }
  }

  /**
   * Load VCdb data into DuckDB tables
   */
  private async loadVCdbData(): Promise<void> {
    if (!this.connection) throw new Error('Connection not initialized');

    // Load Makes from JSON file
    const makesPath = path.join(this.vcdbPath, 'Make.json');
    if (fs.existsSync(makesPath)) {
      console.log('  📄 Loading Make.json...');
      await this.connection.run(`
        CREATE TABLE vcdb_makes AS 
        SELECT * FROM read_json_auto('${makesPath.replace(/'/g, "''")}')
      `);
    } else {
      throw new Error(`Make.json not found at ${makesPath}`);
    }

    // Load Models from JSON file
    const modelsPath = path.join(this.vcdbPath, 'Model.json');
    if (fs.existsSync(modelsPath)) {
      console.log('  📄 Loading Model.json...');
      await this.connection.run(`
        CREATE TABLE vcdb_models AS 
        SELECT * FROM read_json_auto('${modelsPath.replace(/'/g, "''")}')
      `);
    } else {
      throw new Error(`Model.json not found at ${modelsPath}`);
    }

    // Load Years from JSON file
    const yearsPath = path.join(this.vcdbPath, 'Year.json');
    if (fs.existsSync(yearsPath)) {
      console.log('  📄 Loading Year.json...');
      await this.connection.run(`
        CREATE TABLE vcdb_years AS 
        SELECT * FROM read_json_auto('${yearsPath.replace(/'/g, "''")}')
      `);
    } else {
      throw new Error(`Year.json not found at ${yearsPath}`);
    }

    // Load BaseVehicles from JSON file
    const baseVehiclesPath = path.join(this.vcdbPath, 'BaseVehicle.json');
    if (fs.existsSync(baseVehiclesPath)) {
      console.log('  📄 Loading BaseVehicle.json...');
      await this.connection.run(`
        CREATE TABLE vcdb_base_vehicles AS 
        SELECT * FROM read_json_auto('${baseVehiclesPath.replace(/'/g, "''")}')
      `);
    } else {
      throw new Error(`BaseVehicle.json not found at ${baseVehiclesPath}`);
    }

    // Get counts for logging
    const makesResult = await this.connection.runAndReadAll(`SELECT COUNT(*) as count FROM vcdb_makes`);
    const modelsResult = await this.connection.runAndReadAll(`SELECT COUNT(*) as count FROM vcdb_models`);
    const yearsResult = await this.connection.runAndReadAll(`SELECT COUNT(*) as count FROM vcdb_years`);
    const baseVehiclesResult = await this.connection.runAndReadAll(`SELECT COUNT(*) as count FROM vcdb_base_vehicles`);

    const makesCount = makesResult.getRowObjects()[0].count;
    const modelsCount = modelsResult.getRowObjects()[0].count;
    const yearsCount = yearsResult.getRowObjects()[0].count;
    const baseVehiclesCount = baseVehiclesResult.getRowObjects()[0].count;

    console.log(`📊 Loaded VCdb data: ${makesCount} makes, ${modelsCount} models, ${yearsCount} years, ${baseVehiclesCount} base vehicles`);
  }

  /**
   * Create optimized views for vehicle matching
   */
  private async createMatchingViews(): Promise<void> {
    if (!this.connection) throw new Error('Connection not initialized');

    // Create comprehensive vehicle view
    await this.connection.run(`
      CREATE VIEW vehicle_combinations AS
      SELECT 
        bv.BaseVehicleID,
        bv.MakeID,
        m.MakeName,
        bv.ModelID,
        mo.ModelName,
        bv.YearID,
        y.YearID as Year,
        -- Normalize names for matching
        UPPER(TRIM(m.MakeName)) as normalized_make,
        UPPER(TRIM(mo.ModelName)) as normalized_model
      FROM vcdb_base_vehicles bv
      JOIN vcdb_makes m ON bv.MakeID = m.MakeID
      JOIN vcdb_models mo ON bv.ModelID = mo.ModelID
      JOIN vcdb_years y ON bv.YearID = y.YearID
    `);

    console.log('✅ Created vehicle matching views');
  }

  /**
   * Create temporary table with shop vehicles
   */
  private async createShopVehiclesTable(vehicles: BatchShopVehicle[]): Promise<void> {
    if (!this.connection) throw new Error('Connection not initialized');

    const vehiclesData = vehicles.map(v => {
      let normalizedModel = v.model ? v.model.toUpperCase().trim() : '';
      
      // Remove common suffixes that interfere with matching
      normalizedModel = normalizedModel.replace(/\s+SERIES$/i, '').trim();
      
      return {
        id: v.id,
        make: v.make || '',
        model: v.model || '',
        year: v.year || 0,
        normalized_make: v.make ? v.make.toUpperCase().trim() : '',
        normalized_model: normalizedModel,
        entity_id: v.entityId
      };
    });

    await this.connection.run(`DROP TABLE IF EXISTS shop_vehicles`);
    await this.connection.run(`
      CREATE TABLE shop_vehicles (
        id VARCHAR, 
        make VARCHAR, 
        model VARCHAR, 
        year INTEGER, 
        normalized_make VARCHAR, 
        normalized_model VARCHAR, 
        entity_id INTEGER
      )
    `);

    if (vehiclesData.length > 0) {
      // Insert vehicles in smaller batches to avoid SQL parsing issues with quotes
      const batchSize = 100;
      for (let i = 0; i < vehiclesData.length; i += batchSize) {
        const batch = vehiclesData.slice(i, i + batchSize);
        
        // Use proper SQL escaping for each vehicle
        const vehiclesValues = batch.map(v => {
          // Escape single quotes properly for DuckDB
          const escapeMake = v.make.replace(/'/g, "''");
          const escapeModel = v.model.replace(/'/g, "''");
          const escapeNormMake = v.normalized_make.replace(/'/g, "''");
          const escapeNormModel = v.normalized_model.replace(/'/g, "''");
          
          return `('${v.id}', '${escapeMake}', '${escapeModel}', ${v.year}, '${escapeNormMake}', '${escapeNormModel}', ${v.entity_id})`;
        }).join(', ');
        
        await this.connection.run(`INSERT INTO shop_vehicles VALUES ${vehiclesValues}`);
      }
    }
  }

  /**
   * Execute batch matching query with multiple strategies
   */
  private async executeMatchingQueryLegacy(): Promise<any[]> {
    if (!this.connection) throw new Error('Connection not initialized');
    
    // Strict matching query - prevents incorrect model assignments
    const result = await this.connection.runAndReadAll(`
      WITH exact_matches AS (
        SELECT 
          sv.id,
          sv.make as original_make,
          sv.model as original_model,
          sv.year as original_year,
          vc.MakeID as make_id,
          vc.MakeName as make_name,
          vc.ModelID as model_id,
          vc.ModelName as model_name,
          vc.Year as year,
          vc.BaseVehicleID as base_vehicle_id,
          1.0 as confidence,
          'exact' as matching_method,
          1 as priority
        FROM shop_vehicles sv
        JOIN vehicle_combinations vc ON (
          sv.normalized_make = vc.normalized_make
          AND sv.normalized_model = vc.normalized_model
          AND sv.year = vc.Year
        )
        WHERE sv.normalized_make != '' 
          AND sv.normalized_model != '' 
          AND sv.year > 0
      ),
      format_variant_matches AS (
        SELECT 
          sv.id,
          sv.make as original_make,
          sv.model as original_model,
          sv.year as original_year,
          vc.MakeID as make_id,
          vc.MakeName as make_name,
          vc.ModelID as model_id,
          vc.ModelName as model_name,
          vc.Year as year,
          vc.BaseVehicleID as base_vehicle_id,
          0.95 as confidence,
          'format_variant' as matching_method,
          2 as priority
        FROM shop_vehicles sv
        JOIN vehicle_combinations vc ON (
          sv.normalized_make = vc.normalized_make
          AND sv.year = vc.Year
          -- Handle common format variations: F-150 vs F150, Ram 1500 vs RAM1500
          AND REPLACE(REPLACE(sv.normalized_model, '-', ''), ' ', '') = 
              REPLACE(REPLACE(vc.normalized_model, '-', ''), ' ', '')
        )
        WHERE sv.id NOT IN (SELECT id FROM exact_matches)
          AND sv.normalized_make != '' 
          AND sv.normalized_model != '' 
          AND sv.year > 0
          -- Ensure this is actually a format variant, not completely different models
          AND LENGTH(sv.normalized_model) > 2
          AND LENGTH(vc.normalized_model) > 2
      ),
      suffix_variant_matches AS (
        SELECT 
          sv.id,
          sv.make as original_make,
          sv.model as original_model,
          sv.year as original_year,
          vc.MakeID as make_id,
          vc.MakeName as make_name,
          vc.ModelID as model_id,
          vc.ModelName as model_name,
          vc.Year as year,
          vc.BaseVehicleID as base_vehicle_id,
          0.9 as confidence,
          'suffix_variant' as matching_method,
          3 as priority
        FROM shop_vehicles sv
        JOIN vehicle_combinations vc ON (
          sv.normalized_make = vc.normalized_make
          AND sv.year = vc.Year
          -- Match where shop model is prefix of AutoCare model
          -- E450 matches E-450 SUPER DUTY
          AND (
            -- Remove hyphens and spaces, then check if AutoCare model starts with shop model
            REPLACE(REPLACE(vc.normalized_model, '-', ''), ' ', '') 
            LIKE REPLACE(REPLACE(sv.normalized_model, '-', ''), ' ', '') || '%'
            -- Ensure AutoCare model is longer (has additional descriptive text)
            AND LENGTH(REPLACE(REPLACE(vc.normalized_model, '-', ''), ' ', '')) > 
                LENGTH(REPLACE(REPLACE(sv.normalized_model, '-', ''), ' ', ''))
          )
        )
        WHERE sv.id NOT IN (SELECT id FROM exact_matches)
          AND sv.id NOT IN (SELECT id FROM format_variant_matches)
          AND sv.normalized_make != '' 
          AND sv.normalized_model != '' 
          AND sv.year > 0
          -- Minimum length requirements to avoid false matches
          AND LENGTH(sv.normalized_model) >= 3
          AND LENGTH(vc.normalized_model) >= 5
      ),
      make_prefix_matches AS (
        SELECT 
          sv.id,
          sv.make as original_make,
          sv.model as original_model,
          sv.year as original_year,
          vc.MakeID as make_id,
          vc.MakeName as make_name,
          vc.ModelID as model_id,
          vc.ModelName as model_name,
          vc.Year as year,
          vc.BaseVehicleID as base_vehicle_id,
          0.85 as confidence,
          'make_prefix' as matching_method,
          4 as priority
        FROM shop_vehicles sv
        JOIN vehicle_combinations vc ON (
          sv.normalized_model = vc.normalized_model
          AND sv.year = vc.Year
          -- Brand prefix matching: VOLVO TRUCK → Volvo
          AND (
            -- Shop make starts with AutoCare make (case insensitive)
            LOWER(REPLACE(sv.normalized_make, ' ', '')) LIKE LOWER(REPLACE(vc.normalized_make, ' ', '')) || '%'
            -- Or first word of shop make equals AutoCare make  
            OR LOWER(SPLIT_PART(sv.normalized_make, ' ', 1)) = LOWER(vc.normalized_make)
          )
        )
        WHERE sv.id NOT IN (SELECT id FROM exact_matches)
          AND sv.id NOT IN (SELECT id FROM format_variant_matches)
          AND sv.id NOT IN (SELECT id FROM suffix_variant_matches)
          AND sv.normalized_make != '' 
          AND sv.normalized_model != '' 
          AND sv.year > 0
          AND LENGTH(sv.normalized_make) >= LENGTH(vc.normalized_make)
      ),
      alphanumeric_pattern_matches AS (
        SELECT 
          sv.id,
          sv.make as original_make,
          sv.model as original_model,
          sv.year as original_year,
          vc.MakeID as make_id,
          vc.MakeName as make_name,
          vc.ModelID as model_id,
          vc.ModelName as model_name,
          vc.Year as year,
          vc.BaseVehicleID as base_vehicle_id,
          0.8 as confidence,
          'alphanumeric_pattern' as matching_method,
          5 as priority
        FROM shop_vehicles sv
        JOIN vehicle_combinations vc ON (
          sv.normalized_make = vc.normalized_make
          AND sv.year = vc.Year
          -- Handle Letter+Digit patterns: T8 → T800, T-800
          AND (
            -- Pattern: single letter + single digit (e.g., T8)
            (LENGTH(sv.normalized_model) = 2 
             AND SUBSTRING(sv.normalized_model, 1, 1) SIMILAR TO '[A-Za-z]'
             AND SUBSTRING(sv.normalized_model, 2, 1) SIMILAR TO '[0-9]'
             AND (
               -- T8 → T800
               LOWER(vc.normalized_model) LIKE LOWER(sv.normalized_model) || '00%'
               -- T8 → T-800  
               OR LOWER(vc.normalized_model) LIKE LOWER(SUBSTRING(sv.normalized_model, 1, 1)) || '-' || LOWER(SUBSTRING(sv.normalized_model, 2, 1)) || '00%'
               -- T8 → T8000
               OR LOWER(vc.normalized_model) LIKE LOWER(sv.normalized_model) || '000%'
             ))
          )
        )
        WHERE sv.id NOT IN (SELECT id FROM exact_matches)
          AND sv.id NOT IN (SELECT id FROM format_variant_matches)
          AND sv.id NOT IN (SELECT id FROM suffix_variant_matches)
          AND sv.id NOT IN (SELECT id FROM make_prefix_matches)
          AND sv.normalized_make != '' 
          AND sv.normalized_model != '' 
          AND sv.year > 0
      ),
      weighted_prefix_matches AS (
        SELECT 
          sv.id,
          sv.make as original_make,
          sv.model as original_model,
          sv.year as original_year,
          vc.MakeID as make_id,
          vc.MakeName as make_name,
          vc.ModelID as model_id,
          vc.ModelName as model_name,
          vc.Year as year,
          vc.BaseVehicleID as base_vehicle_id,
          -- Dynamic confidence based on prefix length ratio
          GREATEST(0.7, 0.7 + (LENGTH(sv.normalized_model) * 1.0 / LENGTH(vc.normalized_model)) * 0.2) as confidence,
          'weighted_prefix' as matching_method,
          6 as priority
        FROM shop_vehicles sv
        JOIN vehicle_combinations vc ON (
          sv.normalized_make = vc.normalized_make
          AND sv.year = vc.Year
          -- Model prefix matching with minimum length requirement
          AND LENGTH(sv.normalized_model) >= 2
          AND LOWER(vc.normalized_model) LIKE LOWER(sv.normalized_model) || '%'
          -- Ensure significant match (at least 40% of target length)
          AND LENGTH(sv.normalized_model) * 1.0 / LENGTH(vc.normalized_model) >= 0.4
        )
        WHERE sv.id NOT IN (SELECT id FROM exact_matches)
          AND sv.id NOT IN (SELECT id FROM format_variant_matches)
          AND sv.id NOT IN (SELECT id FROM suffix_variant_matches)
          AND sv.id NOT IN (SELECT id FROM make_prefix_matches)
          AND sv.id NOT IN (SELECT id FROM alphanumeric_pattern_matches)
          AND sv.normalized_make != '' 
          AND sv.normalized_model != '' 
          AND sv.year > 0
      ),
      year_flexible_matches AS (
        SELECT DISTINCT ON (sv.id)
          sv.id,
          sv.make as original_make,
          sv.model as original_model,
          sv.year as original_year,
          vc.MakeID as make_id,
          vc.MakeName as make_name,
          vc.ModelID as model_id,
          vc.ModelName as model_name,
          vc.Year as year,
          vc.BaseVehicleID as base_vehicle_id,
          -- Calculate confidence based on year difference
          CASE
            WHEN ABS(sv.year - vc.Year) <= 2 THEN 0.85
            WHEN ABS(sv.year - vc.Year) <= 5 THEN 0.75
            ELSE 0.65
          END as confidence,
          'year_flexible' as matching_method,
          6 as priority
        FROM shop_vehicles sv
        JOIN vehicle_combinations vc ON (
          sv.normalized_make = vc.normalized_make
          AND sv.normalized_model = vc.normalized_model
          -- Don't require exact year match for flexible matching
        )
        WHERE sv.id NOT IN (SELECT id FROM exact_matches)
          AND sv.id NOT IN (SELECT id FROM format_variant_matches)
          AND sv.id NOT IN (SELECT id FROM suffix_variant_matches)
          AND sv.id NOT IN (SELECT id FROM make_prefix_matches)
          AND sv.id NOT IN (SELECT id FROM alphanumeric_pattern_matches)
          AND sv.id NOT IN (SELECT id FROM weighted_prefix_matches)
          AND sv.normalized_make != '' 
          AND sv.normalized_model != '' 
          AND sv.year > 0
          -- Only use for vehicles that would otherwise fail to match
        ORDER BY sv.id, ABS(sv.year - vc.Year), vc.Year DESC
      ),
      make_only_matches AS (
        SELECT DISTINCT
          sv.id,
          sv.make as original_make,
          sv.model as original_model,
          sv.year as original_year,
          vc.MakeID as make_id,
          vc.MakeName as make_name,
          NULL as model_id,
          NULL as model_name,
          sv.year as year,  -- Keep original year
          NULL as base_vehicle_id,
          0.3 as confidence,  -- Lower confidence for make-only matches
          'make_only' as matching_method,
          7 as priority
        FROM shop_vehicles sv
        JOIN (
          SELECT DISTINCT MakeID, MakeName, normalized_make 
          FROM vehicle_combinations
        ) vc ON sv.normalized_make = vc.normalized_make
        WHERE sv.id NOT IN (SELECT id FROM exact_matches)
          AND sv.id NOT IN (SELECT id FROM format_variant_matches)
          AND sv.id NOT IN (SELECT id FROM suffix_variant_matches)
          AND sv.id NOT IN (SELECT id FROM make_prefix_matches)
          AND sv.id NOT IN (SELECT id FROM alphanumeric_pattern_matches)
          AND sv.id NOT IN (SELECT id FROM weighted_prefix_matches)
          AND sv.id NOT IN (SELECT id FROM year_flexible_matches)
          AND sv.normalized_make != ''
        LIMIT 1 -- Just pick first match per make
      )
      SELECT * FROM exact_matches
      UNION ALL
      SELECT * FROM format_variant_matches
      UNION ALL 
      SELECT * FROM suffix_variant_matches
      UNION ALL
      SELECT * FROM make_prefix_matches
      UNION ALL
      SELECT * FROM alphanumeric_pattern_matches
      UNION ALL
      SELECT * FROM weighted_prefix_matches
      UNION ALL
      SELECT * FROM year_flexible_matches
      UNION ALL 
      SELECT * FROM make_only_matches
      ORDER BY id, priority
    `);

    return result.getRowObjects();
  }

  /**
   * Execute simplified matching using Parquet key join (fast path)
   */
  private async executeMatchingQueryParquet(): Promise<any[]> {
    if (!this.connection) throw new Error('Connection not initialized');
    
    // Determine year tolerance from VehicleMatcher if available
    const tol = Math.max(0, Math.min(5, this.vehicleMatcher && typeof (this.vehicleMatcher as any).getYearRangeTolerance === 'function'
      ? (this.vehicleMatcher as any).getYearRangeTolerance()
      : 2));
    const offsets = Array.from({ length: tol * 2 + 1 }, (_, i) => i - tol)
      .map(n => `(${n})`).join(',');

    // Build normalized 3-segment keys from shop vehicles and join with vcdb_keys_3seg_norm
    const sql = `
      WITH shop AS (
        SELECT 
          id,
          make as original_make,
          model as original_model,
          year as original_year,
          -- UnifiedMatcher-like normalization
          REPLACE(LOWER(REGEXP_REPLACE(make, '[^a-zA-Z0-9_\\s]', '', 'g')), ' ', '') AS lm,
          REPLACE(LOWER(REGEXP_REPLACE(REGEXP_REPLACE(model, '\\s+series$', '', 'i'), '[^a-zA-Z0-9_\\s]', '', 'g')), ' ', '') AS lmd,
          CAST(year AS INTEGER) AS y
        FROM shop_vehicles
        WHERE COALESCE(make, '') <> '' AND COALESCE(model, '') <> '' AND year > 0
      ),
      year_off AS (
        -- Allow small year tolerance (-1, 0, +1)
        SELECT id, original_make, original_model, original_year, lm, lmd, y, off
        FROM shop, (VALUES ${offsets}) o(off)
        WHERE (y + off) BETWEEN 1900 AND 2100
      ),
      base AS (
        SELECT id, lm || '|' || lmd || '|' || CAST(y + off AS VARCHAR) AS key3, off, 1 AS var_pri FROM year_off
      ),
      no_dash AS (
        SELECT id, lm || '|' || REGEXP_REPLACE(lmd, '-', '', 'g') || '|' || CAST(y + off AS VARCHAR) AS key3, off, 2 AS var_pri FROM year_off
      ),
      insert_dash AS (
        SELECT id, lm || '|' || REGEXP_REPLACE(lmd, '([a-z])([0-9])', '\\1-\\2', 'g') || '|' || CAST(y + off AS VARCHAR) AS key3, off, 3 AS var_pri FROM year_off
      ),
      combined AS (
        SELECT * FROM base
        UNION ALL SELECT * FROM no_dash
        UNION ALL SELECT * FROM insert_dash
      ),
      ranked AS (
        SELECT 
          c.id,
          k.vehicle_config_id,
          c.off,
          c.var_pri,
          ROW_NUMBER() OVER (
            PARTITION BY c.id 
            ORDER BY ABS(c.off), c.var_pri, k.vehicle_config_id
          ) AS rn
        FROM combined c
        JOIN vcdb_keys_3seg_norm k ON k.key3 = c.key3
      ),
      hits AS (
        SELECT id, vehicle_config_id, off, var_pri
        FROM ranked
        WHERE rn = 1
      )
      SELECT 
        s.id,
        s.original_make,
        s.original_model,
        s.original_year,
        vrn.make_norm AS make_name,
        vrn.model_norm AS model_name,
        vr.year AS year,
        CAST(h.vehicle_config_id AS INTEGER) AS base_vehicle_id,
        CASE WHEN h.off = 0 AND h.var_pri = 1 THEN 0.98
             WHEN h.off = 0 THEN 0.96
             ELSE 0.95 END AS confidence,
        CASE 
          WHEN h.off = 0 AND h.var_pri = 1 THEN 'exact'
          WHEN h.off = 0 AND h.var_pri = 2 THEN 'model_no_dash'
          WHEN h.off = 0 AND h.var_pri = 3 THEN 'model_insert_dash'
          ELSE 'year_' || (CASE WHEN h.off > 0 THEN '+' ELSE '' END) || CAST(h.off AS VARCHAR) ||
               CASE h.var_pri WHEN 2 THEN '_model_no_dash' WHEN 3 THEN '_model_insert_dash' ELSE '' END
        END AS matching_method
      FROM hits h
      JOIN shop s ON s.id = h.id
      JOIN vcdb_rows_norm vrn ON vrn.vehicle_config_id = h.vehicle_config_id
      JOIN vcdb_rows vr ON vr.vehicle_config_id = h.vehicle_config_id
      ORDER BY s.id
    `;
    const result = await this.connection.runAndReadAll(sql);
    return result.getRowObjects();
  }

  /**
   * Create StandardizedVehicle from VehicleMatch with enhanced configuration
   */
  private createStandardizedVehicle(
    match: VehicleMatch,
    matcherResult?: VehicleMatchResult
  ): StandardizedVehicle {
    const standardizedVehicle: StandardizedVehicle = {
      makeId: match.makeId || 0,
      makeName: match.makeName || '',
      modelId: match.modelId || 0,
      modelName: match.modelName || '',
      year: match.year || 0,
      baseVehicleId: match.baseVehicleId || 0,
      vehicleId: undefined,
      subModelId: undefined,
      subModelName: undefined,
      confidence: match.confidence
    };

    if (matcherResult?.matched && matcherResult.standardizedVehicle) {
      const enhanced = matcherResult.standardizedVehicle;
      standardizedVehicle.baseVehicleId = enhanced.baseVehicleId ?? standardizedVehicle.baseVehicleId;
      standardizedVehicle.vehicleId = enhanced.vehicleId ?? standardizedVehicle.vehicleId;
      standardizedVehicle.subModelId = enhanced.subModelId ?? standardizedVehicle.subModelId;
      standardizedVehicle.subModelName = enhanced.subModelName ?? standardizedVehicle.subModelName;
      standardizedVehicle.vehicleTypeId = enhanced.vehicleTypeId ?? standardizedVehicle.vehicleTypeId;
      standardizedVehicle.vehicleType = enhanced.vehicleType ?? standardizedVehicle.vehicleType;
      standardizedVehicle.engine = enhanced.engine ?? standardizedVehicle.engine;
      standardizedVehicle.transmission = enhanced.transmission ?? standardizedVehicle.transmission;
      standardizedVehicle.body = enhanced.body ?? standardizedVehicle.body;
      standardizedVehicle.brakes = enhanced.brakes ?? standardizedVehicle.brakes;
    }

    // Enhance with configuration data if AutoCare data is available
    if (this.autoCareData && match.baseVehicleId) {
      this.enhanceVehicleWithConfiguration(standardizedVehicle, match.baseVehicleId, matcherResult);
    }

    return standardizedVehicle;
  }

  private prepareVehicleAlternatives(
    alternatives?: StandardizedVehicle[],
    primary?: StandardizedVehicle
  ): StandardizedVehicle[] | undefined {
    if (!alternatives || alternatives.length === 0) {
      return undefined;
    }

    const seen = new Set<string>();
    if (primary) {
      seen.add(`${primary.baseVehicleId}|${primary.vehicleId || ''}|${primary.subModelId || ''}`);
    }

    const deduped: StandardizedVehicle[] = [];
    for (const alt of alternatives) {
      if (!alt) continue;
      const key = `${alt.baseVehicleId}|${alt.vehicleId || ''}|${alt.subModelId || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push({
        ...alt,
        isAlternative: true
      });
    }

    return deduped.length > 0 ? deduped : undefined;
  }

  /**
   * Enhance vehicle with detailed configuration using AutoCare data
   */
  private enhanceVehicleWithConfiguration(
    vehicle: StandardizedVehicle,
    baseVehicleId: number,
    matcherResult?: VehicleMatchResult
  ): void {
    // If we have a VehicleMatcher, use it directly for enhancement (preferred method)
    if (this.vehicleMatcher) {
      const tempResult = matcherResult ?? this.vehicleMatcher.matchVehicle(
        String(vehicle.makeName),
        String(vehicle.modelName),
        Number(vehicle.year)
      );

      if (tempResult.matched && tempResult.standardizedVehicle) {
        vehicle.vehicleId = tempResult.standardizedVehicle.vehicleId ?? vehicle.vehicleId;
        vehicle.subModelId = tempResult.standardizedVehicle.subModelId ?? vehicle.subModelId;
        vehicle.subModelName = tempResult.standardizedVehicle.subModelName ?? vehicle.subModelName;
        vehicle.vehicleTypeId = tempResult.standardizedVehicle.vehicleTypeId ?? vehicle.vehicleTypeId;
        vehicle.vehicleType = tempResult.standardizedVehicle.vehicleType ?? vehicle.vehicleType;
        vehicle.engine = tempResult.standardizedVehicle.engine ?? vehicle.engine;
        vehicle.transmission = tempResult.standardizedVehicle.transmission ?? vehicle.transmission;
        vehicle.body = tempResult.standardizedVehicle.body ?? vehicle.body;
        vehicle.brakes = tempResult.standardizedVehicle.brakes ?? vehicle.brakes;
      }
    } else if (this.autoCareData) {
      // Find the base vehicle record from AutoCare data
      const baseVehicle = this.autoCareData.vcdb.baseVehicles.get(baseVehicleId);
      if (baseVehicle) {
        this.enhanceVehicleBasic(vehicle, baseVehicle);
      }
    }
  }

  /**
   * Basic vehicle enhancement when VehicleMatcher is not available
   */
  private enhanceVehicleBasic(vehicle: StandardizedVehicle, baseVehicle: VCdbBaseVehicle): void {
    if (!this.autoCareData) return;

    // Find related VehicleID records for this BaseVehicleID
    const relatedVehicles = Array.from(this.autoCareData.vcdb.vehicles.values())
      .filter(v => v.BaseVehicleID === baseVehicle.BaseVehicleID);

    if (relatedVehicles.length > 0) {
      const vcdbVehicle = relatedVehicles[0];
      vehicle.vehicleId = vcdbVehicle.VehicleID;

      // Add vehicle type information
      const model = this.autoCareData.vcdb.models.get(baseVehicle.ModelID);
      if (model && model.VehicleTypeID) {
        const vehicleType = this.autoCareData.vcdb.vehicleTypes.get(model.VehicleTypeID);
        if (vehicleType) {
          vehicle.vehicleTypeId = vehicleType.VehicleTypeID;
          vehicle.vehicleType = vehicleType.VehicleTypeName;
        }
      }

      // Add submodel if available
      if (vcdbVehicle.SubmodelID) {
        const subModel = this.autoCareData.vcdb.subModels.get(vcdbVehicle.SubmodelID);
        if (subModel) {
          vehicle.subModelId = subModel.SubmodelID;
          vehicle.subModelName = subModel.SubmodelName;
        }
      }

      // Note: Detailed configuration (engine, transmission, body, brakes) 
      // requires complex relationship lookups that are better handled by VehicleMatcher
      // For now, only add basic identification fields
    }
  }

  /**
   * Cleanup DuckDB resources
   */
  async cleanup(): Promise<void> {
    if (this.connection) {
      this.connection.disconnectSync();
      this.connection = null;
    }
    if (this.instance) {
      // Instance cleanup is handled automatically
      this.instance = null;
    }
    this.isLoaded = false;
  }
}
