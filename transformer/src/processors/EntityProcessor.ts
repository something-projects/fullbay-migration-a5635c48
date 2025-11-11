import { DataReader } from '../utils/DataSource';
import { OutputManager } from '../utils/OutputManager';
import { DataQualityTracker } from '../utils/DataQualityTracker';
import { shouldSkipEntity, getSkipReason, getSkippedEntityIds } from '../config/skipEntities';
import { EntityTableClassifier } from '../utils/EntityTableClassifier';
import { CustomerProcessor } from './CustomerProcessor';
import { ServiceOrderProcessor } from './ServiceOrderProcessor';
import { getS3Sync } from '../utils/S3Sync';
import * as fs from 'fs';
import * as path from 'path';
import { 
  Entity, 
  EntityLocation, 
  Address, 
  EntityEmployee,
  EntityHistory,
  EntityInformation,
  EntityRole,
  EntityNote,
  EntityFee,
  EntityAddress,
  EntityComponent,
  EntityDepartment,
  EntityPart,
  EntityInvoice,
  EnhancedEntity,
  DenormalizedCompany,
  DenormalizedLocation,
  DenormalizedEmployee,
  // New category data types
  CoreBusinessData,
  EmployeeManagementData,
  LocationManagementData,
  PartsInventoryData,
  FinancialBillingData,
  ServiceComponentData,
  ConfigurationSettingsData,
  AllEntityCategoriesData,
  // New entity table types (importing key ones we'll use)
  EntityManufacturer
} from '../types/DatabaseTypes';

export class EntityProcessor {
  private dataReader: DataReader;
  private outputManager: OutputManager;
  private qualityTracker: DataQualityTracker;
  private customerProcessor?: CustomerProcessor;
  private serviceOrderProcessor?: ServiceOrderProcessor;
  private simpleShopEntities: Set<number> = new Set(); // Cache for Simple Shop entities
  
  // 🚀 PERFORMANCE OPTIMIZATION: Caches for all Entity second-level tables
  private employeesCache: Map<number, EntityEmployee[]> = new Map();
  private locationsCache: Map<number, EntityLocation[]> = new Map();
  private historyCache: Map<number, EntityHistory[]> = new Map();
  private informationCache: Map<number, EntityInformation[]> = new Map();
  private rolesCache: Map<number, EntityRole[]> = new Map();
  private notesCache: Map<number, EntityNote[]> = new Map();
  private feesCache: Map<number, EntityFee[]> = new Map();
  private addressesCache: Map<number, EntityAddress[]> = new Map();
  private componentsCache: Map<number, EntityComponent[]> = new Map();
  private departmentsCache: Map<number, EntityDepartment[]> = new Map();
  private partsCache: Map<number, EntityPart[]> = new Map();
  private invoicesCache: Map<number, EntityInvoice[]> = new Map();

  constructor(
    dataReader: DataReader, 
    outputManager: OutputManager, 
    qualityTracker?: DataQualityTracker,
    customerProcessor?: CustomerProcessor,
    serviceOrderProcessor?: ServiceOrderProcessor
  ) {
    this.dataReader = dataReader;
    this.outputManager = outputManager;
    this.qualityTracker = qualityTracker || new DataQualityTracker();
    this.customerProcessor = customerProcessor;
    this.serviceOrderProcessor = serviceOrderProcessor;
  }

  /**
   * Load Simple Shop entities using SQL query and conditionally preload their employees/locations
   */
  private async loadSimpleShopEntities(processingMode: 'demo' | 'full' = 'demo', targetEntityId?: number): Promise<void> {
    try {
      console.log('📊 Identifying Simple Shop entities using SQL criteria...');
      
      // In Entity-Specific mode, we still need to identify Simple Shops for proper processing
      // but the final processing decision is made in index.ts
      const simpleShopEntities = await this.dataReader.query(`
        SELECT DISTINCT e.entityId, 
               COUNT(DISTINCT el.entityLocationId) as location_count, 
               COUNT(DISTINCT ee.entityEmployeeId) as employee_count
        FROM Entity e
        LEFT JOIN EntityLocation el ON e.entityId = el.entityId AND el.active = 1
        LEFT JOIN EntityEmployee ee ON e.entityId = ee.entityId AND ee.active = 1
        WHERE e.status NOT IN ('Cancelled', 'On Hold')
        GROUP BY e.entityId
        HAVING COUNT(DISTINCT el.entityLocationId) <= 2 
           AND COUNT(DISTINCT ee.entityEmployeeId) < 5
      `);

      for (const entity of simpleShopEntities) {
        this.simpleShopEntities.add(entity.entityId);
      }
      
      console.log(`📊 Identified ${this.simpleShopEntities.size} Simple Shop entities using SQL criteria`);
      
      if (targetEntityId) {
        const isTargetSimpleShop = this.simpleShopEntities.has(targetEntityId);
        console.log(`🎯 Target entity ${targetEntityId} ${isTargetSimpleShop ? 'IS' : 'IS NOT'} a Simple Shop`);
      }
      
      // 🚀 PERFORMANCE OPTIMIZATION: Always preload Simple Shop data to avoid N+1 queries
      console.log(`🚀 ${processingMode} mode: Preloading Simple Shop data to optimize performance`);
      await this.preloadSimpleShopData();
      
      // Share Simple Shop entities with OutputManager for advanced processing
      this.outputManager.setSimpleShopEntities(this.simpleShopEntities);
    } catch (error) {
      console.error('❌ Error identifying Simple Shop entities:', error);
      console.log('⚠️  Continuing without Simple Shop detection');
    }
  }

  /**
   * Bulk preload all Entity second-level table data for all entities (Full mode optimization)
   */
  private async preloadAllEntitySecondLevelData(entityIds: number[]): Promise<void> {
    if (entityIds.length === 0) return;

    console.log(`🚀 Bulk loading all Entity second-level table data for ${entityIds.length} entities...`);
    const placeholders = entityIds.map(() => '?').join(',');

    try {
      // Bulk load all 12 second-level Entity tables in parallel
      const [
        allHistory,
        allInformation,
        allRoles,
        allNotes,
        allFees,
        allAddresses,
        allComponents,
        allDepartments,
        allParts,
        allEmployees,
        allLocations,
        allInvoices
      ] = await Promise.all([
        this.dataReader.query<EntityHistory>(`SELECT * FROM EntityHistory WHERE entityId IN (${placeholders})`, entityIds),
        this.dataReader.query<EntityInformation>(`SELECT * FROM EntityInformation WHERE entityId IN (${placeholders})`, entityIds),
        this.dataReader.query<EntityRole>(`SELECT * FROM EntityRole WHERE entityId IN (${placeholders})`, entityIds),
        this.dataReader.query<EntityNote>(`SELECT * FROM EntityNote WHERE entityId IN (${placeholders})`, entityIds),
        this.dataReader.query<EntityFee>(`SELECT * FROM EntityFee WHERE entityId IN (${placeholders})`, entityIds),
        this.dataReader.query<EntityAddress>(`SELECT * FROM EntityAddress WHERE entityId IN (${placeholders})`, entityIds),
        this.dataReader.query<EntityComponent>(`SELECT * FROM EntityComponent WHERE entityId IN (${placeholders})`, entityIds),
        this.dataReader.query<EntityDepartment>(`SELECT * FROM EntityDepartment WHERE entityId IN (${placeholders})`, entityIds),
        this.dataReader.query<EntityPart>(`SELECT * FROM EntityPart WHERE entityId IN (${placeholders})`, entityIds),
        this.dataReader.query<EntityEmployee>(`SELECT * FROM EntityEmployee WHERE entityId IN (${placeholders})`, entityIds),
        this.dataReader.query<EntityLocation>(`SELECT * FROM EntityLocation WHERE entityId IN (${placeholders})`, entityIds),
        this.dataReader.query<EntityInvoice>(`SELECT * FROM EntityInvoice WHERE entityId IN (${placeholders})`, entityIds)
      ]);

      // Group all data by entityId and cache
      this.groupAndCacheData(allHistory, this.historyCache);
      this.groupAndCacheData(allInformation, this.informationCache);
      this.groupAndCacheData(allRoles, this.rolesCache);
      this.groupAndCacheData(allNotes, this.notesCache);
      this.groupAndCacheData(allFees, this.feesCache);
      this.groupAndCacheData(allAddresses, this.addressesCache);
      this.groupAndCacheData(allComponents, this.componentsCache);
      this.groupAndCacheData(allDepartments, this.departmentsCache);
      this.groupAndCacheData(allParts, this.partsCache);
      this.groupAndCacheData(allEmployees, this.employeesCache);
      this.groupAndCacheData(allLocations, this.locationsCache);
      this.groupAndCacheData(allInvoices, this.invoicesCache);

      console.log(`✅ Bulk loaded second-level data: ${allHistory.length} history, ${allInformation.length} information, ${allRoles.length} roles, ${allNotes.length} notes, ${allFees.length} fees, ${allAddresses.length} addresses, ${allComponents.length} components, ${allDepartments.length} departments, ${allParts.length} parts, ${allEmployees.length} employees, ${allLocations.length} locations, ${allInvoices.length} invoices`);
      console.log(`📦 Cached data for ${entityIds.length} entities`);

    } catch (error) {
      console.error('❌ Error bulk loading Entity second-level data:', error);
      console.log('⚠️  Will fall back to individual queries as needed');
    }
  }

  /**
   * Helper method to group array data by entityId and cache it
   */
  private groupAndCacheData<T extends { entityId: number }>(
    data: T[], 
    cache: Map<number, T[]>
  ): void {
    // Group by entityId
    const dataByEntity = new Map<number, T[]>();
    for (const item of data) {
      if (!dataByEntity.has(item.entityId)) {
        dataByEntity.set(item.entityId, []);
      }
      dataByEntity.get(item.entityId)!.push(item);
    }

    // Cache all grouped data (including empty arrays for entities with no data)
    for (const [entityId, items] of dataByEntity) {
      cache.set(entityId, items);
    }
  }

  /**
   * Preload employees and locations for all Simple Shop entities in bulk
   */
  private async preloadSimpleShopData(): Promise<void> {
    if (this.simpleShopEntities.size === 0) return;

    console.log(`🚀 Bulk loading employees and locations for ${this.simpleShopEntities.size} Simple Shop entities...`);
    
    const entityIds = Array.from(this.simpleShopEntities);
    const placeholders = entityIds.map(() => '?').join(',');

    try {
      // Bulk load all employees for Simple Shop entities
      const allEmployees = await this.dataReader.query<EntityEmployee>(
        `SELECT * FROM EntityEmployee WHERE entityId IN (${placeholders})`,
        entityIds
      );

      // Bulk load all locations for Simple Shop entities  
      const allLocations = await this.dataReader.query<EntityLocation>(
        `SELECT * FROM EntityLocation WHERE entityId IN (${placeholders})`,
        entityIds
      );

      // Cache employees by entityId
      const employeesByEntity = new Map<number, EntityEmployee[]>();
      for (const employee of allEmployees) {
        if (!employeesByEntity.has(employee.entityId)) {
          employeesByEntity.set(employee.entityId, []);
        }
        employeesByEntity.get(employee.entityId)!.push(employee);
      }

      // Cache locations by entityId
      const locationsByEntity = new Map<number, EntityLocation[]>();
      for (const location of allLocations) {
        if (!locationsByEntity.has(location.entityId)) {
          locationsByEntity.set(location.entityId, []);
        }
        locationsByEntity.get(location.entityId)!.push(location);
      }

      // Store in cache for each Simple Shop entity
      for (const entityId of this.simpleShopEntities) {
        this.employeesCache.set(entityId, employeesByEntity.get(entityId) || []);
        this.locationsCache.set(entityId, locationsByEntity.get(entityId) || []);
      }

      console.log(`✅ Bulk loaded ${allEmployees.length} employees and ${allLocations.length} locations for Simple Shop entities`);
      console.log(`📦 Cached data for ${this.simpleShopEntities.size} Simple Shop entities`);

    } catch (error) {
      console.error('❌ Error bulk loading Simple Shop data:', error);
      console.log('⚠️  Will fall back to individual queries as needed');
    }
  }

  /**
   * Process all entities (companies) and create denormalized company data
   */
  async processEntities(processingMode: 'demo' | 'full' = 'demo', targetEntityId?: number): Promise<{ [entityId: number]: DenormalizedCompany }> {
    console.log(`Processing entities in ${processingMode} mode...`);
    
    // Load Simple Shop entities first (preload data only in demo mode)
    await this.loadSimpleShopEntities(processingMode, targetEntityId);
    
    return this.processAllEntities(processingMode, targetEntityId);
  }

