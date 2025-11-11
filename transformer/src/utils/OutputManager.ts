import * as fs from 'fs-extra';
import * as path from 'path';
import { AllEntityCategoriesData } from '../types/DatabaseTypes';

export interface OutputOptions {
  baseOutputDir: string;
  prettyJson?: boolean;
}

export class OutputManager {
  private baseOutputDir: string;
  private prettyJson: boolean;
  private entitySummaries: Map<string, any> = new Map();
  private customerSummaries: Map<string, Map<string, any>> = new Map();
  private unitSummaries: Map<string, Map<string, Map<string, any>>> = new Map();
  private serviceOrderSummaries: Map<string, Map<string, Map<string, Map<string, any>>>> = new Map();
  private simpleShopEntities: Set<number> = new Set(); // Simple Shop entities for advanced processing
  private entityBasicStatistics: Map<string, { customers: number; units: number; serviceOrders: number }> = new Map(); // Basic statistics for entities
  private autoCareStats: Map<string, any> = new Map(); // entityId -> AutoCare statistics
  constructor(options: OutputOptions) {
    this.baseOutputDir = options.baseOutputDir;
    this.prettyJson = options.prettyJson ?? true;
  }

  /**
   * Set Simple Shop entities (called by EntityProcessor after identification)
   */
  setSimpleShopEntities(simpleShopEntities: Set<number>): void {
    this.simpleShopEntities = simpleShopEntities;
    console.log(`📊 OutputManager: Received ${this.simpleShopEntities.size} Simple Shop entities for advanced processing`);
  }

  /**
   * Set AutoCare statistics for an entity
   * @deprecated AutoCare statistics are now written directly to entity.json files when generated.
   * This method is kept for backward compatibility but should not be used in new code.
   */
  setAutoCareStats(entityId: string, stats: any): void {
    this.autoCareStats.set(entityId, stats);
  }

  /**
   * Get AutoCare statistics for an entity
   * @deprecated AutoCare statistics are now written directly to entity.json files when generated.
   * This method is kept for backward compatibility but should not be used in new code.
   */
  getAutoCareStats(entityId: string): any {
    return this.autoCareStats.get(entityId);
  }

  /**
   * Get Simple Shop entities
   */
  getSimpleShopEntities(): Set<number> {
    return this.simpleShopEntities;
  }

  /**
   * Add basic statistics for an entity (used for basic processing)
   */
  addEntityBasicStatistics(entityId: string, stats: { customers: number; units: number; serviceOrders: number }): void {
    this.entityBasicStatistics.set(entityId, stats);
    console.log(`📊 Added basic statistics for entity ${entityId}: ${stats.customers} customers, ${stats.units} units, ${stats.serviceOrders} service orders`);
  }

  /**
   * Initialize the output directory structure
   */
  async initialize(rewrite: boolean = false): Promise<void> {
    if (rewrite) {
      // Clear output directory if it exists
      if (await fs.pathExists(this.baseOutputDir)) {
        try {
          await fs.emptyDir(this.baseOutputDir);
          console.log(`🗑️  Cleared output directory: ${this.baseOutputDir}`);
        } catch (error: any) {
          if (error.code === 'EPERM' || error.code === 'EBUSY') {
            console.log(`⚠️  Warning: Could not clear some files in output directory (${error.code}): ${error.path || this.baseOutputDir}`);
            console.log(`🔄 Attempting to remove directory and recreate...`);
            try {
              await fs.remove(this.baseOutputDir);
              console.log(`🗑️  Removed output directory: ${this.baseOutputDir}`);
            } catch (removeError: any) {
              console.log(`⚠️  Warning: Could not remove output directory completely. Continuing with existing directory.`);
              console.log(`💡 Some files may remain from previous runs.`);
            }
          } else {
            throw error;
          }
        }
      }
    } else {
      console.log(`📁 Using existing output directory: ${this.baseOutputDir}`);
    }
    
    await fs.ensureDir(this.baseOutputDir);
    console.log(`📁 Initialized output directory: ${this.baseOutputDir}`);
  }

  /**
   * Create a company (shop) directory using entityId
   */
  async createShopDirectory(entityId: string): Promise<string> {
    const shopDir = path.join(this.baseOutputDir, entityId);
    
    await fs.ensureDir(shopDir);
    
    // Initialize entity summary if not exists
    if (!this.entitySummaries.has(entityId)) {
      this.entitySummaries.set(entityId, {
        entityId: entityId,
        type: "entity",
        description: `Entity directory for entityId ${entityId}`,
        structure: "customers/",
        subdirectories: [],
        summary: {
          totalCustomers: 0,
          totalUnits: 0,
          totalServiceOrders: 0,
          lastActivity: null
        },
        lastUpdated: new Date().toISOString()
      });
    }

    return shopDir;
  }

  /**
   * Create a customer directory under a shop using pure IDs
   */
  async createCustomerDirectory(entityId: string, customerId: string): Promise<string> {
    const customerDir = path.join(this.baseOutputDir, entityId, 'customers', customerId);
    
    await fs.ensureDir(customerDir);
    
    // Initialize customer summaries map for entity if not exists
    if (!this.customerSummaries.has(entityId)) {
      this.customerSummaries.set(entityId, new Map());
    }
    
    // Initialize customer summary if not exists
    const entityCustomers = this.customerSummaries.get(entityId)!;
    if (!entityCustomers.has(customerId)) {
      entityCustomers.set(customerId, {
        customerId: customerId,
        type: "customer",
        description: `Customer directory for customerId ${customerId}`,
        structure: "units/",
        units: [],
        summary: {
          totalUnits: 0,
          totalServiceOrders: 0,
          lastActivity: null
        },
        lastUpdated: new Date().toISOString()
      });
    }

    return customerDir;
  }

