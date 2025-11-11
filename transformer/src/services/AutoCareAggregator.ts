import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import { PartAttribute, PartInterchange, PartAsset, PartPackaging, PartPricing, PartAvailability, PartHazmat, PartDigitalAsset } from '../types/AutoCareTypes';
import * as path from 'path';
import * as fs from 'fs';

interface ShopPart {
  id: string;
  name: string;
  entityId: number;
}

interface AutoCareMatch {
  partTerminologyId: number;
  partTerminologyName: string;
  partsDescriptionId: number;
  confidence: number;
  matchingMethod: 'exact' | 'fuzzy' | 'description' | 'keyword' | 'attribute';
  descriptions: string[];
  relatedParts: AutoCareRelatedPart[];
  aliases: string[];
  supersessions: AutoCareSupersession[];
  // Enhanced data from existing sources
  category?: {
    primaryCategory: string;
    subCategory?: string;
    categoryConfidence: number;
    categorySource: 'name_pattern' | 'description' | 'terminology';
  };
  technicalSpecifications?: {
    specType: 'dimension' | 'weight' | 'material' | 'electrical' | 'performance' | 'compatibility';
    name: string;
    value: string;
    unit?: string;
    confidence: number;
  }[];
  // Extended PIES data
  attributes?: PartAttribute[];
  interchangeableParts?: PartInterchange[];
  assets?: PartAsset[];
  packaging?: PartPackaging;
  pricing?: PartPricing[];
  availability?: PartAvailability[];
  hazmat?: PartHazmat;
  digitalAssets?: PartDigitalAsset[];
}

interface AutoCareRelatedPart {
  partTerminologyId: number;
  partTerminologyName: string;
  relationshipType: string;
}

interface AutoCareSupersession {
  partTerminologyId: number;
  partTerminologyName: string;
  type: 'supersedes' | 'superseded_by';
}

interface EntityMatchingProfile {
  entityId: number;
  totalUniqueParts: number;
  mostFrequentParts: Array<{
    partTerminologyId: number;
    partTerminologyName: string;
    frequency: number;
    match: AutoCareMatch;
  }>;
}

export class AutoCareAggregator {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  private vcdbPath: string;
  private pcdbPath: string;
  private initialized = false;
  private matchCache = new Map<string, AutoCareMatch>();
  
  // mapping table for part terminology
  private readonly synonymMap = new Map<string, string>([
    // mapping for part terminology
    ['hyd', 'hydraulic'],
    ['hyd.', 'hydraulic'],
    ['hydr', 'hydraulic'],
    ['fuel', 'fuel'],
    ['eng', 'engine'],
    ['eng.', 'engine'],
    ['a/c', 'air conditioning'],
    ['ac', 'air conditioning'],
    
    // Note: Hyphenated formats are directly processed as uppercase in lines 807-810, avoiding duplicate mapping
    
    // Key part mappings - solving unmatched issues
    // Note: Oil filter and spark plugs are directly processed in lines 816-817, avoiding duplication
    ['fuel filter', 'fuel filter'],         // Fuel filter 
    ['hydraulic filter', 'hydraulic filter'], // Hydraulic filter
    ['coolant', 'engine coolant'],          // Coolant mapping
    ['battery', 'battery assembly'],        // Battery mapping
    
    // O-Ring related - mapping to specific parts (avoiding secondary replacement of seal)
    ['o-ring', 'ENGINE OIL SEAL'],         // Direct uppercase conversion to avoid secondary seal replacement
    ['o ring', 'ENGINE OIL SEAL'],
    
    // Generic part mapping to specific types
    ['bearing', 'engine bearing'],         // Bearing mapping to engine bearing
    ['gasket', 'engine gasket'],           // Gasket mapping to engine gasket
    
    // Other common abbreviations
    ['gasoline', 'gasoline'],
    ['diesel', 'diesel'],
    ['trans', 'transmission'],
    ['diff', 'differential'],
    ['alt', 'alternator'],
    ['gen', 'generator'],
    ['starter', 'starter'],
    ['batt', 'battery'],
    ['elec', 'electrical'],
    ['mech', 'mechanical']
  ]);
  
  // Non-part items exclusion list
  private readonly nonPartItems = new Set([
    'freight',
    'shipping',
    'inbound',
    'outbound',
    'labor',
    'service',
    'inspection',
    'diagnostic',
    'disposal',
    'environmental fee',
    'shop supplies',
    'misc',
    'miscellaneous',
    'tax',
    'discount',
    'credit',
    'core charge'
  ]);

  constructor(vcdbPath: string, pcdbPath: string) {
    this.vcdbPath = vcdbPath;
    this.pcdbPath = pcdbPath;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🦆 Initializing DuckDB AutoCare aggregator...');

    try {
      // Create in-memory DuckDB instance for maximum performance
      this.instance = await DuckDBInstance.create(':memory:');
      this.connection = await this.instance.connect();

      // Load all AutoCare data into memory
      await this.loadAutoCareData();

      // Create indexes for optimal query performance
      await this.createIndexes();

      // Build pre-aggregated views
      await this.createAggregatedViews();

      this.initialized = true;
      console.log('✅ DuckDB AutoCare aggregator initialized successfully');

      // Log data statistics
      await this.logDataStatistics();

    } catch (error) {
      console.error('❌ Failed to initialize AutoCare aggregator:', (error as Error).message);
      throw error;
    }
  }

