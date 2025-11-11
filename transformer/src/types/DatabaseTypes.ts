// Core Entity Types based on Fullbay database schema
import { StandardizedVehicle, StandardizedPart, VehicleMatchFailureReason, PartsMatchFailureReason } from './AutoCareTypes';

// Import all new Entity table interfaces and category data structures
export * from './EntityTableTypes';
export * from './EntityCategoryTypes';

export interface Entity {
  entityId: number;
  status?: string;
  corporationId?: number;
  number?: number;
  legalName?: string;
  title?: string;
  taxId?: string;
  entityTaxLocationId?: number;
  phone?: string;
  email?: string;
  fax?: string;
  fbConnectLevel?: number;
  website?: string;
  fullbayWebsite?: string;
  calendarViewOnlyCode?: string;
  primaryEntityAddressId?: number;
  primaryEntityEmployeeId?: number;
  billingEntityAddressId?: number;
  billingEntityEmployeeId?: number;
  fullbayQuickBooksId?: string;
  stripeCustomerId?: string;
  stripeCreditCardId?: string;
  paymentMethod?: string;
  billingMethod?: string;
  billingPreference?: string;
  billingDay?: number;
  nextBillDate?: string;
  promoCode?: string;
  ccName?: string;
  ccAddressId?: number;
  created?: string;
  modified?: string;
}

export interface EntityLocation {
  entityLocationId: number;
  entityId: number;
  active: boolean;
  shop: boolean;
  entityLocationNumber?: string;
  code?: string;
  name?: string;
  title?: string;
  phone?: string;
  email?: string;
  fax?: string;
  website?: string;
  mailingEntityAddressId?: number;
  physicalEntityAddressId?: number;
  timezone?: string;
  created?: string;
  modified?: string;
}

export interface Customer {
  customerId: number;
  entityId: number;
  entityLocationId?: number;
  active: boolean;
  code?: string;
  status?: string;
  legalName?: string;
  title?: string;
  phone?: string;
  secondPhone?: string;
  fax?: string;
  dotNumber?: string;
  physicalCustomerAddressId?: number;
  shipToCustomerAddressId?: number;
  billingCustomerAddressId?: number;
  billToCustomerId?: number;
  primaryCustomerEmployeeId?: number;
  fleetCustomerEmployeeId?: number;
  created?: string;
  modified?: string;
}

export interface CustomerUnit {
  customerUnitId: number;
  customerId: number;
  active: boolean;
  number?: string;
  fleetNumber?: string;
  title?: string;
  status?: string;
  licensePlate?: string;
  licensePlateState?: string;
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  entityUnitTypeId?: number;
  subEntityUnitTypeId?: number;
  customerAddressId?: number;
  shopHasPossession: boolean;
  accessMethod?: string;
  assistWithPreventiveMaintenance: boolean;
  trackPreventiveMaintenance: boolean;
  created?: string;
  modified?: string;
  
  // AutoCare standardized vehicle information
  standardizedVehicle?: StandardizedVehicle;
  vehicleAlternatives?: StandardizedVehicle[];
  
  // Vehicle matching failure information
  matchFailureReason?: VehicleMatchFailureReason;
  matchFailureDetails?: string;
  
  // EAV custom fields (all entity-specific fields)
  customFields?: { [key: string]: any };
}

export interface CustomerUnitEntityComponentEntry {
  customerUnitEntityComponentEntryId: number;
  customerUnitId: number;
  entityComponentId: number;
  year?: number;
  make?: string;
  model?: string;
  mileage?: number;
  engine?: string;
  color?: string;
  size?: string;
  serial?: string;
  created?: string;
  modified?: string;
}

// EntityUnitType related interfaces
export interface EntityUnitType {
  entityUnitTypeId: number;
  parentEntityUnitTypeId?: number;
  entityId: number;
  title?: string;
  entityTaxLocationId?: number;
  preferredVehicleIdLabel?: string;
  disableVinValidation: boolean;
  excludeFromCarCount: boolean;
  isDefault: boolean;
  created?: string;
  modified?: string;
}

export interface EntityUnitTypeEntityComponentEntry {
  entityUnitTypeEntityComponentEntryId: number;
  entityUnitTypeId: number;
  entityComponentId: number;
  entityLaborRateId?: number;
  trackUsage?: string;
  created?: string;
  modified?: string;
}

