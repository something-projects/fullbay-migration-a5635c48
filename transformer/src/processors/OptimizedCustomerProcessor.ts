import * as path from 'path';
import { DataReader } from '../utils/DataSource';
import { OutputManager } from '../utils/OutputManager';
import { DataQualityTracker } from '../utils/DataQualityTracker';
import { DataCache, CacheConfig } from '../utils/DataCache';
import { 
  Customer,
  CustomerUnit,
  CustomerEmployee,
  Address,
  RepairOrder,
  CustomerPayment,
  DenormalizedCompany,
  DenormalizedCustomer,
  DenormalizedUnit,
  DenormalizedCustomerEmployee
} from '../types/DatabaseTypes';

export class OptimizedCustomerProcessor {
  private dataReader: DataReader;
  private outputManager: OutputManager;
  private qualityTracker: DataQualityTracker;
  private cache: DataCache<any>;

  constructor(dataReader: DataReader, outputManager: OutputManager, qualityTracker?: DataQualityTracker) {
    this.dataReader = dataReader;
    this.outputManager = outputManager;
    this.qualityTracker = qualityTracker || new DataQualityTracker();
    
    const devMode = false;
    const devLimit = 10000; // Fixed limit for dev mode - 10k records per table
    const reuseCache = true; // Always reuse cache if available
    
    const cacheConfig: CacheConfig = {
      cacheDir: path.resolve('./cache'),
      maxMemoryMB: 512, // Keep only 512MB in memory
      chunkSize: 10000, // Flush to disk every 10k records
      reuseCache,
      devMode,
      devLimit
    };
    this.cache = new DataCache(cacheConfig);
    
    if (devMode) {
      console.log(`🧪 Development mode enabled (limit: ${devLimit} records per table)`);
    }
    console.log('♻️  Cache reuse enabled');
  }

  async processCustomers(entities: { [entityId: number]: DenormalizedCompany }): Promise<void> {
    console.log('🚀 Processing customers with optimized memory usage...');
    
    await this.cache.clear();

    await this.loadDataToCache();

    console.log('📊 Processing customers by entity...');
    
    // First, write entity data to ensure directories exist
    for (const [entityId, entity] of Object.entries(entities)) {
      await this.outputManager.createShopDirectory(entityId);
      await this.outputManager.writeEntityJson(entityId, entity);
    }
    
    let processedCount = 0;
    for await (const customerBatch of this.cache.getAllRecords('customers')) {
      const customersByEntity = this.groupByEntity(customerBatch);
      
      for (const [entityId, entityCustomers] of Object.entries(customersByEntity)) {
        const entity = entities[parseInt(entityId)];
        if (!entity) continue;

        await this.processEntityCustomers(parseInt(entityId), entityCustomers);
        processedCount += entityCustomers.length;
        
        if (processedCount % 1000 === 0) {
          console.log(`   Processed ${processedCount} customers...`);
        }
      }
    }

    console.log(`✅ Completed processing ${processedCount} customers`);
  }

  private async loadDataToCache(): Promise<void> {
    const devMode = this.cache['config'].devMode;
    const devLimit = this.cache['config'].devLimit || 10000;
    
    const tables = [
      { name: 'customers', table: 'Customer', batchSize: 1000 },
      { name: 'customerUnits', table: 'CustomerUnit', batchSize: 1000 },
      { name: 'customerEmployees', table: 'CustomerEmployee', batchSize: 1000 },
      { name: 'addresses', table: 'Address', batchSize: 1000 },
      { name: 'repairOrders', table: 'RepairOrder', batchSize: 500 },
      { name: 'customerPayments', table: 'CustomerPayment', batchSize: 1000 }
    ];

    for (const { name, table, batchSize } of tables) {
      if (await this.cache.shouldSkipLoading(name)) {
        const cachedCount = await this.cache.getRecordCount(name);
        console.log(`💾 Using cached ${name} data (${cachedCount} records)`);
        continue;
      }
      
      console.log(`🔄 Loading ${name} in batches${devMode ? ` (dev limit: ${devLimit})` : ''}...`);
      let totalLoaded = 0;

      for await (const batch of this.dataReader.readTableLazy(table, batchSize)) {
        await this.cache.addBatch(name, batch);
        totalLoaded += batch.length;
        
        if (totalLoaded % 10000 === 0) {
          console.log(`   Cached ${totalLoaded} ${name} records...`);
        }
        
        // Stop if we've reached the development limit
        if (devMode && totalLoaded >= devLimit) {
          console.log(`🧪 DEV MODE: Reached limit of ${devLimit} records for ${name} - STOPPING data load`);
          break;
        }
      }

      console.log(`✅ Cached ${totalLoaded} ${name} records`);
    }
  }