  /**
   * Process a specific entity by ID
   */
  async processSpecificEntity(entityId: number): Promise<{ [entityId: number]: DenormalizedCompany }> {
    console.log(`Processing specific entity: ${entityId}`);

    // 🏪 Load Simple Shop entities for single entity processing
    await this.loadSimpleShopEntities('demo', entityId);

    // Load only the specific entity
    console.log('🔄 Loading specific entity...');
    const entities = await this.dataReader.query<Entity>(
      'SELECT * FROM Entity WHERE entityId = ?', 
      [entityId]
    );
    
    if (entities.length === 0) {
      console.log(`❌ Entity ${entityId} not found`);
      return {};
    }
    
    const entity = entities[0];
    console.log(`📋 Found entity: ${entity.legalName || entity.title || 'Unnamed Entity'}`);

    // Load related data for this specific entity
    console.log('🔄 Loading entity locations...');
    const entityLocations = await this.dataReader.query<EntityLocation>(
      'SELECT * FROM EntityLocation WHERE entityId = ?', 
      [entityId]
    );

    console.log('🔄 Loading entity employees...');
    const entityEmployees = await this.dataReader.query<EntityEmployee>(
      'SELECT * FROM EntityEmployee WHERE entityId = ?', 
      [entityId]
    );

    // Load addresses - need to get all address IDs referenced by this entity
    const addressIds = new Set<number>();
    
    // Add entity addresses
    if (entity.primaryEntityAddressId) addressIds.add(entity.primaryEntityAddressId);
    if (entity.billingEntityAddressId) addressIds.add(entity.billingEntityAddressId);
    
    // Add location addresses
    entityLocations.forEach((loc: EntityLocation) => {
      if (loc.mailingEntityAddressId) addressIds.add(loc.mailingEntityAddressId);
      if (loc.physicalEntityAddressId) addressIds.add(loc.physicalEntityAddressId);
    });

    console.log(`🔄 Loading ${addressIds.size} addresses...`);
    const addresses: Address[] = [];
    if (addressIds.size > 0) {
      const addressIdList = Array.from(addressIds);
      const placeholders = addressIdList.map(() => '?').join(',');
      const addressResults = await this.dataReader.query<Address>(
        `SELECT * FROM Address WHERE addressId IN (${placeholders})`,
        addressIdList
      );
      addresses.push(...addressResults);
    }

    const denormalizedEntities: { [entityId: number]: DenormalizedCompany } = {};
    
    // Initialize statistics
    this.qualityTracker.incrementTotal('Entity', 1);

    // Validate entity data integrity
    if (!this.qualityTracker.validateEntity('Entity', entity)) {
      console.log(`⚠️  Skipping Entity ${entity.entityId || 'unknown'} due to missing required fields`);
      this.qualityTracker.incrementSkipped('Entity');
      return {};
    }

    // Get locations for this entity
    const locations = entityLocations
      .map((loc: EntityLocation) => this.denormalizeLocation(loc, addresses));

    // Get employees for this entity
    const employees = entityEmployees
      .map((emp: EntityEmployee) => this.denormalizeEmployee(emp));

    // Get addresses for this entity
    const entityAddresses = this.getEntityAddresses(entity, addresses);

    const denormalized: DenormalizedCompany = {
      entityId: entity.entityId,
      basicInfo: {
        status: entity.status,
        legalName: entity.legalName,
        title: entity.title,
        taxId: entity.taxId
      },
      contact: {
        phone: entity.phone,
        email: entity.email,
        website: entity.website,
        fullbayWebsite: entity.fullbayWebsite,
        addresses: entityAddresses
      },
      billing: {
        paymentMethod: entity.paymentMethod,
        billingMethod: entity.billingMethod
      },
      locations,
      employees,
      metadata: {
        created: entity.created,
        modified: entity.modified,
        exportTimestamp: new Date().toISOString()
      }
    };

    denormalizedEntities[entity.entityId] = denormalized;

    try {
      // Create entity directory and write flat entity data
      await this.outputManager.createShopDirectory(entity.entityId.toString());
      
      // NEW: Create all 7 category data structures (126 tables)
      const allCategoriesData = await this.createAllEntityCategoriesData(entity);
      
      // 🏪 Add Simple Shop data if this entity is a Simple Shop
      if (this.simpleShopEntities.has(entity.entityId)) {
        const entityDataAny = allCategoriesData.coreData.entity as any;
        this.addBasicSimpleShopData(entityDataAny, entityEmployees, entityLocations);
        console.log(`🏪 Added Simple Shop fields to entity.json for entity ${entity.entityId}`);
      }
      
      await this.outputManager.writeEntityCategoryFiles(entity.entityId.toString(), allCategoriesData);
      
      // Update entity data for summary generation (use core business data for backward compatibility)
      this.outputManager.updateEntityData(entity.entityId.toString(), allCategoriesData.coreData.entity);
      
      // Record successful processing
      this.qualityTracker.incrementProcessed('Entity');
    } catch (error) {
      console.error(`❌ Error writing Entity ${entity.entityId}:`, error);
      this.qualityTracker.incrementError('Entity');
      return {};
    }

    console.log(`✅ Processed entity ${entityId}: ${entity.legalName || entity.title}`);
    console.log(`   📍 ${locations.length} locations`);
    console.log(`   👥 ${employees.length} employees`);
    console.log(`   🏠 ${entityAddresses.length} addresses`);
    
    return denormalizedEntities;
  }