export interface EntityUnitTypeEntityComponentSystemEntry {
  entityUnitTypeEntityComponentSystemEntryId: number;
  entityUnitTypeId: number;
  entityComponentSystemId: number;
  created?: string;
  modified?: string;
}

export interface EntityUnitTypeEntityComponentSystemCorrectionEntry {
  entityUnitTypeEntityComponentSystemCorrectionEntryId: number;
  entityUnitTypeId: number;
  entityComponentSystemCorrectionId: number;
  created?: string;
  modified?: string;
}

// Aggregated EntityUnitType data structure
export interface EntityUnitTypeData {
  entityUnitTypeId: number;
  parentEntityUnitTypeId?: number;
  entityId: number;
  title?: string;
  entityTaxLocationId?: number;
  preferredVehicleIdLabel?: string;
  disableVinValidation: boolean;
  excludeFromCarCount: boolean;
  isDefault: boolean;
  components: EntityUnitTypeEntityComponentEntry[];
  componentSystems: EntityUnitTypeEntityComponentSystemEntry[];
  componentSystemCorrections: EntityUnitTypeEntityComponentSystemCorrectionEntry[];
  created?: string;
  modified?: string;
}

export interface RepairOrder {
  repairOrderId: number;
  repairOrderNumber: number;
  createdFromRepairOrderId?: number;
  createdByEntityEmployeeId?: number;
  serviceWriterEntityEmployeeId?: number;
  repairOrderType: string;
  priority?: number;
  entityEmployeeId?: number;
  partsEntityEmployeeId?: number;
  workFlowStatus?: string;
  partsFlowStatus?: string;
  customerAuthorizedOnHoursOnly: boolean;
  entityLocationId?: number;
  customerId?: number;
  customerUnitId?: number;
  entityTaxLocationId?: number;
  description?: string;
  submitterCustomerEmployeeId?: number;
  authorizerCustomerEmployeeId?: number;
  billingCustomerId?: number;
  created?: string;
  modified?: string;
  scheduledDate?: string;
  completedDate?: string;
}

export interface Address {
  addressId: number;
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  created?: string;
  modified?: string;
}

export interface EntityEmployee {
  entityEmployeeId: number;
  entityId: number;
  active: boolean;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  entityRoleId?: number;
  created?: string;
  modified?: string;
}

export interface CustomerEmployee {
  customerEmployeeId: number;
  customerId: number;
  active: boolean;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  position?: string;
  isPrimary: boolean;
  created?: string;
  modified?: string;
}

export interface RepairOrderActionItem {
  repairOrderActionItemId: number;
  repairOrderId: number;
  active?: number;
  createdByCustomerEmployeeId?: number;
  createdByEntityEmployeeId?: number;
  createdByIpAddress?: string;
  createdFrom?: string;
  actionItemType?: string;
  actionItemTypeMisc?: string;
  description?: string;
  hours?: number;
  entityLaborRateId?: number;
  manualLaborRate?: string;
  entityQuickBooksItemId?: number;
  manualEntityQuickBooksItem?: number;
  status?: string;
  totalAmount?: number;
  created?: string;
  modified?: string;
  // Legacy fields for compatibility
  laborHours?: number;
  laborRate?: number;
  completedDate?: string;
  entityEmployeeId?: number;
}

export interface RepairOrderInvoice {
  repairOrderInvoiceId: number;
  repairOrderId?: number;
  customerId?: number;
  entityLocationId?: number;
  status?: string;
  accountReceivableStatusId?: number;
  exported: boolean;
  invoiceDate?: string;
  invoiceNumber: number;
  invoiceDelinquentOverCreditLimit?: number;
  invoiceDelinquentPastDue?: string;
  entityEmployeeId?: number;
  ipAddress?: string;
  customerTitle?: string;
  customerBillingEmployee?: string;
  customerBillingEmail?: string;
  customerBillingAddress?: string;
  shopTitle?: string;
  shopBillingEmployee?: string;
  shopBillingEmail?: string;
  shopBillingAddress?: string;
  chargeTotal?: number;
  costTotal?: number;
  distanceTotal?: number;
  distanceCostTotal?: number;
  partsTotal?: number;
  laborHoursTotal?: number;
  laborTotal?: number;
  suppliesPercentage?: number;
  suppliesTotal?: number;
  subTotal?: number;
  taxPercentage?: number;
  taxTotal?: number;
  total?: number;
  balance?: number;
  quickBooksId?: string;
  sentToFleetNet: boolean;
  fleetNetDocId?: number;
  sentToIbs: boolean;
  closedWithoutInvoice: boolean;
  promiseToPayDate?: string;
  created?: string;
  modified?: string;
  invoiceExportedToWhatConverts: boolean;
}