  private async processEntityCustomers(entityId: number, customers: Customer[]): Promise<void> {
    // Ensure entity directory exists first
    await this.outputManager.createShopDirectory(entityId.toString());
    
    for (const customer of customers) {
      const units = await this.getCustomerUnits(customer.customerId);
      const employees = await this.getCustomerEmployees(customer.customerId);
      const customerOrders = await this.getCustomerRepairOrders(customer.customerId);
      const payments = await this.getCustomerPayments(customer.customerId);
      const addresses = await this.getAddresses();

      await this.outputManager.createCustomerDirectory(entityId.toString(), customer.customerId.toString());

      const denormalized = this.denormalizeCustomer(
        customer,
        [],
        employees,
        addresses,
        customerOrders,
        payments
      );

      const flatCustomer = this.flattenCustomerData(denormalized);
      await this.outputManager.writeCustomerJson(entityId.toString(), customer.customerId.toString(), flatCustomer);

      for (const unit of units) {
        const unitOrders = await this.getUnitRepairOrders(unit.customerUnitId);
        
        await this.outputManager.createUnitDirectory(entityId.toString(), customer.customerId.toString(), unit.customerUnitId.toString());
        
        const denormalizedUnit = this.denormalizeUnit(unit, []);
        const flatUnit = this.flattenUnitData(denormalizedUnit);
        await this.outputManager.writeUnitJson(entityId.toString(), customer.customerId.toString(), unit.customerUnitId.toString(), flatUnit);
      }
    }
  }

  private async getCustomerUnits(customerId: number): Promise<CustomerUnit[]> {
    const units: CustomerUnit[] = [];
    for await (const batch of this.cache.getAllRecords('customerUnits')) {
      units.push(...batch.filter((unit: CustomerUnit) => unit.customerId === customerId));
    }
    return units;
  }

  private async getCustomerEmployees(customerId: number): Promise<CustomerEmployee[]> {
    const employees: CustomerEmployee[] = [];
    for await (const batch of this.cache.getAllRecords('customerEmployees')) {
      employees.push(...batch.filter((emp: CustomerEmployee) => emp.customerId === customerId));
    }
    return employees;
  }

  private async getCustomerRepairOrders(customerId: number): Promise<RepairOrder[]> {
    const orders: RepairOrder[] = [];
    for await (const batch of this.cache.getAllRecords('repairOrders')) {
      orders.push(...batch.filter((order: RepairOrder) => order.customerId === customerId));
    }
    return orders;
  }

  private async getUnitRepairOrders(customerUnitId: number): Promise<RepairOrder[]> {
    const orders: RepairOrder[] = [];
    for await (const batch of this.cache.getAllRecords('repairOrders')) {
      orders.push(...batch.filter((order: RepairOrder) => order.customerUnitId === customerUnitId));
    }
    return orders;
  }

  private async getCustomerPayments(customerId: number): Promise<CustomerPayment[]> {
    const payments: CustomerPayment[] = [];
    for await (const batch of this.cache.getAllRecords('customerPayments')) {
      payments.push(...batch.filter((payment: CustomerPayment) => payment.customerId === customerId));
    }
    return payments;
  }

  private async getAddresses(): Promise<Address[]> {
    const addresses: Address[] = [];
    for await (const batch of this.cache.getAllRecords('addresses')) {
      addresses.push(...batch);
    }
    return addresses;
  }