  private async loadAutoCareData(): Promise<void> {
    if (!this.connection) throw new Error('DuckDB connection not initialized');

    console.log('📥 Loading AutoCare data files into DuckDB...');

    // Load Parts.json
    const partsPath = path.join(this.pcdbPath, 'Parts.json');
    if (fs.existsSync(partsPath)) {
      console.log('  📄 Loading Parts.json...');
      await this.connection.run(`
        CREATE TABLE parts AS 
        SELECT * FROM read_json_auto('${partsPath.replace(/'/g, "''")}')
      `);
    } else {
      throw new Error(`Parts.json not found at ${partsPath}`);
    }

    // Load PartsDescription.json
    const descriptionsPath = path.join(this.pcdbPath, 'PartsDescription.json');
    if (fs.existsSync(descriptionsPath)) {
      console.log('  📄 Loading PartsDescription.json...');
      await this.connection.run(`
        CREATE TABLE part_descriptions AS 
        SELECT * FROM read_json_auto('${descriptionsPath.replace(/'/g, "''")}')
      `);
    }

    // Load PartsRelationship.json
    const relationshipsPath = path.join(this.pcdbPath, 'PartsRelationship.json');
    if (fs.existsSync(relationshipsPath)) {
      console.log('  📄 Loading PartsRelationship.json...');
      await this.connection.run(`
        CREATE TABLE part_relationships AS 
        SELECT * FROM read_json_auto('${relationshipsPath.replace(/'/g, "''")}')
      `);
    }

    // Load PartsSupersession.json
    const supersessionPath = path.join(this.pcdbPath, 'PartsSupersession.json');
    if (fs.existsSync(supersessionPath)) {
      console.log('  📄 Loading PartsSupersession.json...');
      await this.connection.run(`
        CREATE TABLE part_supersessions AS 
        SELECT * FROM read_json_auto('${supersessionPath.replace(/'/g, "''")}')
      `);
    }

    // Load Alias.json and PartsToAlias.json
    const aliasPath = path.join(this.pcdbPath, 'Alias.json');
    const partsToAliasPath = path.join(this.pcdbPath, 'PartsToAlias.json');

    if (fs.existsSync(aliasPath) && fs.existsSync(partsToAliasPath)) {
      console.log('  📄 Loading Alias data...');

      // Create temporary tables for the join (drop if exists to avoid conflicts)
      await this.connection.run(`DROP TABLE IF EXISTS temp_aliases`);
      await this.connection.run(`
        CREATE TEMP TABLE temp_aliases AS
        SELECT * FROM read_json_auto('${aliasPath.replace(/'/g, "''")}')
      `);

      await this.connection.run(`DROP TABLE IF EXISTS temp_parts_to_alias`);
      await this.connection.run(`
        CREATE TEMP TABLE temp_parts_to_alias AS
        SELECT * FROM read_json_auto('${partsToAliasPath.replace(/'/g, "''")}')
      `);

      // Join and create final alias table
      await this.connection.run(`
        CREATE TABLE part_aliases AS
        SELECT 
          pa.PartTerminologyID,
          a.AliasID,
          a.AliasName
        FROM temp_parts_to_alias pa
        JOIN temp_aliases a ON pa.AliasID = a.AliasID
      `);
    }

    // Load extended PIES data sources
    await this.loadExtendedPiesData();

    // Create match frequency tracking table with proper constraints
    await this.connection.run(`
      CREATE TABLE IF NOT EXISTS match_frequency (
        normalized_name VARCHAR PRIMARY KEY,
        part_terminology_id INTEGER NOT NULL,
        entity_id INTEGER NOT NULL,
        original_names VARCHAR[], -- Store all original variations
        frequency INTEGER DEFAULT 1,
        CHECK (part_terminology_id > 0),
        CHECK (entity_id > 0)
      )
    `);
  }

  /**
   * Load extended PIES data sources for enhanced part matching
   */
  private async loadExtendedPiesData(): Promise<void> {
    if (!this.connection) return;

    console.log('📥 Loading extended PIES data sources...');

    // Load PartAttribute.json
    const attributesPath = path.join(this.pcdbPath, 'PartAttribute.json');
    if (fs.existsSync(attributesPath)) {
      console.log('  📄 Loading PartAttribute.json...');
      await this.connection.run(`
        CREATE TABLE part_attributes AS 
        SELECT * FROM read_json_auto('${attributesPath.replace(/'/g, "''")}')
      `);
    }

    // Load PartInterchange.json
    const interchangePath = path.join(this.pcdbPath, 'PartInterchange.json');
    if (fs.existsSync(interchangePath)) {
      console.log('  📄 Loading PartInterchange.json...');
      await this.connection.run(`
        CREATE TABLE part_interchange AS 
        SELECT * FROM read_json_auto('${interchangePath.replace(/'/g, "''")}')
      `);
    }

    // Load PartAsset.json
    const assetsPath = path.join(this.pcdbPath, 'PartAsset.json');
    if (fs.existsSync(assetsPath)) {
      console.log('  📄 Loading PartAsset.json...');
      await this.connection.run(`
        CREATE TABLE part_assets AS 
        SELECT * FROM read_json_auto('${assetsPath.replace(/'/g, "''")}')
      `);
    }

    // Load PartPackaging.json
    const packagingPath = path.join(this.pcdbPath, 'PartPackaging.json');
    if (fs.existsSync(packagingPath)) {
      console.log('  📄 Loading PartPackaging.json...');
      await this.connection.run(`
        CREATE TABLE part_packaging AS 
        SELECT * FROM read_json_auto('${packagingPath.replace(/'/g, "''")}')
      `);
    }

    // Load PartPricing.json
    const pricingPath = path.join(this.pcdbPath, 'PartPricing.json');
    if (fs.existsSync(pricingPath)) {
      console.log('  📄 Loading PartPricing.json...');
      await this.connection.run(`
        CREATE TABLE part_pricing AS 
        SELECT * FROM read_json_auto('${pricingPath.replace(/'/g, "''")}')
      `);
    }

    // Load PartAvailability.json
    const availabilityPath = path.join(this.pcdbPath, 'PartAvailability.json');
    if (fs.existsSync(availabilityPath)) {
      console.log('  📄 Loading PartAvailability.json...');
      await this.connection.run(`
        CREATE TABLE part_availability AS 
        SELECT * FROM read_json_auto('${availabilityPath.replace(/'/g, "''")}')
      `);
    }

    // Load PartHazmat.json
    const hazmatPath = path.join(this.pcdbPath, 'PartHazmat.json');
    if (fs.existsSync(hazmatPath)) {
      console.log('  📄 Loading PartHazmat.json...');
      await this.connection.run(`
        CREATE TABLE part_hazmat AS 
        SELECT * FROM read_json_auto('${hazmatPath.replace(/'/g, "''")}')
      `);
    }

    // Load PartDigitalAsset.json
    const digitalAssetsPath = path.join(this.pcdbPath, 'PartDigitalAsset.json');
    if (fs.existsSync(digitalAssetsPath)) {
      console.log('  📄 Loading PartDigitalAsset.json...');
      await this.connection.run(`
        CREATE TABLE part_digital_assets AS 
        SELECT * FROM read_json_auto('${digitalAssetsPath.replace(/'/g, "''")}')
      `);
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.connection) return;

    console.log('🔍 Creating performance indexes...');

    const indexes = [
      // Core PIES indexes
      'CREATE INDEX idx_parts_name ON parts(PartTerminologyName)',
      'CREATE INDEX idx_part_descriptions_id ON part_descriptions(PartsDescriptionID)',
      'CREATE INDEX idx_relationships_from ON part_relationships(PartTerminologyID)',
      'CREATE INDEX idx_relationships_to ON part_relationships(RelatedPartTerminologyID)',
      'CREATE INDEX idx_supersessions_old ON part_supersessions(OldPartTerminologyID)',
      'CREATE INDEX idx_supersessions_new ON part_supersessions(NewPartTerminologyID)',
      'CREATE INDEX idx_aliases_part ON part_aliases(PartTerminologyID)',
      'CREATE INDEX idx_match_freq_name ON match_frequency(normalized_name)',
      'CREATE INDEX idx_match_freq_entity ON match_frequency(entity_id)',
      
      // Extended PIES indexes
      'CREATE INDEX idx_part_attributes_part ON part_attributes(partTerminologyId)',
      'CREATE INDEX idx_part_attributes_name ON part_attributes(attributeName)',
      'CREATE INDEX idx_part_interchange_part ON part_interchange(partTerminologyId)',
      'CREATE INDEX idx_part_interchange_brand ON part_interchange(brandId)',
      'CREATE INDEX idx_part_assets_part ON part_assets(partTerminologyId)',
      'CREATE INDEX idx_part_assets_type ON part_assets(assetType)',
      'CREATE INDEX idx_part_packaging_part ON part_packaging(partTerminologyId)',
      'CREATE INDEX idx_part_pricing_part ON part_pricing(partTerminologyId)',
      'CREATE INDEX idx_part_availability_part ON part_availability(partTerminologyId)',
      'CREATE INDEX idx_part_hazmat_part ON part_hazmat(partTerminologyId)',
      'CREATE INDEX idx_part_digital_assets_part ON part_digital_assets(partTerminologyId)'
    ];

    for (const indexSql of indexes) {
      try {
        await this.connection.run(indexSql);
      } catch (error) {
        console.warn(`Warning: Could not create index: ${indexSql.split(' ')[2]}`);
      }
    }
  }