export interface RepairOrderInvoicePayment {
  repairOrderInvoicePaymentId: number;
  repairOrderInvoiceId?: number;
  customerPaymentId?: number;
  customerEmployeeId?: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  amount?: number;
  type?: string;
  description?: string;
  created?: string;
  modified?: string;
}

export interface RepairOrderCharge {
  repairOrderChargeId: number;
  repairOrderId?: number;
  repairOrderActionItemCorrectionPartId?: number;
  entityFeeId?: number;
  creatorEntityEmployeeId: number;
  creatorIpAddress?: string;
  position: number;
  title?: string;
  itemEntityLocationQuickBooksInformationId: number;
  overrideIsTaxable?: 'T' | 'NT';
  quantity: number;
  amount?: number;
  percentage?: number;
  minAmount: number;
  maxAmount: number;
  perItemFee: number;
  applyTo: string;
  financialsItemId?: number;
  created?: string;
  addedFrom: string;
  modified?: string;
}

export interface RepairOrderActionItemCorrection {
  repairOrderActionItemCorrectionId: number;
  repairOrderActionItemId: number;
  entityComponentId: number;
  entityComponentSystemId: number;
  entityComponentSystemCorrectionId: number;
  customerUnitEntityComponentSystemCorrectionId?: number;
  entityLaborRateId?: number;
  manualLaborRate?: number;
  entityQuickBooksItemId?: number;
  manualEntityQuickBooksItem?: number;
  title?: string;
  description?: string;
  actualCorrection?: string;
  hours?: number;
  hoursSetFromMotor?: number;
  hoursSetFromMitchell1?: number;
  customerAuthorizedHours?: number;
  partCost?: number;
  customerAuthorizedPartCost?: number;
  correctionPerformed?: string;
  checklistDisplayMethod?: string;
  preAuthorized?: number;
  prePaid?: number;
  checklistShowOnPrintOut?: number;
  customerAuthorizedHoursCost?: number;
  rawPartCost?: number;
  hoursCost?: number;
  overrideHoursCost?: number;
  overrideLaborIsTaxable?: 'T' | 'NT';
  percentDiscount?: number;
  expectedHours?: number;
  created?: string;
  modified?: string;
}

export interface RepairOrderActionItemCorrectionPart {
  repairOrderActionItemCorrectionPartId: number;
  repairOrderActionItemCorrectionId: number;
  entityComponentSystemCorrectionPartId?: number;
  chosenRepairOrderQuoteVendorPartId?: number;
  title?: string;
  description?: string;
  quantity?: number;
  shopNumber?: string;
  vendorNumber?: string;
  rawPartCost?: number;
  rawPartTotal?: number;
  partCost?: number;
  partTotal?: number;
  partCostOverriden?: number;
  installed?: number;
  entityLocationPartId?: number;
  entityLocationPartOrderEntryId?: number;
  entityPriceFilePartId?: number;
  historyRepairOrderQuoteVendorPartId?: number;
  coreType?: string;
  associatedDirtyCoreRepairOrderActionItemCorrectionPartId?: number;
  associatedInherentCoreRepairOrderActionItemCorrectionPartId?: number;
  includeInFixedPriceService?: number;
  notUsed?: number;
  outsideService?: number;
  accountEntityLocationQuickBooksInformationId?: number;
  itemEntityLocationQuickBooksInformationId?: number;
  manualItemEntityLocationQuickBooksInformation?: number;
  overrideIsTaxable?: 'T' | 'NT';
  partCategoryTableCategoryId?: number;
  addedByVendor?: number;
  financialsAccountId?: number;
  financialsItemId?: number;
  position?: number;
  created?: string;
  modified?: string;
  