  private denormalizeCustomer(
    customer: Customer,
    units: CustomerUnit[],
    employees: CustomerEmployee[],
    addresses: Address[],
    repairOrders: RepairOrder[],
    payments: CustomerPayment[]
  ): DenormalizedCustomer {
    const denormalizedUnits = units.map(unit => this.denormalizeUnit(unit, repairOrders));
    const denormalizedEmployees = employees.map(emp => this.denormalizeCustomerEmployee(emp));
    const customerAddresses = this.getCustomerAddresses(customer, addresses);

    const completedOrders = repairOrders.filter(order => 
      order.workFlowStatus?.toLowerCase() === 'completed' || 
      order.completedDate
    ).length;
    const inProgressOrders = repairOrders.filter(order => 
      order.workFlowStatus?.toLowerCase() === 'in progress' ||
      order.workFlowStatus?.toLowerCase() === 'assigned'
    ).length;
    const lastServiceDate = this.getLastServiceDate(repairOrders);

    const totalPaid = payments.reduce((sum, payment) => sum + (parseFloat(payment.amount || '0') || 0), 0);
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

  private denormalizeUnit(unit: CustomerUnit, repairOrders: RepairOrder[]): DenormalizedUnit {
    const unitOrders = repairOrders.filter(order => order.customerUnitId === unit.customerUnitId);
    const lastServiceDate = this.getLastServiceDate(unitOrders);

    return {
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
        entityUnitTypeId: unit.entityUnitTypeId
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
  }

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

  private getCustomerAddresses(customer: Customer, addresses: Address[]): Address[] {
    const customerAddresses: Address[] = [];

    if (customer.physicalCustomerAddressId) {
      const physicalAddress = addresses.find(addr => addr.addressId === customer.physicalCustomerAddressId);
      if (physicalAddress) {
        customerAddresses.push({ ...physicalAddress, addressType: 'physical' } as any);
      }
    }

    if (customer.shipToCustomerAddressId && customer.shipToCustomerAddressId !== customer.physicalCustomerAddressId) {
      const shipToAddress = addresses.find(addr => addr.addressId === customer.shipToCustomerAddressId);
      if (shipToAddress) {
        customerAddresses.push({ ...shipToAddress, addressType: 'ship-to' } as any);
      }
    }

    if (customer.billingCustomerAddressId) {
      const billingAddress = addresses.find(addr => addr.addressId === customer.billingCustomerAddressId);
      if (billingAddress) {
        customerAddresses.push({ ...billingAddress, addressType: 'billing' } as any);
      }
    }

    return customerAddresses;
  }

  private groupByEntity(customers: Customer[]): { [entityId: number]: Customer[] } {
    return customers.reduce((groups, customer) => {
      if (!groups[customer.entityId]) {
        groups[customer.entityId] = [];
      }
      groups[customer.entityId].push(customer);
      return groups;
    }, {} as { [entityId: number]: Customer[] });
  }

  private getLastServiceDate(repairOrders: RepairOrder[]): string | undefined {
    const completedOrders = repairOrders
      .filter(order => order.completedDate)
      .sort((a, b) => new Date(b.completedDate!).getTime() - new Date(a.completedDate!).getTime());

    return completedOrders.length > 0 ? completedOrders[0].completedDate : undefined;
  }

  private calculateLifetimeValue(repairOrders: RepairOrder[]): number {
    return repairOrders.length * 500;
  }

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
      entityUnitTypeId: denormalized.vehicle.entityUnitTypeId,
      standardizedVehicle: denormalized.vehicle.standardizedVehicle,
      vehicleAlternatives: denormalized.vehicle.vehicleAlternatives,
      customerAddressId: denormalized.location.customerAddressId,
      shopHasPossession: denormalized.location.shopHasPossession,
      accessMethod: denormalized.location.accessMethod,
      assistWithPreventiveMaintenance: denormalized.maintenance.assistWithPM,
      trackPreventiveMaintenance: denormalized.maintenance.trackPM
    };
  }
}