  /**
   * Create a unit directory under a customer using pure IDs
   */
  async createUnitDirectory(entityId: string, customerId: string, unitId: string): Promise<string> {
    const unitDir = path.join(this.baseOutputDir, entityId, 'customers', customerId, 'units', unitId);
    
    await fs.ensureDir(unitDir);
    
    // Initialize unit summaries map for entity if not exists
    if (!this.unitSummaries.has(entityId)) {
      this.unitSummaries.set(entityId, new Map());
    }
    
    // Initialize customer units map if not exists
    const entityUnits = this.unitSummaries.get(entityId)!;
    if (!entityUnits.has(customerId)) {
      entityUnits.set(customerId, new Map());
    }
    
    // Initialize unit summary if not exists
    const customerUnits = entityUnits.get(customerId)!;
    if (!customerUnits.has(unitId)) {
      customerUnits.set(unitId, {
        customerUnitId: unitId,
        type: "unit",
        description: `Unit directory for customerUnitId ${unitId}`,
        structure: "service-orders/",
        serviceOrders: [],
        summary: {
          totalServiceOrders: 0,
          lastActivity: null
        },
        lastUpdated: new Date().toISOString()
      });
    }

    return unitDir;
  }

  /**
   * Write JSON data to file
   */
  async writeJson(filePath: string, data: any): Promise<void> {
    const fullPath = path.join(this.baseOutputDir, filePath);
    const dir = path.dirname(fullPath);
    
    await fs.ensureDir(dir);
    
    // Custom replacer to handle BigInt serialization
    const bigIntReplacer = (key: string, value: any) => {
      if (typeof value === 'bigint') {
        // Convert BigInt to number if within safe integer range, otherwise to string
        return value <= Number.MAX_SAFE_INTEGER ? Number(value) : value.toString();
      }
      return value;
    };

    const jsonString = this.prettyJson 
      ? JSON.stringify(data, bigIntReplacer, 2)
      : JSON.stringify(data, bigIntReplacer);

    // Skip write if unchanged to reduce IO
    try {
      if (await fs.pathExists(fullPath)) {
        const existing = await fs.readFile(fullPath, 'utf8');
        if (existing === jsonString) {
          // Optional: keep mtime; do nothing
          // console.log(`⏭️  Skipped unchanged file: ${fullPath}`);
          return;
        }
      }
    } catch {}

    await fs.writeFile(fullPath, jsonString, 'utf8');
  }

  /**
   * Write entity JSON file (with Simple Shop data if available) - LEGACY
   */
  async writeEntityJson(entityId: string, data: any): Promise<void> {
    // Check if this entity has advanced Simple Shop data in summary
    const entitySummary = this.entitySummaries.get(entityId);
    if (entitySummary && entitySummary.isAdvancedSimpleShop) {
      // Add advanced Simple Shop data to the entity data before writing
      data.accounting = entitySummary.accounting;
      data.units = entitySummary.units;
    }
    
    // Add AutoCare statistics if available
    const autoCareStats = this.autoCareStats.get(entityId);
    if (autoCareStats) {
      data.autoCare = autoCareStats;
    }
    
    await this.writeJson(`${entityId}/entity.json`, data);
  }