  // AutoCare standardized parts information
  standardizedPart?: StandardizedPart;
  standardizedPartAlternatives?: StandardizedPart[];
  
  // Parts matching failure information
  matchFailureReason?: PartsMatchFailureReason;
  matchFailureDetails?: string;
}

export interface RepairOrderActionItemCorrectionChecklist {
  repairOrderActionItemCorrectionChecklistId: number;
  repairOrderActionItemCorrectionId: number;
  parentRepairOrderActionItemCorrectionChecklistId?: number;
  type?: string;
  entityComponentSystemCorrectionChecklistId: number;
  title?: string;
  description?: string;
  position?: number;
  complaintDescription?: string;
  defect?: number;
  dependency?: string;
  defectRepairOrderActionItemId?: number;
  status?: string;
  textRequired?: number;
  skipEvaluate?: number;
  value?: string;
  created?: string;
  modified?: string;
}

export interface CustomerPayment {
  customerPaymentId: number;
  customerId: number;
  entityLocationId?: number;
  accountHolderName?: string;
  accountNumberLastFour?: string;
  creatorEntityEmployeeId?: number;
  creatorIpAddress?: string;
  status?: string;
  accountReceivableStatusId?: number;
  exported?: boolean;
  paymentDate?: string;
  notifyVisaSurcharge?: string;
  netTotal?: string;
  amount: string; // Changed to string to match actual data
  balance?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  routingNumberLastFour?: string;
  created?: string;
  modified?: string;
}

export interface EntityInvoice {
  entityInvoiceId: number;
  entityId: number;
  customerId?: number;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  subtotal?: number;
  taxAmount?: number;
  totalAmount?: number;
  paidAmount?: number;
  status?: string;
  created?: string;
  modified?: string;
}

export interface EntityLocationPart {
  entityLocationPartId: number;
  entityLocationId: number;
  entityPartId: number;
  partNumber?: string;
  description?: string;
  quantityOnHand?: number;
  cost?: number;
  price?: number;
  active: boolean;
  created?: string;
  modified?: string;
}

// Denormalized output types
export interface DenormalizedCompany {
  entityId: number;
  basicInfo: {
    status?: string;
    legalName?: string;
    title?: string;
    taxId?: string;
  };
  contact: {
    phone?: string;
    email?: string;
    website?: string;
    fullbayWebsite?: string;
    addresses?: Address[];
  };
  billing: {
    paymentMethod?: string;
    billingMethod?: string;
  };
  locations: DenormalizedLocation[];
  employees: DenormalizedEmployee[];
  metadata: {
    created?: string;
    modified?: string;
    exportTimestamp: string;
    processingMode?: 'full' | 'basic';
  };
}

export interface DenormalizedLocation {
  entityLocationId: number;
  entityId: number;
  basicInfo: {
    name?: string;
    title?: string;
    active: boolean;
    shop: boolean;
  };
  contact: {
    phone?: string;
    email?: string;
    addresses?: Address[];
  };
}

export interface DenormalizedCustomer {
  customerId: number;
  entityId: number;
  basicInfo: {
    legalName?: string;
    title?: string;
    status?: string;
    active: boolean;
  };
  contact: {
    phone?: string;
    addresses?: Address[];
    employees?: DenormalizedCustomerEmployee[];
  };
  billing: {
    billToCustomerId?: number;
    billingAddress?: Address;
  };
  units: DenormalizedUnit[];
  serviceHistory: {
    totalRepairOrders: number;
    completedOrders: number;
    inProgressOrders: number;
    lastServiceDate?: string;
  };
  financials: {
    totalLifetimeValue: number;
    totalPaid: number;
    outstandingBalance: number;
  };
  metadata: {
    created?: string;
    modified?: string;
    exportTimestamp: string;
  };
}