  private async getExistingTables(): Promise<string[]> {
    if (!this.connection) return [];
    
    try {
      // Use DuckDB's SHOW TABLES command
      const result = await this.connection.runAndReadAll('SHOW TABLES');
      const tables: string[] = [];
      
      for (const row of result.getRowObjects()) {
        // DuckDB SHOW TABLES returns different column names depending on version
        const tableName = row.name || row.table_name || row.Name || Object.values(row)[0];
        if (tableName && typeof tableName === 'string') {
          tables.push(tableName);
        }
      }
      
      return tables;
    } catch (error) {
      console.warn('⚠️ Could not determine existing tables, assuming basic tables only:', (error as Error).message);
      return ['parts', 'part_descriptions', 'part_relationships', 'part_supersessions', 'part_aliases'];
    }
  }

  private async createAggregatedViews(): Promise<void> {
    if (!this.connection) return;

    console.log('🔨 Creating aggregated views for fast matching...');

    try {
      // Check which tables exist to build appropriate view
      const existingTables = await this.getExistingTables();
      console.log('📋 Available tables:', existingTables.join(', '));
      
      // Build the view SQL dynamically based on available tables
      let viewSql = `
        CREATE VIEW enriched_parts AS
        SELECT 
          p.PartTerminologyID,
          p.PartTerminologyName,
          -- Aggregate descriptions
          COALESCE(STRING_AGG(DISTINCT pd.PartsDescription, ' | '), '') as all_descriptions,
          -- Related parts
          COALESCE(STRING_AGG(DISTINCT CAST(pr.RelatedPartTerminologyID AS VARCHAR), ','), '') as related_part_ids,
          -- Supersessions  
          COALESCE(STRING_AGG(DISTINCT CAST(ps_new.NewPartTerminologyID AS VARCHAR), ','), '') as superseded_by_ids,
          COALESCE(STRING_AGG(DISTINCT CAST(ps_old.OldPartTerminologyID AS VARCHAR), ','), '') as supersedes_ids,
          -- Aliases
          COALESCE(STRING_AGG(DISTINCT pa.aliasName, ' | '), '') as all_aliases`;
      
      // Add extended PIES data only if tables exist
      if (existingTables.includes('part_attributes')) {
        viewSql += `,
          -- Extended PIES data aggregation
          COALESCE(STRING_AGG(DISTINCT attr.attributeName || ':' || attr.attributeValue, ' | '), '') as all_attributes`;
      } else {
        viewSql += `,
          '' as all_attributes`;
      }
      
      if (existingTables.includes('part_interchange')) {
        viewSql += `,
          COALESCE(STRING_AGG(DISTINCT CAST(ic.interchangePartNumber AS VARCHAR), ','), '') as interchange_parts`;
      } else {
        viewSql += `,
          '' as interchange_parts`;
      }
      
      if (existingTables.includes('part_assets')) {
        viewSql += `,
          COALESCE(STRING_AGG(DISTINCT ast.assetUrl, ' | '), '') as asset_urls`;
      } else {
        viewSql += `,
          '' as asset_urls`;
      }
      
      // Build normalized name based on available data
      viewSql += `,
          -- Normalized searchable text for matching
          LOWER(REGEXP_REPLACE(
            p.PartTerminologyName`;
      
      if (existingTables.includes('part_attributes')) {
        viewSql += ` || ' ' || COALESCE(STRING_AGG(DISTINCT attr.attributeValue, ' '), '')`;
      }
      
      if (existingTables.includes('part_interchange')) {
        viewSql += ` || ' ' || COALESCE(STRING_AGG(DISTINCT ic.brandName, ' '), '')`;
      }
      
      viewSql += `, 
            '[^a-zA-Z0-9\\s]', '', 'g'
          )) as normalized_name
        FROM parts p
        LEFT JOIN part_descriptions pd ON p.PartsDescriptionId = pd.PartsDescriptionID
        LEFT JOIN part_relationships pr ON p.PartTerminologyID = pr.PartTerminologyID
        LEFT JOIN part_supersessions ps_new ON p.PartTerminologyID = ps_new.OldPartTerminologyID
        LEFT JOIN part_supersessions ps_old ON p.PartTerminologyID = ps_old.NewPartTerminologyID  
        LEFT JOIN part_aliases pa ON p.PartTerminologyID = pa.PartTerminologyID`;
      
      // Add JOINs only for existing tables
      if (existingTables.includes('part_attributes')) {
        viewSql += `
        LEFT JOIN part_attributes attr ON p.PartTerminologyID = attr.partTerminologyId`;
      }
      
      if (existingTables.includes('part_interchange')) {
        viewSql += `
        LEFT JOIN part_interchange ic ON p.PartTerminologyID = ic.partTerminologyId`;
      }
      
      if (existingTables.includes('part_assets')) {
        viewSql += `
        LEFT JOIN part_assets ast ON p.PartTerminologyID = ast.partTerminologyId AND ast.isPrimary = true`;
      }
      
      viewSql += `
        GROUP BY p.PartTerminologyID, p.PartTerminologyName`;
      
      await this.connection.run(viewSql);
      console.log('✅ Created enriched_parts view successfully');
    } catch (error) {
      console.error('❌ Failed to create enriched_parts view:', (error as Error).message);
      throw error;
    }

    // Create searchable text index for fuzzy matching
    // Note: Using simpler approach due to DuckDB UNNEST limitations in views
    await this.connection.run(`
      CREATE TABLE searchable_parts AS
      WITH split_text AS (
        SELECT 
          PartTerminologyID,
          PartTerminologyName,
          normalized_name,
          UPPER(
            PartTerminologyName || ' ' || 
            COALESCE(all_descriptions, '') || ' ' || 
            COALESCE(all_aliases, '')
          ) as searchable_text
        FROM enriched_parts
      ),
      keywords AS (
        SELECT 
          PartTerminologyID,
          PartTerminologyName,
          normalized_name,
          searchable_text,
          -- Create multiple keyword patterns for matching
          REGEXP_EXTRACT_ALL(searchable_text, '\\b\\w{3,}\\b') as keywords_array
        FROM split_text
      )
      SELECT 
        PartTerminologyID,
        PartTerminologyName,
        normalized_name,
        searchable_text,
        keywords_array
      FROM keywords
    `);
  }

