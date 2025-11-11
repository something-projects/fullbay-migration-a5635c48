import { DataReader } from '../utils/DataSource';
import { OutputManager } from '../utils/OutputManager';
import { DataQualityTracker } from '../utils/DataQualityTracker';
import { getAutoCareLoader } from '../utils/AutoCareLoader';
import { VehicleMatcher } from '../services/VehicleMatcher';
import { VehicleAggregator, BatchShopVehicle } from '../services/VehicleAggregator';
import { VINDecoder, VINDecodeStats } from '../services/VINDecoder';
import { MatchingStatistics, VehicleMatchFailureReason, StandardizedVehicle, VehicleMatchResult } from '../types/AutoCareTypes';
import { 
  Customer,
  CustomerUnit,
  CustomerUnitEntityComponentEntry,
  CustomerEmployee,
  CustomerHistory,
  CustomerNote,
  CustomerAddress,
  CustomerCredit,
  CustomerLocation,
  CustomerEntityLocationEntry,
  CustomerPayment,
  Address,
  RepairOrder,
  DenormalizedCompany,
  DenormalizedCustomer,
  DenormalizedUnit,
  DenormalizedCustomerEmployee,
  EnhancedCustomer,
  EntityUnitType,
  EntityUnitTypeEntityComponentEntry,
  EntityUnitTypeEntityComponentSystemEntry,
  EntityUnitTypeEntityComponentSystemCorrectionEntry,
  EntityUnitTypeData
} from '../types/DatabaseTypes';

// 🔍 Cache state tracking interface
interface CacheState {
  isPopulated: boolean;
  entityId: number;
  customerIds: Set<number>;
  lastUpdated: Date;
  populationMethod: 'preload' | 'bulk' | 'fallback';
}

export class CustomerProcessor {
  private dataReader: DataReader;
  private outputManager: OutputManager;
  private qualityTracker: DataQualityTracker;
  private vehicleMatcher: VehicleMatcher | null = null;
  private vehicleAggregator: VehicleAggregator | null = null;
  private vehicleMatchingStats: MatchingStatistics['vehicleMatches'] = {
    total: 0,
    exactMatches: 0,
    fuzzyMatches: 0,
    noMatches: 0,
    averageConfidence: 0
  };
  
  // 🔍 Vehicle failure statistics collection
  private failureReasonStats: Map<string, number> = new Map();
  private failedVehicles: Array<{make: string, model: string, year: number, reason: string}> = [];
  
  // 🚀 PERFORMANCE OPTIMIZATION: Caches for all Customer second-level tables
  private customerUnitsCache: Map<number, CustomerUnit[]> = new Map();
  private customerEmployeesCache: Map<number, CustomerEmployee[]> = new Map();
  private customerHistoryCache: Map<number, CustomerHistory[]> = new Map();
  private customerNotesCache: Map<number, CustomerNote[]> = new Map();
  private customerAddressesCache: Map<number, CustomerAddress[]> = new Map();
  private customerCreditsCache: Map<number, CustomerCredit[]> = new Map();
  private customerLocationsCache: Map<number, CustomerLocation[]> = new Map();
  private customerEntityLocationEntriesCache: Map<number, CustomerEntityLocationEntry[]> = new Map();
  private customerPaymentsCache: Map<number, CustomerPayment[]> = new Map();
  
  // 🏗️ ENTITYUNITTYPE CACHES: Caches for EntityUnitType related data
  private entityUnitTypesCache: Map<number, EntityUnitType> = new Map();
  private entityUnitTypeComponentsCache: Map<number, EntityUnitTypeEntityComponentEntry[]> = new Map();
  private entityUnitTypeSystemsCache: Map<number, EntityUnitTypeEntityComponentSystemEntry[]> = new Map();
  private entityUnitTypeCorrectionsCache: Map<number, EntityUnitTypeEntityComponentSystemCorrectionEntry[]> = new Map();
  
  // 🚗 VIN field discovery cache for performance
  private vinFieldCache: Map<number, number[]> = new Map();
  private vinDecoder: VINDecoder;

  // 🔍 Cache state tracking
  private cacheState: CacheState | null = null;

  constructor(dataReader: DataReader, outputManager: OutputManager, qualityTracker?: DataQualityTracker) {
    this.dataReader = dataReader;
    this.outputManager = outputManager;
    this.qualityTracker = qualityTracker || new DataQualityTracker();
    this.vinDecoder = new VINDecoder();
  }

  /**
   * 🔍 Initialize cache state for a specific entity
   */
  private initializeCacheState(entityId: number, customerIds: number[], method: 'preload' | 'bulk' | 'fallback'): void {
    this.cacheState = {
      isPopulated: false,
      entityId,
      customerIds: new Set(customerIds),
      lastUpdated: new Date(),
      populationMethod: method
    };
    console.log(`🔍 Cache state initialized for entity ${entityId} with ${customerIds.length} customers (method: ${method})`);
  }

  /**
   * 🔍 Mark cache as populated
   */
  private markCachePopulated(): void {
    if (this.cacheState) {
      this.cacheState.isPopulated = true;
      this.cacheState.lastUpdated = new Date();
      console.log(`✅ Cache marked as populated for entity ${this.cacheState.entityId} (${this.cacheState.customerIds.size} customers)`);
    }
  }

  /**
   * 🔍 Validate cache state for specific customer IDs
   */
  private validateCacheForCustomers(customerIds: number[]): { valid: boolean; missingIds: number[] } {
    if (!this.cacheState || !this.cacheState.isPopulated) {
      return { valid: false, missingIds: customerIds };
    }

    const missingIds = customerIds.filter(id => !this.cacheState!.customerIds.has(id));
    const valid = missingIds.length === 0;

    if (!valid) {
      console.warn(`⚠️  Cache validation failed: ${missingIds.length} missing customer IDs: ${missingIds.join(', ')}`);
      console.warn(`🔍 Cache state: entity=${this.cacheState.entityId}, populated=${this.cacheState.isPopulated}, total=${this.cacheState.customerIds.size}`);
    }

    return { valid, missingIds };
  }

  /**
   * 🔍 Get detailed cache state information for debugging
   */
  private getCacheStateInfo(): string {
    if (!this.cacheState) {
      return 'Cache state: Not initialized';
    }

    return `Cache state: entity=${this.cacheState.entityId}, populated=${this.cacheState.isPopulated}, ` +
           `customers=${this.cacheState.customerIds.size}, method=${this.cacheState.populationMethod}, ` +
           `updated=${this.cacheState.lastUpdated.toISOString()}`;
  }

  /**
   * 🔍 Clear cache state and all cached data
   */
  private clearCacheState(): void {
    const entityId = this.cacheState?.entityId || 'unknown';
    this.cacheState = null;
    console.log(`🧹 Cache state cleared for entity ${entityId}`);
  }