export interface DenormalizedUnit {
  customerUnitId: number;
  customerId: number;
  basicInfo: {
    number?: string;
    fleetNumber?: string;
    title?: string;
    status?: string;
    active: boolean;
  };
  vehicle: {
    licensePlate?: string;
    licensePlateState?: string;
    make?: string;
    model?: string;
    year?: number;
    vin?: string;
    entityUnitTypeId?: number;
    standardizedVehicle?: StandardizedVehicle;
    vehicleAlternatives?: StandardizedVehicle[];
    customFields?: { [key: string]: any };
  };
  location: {
    customerAddressId?: number;
    shopHasPossession: boolean;
    accessMethod?: string;
  };
  maintenance: {
    assistWithPM: boolean;
    trackPM: boolean;
  };
  serviceHistory: {
    totalServiceOrders: number;
    lastServiceDate?: string;
  };
  // New: EntityUnitType aggregated data
  unitType?: {
    entityUnitTypeId: number;
    parentEntityUnitTypeId?: number;
    title?: string;
    entityTaxLocationId?: number;
    preferredVehicleIdLabel?: string;
    disableVinValidation: boolean;
    excludeFromCarCount: boolean;
    isDefault: boolean;
    components: Array<{
      entityUnitTypeEntityComponentEntryId: number;
      entityComponentId: number;
      entityLaborRateId?: number;
      trackUsage?: string;
    }>;
    componentSystems: Array<{
      entityUnitTypeEntityComponentSystemEntryId: number;
      entityComponentSystemId: number;
    }>;
    componentSystemCorrections: Array<{
      entityUnitTypeEntityComponentSystemCorrectionEntryId: number;
      entityComponentSystemCorrectionId: number;
    }>;
  };
  // New: SubEntityUnitType aggregated data
  subUnitType?: {
    entityUnitTypeId: number;
    parentEntityUnitTypeId?: number;
    title?: string;
    entityTaxLocationId?: number;
    preferredVehicleIdLabel?: string;
    disableVinValidation: boolean;
    excludeFromCarCount: boolean;
    isDefault: boolean;
    components: Array<{
      entityUnitTypeEntityComponentEntryId: number;
      entityComponentId: number;
      entityLaborRateId?: number;
      trackUsage?: string;
    }>;
    componentSystems: Array<{
      entityUnitTypeEntityComponentSystemEntryId: number;
      entityComponentSystemId: number;
    }>;
    componentSystemCorrections: Array<{
      entityUnitTypeEntityComponentSystemCorrectionEntryId: number;
      entityComponentSystemCorrectionId: number;
    }>;
  };
}

export interface DenormalizedEmployee {
  entityEmployeeId: number;
  entityId: number;
  basicInfo: {
    firstName?: string;
    lastName?: string;
    active: boolean;
  };
  contact: {
    email?: string;
    phone?: string;
  };
  role: {
    entityRoleId?: number;
    roleName?: string;
  };
}

export interface DenormalizedCustomerEmployee {
  customerEmployeeId: number;
  customerId: number;
  basicInfo: {
    firstName?: string;
    lastName?: string;
    active: boolean;
    isPrimary: boolean;
  };
  contact: {
    email?: string;
    phone?: string;
    position?: string;
  };
}

export interface DenormalizedServiceOrder {
  repairOrderId: number;
  repairOrderNumber: number;
  basicInfo: {
    repairOrderType: string;
    priority?: number;
    workFlowStatus?: string;
    description?: string;
  };
  assignment: {
    entityLocationId?: number;
    serviceWriterEntityEmployeeId?: number;
    entityEmployeeId?: number;
    partsEntityEmployeeId?: number;
  };
  customer: {
    customerId?: number;
    customerUnitId?: number;
    billingCustomerId?: number;
  };
  dates: {
    created?: string;
    scheduled?: string;
    completed?: string;
  };
  actionItems: RepairOrderActionItem[];
  totals: {
    laborTotal: number;
    partsTotal: number;
    totalAmount: number;
  };
  // Financial data
  invoice?: RepairOrderInvoice;
  invoicePayments?: RepairOrderInvoicePayment[];
  charges?: RepairOrderCharge[];
  // Correction system data
  corrections?: RepairOrderActionItemCorrection[];
  correctionParts?: RepairOrderActionItemCorrectionPart[];
  correctionChecklists?: RepairOrderActionItemCorrectionChecklist[];
}