  private async logDataStatistics(): Promise<void> {
    if (!this.connection) return;

    try {
      const partsCount = await this.connection.runAndReadAll('SELECT COUNT(*) as count FROM parts');
      const descriptionsCount = await this.connection.runAndReadAll('SELECT COUNT(*) as count FROM part_descriptions');
      const relationshipsCount = await this.connection.runAndReadAll('SELECT COUNT(*) as count FROM part_relationships');
      const supersessionsCount = await this.connection.runAndReadAll('SELECT COUNT(*) as count FROM part_supersessions');
      const aliasesCount = await this.connection.runAndReadAll('SELECT COUNT(*) as count FROM part_aliases');

      console.log('📊 AutoCare data statistics:');
      console.log(`   • Parts: ${Number(partsCount.getRows()[0][0]).toLocaleString()}`);
      console.log(`   • Descriptions: ${Number(descriptionsCount.getRows()[0][0]).toLocaleString()}`);
      console.log(`   • Relationships: ${Number(relationshipsCount.getRows()[0][0]).toLocaleString()}`);
      console.log(`   • Supersessions: ${Number(supersessionsCount.getRows()[0][0]).toLocaleString()}`);
      console.log(`   • Aliases: ${Number(aliasesCount.getRows()[0][0]).toLocaleString()}`);
      
      // Log extended PIES data statistics
      await this.logExtendedPiesStatistics();
    } catch (error) {
      console.warn('Could not retrieve data statistics:', (error as Error).message);
    }
  }

  /**
   * Log statistics for extended PIES data
   */
  private async logExtendedPiesStatistics(): Promise<void> {
    if (!this.connection) return;

    try {
      const tables = [
        { name: 'part_attributes', label: 'Attributes' },
        { name: 'part_interchange', label: 'Interchange' },
        { name: 'part_assets', label: 'Assets' },
        { name: 'part_packaging', label: 'Packaging' },
        { name: 'part_pricing', label: 'Pricing' },
        { name: 'part_availability', label: 'Availability' },
        { name: 'part_hazmat', label: 'Hazmat' },
        { name: 'part_digital_assets', label: 'Digital Assets' }
      ];

      console.log('📊 Extended PIES data statistics:');
      
      for (const table of tables) {
        try {
          const result = await this.connection.runAndReadAll(`SELECT COUNT(*) as count FROM ${table.name}`);
          const count = Number(result.getRows()[0][0]);
          if (count > 0) {
            console.log(`   • ${table.label}: ${count.toLocaleString()}`);
          }
        } catch {
          // Table doesn't exist, skip silently
        }
      }
    } catch (error) {
      console.warn('Could not retrieve extended PIES statistics:', (error as Error).message);
    }
  }

  // Batch matching - the key to 90% efficiency improvement
  async batchMatchParts(shopParts: ShopPart[]): Promise<Map<string, AutoCareMatch | null>> {
    if (!this.connection) throw new Error('DuckDB connection not initialized');

    const results = new Map<string, AutoCareMatch | null>();
    const uncachedParts: ShopPart[] = [];

    // First pass: check cache and filter non-parts
    for (const part of shopParts) {
      const normalized = this.normalizeName(part.name);
      
      // Skip non-part items (return empty string after normalization)
      if (!normalized) {
        // console.log(`   ⏭️  Skipping non-part item: "${part.name}"`);
        results.set(part.id, null);
        continue;
      }
      
      const cached = this.matchCache.get(normalized);
      if (cached) {
        results.set(part.id, cached);
        await this.recordMatch(normalized, cached.partTerminologyId, part.entityId, part.name);
      } else {
        uncachedParts.push(part);
      }
    }

    if (uncachedParts.length === 0) {
      console.log(`🎯 100% cache hit rate for ${shopParts.length} parts`);
      return results;
    }

    console.log(`🔍 Processing ${uncachedParts.length}/${shopParts.length} uncached parts...`);

    // Create temporary table for batch processing (drop if exists to avoid conflicts)
    await this.connection.run(`DROP TABLE IF EXISTS shop_parts_batch`);
    await this.connection.run(`
      CREATE TEMP TABLE shop_parts_batch (
        shop_part_id VARCHAR,
        original_name VARCHAR,
        normalized_name VARCHAR,
        entity_id INTEGER
      )
    `);

    // Use appender for efficient bulk insert, filter out non-parts
    const appender = await this.connection.createAppender('shop_parts_batch');
    const validParts: ShopPart[] = [];
    
    for (const part of uncachedParts) {
      const normalized = this.normalizeName(part.name);
      
      // Skip non-part items
      if (!normalized) {
        // console.log(`   ⏭️  Skipping non-part item: "${part.name}"`);
        results.set(part.id, null);
        continue;
      }
      
      appender.appendVarchar(part.id);
      appender.appendVarchar(part.name);
      appender.appendVarchar(normalized);
      appender.appendInteger(part.entityId);
      appender.endRow();
      validParts.push(part);
    }
    appender.closeSync();
    
    // Update uncachedParts to valid parts
    const originalCount = uncachedParts.length;
    uncachedParts.length = 0;
    // Use loop to avoid stack overflow with spread operator on large arrays
    for (const part of validParts) {
      uncachedParts.push(part);
    }
    
    if (validParts.length < originalCount) {
      console.log(`   🗑️  Filtered out ${originalCount - validParts.length} non-part items`);
    }

    // Batch exact match
    const exactMatches = await this.connection.runAndReadAll(`
      SELECT DISTINCT
        spb.shop_part_id,
        spb.original_name,
        spb.normalized_name,
        spb.entity_id,
        ep.PartTerminologyID,
        ep.PartTerminologyName,
        ep.all_descriptions,
        ep.related_part_ids,
        ep.superseded_by_ids,
        ep.supersedes_ids,
        ep.all_aliases,
        1.0 as confidence,
        'exact' as matching_method
      FROM shop_parts_batch spb
      JOIN enriched_parts ep ON spb.normalized_name = ep.normalized_name
    `);

    // Process exact matches
    for (const row of exactMatches.getRowObjects()) {
      // Validate required fields to prevent NaN errors
      if (!row.PartTerminologyID || isNaN(Number(row.PartTerminologyID)) ||
        !row.entity_id || isNaN(Number(row.entity_id))) {
        console.warn(`Skipping invalid exact match: partId=${row.PartTerminologyID}, entityId=${row.entity_id}`);
        continue;
      }

      const match = await this.buildAutoCareMatch(row);
      
      // Debug log for confidence tracking in exact match
      if ((row.original_name && String(row.original_name).toLowerCase().includes('machine')) || 
          (row.PartTerminologyName && String(row.PartTerminologyName).toLowerCase().includes('machine'))) {
        console.log(`[CONFIDENCE_DEBUG] AutoCareAggregator: Exact match processed`, {
          shopPartName: row.original_name,
          matchedPartName: row.PartTerminologyName,
          finalConfidence: match.confidence,
          matchingMethod: match.matchingMethod,
          source: 'autocare_aggregator_exact'
        });
      }
      
      results.set(String(row.shop_part_id), match);
      this.matchCache.set(String(row.normalized_name), match);

      const partId = Number(row.PartTerminologyID);
      const entId = Number(row.entity_id);
      await this.recordMatch(String(row.normalized_name), partId, entId, String(row.original_name));
    }

    // Fuzzy matching for unmatched parts
    const matchedIds = new Set(exactMatches.getRowObjects().map(r => r.shop_part_id));
    const unmatchedParts = uncachedParts.filter(p => !matchedIds.has(p.id));

    if (unmatchedParts.length > 0) {
      console.log(`🔍 Attempting fuzzy matching for ${unmatchedParts.length} parts...`);
      await this.batchFuzzyMatch(unmatchedParts, results);
    }

    // Mark unmatched parts
    for (const part of uncachedParts) {
      if (!results.has(part.id)) {
        results.set(part.id, null);
        const nullMatch = null as any; // Type assertion for null cache value
        this.matchCache.set(this.normalizeName(part.name), nullMatch);
      }
    }

    console.log(`✅ Batch matching completed: ${results.size - shopParts.length + uncachedParts.length} new matches cached`);

    return results;
  }