  /**
   * 🔄 Unified customer loading function with consistent query logic
   */
  private async loadCustomersForEntity(entityId: number): Promise<Customer[]> {
    console.log(`🔄 Loading customers for entity ${entityId} using unified query...`);
    
    try {
      const customers = await this.dataReader.query<Customer>(
        'SELECT * FROM Customer WHERE entityId = ? ORDER BY customerId',
        [entityId]
      );
      
      console.log(`   ✅ Loaded ${customers.length} customers for entity ${entityId}`);
      return customers;
      
    } catch (error) {
      console.error(`❌ Failed to load customers for entity ${entityId}:`, error);
      console.error(`🔍 Database query failed: SELECT * FROM Customer WHERE entityId = ${entityId} ORDER BY customerId`);
      throw new Error(`Customer loading failed for entity ${entityId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 🔍 Comprehensive cache diagnostics for troubleshooting
   */
  private logCacheDiagnostics(): void {
    console.log(`\n🔍 CACHE DIAGNOSTICS`);
    console.log(`==================`);
    console.log(`${this.getCacheStateInfo()}`);
    
    if (this.cacheState) {
      console.log(`Cache contents:`);
      console.log(`  - CustomerUnits: ${this.customerUnitsCache.size} customers cached`);
      console.log(`  - CustomerEmployees: ${this.customerEmployeesCache.size} customers cached`);
      console.log(`  - CustomerHistory: ${this.customerHistoryCache.size} customers cached`);
      console.log(`  - CustomerNotes: ${this.customerNotesCache.size} customers cached`);
      console.log(`  - CustomerAddresses: ${this.customerAddressesCache.size} customers cached`);
      console.log(`  - CustomerCredits: ${this.customerCreditsCache.size} customers cached`);
      console.log(`  - CustomerLocations: ${this.customerLocationsCache.size} customers cached`);
      console.log(`  - CustomerEntityLocationEntries: ${this.customerEntityLocationEntriesCache.size} customers cached`);
      console.log(`  - CustomerPayments: ${this.customerPaymentsCache.size} customers cached`);
      
      // Sample some customer IDs from cache state vs actual cache
      const stateCustomerIds = Array.from(this.cacheState.customerIds).slice(0, 5);
      const cachedCustomerIds = Array.from(this.customerUnitsCache.keys()).slice(0, 5);
      console.log(`  - Expected customer IDs (sample): [${stateCustomerIds.join(', ')}]`);
      console.log(`  - Cached customer IDs (sample): [${cachedCustomerIds.join(', ')}]`);
    } else {
      console.log(`Cache state: Not initialized`);
    }
    console.log(`==================\n`);
  }

  /**
   * 🔍 Validate cache consistency and report issues
   */
  private validateCacheConsistency(): { isConsistent: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (!this.cacheState) {
      issues.push('Cache state not initialized');
      return { isConsistent: false, issues };
    }

    if (!this.cacheState.isPopulated) {
      issues.push('Cache state indicates not populated');
    }

    // Check if all expected customers are in the main cache
    const expectedCustomers = this.cacheState.customerIds.size;
    const cachedCustomers = this.customerUnitsCache.size;
    
    if (expectedCustomers !== cachedCustomers) {
      issues.push(`Customer count mismatch: expected ${expectedCustomers}, cached ${cachedCustomers}`);
    }

    // Check for missing customers in cache
    const missingInCache: number[] = [];
    for (const customerId of this.cacheState.customerIds) {
      if (!this.customerUnitsCache.has(customerId)) {
        missingInCache.push(customerId);
      }
    }

    if (missingInCache.length > 0) {
      issues.push(`Missing customers in cache: ${missingInCache.slice(0, 10).join(', ')}${missingInCache.length > 10 ? '...' : ''}`);
    }

    return { isConsistent: issues.length === 0, issues };
  }

  /**
   * 🧪 Test cache operations with a small set of customer IDs
   */
  private async testCacheOperations(entityId: number, testCustomerIds: number[]): Promise<boolean> {
    console.log(`🧪 Testing cache operations for entity ${entityId} with ${testCustomerIds.length} test customers...`);
    
    try {
      // Test 1: Initialize cache state
      this.initializeCacheState(entityId, testCustomerIds, 'bulk');
      
      // Test 2: Validate empty cache
      const emptyValidation = this.validateCacheForCustomers(testCustomerIds);
      if (emptyValidation.valid) {
        console.error(`❌ Test failed: Empty cache should not validate as complete`);
        return false;
      }
      
      // Test 3: Populate cache with test data
      const testUnits: CustomerUnit[] = testCustomerIds.map(id => ({
        customerUnitId: id * 1000, // Mock unit ID
        customerId: id,
        entityId: entityId,
        number: `TEST-${id}`,
        active: true,
        shopHasPossession: false,
        assistWithPreventiveMaintenance: false,
        trackPreventiveMaintenance: false
      } as CustomerUnit));
      
      this.groupAndCacheCustomerData(testUnits, this.customerUnitsCache);
      this.markCachePopulated();
      
      // Test 4: Validate populated cache
      const populatedValidation = this.validateCacheForCustomers(testCustomerIds);
      if (!populatedValidation.valid) {
        console.error(`❌ Test failed: Populated cache should validate as complete`);
        console.error(`Missing IDs: ${populatedValidation.missingIds.join(', ')}`);
        return false;
      }
      
      // Test 5: Test bulk loading with cache
      const loadedUnits = await this.bulkLoadCustomerUnits(testCustomerIds);
      if (loadedUnits.length !== testUnits.length) {
        console.error(`❌ Test failed: Expected ${testUnits.length} units, got ${loadedUnits.length}`);
        return false;
      }
      
      // Test 6: Test fallback mechanism
      const extraCustomerId = Math.max(...testCustomerIds) + 1;
      const fallbackTest = await this.bulkLoadCustomerUnits([...testCustomerIds, extraCustomerId]);
      // Should succeed with fallback for the extra customer
      
      console.log(`✅ All cache operation tests passed for entity ${entityId}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Cache operation test failed:`, error);
      return false;
    } finally {
      // Clean up test data
      this.clearCustomerCache();
    }
  }

  /**
   * 🧪 Performance test for cache operations
   */
  private async performanceBenchmark(entityId: number, customerCount: number): Promise<void> {
    console.log(`🧪 Running performance benchmark for ${customerCount} customers...`);
    
    const testCustomerIds = Array.from({ length: customerCount }, (_, i) => i + 1);
    
    // Benchmark cache population
    const populateStart = Date.now();
    this.initializeCacheState(entityId, testCustomerIds, 'bulk');
    
    const testUnits: CustomerUnit[] = testCustomerIds.map(id => ({
      customerUnitId: id * 1000,
      customerId: id,
      entityId: entityId,
      number: `PERF-${id}`,
      active: true,
      shopHasPossession: false,
      assistWithPreventiveMaintenance: false,
      trackPreventiveMaintenance: false
    } as CustomerUnit));
    
    this.groupAndCacheCustomerData(testUnits, this.customerUnitsCache);
    this.markCachePopulated();
    const populateTime = Date.now() - populateStart;
    
    // Benchmark cache retrieval
    const retrieveStart = Date.now();
    await this.bulkLoadCustomerUnits(testCustomerIds);
    const retrieveTime = Date.now() - retrieveStart;
    
    // Benchmark cache validation
    const validateStart = Date.now();
    this.validateCacheForCustomers(testCustomerIds);
    const validateTime = Date.now() - validateStart;
    
    console.log(`📊 Performance Results for ${customerCount} customers:`);
    console.log(`   Cache Population: ${populateTime}ms`);
    console.log(`   Cache Retrieval: ${retrieveTime}ms`);
    console.log(`   Cache Validation: ${validateTime}ms`);
    console.log(`   Total: ${populateTime + retrieveTime + validateTime}ms`);
    
    this.clearCustomerCache();
  }

  /**
   * Bulk preload all Customer second-level table data for all customers in the entity
   */
  private async preloadAllCustomerSecondLevelData(entityId: number): Promise<void> {
    console.log(`🚀 Bulk loading all Customer second-level table data for entity ${entityId}...`);

    try {
      // Use unified customer loading function
      const customers = await this.loadCustomersForEntity(entityId);

      if (customers.length === 0) {
        console.log(`   No customers found for entity ${entityId}`);
        // Initialize empty cache state even for entities with no customers
        this.initializeCacheState(entityId, [], 'preload');
        this.markCachePopulated();
        return;
      }

      const customerIds = customers.map(c => c.customerId);
      
      // Initialize cache state with the loaded customer IDs
      this.initializeCacheState(entityId, customerIds, 'preload');
      
      // 🚀 PERFORMANCE OPTIMIZATION: Batch processing to avoid huge IN clauses
      const BATCH_SIZE = 500; // Process customers in batches to optimize query performance
      const totalBatches = Math.ceil(customerIds.length / BATCH_SIZE);
      
      console.log(`   📦 Processing ${customerIds.length} customers in ${totalBatches} batches (${BATCH_SIZE} per batch)...`);
      
      // Initialize arrays to collect all results
      const allCustomerUnits: CustomerUnit[] = [];
      const allCustomerEmployees: CustomerEmployee[] = [];
      const allCustomerHistory: CustomerHistory[] = [];
      const allCustomerNotes: CustomerNote[] = [];
      const allCustomerAddresses: CustomerAddress[] = [];
      const allCustomerCredits: CustomerCredit[] = [];
      const allCustomerEntityLocationEntries: CustomerEntityLocationEntry[] = [];
      const allCustomerPayments: CustomerPayment[] = [];
      
      // Process customers in batches to avoid huge IN clauses
      for (let i = 0; i < customerIds.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const batchCustomerIds = customerIds.slice(i, i + BATCH_SIZE);
        const batchPlaceholders = batchCustomerIds.map(() => '?').join(',');
        
        console.log(`     Batch ${batchNum}/${totalBatches}: Processing customers ${i + 1}-${Math.min(i + BATCH_SIZE, customerIds.length)}...`);
        
        // Batch queries - simplified to avoid performance issues
        const [
          batchCustomerUnits,
          batchCustomerEmployees,
          batchCustomerHistory,
          batchCustomerNotes,
          batchCustomerAddresses,
          batchCustomerCredits,
          batchCustomerEntityLocationEntries,
          batchCustomerPayments
        ] = await Promise.all([
          // Simplified CustomerUnit query without complex JOIN for performance
          this.dataReader.query<CustomerUnit>(`SELECT * FROM CustomerUnit WHERE customerId IN (${batchPlaceholders})`, batchCustomerIds),
          this.dataReader.query<CustomerEmployee>(`SELECT * FROM CustomerEmployee WHERE customerId IN (${batchPlaceholders})`, batchCustomerIds),
          this.dataReader.query<CustomerHistory>(`SELECT * FROM CustomerHistory WHERE customerId IN (${batchPlaceholders})`, batchCustomerIds),
          this.dataReader.query<CustomerNote>(`SELECT * FROM CustomerNote WHERE customerId IN (${batchPlaceholders})`, batchCustomerIds),
          this.dataReader.query<CustomerAddress>(`SELECT * FROM CustomerAddress WHERE customerId IN (${batchPlaceholders})`, batchCustomerIds),
          this.dataReader.query<CustomerCredit>(`SELECT * FROM CustomerCredit WHERE customerId IN (${batchPlaceholders})`, batchCustomerIds),
          this.dataReader.query<CustomerEntityLocationEntry>(`SELECT * FROM CustomerEntityLocationEntry WHERE customerId IN (${batchPlaceholders})`, batchCustomerIds),
          this.dataReader.query<CustomerPayment>(`SELECT * FROM CustomerPayment WHERE customerId IN (${batchPlaceholders})`, batchCustomerIds)
        ]);
        
        // Collect batch results
        allCustomerUnits.push(...batchCustomerUnits);
        allCustomerEmployees.push(...batchCustomerEmployees);
        allCustomerHistory.push(...batchCustomerHistory);
        allCustomerNotes.push(...batchCustomerNotes);
        allCustomerAddresses.push(...batchCustomerAddresses);
        allCustomerCredits.push(...batchCustomerCredits);
        allCustomerEntityLocationEntries.push(...batchCustomerEntityLocationEntries);
        allCustomerPayments.push(...batchCustomerPayments);
      }
      
      console.log(`   ✅ Completed batch processing of ${customerIds.length} customers`);

      // Ensure every customer has cache entries, even if empty
      for (const customerId of customerIds) {
        if (!this.customerUnitsCache.has(customerId)) {
          this.customerUnitsCache.set(customerId, []);
        }
        if (!this.customerEmployeesCache.has(customerId)) {
          this.customerEmployeesCache.set(customerId, []);
        }
        if (!this.customerHistoryCache.has(customerId)) {
          this.customerHistoryCache.set(customerId, []);
        }
        if (!this.customerNotesCache.has(customerId)) {
          this.customerNotesCache.set(customerId, []);
        }
        if (!this.customerAddressesCache.has(customerId)) {
          this.customerAddressesCache.set(customerId, []);
        }
        if (!this.customerCreditsCache.has(customerId)) {
          this.customerCreditsCache.set(customerId, []);
        }
        if (!this.customerEntityLocationEntriesCache.has(customerId)) {
          this.customerEntityLocationEntriesCache.set(customerId, []);
        }
        if (!this.customerPaymentsCache.has(customerId)) {
          this.customerPaymentsCache.set(customerId, []);
        }
      }

      // 🚗 Enrich CustomerUnit data with vehicle information from multiple sources
      console.log(`🔍 Loading vehicle data for ${allCustomerUnits.length} customer units...`);
      await this.enrichCustomerUnitsWithVIN(entityId, allCustomerUnits);
      await this.enrichCustomerUnitsWithVINDecoding(allCustomerUnits);
      await this.enrichCustomerUnitsWithComponentData(entityId, allCustomerUnits);
      await this.enrichCustomerUnitsWithAllEAVData(entityId, allCustomerUnits);

      // Group all data by customerId and cache
      this.groupAndCacheCustomerData(allCustomerUnits, this.customerUnitsCache);
      this.groupAndCacheCustomerData(allCustomerEmployees, this.customerEmployeesCache);
      this.groupAndCacheCustomerData(allCustomerHistory, this.customerHistoryCache);
      this.groupAndCacheCustomerData(allCustomerNotes, this.customerNotesCache);
      this.groupAndCacheCustomerData(allCustomerAddresses, this.customerAddressesCache);
      this.groupAndCacheCustomerData(allCustomerCredits, this.customerCreditsCache);
      this.groupAndCacheCustomerData(allCustomerEntityLocationEntries, this.customerEntityLocationEntriesCache);
      this.groupAndCacheCustomerData(allCustomerPayments, this.customerPaymentsCache);

      const vinCount = allCustomerUnits.filter(u => u.vin).length;
      const makeCount = allCustomerUnits.filter(u => u.make).length;
      const customFieldsCount = allCustomerUnits.filter(u => u.customFields && Object.keys(u.customFields).length > 0).length;
      
      console.log(`✅ Bulk loaded Customer second-level data for ${customerIds.length} customers:`);
      console.log(`   📦 ${allCustomerUnits.length} units (${vinCount} with VIN, ${makeCount} with make/model, ${customFieldsCount} with custom fields)`);
      console.log(`   👥 ${allCustomerEmployees.length} employees, 📜 ${allCustomerHistory.length} history, 📝 ${allCustomerNotes.length} notes`);
      console.log(`   📍 ${allCustomerAddresses.length} addresses, 💳 ${allCustomerCredits.length} credits, 🔗 ${allCustomerEntityLocationEntries.length} entries, 💰 ${allCustomerPayments.length} payments`);
      console.log(`📦 Cached Customer data for entity ${entityId}`);
      
      // Mark cache as populated after successful loading
      this.markCachePopulated();

    } catch (error) {
      console.error('❌ Error bulk loading Customer second-level data:', error);
      console.log('⚠️  Will fall back to individual queries as needed');
      // Don't mark cache as populated on error
    }
  }

  /**
   * Helper method to group array data by customerId and cache it
   */
  private groupAndCacheCustomerData<T extends { customerId: number }>(
    data: T[], 
    cache: Map<number, T[]>
  ): void {
    // Group by customerId
    const dataByCustomer = new Map<number, T[]>();
    for (const item of data) {
      if (!dataByCustomer.has(item.customerId)) {
        dataByCustomer.set(item.customerId, []);
      }
      dataByCustomer.get(item.customerId)!.push(item);
    }

    // Cache all grouped data
    for (const [customerId, items] of dataByCustomer) {
      cache.set(customerId, items);
    }
  }

  /**
   * Process customers based on processing mode
   */
  async processCustomers(entities: { [entityId: number]: DenormalizedCompany }, processingMode: 'demo' | 'full' = 'demo', targetEntityId?: number, simpleShopEntities?: Set<number>): Promise<void> {
    const entityIds = Object.keys(entities).map(id => parseInt(id));
    
    if (entityIds.length === 0) {
      console.log('⚠️  No entities provided, skipping customer processing');
      return;
    }

    // 🧪 Optional: Run cache operation tests in development mode
    if (process.env.NODE_ENV === 'development' || process.env.CACHE_TESTING === 'true') {
      console.log(`🧪 Running cache operation tests...`);
      const testEntityId = entityIds[0];
      const testPassed = await this.testCacheOperations(testEntityId, [1, 2, 3, 4, 5]);
      if (!testPassed) {
        console.warn(`⚠️  Cache operation tests failed, but continuing with processing...`);
      }
      
      // Run performance benchmark with a small set
      await this.performanceBenchmark(testEntityId, 100);
    }
    
    if (processingMode === 'demo') {
      // Demo mode: process customers for target entity, first entity, and all simple shop entities
      const entitiesToProcess = new Set<number>();
      
      // Add target entity or first entity
      if (targetEntityId && Object.keys(entities).includes(targetEntityId.toString())) {
        entitiesToProcess.add(targetEntityId);
        console.log(`🎯 Demo Mode: Adding TARGET entity: ${targetEntityId}`);
      } else {
        entitiesToProcess.add(entityIds[0]);
        if (targetEntityId) {
          console.log(`⚠️  Target entity ${targetEntityId} not found, falling back to first entity`);
        }
        console.log(`🎯 Demo Mode: Adding FIRST entity: ${entityIds[0]}`);
      }
      
      // Add all simple shop entities
      if (simpleShopEntities && simpleShopEntities.size > 0) {
        for (const simpleShopEntityId of simpleShopEntities) {
          if (entities[simpleShopEntityId]) {
            entitiesToProcess.add(simpleShopEntityId);
          }
        }
        console.log(`🏪 Demo Mode: Added ${simpleShopEntities.size} Simple Shop entities for full customer processing`);
      }
      
      console.log(`👥 Demo Mode: Processing customers for ${entitiesToProcess.size} entities (${entityIds.length - entitiesToProcess.size} entities skipped for optimization)`);
      
      for (const entityId of entitiesToProcess) {
        const entity = entities[entityId];
        if (!entity) continue;

        const shopName = entity.basicInfo.title || entity.basicInfo.legalName || `Entity ${entityId}`;
        const isSimpleShop = simpleShopEntities?.has(entityId) || false;
        const processingReason = entityId === targetEntityId ? 'TARGET ENTITY' : 
                               entityId === entityIds[0] ? 'FIRST ENTITY' : 
                               isSimpleShop ? 'SIMPLE SHOP' : 'UNKNOWN';
        
        console.log(`👥 Processing customers for: ${shopName} (${processingReason})`);
        
        try {
          // 🔍 Ensure clean cache state before processing
          if (this.cacheState && this.cacheState.entityId !== entityId) {
            console.log(`🧹 Clearing cache from previous entity ${this.cacheState.entityId} before processing entity ${entityId}`);
            this.clearCustomerCache();
          }
          
          // 🚀 PERFORMANCE OPTIMIZATION: Bulk preload customer data for the entity
          console.log(`🚀 Demo Mode: Bulk preloading customer second-level data for entity ${entityId}...`);
          await this.preloadAllCustomerSecondLevelData(entityId);
          
          // 🔍 Validate cache state after preloading
          const postPreloadConsistency = this.validateCacheConsistency();
          if (!postPreloadConsistency.isConsistent) {
            console.warn(`⚠️  Cache inconsistency after preloading for entity ${entityId}:`);
            postPreloadConsistency.issues.forEach(issue => console.warn(`   - ${issue}`));
          }
          
          await this.processEntityCustomers(entityId, entity);
          
          console.log(`✅ Successfully processed entity ${entityId}: ${shopName}`);
          
        } catch (error) {
          console.error(`❌ Error processing entity ${entityId}: ${shopName}:`, error);
          this.logCacheDiagnostics();
          throw error;
        } finally {
          // 🧹 Always clear cache after processing to free memory
          this.clearCustomerCache();
        }
      }

      console.log(`✅ Customer processing completed for ${entitiesToProcess.size} entities (${entityIds.length - entitiesToProcess.size} entities skipped for optimization)`);
    } else {
      // Full mode: process customers for all entities
      console.log(`🏭 Full Mode: Processing customers for ALL ${entityIds.length} entities...`);
      
      for (const entityId of entityIds) {
        const entity = entities[entityId];
        if (!entity) continue;

        const shopName = entity.basicInfo.title || entity.basicInfo.legalName || `Entity ${entityId}`;
        console.log(`👥 Processing customers for: ${shopName}`);
        
        try {
          // 🔍 Ensure clean cache state before processing
          if (this.cacheState && this.cacheState.entityId !== entityId) {
            console.log(`🧹 Clearing cache from previous entity ${this.cacheState.entityId} before processing entity ${entityId}`);
            this.clearCustomerCache();
          }
          
          // 🚀 PERFORMANCE OPTIMIZATION: Bulk preload customer data for each entity
          console.log(`🚀 Full Mode: Bulk preloading customer second-level data for entity ${entityId}...`);
          await this.preloadAllCustomerSecondLevelData(entityId);
          
          // 🔍 Validate cache state after preloading
          const postPreloadConsistency = this.validateCacheConsistency();
          if (!postPreloadConsistency.isConsistent) {
            console.warn(`⚠️  Cache inconsistency after preloading for entity ${entityId}:`);
            postPreloadConsistency.issues.forEach(issue => console.warn(`   - ${issue}`));
          }
          
          await this.processEntityCustomers(entityId, entity);
          
          console.log(`✅ Successfully processed entity ${entityId}: ${shopName}`);
          
        } catch (error) {
          console.error(`❌ Error processing entity ${entityId}: ${shopName}:`, error);
          this.logCacheDiagnostics();
          throw error;
        } finally {
          // 🧹 Always clear cache after processing to free memory
          this.clearCustomerCache();
        }
      }

      console.log(`✅ Customer processing completed for ${entityIds.length} entities`);
    }
  }

  /**
   * Clear all customer caches to free memory
   */
  private clearCustomerCache(): void {
    this.customerUnitsCache.clear();
    this.customerEmployeesCache.clear();
    this.customerHistoryCache.clear();
    this.customerNotesCache.clear();
    this.customerAddressesCache.clear();
    this.customerCreditsCache.clear();
    this.customerLocationsCache.clear();
    this.customerEntityLocationEntriesCache.clear();
    this.customerPaymentsCache.clear();
    this.clearCacheState();
    console.log(`🧹 Cleared all Customer caches (8 cache tables) and cache state`);
  }

  /**
   * Process all customers for a specific entity with bulk loading optimization
   */
  private async processEntityCustomers(entityId: number, entity: DenormalizedCompany): Promise<void> {
    // Reset entity-specific statistics to avoid cross-entity data pollution
    this.failureReasonStats.clear();
    this.failedVehicles = [];
    this.vehicleMatchingStats = {
      total: 0,
      exactMatches: 0,
      fuzzyMatches: 0,
      noMatches: 0,
      averageConfidence: 0
    };

    // Use unified customer loading function
    const customers = await this.loadCustomersForEntity(entityId);
    
    if (customers.length === 0) {
      console.log(`   No customers found for entity ${entityId}`);
      return;
    }
    
    // Get all customer IDs for bulk queries
    const customerIds = customers.map(c => c.customerId);
    const customerIdsPlaceholder = customerIds.map(() => '?').join(',');

    // 🔍 Validate cache state before bulk loading
    console.log(`🔍 Validating cache state before bulk loading...`);
    const consistency = this.validateCacheConsistency();
    if (!consistency.isConsistent) {
      console.warn(`⚠️  Cache consistency issues detected:`);
      consistency.issues.forEach(issue => console.warn(`   - ${issue}`));
      this.logCacheDiagnostics();
    } else {
      console.log(`✅ Cache consistency validation passed`);
    }

    // Bulk load all Customer second-level tables for performance optimization
    console.log(`🚀 Bulk loading Customer second-level tables for ${customers.length} customers...`);
    
    const [
      allCustomerHistory,
      allCustomerNotes, 
      allCustomerAddresses,
      allCustomerCredits,
      allCustomerLocations,
      allCustomerEmployees,
      allCustomerPayments,
      allCustomerUnits,
      repairOrders // Keep existing repair orders loading
    ] = await Promise.all([
      this.bulkLoadCustomerHistory(customerIds),
      this.bulkLoadCustomerNotes(customerIds),
      this.bulkLoadCustomerAddresses(customerIds),
      this.bulkLoadCustomerCredits(customerIds),
      this.bulkLoadCustomerLocations(customerIds),
      this.bulkLoadCustomerEmployees(customerIds),
      this.bulkLoadCustomerPayments(customerIds),
      this.bulkLoadCustomerUnits(customerIds),
      this.dataReader.query<RepairOrder>(
        `SELECT * FROM RepairOrder WHERE customerId IN (${customerIdsPlaceholder})`,
        customerIds
      )
    ]);

    // Load addresses - need to get all address IDs referenced by customers
    const addressIds = new Set<number>();
    customers.forEach((customer: Customer) => {
      if (customer.physicalCustomerAddressId) addressIds.add(customer.physicalCustomerAddressId);
      if (customer.billingCustomerAddressId) addressIds.add(customer.billingCustomerAddressId);
      if (customer.shipToCustomerAddressId) addressIds.add(customer.shipToCustomerAddressId);
    });
    
    console.log(`🔄 Loading ${addressIds.size} addresses...`);
    const addresses: Address[] = [];
    if (addressIds.size > 0) {
      const addressIdList = Array.from(addressIds);
      const addressPlaceholders = addressIdList.map(() => '?').join(',');
      const addressResults = await this.dataReader.query<Address>(
        `SELECT * FROM Address WHERE addressId IN (${addressPlaceholders})`,
        addressIdList
      );
      addresses.push(...addressResults);
    }
    
    console.log(`   📊 Bulk loaded data summary:`);
    console.log(`      📚 ${allCustomerHistory.length} history records`);
    console.log(`      📝 ${allCustomerNotes.length} note records`);
    console.log(`      🏠 ${allCustomerAddresses.length} address records`);
    console.log(`      💳 ${allCustomerCredits.length} credit records`);
    console.log(`      📍 ${allCustomerLocations.length} location records`);
    console.log(`      👥 ${allCustomerEmployees.length} employee records`);
    console.log(`      💰 ${allCustomerPayments.length} payment records`);
    console.log(`      🚚 ${allCustomerUnits.length} unit records`);
    console.log(`      🔧 ${repairOrders.length} repair orders`);
    
    // Initialize and perform AutoCare vehicle matching if enabled
    await this.initializeVehicleMatching();
    if (this.vehicleAggregator) {
      await this.batchMatchVehicles(entityId, allCustomerUnits);
    }
    
    // 🏗️ Load EntityUnitType data for all customer units
    const entityUnitTypeData = await this.loadEntityUnitTypeData(entityId, allCustomerUnits);
    
    console.log(`   Building indexed maps for O(1) data lookup...`);
    // 🚀 PERFORMANCE OPTIMIZATION: Build indexed Maps for O(1) lookup instead of O(n) filter
    const customerHistoryMap = new Map<number, typeof allCustomerHistory>();
    const customerNotesMap = new Map<number, typeof allCustomerNotes>();
    const customerAddressesMap = new Map<number, typeof allCustomerAddresses>();
    const customerCreditsMap = new Map<number, typeof allCustomerCredits>();
    const customerLocationsMap = new Map<number, typeof allCustomerLocations>();
    const customerEmployeesMap = new Map<number, typeof allCustomerEmployees>();
    const customerPaymentsMap = new Map<number, typeof allCustomerPayments>();
    const customerUnitsMap = new Map<number, typeof allCustomerUnits>();
    const customerOrdersMap = new Map<number, typeof repairOrders>();
    
    // Build indexes for all data types
    allCustomerHistory.forEach(h => {
      if (!customerHistoryMap.has(h.customerId)) customerHistoryMap.set(h.customerId, []);
      customerHistoryMap.get(h.customerId)!.push(h);
    });
    
    allCustomerNotes.forEach(n => {
      if (!customerNotesMap.has(n.customerId)) customerNotesMap.set(n.customerId, []);
      customerNotesMap.get(n.customerId)!.push(n);
    });
    
    allCustomerAddresses.forEach(a => {
      if (!customerAddressesMap.has(a.customerId)) customerAddressesMap.set(a.customerId, []);
      customerAddressesMap.get(a.customerId)!.push(a);
    });
    
    allCustomerCredits.forEach(c => {
      if (!customerCreditsMap.has(c.customerId)) customerCreditsMap.set(c.customerId, []);
      customerCreditsMap.get(c.customerId)!.push(c);
    });
    
    allCustomerLocations.forEach(l => {
      if (l.customerId) {
        if (!customerLocationsMap.has(l.customerId)) customerLocationsMap.set(l.customerId, []);
        customerLocationsMap.get(l.customerId)!.push(l);
      }
    });
    
    allCustomerEmployees.forEach(e => {
      if (e.customerId) {
        if (!customerEmployeesMap.has(e.customerId)) customerEmployeesMap.set(e.customerId, []);
        customerEmployeesMap.get(e.customerId)!.push(e);
      }
    });
    
    allCustomerPayments.forEach(p => {
      if (p.customerId) {
        if (!customerPaymentsMap.has(p.customerId)) customerPaymentsMap.set(p.customerId, []);
        customerPaymentsMap.get(p.customerId)!.push(p);
      }
    });
    
    allCustomerUnits.forEach(u => {
      if (u.customerId) {
        if (!customerUnitsMap.has(u.customerId)) customerUnitsMap.set(u.customerId, []);
        customerUnitsMap.get(u.customerId)!.push(u);
      }
    });
    
    repairOrders.forEach(order => {
      if (order.customerId) {
        if (!customerOrdersMap.has(order.customerId)) customerOrdersMap.set(order.customerId, []);
        customerOrdersMap.get(order.customerId)!.push(order);
      }
    });
    
    // Build repair orders by customerUnitId index for unit processing
    const repairOrdersByUnitMap = new Map<number, typeof repairOrders>();
    repairOrders.forEach(order => {
      if (order.customerUnitId) {
        if (!repairOrdersByUnitMap.has(order.customerUnitId)) repairOrdersByUnitMap.set(order.customerUnitId, []);
        repairOrdersByUnitMap.get(order.customerUnitId)!.push(order);
      }
    });
    
    console.log(`   ✅ Built indexed maps for ${customers.length} customers and ${allCustomerUnits.length} units`);
    console.log(`   Processing ${customers.length} customers with bulk data...`);
    let processed = 0;
    
    for (const customer of customers) {
      try {
        // 🚀 OPTIMIZED: O(1) Map lookup instead of O(n) filter
        const customerHistory = customerHistoryMap.get(customer.customerId) || [];
        const customerNotes = customerNotesMap.get(customer.customerId) || [];
        const customerAddresses = customerAddressesMap.get(customer.customerId) || [];
        const customerCredits = customerCreditsMap.get(customer.customerId) || [];
        const customerLocations = customerLocationsMap.get(customer.customerId) || [];
        const customerEmployees = customerEmployeesMap.get(customer.customerId) || [];
        const customerPayments = customerPaymentsMap.get(customer.customerId) || [];
        const customerUnits = customerUnitsMap.get(customer.customerId) || [];
        const customerOrders = customerOrdersMap.get(customer.customerId) || [];

        // Create customer directory
        await this.outputManager.createCustomerDirectory(entityId.toString(), customer.customerId.toString());

        // Create enhanced customer data with pre-loaded bulk data
        const enhancedCustomer = await this.createEnhancedCustomerDataFromBulk(customer, {
          history: customerHistory,
          notes: customerNotes,
          addresses: customerAddresses,
          credits: customerCredits,
          locations: customerLocations,
          employees: customerEmployees,
          payments: customerPayments,
          units: customerUnits
        });

        // Write enhanced customer data to customers/{customerId}/entity.json
        await this.outputManager.writeCustomerJson(entityId.toString(), customer.customerId.toString(), enhancedCustomer);

        // Update customer data for summary generation
        this.outputManager.updateCustomerData(entityId.toString(), customer.customerId.toString(), enhancedCustomer);

        // Process each unit for this customer
        for (const unit of customerUnits) {
          // 🚀 OPTIMIZED: O(1) Map lookup for unit orders instead of O(n) filter
          const unitOrders = repairOrdersByUnitMap.get(unit.customerUnitId) || [];
          
          // Create unit directory
          await this.outputManager.createUnitDirectory(entityId.toString(), customer.customerId.toString(), unit.customerUnitId.toString());
          
          // Denormalize unit data (without service orders - they'll be in separate files)
          const denormalizedUnit = this.denormalizeUnit(unit, [], entityUnitTypeData);
          
          // Write unit JSON file as flat structure
          const flatUnit = this.flattenUnitData(denormalizedUnit);
          await this.outputManager.writeUnitJson(entityId.toString(), customer.customerId.toString(), unit.customerUnitId.toString(), flatUnit);

          // Update unit data for summary generation
          this.outputManager.updateUnitData(entityId.toString(), customer.customerId.toString(), unit.customerUnitId.toString(), flatUnit);
        }
        
        processed++;
        
        // Record successful processing
        this.qualityTracker.incrementTotal('Customer', 1);
        this.qualityTracker.incrementProcessed('Customer');
        
      } catch (error) {
        console.error(`❌ Error processing Customer ${customer.customerId}:`, error);
        this.qualityTracker.incrementError('Customer');
      }
    }

    console.log(`   ✅ Processed ${processed}/${customers.length} customers for Entity ${entityId}`);
    console.log(`      📦 ${allCustomerUnits.length} units processed`);
    console.log(`      👥 ${allCustomerEmployees.length} customer employees processed`);
    console.log(`      🔧 ${repairOrders.length} repair orders processed`);
    console.log(`      💳 ${allCustomerPayments.length} payments processed`);

    // Report vehicle matching statistics
    this.reportVehicleMatchingStatistics();

    // Save vehicle matching statistics to knowledge base
    await this.saveVehicleMatchingStatistics(entityId);
  }

  /**
   * Denormalize a single customer with all related data
   */
  private denormalizeCustomer(
    customer: Customer,
    units: CustomerUnit[],
    employees: CustomerEmployee[],
    addresses: Address[],
    repairOrders: RepairOrder[],
    payments: CustomerPayment[],
    entityUnitTypeData?: Map<number, EntityUnitTypeData>
  ): DenormalizedCustomer {
    // Denormalize units
    const denormalizedUnits = units.map(unit => this.denormalizeUnit(unit, repairOrders, entityUnitTypeData));

    // Denormalize employees
    const denormalizedEmployees = employees.map(emp => this.denormalizeCustomerEmployee(emp));

    // Get customer addresses
    const customerAddresses = this.getCustomerAddresses(customer, addresses);

    // Calculate service history
    const completedOrders = repairOrders.filter(order => 
      order.workFlowStatus?.toLowerCase() === 'completed' || 
      order.completedDate
    ).length;
    const inProgressOrders = repairOrders.filter(order => 
      order.workFlowStatus?.toLowerCase() === 'in progress' ||
      order.workFlowStatus?.toLowerCase() === 'assigned'
    ).length;
    const lastServiceDate = this.getLastServiceDate(repairOrders);

    // Calculate financial summary
    const totalPaid = payments.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);
    const totalLifetimeValue = this.calculateLifetimeValue(repairOrders);

    return {
      customerId: customer.customerId,
      entityId: customer.entityId,
      basicInfo: {
        legalName: customer.legalName,
        title: customer.title,
        status: customer.status,
        active: customer.active
      },
      contact: {
        phone: customer.phone,
        addresses: customerAddresses,
        employees: denormalizedEmployees
      },
      billing: {
        billToCustomerId: customer.billToCustomerId,
        billingAddress: addresses.find(addr => addr.addressId === customer.billingCustomerAddressId)
      },
      units: denormalizedUnits,
      serviceHistory: {
        totalRepairOrders: repairOrders.length,
        completedOrders,
        inProgressOrders,
        lastServiceDate
      },
      financials: {
        totalLifetimeValue,
        totalPaid,
        outstandingBalance: totalLifetimeValue - totalPaid
      },
      metadata: {
        created: customer.created,
        modified: customer.modified,
        exportTimestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Denormalize a customer unit with optional EntityUnitType data
   */
  private denormalizeUnit(
    unit: CustomerUnit, 
    repairOrders: RepairOrder[], 
    entityUnitTypeData?: Map<number, EntityUnitTypeData>
  ): DenormalizedUnit {
    const unitOrders = repairOrders.filter(order => order.customerUnitId === unit.customerUnitId);
    const lastServiceDate = this.getLastServiceDate(unitOrders);

    const denormalizedUnit: DenormalizedUnit = {
      customerUnitId: unit.customerUnitId,
      customerId: unit.customerId,
      basicInfo: {
        number: unit.number,
        fleetNumber: unit.fleetNumber,
        title: unit.title,
        status: unit.status,
        active: unit.active
      },
      vehicle: {
        licensePlate: unit.licensePlate,
        licensePlateState: unit.licensePlateState,
        make: unit.make,
        model: unit.model,
        year: unit.year,
        vin: unit.vin,
        entityUnitTypeId: unit.entityUnitTypeId,
        standardizedVehicle: unit.standardizedVehicle,
        vehicleAlternatives: unit.vehicleAlternatives,
        customFields: unit.customFields
      },
      location: {
        customerAddressId: unit.customerAddressId,
        shopHasPossession: unit.shopHasPossession,
        accessMethod: unit.accessMethod
      },
      maintenance: {
        assistWithPM: unit.assistWithPreventiveMaintenance,
        trackPM: unit.trackPreventiveMaintenance
      },
      serviceHistory: {
        totalServiceOrders: unitOrders.length,
        lastServiceDate
      }
    };

    // 🏗️ Add EntityUnitType data if available
    if (unit.entityUnitTypeId && entityUnitTypeData?.has(unit.entityUnitTypeId)) {
      const unitTypeInfo = entityUnitTypeData.get(unit.entityUnitTypeId)!;
      denormalizedUnit.unitType = {
        entityUnitTypeId: unitTypeInfo.entityUnitTypeId,
        parentEntityUnitTypeId: unitTypeInfo.parentEntityUnitTypeId,
        title: unitTypeInfo.title,
        entityTaxLocationId: unitTypeInfo.entityTaxLocationId,
        preferredVehicleIdLabel: unitTypeInfo.preferredVehicleIdLabel,
        disableVinValidation: unitTypeInfo.disableVinValidation,
        excludeFromCarCount: unitTypeInfo.excludeFromCarCount,
        isDefault: unitTypeInfo.isDefault,
        components: unitTypeInfo.components.map(comp => ({
          entityUnitTypeEntityComponentEntryId: comp.entityUnitTypeEntityComponentEntryId,
          entityComponentId: comp.entityComponentId,
          entityLaborRateId: comp.entityLaborRateId,
          trackUsage: comp.trackUsage
        })),
        componentSystems: unitTypeInfo.componentSystems.map(sys => ({
          entityUnitTypeEntityComponentSystemEntryId: sys.entityUnitTypeEntityComponentSystemEntryId,
          entityComponentSystemId: sys.entityComponentSystemId
        })),
        componentSystemCorrections: unitTypeInfo.componentSystemCorrections.map(corr => ({
          entityUnitTypeEntityComponentSystemCorrectionEntryId: corr.entityUnitTypeEntityComponentSystemCorrectionEntryId,
          entityComponentSystemCorrectionId: corr.entityComponentSystemCorrectionId
        }))
      };
    }

    // 🏗️ Add SubEntityUnitType data if available
    if (unit.subEntityUnitTypeId && entityUnitTypeData?.has(unit.subEntityUnitTypeId)) {
      const subUnitTypeInfo = entityUnitTypeData.get(unit.subEntityUnitTypeId)!;
      denormalizedUnit.subUnitType = {
        entityUnitTypeId: subUnitTypeInfo.entityUnitTypeId,
        parentEntityUnitTypeId: subUnitTypeInfo.parentEntityUnitTypeId,
        title: subUnitTypeInfo.title,
        entityTaxLocationId: subUnitTypeInfo.entityTaxLocationId,
        preferredVehicleIdLabel: subUnitTypeInfo.preferredVehicleIdLabel,
        disableVinValidation: subUnitTypeInfo.disableVinValidation,
        excludeFromCarCount: subUnitTypeInfo.excludeFromCarCount,
        isDefault: subUnitTypeInfo.isDefault,
        components: subUnitTypeInfo.components.map(comp => ({
          entityUnitTypeEntityComponentEntryId: comp.entityUnitTypeEntityComponentEntryId,
          entityComponentId: comp.entityComponentId,
          entityLaborRateId: comp.entityLaborRateId,
          trackUsage: comp.trackUsage
        })),
        componentSystems: subUnitTypeInfo.componentSystems.map(sys => ({
          entityUnitTypeEntityComponentSystemEntryId: sys.entityUnitTypeEntityComponentSystemEntryId,
          entityComponentSystemId: sys.entityComponentSystemId
        })),
        componentSystemCorrections: subUnitTypeInfo.componentSystemCorrections.map(corr => ({
          entityUnitTypeEntityComponentSystemCorrectionEntryId: corr.entityUnitTypeEntityComponentSystemCorrectionEntryId,
          entityComponentSystemCorrectionId: corr.entityComponentSystemCorrectionId
        }))
      };
    }

    return denormalizedUnit;
  }

  /**
   * Denormalize a customer employee
   */
  private denormalizeCustomerEmployee(employee: CustomerEmployee): DenormalizedCustomerEmployee {
    return {
      customerEmployeeId: employee.customerEmployeeId,
      customerId: employee.customerId,
      basicInfo: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        active: employee.active,
        isPrimary: employee.isPrimary
      },
      contact: {
        email: employee.email,
        phone: employee.phone,
        position: employee.position
      }
    };
  }

  /**
   * Get addresses associated with a customer
   */
  private getCustomerAddresses(customer: Customer, addresses: Address[]): Address[] {
    const customerAddresses: Address[] = [];

    // Physical address
    if (customer.physicalCustomerAddressId) {
      const physicalAddress = addresses.find(addr => addr.addressId === customer.physicalCustomerAddressId);
      if (physicalAddress) {
        customerAddresses.push({ ...physicalAddress, addressType: 'physical' } as any);
      }
    }

    // Ship-to address
    if (customer.shipToCustomerAddressId && customer.shipToCustomerAddressId !== customer.physicalCustomerAddressId) {
      const shipToAddress = addresses.find(addr => addr.addressId === customer.shipToCustomerAddressId);
      if (shipToAddress) {
        customerAddresses.push({ ...shipToAddress, addressType: 'ship-to' } as any);
      }
    }

    // Billing address
    if (customer.billingCustomerAddressId) {
      const billingAddress = addresses.find(addr => addr.addressId === customer.billingCustomerAddressId);
      if (billingAddress) {
        customerAddresses.push({ ...billingAddress, addressType: 'billing' } as any);
      }
    }

    return customerAddresses;
  }

  /**
   * Group customers by entity ID
   */
  private groupByEntity(customers: Customer[]): { [entityId: number]: Customer[] } {
    return customers.reduce((groups, customer) => {
      if (!groups[customer.entityId]) {
        groups[customer.entityId] = [];
      }
      groups[customer.entityId].push(customer);
      return groups;
    }, {} as { [entityId: number]: Customer[] });
  }

  /**
   * Get the last service date from repair orders
   */
  private getLastServiceDate(repairOrders: RepairOrder[]): string | undefined {
    const completedOrders = repairOrders
      .filter(order => order.completedDate)
      .sort((a, b) => new Date(b.completedDate!).getTime() - new Date(a.completedDate!).getTime());

    return completedOrders.length > 0 ? completedOrders[0].completedDate : undefined;
  }

  /**
   * Calculate total lifetime value from repair orders
   * Note: This is a simplified calculation - would need RepairOrderCharge data for accuracy
   */
  private calculateLifetimeValue(repairOrders: RepairOrder[]): number {
    // This is a placeholder - in reality we'd need to join with RepairOrderCharge
    // or other financial tables to get accurate totals
    return repairOrders.length * 500; // Estimated $500 per order
  }

  /**
   * Flatten customer data to match example format
   */
  private flattenCustomerData(denormalized: DenormalizedCustomer): any {
    return {
      customerId: denormalized.customerId,
      entityId: denormalized.entityId,
      legalName: denormalized.basicInfo.legalName,
      title: denormalized.basicInfo.title,
      status: denormalized.basicInfo.status,
      active: denormalized.basicInfo.active,
      phone: denormalized.contact.phone,
      created: denormalized.metadata.created,
      modified: denormalized.metadata.modified
    };
  }

  /**
   * Flatten unit data to match example format
   */
  private flattenUnitData(denormalized: DenormalizedUnit): any {
    return {
      customerUnitId: denormalized.customerUnitId,
      customerId: denormalized.customerId,
      number: denormalized.basicInfo.number,
      fleetNumber: denormalized.basicInfo.fleetNumber,
      title: denormalized.basicInfo.title,
      status: denormalized.basicInfo.status,
      active: denormalized.basicInfo.active,
      licensePlate: denormalized.vehicle.licensePlate,
      licensePlateState: denormalized.vehicle.licensePlateState,
      make: denormalized.vehicle.make,
      model: denormalized.vehicle.model,
      year: denormalized.vehicle.year,
      vin: denormalized.vehicle.vin,
      entityUnitTypeId: denormalized.vehicle.entityUnitTypeId,
      standardizedVehicle: denormalized.vehicle.standardizedVehicle,
      vehicleAlternatives: denormalized.vehicle.vehicleAlternatives,
      customFields: denormalized.vehicle.customFields,
      customerAddressId: denormalized.location.customerAddressId,
      shopHasPossession: denormalized.location.shopHasPossession,
      accessMethod: denormalized.location.accessMethod,
      assistWithPreventiveMaintenance: denormalized.maintenance.assistWithPM,
      trackPreventiveMaintenance: denormalized.maintenance.trackPM,
      // 🏗️ NEW: Include EntityUnitType aggregated data
      unitType: denormalized.unitType,
      // 🏗️ NEW: Include SubEntityUnitType aggregated data
      subUnitType: denormalized.subUnitType
    };
  }

  /**
   * Create enhanced customer data with aggregated second-level Customer tables
   * Similar to EntityProcessor.createEnhancedEntityData()
   */
  private async createEnhancedCustomerData(customer: Customer): Promise<EnhancedCustomer> {
    console.log(`📋 Loading second-level Customer tables for customer ${customer.customerId}...`);
    
    // Initialize enhanced customer with base fields and empty arrays
    const enhancedCustomer: EnhancedCustomer = {
      // Copy all base Customer fields
      ...customer,
      // Initialize all 8 second-level table arrays
      history: [],
      notes: [],
      addresses: [],
      credits: [],
      locations: [],
      employees: [],
      payments: [],
      units: []
    };

    try {
      // Load all 8 second-level Customer tables in parallel
      // Note: CustomerLocation uses complex relationship via CustomerEntityLocationEntry
      const [
        history,
        notes,
        addresses,
        credits,
        locations,
        employees,
        payments,
        units
      ] = await Promise.all([
        this.loadCustomerHistory(customer.customerId),
        this.loadCustomerNotes(customer.customerId),
        this.loadCustomerAddresses(customer.customerId),
        this.loadCustomerCredits(customer.customerId),
        this.loadCustomerLocations(customer.customerId),
        this.loadCustomerEmployees(customer.customerId),
        this.loadCustomerPayments(customer.customerId),
        this.loadCustomerUnits(customer.customerId)
      ]);

      // Add all 8 second-level table arrays (empty arrays if no data)
      enhancedCustomer.history = history;
      enhancedCustomer.notes = notes;
      enhancedCustomer.addresses = addresses;
      enhancedCustomer.credits = credits;
      enhancedCustomer.locations = locations;
      enhancedCustomer.employees = employees;
      enhancedCustomer.payments = payments;
      enhancedCustomer.units = units;

      console.log(`✅ Enhanced customer ${customer.customerId} with 8 second-level tables:`);
      console.log(`   📚 History: ${history.length} records`);
      console.log(`   📝 Notes: ${notes.length} records`);
      console.log(`   🏠 Addresses: ${addresses.length} records`);
      console.log(`   💳 Credits: ${credits.length} records`);
      console.log(`   📍 Locations: ${locations.length} records`);
      console.log(`   👥 Employees: ${employees.length} records`);
      console.log(`   💰 Payments: ${payments.length} records`);
      console.log(`   🚚 Units: ${units.length} records`);

      return enhancedCustomer;
    } catch (error) {
      console.error(`❌ Error loading second-level tables for customer ${customer.customerId}:`, error);
      // Return basic customer data if second-level loading fails
      return enhancedCustomer;
    }
  }

  // Second-level table loading methods (similar to EntityProcessor)
  private async loadCustomerHistory(customerId: number): Promise<CustomerHistory[]> {
    // Check cache first
    if (this.customerHistoryCache.has(customerId)) {
      console.log(`💾 Using cached history for customer ${customerId}`);
      return this.customerHistoryCache.get(customerId)!;
    }

    try {
      const history = await this.dataReader.query<CustomerHistory>(
        'SELECT * FROM CustomerHistory WHERE customerId = ?',
        [customerId]
      );
      this.customerHistoryCache.set(customerId, history);
      console.log(`📦 Cached ${history.length} history records for customer ${customerId}`);
      return history;
    } catch (error) {
      console.warn(`⚠️  Failed to load CustomerHistory for customer ${customerId}:`, error);
      const emptyHistory: CustomerHistory[] = [];
      this.customerHistoryCache.set(customerId, emptyHistory);
      return emptyHistory;
    }
  }

  private async loadCustomerNotes(customerId: number): Promise<CustomerNote[]> {
    // Check cache first
    if (this.customerNotesCache.has(customerId)) {
      console.log(`💾 Using cached notes for customer ${customerId}`);
      return this.customerNotesCache.get(customerId)!;
    }

    try {
      const notes = await this.dataReader.query<CustomerNote>(
        'SELECT * FROM CustomerNote WHERE customerId = ?',
        [customerId]
      );
      this.customerNotesCache.set(customerId, notes);
      console.log(`📦 Cached ${notes.length} notes for customer ${customerId}`);
      return notes;
    } catch (error) {
      console.warn(`⚠️  Failed to load CustomerNote for customer ${customerId}:`, error);
      const emptyNotes: CustomerNote[] = [];
      this.customerNotesCache.set(customerId, emptyNotes);
      return emptyNotes;
    }
  }

  private async loadCustomerAddresses(customerId: number): Promise<CustomerAddress[]> {
    // Check cache first
    if (this.customerAddressesCache.has(customerId)) {
      console.log(`💾 Using cached addresses for customer ${customerId}`);
      return this.customerAddressesCache.get(customerId)!;
    }

    try {
      const addresses = await this.dataReader.query<CustomerAddress>(
        'SELECT * FROM CustomerAddress WHERE customerId = ?',
        [customerId]
      );
      this.customerAddressesCache.set(customerId, addresses);
      console.log(`📦 Cached ${addresses.length} addresses for customer ${customerId}`);
      return addresses;
    } catch (error) {
      console.warn(`⚠️  Failed to load CustomerAddress for customer ${customerId}:`, error);
      const emptyAddresses: CustomerAddress[] = [];
      this.customerAddressesCache.set(customerId, emptyAddresses);
      return emptyAddresses;
    }
  }

  private async loadCustomerCredits(customerId: number): Promise<CustomerCredit[]> {
    try {
      return await this.dataReader.query<CustomerCredit>(
        'SELECT * FROM CustomerCredit WHERE customerId = ?',
        [customerId]
      );
    } catch (error) {
      console.warn(`⚠️  Failed to load CustomerCredit for customer ${customerId}:`, error);
      // If this table also has schema issues, we should handle it gracefully
      return [];
    }
  }

  private async loadCustomerLocations(customerId: number): Promise<CustomerLocation[]> {
    try {
      // CustomerLocation is accessed through CustomerEntityLocationEntry intermediate table
      // Join: Customer -> CustomerEntityLocationEntry -> CustomerLocation (via entityLocationId)
      const locations = await this.dataReader.query<CustomerLocation>(`
        SELECT cl.customerLocationId, cl.entityLocationId, cl.title
        FROM CustomerEntityLocationEntry cele
        JOIN CustomerLocation cl ON cele.entityLocationId = cl.entityLocationId
        WHERE cele.customerId = ?
      `, [customerId]);
      
      return locations;
    } catch (error) {
      console.warn(`⚠️  Failed to load CustomerLocation for customer ${customerId}:`, error);
      return [];
    }
  }

  private async loadCustomerEmployees(customerId: number): Promise<CustomerEmployee[]> {
    // Check cache first
    if (this.customerEmployeesCache.has(customerId)) {
      console.log(`💾 Using cached employees for customer ${customerId}`);
      return this.customerEmployeesCache.get(customerId)!;
    }

    try {
      const employees = await this.dataReader.query<CustomerEmployee>(
        'SELECT * FROM CustomerEmployee WHERE customerId = ?',
        [customerId]
      );
      this.customerEmployeesCache.set(customerId, employees);
      console.log(`📦 Cached ${employees.length} employees for customer ${customerId}`);
      return employees;
    } catch (error) {
      console.warn(`⚠️  Failed to load CustomerEmployee for customer ${customerId}:`, error);
      const emptyEmployees: CustomerEmployee[] = [];
      this.customerEmployeesCache.set(customerId, emptyEmployees);
      return emptyEmployees;
    }
  }

  private async loadCustomerPayments(customerId: number): Promise<CustomerPayment[]> {
    try {
      return await this.dataReader.query<CustomerPayment>(
        'SELECT * FROM CustomerPayment WHERE customerId = ?',
        [customerId]
      );
    } catch (error) {
      console.warn(`⚠️  Failed to load CustomerPayment for customer ${customerId}:`, error);
      return [];
    }
  }

  private async loadCustomerUnits(customerId: number): Promise<CustomerUnit[]> {
    // Check cache first
    if (this.customerUnitsCache.has(customerId)) {
      console.log(`💾 Using cached units for customer ${customerId}`);
      return this.customerUnitsCache.get(customerId)!;
    }

    try {
      const units = await this.dataReader.query<CustomerUnit>(
        'SELECT * FROM CustomerUnit WHERE customerId = ?',
        [customerId]
      );
      this.customerUnitsCache.set(customerId, units);
      console.log(`📦 Cached ${units.length} units for customer ${customerId}`);
      return units;
    } catch (error) {
      console.warn(`⚠️  Failed to load CustomerUnit for customer ${customerId}:`, error);
      const emptyUnits: CustomerUnit[] = [];
      this.customerUnitsCache.set(customerId, emptyUnits);
      return emptyUnits;
    }
  }

  // Bulk loading methods for performance optimization
  private async bulkLoadCustomerHistory(customerIds: number[]): Promise<CustomerHistory[]> {
    if (customerIds.length === 0) return [];
    try {
      const placeholders = customerIds.map(() => '?').join(',');
      return await this.dataReader.query<CustomerHistory>(
        `SELECT * FROM CustomerHistory WHERE customerId IN (${placeholders})`,
        customerIds
      );
    } catch (error) {
      console.warn(`⚠️  Failed to bulk load CustomerHistory:`, error);
      return [];
    }
  }

  private async bulkLoadCustomerNotes(customerIds: number[]): Promise<CustomerNote[]> {
    if (customerIds.length === 0) return [];
    try {
      const placeholders = customerIds.map(() => '?').join(',');
      return await this.dataReader.query<CustomerNote>(
        `SELECT * FROM CustomerNote WHERE customerId IN (${placeholders})`,
        customerIds
      );
    } catch (error) {
      console.warn(`⚠️  Failed to bulk load CustomerNote:`, error);
      return [];
    }
  }

  private async bulkLoadCustomerAddresses(customerIds: number[]): Promise<CustomerAddress[]> {
    if (customerIds.length === 0) return [];
    try {
      const placeholders = customerIds.map(() => '?').join(',');
      return await this.dataReader.query<CustomerAddress>(
        `SELECT * FROM CustomerAddress WHERE customerId IN (${placeholders})`,
        customerIds
      );
    } catch (error) {
      console.warn(`⚠️  Failed to bulk load CustomerAddress:`, error);
      return [];
    }
  }

  private async bulkLoadCustomerCredits(customerIds: number[]): Promise<CustomerCredit[]> {
    if (customerIds.length === 0) return [];
    try {
      const placeholders = customerIds.map(() => '?').join(',');
      return await this.dataReader.query<CustomerCredit>(
        `SELECT * FROM CustomerCredit WHERE customerId IN (${placeholders})`,
        customerIds
      );
    } catch (error) {
      console.warn(`⚠️  Failed to bulk load CustomerCredit:`, error);
      return [];
    }
  }

  private async bulkLoadCustomerLocations(customerIds: number[]): Promise<CustomerLocation[]> {
    if (customerIds.length === 0) return [];
    try {
      const placeholders = customerIds.map(() => '?').join(',');
      return await this.dataReader.query<CustomerLocation>(`
        SELECT cl.customerLocationId, cl.entityLocationId, cl.title, cele.customerId
        FROM CustomerEntityLocationEntry cele
        JOIN CustomerLocation cl ON cele.entityLocationId = cl.entityLocationId
        WHERE cele.customerId IN (${placeholders})
      `, customerIds);
    } catch (error) {
      console.warn(`⚠️  Failed to bulk load CustomerLocation:`, error);
      return [];
    }
  }

  private async bulkLoadCustomerEmployees(customerIds: number[]): Promise<CustomerEmployee[]> {
    if (customerIds.length === 0) return [];
    try {
      const placeholders = customerIds.map(() => '?').join(',');
      return await this.dataReader.query<CustomerEmployee>(
        `SELECT * FROM CustomerEmployee WHERE customerId IN (${placeholders})`,
        customerIds
      );
    } catch (error) {
      console.warn(`⚠️  Failed to bulk load CustomerEmployee:`, error);
      return [];
    }
  }

  private async bulkLoadCustomerPayments(customerIds: number[]): Promise<CustomerPayment[]> {
    if (customerIds.length === 0) return [];
    try {
      const placeholders = customerIds.map(() => '?').join(',');
      return await this.dataReader.query<CustomerPayment>(
        `SELECT * FROM CustomerPayment WHERE customerId IN (${placeholders})`,
        customerIds
      );
    } catch (error) {
      console.warn(`⚠️  Failed to bulk load CustomerPayment:`, error);
      return [];
    }
  }

  private async bulkLoadCustomerUnits(customerIds: number[]): Promise<CustomerUnit[]> {
    if (customerIds.length === 0) return [];

    // Validate cache state first
    const validation = this.validateCacheForCustomers(customerIds);
    
    if (validation.valid) {
      // All customer IDs are in cache, use cached data
      const allUnits: CustomerUnit[] = [];
      for (const customerId of customerIds) {
        const units = this.customerUnitsCache.get(customerId)!;
        allUnits.push(...units);
      }
      console.log(`💾 Retrieved ${allUnits.length} units from cache for ${customerIds.length} customers`);
      return allUnits;
    }

    // Cache miss detected - implement fallback mechanism
    console.warn(`⚠️  Cache miss detected for ${validation.missingIds.length} customers: ${validation.missingIds.join(', ')}`);
    console.warn(`🔍 ${this.getCacheStateInfo()}`);

    const allUnits: CustomerUnit[] = [];

    // Get cached data for available customers
    const availableCustomerIds = customerIds.filter(id => this.customerUnitsCache.has(id));
    for (const customerId of availableCustomerIds) {
      const units = this.customerUnitsCache.get(customerId)!;
      allUnits.push(...units);
    }

    // Fallback: Query database directly for missing customer IDs
    if (validation.missingIds.length > 0) {
      console.log(`🔄 Fallback: Querying database for ${validation.missingIds.length} missing customers...`);
      
      try {
        const placeholders = validation.missingIds.map(() => '?').join(',');
        const missingUnits = await this.dataReader.query<CustomerUnit>(
          `SELECT * FROM CustomerUnit WHERE customerId IN (${placeholders})`,
          validation.missingIds
        );

        // Cache the fallback data to prevent future misses
        this.groupAndCacheCustomerData(missingUnits, this.customerUnitsCache);
        
        // Update cache state to include the newly loaded customers
        if (this.cacheState) {
          validation.missingIds.forEach(id => this.cacheState!.customerIds.add(id));
          this.cacheState.populationMethod = 'fallback';
          this.cacheState.lastUpdated = new Date();
        }

        allUnits.push(...missingUnits);
        console.log(`✅ Fallback successful: Retrieved ${missingUnits.length} units for ${validation.missingIds.length} customers`);
        
      } catch (error) {
        console.error(`❌ Fallback failed for missing customers:`, error);
        throw new Error(`CustomerUnit cache miss and fallback failed for customers: ${validation.missingIds.join(', ')}. Original error: ${error}`);
      }
    }

    console.log(`💾 Retrieved ${allUnits.length} total units (${availableCustomerIds.length} from cache, ${validation.missingIds.length} from fallback)`);
    return allUnits;
  }

  /**
   * Create enhanced customer data from pre-loaded bulk data (performance optimized)
   */
  private async createEnhancedCustomerDataFromBulk(customer: Customer, bulkData: {
    history: CustomerHistory[];
    notes: CustomerNote[];
    addresses: CustomerAddress[];
    credits: CustomerCredit[];
    locations: CustomerLocation[];
    employees: CustomerEmployee[];
    payments: CustomerPayment[];
    units: CustomerUnit[];
  }): Promise<EnhancedCustomer> {
    // Create enhanced customer with base fields and bulk-loaded arrays
    const enhancedCustomer: EnhancedCustomer = {
      // Copy all base Customer fields
      ...customer,
      // Use pre-loaded bulk data
      history: bulkData.history,
      notes: bulkData.notes,
      addresses: bulkData.addresses,
      credits: bulkData.credits,
      locations: bulkData.locations,
      employees: bulkData.employees,
      payments: bulkData.payments,
      units: bulkData.units
    };

    return enhancedCustomer;
  }

  /**
   * Initialize AutoCare vehicle matching if enabled
   */
  private async initializeVehicleMatching(): Promise<void> {
    try {
      console.log('🚗 Initializing AutoCare vehicle matching...');
      const startTime = Date.now();
      
      const autoCareLoader = getAutoCareLoader();
      console.log('📦 Loading AutoCare data...');
      const autoCareData = await autoCareLoader.loadData();
      const vcdbPath = autoCareLoader.getVcdbPath(); // Get VCDB path
      console.log(`📁 VCdb Path: ${vcdbPath}`);
      
      console.log('🔧 Creating VehicleMatcher...');
      this.vehicleMatcher = new VehicleMatcher(autoCareData);
      console.log('🦆 Enabling Parquet key lookup...');
      await this.vehicleMatcher.enableParquetIndex();
      console.log('🔧 Creating VehicleAggregator...');
      this.vehicleAggregator = new VehicleAggregator(vcdbPath, autoCareData, this.vehicleMatcher);
      
      console.log('⚡ Initializing VehicleAggregator...');
      await this.vehicleAggregator.initialize();
      
      const duration = Date.now() - startTime;
      console.log(`✅ Vehicle matching initialized in ${duration}ms`);
    } catch (error) {
      console.error('❌ Failed to initialize vehicle matching:', error);
      console.error('   Error details:', error instanceof Error ? error.stack : String(error));
      this.vehicleMatcher = null;
      this.vehicleAggregator = null;
    }
  }

  /**
   * Batch match customer units to AutoCare VCdb standards
   */
  private async batchMatchVehicles(entityId: number, customerUnits: CustomerUnit[]): Promise<void> {
    if (!this.vehicleAggregator) {
      console.log('⚠️  Vehicle aggregator not available, skipping vehicle matching');
      return;
    }

    try {
      console.log(`🚗 Processing ${customerUnits.length} customer units for AutoCare matching...`);
      const startTime = Date.now();
      
      // Analyze vehicle data quality
      const unitsWithVehicleData = customerUnits.filter(unit => 
        (unit.make && unit.make.trim()) || (unit.model && unit.model.trim()) || (unit.year && unit.year > 0)
      );
      
      console.log(`   📊 ${unitsWithVehicleData.length}/${customerUnits.length} units have vehicle data for matching`);
      console.log(`   📊 ${customerUnits.length - unitsWithVehicleData.length} units have no vehicle identification`);
      
      // Show sample data
      if (unitsWithVehicleData.length > 0) {
        console.log('   🔍 Sample vehicles:');
        for (let i = 0; i < Math.min(3, unitsWithVehicleData.length); i++) {
          const unit = unitsWithVehicleData[i];
          console.log(`      Unit ${unit.customerUnitId}: ${unit.make || '?'} ${unit.model || '?'} ${unit.year || '?'}`);
        }
      }
      
      // Prepare batch shop vehicles for DuckDB processing - only units with vehicle info
      const batchVehicles: BatchShopVehicle[] = unitsWithVehicleData.map(unit => ({
        id: `${unit.customerUnitId}`,
        make: unit.make,
        model: unit.model,
        year: unit.year,
        entityId: entityId
      }));

      console.log(`   🔍 Preparing to match ${batchVehicles.length} units...`);

      // Phase 1: Parquet-backed pre-match via VehicleMatcher (fast O(1) map lookups)
      const preMatched = new Map<string, VehicleMatchResult>();
      const remainingForAggregator: BatchShopVehicle[] = [];

      if (this.vehicleMatcher && batchVehicles.length > 0) {
        const PREMATCH_CONFIDENCE = 0.95;
        for (const v of batchVehicles) {
          try {
            const r = this.vehicleMatcher.matchVehicle(v.make, v.model, v.year);
            const attempted = r.attemptedMethods || [];
            const usedParquet = attempted.includes('parquet_key');
            const confident = !!r.standardizedVehicle && (r.standardizedVehicle.confidence || 0) >= PREMATCH_CONFIDENCE;
            if (r.matched && (usedParquet || confident)) {
              preMatched.set(v.id, r);
              continue; // Skip aggregator for this unit
            }
          } catch (_) {
            // Fall through to aggregator
          }
          remainingForAggregator.push(v);
        }
      } else {
        remainingForAggregator.push(...batchVehicles);
      }

      console.log(`   🦆 Pre-matched via Parquet: ${preMatched.size}`);
      console.log(`   🧮 Remaining for aggregator: ${remainingForAggregator.length}`);

      // Phase 2: Batch match remaining vehicles with DuckDB aggregator
      let aggResults: Map<string, VehicleMatchResult> = new Map();
      if (remainingForAggregator.length > 0) {
        aggResults = await this.vehicleAggregator.batchMatchVehicles(remainingForAggregator);
      } else if (batchVehicles.length === 0) {
        console.log('   ⚠️  No units with vehicle data found for AutoCare matching');
      }

      const batchResults: Map<string, VehicleMatchResult> = new Map<string, VehicleMatchResult>([
        ...preMatched,
        ...aggResults
      ]);
      
      let totalConfidence = 0;
      let matchedCount = 0;
      
      // Apply results to ALL customer units - each unit is a vehicle regardless of data quality
      for (const unit of customerUnits) {
        const unitId = `${unit.customerUnitId}`;
        const matchResult = batchResults.get(unitId);
        
        this.vehicleMatchingStats.total++;
        
        // Check if this unit has no vehicle identification data at all
        if (!unit.make && !unit.model && !unit.year) {
          // Distinguish between units with VIN but no decoded data vs no data at all
          let failureReason: VehicleMatchFailureReason;
          let failureDetails: string;
          
          if (unit.vin && unit.vin.trim()) {
            // Has VIN but no make/model/year - likely VIN decode failed or not attempted
            failureReason = VehicleMatchFailureReason.VIN_DECODE_FAILED;
            failureDetails = `Has VIN (${unit.vin}) but no decoded vehicle data (no make, model, or year)`;
          } else {
            // No VIN and no make/model/year - truly no vehicle data
            failureReason = VehicleMatchFailureReason.NO_VEHICLE_DATA;
            failureDetails = 'Unit has no vehicle identification data (no VIN, make, model, or year)';
          }
          
          unit.matchFailureReason = failureReason;
          unit.matchFailureDetails = failureDetails;
          
          // Collect failure statistics
          this.failureReasonStats.set(failureReason, (this.failureReasonStats.get(failureReason) || 0) + 1);
          
          // Collect failed vehicle details
          {
            this.failedVehicles.push({
              make: unit.vin ? `VIN:${unit.vin.substring(0, 7)}` : '-',
              model: '-', 
              year: 0,
              reason: failureReason
            });
          }
          
          this.vehicleMatchingStats.noMatches++;
          continue;
        }
        
        if (matchResult?.matched && matchResult.standardizedVehicle) {
          unit.standardizedVehicle = matchResult.standardizedVehicle;
          unit.vehicleAlternatives = this.formatVehicleAlternatives(
            matchResult.alternatives,
            matchResult.standardizedVehicle
          );
          totalConfidence += matchResult.standardizedVehicle.confidence;
          matchedCount++;
          
          // Track match types based on confidence
          if (matchResult.standardizedVehicle.confidence === 1.0) {
            this.vehicleMatchingStats.exactMatches++;
          } else {
            this.vehicleMatchingStats.fuzzyMatches++;
          }
        } else {
          unit.vehicleAlternatives = undefined;
          // Handle all failure cases - both with and without match results
          let failureReason: VehicleMatchFailureReason = VehicleMatchFailureReason.EXCEPTION_ERROR;
          let failureDetails = '';
          
          if (matchResult && !matchResult.matched) {
            // Has match result but failed - use the returned reason
            failureReason = matchResult.failureReason || VehicleMatchFailureReason.EXCEPTION_ERROR;
            failureDetails = matchResult.failureDetails || '';
          } else if (!matchResult) {
            // No match result at all - analyze why vehicle wasn't processed
            if (!unit.make || unit.make.trim() === '' || unit.make === '-') {
              failureReason = VehicleMatchFailureReason.MISSING_MAKE;
              failureDetails = 'Vehicle make not provided or invalid';
            } else if (!unit.model || unit.model.trim() === '' || unit.model === '-') {
              failureReason = VehicleMatchFailureReason.MISSING_MODEL;
              failureDetails = 'Vehicle model not provided or invalid';
            } else if (!unit.year || unit.year === 0) {
              failureReason = VehicleMatchFailureReason.MISSING_YEAR;
              failureDetails = 'Vehicle year not provided or is zero';
            } else {
              failureReason = VehicleMatchFailureReason.NO_MATCH_RESULT;
              failureDetails = 'Vehicle was not included in batch processing';
            }
          }
          
          // Save failure information for all unmatched vehicles
          unit.matchFailureReason = failureReason;
          unit.matchFailureDetails = failureDetails;
          
          // Collect failure statistics
          this.failureReasonStats.set(failureReason, (this.failureReasonStats.get(failureReason) || 0) + 1);
          
          // Collect failed vehicle details
          {
            this.failedVehicles.push({
              make: unit.make || '-',
              model: unit.model || '-', 
              year: unit.year || 0,
              reason: failureReason
            });
          }
          
          this.vehicleMatchingStats.noMatches++;
        }
      }
      
      if (matchedCount > 0) {
        this.vehicleMatchingStats.averageConfidence = totalConfidence / matchedCount;
      }
      
      const duration = Date.now() - startTime;
      console.log(`   ✅ Vehicle matching completed in ${duration}ms`);
      console.log(`   📊 Results: ${this.vehicleMatchingStats.exactMatches} exact, ${this.vehicleMatchingStats.fuzzyMatches} fuzzy, ${this.vehicleMatchingStats.noMatches} no match`);
    } catch (error) {
      console.warn('⚠️  Batch vehicle matching failed:', error);
    }
  }

  /**
   * Report vehicle matching statistics
   */
  private reportVehicleMatchingStatistics(): void {
    if (this.vehicleMatchingStats.total === 0) {
      return; // No matching performed
    }

    console.log(`\n🎯 AutoCare Vehicle Matching Statistics:`);
    console.log(`   🚗 Vehicles: ${this.vehicleMatchingStats.total} processed, ${((this.vehicleMatchingStats.total - this.vehicleMatchingStats.noMatches) / this.vehicleMatchingStats.total * 100).toFixed(1)}% matched`);
    console.log(`      📊 ${this.vehicleMatchingStats.exactMatches} exact, ${this.vehicleMatchingStats.fuzzyMatches} fuzzy, ${this.vehicleMatchingStats.noMatches} no match`);
    if (this.vehicleMatchingStats.averageConfidence > 0) {
      console.log(`      🎯 Average confidence: ${(this.vehicleMatchingStats.averageConfidence * 100).toFixed(1)}%`);
    }
  }

  /**
   * Report VIN decoding statistics
   */
  private reportVINDecodingStatistics(): void {
    const stats = this.vinDecoder.getStats();
    
    if (stats.totalAttempts === 0) {
      return; // No VIN decoding performed
    }

    console.log(`\n🔍 VIN Decoding Statistics:`);
    console.log(`   📋 Total attempts: ${stats.totalAttempts}`);
    console.log(`   ✅ Successful decodes: ${stats.successfulDecodes} (${(stats.successfulDecodes / stats.totalAttempts * 100).toFixed(1)}%)`);
    console.log(`   ❌ Failed decodes: ${stats.failedDecodes} (${(stats.failedDecodes / stats.totalAttempts * 100).toFixed(1)}%)`);
    console.log(`   💾 Cache hits: ${stats.cacheHits} (${(stats.cacheHits / stats.totalAttempts * 100).toFixed(1)}%)`);
    console.log(`   🌐 API calls: ${stats.apiCalls}`);
    console.log(`   📊 Cache size: ${this.vinDecoder.getCacheSize()} VINs`);
  }

  /**
   * Save vehicle matching statistics to a separate knowledge file
   */
  private async saveVehicleMatchingStatistics(entityId: number): Promise<void> {
    if (this.vehicleMatchingStats.total === 0) {
      return; // No matching performed
    }

    try {
      // Create vehicle matching statistics data
      const vehicleKnowledge = {
        entityId,
        type: 'vehicle-matching-statistics',
        generatedAt: new Date().toISOString(),
        description: 'AutoCare vehicle matching statistics for this entity',
        vehicleMatching: {
          totalVehicles: this.vehicleMatchingStats.total,
          matchedVehicles: this.vehicleMatchingStats.total - this.vehicleMatchingStats.noMatches,
          exactMatches: this.vehicleMatchingStats.exactMatches,
          fuzzyMatches: this.vehicleMatchingStats.fuzzyMatches,
          noMatches: this.vehicleMatchingStats.noMatches,
          matchRate: this.vehicleMatchingStats.total > 0
            ? Number(((this.vehicleMatchingStats.total - this.vehicleMatchingStats.noMatches) / this.vehicleMatchingStats.total * 100).toFixed(1))
            : 0,
          averageConfidence: Number((this.vehicleMatchingStats.averageConfidence * 100).toFixed(1))
        },
        failureStatistics: {
          totalFailures: this.vehicleMatchingStats.noMatches,
          failuresByReason: Array.from(this.failureReasonStats.entries())
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count),
          commonFailures: this.failedVehicles.map(vehicle => ({
            vehicleInfo: `${vehicle.make} ${vehicle.model} ${vehicle.year}`,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            reason: vehicle.reason
          })),
          failureAnalytics: {
            uniqueFailureCount: this.failedVehicles.length,
            topFailurePatterns: this.generateFailurePatterns(),
            yearDistribution: this.generateYearDistribution(),
            vinFailureStats: this.generateVinFailureStats()
          },
          sessionStats: {
            totalAttempts: this.vehicleMatchingStats.total,
            successfulMatches: this.vehicleMatchingStats.total - this.vehicleMatchingStats.noMatches,
            averageConfidence: Number((this.vehicleMatchingStats.averageConfidence * 100).toFixed(1))
          }
        },
        summary: {
          processedUnits: this.vehicleMatchingStats.total,
          successRate: this.vehicleMatchingStats.total > 0
            ? Number(((this.vehicleMatchingStats.total - this.vehicleMatchingStats.noMatches) / this.vehicleMatchingStats.total * 100).toFixed(1))
            : 0
        }
      };

      // Save to a separate vehicle knowledge file
      const knowledgeFilePath = `${entityId}/autocare-vehicle-knowledge.json`;
      await this.outputManager.writeJson(knowledgeFilePath, vehicleKnowledge);

      console.log(`💾 Vehicle matching statistics saved to ${knowledgeFilePath}`);
      console.log(`   📊 ${vehicleKnowledge.vehicleMatching.matchedVehicles}/${vehicleKnowledge.vehicleMatching.totalVehicles} vehicles matched (${vehicleKnowledge.vehicleMatching.matchRate}%)`);

      // Immediately update entity.json with vehicle matching statistics
      try {
        const entityJsonPath = `${entityId}/entity.json`;
        if (await this.outputManager.fileExists(entityJsonPath)) {
          const entityData = JSON.parse(await this.outputManager.readFileContent(entityJsonPath));
          
          // Initialize autoCare section if it doesn't exist
          if (!entityData.autoCare) {
            entityData.autoCare = { lastUpdated: new Date().toISOString() };
          }
          
          // Update vehicle matching statistics with failure statistics
          entityData.autoCare.vehicleMatching = {
            ...vehicleKnowledge.vehicleMatching,
            failureStatistics: vehicleKnowledge.failureStatistics
          };
          entityData.autoCare.lastUpdated = new Date().toISOString();
          
          // Write updated entity.json immediately
          await this.outputManager.writeJson(entityJsonPath, entityData);
          console.log(`✅ Updated entity.json with vehicle matching statistics`);
        } else {
          console.log(`⚠️  Entity JSON file not found at ${entityJsonPath}, skipping vehicle stats update`);
        }
      } catch (error) {
        console.warn('⚠️  Failed to update entity.json with vehicle statistics:', error);
      }

    } catch (error) {
      console.warn('⚠️  Failed to save vehicle matching statistics:', error);
    }
  }

  /**
   * Generate failure patterns analysis
   */
  private generateFailurePatterns(): Array<{ pattern: string; count: number; percentage: number }> {
    const patterns = new Map<string, number>();
    
    this.failedVehicles.forEach(vehicle => {
      const pattern = `${vehicle.make || 'Unknown'} - ${vehicle.reason}`;
      patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
    });
    
    const total = this.failedVehicles.length;
    return Array.from(patterns.entries())
      .map(([pattern, count]) => ({
        pattern,
        count,
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Generate year distribution analysis
   */
  private generateYearDistribution(): Array<{ yearRange: string; count: number; percentage: number }> {
    const yearRanges = new Map<string, number>();
    
    this.failedVehicles.forEach(vehicle => {
      const year = vehicle.year || 0;
      let range: string;
      
      if (year === 0) {
        range = 'Unknown';
      } else if (year < 1990) {
        range = 'Before 1990';
      } else if (year < 2000) {
        range = '1990-1999';
      } else if (year < 2010) {
        range = '2000-2009';
      } else if (year < 2020) {
        range = '2010-2019';
      } else {
        range = '2020+';
      }
      
      yearRanges.set(range, (yearRanges.get(range) || 0) + 1);
    });
    
    const total = this.failedVehicles.length;
    return Array.from(yearRanges.entries())
      .map(([yearRange, count]) => ({
        yearRange,
        count,
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Generate VIN failure statistics
   */
  private generateVinFailureStats(): { 
    totalVinAttempts: number; 
    vinDecodeFailures: number; 
    vinFailureRate: number;
    commonVinIssues: Array<{ issue: string; count: number }>;
  } {
    const vinFailures = this.failedVehicles.filter(v => v.reason === 'VIN_DECODE_FAILED');
    const vinIssues = new Map<string, number>();
    
    // Analyze common VIN issues
    vinFailures.forEach(vehicle => {
      const make = vehicle.make || '';
      if (make.startsWith('VIN:')) {
        if (make.includes('00000')) {
          vinIssues.set('Zero/Invalid VIN', (vinIssues.get('Zero/Invalid VIN') || 0) + 1);
        } else if (make.length < 10) {
          vinIssues.set('Short VIN', (vinIssues.get('Short VIN') || 0) + 1);
        } else {
          vinIssues.set('VIN Decode Failed', (vinIssues.get('VIN Decode Failed') || 0) + 1);
        }
      }
    });
    
    return {
      totalVinAttempts: this.vehicleMatchingStats.total,
      vinDecodeFailures: vinFailures.length,
      vinFailureRate: this.vehicleMatchingStats.total > 0 
        ? Number((vinFailures.length / this.vehicleMatchingStats.total * 100).toFixed(1))
        : 0,
      commonVinIssues: Array.from(vinIssues.entries())
        .map(([issue, count]) => ({ issue, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    };
  }

  /**
   * Infer vehicle information from alternative sources when CustomerUnit lacks vehicle data
   */
  private async inferVehicleInformation(entityId: number, customerUnits: CustomerUnit[]): Promise<BatchShopVehicle[]> {
    const inferredVehicles: BatchShopVehicle[] = [];

    try {
      console.log('   🔍 Checking EntityUnitType table for vehicle categories...');
      
      // Get unique EntityUnitType IDs from customer units
      const unitTypeIds = [...new Set(customerUnits
        .filter(unit => unit.entityUnitTypeId)
        .map(unit => unit.entityUnitTypeId!))]
        .filter(id => id);

      if (unitTypeIds.length > 0) {
        const placeholders = unitTypeIds.map(() => '?').join(',');
        
        // Query EntityUnitType table for vehicle type information
        const unitTypes = await this.dataReader.query<any>(
          `SELECT entityUnitTypeId, description FROM EntityUnitType WHERE entityUnitTypeId IN (${placeholders})`,
          unitTypeIds
        );

        console.log(`   📊 Found ${unitTypes.length} unit types for ${unitTypeIds.length} unique type IDs`);

        // Try to extract vehicle information from unit type names/descriptions
        for (const unit of customerUnits) {
          if (unit.entityUnitTypeId) {
            const unitType = unitTypes.find(type => type.entityUnitTypeId === unit.entityUnitTypeId);
            if (unitType) {
              const vehicleInfo = this.parseVehicleFromUnitType(unitType);
              if (vehicleInfo.make || vehicleInfo.model || vehicleInfo.year) {
                console.log(`   🚗 Unit ${unit.customerUnitId}: Inferred vehicle from type "${unitType.name}" - Make: ${vehicleInfo.make || 'unknown'}, Model: ${vehicleInfo.model || 'unknown'}, Year: ${vehicleInfo.year || 'unknown'}`);
                
                inferredVehicles.push({
                  id: `${unit.customerUnitId}`,
                  make: vehicleInfo.make,
                  model: vehicleInfo.model,
                  year: vehicleInfo.year,
                  entityId: entityId
                });
                
                // Update the original unit with inferred data
                unit.make = vehicleInfo.make;
                unit.model = vehicleInfo.model;
                unit.year = vehicleInfo.year;
              }
            }
          }
        }
      }

      // If we still don't have much data, try to get it from repair orders
      if (inferredVehicles.length < customerUnits.length * 0.1) { // Less than 10% success rate
        console.log('   🔍 Checking RepairOrder table for vehicle information...');
        
        const unitIds = customerUnits.map(unit => unit.customerUnitId);
        const placeholders = unitIds.map(() => '?').join(',');
        
        // Query repair orders that might contain vehicle info
        const repairOrders = await this.dataReader.query<any>(
          `SELECT DISTINCT customerUnitId, vehicleMake, vehicleModel, vehicleYear 
           FROM RepairOrder 
           WHERE customerUnitId IN (${placeholders}) 
           AND (vehicleMake IS NOT NULL OR vehicleModel IS NOT NULL OR vehicleYear IS NOT NULL)
           LIMIT 1000`,
          unitIds
        );

        console.log(`   📊 Found ${repairOrders.length} repair orders with vehicle information`);

        for (const order of repairOrders) {
          const unit = customerUnits.find(u => u.customerUnitId === order.customerUnitId);
          if (unit && !inferredVehicles.find(v => v.id === `${unit.customerUnitId}`)) {
            const make = order.vehicleMake || undefined;
            const model = order.vehicleModel || undefined;
            const year = order.vehicleYear || undefined;
            
            if (make || model || year) {
              console.log(`   🚗 Unit ${unit.customerUnitId}: Inferred from repair order - Make: ${make || 'unknown'}, Model: ${model || 'unknown'}, Year: ${year || 'unknown'}`);
              
              inferredVehicles.push({
                id: `${unit.customerUnitId}`,
                make: make,
                model: model,
                year: year,
                entityId: entityId
              });
              
              // Update the original unit with inferred data
              unit.make = make;
              unit.model = model;
              unit.year = year;
            }
          }
        }
      }

    } catch (error) {
      console.error('❌ Error inferring vehicle information:', error);
    }

    return inferredVehicles;
  }

  /**
   * Parse vehicle information from EntityUnitType description
   */
  private parseVehicleFromUnitType(unitType: any): { make?: string; model?: string; year?: number } {
    const description = (unitType.description || '').toString().trim();
    const text = description.toLowerCase();

    const result: { make?: string; model?: string; year?: number } = {};

    // Common truck makes
    const makes = [
      'peterbilt', 'kenworth', 'freightliner', 'volvo', 'mack', 'international', 
      'western star', 'ford', 'chevrolet', 'gmc', 'ram', 'dodge', 'isuzu', 
      'hino', 'mitsubishi', 'fuso', 'sterling', 'navistar'
    ];

    // Try to find make
    for (const make of makes) {
      if (text.includes(make)) {
        result.make = make.charAt(0).toUpperCase() + make.slice(1);
        break;
      }
    }

    // Try to extract year (4-digit number between 1990 and current year + 2)
    const currentYear = new Date().getFullYear();
    const yearMatch = text.match(/\b(19[9]\d|20[0-4]\d)\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      if (year >= 1990 && year <= currentYear + 2) {
        result.year = year;
      }
    }

    // Common truck models (simplified)
    const models = [
      '379', '389', '367', '579', '9900', 'w900', 't800', 't880', 'vnl', 'vhd',
      'cascadia', 'columbia', 'coronado', 'granite', 'pinnacle', 'anthem',
      'f150', 'f250', 'f350', 'f450', 'f550', 'silverado', 'sierra'
    ];

    for (const model of models) {
      if (text.includes(model)) {
        result.model = model.toUpperCase();
        break;
      }
    }

    return result;
  }

  /**
   * Enrich CustomerUnit data with VIN information from EAV table
   */
  private async enrichCustomerUnitsWithVIN(entityId: number, customerUnits: CustomerUnit[]): Promise<void> {
    if (customerUnits.length === 0) {
      console.log(`   No customer units to enrich with VIN data`);
      return;
    }

    try {
      // 🔍 Check cache first for VIN field IDs
      let vinFieldIds: number[] = [];
      
      if (this.vinFieldCache.has(entityId)) {
        vinFieldIds = this.vinFieldCache.get(entityId)!;
        console.log(`   💾 Using cached VIN field IDs for entity ${entityId}: [${vinFieldIds.join(', ')}]`);
      } else {
        // 🔍 Dynamic VIN field discovery - query EntityComponentField table
        console.log(`   🔍 Discovering VIN fields for entity ${entityId}...`);
        
        const vinFields = await this.dataReader.query<{ entityComponentFieldId: number; title: string }>(`
          SELECT DISTINCT ecf.entityComponentFieldId, ecf.title
          FROM EntityComponentField ecf
          JOIN EntityComponent ec ON ec.entityComponentId = ecf.entityComponentId
          WHERE ec.entityId = ?
            AND (
              ecf.title = 'VIN' 
              OR ecf.title = 'Vin'
              OR ecf.title = 'Vehicle Identification Number'
              OR ecf.title = 'Vehicle Identification'
              OR ecf.title REGEXP '^VIN[[:space:]]*(#|Number|$)'
            )
        `, [entityId]);

        if (vinFields.length > 0) {
          vinFieldIds = vinFields.map(f => f.entityComponentFieldId);
          console.log(`   ✅ Found ${vinFields.length} VIN field(s) for entity ${entityId}:`,
            vinFields.map(f => `ID ${f.entityComponentFieldId} (${f.title})`).join(', '));
        } else {
          // Fallback to known hardcoded VIN field IDs for tested entities
          const KNOWN_VIN_FIELD_IDS: { [entityId: number]: number } = {
            1866: 99935,  // Entity 1866 (Goolsbee Tire)
            8583: 394140  // Entity 8583
          };

          const fallbackFieldId = KNOWN_VIN_FIELD_IDS[entityId];
          if (fallbackFieldId) {
            vinFieldIds = [fallbackFieldId];
            console.log(`   📋 Using fallback VIN field ID ${fallbackFieldId} for entity ${entityId}`);
          } else {
            console.log(`   ⚠️  No VIN fields found for entity ${entityId}, skipping VIN enrichment`);
            // Cache empty result to avoid repeated queries
            this.vinFieldCache.set(entityId, []);
            return;
          }
        }
        
        // Cache the discovered field IDs for future use
        this.vinFieldCache.set(entityId, vinFieldIds);
      }

      if (vinFieldIds.length === 0) {
        console.log(`   ⚠️  No VIN fields available for entity ${entityId}, skipping VIN enrichment`);
        return;
      }

      // Get all customer unit IDs for batch query
      const customerUnitIds = customerUnits.map(unit => unit.customerUnitId);
      const BATCH_SIZE = 1000;
      const allVinData: Array<{ customerUnitId: number; value: string }> = [];

      // Process in batches to avoid huge IN clauses
      for (let i = 0; i < customerUnitIds.length; i += BATCH_SIZE) {
        const batchCustomerUnitIds = customerUnitIds.slice(i, i + BATCH_SIZE);
        const unitPlaceholders = batchCustomerUnitIds.map(() => '?').join(',');
        const fieldPlaceholders = vinFieldIds.map(() => '?').join(',');

        const batchVinData = await this.dataReader.query<{ customerUnitId: number; value: string }>(
          `SELECT customerUnitId, value 
           FROM CustomerUnitEntityComponentFieldOpen 
           WHERE customerUnitId IN (${unitPlaceholders}) 
           AND entityComponentFieldId IN (${fieldPlaceholders})
           AND value IS NOT NULL 
           AND value != ''`,
          [...batchCustomerUnitIds, ...vinFieldIds]
        );

        allVinData.push(...batchVinData);
      }

      // Create a map for O(1) VIN lookup (use first VIN if multiple exist per unit)
      const vinByUnitId = new Map<number, string>();
      allVinData.forEach(row => {
        if (row.value && !vinByUnitId.has(row.customerUnitId)) {
          vinByUnitId.set(row.customerUnitId, row.value);
        }
      });

      // Enrich customer units with VIN data
      let enrichedCount = 0;
      let validVinCount = 0;
      customerUnits.forEach(unit => {
        const vin = vinByUnitId.get(unit.customerUnitId);
        if (vin) {
          unit.vin = vin;
          enrichedCount++;
          // Count valid VINs (17 characters)
          if (vin.length === 17) {
            validVinCount++;
          }
        }
      });

      const enrichmentRate = ((enrichedCount / customerUnits.length) * 100).toFixed(1);
      const validVinRate = enrichedCount > 0 ? ((validVinCount / enrichedCount) * 100).toFixed(1) : '0';
      
      console.log(`   ✅ Enriched ${enrichedCount}/${customerUnits.length} customer units with VIN data (${enrichmentRate}%)`);
      if (enrichedCount > 0) {
        console.log(`      📋 ${validVinCount} valid VINs (17 chars), ${enrichedCount - validVinCount} other formats (${validVinRate}% valid)`);
      }

    } catch (error) {
      console.warn('⚠️  Failed to load VIN data:', error);
      console.log('   Continuing without VIN enrichment...');
    }
  }

  /**
   * Enrich CustomerUnit data with vehicle information from NHTSA VIN decode API
   * Only processes units that have VINs but are missing make/model/year data
   */
  private async enrichCustomerUnitsWithVINDecoding(customerUnits: CustomerUnit[]): Promise<void> {
    if (customerUnits.length === 0) {
      console.log(`   No customer units to enrich with VIN decoding`);
      return;
    }

    console.log(`   🔍 Processing VIN decoding for customer units...`);

    try {
      // Optional: allow disabling VIN decode via env
      if (process.env.DISABLE_VIN_DECODE === 'true') {
        console.log('   ⏭️  VIN decoding disabled by DISABLE_VIN_DECODE');
        return;
      }

      // Quick local year fill to reduce API calls
      let localYearFilled = 0;
      for (const unit of customerUnits) {
        if (unit.vin && unit.vin.length === 17 && (!unit.year || unit.year === 0) && unit.make && unit.model) {
          const y = VINDecoder.decodeYearFromVIN(unit.vin);
          if (y) { unit.year = y; localYearFilled++; }
        }
      }
      if (localYearFilled > 0) {
        console.log(`   🗓️  Filled year locally from VIN for ${localYearFilled} units`);
      }

      // Find units that still need VIN decoding (missing either make/model or year)
      const unitsNeedingDecoding = customerUnits.filter(unit => {
        return unit.vin && 
               unit.vin.length === 17 && // Valid VIN length
               (!unit.make || !unit.model || !unit.year || unit.year === 0);
      });

      if (unitsNeedingDecoding.length === 0) {
        console.log(`   ✅ No customer units need VIN decoding (all units either have no VIN or already have make/model/year data)`);
        return;
      }

      console.log(`   📋 Found ${unitsNeedingDecoding.length} units needing VIN decoding out of ${customerUnits.length} total units`);

      // Extract VINs for batch processing
      const vinsToProcess = unitsNeedingDecoding.map(unit => unit.vin!);
      
      // Process VINs using batch API with concurrency & cache
      const vinResults = await this.vinDecoder.decodeBatchWithAPI(vinsToProcess);

      // Apply results to customer units
      let successCount = 0;
      let partialCount = 0;
      let failureCount = 0;

      for (const unit of unitsNeedingDecoding) {
        const vin = unit.vin!;
        const result = vinResults.get(vin);
        
        if (!result) {
          failureCount++;
          continue;
        }

        if (result.success && result.make && result.model && result.year) {
          // Full success - populate all missing fields
          if (!unit.make) unit.make = result.make;
          if (!unit.model) unit.model = result.model;
          if (!unit.year || unit.year === 0) unit.year = result.year;
          
          // Add additional fields to customFields if not already present
          if (!unit.customFields) unit.customFields = {};
          
          if (result.bodyClass && !unit.customFields['Body Class']) {
            unit.customFields['Body Class'] = result.bodyClass;
          }
          if (result.engineModel && !unit.customFields['Engine Model']) {
            unit.customFields['Engine Model'] = result.engineModel;
          }
          if (result.fuelType && !unit.customFields['Fuel Type']) {
            unit.customFields['Fuel Type'] = result.fuelType;
          }
          if (result.manufacturerName && !unit.customFields['Manufacturer Name']) {
            unit.customFields['Manufacturer Name'] = result.manufacturerName;
          }

          successCount++;
        } else if (result.make || result.model || result.year) {
          // Partial success - populate what we can
          if (result.make && !unit.make) unit.make = result.make;
          if (result.model && !unit.model) unit.model = result.model;
          if (result.year && (!unit.year || unit.year === 0)) unit.year = result.year;
          
          partialCount++;
        } else {
          // Failed to get useful data
          failureCount++;
        }

        // Store error information if decode failed
        if (!result.success && result.errorMessage) {
          if (!unit.customFields) unit.customFields = {};
          unit.customFields['VIN Decode Error'] = result.errorMessage;
        }
      }

      const successRate = ((successCount / unitsNeedingDecoding.length) * 100).toFixed(1);
      console.log(`   ✅ VIN decoding results: ${successCount} success, ${partialCount} partial, ${failureCount} failed`);
      console.log(`      📊 Success rate: ${successRate}% (${successCount + partialCount}/${unitsNeedingDecoding.length} units got some data)`);

      // Log VIN decoder statistics
      // Persist VIN cache to disk
      this.vinDecoder.persistCacheSafely();
      const stats = this.vinDecoder.getStats();
      if (stats.totalAttempts > 0) {
        console.log(`      📈 VIN decoder stats: ${stats.successfulDecodes}/${stats.totalAttempts} successful (${stats.cacheHits} cache hits, ${stats.apiCalls} API calls)`);
      }

    } catch (error) {
      console.warn('⚠️  Failed to process VIN decoding:', error);
      console.log('   Continuing without VIN decoding...');
    }
  }

  /**
   * Enrich CustomerUnit data with make/model/year from CustomerUnitEntityComponentEntry table
   */
  private async enrichCustomerUnitsWithComponentData(entityId: number, customerUnits: CustomerUnit[]): Promise<void> {
    if (customerUnits.length === 0) {
      console.log(`   No customer units to enrich with component data`);
      return;
    }

    try {
      console.log(`   🔧 Loading make/model/year from CustomerUnitEntityComponentEntry table...`);

      // Get all customer unit IDs for batch query
      const customerUnitIds = customerUnits.map(unit => unit.customerUnitId);
      const BATCH_SIZE = 1000;
      const allComponentData: CustomerUnitEntityComponentEntry[] = [];

      // Process in batches to avoid huge IN clauses
      for (let i = 0; i < customerUnitIds.length; i += BATCH_SIZE) {
        const batchCustomerUnitIds = customerUnitIds.slice(i, i + BATCH_SIZE);
        const placeholders = batchCustomerUnitIds.map(() => '?').join(',');

        const batchComponentData = await this.dataReader.query<CustomerUnitEntityComponentEntry>(
          `SELECT * FROM CustomerUnitEntityComponentEntry WHERE customerUnitId IN (${placeholders})`,
          batchCustomerUnitIds
        );

        allComponentData.push(...batchComponentData);
      }

      // Create a map for O(1) component data lookup
      const componentByUnitId = new Map<number, CustomerUnitEntityComponentEntry>();
      allComponentData.forEach(entry => {
        // Use the first entry if multiple exist (should be rare)
        if (!componentByUnitId.has(entry.customerUnitId)) {
          componentByUnitId.set(entry.customerUnitId, entry);
        }
      });

      // Enrich customer units with component data
      let enrichedCount = 0;
      customerUnits.forEach(unit => {
        const componentData = componentByUnitId.get(unit.customerUnitId);
        if (componentData) {
          // Merge component data with unit data, prioritizing existing values
          unit.make = unit.make || componentData.make;
          unit.model = unit.model || componentData.model;
          unit.year = unit.year || componentData.year;
          
          enrichedCount++;
        }
      });

      const enrichmentRate = ((enrichedCount / customerUnits.length) * 100).toFixed(1);
      console.log(`   ✅ Enriched ${enrichedCount}/${customerUnits.length} customer units with component data (${enrichmentRate}%)`);

    } catch (error) {
      console.warn('⚠️  Failed to load component data:', error);
      console.log('   Continuing without component data enrichment...');
    }
  }

  /**
   * Enrich CustomerUnit data with ALL EAV fields as customFields
   */
  private async enrichCustomerUnitsWithAllEAVData(entityId: number, customerUnits: CustomerUnit[]): Promise<void> {
    if (customerUnits.length === 0) {
      console.log(`   No customer units to enrich with EAV data`);
      return;
    }

    try {
      console.log(`   📋 Loading all EAV custom fields...`);

      // Get all customer unit IDs for batch query
      const customerUnitIds = customerUnits.map(unit => unit.customerUnitId);
      const BATCH_SIZE = 1000;
      const allEAVData: Array<{ customerUnitId: number; field_name: string; field_value: string }> = [];

      // Process in batches to avoid huge IN clauses
      for (let i = 0; i < customerUnitIds.length; i += BATCH_SIZE) {
        const batchCustomerUnitIds = customerUnitIds.slice(i, i + BATCH_SIZE);
        const placeholders = batchCustomerUnitIds.map(() => '?').join(',');

        const batchEAVData = await this.dataReader.query<{ customerUnitId: number; field_name: string; field_value: string }>(
          `SELECT 
             cuecfo.customerUnitId,
             ecf.title as field_name,
             cuecfo.value as field_value
           FROM CustomerUnitEntityComponentFieldOpen cuecfo
           JOIN EntityComponentField ecf ON ecf.entityComponentFieldId = cuecfo.entityComponentFieldId
           WHERE cuecfo.customerUnitId IN (${placeholders})
             AND cuecfo.value IS NOT NULL
             AND cuecfo.value != ''`,
          batchCustomerUnitIds
        );

        allEAVData.push(...batchEAVData);
      }

      // Group EAV data by customerUnitId
      const eavByUnitId = new Map<number, { [key: string]: string }>();
      allEAVData.forEach(row => {
        if (!eavByUnitId.has(row.customerUnitId)) {
          eavByUnitId.set(row.customerUnitId, {});
        }
        eavByUnitId.get(row.customerUnitId)![row.field_name] = row.field_value;
      });

      // Enrich customer units with EAV data
      let enrichedCount = 0;
      let totalFields = 0;
      customerUnits.forEach(unit => {
        const customFields = eavByUnitId.get(unit.customerUnitId);
        if (customFields && Object.keys(customFields).length > 0) {
          unit.customFields = customFields;
          enrichedCount++;
          totalFields += Object.keys(customFields).length;
        }
      });

      const enrichmentRate = ((enrichedCount / customerUnits.length) * 100).toFixed(1);
      const avgFieldsPerUnit = enrichedCount > 0 ? (totalFields / enrichedCount).toFixed(1) : '0';
      
      console.log(`   ✅ Enriched ${enrichedCount}/${customerUnits.length} customer units with EAV data (${enrichmentRate}%)`);
      console.log(`   📊 Total custom fields: ${totalFields} (avg ${avgFieldsPerUnit} fields per enriched unit)`);

    } catch (error) {
      console.warn('⚠️  Failed to load EAV data:', error);
      console.log('   Continuing without EAV data enrichment...');
    }
  }

  /**
   * Load EntityUnitType data for all customer units in an entity
   */
  async loadEntityUnitTypeData(entityId: number, customerUnits: CustomerUnit[]): Promise<Map<number, EntityUnitTypeData>> {
    console.log(`🏗️  Loading EntityUnitType data for entity ${entityId}...`);
    
    // 1. Collect all unique entityUnitTypeId and subEntityUnitTypeId values
    const entityUnitTypeIds = [...new Set([
      ...customerUnits
        .map(unit => unit.entityUnitTypeId)
        .filter(id => id != null),
      ...customerUnits
        .map(unit => unit.subEntityUnitTypeId)
        .filter(id => id != null)
    ])] as number[];

    if (entityUnitTypeIds.length === 0) {
      console.log(`   ℹ️  No EntityUnitType IDs found for entity ${entityId}`);
      return new Map();
    }

    console.log(`   🔍 Found ${entityUnitTypeIds.length} unique EntityUnitType IDs`);

    try {
      // 2. Batch load all EntityUnitType related data in parallel
      const [entityUnitTypes, components, systems, corrections] = await Promise.all([
        this.batchLoadEntityUnitTypes(entityUnitTypeIds),
        this.batchLoadEntityUnitTypeComponents(entityUnitTypeIds),
        this.batchLoadEntityUnitTypeSystems(entityUnitTypeIds),
        this.batchLoadEntityUnitTypeCorrections(entityUnitTypeIds)
      ]);

      console.log(`   ✅ Loaded EntityUnitType data:`);
      console.log(`      📋 ${entityUnitTypes.length} unit types`);
      console.log(`      🔧 ${components.length} component entries`);
      console.log(`      ⚙️  ${systems.length} system entries`);
      console.log(`      🔨 ${corrections.length} correction entries`);

      // 3. Build aggregated data map
      return this.buildEntityUnitTypeDataMap(entityUnitTypes, components, systems, corrections);

    } catch (error) {
      console.error(`❌ Failed to load EntityUnitType data for entity ${entityId}:`, error);
      return new Map();
    }
  }

  /**
   * Batch load EntityUnitType records
   */
  private async batchLoadEntityUnitTypes(entityUnitTypeIds: number[]): Promise<EntityUnitType[]> {
    if (entityUnitTypeIds.length === 0) return [];

    const BATCH_SIZE = 1000;
    const results: EntityUnitType[] = [];

    for (let i = 0; i < entityUnitTypeIds.length; i += BATCH_SIZE) {
      const batch = entityUnitTypeIds.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(',');
      
      const batchResults = await this.dataReader.query<EntityUnitType>(
        `SELECT * FROM EntityUnitType WHERE entityUnitTypeId IN (${placeholders})`,
        batch
      );
      
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Batch load EntityUnitTypeEntityComponentEntry records
   */
  private async batchLoadEntityUnitTypeComponents(entityUnitTypeIds: number[]): Promise<EntityUnitTypeEntityComponentEntry[]> {
    if (entityUnitTypeIds.length === 0) return [];

    const BATCH_SIZE = 1000;
    const results: EntityUnitTypeEntityComponentEntry[] = [];

    for (let i = 0; i < entityUnitTypeIds.length; i += BATCH_SIZE) {
      const batch = entityUnitTypeIds.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(',');
      
      const batchResults = await this.dataReader.query<EntityUnitTypeEntityComponentEntry>(
        `SELECT * FROM EntityUnitTypeEntityComponentEntry WHERE entityUnitTypeId IN (${placeholders})`,
        batch
      );
      
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Batch load EntityUnitTypeEntityComponentSystemEntry records
   */
  private async batchLoadEntityUnitTypeSystems(entityUnitTypeIds: number[]): Promise<EntityUnitTypeEntityComponentSystemEntry[]> {
    if (entityUnitTypeIds.length === 0) return [];

    const BATCH_SIZE = 1000;
    const results: EntityUnitTypeEntityComponentSystemEntry[] = [];

    for (let i = 0; i < entityUnitTypeIds.length; i += BATCH_SIZE) {
      const batch = entityUnitTypeIds.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(',');
      
      const batchResults = await this.dataReader.query<EntityUnitTypeEntityComponentSystemEntry>(
        `SELECT * FROM EntityUnitTypeEntityComponentSystemEntry WHERE entityUnitTypeId IN (${placeholders})`,
        batch
      );
      
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Batch load EntityUnitTypeEntityComponentSystemCorrectionEntry records
   */
  private async batchLoadEntityUnitTypeCorrections(entityUnitTypeIds: number[]): Promise<EntityUnitTypeEntityComponentSystemCorrectionEntry[]> {
    if (entityUnitTypeIds.length === 0) return [];

    const BATCH_SIZE = 1000;
    const results: EntityUnitTypeEntityComponentSystemCorrectionEntry[] = [];

    for (let i = 0; i < entityUnitTypeIds.length; i += BATCH_SIZE) {
      const batch = entityUnitTypeIds.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(',');
      
      const batchResults = await this.dataReader.query<EntityUnitTypeEntityComponentSystemCorrectionEntry>(
        `SELECT * FROM EntityUnitTypeEntityComponentSystemCorrectionEntry WHERE entityUnitTypeId IN (${placeholders})`,
        batch
      );
      
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Build EntityUnitTypeData map from loaded data
   */
  private buildEntityUnitTypeDataMap(
    entityUnitTypes: EntityUnitType[],
    components: EntityUnitTypeEntityComponentEntry[],
    systems: EntityUnitTypeEntityComponentSystemEntry[],
    corrections: EntityUnitTypeEntityComponentSystemCorrectionEntry[]
  ): Map<number, EntityUnitTypeData> {
    
    const dataMap = new Map<number, EntityUnitTypeData>();

    // Group related data by entityUnitTypeId
    const componentsByUnitType = new Map<number, EntityUnitTypeEntityComponentEntry[]>();
    const systemsByUnitType = new Map<number, EntityUnitTypeEntityComponentSystemEntry[]>();
    const correctionsByUnitType = new Map<number, EntityUnitTypeEntityComponentSystemCorrectionEntry[]>();

    components.forEach(comp => {
      if (!componentsByUnitType.has(comp.entityUnitTypeId)) {
        componentsByUnitType.set(comp.entityUnitTypeId, []);
      }
      componentsByUnitType.get(comp.entityUnitTypeId)!.push(comp);
    });

    systems.forEach(sys => {
      if (!systemsByUnitType.has(sys.entityUnitTypeId)) {
        systemsByUnitType.set(sys.entityUnitTypeId, []);
      }
      systemsByUnitType.get(sys.entityUnitTypeId)!.push(sys);
    });

    corrections.forEach(corr => {
      if (!correctionsByUnitType.has(corr.entityUnitTypeId)) {
        correctionsByUnitType.set(corr.entityUnitTypeId, []);
      }
      correctionsByUnitType.get(corr.entityUnitTypeId)!.push(corr);
    });

    // Build aggregated data
    entityUnitTypes.forEach(unitType => {
      const aggregatedData: EntityUnitTypeData = {
        entityUnitTypeId: unitType.entityUnitTypeId,
        parentEntityUnitTypeId: unitType.parentEntityUnitTypeId,
        entityId: unitType.entityId,
        title: unitType.title,
        entityTaxLocationId: unitType.entityTaxLocationId,
        preferredVehicleIdLabel: unitType.preferredVehicleIdLabel,
        disableVinValidation: unitType.disableVinValidation,
        excludeFromCarCount: unitType.excludeFromCarCount,
        isDefault: unitType.isDefault,
        components: componentsByUnitType.get(unitType.entityUnitTypeId) || [],
        componentSystems: systemsByUnitType.get(unitType.entityUnitTypeId) || [],
        componentSystemCorrections: correctionsByUnitType.get(unitType.entityUnitTypeId) || [],
        created: unitType.created,
        modified: unitType.modified
      };

      dataMap.set(unitType.entityUnitTypeId, aggregatedData);
    });

    return dataMap;
  }

  private formatVehicleAlternatives(
    alternatives?: StandardizedVehicle[],
    primary?: StandardizedVehicle
  ): StandardizedVehicle[] | undefined {
    if (!alternatives || alternatives.length === 0) {
      return undefined;
    }

    const serialize = (vehicle: StandardizedVehicle) =>
      `${vehicle.baseVehicleId}|${vehicle.vehicleId || ''}|${vehicle.subModelId || ''}`;

    const seen = new Set<string>();
    if (primary) {
      seen.add(serialize(primary));
    }

    const deduped: StandardizedVehicle[] = [];
    for (const alt of alternatives) {
      if (!alt) continue;
      const key = serialize(alt);
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
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.vehicleAggregator) {
      await this.vehicleAggregator.cleanup();
    }
    this.reportVehicleMatchingStatistics();
    this.reportVINDecodingStatistics();
    
    // Clear VIN field cache
    this.vinFieldCache.clear();
    
    // Clear EntityUnitType caches
    this.entityUnitTypesCache.clear();
    this.entityUnitTypeComponentsCache.clear();
    this.entityUnitTypeSystemsCache.clear();
    this.entityUnitTypeCorrectionsCache.clear();
  }
}