  /**
   * Process entities based on processing mode
   */
   private async processAllEntities(processingMode: 'demo' | 'full' = 'demo', targetEntityId?: number): Promise<{ [entityId: number]: DenormalizedCompany }> {
    if (processingMode === 'demo') {
      console.log('🎯 Demo Mode: Processing entities with optimization...');
    } else {
      console.log('🏭 Full Mode: Processing all entities with complete data...');
    }

    // Load all basic entity data 
    const entities: Entity[] = [];
    console.log('🔄 Loading all entities (basic data)...');
    for await (const batch of this.dataReader.readTableLazy<Entity>('Entity', 2000)) {
      entities.push(...batch);
      console.log(`   Loaded ${entities.length} entities so far...`);
    }

    if (entities.length === 0) {
      console.log('❌ No entities found in database');
      return {};
    }

    console.log(`📊 Found ${entities.length} total entities`);
    
    // check for fully processed entities
    console.log('🔍 Checking for fully processed entities...');
    const fullyProcessedEntities = await this.outputManager.getFullyProcessedEntities();
    console.log(`📊 Found ${fullyProcessedEntities.length} fully processed entities`);
    
    // filter out entities that are already fully processed
    const entitiesToProcess = entities.filter(entity => {
      const entityIdStr = entity.entityId.toString();
      
      if (fullyProcessedEntities.includes(entityIdStr)) {
        console.log(`⏭️  Skipping entity ${entityIdStr}: already fully processed`);
        return false;
      }
      
      return true;
    });
    
    console.log(`🔄 Processing ${entitiesToProcess.length}/${entities.length} entities (${fullyProcessedEntities.length} skipped)`);
    
    // if all entities are already fully processed, return
    if (entitiesToProcess.length === 0) {
      console.log('✅ All entities are already fully processed, nothing to do!');
      return {};
    }
    
    // 🚀 NEW OPTIMIZATION STRATEGY
    if (targetEntityId) {
      const targetEntity = entitiesToProcess.find(e => e.entityId === targetEntityId);
      if (targetEntity) {
        console.log(`🎯 Target Entity Processing strategy:`);
        console.log(`   • Entity ${targetEntityId}: Full processing (customers, service orders, etc.)`);
        console.log(`   • All other entities: Basic processing (company.json only)`);
      } else {
        console.log(`⚠️  Target entity ${targetEntityId} not found or already processed, falling back to demo mode`);
        console.log(`🎯 Demo Processing strategy:`);
        console.log(`   • Simple Shop entities: Full processing`);
        console.log(`   • Other entities: Basic processing`);
      }
    } else {
      // if not targetEntityId, use simple shop logic
      if (processingMode === 'demo') {
        console.log(`🎯 Demo Processing strategy:`);
        console.log(`   • Simple Shop entities: Full processing (customers, service orders, etc.)`);
        console.log(`   • Other entities: Basic processing (company.json only)`);
      } else {
        console.log(`🏭 Full Processing strategy:`);
        console.log(`   • All ${entitiesToProcess.length} Entities: Full processing (customers, service orders, etc.)`);
      }
    }
    
    // Load shared data once for all entities
    const addresses: Address[] = [];
    console.log('🔄 Loading all addresses...');
    for await (const batch of this.dataReader.readTableLazy<Address>('Address', 2000)) {
      addresses.push(...batch);
    }
    console.log(`   Loaded ${addresses.length} addresses`);

    const denormalizedEntities: { [entityId: number]: DenormalizedCompany } = {};
    
    // Initialize statistics
    this.qualityTracker.incrementTotal('Entity', entitiesToProcess.length);

    // 🚀 NEW TWO-PHASE PROCESSING STRATEGY
    
    // 🏃‍♂️ PERFORMANCE OPTIMIZATION: Batch query all entity statistics upfront
    console.log('\n📊 Pre-processing: Batch querying entity statistics...');
    const allEntitiesStats = await this.getAllEntitiesBasicStatistics();
    console.log(`✅ Loaded statistics for ${allEntitiesStats.size} entities with data`);
    
    console.log('\n📋 Phase 1: Processing all entities with basic data...');
    
    // Phase 1: Process all entities with basic data first
    let processedCount = 0;
    for (const entity of entitiesToProcess) {
      processedCount++;
      const progress = ((processedCount / entitiesToProcess.length) * 100).toFixed(1);
      
      console.log(`🏢 [${progress}%] Processing Entity ${entity.entityId} (${entity.legalName || entity.title}) - BASIC DATA`);

      // Validate entity data integrity
      if (!this.qualityTracker.validateEntity('Entity', entity)) {
        console.log(`⚠️  Skipping Entity ${entity.entityId || 'unknown'} due to missing required fields`);
        this.qualityTracker.incrementSkipped('Entity');
        continue;
      }

      // Get addresses for this entity
      const entityAddresses = this.getEntityAddresses(entity, addresses);

      // Basic processing: create company.json only
      const denormalizedCompany: DenormalizedCompany = {
          entityId: entity.entityId,
          basicInfo: {
            status: entity.status,
            legalName: entity.legalName,
            title: entity.title,
            taxId: entity.taxId
          },
          contact: {
            phone: entity.phone,
            email: entity.email,
            website: entity.website,
            fullbayWebsite: entity.fullbayWebsite,
            addresses: entityAddresses
          },
          billing: {
            paymentMethod: entity.paymentMethod,
            billingMethod: entity.billingMethod
          },
          locations: [],
          employees: [],
          metadata: {
            created: entity.created,
            modified: entity.modified,
            exportTimestamp: new Date().toISOString(),
            processingMode: 'basic'
          }
        };

      denormalizedEntities[entity.entityId] = denormalizedCompany;

        try {
        // 🆕 Create basic entity data to get statistics and Simple Shop info
        const basicEntityData = await this.createBasicEntityData(entity, allEntitiesStats);
        
                // Write NEW format BASIC entity data for ALL entities (only Entity table + empty arrays)
        await this.outputManager.createShopDirectory(entity.entityId.toString());
        const basicCoreData = await this.createBasicCoreBusinessData(entity);
        
        // 🆕 Merge Simple Shop data into core data before writing
        const entityDataAny = basicEntityData as any;
        if (entityDataAny.isSimpleShop) {
          // Create enhanced entity object with Simple Shop fields
          const enhancedEntity = {
            ...basicCoreData.entity,
            isSimpleShop: entityDataAny.isSimpleShop,
            locationCount: entityDataAny.locationCount,
            employeeCount: entityDataAny.employeeCount,
            locationNames: entityDataAny.locationNames,
            employeeNames: entityDataAny.employeeNames
          };
          basicCoreData.entity = enhancedEntity;
          console.log(`🏪 Added Simple Shop fields to entity.json for entity ${entity.entityId}`);
        }
        
        await this.outputManager.writeEntityCategoryFiles(entity.entityId.toString(), {
          coreData: basicCoreData,
          employeeData: this.createEmptyEmployeeManagementData(entity.entityId),
          locationData: this.createEmptyLocationManagementData(entity.entityId),
          partsData: this.createEmptyPartsInventoryData(entity.entityId),
          financialData: this.createEmptyFinancialBillingData(entity.entityId),
          servicesData: this.createEmptyServiceComponentData(entity.entityId),
          settingsData: this.createEmptyConfigurationSettingsData(entity.entityId)
        });
        
        // Update entity data with enhanced entity that includes Simple Shop info
        this.outputManager.updateEntityData(entity.entityId.toString(), basicEntityData);
        
        this.qualityTracker.incrementProcessed('Entity');
        console.log(`✅ NEW format BASIC processing completed for entity ${entity.entityId}`);
      } catch (error) {
        console.error(`❌ Error writing NEW format BASIC data for Entity ${entity.entityId}:`, error);
        this.qualityTracker.incrementError('Entity');
      }
    }

    // 🆕 IMMEDIATE INDEX GENERATION: Generate index.json after Phase 1
    // 🔧 FIX: Check if index.json already exists to avoid overwriting existing entity data
    const indexExists = await this.outputManager.fileExists('index.json');
    if (!indexExists) {
      console.log('\n📋 Generating initial index.json with basic entity data...');
      await this.outputManager.finalizeAndWriteIndexes();
      console.log('✅ Initial index.json generated - frontend can now display entity list!');
    } else {
      console.log('\n⏭️  Skipping index.json generation (preserving existing entity data)');
    }

    // Phase 2: Determine which entities need customer/service order processing
    console.log('\n🔄 Phase 2: Processing customers and service orders for selected entities...');
    
    // Log skip configuration
    const skippedIds = getSkippedEntityIds();
    if (skippedIds.length > 0) {
      console.log(`⚙️  Skip configuration: Entities [${skippedIds.join(', ')}] will only receive basic processing`);
    }
    
    let entitiesToProcessFull: Entity[] = [];
    
    if (targetEntityId) {
      // If entityId is specified, only process that entity's customers/service orders if it's Active
      // Manual targeting overrides the skip configuration
      const targetEntity = entities.find(e => e.entityId === targetEntityId);
      if (targetEntity) {
        if (targetEntity.status === 'Active') {
          entitiesToProcessFull = [targetEntity];
          if (shouldSkipEntity(targetEntityId)) {
            console.log(`🎯 Will process customers/service orders for target entity: ${targetEntityId} (Active) - MANUAL OVERRIDE of skip configuration`);
          } else {
            console.log(`🎯 Will process customers/service orders for target entity: ${targetEntityId} (Active)`);
          }
        } else {
          console.log(`⏭️  Skipping target entity ${targetEntityId}: status is ${targetEntity.status} (not Active), basic data only`);
        }
      }
    } else {
      // No entityId specified, decide based on simple shop conditions and processing mode
      if (processingMode === 'full') {
        // Full mode: process all Active entities for full processing, but exclude skipped entities
        entitiesToProcessFull = entities.filter(e => e.status === 'Active' && !shouldSkipEntity(e.entityId));
        const skippedNonActive = entities.filter(e => e.status !== 'Active').length;
        const skippedConfigured = entities.filter(e => e.status === 'Active' && shouldSkipEntity(e.entityId)).length;
        
        console.log(`🏭 Full mode: Will process customers/service orders for ${entitiesToProcessFull.length} Active entities`);
        console.log(`   📊 Skipped: ${skippedNonActive} non-Active entities, ${skippedConfigured} configured skip entities`);
        
        // Log which entities are being skipped due to configuration
        if (skippedConfigured > 0) {
          const skippedEntities = entities.filter(e => e.status === 'Active' && shouldSkipEntity(e.entityId));
          console.log(`   ⏭️  Configured skip entities: ${skippedEntities.map(e => `${e.entityId} (${getSkipReason(e.entityId)})`).join(', ')}`);
        }
      } else {
        // Demo mode: process Simple Shop entities (already filtered for active status in identification), but exclude skipped entities
        entitiesToProcessFull = entities.filter(e => this.simpleShopEntities.has(e.entityId) && !shouldSkipEntity(e.entityId));
        const skippedSimpleShop = entities.filter(e => this.simpleShopEntities.has(e.entityId) && shouldSkipEntity(e.entityId)).length;
        
        console.log(`🎯 Demo mode: Will process customers/service orders for ${entitiesToProcessFull.length} Simple Shop entities`);
        if (skippedSimpleShop > 0) {
          console.log(`   ⏭️  Skipped ${skippedSimpleShop} Simple Shop entities due to configuration`);
        }
      }
    }

    // 🚀 MEMORY OPTIMIZATION: Skip bulk preloading for large datasets to prevent memory overflow
    if (entitiesToProcessFull.length > 0) {
      const entityIdsToPreload = entitiesToProcessFull.map(e => e.entityId);
      if (entityIdsToPreload.length <= 100) {
        console.log(`🚀 Preloading second-level data for ${entityIdsToPreload.length} entities...`);
        await this.preloadAllEntitySecondLevelData(entityIdsToPreload);
      } else {
        console.log(`⚠️  Skipping bulk preload for ${entityIdsToPreload.length} entities (too many for memory)`);
        console.log(`   Will load second-level data on-demand for each entity`);
      }
    }

    // Process full data for selected entities
    let fullProcessedCount = 0;
    for (const entity of entitiesToProcessFull) {
      // 🧹 MEMORY MANAGEMENT: Clear caches every 50 entities to prevent memory buildup
      if (fullProcessedCount > 0 && fullProcessedCount % 50 === 0) {
        console.log(`🧹 Clearing caches after processing ${fullProcessedCount} entities...`);
        this.clearAllCaches();
      }
      fullProcessedCount++;
      const progress = ((fullProcessedCount / entitiesToProcessFull.length) * 100).toFixed(1);
      const globalIndex = entities.findIndex(e => e.entityId === entity.entityId) + 1;
      const isTargetEntity = targetEntityId && entity.entityId === targetEntityId;
      const entityName = entity.legalName || entity.title || `Entity ${entity.entityId}`;
      
      const isSimpleShop = this.simpleShopEntities.has(entity.entityId);
      const processingReason = isTargetEntity ? 'TARGET ENTITY' : isSimpleShop ? 'SIMPLE SHOP' : 'FULL MODE';
      
      console.log(`\n🎯 [${progress}%] Processing entity ${globalIndex}/${entities.length}: ${entityName}`);
      console.log(`   Mode: FULL DATA UPDATE (${processingReason})`);

      try {
        // Full processing - load locations and employees
        console.log(`🔄 Loading locations and employees for entity ${entity.entityId}...`);
        
        const entityLocations = await this.dataReader.query<EntityLocation>(
          'SELECT * FROM EntityLocation WHERE entityId = ?',
          [entity.entityId]
        );
        
        const entityEmployees = await this.dataReader.query<EntityEmployee>(
          'SELECT * FROM EntityEmployee WHERE entityId = ?',
          [entity.entityId]
        );

        const locations = entityLocations.map(loc => this.denormalizeLocation(loc, addresses));
        const employees = entityEmployees.map(emp => this.denormalizeEmployee(emp));
        
        console.log(`   📍 ${locations.length} locations, 👥 ${employees.length} employees`);

        // Get addresses for this entity
        const entityAddresses = this.getEntityAddresses(entity, addresses);

        // Get the already processed denormalized company from Phase 1
        const denormalized = denormalizedEntities[entity.entityId];
        
        // Update with full location and employee data for customer/service order processing
        denormalized.locations = locations;
        denormalized.employees = employees;
        denormalized.metadata.processingMode = 'full';

        // FULL PROCESSING: Load all 7 category data structures (126 tables) and overwrite basic data
        console.log(`🔄 Loading FULL entity data (126 tables) for entity ${entity.entityId}...`);
        const allCategoriesData = await this.createAllEntityCategoriesData(entity);
        
        // 🏪 Add Simple Shop data if this entity is a Simple Shop
        if (this.simpleShopEntities.has(entity.entityId)) {
          const entityDataAny = allCategoriesData.coreData.entity as any;
          this.addBasicSimpleShopData(entityDataAny, entityEmployees, entityLocations);
          console.log(`🏪 Added Simple Shop fields to FULL entity.json for entity ${entity.entityId}`);
        }
        
        await this.outputManager.writeEntityCategoryFiles(entity.entityId.toString(), allCategoriesData);
        
        console.log(`✅ FULL entity data processing completed for entity ${entity.entityId}`);
        
        // 🎯 IMMEDIATE PROCESSING: Process customers and service orders for entities with full data
        if (this.customerProcessor && this.serviceOrderProcessor) {
          console.log(`\n🎯 Immediately processing customers and service orders for entity ${entity.entityId}...`);
          
          try {
            // Process customers for this entity immediately
            console.log(`   👥 Processing customers...`);
            await this.customerProcessor.processCustomers(
              { [entity.entityId]: denormalized }, 
              'full',
              entity.entityId,
              this.simpleShopEntities
            );
            
            // Process service orders for this entity immediately
            console.log(`   🔧 Processing service orders...`);
            await this.serviceOrderProcessor.processServiceOrders(
              { [entity.entityId]: denormalized },
              'full',
              entity.entityId,
              this.simpleShopEntities
            );
              
              // 📝 IMMEDIATE INDEX GENERATION: Generate index.json files and mark as fully processed
              console.log(`   📝 Generating index.json files and marking as complete...`);
              await this.outputManager.generateEntityIndexes(entity.entityId.toString(), true);
              
              // 🔥 AGGREGATION: Auto-aggregate invoices & repair orders after entity processing
              console.log(`   📊 Auto-aggregating invoices for entity ${entity.entityId}...`);
              try {
                const { InvoiceAggregator } = await import('../utils/InvoiceAggregator');
                const aggregator = new InvoiceAggregator(this.outputManager.getOutputDirectory());
                await aggregator.aggregateEntityInvoices(entity.entityId);
                console.log(`   ✅ Invoice aggregation completed for entity ${entity.entityId}`);
              } catch (aggError) {
                console.warn(`   ⚠️  Invoice aggregation failed for entity ${entity.entityId}:`, aggError);
                // Don't fail the entire processing if aggregation fails
              }

              console.log(`   🧩 Auto-aggregating repair orders for entity ${entity.entityId}...`);
              try {
                const { RepairOrderAggregator } = await import('../utils/RepairOrderAggregator');
                const roAggregator = new RepairOrderAggregator(this.outputManager.getOutputDirectory());
                await roAggregator.aggregateEntityRepairOrders(entity.entityId);
                console.log(`   ✅ Repair order aggregation completed for entity ${entity.entityId}`);
              } catch (roAggError) {
                console.warn(`   ⚠️  Repair order aggregation failed for entity ${entity.entityId}:`, roAggError);
                // Don't fail the entire processing if aggregation fails
              }

              console.log(`   ✅ Immediate customer, service order, and index processing completed for entity ${entity.entityId}`);

              // 📤 S3 SYNC: Upload completed entity data to S3
              try {
                const s3Sync = getS3Sync();
                if (s3Sync.isEnabled()) {
                  const entityDir = path.join(this.outputManager.getOutputDirectory(), entity.entityId.toString());
                  await s3Sync.syncDirectory(
                    entityDir,
                    `transformer-output/${entity.entityId}`,
                    `Entity ${entity.entityId}`
                  );
                }
              } catch (s3Error) {
                console.warn(`   ⚠️  S3 sync failed for entity ${entity.entityId}:`, s3Error);
                // Don't fail the entire processing if S3 sync fails
              }
            } catch (error) {
              console.error(`   ❌ Error processing customers/service orders/indexes for entity ${entity.entityId}:`, error);
            }
          }
          
        } catch (error) {
          console.error(`❌ Error writing Entity ${entity.entityId}:`, error);
          this.qualityTracker.incrementError('Entity');
        } finally {
          // Clear cache for this entity to free memory
          this.clearEntityCache(entity.entityId);
        }
      }
      
    // Summary of processing
    const fullEntitiesCount = entitiesToProcessFull.length;
    const basicEntitiesCount = entities.length - fullEntitiesCount;
    
    console.log(`\n✅ Processed ${entities.length} entities:`);
    if (targetEntityId) {
      console.log(`   🎯 1 target entity (${targetEntityId}) with full data`);
      console.log(`   ⚡ ${basicEntitiesCount} entities with basic data only`);
    } else if (processingMode === 'demo') {
      console.log(`   🎯 ${fullEntitiesCount} Simple Shop entities with full data`);
      console.log(`   ⚡ ${basicEntitiesCount} entities with basic data only`);
    } else {
      console.log(`   🎯 ${fullEntitiesCount} entities with full data`);
    }
    
    return denormalizedEntities;
  }

  /**
   * Denormalize a single location with its addresses
   */
  private denormalizeLocation(location: EntityLocation, addresses: Address[]): DenormalizedLocation {
    const locationAddresses: Address[] = [];
    
    // Add mailing address
    if (location.mailingEntityAddressId) {
      const mailingAddress = addresses.find(addr => addr.addressId === location.mailingEntityAddressId);
      if (mailingAddress) {
        locationAddresses.push({ ...mailingAddress, addressType: 'mailing' } as any);
      }
    }

    // Add physical address
    if (location.physicalEntityAddressId) {
      const physicalAddress = addresses.find(addr => addr.addressId === location.physicalEntityAddressId);
      if (physicalAddress) {
        locationAddresses.push({ ...physicalAddress, addressType: 'physical' } as any);
      }
    }

    return {
      entityLocationId: location.entityLocationId,
      entityId: location.entityId,
      basicInfo: {
        name: location.name,
        title: location.title,
        active: location.active,
        shop: location.shop
      },
      contact: {
        phone: location.phone,
        email: location.email,
        addresses: locationAddresses
      }
    };
  }