  /**
   * NEW: Write all 7 entity category files (126 tables organized by category)
   */
  async writeEntityCategoryFiles(entityId: string, allCategoriesData: AllEntityCategoriesData): Promise<void> {
    console.log(`📁 Writing 7 entity category files for entity ${entityId}...`);
    
    try {
      // Write all 7 category files in parallel
      await Promise.all([
        this.writeJson(`${entityId}/entity.json`, allCategoriesData.coreData),
        this.writeJson(`${entityId}/employees.json`, allCategoriesData.employeeData),
        this.writeJson(`${entityId}/locations.json`, allCategoriesData.locationData),
        this.writeJson(`${entityId}/parts.json`, allCategoriesData.partsData),
        this.writeJson(`${entityId}/financial.json`, allCategoriesData.financialData),
        this.writeJson(`${entityId}/services.json`, allCategoriesData.servicesData),
        this.writeJson(`${entityId}/settings.json`, allCategoriesData.settingsData)
      ]);

      console.log(`✅ Successfully wrote all 7 category files for entity ${entityId}:`);
      console.log(`   📊 entity.json - Core Business (${allCategoriesData.coreData.metadata.totalRecords} records)`);
      console.log(`   👥 employees.json - Employee Management (${allCategoriesData.employeeData.metadata.totalRecords} records)`);
      console.log(`   📍 locations.json - Location Management (${allCategoriesData.locationData.metadata.totalRecords} records)`);
      console.log(`   🔧 parts.json - Parts & Inventory (${allCategoriesData.partsData.metadata.totalRecords} records)`);
      console.log(`   💰 financial.json - Financial & Billing (${allCategoriesData.financialData.metadata.totalRecords} records)`);
      console.log(`   ⚙️  services.json - Services & Components (${allCategoriesData.servicesData.metadata.totalRecords} records)`);
      console.log(`   🔧 settings.json - Configuration & Settings (${allCategoriesData.settingsData.metadata.totalRecords} records)`);

      // Calculate total records across all categories
      const totalRecords = allCategoriesData.coreData.metadata.totalRecords +
                          allCategoriesData.employeeData.metadata.totalRecords +
                          allCategoriesData.locationData.metadata.totalRecords +
                          allCategoriesData.partsData.metadata.totalRecords +
                          allCategoriesData.financialData.metadata.totalRecords +
                          allCategoriesData.servicesData.metadata.totalRecords +
                          allCategoriesData.settingsData.metadata.totalRecords;

      console.log(`   🎯 TOTAL: ${totalRecords} records across 126 tables in 7 files`);

    } catch (error) {
      console.error(`❌ Error writing entity category files for entity ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Write customer JSON file
   */
  async writeCustomerJson(entityId: string, customerId: string, data: any): Promise<void> {
    await this.writeJson(`${entityId}/customers/${customerId}/entity.json`, data);
  }

  /**
   * Write unit JSON file
   */
  async writeUnitJson(entityId: string, customerId: string, unitId: string, data: any): Promise<void> {
    await this.writeJson(`${entityId}/customers/${customerId}/units/${unitId}/entity.json`, data);
  }

  /**
   * Write service order JSON file under a unit
   */
  async writeServiceOrderJson(entityId: string, customerId: string, unitId: string, serviceOrderId: string, data: any): Promise<void> {
    // Ensure service-orders directory exists
    const serviceOrdersDir = path.join(this.baseOutputDir, entityId, 'customers', customerId, 'units', unitId, 'service-orders');
    await fs.ensureDir(serviceOrdersDir);
    
    // Write the service order entity.json file
    await this.writeJson(`${entityId}/customers/${customerId}/units/${unitId}/service-orders/${serviceOrderId}/entity.json`, data);
  }

  /**
   * Update entity data and summary information
   */
  updateEntityData(entityId: string, entityData: any): void {
    const summary = this.entitySummaries.get(entityId);
    if (summary) {
      // Update with actual entity data
      Object.assign(summary, {
        ...summary,
        title: entityData.title || entityData.name || `Entity ${entityId}`,
        legalName: entityData.legalName || entityData.title || entityData.name,
        status: entityData.status || (entityData.active ? 'Active' : 'Inactive'),
        phone: entityData.phone,
        email: entityData.email,
        website: entityData.website,
        businessType: entityData.businessType || 'Repair Shop',
        created: entityData.created,
        lastUpdated: new Date().toISOString(),
        // 🆕 Add Simple Shop related fields
        isSimpleShop: entityData.isSimpleShop || false,
        locationCount: entityData.locationCount || 0,
        employeeCount: entityData.employeeCount || 0,
        locationNames: entityData.locationNames || [],
        employeeNames: entityData.employeeNames || []
      });
    }
  }

  /**
   * Update customer data and summary information
   */
  updateCustomerData(entityId: string, customerId: string, customerData: any): void {
    const entityCustomers = this.customerSummaries.get(entityId);
    if (entityCustomers) {
      const summary = entityCustomers.get(customerId);
      if (summary) {
        Object.assign(summary, {
          ...summary,
          title: customerData.title || customerData.name || `Customer ${customerId}`,
          legalName: customerData.legalName || customerData.title || customerData.name,
          phone: customerData.phone,
          active: customerData.active || 1,
          status: customerData.status || 'Confirmed',
          lastUpdated: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Update unit data and summary information
   */
  updateUnitData(entityId: string, customerId: string, unitId: string, unitData: any): void {
    const entityUnits = this.unitSummaries.get(entityId);
    if (entityUnits) {
      const customerUnits = entityUnits.get(customerId);
      if (customerUnits) {
        const summary = customerUnits.get(unitId);
        if (summary) {
          Object.assign(summary, {
            ...summary,
            number: unitData.number,
            fleetNumber: unitData.fleetNumber,
            title: unitData.title || `Unit ${unitId}`,
            licensePlate: unitData.licensePlate,
            make: unitData.make,
            model: unitData.model,
            year: unitData.year,
            active: unitData.active || 1,
            status: unitData.status || 'Confirmed',
            lastUpdated: new Date().toISOString()
          });
        }
      }
    }
  }

  /**
   * Add service order to unit summary
   */
  addServiceOrderToUnit(entityId: string, customerId: string, unitId: string, serviceOrderId: string, serviceOrderData?: any): void {
    const entityUnits = this.unitSummaries.get(entityId);
    if (entityUnits) {
      const customerUnits = entityUnits.get(customerId);
      if (customerUnits) {
        const unitSummary = customerUnits.get(unitId);
        if (unitSummary) {
          if (!unitSummary.serviceOrders.includes(serviceOrderId)) {
            unitSummary.serviceOrders.push(serviceOrderId);
            unitSummary.summary.totalServiceOrders = unitSummary.serviceOrders.length;
            
            if (serviceOrderData && serviceOrderData.created) {
              const serviceDate = new Date(serviceOrderData.created);
              if (!unitSummary.summary.lastActivity || serviceDate > new Date(unitSummary.summary.lastActivity)) {
                unitSummary.summary.lastActivity = serviceDate.toISOString().split('T')[0];
              }
            }
          }
        }
      }
    }

    // Also store in service order summaries for service-orders/index.json
    if (!this.serviceOrderSummaries.has(entityId)) {
      this.serviceOrderSummaries.set(entityId, new Map());
    }
    const entityServiceOrders = this.serviceOrderSummaries.get(entityId)!;
    
    if (!entityServiceOrders.has(customerId)) {
      entityServiceOrders.set(customerId, new Map());
    }
    const customerServiceOrders = entityServiceOrders.get(customerId)!;
    
    if (!customerServiceOrders.has(unitId)) {
      customerServiceOrders.set(unitId, new Map());
    }
    const unitServiceOrders = customerServiceOrders.get(unitId)!;
    
    if (serviceOrderData && !unitServiceOrders.has(serviceOrderId)) {
      // Store service order summary data
      unitServiceOrders.set(serviceOrderId, {
        repairOrderId: parseInt(serviceOrderId),
        repairOrderNumber: serviceOrderData.repairOrderNumber || 0,
        description: serviceOrderData.description || '',
        workFlowStatus: serviceOrderData.workFlowStatus || 'Unknown',
        created: serviceOrderData.created || null,
        scheduledDate: serviceOrderData.scheduledDate || null,
        completedDate: serviceOrderData.completedDate || null,
        totalAmount: serviceOrderData.totalAmount || 0,
        balanceAmount: serviceOrderData.balanceAmount || serviceOrderData.totalAmount || 0
      });
    }
  }

  /**
   * Finalize and write all index files
   */
  async finalizeAndWriteIndexes(): Promise<void> {
    // 🔍 DEBUG: Log entity summaries and basic statistics info
    console.log(`\n🔍 DEBUG: finalizeAndWriteIndexes called`);
    console.log(`📊 entitySummaries size: ${this.entitySummaries.size}`);
    console.log(`📊 entityBasicStatistics size: ${this.entityBasicStatistics.size}`);
    
    // Write root index.json with all entities
    const entitiesArray = Array.from(this.entitySummaries.values()).map(entity => {
        const entityCustomers = this.customerSummaries.get(entity.entityId) || new Map();
        const entityUnits = this.unitSummaries.get(entity.entityId) || new Map();
        
        let totalUnits = 0;
        let totalServiceOrders = 0;
        let customersCount = entityCustomers.size;
        
        // Calculate detailed statistics from customer/unit summaries (for fully processed entities)
        entityUnits.forEach(customerUnits => {
          customerUnits.forEach((unit: any) => {
            totalUnits++;
            totalServiceOrders += unit.summary.totalServiceOrders;
          });
        });
        
        // 🆕 If no detailed data exists, use basic statistics (for basic processed entities)
        const basicStats = this.entityBasicStatistics.get(entity.entityId);
        if (customersCount === 0 && totalUnits === 0 && totalServiceOrders === 0 && basicStats) {
          customersCount = basicStats.customers;
          totalUnits = basicStats.units;
          totalServiceOrders = basicStats.serviceOrders;
          console.log(`📊 Using basic statistics for entity ${entity.entityId}: ${customersCount} customers, ${totalUnits} units, ${totalServiceOrders} service orders`);
        } else if (customersCount === 0 && totalUnits === 0 && totalServiceOrders === 0) {
          console.log(`⚠️  Entity ${entity.entityId} has no detailed data and no basic statistics`);
        } else {
          console.log(`✅ Entity ${entity.entityId} using detailed data: ${customersCount} customers, ${totalUnits} units, ${totalServiceOrders} service orders`);
        }
        
        // 🚀 Pre-compute hasCustomersDir to avoid frontend filesystem checks
        const customersPath = path.join(this.baseOutputDir, entity.entityId, 'customers');
        const hasCustomersDir = require('fs').existsSync(customersPath);

        return {
          entityId: parseInt(entity.entityId),
          title: entity.title,
          legalName: entity.legalName,
          status: entity.status,
          phone: entity.phone,
          email: entity.email,
          website: entity.website,
          businessType: entity.businessType,
          yearEstablished: entity.created ? new Date(entity.created).getFullYear() : null,
          customers: customersCount,
          units: totalUnits,
          serviceOrders: totalServiceOrders,
          locations: entity.locationCount || 1, // Use actual location count if available
          employees: entity.employeeCount || 0, // Use actual employee count if available
          parts: 0, // Default, could be calculated from actual data
          isSimpleShop: entity.isSimpleShop || false, // 🆕 Add Simple Shop flag
          locationCount: entity.locationCount || 0, // 🆕 Add location count for Simple Shop display
          employeeCount: entity.employeeCount || 0, // 🆕 Add employee count for Simple Shop display
          locationNames: entity.locationNames || [], // 🆕 Add location names for Simple Shop display
          employeeNames: entity.employeeNames || [], // 🆕 Add employee names for Simple Shop display
          hasCustomersDir: hasCustomersDir, // 🚀 Pre-computed to avoid frontend filesystem operations
          lastUpdated: entity.lastUpdated, // 🕒 Add timestamp for basic data processing
          processingStatus: entity.processingStatus // 🕒 Add processing completion status
        };
      })
      .sort((a, b) => {
        // 🎯 Sort entities by customers directory existence, then by entityId
        // Use pre-computed hasCustomersDir for accurate sorting
        if (a.hasCustomersDir && !b.hasCustomersDir) return -1; // a has customers dir, prioritize
        if (!a.hasCustomersDir && b.hasCustomersDir) return 1;  // b has customers dir, prioritize
        return a.entityId - b.entityId; // Same data status, sort by entityId ascending
      });

    const rootIndex = {
      entities: entitiesArray,
      totalEntities: this.entitySummaries.size,
      activeEntities: Array.from(this.entitySummaries.values()).filter(e => e.status === 'Active').length,
      exportTimestamp: new Date().toISOString(),
      processingInfo: {
        dataSource: "Fullbay Production Database",
        transformationVersion: "2.1.0",
        tablesProcessed: 0,
        recordsProcessed: 0
      }
    };

    await this.writeJson('index.json', rootIndex);

    // Process Simple Shop entities for advanced statistics (in memory)
    await this.processSimpleShopStatisticsInMemory();

    // Write entity index files
    for (const [entityId, entitySummary] of this.entitySummaries) {
      const entityCustomers = this.customerSummaries.get(entityId) || new Map();
      const entityUnits = this.unitSummaries.get(entityId) || new Map();
      
      let totalUnits = 0;
      let totalServiceOrders = 0;
      let customersCount = entityCustomers.size;
      let lastActivity: string | null = null;
      
      // Calculate detailed statistics from customer/unit summaries (for fully processed entities)
      entityUnits.forEach(customerUnits => {
        customerUnits.forEach((unit: any) => {
          totalUnits++;
          totalServiceOrders += unit.summary.totalServiceOrders;
          if (unit.summary.lastActivity && (!lastActivity || unit.summary.lastActivity > lastActivity)) {
            lastActivity = unit.summary.lastActivity;
          }
        });
      });
      
      // 🆕 If no detailed data exists, use basic statistics (for basic processed entities)
      const basicStats = this.entityBasicStatistics.get(entityId);
      if (customersCount === 0 && totalUnits === 0 && totalServiceOrders === 0 && basicStats) {
        customersCount = basicStats.customers;
        totalUnits = basicStats.units;
        totalServiceOrders = basicStats.serviceOrders;
        console.log(`📊 Using basic statistics for entity ${entityId} index.json: ${customersCount} customers, ${totalUnits} units, ${totalServiceOrders} service orders`);
      }
      
      const entityIndexData = {
        ...entitySummary,
        subdirectories: customersCount > 0 ? [
          {
            name: "customers",
            type: "Customer",
            count: customersCount,
            description: "Fleet companies serviced by this repair shop"
          }
        ] : [],
        summary: {
          totalCustomers: customersCount,
          totalUnits: totalUnits,
          totalServiceOrders: totalServiceOrders,
          lastActivity: lastActivity
        }
      };
      
      await this.writeJson(`${entityId}/index.json`, entityIndexData);
      
      // Write customers index file
      if (entityCustomers.size > 0) {
        const customersDir = path.join(this.baseOutputDir, entityId, 'customers');
        await fs.ensureDir(customersDir);
        
        const customersArray = Array.from(entityCustomers.values()).map(customer => {
          const customerUnits = entityUnits.get(customer.customerId) || new Map();
          let unitCount = customerUnits.size;
          let serviceOrders = 0;
          let lastServiceDate: string | null = null;
          
          customerUnits.forEach((unit: any) => {
            serviceOrders += unit.summary.totalServiceOrders;
            if (unit.summary.lastActivity && (!lastServiceDate || unit.summary.lastActivity > lastServiceDate)) {
              lastServiceDate = unit.summary.lastActivity;
            }
          });
          
          return {
            customerId: parseInt(customer.customerId),
            title: customer.title,
            legalName: customer.legalName,
            phone: customer.phone,
            active: customer.active,
            status: customer.status,
            unitCount: unitCount,
            serviceOrders: serviceOrders,
            lastServiceDate: lastServiceDate
          };
        });
        
        const customersIndex = {
          customers: customersArray,
          totalCustomers: customersArray.length,
          activeCustomers: customersArray.filter(c => c.active).length,
          lastUpdated: new Date().toISOString()
        };
        
        await fs.writeFile(
          path.join(customersDir, 'index.json'),
          this.prettyJson ? JSON.stringify(customersIndex, null, 2) : JSON.stringify(customersIndex),
          'utf8'
        );
        
        // Write units index file for each customer
        for (const [customerId, customerSummary] of entityCustomers) {
          const customerUnits = entityUnits.get(customerId) || new Map();
          
          if (customerUnits.size > 0) {
            const unitsDir = path.join(this.baseOutputDir, entityId, 'customers', customerId, 'units');
            await fs.ensureDir(unitsDir);
            
            const unitsArray = Array.from(customerUnits.values()).map((unit: any) => ({
              customerUnitId: parseInt(unit.customerUnitId),
              customerId: parseInt(customerId),
              number: unit.number,
              fleetNumber: unit.fleetNumber,
              title: unit.title,
              licensePlate: unit.licensePlate,
              make: unit.make,
              model: unit.model,
              year: unit.year,
              active: unit.active,
              status: unit.status,
              serviceOrders: unit.summary.totalServiceOrders,
              lastServiceDate: unit.summary.lastActivity
            }));
            
            const unitsIndex = {
              units: unitsArray,
              totalUnits: unitsArray.length,
              activeUnits: unitsArray.filter(u => u.active).length,
              lastUpdated: new Date().toISOString()
            };
            
            await fs.writeFile(
              path.join(unitsDir, 'index.json'),
              this.prettyJson ? JSON.stringify(unitsIndex, null, 2) : JSON.stringify(unitsIndex),
              'utf8'
            );
            
            // Update customer individual index.json
            const customerIndexData = {
              ...customerSummary,
              units: unitsArray,
              summary: {
                totalUnits: unitsArray.length,
                totalServiceOrders: unitsArray.reduce((sum, unit) => sum + unit.serviceOrders, 0),
                lastActivity: unitsArray.reduce((latest, unit) => {
                  return unit.lastServiceDate && (!latest || unit.lastServiceDate > latest) ? unit.lastServiceDate : latest;
                }, null)
              }
            };
            
            await fs.writeFile(
              path.join(this.baseOutputDir, entityId, 'customers', customerId, 'index.json'),
              this.prettyJson ? JSON.stringify(customerIndexData, null, 2) : JSON.stringify(customerIndexData),
              'utf8'
            );

            // Write service-orders index files for each unit
            for (const [unitId, unitSummary] of customerUnits) {
              const unitServiceOrders = this.serviceOrderSummaries.get(entityId)?.get(customerId)?.get(unitId);
              
              if (unitServiceOrders && unitServiceOrders.size > 0) {
                const serviceOrdersDir = path.join(this.baseOutputDir, entityId, 'customers', customerId, 'units', unitId, 'service-orders');
                await fs.ensureDir(serviceOrdersDir);
                
                const serviceOrdersArray = Array.from(unitServiceOrders.values());
                
                const completedOrders = serviceOrdersArray.filter(so => 
                  so.workFlowStatus?.toLowerCase() === 'completed' || so.completedDate
                ).length;
                
                const inProgressOrders = serviceOrdersArray.filter(so => 
                  so.workFlowStatus?.toLowerCase() === 'in progress' || 
                  so.workFlowStatus?.toLowerCase() === 'assigned'
                ).length;
                
                const serviceOrdersIndex = {
                  serviceOrders: serviceOrdersArray,
                  totalOrders: serviceOrdersArray.length,
                  completedOrders: completedOrders,
                  inProgressOrders: inProgressOrders,
                  lastUpdated: new Date().toISOString()
                };
                
                await fs.writeFile(
                  path.join(serviceOrdersDir, 'index.json'),
                  this.prettyJson ? JSON.stringify(serviceOrdersIndex, null, 2) : JSON.stringify(serviceOrdersIndex),
                  'utf8'
                );
              }
            }
          }
        }
      }
    }
  }

  /**
   * Write processing summary
   */
  async writeSummary(summary: any): Promise<void> {
    await this.writeJson('processing_summary.json', {
      ...summary,
      timestamp: new Date().toISOString(),
      outputDirectory: this.baseOutputDir
    });
  }



  /**
   * Process Simple Shop entities and add advanced statistics in memory (no file I/O)
   */
   private async processSimpleShopStatisticsInMemory(): Promise<void> {
    if (this.simpleShopEntities.size === 0) {
      console.log('⚠️  No Simple Shop entities identified, skipping advanced statistics');
      return;
    }

    console.log('\n🏪 Processing Simple Shop advanced statistics...');
    
    for (const entityId of this.simpleShopEntities) {
      const entityIdStr = entityId.toString();
      const entitySummary = this.entitySummaries.get(entityIdStr);
      
      if (!entitySummary) {
        continue; // Entity not processed in this run
      }

      // console.log(`🏪 Adding advanced statistics for Simple Shop entity ${entityId}...`);

      try {
        // Get collected data for this entity
        const entityCustomers = this.customerSummaries.get(entityIdStr) || new Map();
        const entityUnits = this.unitSummaries.get(entityIdStr) || new Map();
        const entityServiceOrders = this.serviceOrderSummaries.get(entityIdStr) || new Map();

        // Calculate accounting statistics
        let totalRevenue = 0;
        let totalInvoices = 0;
        let completedOrders = 0;
        let pendingOrders = 0;
        let pendingRevenue = 0;
        let lastInvoiceDate: string | null = null;
        let latestDate = new Date(0);

        // Iterate through all service orders
        entityServiceOrders.forEach((customerOrders: any) => {
          customerOrders.forEach((unitOrders: any) => {
            unitOrders.forEach((serviceOrder: any) => {
              totalInvoices++;
              const amount = serviceOrder.totalAmount || 0;
              totalRevenue += amount;

              // Check status
              const status = serviceOrder.workFlowStatus?.toLowerCase();
              if (status === 'done') {
                completedOrders++;
              } else if (status && !['cancelled'].includes(status)) {
                pendingOrders++;
                pendingRevenue += amount;
              }

              // Track latest date
              if (serviceOrder.created) {
                const orderDate = new Date(serviceOrder.created);
                if (orderDate > latestDate) {
                  latestDate = orderDate;
                  lastInvoiceDate = serviceOrder.created;
                }
              }
            });
          });
        });

        // Calculate units statistics
        let totalUnits = 0;
        let activeUnits = 0;
        let unitsServicedThisYear = 0;
        const unitTypes = new Set<string>();
        const currentYear = new Date().getFullYear();

        entityUnits.forEach((customerUnits: any) => {
          customerUnits.forEach((unit: any) => {
            totalUnits++;
            if (unit.active) {
              activeUnits++;
            }

            // Track unit types
            const unitType = unit.unitType || unit.make || 'Unknown';
            if (unitType !== 'Unknown') {
              unitTypes.add(unitType);
            }

            // Check if serviced this year
            if (unit.summary?.lastServiceDate) {
              const serviceDate = new Date(unit.summary.lastServiceDate);
              if (serviceDate.getFullYear() === currentYear) {
                unitsServicedThisYear++;
              }
            }
          });
        });

        // Calculate averages
        const averageInvoiceAmount = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;

        // Create accounting object
        const accounting = {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalInvoices,
          averageInvoiceAmount: Math.round(averageInvoiceAmount * 100) / 100,
          pendingPayments: Math.round(pendingRevenue * 100) / 100,
          lastInvoiceDate,
          completedOrders,
          pendingOrders
        };

        // Create units object
        const units = {
          totalUnits,
          activeUnits,
          unitsServicedThisYear,
          unitTypes: Array.from(unitTypes),
          mostCommonUnitType: unitTypes.size > 0 ? Array.from(unitTypes)[0] : null,
          unitsWithActiveServiceOrders: pendingOrders, // approximation
          totalCustomers: entityCustomers.size
        };

        // Add advanced stats to entity summary in memory (no file I/O)
        this.addAdvancedSimpleShopDataToSummary(entityIdStr, accounting, units);

        // console.log(`✅ Advanced Simple Shop data added for entity ${entityId}:`);
        // console.log(`   💰 Revenue: $${accounting.totalRevenue}, Invoices: ${accounting.totalInvoices}`);
        // console.log(`   🚛 Units: ${units.totalUnits}, Customers: ${units.totalCustomers}`);

      } catch (error) {
        console.error(`❌ Error processing Simple Shop statistics for entity ${entityId}:`, error);
      }
    }

    console.log(`✅ Simple Shop advanced statistics processing completed`);
    
    // Rewrite entity.json files for Simple Shop entities with advanced data
    await this.rewriteSimpleShopEntityFiles();
  }

  /**
   * Add advanced Simple Shop data to entity summary in memory
   */
  private addAdvancedSimpleShopDataToSummary(entityId: string, accounting: any, units: any): void {
    const entitySummary = this.entitySummaries.get(entityId);
    if (entitySummary) {
      // Add advanced Simple Shop data to the entity summary
      entitySummary.accounting = accounting;
      entitySummary.units = units;
      entitySummary.isAdvancedSimpleShop = true; // Flag to indicate advanced stats were added
    }
  }

  /**
   * Rewrite entity.json files for Simple Shop entities with advanced data (PARALLEL)
   */
  private async rewriteSimpleShopEntityFiles(): Promise<void> {
    console.log('📝 Rewriting entity.json files for Simple Shop entities with advanced data (parallel)...');
    
    // Create array of all Simple Shop entities that need updating
    const updateTasks = [];
    for (const entityId of this.simpleShopEntities) {
      const entityIdStr = entityId.toString();
      const entitySummary = this.entitySummaries.get(entityIdStr);
      
      if (entitySummary && entitySummary.isAdvancedSimpleShop) {
        updateTasks.push(this.updateSingleEntityFile(entityIdStr, entitySummary));
      }
    }
    
    console.log(`🚀 Processing ${updateTasks.length} Simple Shop entities in parallel...`);
    
    // Execute all file updates in parallel with limited concurrency
    const BATCH_SIZE = 50; // Process 50 files at a time to avoid overwhelming the filesystem
    let completedCount = 0;
    
    for (let i = 0; i < updateTasks.length; i += BATCH_SIZE) {
      const batch = updateTasks.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch);
      
      // Count successful updates
      const successCount = results.filter(result => result.status === 'fulfilled').length;
      completedCount += successCount;
      
      // Log errors
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`❌ Error updating Simple Shop entity file: ${result.reason}`);
        }
      });
      
      console.log(`   ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${successCount}/${batch.length} files updated`);
    }
    
    console.log(`✅ Updated ${completedCount}/${updateTasks.length} Simple Shop entity.json files with advanced statistics`);
  }

  /**
   * Update a single entity file with Simple Shop advanced data
   */
  private async updateSingleEntityFile(entityId: string, entitySummary: any): Promise<void> {
    const entityFilePath = path.join(this.baseOutputDir, entityId, 'entity.json');
    
    // Read existing entity.json
    const entityData = JSON.parse(await fs.readFile(entityFilePath, 'utf8'));
    
    // Add advanced Simple Shop data
    entityData.accounting = entitySummary.accounting;
    entityData.units = entitySummary.units;
    
    // Write back to file
    await fs.writeFile(
      entityFilePath,
      this.prettyJson ? JSON.stringify(entityData, null, 2) : JSON.stringify(entityData),
      'utf8'
    );
  }

  /**
   * Generate index.json files for a specific entity immediately after processing
   */
  async generateEntityIndexes(entityId: string, markAsFullyProcessed: boolean = false): Promise<void> {
    console.log(`📝 Generating index.json files for entity ${entityId}...`);
    
    const entitySummary = this.entitySummaries.get(entityId);
    if (!entitySummary) {
      console.log(`⚠️  No entity summary found for entity ${entityId}, skipping index generation`);
      return;
    }

    const entityCustomers = this.customerSummaries.get(entityId) || new Map();
    const entityUnits = this.unitSummaries.get(entityId) || new Map();
    
    let totalUnits = 0;
    let totalServiceOrders = 0;
    let lastActivity: string | null = null;
    
    entityUnits.forEach(customerUnits => {
      customerUnits.forEach((unit: any) => {
        totalUnits++;
        totalServiceOrders += unit.summary.totalServiceOrders;
        if (unit.summary.lastActivity && (!lastActivity || unit.summary.lastActivity > lastActivity)) {
          lastActivity = unit.summary.lastActivity;
        }
      });
    });
    
    // Generate entity index.json
    const entityIndexData = {
      ...entitySummary,
      subdirectories: entityCustomers.size > 0 ? [
        {
          name: "customers",
          type: "Customer",
          count: entityCustomers.size,
          description: "Fleet companies serviced by this repair shop"
        }
      ] : [],
      summary: {
        totalCustomers: entityCustomers.size,
        totalUnits: totalUnits,
        totalServiceOrders: totalServiceOrders,
        lastActivity: lastActivity
      },
      // add processing status
      ...(markAsFullyProcessed && {
        processingStatus: {
          isFullyProcessed: true,
          completedAt: new Date().toISOString()
        }
      })
    };
    
    await this.writeJson(`${entityId}/index.json`, entityIndexData);
    
    if (markAsFullyProcessed) {
      console.log(`🎯 Entity ${entityId} marked as fully processed in index.json`);
      
      // 🕒 Update entitySummaries with processingStatus for main index.json
      const summary = this.entitySummaries.get(entityId);
      if (summary) {
        summary.processingStatus = {
          isFullyProcessed: true,
          completedAt: new Date().toISOString()
        };
        console.log(`🕒 Updated entity ${entityId} summary with processing completion time`);
      }
    }
    
    // Generate customers index.json if customers exist
    if (entityCustomers.size > 0) {
      const customersDir = path.join(this.baseOutputDir, entityId, 'customers');
      await fs.ensureDir(customersDir);
      
      const customersArray = Array.from(entityCustomers.values()).map(customer => {
        const customerUnits = entityUnits.get(customer.customerId) || new Map();
        let unitCount = customerUnits.size;
        let serviceOrders = 0;
        let lastServiceDate: string | null = null;
        
        customerUnits.forEach((unit: any) => {
          serviceOrders += unit.summary.totalServiceOrders;
          if (unit.summary.lastActivity && (!lastServiceDate || unit.summary.lastActivity > lastServiceDate)) {
            lastServiceDate = unit.summary.lastActivity;
          }
        });
        
        return {
          customerId: parseInt(customer.customerId),
          title: customer.title,
          legalName: customer.legalName,
          phone: customer.phone,
          active: customer.active,
          status: customer.status,
          unitCount: unitCount,
          serviceOrders: serviceOrders,
          lastServiceDate: lastServiceDate
        };
      });
      
      const customersIndex = {
        customers: customersArray,
        totalCustomers: customersArray.length,
        activeCustomers: customersArray.filter(c => c.active).length,
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeFile(
        path.join(customersDir, 'index.json'),
        this.prettyJson ? JSON.stringify(customersIndex, null, 2) : JSON.stringify(customersIndex),
        'utf8'
      );
      
      // Generate units and service-orders index files for each customer
      for (const [customerId, customerSummary] of entityCustomers) {
        const customerUnits = entityUnits.get(customerId) || new Map();
        
        if (customerUnits.size > 0) {
          const unitsDir = path.join(this.baseOutputDir, entityId, 'customers', customerId, 'units');
          await fs.ensureDir(unitsDir);
          
          const unitsArray = Array.from(customerUnits.values()).map((unit: any) => ({
            customerUnitId: parseInt(unit.customerUnitId),
            customerId: parseInt(customerId),
            number: unit.number,
            fleetNumber: unit.fleetNumber,
            title: unit.title,
            licensePlate: unit.licensePlate,
            make: unit.make,
            model: unit.model,
            year: unit.year,
            active: unit.active,
            status: unit.status,
            serviceOrders: unit.summary.totalServiceOrders,
            lastServiceDate: unit.summary.lastActivity
          }));
          
          const unitsIndex = {
            units: unitsArray,
            totalUnits: unitsArray.length,
            activeUnits: unitsArray.filter(u => u.active).length,
            lastUpdated: new Date().toISOString()
          };
          
          await fs.writeFile(
            path.join(unitsDir, 'index.json'),
            this.prettyJson ? JSON.stringify(unitsIndex, null, 2) : JSON.stringify(unitsIndex),
            'utf8'
          );
          
          // Update customer individual index.json
          const customerIndexData = {
            ...customerSummary,
            units: unitsArray,
            summary: {
              totalUnits: unitsArray.length,
              totalServiceOrders: unitsArray.reduce((sum, unit) => sum + unit.serviceOrders, 0),
              lastActivity: unitsArray.reduce((latest, unit) => {
                return unit.lastServiceDate && (!latest || unit.lastServiceDate > latest) ? unit.lastServiceDate : latest;
              }, null)
            }
          };
          
          await fs.writeFile(
            path.join(this.baseOutputDir, entityId, 'customers', customerId, 'index.json'),
            this.prettyJson ? JSON.stringify(customerIndexData, null, 2) : JSON.stringify(customerIndexData),
            'utf8'
          );

          // Write service-orders index files for each unit
          for (const [unitId, unitSummary] of customerUnits) {
            const unitServiceOrders = this.serviceOrderSummaries.get(entityId)?.get(customerId)?.get(unitId);
            
            if (unitServiceOrders && unitServiceOrders.size > 0) {
              const serviceOrdersDir = path.join(this.baseOutputDir, entityId, 'customers', customerId, 'units', unitId, 'service-orders');
              await fs.ensureDir(serviceOrdersDir);
              
              const serviceOrdersArray = Array.from(unitServiceOrders.values());
              
              const completedOrders = serviceOrdersArray.filter(so => 
                so.workFlowStatus?.toLowerCase() === 'completed' || so.completedDate
              ).length;
              
              const inProgressOrders = serviceOrdersArray.filter(so => 
                so.workFlowStatus?.toLowerCase() === 'in progress' || 
                so.workFlowStatus?.toLowerCase() === 'assigned'
              ).length;
              
              const serviceOrdersIndex = {
                serviceOrders: serviceOrdersArray,
                totalOrders: serviceOrdersArray.length,
                completedOrders: completedOrders,
                inProgressOrders: inProgressOrders,
                lastUpdated: new Date().toISOString()
              };
              
              await fs.writeFile(
                path.join(serviceOrdersDir, 'index.json'),
                this.prettyJson ? JSON.stringify(serviceOrdersIndex, null, 2) : JSON.stringify(serviceOrdersIndex),
                'utf8'
              );
            }
          }
        }
      }
    }
    
    console.log(`✅ Generated index.json files for entity ${entityId} (${entityCustomers.size} customers, ${totalUnits} units, ${totalServiceOrders} service orders)`);
  }

  /**
   * Get the current timestamped output directory
   */
  getOutputDirectory(): string {
    return this.baseOutputDir;
  }

  /**
   * Get the path for a specific entity
   */
  getEntityPath(entityId: string): string {
    return path.join(this.baseOutputDir, entityId);
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.baseOutputDir, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async readFileContent(filePath: string): Promise<string> {
    const fullPath = path.join(this.baseOutputDir, filePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Read and parse a JSON file
   */
  async readJsonFile(filePath: string): Promise<any> {
    const fullPath = path.join(this.baseOutputDir, filePath);
    const content = await fs.readFile(fullPath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * check if entity is fully processed
   */
  async isEntityFullyProcessed(entityId: string): Promise<boolean> {
    const indexPath = path.join(this.baseOutputDir, entityId, 'index.json');
    console.log(`🔍 [DEBUG] Checking entity ${entityId} at path: ${indexPath}`);
    
    try {
      // Use relative path for fileExists since it adds baseOutputDir internally
      const relativePath = path.join(entityId, 'index.json');
      if (!await this.fileExists(relativePath)) {
        console.log(`🔍 [DEBUG] Entity ${entityId} index.json does not exist`);
        return false;
      }
      
      const indexData = JSON.parse(await this.readFileContent(relativePath));
      const isProcessed = indexData.processingStatus?.isFullyProcessed === true;
      console.log(`🔍 [DEBUG] Entity ${entityId} processingStatus:`, indexData.processingStatus);
      console.log(`🔍 [DEBUG] Entity ${entityId} isFullyProcessed: ${isProcessed}`);
      return isProcessed;
    } catch (error) {
      console.warn(`⚠️  Failed to check processing status for entity ${entityId}:`, error);
      return false;
    }
  }

  /**
   * get list of fully processed entities
   */
  async getFullyProcessedEntities(): Promise<string[]> {
    const fullyProcessed: string[] = [];
    
    try {
      if (!await fs.pathExists(this.baseOutputDir)) {
        return fullyProcessed;
      }
      
      const entities = await fs.readdir(this.baseOutputDir);
      
      for (const entityId of entities) {
        // skip non-directory files (e.g. processing_summary.json)
        const entityPath = path.join(this.baseOutputDir, entityId);
        try {
          const stat = await fs.stat(entityPath);
          if (!stat.isDirectory()) continue;
        } catch {
          continue; // skip inaccessible files/directories
        }
        
        if (await this.isEntityFullyProcessed(entityId)) {
          fullyProcessed.push(entityId);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Failed to get fully processed entities:`, error);
    }
    
    return fullyProcessed;
  }

  /**
   * Sanitize directory name by removing invalid characters
   */
  private sanitizeDirectoryName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 100); // Limit length
  }
}