  private async batchFuzzyMatch(unmatchedParts: ShopPart[], results: Map<string, AutoCareMatch | null>): Promise<void> {
    if (!this.connection) return;

    // Limit fuzzy matching to improve performance (max 1000 parts per batch)
    const MAX_FUZZY_PARTS = 1000;
    const partsToProcess = unmatchedParts.slice(0, MAX_FUZZY_PARTS);
    
    if (partsToProcess.length < unmatchedParts.length) {
      console.log(`   ⚡ Limiting fuzzy matching to ${partsToProcess.length} parts for performance`);
    }

    // Create temporary table for fuzzy matching (drop if exists to avoid conflicts)
    await this.connection.run(`DROP TABLE IF EXISTS unmatched_parts`);
    await this.connection.run(`
      CREATE TEMP TABLE unmatched_parts AS
      SELECT 
        shop_part_id,
        original_name,
        normalized_name,
        entity_id
      FROM shop_parts_batch 
      WHERE shop_part_id IN (${partsToProcess.map(p => `'${p.id.replace(/'/g, "''")}'`).join(',')})
    `);

    // Enhanced fuzzy matching with word-level matching and better scoring
    const fuzzyMatches = await this.connection.runAndReadAll(`
      WITH word_matches AS (
        SELECT 
          up.shop_part_id,
          up.original_name,
          up.normalized_name,
          up.entity_id,
          sp.PartTerminologyID,
          sp.PartTerminologyName,
          sp.searchable_text,
          -- Split normalized names into words for better matching
          STRING_SPLIT(up.normalized_name, ' ') as shop_words,
          STRING_SPLIT(sp.searchable_text, ' ') as catalog_words
        FROM unmatched_parts up
        CROSS JOIN searchable_parts sp
        WHERE LENGTH(up.normalized_name) >= 3
          AND LENGTH(sp.searchable_text) >= 3
          AND ABS(LENGTH(up.normalized_name) - LENGTH(sp.searchable_text)) <= 30
          -- Skip very generic single words that would match too many things
          AND NOT (LENGTH(up.normalized_name) <= 5 AND POSITION(' ' IN up.normalized_name) = 0)
      ),
      calculated_matches AS (
        SELECT 
          wm.*,
          -- Enhanced confidence scoring with multiple criteria
          CASE 
            -- Exact match highest score (now all uppercase)
            WHEN wm.normalized_name = wm.searchable_text THEN 1.0
            -- Complete substring match (now all uppercase)
            WHEN POSITION(wm.normalized_name IN wm.searchable_text) > 0 THEN 0.9
            -- Same word order but different sequence
            WHEN list_intersect(wm.shop_words, wm.catalog_words) = wm.shop_words THEN 0.85
            -- Major word match (more than half of words match)
            WHEN len(list_intersect(wm.shop_words, wm.catalog_words)) * 2 > len(wm.shop_words) THEN 0.75
            -- Key word match (first word matches)
            WHEN len(wm.shop_words) > 0 AND len(wm.catalog_words) > 0 
                 AND wm.shop_words[1] = wm.catalog_words[1] THEN 0.7
            -- Any word match
            WHEN len(list_intersect(wm.shop_words, wm.catalog_words)) > 0 THEN 0.6
            -- Prefix match as fallback (now all uppercase)
            WHEN POSITION(SUBSTRING(wm.normalized_name, 1, 5) IN wm.searchable_text) > 0 THEN 0.5
            WHEN POSITION(SUBSTRING(wm.normalized_name, 1, 3) IN wm.searchable_text) > 0 THEN 0.4
            ELSE 0.0
          END as confidence_score,
          -- Calculate matched word count as quality indicator
          len(list_intersect(wm.shop_words, wm.catalog_words)) as matched_words_count,
          len(wm.shop_words) as shop_words_count
        FROM word_matches wm
      ),
      filtered_matches AS (
        SELECT * FROM calculated_matches
        WHERE confidence_score > 0.3  -- Apply confidence filter after calculation
      ),
      ranked_matches AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY shop_part_id 
            ORDER BY 
              confidence_score DESC, 
              matched_words_count DESC,  -- Prioritize results with more matched words
              LENGTH(PartTerminologyName) ASC  -- Shorter names are usually more accurate
          ) as rank
        FROM filtered_matches
      )
      SELECT 
        rm.*,
        ep.all_descriptions,
        ep.related_part_ids,
        ep.superseded_by_ids,
        ep.supersedes_ids,
        ep.all_aliases,
        'fuzzy' as matching_method
      FROM ranked_matches rm
      JOIN enriched_parts ep ON rm.PartTerminologyID = ep.PartTerminologyID
      WHERE rank = 1  -- Only best match per shop part
      LIMIT 200  -- Safety limit to prevent excessive results
    `);

    console.log(`   📊 Found ${fuzzyMatches.getRowObjects().length} fuzzy matches`);

    // Process fuzzy matches
    for (const row of fuzzyMatches.getRowObjects()) {
      // Validate required fields to prevent NaN errors
      if (!row.PartTerminologyID || isNaN(Number(row.PartTerminologyID)) ||
        !row.entity_id || isNaN(Number(row.entity_id))) {
        console.warn(`Skipping invalid fuzzy match: partId=${row.PartTerminologyID}, entityId=${row.entity_id}`);
        continue;
      }

      const match = await this.buildAutoCareMatch(row);
      const originalConfidence = Number(row.confidence_score);
      match.confidence = Math.min(originalConfidence, 0.9); // Cap fuzzy confidence at 0.9
      match.matchingMethod = 'fuzzy';
      
      // Debug log for confidence tracking
      if ((row.original_name && String(row.original_name).toLowerCase().includes('machine')) || 
          (row.PartTerminologyName && String(row.PartTerminologyName).toLowerCase().includes('machine'))) {
        console.log(`[CONFIDENCE_DEBUG] AutoCareAggregator: Fuzzy match processed`, {
          shopPartName: row.original_name,
          matchedPartName: row.PartTerminologyName,
          originalConfidenceScore: originalConfidence,
          cappedConfidence: match.confidence,
          source: 'autocare_aggregator_fuzzy'
        });
      }
      results.set(String(row.shop_part_id), match);
      this.matchCache.set(String(row.normalized_name), match);

      const partId = Number(row.PartTerminologyID);
      const entId = Number(row.entity_id);
      await this.recordMatch(String(row.normalized_name), partId, entId, String(row.original_name));
    }

    console.log(`✅ Fuzzy matching completed for ${partsToProcess.length} parts`);
  }

  private async buildAutoCareMatch(row: any): Promise<AutoCareMatch> {
    if (!this.connection) throw new Error('DuckDB connection not initialized');

    // Build related parts array
    const relatedParts: AutoCareRelatedPart[] = [];
    if (row.related_part_ids) {
      const relatedIds = row.related_part_ids.split(',').filter(Boolean);
      if (relatedIds.length > 0) {
        const relatedPartsResult = await this.connection.runAndReadAll(`
          SELECT PartTerminologyID, PartTerminologyName
          FROM parts 
          WHERE PartTerminologyID IN (${relatedIds.join(',')})
        `);

        for (const relatedRow of relatedPartsResult.getRowObjects()) {
          relatedParts.push({
            partTerminologyId: Number(relatedRow.PartTerminologyID),
            partTerminologyName: String(relatedRow.PartTerminologyName),
            relationshipType: 'related'
          });
        }
      }
    }

    // Add interchange parts to related parts
    if (row.interchange_parts) {
      const interchangeParts = row.interchange_parts.split(',').filter(Boolean);
      for (const interchangePart of interchangeParts.slice(0, 5)) { // Limit to 5 for performance
        relatedParts.push({
          partTerminologyId: 0, // Interchange parts may not have terminology IDs
          partTerminologyName: interchangePart,
          relationshipType: 'interchange'
        });
      }
    }

    // Build supersessions array
    const supersessions: AutoCareSupersession[] = [];

    // Superseded by (newer parts)
    if (row.superseded_by_ids) {
      const supersededByIds = row.superseded_by_ids.split(',').filter(Boolean);
      if (supersededByIds.length > 0) {
        const supersededByResult = await this.connection.runAndReadAll(`
          SELECT PartTerminologyID, PartTerminologyName
          FROM parts 
          WHERE PartTerminologyID IN (${supersededByIds.join(',')})
        `);

        for (const supersessionRow of supersededByResult.getRowObjects()) {
          supersessions.push({
            partTerminologyId: Number(supersessionRow.PartTerminologyID),
            partTerminologyName: String(supersessionRow.PartTerminologyName),
            type: 'superseded_by'
          });
        }
      }
    }

    // Supersedes (older parts)
    if (row.supersedes_ids) {
      const supersedesIds = row.supersedes_ids.split(',').filter(Boolean);
      if (supersedesIds.length > 0) {
        const supersedesResult = await this.connection.runAndReadAll(`
          SELECT PartTerminologyID, PartTerminologyName
          FROM parts 
          WHERE PartTerminologyID IN (${supersedesIds.join(',')})
        `);

        for (const supersessionRow of supersedesResult.getRowObjects()) {
          supersessions.push({
            partTerminologyId: Number(supersessionRow.PartTerminologyID),
            partTerminologyName: String(supersessionRow.PartTerminologyName),
            type: 'supersedes'
          });
        }
      }
    }

    // Get extended PIES data (with fallback to available data)
    const attributes = await this.getPartAttributes(Number(row.PartTerminologyID));
    const interchangeableParts = await this.getInterchangeParts(Number(row.PartTerminologyID));
    const assets = await this.getPartAssets(Number(row.PartTerminologyID));

    // Enhanced data extraction from available sources
    const enhancedDescriptions = this.extractEnhancedDescriptions(row);
    const categoryInfo = this.extractCategoryInfo(row);
    const technicalSpecs = this.extractTechnicalSpecs(row);

    const buildConfidence = Number(row.confidence) || 1.0;
    
    // Debug log for confidence tracking in buildAutoCareMatch
    if ((row.original_name && row.original_name.toLowerCase().includes('machine')) || 
        (row.PartTerminologyName && row.PartTerminologyName.toLowerCase().includes('machine'))) {
      console.log(`[CONFIDENCE_DEBUG] AutoCareAggregator: buildAutoCareMatch setting confidence`, {
        shopPartName: row.original_name,
        matchedPartName: row.PartTerminologyName,
        rawConfidenceValue: row.confidence,
        parsedConfidence: buildConfidence,
        confidenceSource: row.confidence ? 'from_row' : 'default_1.0',
        source: 'build_autocare_match'
      });
    }
    
    return {
      partTerminologyId: Number(row.PartTerminologyID),
      partTerminologyName: String(row.PartTerminologyName),
      partsDescriptionId: Number(row.PartsDescriptionID) || 0,
      confidence: buildConfidence,
      matchingMethod: (String(row.matching_method) || 'exact') as 'exact' | 'fuzzy' | 'description' | 'keyword' | 'attribute',
      descriptions: enhancedDescriptions,
      relatedParts,
      aliases: row.all_aliases ? String(row.all_aliases).split(' | ').filter(Boolean) : [],
      supersessions,
      // Enhanced PIES data using available sources
      category: categoryInfo,
      technicalSpecifications: technicalSpecs,
      // Extended PIES data (will be undefined if files missing, but structure preserved)
      attributes: attributes.length > 0 ? attributes.map(attr => ({
        partTerminologyId: attr.partTerminologyId || 0,
        attributeId: attr.attributeId || 0,
        attributeName: attr.attributeName,
        attributeValue: attr.attributeValue,
        unitOfMeasure: attr.unitOfMeasure,
        attributeType: attr.attributeType
      })) : undefined,
      interchangeableParts: interchangeableParts.length > 0 ? interchangeableParts.map(inter => ({
        partTerminologyId: inter.partTerminologyId || 0,
        interchangePartNumber: inter.interchangePartNumber,
        brandId: inter.brandId || 0,
        brandName: inter.brandName,
        qualityGrade: inter.qualityGrade,
        interchangeType: inter.interchangeType,
        notes: inter.notes
      })) : undefined,
      assets: assets.length > 0 ? assets.map(asset => ({
        partTerminologyId: asset.partTerminologyId || 0,
        assetId: asset.assetId || 0,
        assetType: asset.assetType,
        assetUrl: asset.assetUrl,
        assetDescription: asset.assetDescription,
        isPrimary: asset.isPrimary
      })) : undefined
     };
  }

  /**
   * Get part attributes for enhanced matching
   */
  async getPartAttributes(partTerminologyId: number): Promise<any[]> {
    if (!this.connection) return [];

    try {
      const result = await this.connection.runAndReadAll(`
        SELECT attributeName, attributeValue, unitOfMeasure, attributeType
        FROM part_attributes 
        WHERE partTerminologyId = ?
        ORDER BY attributeType, attributeName
      `, [partTerminologyId]);
      
      return result.getRowObjects();
    } catch {
      return [];
    }
  }

  /**
   * Get interchange parts for a given part
   */
  async getInterchangeParts(partTerminologyId: number): Promise<any[]> {
    if (!this.connection) return [];

    try {
      const result = await this.connection.runAndReadAll(`
        SELECT interchangePartNumber, brandName, interchangeType, qualityGrade
        FROM part_interchange 
        WHERE partTerminologyId = ?
        ORDER BY qualityGrade DESC, brandName
      `, [partTerminologyId]);
      
      return result.getRowObjects();
    } catch {
      return [];
    }
  }

  /**
   * Get part assets (images, documents, etc.)
   */
  async getPartAssets(partTerminologyId: number): Promise<any[]> {
    if (!this.connection) return [];

    try {
      const result = await this.connection.runAndReadAll(`
        SELECT assetType, assetUrl, assetDescription, isPrimary
        FROM part_assets 
        WHERE partTerminologyId = ?
        ORDER BY isPrimary DESC, assetType
      `, [partTerminologyId]);
      
      return result.getRowObjects();
    } catch {
      return [];
    }
  }

  /**
   * Extract enhanced descriptions from available data sources
   */
  private extractEnhancedDescriptions(row: any): string[] {
    const descriptions = new Set<string>();
    
    // Add base descriptions
    if (row.all_descriptions) {
      String(row.all_descriptions).split(' | ').filter(Boolean).forEach(desc => {
        descriptions.add(desc.trim());
      });
    }
    
    // Extract descriptions from part name patterns
    const partName = String(row.PartTerminologyName || '');
    if (partName) {
      // Extract meaningful keywords from part name
      const keywords = partName.match(/\b[A-Z][a-z]+\b/g) || [];
      keywords.forEach(keyword => {
        if (keyword.length > 3) {
          descriptions.add(`${keyword} component`);
        }
      });
    }
    
    return Array.from(descriptions).slice(0, 10); // Limit to 10 descriptions
  }

  /**
   * Extract category information from available data
   */
  private extractCategoryInfo(row: any): any {
    const partName = String(row.PartTerminologyName || '').toLowerCase();
    
    // Basic category mapping based on part name patterns
    const categoryMappings = {
      'engine': { category: 'Engine', subcategory: 'Engine Components' },
      'brake': { category: 'Brake System', subcategory: 'Brake Components' },
      'transmission': { category: 'Drivetrain', subcategory: 'Transmission' },
      'filter': { category: 'Filtration', subcategory: 'Filters' },
      'belt': { category: 'Engine', subcategory: 'Belts & Hoses' },
      'alternator': { category: 'Electrical', subcategory: 'Charging System' },
      'battery': { category: 'Electrical', subcategory: 'Battery & Charging' },
      'starter': { category: 'Electrical', subcategory: 'Starting System' },
      'suspension': { category: 'Suspension', subcategory: 'Suspension Components' },
      'shock': { category: 'Suspension', subcategory: 'Shock Absorbers' },
      'strut': { category: 'Suspension', subcategory: 'Struts' }
    };
    
    for (const [keyword, category] of Object.entries(categoryMappings)) {
      if (partName.includes(keyword)) {
        return {
          primaryCategory: category.category,
          subCategory: category.subcategory,
          confidence: 0.8
        };
      }
    }
    
    return {
      primaryCategory: 'General',
      subCategory: 'Automotive Parts',
      confidence: 0.5
    };
  }

  /**
   * Extract technical specifications from available data
   */
  private extractTechnicalSpecs(row: any): any[] {
    const specs: any[] = [];
    const partName = String(row.PartTerminologyName || '');
    const descriptions = String(row.all_descriptions || '');
    const combinedText = `${partName} ${descriptions}`.toLowerCase();
    
    // Extract dimensions
    const dimensionPattern = /(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)(?:\s*(?:x|×)\s*(\d+(?:\.\d+)?))?\s*(mm|cm|in|inch)/gi;
    const dimensionMatch = dimensionPattern.exec(combinedText);
    if (dimensionMatch) {
      specs.push({
        specType: 'dimension',
        name: 'Dimensions',
        value: `${dimensionMatch[1]} x ${dimensionMatch[2]}${dimensionMatch[3] ? ` x ${dimensionMatch[3]}` : ''}`,
        unit: dimensionMatch[4],
        confidence: 0.8
      });
    }
    
    // Extract weight
    const weightPattern = /(\d+(?:\.\d+)?)\s*(kg|lb|lbs|pound|gram|g)\b/gi;
    const weightMatch = weightPattern.exec(combinedText);
    if (weightMatch) {
      specs.push({
        specType: 'weight',
        name: 'Weight',
        value: weightMatch[1],
        unit: weightMatch[2],
        confidence: 0.7
      });
    }
    
    // Extract material information
    const materials = ['steel', 'aluminum', 'plastic', 'rubber', 'metal', 'composite'];
    const foundMaterials = materials.filter(material => combinedText.includes(material));
    if (foundMaterials.length > 0) {
      specs.push({
        specType: 'material',
        name: 'Materials',
        value: foundMaterials.join(', '),
        confidence: 0.6
      });
    }
    
    // Extract voltage/electrical specs
    const voltagePattern = /(\d+(?:\.\d+)?)\s*(?:v|volt|voltage)/gi;
    const voltageMatch = voltagePattern.exec(combinedText);
    if (voltageMatch) {
      specs.push({
        specType: 'electrical',
        name: 'Voltage',
        value: voltageMatch[1],
        unit: 'V',
        confidence: 0.8
      });
    }
    
    return specs.length > 0 ? specs : [];
  }

  private async recordMatch(normalizedName: string, partTerminologyId: number, entityId: number, originalName: string): Promise<void> {
    if (!this.connection) return;

    // Validate parameters to prevent NaN/null insertion
    if (!normalizedName || !partTerminologyId || isNaN(partTerminologyId) ||
      !entityId || isNaN(entityId) || !originalName) {
      console.warn(`Skipping invalid match record: name=${normalizedName}, partId=${partTerminologyId}, entityId=${entityId}`);
      return;
    }

    try {
      // Use parameterized query with proper type checking
      await this.connection.run(`
        INSERT INTO match_frequency (normalized_name, part_terminology_id, entity_id, original_names, frequency)
        VALUES (?, ?, ?, ARRAY[?], 1)
        ON CONFLICT(normalized_name) DO UPDATE SET
          frequency = match_frequency.frequency + 1,
          original_names = array_append(match_frequency.original_names, ?)
      `, [normalizedName, partTerminologyId, entityId, originalName, originalName]);
    } catch (error) {
      console.warn(`Could not record match frequency for ${normalizedName}: ${(error as Error).message}`);
    }
  }

  async generateEntityKnowledgeBase(entityId: number): Promise<EntityMatchingProfile> {
    if (!this.connection) throw new Error('DuckDB connection not initialized');

    // Get the most frequently used parts for this entity
    const frequentPartsResult = await this.connection.runAndReadAll(`
      SELECT 
        mf.part_terminology_id,
        p.PartTerminologyName,
        mf.frequency,
        ep.all_descriptions,
        ep.related_part_ids,
        ep.superseded_by_ids,
        ep.supersedes_ids,
        ep.all_aliases
      FROM match_frequency mf
      JOIN parts p ON mf.part_terminology_id = p.PartTerminologyID
      JOIN enriched_parts ep ON p.PartTerminologyID = ep.PartTerminologyID
      WHERE mf.entity_id = ?
      ORDER BY mf.frequency DESC
      LIMIT 50
    `, [entityId]);

    const mostFrequentParts = [];
    const rowObjects = frequentPartsResult.getRowObjects();
    
    // Only process if there are results
    if (rowObjects.length > 0) {
      for (const row of rowObjects) {
        const match = await this.buildAutoCareMatch({
          ...row,
          PartTerminologyID: row.part_terminology_id,
          confidence: 1.0,
          matching_method: 'knowledge_base'
        });

        mostFrequentParts.push({
          partTerminologyId: Number(row.part_terminology_id),
          partTerminologyName: String(row.PartTerminologyName),
          frequency: Number(row.frequency),
          match
        });
      }
    }

    // Get total unique parts count
    const totalCountResult = await this.connection.runAndReadAll(`
      SELECT COUNT(DISTINCT part_terminology_id) as total
      FROM match_frequency 
      WHERE entity_id = ?
    `, [entityId]);

    // Handle empty results properly
    const totalRows = totalCountResult.getRows();
    const totalUniqueParts = (totalRows && totalRows.length > 0) ? Number(totalRows[0][0]) : 0;

    return {
      entityId,
      totalUniqueParts,
      mostFrequentParts
    };
  }

  // New: Check if it's a non-part item
  private isNonPartItem(name: string): boolean {
    const lowerName = name.toLowerCase();
    return this.nonPartItems.has(lowerName);
  }

  // Enhanced part name normalization method
  private normalizeName(name: string): string {
    if (!name || typeof name !== 'string') return '';
    
    // First check if it's a non-part item
    if (this.isNonPartItem(name)) {
      return ''; // Return empty string to indicate skipping this item
    }
    
    let normalized = name
      .toLowerCase() // Convert to lowercase first for processing
      
      // 1. Remove parenthetical content - "Air Filter (Outer)" → "Air Filter"
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      
      // 2. Remove common brands and model specifications
      .replace(/\b(mobile\s+delvac|honda\s+gn4|castrol|valvoline|shell|mobil|chevron)\b/gi, '')
      .replace(/\b\d+w-?\d+\b/gi, '') // Remove oil viscosity like 10W-40
       .replace(/\b(sae|api|iso)\s*\d+[a-z]*\b/gi, '') // Remove specifications like SAE 30, API CF
      
      // 3. Handle hyphenated formats - direct conversion to uppercase to avoid secondary replacement
      .replace(/filter-hyd\b/gi, 'HYDRAULIC FILTER')
      .replace(/filter-fuel\b/gi, 'FUEL FILTER') 
      .replace(/filter-air\b/gi, 'AIR FILTER')
      .replace(/filter-oil\b/gi, 'ENGINE OIL FILTER')  // Direct uppercase conversion
      
      // 4. Handle more hyphenated formats
      .replace(/\bhyd\s*\.?\s*filter\b/gi, 'hydraulic filter')
      .replace(/\boil\s*filter\b/gi, 'ENGINE OIL FILTER')  // Direct uppercase conversion to avoid secondary replacement
       .replace(/\bspark\s*plug\b/gi, 'SPARK PLUG')         // Direct uppercase conversion to avoid issues
      
      // 4. Apply synonym mapping
    ;
    
    // Apply synonym replacement
    for (const [synonym, replacement] of this.synonymMap.entries()) {
      const regex = new RegExp(`\\b${synonym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      normalized = normalized.replace(regex, replacement);
    }
    
    normalized = normalized
      .toUpperCase() // Finally convert to uppercase to match AutoCare format
      .replace(/[^A-Z0-9\s]/g, '') // Remove special characters but keep spaces
      
      // Common words
      .replace(/\b(W\/|WITH)\b/g, 'WITH')
      .replace(/\b(W\/O|WITHOUT)\b/g, 'WITHOUT')
      .replace(/\bSVC\b/g, 'SERVICE')
      .replace(/\bKIT\b/g, 'KIT')
      
      // Components
      .replace(/\bASSY\b/g, 'ASSEMBLY')
      .replace(/\bALT\b/g, 'ALTERNATOR')
      .replace(/\bBATT\b/g, 'BATTERY')
      .replace(/\bENG\b/g, 'ENGINE')
      .replace(/\bTRANS\b/g, 'TRANSMISSION')
      .replace(/\bBRK\b/g, 'BRAKE')
      .replace(/\bSTRG\b/g, 'STEERING')
      .replace(/\bSUSP\b/g, 'SUSPENSION')
      .replace(/\bEXH\b/g, 'EXHAUST')
      .replace(/\bRAD\b/g, 'RADIATOR')
      
      // Filters - be specific to avoid conflicts
      .replace(/\bOIL FLT\b/g, 'OIL FILTER')
      .replace(/\bAIR FLT\b/g, 'AIR FILTER')
      .replace(/\bFUEL FLT\b/g, 'FUEL FILTER')
      .replace(/\bHYDRAULIC FLT\b/g, 'HYDRAULIC FILTER')
      .replace(/\bFLTR\b/g, 'FILTER')
      
      // Valve components
      .replace(/\bVLV\b/g, 'VALVE')
      .replace(/\bSTM\b/g, 'STEM')
      
      // Sealing components
      .replace(/\bSEAL KIT\b/g, 'SEAL')
      .replace(/\bGSKT\b/g, 'GASKET')
      .replace(/\bO[\s-]*RNG\b/g, 'O RING')
      
      // Mechanical components
      .replace(/\bBRNG\b/g, 'BEARING')
      .replace(/\bBSHG\b/g, 'BUSHING')
      .replace(/\bSPRG\b/g, 'SPRING')
      .replace(/\bCLMP\b/g, 'CLAMP')
      .replace(/\bBOLT\b/g, 'BOLT')
      .replace(/\bSCRW\b/g, 'SCREW')
      .replace(/\bWASHR\b/g, 'WASHER')
      .replace(/\bNUT\b/g, 'NUT')
      
      // Electrical
      .replace(/\bRELAY\b/g, 'RELAY')
      .replace(/\bSWCH\b/g, 'SWITCH')
      .replace(/\bSENSOR\b/g, 'SENSOR')
      
      // Fluids
      .replace(/\bLUB\b/g, 'LUBRICANT')
      .replace(/\bCOOLANT\b/g, 'COOLANT')
      
      // Final cleanup
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim();

    return normalized;
  }

  async close(): Promise<void> {
    if (this.connection) {
      this.connection.closeSync();
      this.connection = null;
    }
    if (this.instance) {
      // DuckDB instances auto-cleanup, but explicit cleanup is good practice
      this.instance = null;
    }
    this.initialized = false;
  }

  // Utility methods for statistics
  async getCacheSize(): Promise<number> {
    return this.matchCache.size;
  }

  async getMatchingStatistics(): Promise<any> {
    if (!this.connection) return {};

    try {
      const totalMatches = await this.connection.runAndReadAll('SELECT COUNT(*) as count FROM match_frequency');
      const entityStats = await this.connection.runAndReadAll(`
        SELECT 
          entity_id,
          COUNT(*) as unique_parts,
          SUM(frequency) as total_matches
        FROM match_frequency 
        GROUP BY entity_id
        ORDER BY total_matches DESC
      `);

      return {
        totalCachedMatches: this.matchCache.size,
        totalRecordedMatches: totalMatches.getRows()[0][0],
        entityStatistics: entityStats.getRowObjects()
      };
    } catch (error) {
      console.warn('Could not retrieve matching statistics:', error);
      return {};
    }
  }
}