  /**
   * Denormalize a single employee
   */
  private denormalizeEmployee(employee: EntityEmployee): DenormalizedEmployee {
    return {
      entityEmployeeId: employee.entityEmployeeId,
      entityId: employee.entityId,
      basicInfo: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        active: employee.active
      },
      contact: {
        email: employee.email,
        phone: employee.phone
      },
      role: {
        entityRoleId: employee.entityRoleId,
        roleName: undefined // Would need to join with EntityRole table
      }
    };
  }

  /**
   * Get addresses associated with an entity
   */
  private getEntityAddresses(entity: Entity, addresses: Address[]): Address[] {
    const entityAddresses: Address[] = [];

    // Primary address
    if (entity.primaryEntityAddressId) {
      const primaryAddress = addresses.find(addr => addr.addressId === entity.primaryEntityAddressId);
      if (primaryAddress) {
        entityAddresses.push({ ...primaryAddress, addressType: 'primary' } as any);
      }
    }

    // Billing address
    if (entity.billingEntityAddressId && entity.billingEntityAddressId !== entity.primaryEntityAddressId) {
      const billingAddress = addresses.find(addr => addr.addressId === entity.billingEntityAddressId);
      if (billingAddress) {
        entityAddresses.push({ ...billingAddress, addressType: 'billing' } as any);
      }
    }

    return entityAddresses;
  }

  /**
   * Create flat entity data directly from original entity to preserve all TSV fields
   */
  private createFlatEntityData(entity: Entity): any {
    return {
      entityId: entity.entityId,
      status: entity.status,
      corporationId: entity.corporationId || 0,
      number: entity.number,
      legalName: entity.legalName,
      title: entity.title,
      taxId: entity.taxId,
      entityTaxLocationId: entity.entityTaxLocationId,
      phone: entity.phone,
      email: entity.email,
      fax: entity.fax,
      fbConnectLevel: entity.fbConnectLevel,
      website: entity.website,
      fullbayWebsite: entity.fullbayWebsite,
      calendarViewOnlyCode: entity.calendarViewOnlyCode,
      primaryEntityAddressId: entity.primaryEntityAddressId,
      primaryEntityEmployeeId: entity.primaryEntityEmployeeId,
      billingEntityAddressId: entity.billingEntityAddressId,
      billingEntityEmployeeId: entity.billingEntityEmployeeId,
      fullbayQuickBooksId: entity.fullbayQuickBooksId,
      stripeCustomerId: entity.stripeCustomerId,
      stripeCreditCardId: entity.stripeCreditCardId,
      paymentMethod: entity.paymentMethod,
      billingMethod: entity.billingMethod,
      billingPreference: entity.billingPreference,
      billingDay: entity.billingDay,
      nextBillDate: entity.nextBillDate,
      promoCode: entity.promoCode,
      ccName: entity.ccName,
      ccAddressId: entity.ccAddressId,
      created: entity.created,
      modified: entity.modified
    };
  }

  /**
   * Batch query basic statistics for all entities (much faster than individual queries)
   */
  private async getAllEntitiesBasicStatistics(): Promise<Map<number, {
    customerCount: number;
    unitCount: number;
    serviceOrderCount: number;
  }>> {
    console.log(`📊 Batch querying basic statistics for all entities...`);
    const statsMap = new Map<number, { customerCount: number; unitCount: number; serviceOrderCount: number }>();
    
    try {
      // Batch query customer counts per entity
      console.log(`   📊 Querying customer counts...`);
      const customerCounts = await this.dataReader.query<{entityId: number, count: number}>(
        'SELECT entityId, COUNT(*) as count FROM Customer GROUP BY entityId'
      );
      
      // Batch query unit counts per entity
      console.log(`   📊 Querying unit counts...`);
      const unitCounts = await this.dataReader.query<{entityId: number, count: number}>(
        'SELECT c.entityId, COUNT(*) as count FROM CustomerUnit cu INNER JOIN Customer c ON cu.customerId = c.customerId GROUP BY c.entityId'
      );
      
      // Batch query service order counts per entity
      console.log(`   📊 Querying service order counts...`);
      const serviceOrderCounts = await this.dataReader.query<{entityId: number, count: number}>(
        'SELECT c.entityId, COUNT(*) as count FROM RepairOrder ro INNER JOIN CustomerUnit cu ON ro.customerUnitId = cu.customerUnitId INNER JOIN Customer c ON cu.customerId = c.customerId GROUP BY c.entityId'
      );
      
      // Create maps for quick lookup
      const customerCountMap = new Map<number, number>();
      const unitCountMap = new Map<number, number>();
      const serviceOrderCountMap = new Map<number, number>();
      
      customerCounts.forEach(row => customerCountMap.set(row.entityId, row.count));
      unitCounts.forEach(row => unitCountMap.set(row.entityId, row.count));
      serviceOrderCounts.forEach(row => serviceOrderCountMap.set(row.entityId, row.count));
      
      // Get all unique entity IDs from the queries
      const allEntityIds = new Set<number>();
      customerCounts.forEach(row => allEntityIds.add(row.entityId));
      unitCounts.forEach(row => allEntityIds.add(row.entityId));
      serviceOrderCounts.forEach(row => allEntityIds.add(row.entityId));
      
      // Build final statistics map
      allEntityIds.forEach(entityId => {
        const customerCount = customerCountMap.get(entityId) || 0;
        const unitCount = unitCountMap.get(entityId) || 0;
        const serviceOrderCount = serviceOrderCountMap.get(entityId) || 0;
        
        statsMap.set(entityId, {
          customerCount,
          unitCount,
          serviceOrderCount
        });
      });
      
      console.log(`📊 Batch query completed: ${statsMap.size} entities with data`);
      console.log(`   👥 Total customers across all entities: ${Array.from(customerCountMap.values()).reduce((a, b) => a + b, 0)}`);
      console.log(`   🚗 Total units across all entities: ${Array.from(unitCountMap.values()).reduce((a, b) => a + b, 0)}`);
      console.log(`   🔧 Total service orders across all entities: ${Array.from(serviceOrderCountMap.values()).reduce((a, b) => a + b, 0)}`);
      
      return statsMap;
    } catch (error) {
      console.error(`❌ Failed to batch query basic statistics:`, error);
      return statsMap;
    }
  }

  /**
   * Create basic entity data without second-level tables (for non-first entities)
   */
  private async createBasicEntityData(entity: Entity, preloadedStats?: Map<number, {
    customerCount: number;
    unitCount: number;
    serviceOrderCount: number;
  }>): Promise<EnhancedEntity> {
    console.log(`📋 Creating basic entity data for entity ${entity.entityId}...`);
    
    // Get basic statistics for this entity (from preloaded data if available)
    let stats = { customerCount: 0, unitCount: 0, serviceOrderCount: 0 };
    if (preloadedStats && preloadedStats.has(entity.entityId)) {
      stats = preloadedStats.get(entity.entityId)!;
      console.log(`📊 Using preloaded statistics for entity ${entity.entityId}: ${stats.customerCount} customers, ${stats.unitCount} units, ${stats.serviceOrderCount} service orders`);
    }
    
    // Return entity with empty arrays for all second-level tables
    const basicEntity: EnhancedEntity = {
      // Copy all base Entity fields
      ...entity,
      // Initialize all 12 second-level table arrays as empty
      history: [],
      information: [],
      roles: [],
      notes: [],
      fees: [],
      addresses: [],
      components: [],
      departments: [],
      parts: [],
      employees: [],
      locations: [],
      invoices: []
    };

    // Add Simple Shop data even for basic entities if they are Simple Shops
    console.log(`🔍 DEBUG: Checking Simple Shop status for entity ${entity.entityId}: ${this.simpleShopEntities.has(entity.entityId)}`);
    if (this.simpleShopEntities.has(entity.entityId)) {
      console.log(`🏪 Processing Simple Shop entity ${entity.entityId} in basic mode`);
      // For basic entities, we still need to load employees and locations for Simple Shop detection
      const [employees, locations] = await Promise.all([
        this.loadEntityEmployees(entity.entityId),
        this.loadEntityLocations(entity.entityId)
      ]);
      basicEntity.employees = employees;
      basicEntity.locations = locations;
      this.addBasicSimpleShopData(basicEntity, employees, locations);
      console.log(`✅ Added Simple Shop data to basicEntity for entity ${entity.entityId}`);
    }

    // 🆕 Pass basic statistics to OutputManager for index.json generation
    this.outputManager.addEntityBasicStatistics(entity.entityId.toString(), {
      customers: stats.customerCount,
      units: stats.unitCount,
      serviceOrders: stats.serviceOrderCount
    });

    console.log(`✅ Basic entity data created for entity ${entity.entityId} (with basic statistics: ${stats.customerCount} customers, ${stats.unitCount} units, ${stats.serviceOrderCount} service orders)`);
    return basicEntity;
  }

  /**
   * Create enhanced entity data with aggregated second-level Entity tables (LEGACY - for backward compatibility)
   */
  private async createEnhancedEntityData(entity: Entity): Promise<EnhancedEntity> {
    console.log(`📋 Loading second-level Entity tables for entity ${entity.entityId}...`);
    
    // Initialize enhanced entity with base fields and empty arrays
    const enhancedEntity: EnhancedEntity = {
      // Copy all base Entity fields
      ...entity,
      // Initialize all 12 second-level table arrays
      history: [],
      information: [],
      roles: [],
      notes: [],
      fees: [],
      addresses: [],
      components: [],
      departments: [],
      parts: [],
      employees: [],
      locations: [],
      invoices: []
    };

    try {
      // Load all 12 second-level Entity tables in parallel
      const [
        history,
        information,
        roles,
        notes,
        fees,
        addresses,
        components,
        departments,
        parts,
        employees,
        locations,
        invoices
      ] = await Promise.all([
        this.loadEntityHistory(entity.entityId),
        this.loadEntityInformation(entity.entityId),
        this.loadEntityRoles(entity.entityId),
        this.loadEntityNotes(entity.entityId),
        this.loadEntityFees(entity.entityId),
        this.loadEntityAddresses(entity.entityId),
        this.loadEntityComponents(entity.entityId),
        this.loadEntityDepartments(entity.entityId),
        this.loadEntityParts(entity.entityId),
        this.loadEntityEmployees(entity.entityId),
        this.loadEntityLocations(entity.entityId),
        this.loadEntityInvoices(entity.entityId)
      ]);

      // Add all 12 second-level table arrays (empty arrays if no data)
      enhancedEntity.history = history;
      enhancedEntity.information = information;
      enhancedEntity.roles = roles;
      enhancedEntity.notes = notes;
      enhancedEntity.fees = fees;
      enhancedEntity.addresses = addresses;
      enhancedEntity.components = components;
      enhancedEntity.departments = departments;
      enhancedEntity.parts = parts;
      enhancedEntity.employees = employees;
      enhancedEntity.locations = locations;
      enhancedEntity.invoices = invoices;

      console.log(`✅ Enhanced entity ${entity.entityId} with 12 second-level tables:`);
      console.log(`   📚 History: ${history.length} records`);
      console.log(`   ℹ️  Information: ${information.length} records`);
      console.log(`   👤 Roles: ${roles.length} records`);
      console.log(`   📝 Notes: ${notes.length} records`);
      console.log(`   💰 Fees: ${fees.length} records`);
      console.log(`   🏠 Addresses: ${addresses.length} records`);
      console.log(`   ⚙️  Components: ${components.length} records`);
      console.log(`   🏢 Departments: ${departments.length} records`);
      console.log(`   🔧 Parts: ${parts.length} records`);
      console.log(`   👥 Employees: ${employees.length} records`);
      console.log(`   📍 Locations: ${locations.length} records`);
      console.log(`   🧾 Invoices: ${invoices.length} records`);

      // Add Simple Shop data if this entity is a Simple Shop
      if (this.simpleShopEntities.has(entity.entityId)) {
        this.addBasicSimpleShopData(enhancedEntity, employees, locations);
      }

      return enhancedEntity;
    } catch (error) {
      console.error(`❌ Error loading second-level tables for entity ${entity.entityId}:`, error);
      // Return basic entity data if second-level loading fails
      return enhancedEntity;
    }
  }

  /**
   * NEW: Create all 7 category data structures for entity (126 tables total)
   */
  private async createAllEntityCategoriesData(entity: Entity): Promise<AllEntityCategoriesData> {
    console.log(`📋 Loading ALL Entity categories for entity ${entity.entityId} (126 tables)...`);
    
    try {
      // Load all 7 categories in parallel
      const [
        coreData,
        employeeData,
        locationData,
        partsData,
        financialData,
        servicesData,
        settingsData
      ] = await Promise.all([
        this.loadCoreBusinessData(entity.entityId),
        this.loadEmployeeManagementData(entity.entityId),
        this.loadLocationManagementData(entity.entityId),
        this.loadPartsInventoryData(entity.entityId),
        this.loadFinancialBillingData(entity.entityId),
        this.loadServiceComponentData(entity.entityId),
        this.loadConfigurationSettingsData(entity.entityId)
      ]);

      console.log(`✅ Loaded ALL entity categories for entity ${entity.entityId}:`);
      console.log(`   📊 Core Business: ${coreData.metadata.totalRecords} records (${coreData.metadata.tableCount} tables)`);
      console.log(`   👥 Employee Management: ${employeeData.metadata.totalRecords} records (${employeeData.metadata.tableCount} tables)`);
      console.log(`   📍 Location Management: ${locationData.metadata.totalRecords} records (${locationData.metadata.tableCount} tables)`);
      console.log(`   🔧 Parts & Inventory: ${partsData.metadata.totalRecords} records (${partsData.metadata.tableCount} tables)`);
      console.log(`   💰 Financial & Billing: ${financialData.metadata.totalRecords} records (${financialData.metadata.tableCount} tables)`);
      console.log(`   ⚙️  Services & Components: ${servicesData.metadata.totalRecords} records (${servicesData.metadata.tableCount} tables)`);
      console.log(`   🔧 Configuration & Settings: ${settingsData.metadata.totalRecords} records (${settingsData.metadata.tableCount} tables)`);

      const totalRecords = coreData.metadata.totalRecords + employeeData.metadata.totalRecords + 
                          locationData.metadata.totalRecords + partsData.metadata.totalRecords +
                          financialData.metadata.totalRecords + servicesData.metadata.totalRecords +
                          settingsData.metadata.totalRecords;
      
      console.log(`   🎯 TOTAL: ${totalRecords} records across 126 tables`);

      return {
        coreData,
        employeeData,
        locationData,
        partsData,
        financialData,
        servicesData,
        settingsData
      };
    } catch (error) {
      console.error(`❌ Error loading entity categories for entity ${entity.entityId}:`, error);
      throw error;
    }
  }

  // Second-level table loading methods
  private async loadEntityHistory(entityId: number): Promise<EntityHistory[]> {
    // Check cache first
    if (this.historyCache.has(entityId)) {
      console.log(`💾 Using cached history for entity ${entityId}`);
      return this.historyCache.get(entityId)!;
    }

    try {
      const history = await this.dataReader.query<EntityHistory>(
        'SELECT * FROM EntityHistory WHERE entityId = ?',
        [entityId]
      );
      
      // Store in cache for future use
      this.historyCache.set(entityId, history);
      console.log(`📦 Cached ${history.length} history records for entity ${entityId}`);
      
      return history;
    } catch (error) {
      console.warn(`⚠️  Failed to load EntityHistory for entity ${entityId}:`, error);
      const emptyHistory: EntityHistory[] = [];
      this.historyCache.set(entityId, emptyHistory);
      return emptyHistory;
    }
  }

  private async loadEntityInformation(entityId: number): Promise<EntityInformation[]> {
    // Check cache first
    if (this.informationCache.has(entityId)) {
      console.log(`💾 Using cached information for entity ${entityId}`);
      return this.informationCache.get(entityId)!;
    }

    try {
      const information = await this.dataReader.query<EntityInformation>(
        'SELECT * FROM EntityInformation WHERE entityId = ?',
        [entityId]
      );
      
      // Store in cache for future use
      this.informationCache.set(entityId, information);
      console.log(`📦 Cached ${information.length} information records for entity ${entityId}`);
      
      return information;
    } catch (error) {
      console.warn(`⚠️  Failed to load EntityInformation for entity ${entityId}:`, error);
      const emptyInformation: EntityInformation[] = [];
      this.informationCache.set(entityId, emptyInformation);
      return emptyInformation;
    }
  }

  private async loadEntityRoles(entityId: number): Promise<EntityRole[]> {
    // Check cache first
    if (this.rolesCache.has(entityId)) {
      console.log(`💾 Using cached roles for entity ${entityId}`);
      return this.rolesCache.get(entityId)!;
    }

    try {
      const roles = await this.dataReader.query<EntityRole>(
        'SELECT * FROM EntityRole WHERE entityId = ?',
        [entityId]
      );
      
      this.rolesCache.set(entityId, roles);
      console.log(`📦 Cached ${roles.length} roles for entity ${entityId}`);
      return roles;
    } catch (error) {
      console.warn(`⚠️  Failed to load EntityRole for entity ${entityId}:`, error);
      const emptyRoles: EntityRole[] = [];
      this.rolesCache.set(entityId, emptyRoles);
      return emptyRoles;
    }
  }

  private async loadEntityNotes(entityId: number): Promise<EntityNote[]> {
    // Check cache first
    if (this.notesCache.has(entityId)) {
      console.log(`💾 Using cached notes for entity ${entityId}`);
      return this.notesCache.get(entityId)!;
    }

    try {
      const notes = await this.dataReader.query<EntityNote>(
        'SELECT * FROM EntityNote WHERE entityId = ?',
        [entityId]
      );
      
      this.notesCache.set(entityId, notes);
      console.log(`📦 Cached ${notes.length} notes for entity ${entityId}`);
      return notes;
    } catch (error) {
      console.warn(`⚠️  Failed to load EntityNote for entity ${entityId}:`, error);
      const emptyNotes: EntityNote[] = [];
      this.notesCache.set(entityId, emptyNotes);
      return emptyNotes;
    }
  }

  private async loadEntityFees(entityId: number): Promise<EntityFee[]> {
    // Check cache first
    if (this.feesCache.has(entityId)) {
      console.log(`💾 Using cached fees for entity ${entityId}`);
      return this.feesCache.get(entityId)!;
    }

    try {
      const fees = await this.dataReader.query<EntityFee>(
        'SELECT * FROM EntityFee WHERE entityId = ?',
        [entityId]
      );
      
      this.feesCache.set(entityId, fees);
      console.log(`📦 Cached ${fees.length} fees for entity ${entityId}`);
      return fees;
    } catch (error) {
      console.warn(`⚠️  Failed to load EntityFee for entity ${entityId}:`, error);
      const emptyFees: EntityFee[] = [];
      this.feesCache.set(entityId, emptyFees);
      return emptyFees;
    }
  }

  private async loadEntityAddresses(entityId: number): Promise<EntityAddress[]> {
    // Check cache first
    if (this.addressesCache.has(entityId)) {
      console.log(`💾 Using cached addresses for entity ${entityId}`);
      return this.addressesCache.get(entityId)!;
    }

    try {
      const addresses = await this.dataReader.query<EntityAddress>(
        'SELECT * FROM EntityAddress WHERE entityId = ?',
        [entityId]
      );
      
      this.addressesCache.set(entityId, addresses);
      console.log(`📦 Cached ${addresses.length} addresses for entity ${entityId}`);
      return addresses;
    } catch (error) {
      console.warn(`⚠️  Failed to load EntityAddress for entity ${entityId}:`, error);
      const emptyAddresses: EntityAddress[] = [];
      this.addressesCache.set(entityId, emptyAddresses);
      return emptyAddresses;
    }
  }

  private async loadEntityComponents(entityId: number): Promise<EntityComponent[]> {
    // Check cache first
    if (this.componentsCache.has(entityId)) {
      console.log(`💾 Using cached components for entity ${entityId}`);
      return this.componentsCache.get(entityId)!;
    }

    try {
      const components = await this.dataReader.query<EntityComponent>(
        'SELECT * FROM EntityComponent WHERE entityId = ?',
        [entityId]
      );
      
      this.componentsCache.set(entityId, components);
      console.log(`📦 Cached ${components.length} components for entity ${entityId}`);
      return components;
    } catch (error) {
      console.warn(`⚠️  Failed to load EntityComponent for entity ${entityId}:`, error);
      const emptyComponents: EntityComponent[] = [];
      this.componentsCache.set(entityId, emptyComponents);
      return emptyComponents;
    }
  }

  private async loadEntityDepartments(entityId: number): Promise<EntityDepartment[]> {
    // Check cache first
    if (this.departmentsCache.has(entityId)) {
      console.log(`💾 Using cached departments for entity ${entityId}`);
      return this.departmentsCache.get(entityId)!;
    }

    try {
      const departments = await this.dataReader.query<EntityDepartment>(
        'SELECT * FROM EntityDepartment WHERE entityId = ?',
        [entityId]
      );
      
      this.departmentsCache.set(entityId, departments);
      console.log(`📦 Cached ${departments.length} departments for entity ${entityId}`);
      return departments;
    } catch (error) {
      console.warn(`⚠️  Failed to load EntityDepartment for entity ${entityId}:`, error);
      const emptyDepartments: EntityDepartment[] = [];
      this.departmentsCache.set(entityId, emptyDepartments);
      return emptyDepartments;
    }
  }

  private async loadEntityParts(entityId: number): Promise<EntityPart[]> {
    // Check cache first
    if (this.partsCache.has(entityId)) {
      console.log(`💾 Using cached parts for entity ${entityId}`);
      return this.partsCache.get(entityId)!;
    }

    try {
      const parts = await this.dataReader.query<EntityPart>(
        'SELECT * FROM EntityPart WHERE entityId = ?',
        [entityId]
      );
      
      this.partsCache.set(entityId, parts);
      console.log(`📦 Cached ${parts.length} parts for entity ${entityId}`);
      return parts;
    } catch (error) {
      console.warn(`⚠️  Failed to load EntityPart for entity ${entityId}:`, error);
      const emptyParts: EntityPart[] = [];
      this.partsCache.set(entityId, emptyParts);
      return emptyParts;
    }
  }

  private async loadEntityEmployees(entityId: number): Promise<EntityEmployee[]> {
    // Check cache first
    if (this.employeesCache.has(entityId)) {
      console.log(`💾 Using cached employees for entity ${entityId}`);
      return this.employeesCache.get(entityId)!;
    }

    try {
      const employees = await this.dataReader.query<EntityEmployee>(
        'SELECT * FROM EntityEmployee WHERE entityId = ?',
        [entityId]
      );
      
      // Store in cache for future use
      this.employeesCache.set(entityId, employees);
      console.log(`📦 Cached ${employees.length} employees for entity ${entityId}`);
      
      return employees;
    } catch (error) {
      console.warn(`⚠️  Failed to load EntityEmployee for entity ${entityId}:`, error);
      const emptyEmployees: EntityEmployee[] = [];
      this.employeesCache.set(entityId, emptyEmployees);
      return emptyEmployees;
    }
  }

  private async loadEntityLocations(entityId: number): Promise<EntityLocation[]> {
    // Check cache first
    if (this.locationsCache.has(entityId)) {
      console.log(`💾 Using cached locations for entity ${entityId}`);
      return this.locationsCache.get(entityId)!;
    }

    try {
      const locations = await this.dataReader.query<EntityLocation>(
        'SELECT * FROM EntityLocation WHERE entityId = ?',
        [entityId]
      );
      
      // Store in cache for future use
      this.locationsCache.set(entityId, locations);
      console.log(`📦 Cached ${locations.length} locations for entity ${entityId}`);
      
      return locations;
    } catch (error) {
      console.warn(`⚠️  Failed to load EntityLocation for entity ${entityId}:`, error);
      const emptyLocations: EntityLocation[] = [];
      this.locationsCache.set(entityId, emptyLocations);
      return emptyLocations;
    }
  }

  private async loadEntityInvoices(entityId: number): Promise<EntityInvoice[]> {
    // Check cache first
    if (this.invoicesCache.has(entityId)) {
      console.log(`💾 Using cached invoices for entity ${entityId}`);
      return this.invoicesCache.get(entityId)!;
    }

    try {
      const invoices = await this.dataReader.query<EntityInvoice>(
        'SELECT * FROM EntityInvoice WHERE entityId = ?',
        [entityId]
      );
      
      this.invoicesCache.set(entityId, invoices);
      console.log(`📦 Cached ${invoices.length} invoices for entity ${entityId}`);
      return invoices;
    } catch (error) {
      console.warn(`⚠️  Failed to load EntityInvoice for entity ${entityId}:`, error);
      const emptyInvoices: EntityInvoice[] = [];
      this.invoicesCache.set(entityId, emptyInvoices);
      return emptyInvoices;
    }
  }

  /**
   * Clear cache for a specific entity to free memory
   */
  private clearEntityCache(entityId: number): void {
    this.employeesCache.delete(entityId);
    this.locationsCache.delete(entityId);
    this.historyCache.delete(entityId);
    this.informationCache.delete(entityId);
    this.rolesCache.delete(entityId);
    this.notesCache.delete(entityId);
    this.feesCache.delete(entityId);
    this.addressesCache.delete(entityId);
    this.componentsCache.delete(entityId);
    this.departmentsCache.delete(entityId);
    this.partsCache.delete(entityId);
    this.invoicesCache.delete(entityId);
  }

  /**
   * Clear all caches to free memory (used in batch processing)
   */
  private clearAllCaches(): void {
    this.employeesCache.clear();
    this.locationsCache.clear();
    this.historyCache.clear();
    this.informationCache.clear();
    this.rolesCache.clear();
    this.notesCache.clear();
    this.feesCache.clear();
    this.addressesCache.clear();
    this.componentsCache.clear();
    this.departmentsCache.clear();
    this.partsCache.clear();
    this.invoicesCache.clear();
    console.log(`🧹 Cleared all Entity caches (12 cache tables)`);
  }

  /**
   * Add basic Simple Shop identification data (without expensive queries)
   */
  private addBasicSimpleShopData(entityData: any, employees: EntityEmployee[], locations: EntityLocation[]): void {
    const activeEmployees = employees.filter(e => Boolean(e.active));
    const activeLocations = locations.filter(l => Boolean(l.active));
    
    entityData.isSimpleShop = true;
    entityData.locationCount = activeLocations.length;
    entityData.employeeCount = activeEmployees.length;
    // 🏪 Fix: Use title field first, fallback to name, then location ID
    entityData.locationNames = activeLocations.map(l => l.title || l.name || `Location ${l.entityLocationId}`).filter(Boolean);
    entityData.employeeNames = activeEmployees.map(e => `${e.firstName || ''} ${e.lastName || ''}`.trim()).filter(Boolean);

    console.log(`🏪 Simple Shop identified: Entity ${entityData.entityId} (${entityData.locationCount} locations, ${entityData.employeeCount} employees)`);
    console.log(`   📍 Location names: ${entityData.locationNames.join(', ')}`);
    console.log(`   👥 Employee names: ${entityData.employeeNames.join(', ')}`);
  }

  // ===== NEW CATEGORY DATA LOADING METHODS =====

  /**
   * Create BASIC Core Business Data (only Entity table, others empty)
   */
  private async createBasicCoreBusinessData(entity: Entity): Promise<CoreBusinessData> {
    console.log(`📊 Creating BASIC Core Business data for entity ${entity.entityId} (Entity table only)...`);
    
    return {
      entity,
      addresses: [], // Empty for basic processing
      locations: [], // Empty for basic processing
      employees: [], // Empty for basic processing
      roles: [], // Empty for basic processing
      history: [], // Empty for basic processing
      metadata: {
        entityId: entity.entityId,
        category: 'Core Business',
        totalRecords: 1, // Only Entity table
        tableCount: 6,
        exportTimestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Load Core Business Data (6 tables) - FULL processing
   */
  private async loadCoreBusinessData(entityId: number): Promise<CoreBusinessData> {
    console.log(`📊 Loading Core Business data for entity ${entityId}...`);
    
    try {
      const [entity] = await this.dataReader.query<Entity>(
        'SELECT * FROM Entity WHERE entityId = ?',
        [entityId]
      );

      if (!entity) {
        throw new Error(`Entity ${entityId} not found`);
      }

      const [addresses, locations, employees, roles, history] = await Promise.all([
        this.loadEntityAddresses(entityId),
        this.loadEntityLocations(entityId),
        this.loadEntityEmployees(entityId),
        this.loadEntityRoles(entityId),
        this.loadEntityHistory(entityId)
      ]);

      const totalRecords = addresses.length + locations.length + employees.length + roles.length + history.length + 1;

      return {
        entity,
        addresses,
        locations,
        employees,
        roles,
        history,
        metadata: {
          entityId,
          category: 'Core Business',
          totalRecords,
          tableCount: 6,
          exportTimestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`❌ Error loading Core Business data for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Create EMPTY Employee Management Data
   */
  private createEmptyEmployeeManagementData(entityId: number): EmployeeManagementData {
    return {
      achievementHistory: [],
      entityLocationEntry: [],
      entityRoleEntry: [],
      eventHistory: [],
      filter: [],
      history: [],
      noteStatus: [],
      notificationConfiguration: [],
      notificationSettings: [],
      notificationStatus: [],
      reportFavorite: [],
      schedule: [],
      statisticEntry: [],
      timeStamp: [],
      timeStampActivity: [],
      metadata: {
        entityId,
        category: 'Employee Management',
        totalRecords: 0,
        tableCount: 15,
        exportTimestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Create EMPTY Location Management Data
   */
  private createEmptyLocationManagementData(entityId: number): LocationManagementData {
    return {
      apiConnection: [],
      apiIntegration: [],
      calendarEvent: [],
      calendarEventEntityEmployeeEntry: [],
      entityFeeEntry: [],
      history: [],
      notificationSettings: [],
      notificationStatus: [],
      quickBooksDesktopInformation: [],
      quickBooksInformation: [],
      metadata: {
        entityId,
        category: 'Location Management',
        totalRecords: 0,
        tableCount: 10,
        exportTimestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Create EMPTY Parts Inventory Data
   */
  private createEmptyPartsInventoryData(entityId: number): PartsInventoryData {
    return {
      parts: [],
      partCrossReference: [],
      partTableTag: [],
      partVendor: [],
      partVendorAddress: [],
      partVendorAddressHistory: [],
      partVendorBridgestoneProductLine: [],
      partVendorContact: [],
      partVendorContactHistory: [],
      partVendorCredit: [],
      partVendorCreditLine: [],
      partVendorEntityLocationEntry: [],
      partVendorHistory: [],
      partVendorInvoice: [],
      partVendorInvoiceEntityLocationPartOrderEntryEntry: [],
      partVendorInvoiceRepairOrderOrderVendorPartEntry: [],
      partVendorPayment: [],
      partVendorPaymentEntityPartVendorCreditEntry: [],
      partVendorPaymentEntityPartVendorInvoiceEntry: [],
      locationPart: [],
      locationPartAdjustment: [],
      locationPartAdjustmentEntry: [],
      locationPartEntityLocationPartLocationEntry: [],
      locationPartHistory: [],
      locationPartIncoming: [],
      locationPartKit: [],
      locationPartKitEntry: [],
      locationPartLocation: [],
      locationPartOrder: [],
      locationPartOrderEntry: [],
      locationPartOrderEntryHistory: [],
      locationPartOrderHistory: [],
      locationPartOutgoing: [],
      locationPartOutgoingAdjustmentHistory: [],
      locationPartSerialized: [],
      locationPartSerializedSerial: [],
      locationPartSerializedTireDetail: [],
      locationPartSerializedTireDetailHeader: [],
      locationPartSerializedTireDetailNote: [],
      locationPartSerializedTireDetailRawMaterial: [],
      locationPartSerializedTireDetailRepairPart: [],
      locationPartTransfer: [],
      locationPartTransferEntry: [],
      metadata: {
        entityId,
        category: 'Parts and Inventory',
        totalRecords: 0,
        tableCount: 43,
        exportTimestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Create EMPTY Financial Billing Data
   */
  private createEmptyFinancialBillingData(entityId: number): FinancialBillingData {
    return {
      fee: [],
      feeHistory: [],
      feePaymentMethod: [],
      invoice: [],
      invoiceRow: [],
      laborRate: [],
      laborRateHistory: [],
      paymentMethod: [],
      creditTerm: [],
      taxLocation: [],
      taxLocationEntityLocationEntry: [],
      taxLocationEntry: [],
      taxLocationQuickBooksItemTaxability: [],
      partsMarkUp: [],
      partsMarkUpMatrix: [],
      partsMarkUpScale: [],
      distanceRate: [],
      outsideServicesRate: [],
      outsideServicesRateScale: [],
      suppliesRate: [],
      metadata: {
        entityId,
        category: 'Financial and Billing',
        totalRecords: 0,
        tableCount: 20,
        exportTimestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Create EMPTY Service Component Data
   */
  private createEmptyServiceComponentData(entityId: number): ServiceComponentData {
    return {
      component: [],
      componentField: [],
      componentFieldResponse: [],
      componentSystem: [],
      componentSystemCorrection: [],
      componentSystemCorrectionChecklist: [],
      componentSystemCorrectionEntityComponentFieldEntry: [],
      componentSystemCorrectionKit: [],
      componentSystemCorrectionKitEntry: [],
      componentSystemCorrectionPart: [],
      componentSystemCorrectionUsage: [],
      componentSystemEntityComponentFieldEntry: [],
      unitType: [],
      unitTypeEntityComponentEntry: [],
      unitTypeEntityComponentSystemEntry: [],
      unitTypeEntityComponentSystemCorrectionEntry: [],
      metadata: {
        entityId,
        category: 'Service and Component',
        totalRecords: 0,
        tableCount: 16,
        exportTimestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Create EMPTY Configuration Settings Data
   */
  private createEmptyConfigurationSettingsData(entityId: number): ConfigurationSettingsData {
    return {
      information: [],
      department: [],
      manufacturer: [],
      note: [],
      roleHistory: [],
      rolePermissionEntry: [],
      termsOfService: [],
      priceFilePart: [],
      priceFilePartHistory: [],
      productDiscount: [],
      quickBooksAccount: [],
      quickBooksItem: [],
      quickBooksItemPriority: [],
      repairOrderSeverityOptions: [],
      repairOrderUrgencyOptions: [],
      repairRequestUrgency: [],
      metadata: {
        entityId,
        category: 'Configuration and Settings',
        totalRecords: 0,
        tableCount: 16,
        exportTimestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Load Employee Management Data (15 tables) - FULL processing
   */
  private async loadEmployeeManagementData(entityId: number): Promise<EmployeeManagementData> {
    console.log(`👥 Loading Employee Management data for entity ${entityId}...`);
    
    try {
      // Load all 15 employee management tables in parallel
      const [
        achievementHistory,
        entityLocationEntry,
        entityRoleEntry,
        eventHistory,
        filter,
        history,
        noteStatus,
        notificationConfiguration,
        notificationSettings,
        notificationStatus,
        reportFavorite,
        schedule,
        statisticEntry,
        timeStamp,
        timeStampActivity
      ] = await Promise.all([
        this.loadEntityEmployeeAchievementHistory(entityId),
        this.loadEntityEmployeeEntityLocationEntry(entityId),
        this.loadEntityEmployeeEntityRoleEntry(entityId),
        this.loadEntityEmployeeEventHistory(entityId),
        this.loadEntityEmployeeFilter(entityId),
        this.loadEntityEmployeeHistory(entityId),
        this.loadEntityEmployeeNoteStatus(entityId),
        this.loadEntityEmployeeNotificationConfiguration(entityId),
        this.loadEntityEmployeeNotificationSettings(entityId),
        this.loadEntityEmployeeNotificationStatus(entityId),
        this.loadEntityEmployeeReportFavorite(entityId),
        this.loadEntityEmployeeSchedule(entityId),
        this.loadEntityEmployeeStatisticEntry(entityId),
        this.loadEntityEmployeeTimeStamp(entityId),
        this.loadEntityEmployeeTimeStampActivity(entityId)
      ]);

      const totalRecords = achievementHistory.length + entityLocationEntry.length + entityRoleEntry.length +
                          eventHistory.length + filter.length + history.length + noteStatus.length +
                          notificationConfiguration.length + notificationSettings.length + notificationStatus.length +
                          reportFavorite.length + schedule.length + statisticEntry.length +
                          timeStamp.length + timeStampActivity.length;

      return {
        achievementHistory,
        entityLocationEntry,
        entityRoleEntry,
        eventHistory,
        filter,
        history,
        noteStatus,
        notificationConfiguration,
        notificationSettings,
        notificationStatus,
        reportFavorite,
        schedule,
        statisticEntry,
        timeStamp,
        timeStampActivity,
        metadata: {
          entityId,
          category: 'Employee Management',
          totalRecords,
          tableCount: 15,
          exportTimestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`❌ Error loading Employee Management data for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Load Location Management Data (10 tables)
   */
  private async loadLocationManagementData(entityId: number): Promise<LocationManagementData> {
    console.log(`📍 Loading Location Management data for entity ${entityId}...`);
    
    try {
      // Load all 10 location management tables in parallel
      const [
        apiConnection,
        apiIntegration,
        calendarEvent,
        calendarEventEntityEmployeeEntry,
        entityFeeEntry,
        history,
        notificationSettings,
        notificationStatus,
        quickBooksDesktopInformation,
        quickBooksInformation
      ] = await Promise.all([
        this.loadEntityLocationApiConnection(entityId),
        this.loadEntityLocationApiIntegration(entityId),
        this.loadEntityLocationCalendarEvent(entityId),
        this.loadEntityLocationCalendarEventEntityEmployeeEntry(entityId),
        this.loadEntityLocationEntityFeeEntry(entityId),
        this.loadEntityLocationHistory(entityId),
        this.loadEntityLocationNotificationSettings(entityId),
        this.loadEntityLocationNotificationStatus(entityId),
        this.loadEntityLocationQuickBooksDesktopInformation(entityId),
        this.loadEntityLocationQuickBooksInformation(entityId)
      ]);

      const totalRecords = apiConnection.length + apiIntegration.length + calendarEvent.length +
                          calendarEventEntityEmployeeEntry.length + entityFeeEntry.length + history.length +
                          notificationSettings.length + notificationStatus.length + quickBooksDesktopInformation.length +
                          quickBooksInformation.length;

      return {
        apiConnection,
        apiIntegration,
        calendarEvent,
        calendarEventEntityEmployeeEntry,
        entityFeeEntry,
        history,
        notificationSettings,
        notificationStatus,
        quickBooksDesktopInformation,
        quickBooksInformation,
        metadata: {
          entityId,
          category: 'Location Management',
          totalRecords,
          tableCount: 10,
          exportTimestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`❌ Error loading Location Management data for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Load Parts and Inventory Data (43 tables)
   */
  private async loadPartsInventoryData(entityId: number): Promise<PartsInventoryData> {
    console.log(`🔧 Loading Parts & Inventory data for entity ${entityId}...`);
    
    try {
      // Load all parts and inventory tables in parallel (simplified approach)
      const [
        parts,
        partCrossReference,
        partTableTag,
        partVendor,
        locationPart
      ] = await Promise.all([
        this.loadEntityParts(entityId),
        this.loadEntityPartCrossReference(entityId),
        this.loadEntityPartTableTag(entityId),
        this.loadEntityPartVendor(entityId),
        this.loadEntityLocationPart(entityId)
      ]);

      // For now, return empty arrays for the remaining complex parts tables
      // These will be implemented in subsequent phases
      const emptyArrays = {
        partVendorAddress: [],
        partVendorAddressHistory: [],
        partVendorBridgestoneProductLine: [],
        partVendorContact: [],
        partVendorContactHistory: [],
        partVendorCredit: [],
        partVendorCreditLine: [],
        partVendorEntityLocationEntry: [],
        partVendorHistory: [],
        partVendorInvoice: [],
        partVendorInvoiceEntityLocationPartOrderEntryEntry: [],
        partVendorInvoiceRepairOrderOrderVendorPartEntry: [],
        partVendorPayment: [],
        partVendorPaymentEntityPartVendorCreditEntry: [],
        partVendorPaymentEntityPartVendorInvoiceEntry: [],
        locationPartAdjustment: [],
        locationPartAdjustmentEntry: [],
        locationPartEntityLocationPartLocationEntry: [],
        locationPartHistory: [],
        locationPartIncoming: [],
        locationPartKit: [],
        locationPartKitEntry: [],
        locationPartLocation: [],
        locationPartOrder: [],
        locationPartOrderEntry: [],
        locationPartOrderEntryHistory: [],
        locationPartOrderHistory: [],
        locationPartOutgoing: [],
        locationPartOutgoingAdjustmentHistory: [],
        locationPartSerialized: [],
        locationPartSerializedSerial: [],
        locationPartSerializedTireDetail: [],
        locationPartSerializedTireDetailHeader: [],
        locationPartSerializedTireDetailNote: [],
        locationPartSerializedTireDetailRawMaterial: [],
        locationPartSerializedTireDetailRepairPart: [],
        locationPartTransfer: [],
        locationPartTransferEntry: []
      };

      const totalRecords = parts.length + partCrossReference.length + partTableTag.length + 
                          partVendor.length + locationPart.length;

      return {
        parts,
        partCrossReference,
        partTableTag,
        partVendor,
        locationPart,
        ...emptyArrays,
        metadata: {
          entityId,
          category: 'Parts and Inventory',
          totalRecords,
          tableCount: 43,
          exportTimestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`❌ Error loading Parts & Inventory data for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Load Financial and Billing Data (20 tables)
   */
  private async loadFinancialBillingData(entityId: number): Promise<FinancialBillingData> {
    console.log(`💰 Loading Financial & Billing data for entity ${entityId}...`);
    
    try {
      // Load all financial tables in parallel for better performance
      const [
        fee, 
        invoice,
        laborRate,
        paymentMethod,
        creditTerm,
        taxLocation,
        distanceRate,
        feeHistory,
        feePaymentMethod,
        invoiceRow,
        laborRateHistory,
        partsMarkUp,
        partsMarkUpMatrix,
        partsMarkUpScale,
        outsideServicesRate,
        outsideServicesRateScale,
        suppliesRate,
        taxLocationEntityLocationEntry,
        taxLocationEntry,
        taxLocationQuickBooksItemTaxability
      ] = await Promise.all([
        this.loadEntityFees(entityId),
        this.loadEntityInvoices(entityId),
        this.loadEntityLaborRate(entityId),
        this.loadEntityPaymentMethod(entityId),
        this.loadEntityCreditTerm(entityId),
        this.loadEntityTaxLocation(entityId),
        this.loadEntityDistanceRate(entityId),
        this.loadEntityFeeHistory(entityId),
        this.loadEntityFeePaymentMethod(entityId),
        this.loadEntityInvoiceRow(entityId),
        this.loadEntityLaborRateHistory(entityId),
        this.loadEntityPartsMarkUp(entityId),
        this.loadEntityPartsMarkUpMatrix(entityId),
        this.loadEntityPartsMarkUpScale(entityId),
        this.loadEntityOutsideServicesRate(entityId),
        this.loadEntityOutsideServicesRateScale(entityId),
        this.loadEntitySuppliesRate(entityId),
        this.loadEntityTaxLocationEntityLocationEntry(entityId),
        this.loadEntityTaxLocationEntry(entityId),
        this.loadEntityTaxLocationQuickBooksItemTaxability(entityId)
      ]);

      const totalRecords = fee.length + invoice.length + laborRate.length + paymentMethod.length + 
                          creditTerm.length + taxLocation.length + distanceRate.length +
                          feeHistory.length + feePaymentMethod.length + invoiceRow.length +
                          laborRateHistory.length + partsMarkUp.length + partsMarkUpMatrix.length +
                          partsMarkUpScale.length + outsideServicesRate.length + outsideServicesRateScale.length +
                          suppliesRate.length + taxLocationEntityLocationEntry.length + taxLocationEntry.length +
                          taxLocationQuickBooksItemTaxability.length;

      console.log(`   ✓ Loaded ${totalRecords} total financial records across 20 tables`);

      return {
        fee,
        invoice,
        laborRate,
        paymentMethod,
        creditTerm,
        taxLocation,
        distanceRate,
        feeHistory,
        feePaymentMethod,
        invoiceRow,
        laborRateHistory,
        taxLocationEntityLocationEntry,
        taxLocationEntry,
        taxLocationQuickBooksItemTaxability,
        partsMarkUp,
        partsMarkUpMatrix,
        partsMarkUpScale,
        outsideServicesRate,
        outsideServicesRateScale,
        suppliesRate,
        metadata: {
          entityId,
          category: 'Financial and Billing',
          totalRecords,
          tableCount: 20,
          exportTimestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`❌ Error loading Financial & Billing data for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Load Service and Component Data (16 tables)
   */
  private async loadServiceComponentData(entityId: number): Promise<ServiceComponentData> {
    console.log(`⚙️ Loading Services & Components data for entity ${entityId}...`);
    
    try {
      // Load key service and component tables
      const [
        component,
        componentField,
        componentSystem,
        unitType
      ] = await Promise.all([
        this.loadEntityComponents(entityId),
        this.loadEntityComponentField(entityId),
        this.loadEntityComponentSystem(entityId),
        this.loadEntityUnitType(entityId)
      ]);

      // Return empty arrays for complex component tables (to be implemented later)
      const emptyArrays = {
        componentFieldResponse: [],
        componentSystemCorrection: [],
        componentSystemCorrectionChecklist: [],
        componentSystemCorrectionEntityComponentFieldEntry: [],
        componentSystemCorrectionKit: [],
        componentSystemCorrectionKitEntry: [],
        componentSystemCorrectionPart: [],
        componentSystemCorrectionUsage: [],
        componentSystemEntityComponentFieldEntry: [],
        unitTypeEntityComponentEntry: [],
        unitTypeEntityComponentSystemEntry: [],
        unitTypeEntityComponentSystemCorrectionEntry: []
      };

      const totalRecords = component.length + componentField.length + componentSystem.length + unitType.length;

      return {
        component,
        componentField,
        componentSystem,
        unitType,
        ...emptyArrays,
        metadata: {
          entityId,
          category: 'Service and Component',
          totalRecords,
          tableCount: 16,
          exportTimestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`❌ Error loading Services & Components data for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Load Configuration and Settings Data (16 tables)
   */
  private async loadConfigurationSettingsData(entityId: number): Promise<ConfigurationSettingsData> {
    console.log(`🔧 Loading Configuration & Settings data for entity ${entityId}...`);
    
    try {
      // Load key configuration tables
      const [
        information,
        department,
        note,
        manufacturer,
        quickBooksAccount,
        quickBooksItem
      ] = await Promise.all([
        this.loadEntityInformation(entityId),
        this.loadEntityDepartments(entityId),
        this.loadEntityNotes(entityId),
        this.loadEntityManufacturer(entityId),
        this.loadEntityQuickBooksAccount(entityId),
        this.loadEntityQuickBooksItem(entityId)
      ]);

      // Return empty arrays for complex configuration tables (to be implemented later)
      const emptyArrays = {
        roleHistory: [],
        rolePermissionEntry: [],
        termsOfService: [],
        priceFilePart: [],
        priceFilePartHistory: [],
        productDiscount: [],
        quickBooksItemPriority: [],
        repairOrderSeverityOptions: [],
        repairOrderUrgencyOptions: [],
        repairRequestUrgency: []
      };

      const totalRecords = information.length + department.length + manufacturer.length + note.length +
                          quickBooksAccount.length + quickBooksItem.length;

      return {
        information,
        department,
        manufacturer,
        note,
        quickBooksAccount,
        quickBooksItem,
        ...emptyArrays,
        metadata: {
          entityId,
          category: 'Configuration and Settings',
          totalRecords,
          tableCount: 16,
          exportTimestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`❌ Error loading Configuration & Settings data for entity ${entityId}:`, error);
      throw error;
    }
  }

  // ===== EMPLOYEE MANAGEMENT TABLE LOADING METHODS (15 methods) =====

  private async loadEntityEmployeeAchievementHistory(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeAchievementHistory[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeAchievementHistory>(
        `SELECT eah.* FROM EntityEmployeeAchievementHistory eah 
         JOIN EntityEmployee ee ON eah.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeAchievementHistory for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeEntityLocationEntry(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeEntityLocationEntry[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeEntityLocationEntry>(
        `SELECT eele.* FROM EntityEmployeeEntityLocationEntry eele 
         JOIN EntityEmployee ee ON eele.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeEntityLocationEntry for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeEntityRoleEntry(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeEntityRoleEntry[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeEntityRoleEntry>(
        `SELECT eere.* FROM EntityEmployeeEntityRoleEntry eere 
         JOIN EntityEmployee ee ON eere.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeEntityRoleEntry for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeEventHistory(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeEventHistory[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeEventHistory>(
        `SELECT eeh.* FROM EntityEmployeeEventHistory eeh 
         JOIN EntityEmployee ee ON eeh.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeEventHistory for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeFilter(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeFilter[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeFilter>(
        `SELECT eef.* FROM EntityEmployeeFilter eef 
         JOIN EntityEmployee ee ON eef.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeFilter for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeHistory(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeHistory[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeHistory>(
        `SELECT eeh.* FROM EntityEmployeeHistory eeh 
         JOIN EntityEmployee ee ON eeh.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeHistory for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeNoteStatus(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeNoteStatus[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeNoteStatus>(
        `SELECT eens.* FROM EntityEmployeeNoteStatus eens 
         JOIN EntityEmployee ee ON eens.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeNoteStatus for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeNotificationConfiguration(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeNotificationConfiguration[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeNotificationConfiguration>(
        `SELECT eenc.* FROM EntityEmployeeNotificationConfiguration eenc 
         JOIN EntityEmployee ee ON eenc.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeNotificationConfiguration for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeNotificationSettings(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeNotificationSettings[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeNotificationSettings>(
        `SELECT eens.* FROM EntityEmployeeNotificationSettings eens 
         JOIN EntityEmployee ee ON eens.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeNotificationSettings for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeNotificationStatus(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeNotificationStatus[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeNotificationStatus>(
        `SELECT eens.* FROM EntityEmployeeNotificationStatus eens 
         JOIN EntityEmployee ee ON eens.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeNotificationStatus for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeReportFavorite(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeReportFavorite[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeReportFavorite>(
        `SELECT eerf.* FROM EntityEmployeeReportFavorite eerf 
         JOIN EntityEmployee ee ON eerf.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeReportFavorite for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeSchedule(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeSchedule[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeSchedule>(
        `SELECT ees.* FROM EntityEmployeeSchedule ees 
         JOIN EntityEmployee ee ON ees.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeSchedule for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeStatisticEntry(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeStatisticEntry[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeStatisticEntry>(
        `SELECT eese.* FROM EntityEmployeeStatisticEntry eese 
         JOIN EntityEmployee ee ON eese.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeStatisticEntry for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeTimeStamp(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeTimeStamp[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeTimeStamp>(
        `SELECT eets.* FROM EntityEmployeeTimeStamp eets 
         JOIN EntityEmployee ee ON eets.entityEmployeeId = ee.entityEmployeeId 
         WHERE ee.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeTimeStamp for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityEmployeeTimeStampActivity(entityId: number): Promise<import('../types/EntityTableTypes').EntityEmployeeTimeStampActivity[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityEmployeeTimeStampActivity>(
        'SELECT * FROM EntityEmployeeTimeStampActivity WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityEmployeeTimeStampActivity for entity ${entityId}:`, error);
      return [];
    }
  }

  // ===== LOCATION MANAGEMENT TABLE LOADING METHODS (10 methods) =====

  private async loadEntityLocationApiConnection(entityId: number): Promise<import('../types/EntityTableTypes').EntityLocationApiConnection[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityLocationApiConnection>(
        `SELECT elac.* FROM EntityLocationApiConnection elac 
         JOIN EntityLocation el ON elac.entityLocationId = el.entityLocationId 
         WHERE el.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLocationApiConnection for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityLocationApiIntegration(entityId: number): Promise<import('../types/EntityTableTypes').EntityLocationApiIntegration[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityLocationApiIntegration>(
        `SELECT elai.* FROM EntityLocationApiIntegration elai 
         JOIN EntityLocation el ON elai.entityLocationId = el.entityLocationId 
         WHERE el.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLocationApiIntegration for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityLocationCalendarEvent(entityId: number): Promise<import('../types/EntityTableTypes').EntityLocationCalendarEvent[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityLocationCalendarEvent>(
        `SELECT elce.* FROM EntityLocationCalendarEvent elce 
         JOIN EntityLocation el ON elce.entityLocationId = el.entityLocationId 
         WHERE el.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLocationCalendarEvent for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityLocationCalendarEventEntityEmployeeEntry(entityId: number): Promise<import('../types/EntityTableTypes').EntityLocationCalendarEventEntityEmployeeEntry[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityLocationCalendarEventEntityEmployeeEntry>(
        `SELECT elceee.* FROM EntityLocationCalendarEventEntityEmployeeEntry elceee 
         JOIN EntityLocationCalendarEvent elce ON elceee.entityLocationCalendarEventId = elce.entityLocationCalendarEventId
         JOIN EntityLocation el ON elce.entityLocationId = el.entityLocationId 
         WHERE el.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLocationCalendarEventEntityEmployeeEntry for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityLocationEntityFeeEntry(entityId: number): Promise<import('../types/EntityTableTypes').EntityLocationEntityFeeEntry[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityLocationEntityFeeEntry>(
        `SELECT elefe.* FROM EntityLocationEntityFeeEntry elefe 
         JOIN EntityLocation el ON elefe.entityLocationId = el.entityLocationId 
         WHERE el.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLocationEntityFeeEntry for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityLocationHistory(entityId: number): Promise<import('../types/EntityTableTypes').EntityLocationHistory[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityLocationHistory>(
        `SELECT elh.* FROM EntityLocationHistory elh 
         JOIN EntityLocation el ON elh.entityLocationId = el.entityLocationId 
         WHERE el.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLocationHistory for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityLocationNotificationSettings(entityId: number): Promise<import('../types/EntityTableTypes').EntityLocationNotificationSettings[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityLocationNotificationSettings>(
        `SELECT elns.* FROM EntityLocationNotificationSettings elns 
         JOIN EntityLocation el ON elns.entityLocationId = el.entityLocationId 
         WHERE el.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLocationNotificationSettings for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityLocationNotificationStatus(entityId: number): Promise<import('../types/EntityTableTypes').EntityLocationNotificationStatus[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityLocationNotificationStatus>(
        `SELECT elns.* FROM EntityLocationNotificationStatus elns 
         JOIN EntityLocation el ON elns.entityLocationId = el.entityLocationId 
         WHERE el.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLocationNotificationStatus for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityLocationQuickBooksDesktopInformation(entityId: number): Promise<import('../types/EntityTableTypes').EntityLocationQuickBooksDesktopInformation[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityLocationQuickBooksDesktopInformation>(
        `SELECT elqbdi.* FROM EntityLocationQuickBooksDesktopInformation elqbdi 
         JOIN EntityLocation el ON elqbdi.entityLocationId = el.entityLocationId 
         WHERE el.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLocationQuickBooksDesktopInformation for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityLocationQuickBooksInformation(entityId: number): Promise<import('../types/EntityTableTypes').EntityLocationQuickBooksInformation[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityLocationQuickBooksInformation>(
        `SELECT elqbi.* FROM EntityLocationQuickBooksInformation elqbi 
         JOIN EntityLocation el ON elqbi.entityLocationId = el.entityLocationId 
         WHERE el.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLocationQuickBooksInformation for entity ${entityId}:`, error);
      return [];
    }
  }

  // ===== PARTS & INVENTORY TABLE LOADING METHODS (Key tables) =====

  private async loadEntityPartCrossReference(entityId: number): Promise<import('../types/EntityTableTypes').EntityPartCrossReference[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityPartCrossReference>(
        'SELECT * FROM EntityPartCrossReference WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityPartCrossReference for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityPartTableTag(entityId: number): Promise<import('../types/EntityTableTypes').EntityPartTableTag[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityPartTableTag>(
        `SELECT eptt.* FROM EntityPartTableTag eptt 
         JOIN EntityPart ep ON eptt.entityPartId = ep.entityPartId 
         WHERE ep.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityPartTableTag for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityPartVendor(entityId: number): Promise<import('../types/EntityTableTypes').EntityPartVendor[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityPartVendor>(
        'SELECT * FROM EntityPartVendor WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityPartVendor for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityLocationPart(entityId: number): Promise<import('../types/DatabaseTypes').EntityLocationPart[]> {
    try {
      return await this.dataReader.query<import('../types/DatabaseTypes').EntityLocationPart>(
        `SELECT elp.* FROM EntityLocationPart elp 
         JOIN EntityLocation el ON elp.entityLocationId = el.entityLocationId 
         WHERE el.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLocationPart for entity ${entityId}:`, error);
      return [];
    }
  }

  // ===== FINANCIAL & BILLING TABLE LOADING METHODS (Key tables) =====

  private async loadEntityLaborRate(entityId: number): Promise<import('../types/EntityTableTypes').EntityLaborRate[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityLaborRate>(
        'SELECT * FROM EntityLaborRate WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLaborRate for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityPaymentMethod(entityId: number): Promise<import('../types/EntityTableTypes').EntityPaymentMethod[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityPaymentMethod>(
        'SELECT * FROM EntityPaymentMethod WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityPaymentMethod for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityCreditTerm(entityId: number): Promise<import('../types/EntityTableTypes').EntityCreditTerm[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityCreditTerm>(
        'SELECT * FROM EntityCreditTerm WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityCreditTerm for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityTaxLocation(entityId: number): Promise<import('../types/EntityTableTypes').EntityTaxLocation[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityTaxLocation>(
        'SELECT * FROM EntityTaxLocation WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityTaxLocation for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityDistanceRate(entityId: number): Promise<import('../types/EntityTableTypes').EntityDistanceRate[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityDistanceRate>(
        'SELECT * FROM EntityDistanceRate WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityDistanceRate for entity ${entityId}:`, error);
      return [];
    }
  }

  // Additional Financial Tables
  
  private async loadEntityFeeHistory(entityId: number): Promise<import('../types/EntityTableTypes').EntityFeeHistory[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityFeeHistory>(
        'SELECT * FROM EntityFeeHistory WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityFeeHistory for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityFeePaymentMethod(entityId: number): Promise<import('../types/EntityTableTypes').EntityFeePaymentMethod[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityFeePaymentMethod>(
        `SELECT efpm.* FROM EntityFeePaymentMethod efpm 
         JOIN EntityFee ef ON efpm.entityFeeId = ef.entityFeeId 
         WHERE ef.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityFeePaymentMethod for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityInvoiceRow(entityId: number): Promise<import('../types/EntityTableTypes').EntityInvoiceRow[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityInvoiceRow>(
        `SELECT eir.* FROM EntityInvoiceRow eir 
         JOIN EntityInvoice ei ON eir.entityInvoiceId = ei.entityInvoiceId 
         WHERE ei.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityInvoiceRow for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityLaborRateHistory(entityId: number): Promise<import('../types/EntityTableTypes').EntityLaborRateHistory[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityLaborRateHistory>(
        'SELECT * FROM EntityLaborRateHistory WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityLaborRateHistory for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityPartsMarkUp(entityId: number): Promise<import('../types/EntityTableTypes').EntityPartsMarkUp[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityPartsMarkUp>(
        'SELECT * FROM EntityPartsMarkUp WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityPartsMarkUp for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityPartsMarkUpMatrix(entityId: number): Promise<import('../types/EntityTableTypes').EntityPartsMarkUpMatrix[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityPartsMarkUpMatrix>(
        `SELECT epmm.* FROM EntityPartsMarkUpMatrix epmm 
         JOIN EntityPartsMarkUp epm ON epmm.entityPartsMarkUpId = epm.entityPartsMarkUpId 
         WHERE epm.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityPartsMarkUpMatrix for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityPartsMarkUpScale(entityId: number): Promise<import('../types/EntityTableTypes').EntityPartsMarkUpScale[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityPartsMarkUpScale>(
        `SELECT epms.* FROM EntityPartsMarkUpScale epms 
         JOIN EntityPartsMarkUp epm ON epms.entityPartsMarkUpId = epm.entityPartsMarkUpId 
         WHERE epm.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityPartsMarkUpScale for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityOutsideServicesRate(entityId: number): Promise<import('../types/EntityTableTypes').EntityOutsideServicesRate[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityOutsideServicesRate>(
        'SELECT * FROM EntityOutsideServicesRate WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityOutsideServicesRate for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityOutsideServicesRateScale(entityId: number): Promise<import('../types/EntityTableTypes').EntityOutsideServicesRateScale[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityOutsideServicesRateScale>(
        `SELECT eosrs.* FROM EntityOutsideServicesRateScale eosrs 
         JOIN EntityOutsideServicesRate eosr ON eosrs.entityOutsideServicesRateId = eosr.entityOutsideServicesRateId 
         WHERE eosr.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityOutsideServicesRateScale for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntitySuppliesRate(entityId: number): Promise<import('../types/EntityTableTypes').EntitySuppliesRate[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntitySuppliesRate>(
        'SELECT * FROM EntitySuppliesRate WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntitySuppliesRate for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityTaxLocationEntityLocationEntry(entityId: number): Promise<import('../types/EntityTableTypes').EntityTaxLocationEntityLocationEntry[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityTaxLocationEntityLocationEntry>(
        `SELECT etlele.* FROM EntityTaxLocationEntityLocationEntry etlele 
         JOIN EntityTaxLocation etl ON etlele.entityTaxLocationId = etl.entityTaxLocationId 
         WHERE etl.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityTaxLocationEntityLocationEntry for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityTaxLocationEntry(entityId: number): Promise<import('../types/EntityTableTypes').EntityTaxLocationEntry[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityTaxLocationEntry>(
        `SELECT etle.* FROM EntityTaxLocationEntry etle 
         JOIN EntityTaxLocation etl ON etle.entityTaxLocationId = etl.entityTaxLocationId 
         WHERE etl.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityTaxLocationEntry for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityTaxLocationQuickBooksItemTaxability(entityId: number): Promise<import('../types/EntityTableTypes').EntityTaxLocationQuickBooksItemTaxability[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityTaxLocationQuickBooksItemTaxability>(
        `SELECT etlqbit.* FROM EntityTaxLocationQuickBooksItemTaxability etlqbit 
         JOIN EntityTaxLocation etl ON etlqbit.entityTaxLocationId = etl.entityTaxLocationId 
         WHERE etl.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityTaxLocationQuickBooksItemTaxability for entity ${entityId}:`, error);
      return [];
    }
  }

  // ===== SERVICE & COMPONENT TABLE LOADING METHODS (Key tables) =====

  private async loadEntityComponentField(entityId: number): Promise<import('../types/EntityTableTypes').EntityComponentField[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityComponentField>(
        `SELECT ecf.* FROM EntityComponentField ecf 
         JOIN EntityComponent ec ON ecf.entityComponentId = ec.entityComponentId 
         WHERE ec.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityComponentField for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityComponentSystem(entityId: number): Promise<import('../types/EntityTableTypes').EntityComponentSystem[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityComponentSystem>(
        `SELECT ecs.* FROM EntityComponentSystem ecs 
         JOIN EntityComponent ec ON ecs.entityComponentId = ec.entityComponentId 
         WHERE ec.entityId = ?`,
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityComponentSystem for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityUnitType(entityId: number): Promise<import('../types/EntityTableTypes').EntityUnitType[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityUnitType>(
        'SELECT * FROM EntityUnitType WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityUnitType for entity ${entityId}:`, error);
      return [];
    }
  }

  // ===== CONFIGURATION & SETTINGS TABLE LOADING METHODS (Key tables) =====

  private async loadEntityManufacturer(entityId: number): Promise<EntityManufacturer[]> {
    try {
      return await this.dataReader.query<EntityManufacturer>(
        'SELECT * FROM EntityManufacturer WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityManufacturer for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityQuickBooksAccount(entityId: number): Promise<import('../types/EntityTableTypes').EntityQuickBooksAccount[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityQuickBooksAccount>(
        'SELECT * FROM EntityQuickBooksAccount WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityQuickBooksAccount for entity ${entityId}:`, error);
      return [];
    }
  }

  private async loadEntityQuickBooksItem(entityId: number): Promise<import('../types/EntityTableTypes').EntityQuickBooksItem[]> {
    try {
      return await this.dataReader.query<import('../types/EntityTableTypes').EntityQuickBooksItem>(
        'SELECT * FROM EntityQuickBooksItem WHERE entityId = ?',
        [entityId]
      );
    } catch (error) {
      console.warn(`⚠️ Failed to load EntityQuickBooksItem for entity ${entityId}:`, error);
      return [];
    }
  }
}