// Second-level Entity table interfaces
export interface EntityHistory {
  entityHistoryId: number;
  entityId: number;
  adminId?: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityInformation {
  entityInformationId: number;
  entityId: number;
  informationName?: string;
  informationValue?: string;
}

export interface EntityRole {
  entityRoleId: number;
  entityId: number;
  title?: string;
  created?: string;
  modified?: string;
}

export interface EntityNote {
  entityNoteId: number;
  entityId: number;
  adminId?: number;
  entityEmployeeId?: number;
  note?: string;
  created?: string;
  modified?: string;
}

export interface EntityFee {
  entityFeeId: number;
  entityId: number;
  entityQuickBooksItemId: number;
  title: string;
  type: string;
  fee: number;
  minFee: number;
  maxFee: number;
  perItemFee: number;
  applyTo: string;
  associatedShops?: string; // JSON string
  automationType: string;
  created?: string;
  modified?: string;
}

export interface EntityAddress {
  entityAddressId: number;
  entityId: number;
  title?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  created?: string;
  modified?: string;
}

export interface EntityComponent {
  entityComponentId: number;
  entityId: number;
  componentId: number;
  active: boolean;
  created?: string;
  modified?: string;
}

export interface EntityDepartment {
  entityDepartmentId: number;
  entityId: number;
  title?: string;
  created?: string;
  modified?: string;
}

export interface EntityManufacturer {
  entityManufacturerId: number;
  entityId: number;
  title?: string;
  created?: string;
  modified?: string;
}

export interface EntityPart {
  entityPartId: number;
  entityId: number;
  partNumber?: string;
  description?: string;
  created?: string;
  modified?: string;
}

// Customer second-level tables (similar to Entity pattern)
export interface CustomerHistory {
  customerHistoryId: number;
  customerId: number;
  entityEmployeeId?: number; // Corrected field name
  ipAddress?: string;
  changedValues?: string; // Corrected field name
  created?: string;
}

export interface CustomerNote {
  customerNoteId: number;
  customerId: number;
  entityEmployeeId?: number; // Corrected field name
  position?: number; // Added missing field
  note?: string;
  created?: string;
  modified?: string;
}

export interface CustomerAddress {
  customerAddressId: number;
  customerId: number;
  owner_type?: string;
  owner_id?: number;
  active: boolean;
  defaultUnitLocation?: boolean;
  entityTaxLocationId?: number;
  title?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  distanceToLocation?: string;
  timeToLocation?: string;
  note?: string;
  created?: string;
  modified?: string;
}

export interface CustomerCredit {
  customerCreditId: number;
  customerId: number;
  creditLimit?: number;
  currentBalance?: number;
  availableCredit?: number;
  termsId?: number;
  created?: string;
  modified?: string;
}

export interface CustomerLocation {
  customerLocationId: number;
  entityLocationId: number;
  title?: string;
  customerId?: number; // Added when joining with CustomerEntityLocationEntry
}

// CustomerEntityLocationEntry - intermediate table linking Customer to EntityLocation
export interface CustomerEntityLocationEntry {
  customerEntityLocationEntryId: number;
  customerId: number;
  entityLocationId: number;
  classQuickBooksId?: string;
  entityLaborRateId?: number;
  entityTaxLocationId?: number;
  quickBooksId?: string;
  quickBooksSyncToken?: string;
  whatConvertsLeadId?: string;
}

// Enhanced Entity aggregation with 12 second-level tables
export interface EnhancedEntity extends Entity {
  // 12 second-level Entity tables aggregated (always present, may be empty arrays)
  history: EntityHistory[];
  information: EntityInformation[];
  roles: EntityRole[];
  notes: EntityNote[];
  fees: EntityFee[];
  addresses: EntityAddress[];
  components: EntityComponent[];
  departments: EntityDepartment[];
  parts: EntityPart[];
  employees: EntityEmployee[];
  locations: EntityLocation[];
  invoices: EntityInvoice[];
}

// Enhanced Customer aggregation with 8 second-level tables (Customer is the 1st level)
export interface EnhancedCustomer extends Customer {
  // 8 second-level Customer tables aggregated (always present, may be empty arrays)
  history: CustomerHistory[];
  notes: CustomerNote[];
  addresses: CustomerAddress[];
  credits: CustomerCredit[];
  locations: CustomerLocation[];
  employees: CustomerEmployee[];
  payments: CustomerPayment[];
  units: CustomerUnit[];
}
