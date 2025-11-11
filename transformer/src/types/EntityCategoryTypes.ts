// Entity Category Data Structures
// Organizes all 126 Entity tables into 7 logical categories

import { 
  Entity, EntityAddress, EntityLocation, EntityEmployee, EntityRole, EntityHistory,
  EntityInformation, EntityNote, EntityFee, EntityComponent, EntityDepartment, 
  EntityPart, EntityInvoice, EntityManufacturer
} from './DatabaseTypes';

import {
  // Employee Management Tables (15 interfaces)
  EntityEmployeeAchievementHistory, EntityEmployeeEntityLocationEntry, EntityEmployeeEntityRoleEntry,
  EntityEmployeeEventHistory, EntityEmployeeFilter, EntityEmployeeHistory, EntityEmployeeNoteStatus,
  EntityEmployeeNotificationConfiguration, EntityEmployeeNotificationSettings, EntityEmployeeNotificationStatus,
  EntityEmployeeReportFavorite, EntityEmployeeSchedule, EntityEmployeeStatisticEntry,
  EntityEmployeeTimeStamp, EntityEmployeeTimeStampActivity,

  // Location Management Tables (10 interfaces)
  EntityLocationApiConnection, EntityLocationApiIntegration, EntityLocationCalendarEvent,
  EntityLocationCalendarEventEntityEmployeeEntry, EntityLocationEntityFeeEntry, EntityLocationHistory,
  EntityLocationNotificationSettings, EntityLocationNotificationStatus, EntityLocationQuickBooksDesktopInformation,
  EntityLocationQuickBooksInformation,

  // Parts and Inventory Tables (43 interfaces)
  EntityPartCrossReference, EntityPartTableTag, EntityPartVendor, EntityPartVendorAddress,
  EntityPartVendorAddressHistory, EntityPartVendorBridgestoneProductLine, EntityPartVendorContact,
  EntityPartVendorContactHistory, EntityPartVendorCredit, EntityPartVendorCreditLine,
  EntityPartVendorEntityLocationEntry, EntityPartVendorHistory, EntityPartVendorInvoice,
  EntityPartVendorInvoiceEntityLocationPartOrderEntryEntry, EntityPartVendorInvoiceRepairOrderOrderVendorPartEntry,
  EntityPartVendorPayment, EntityPartVendorPaymentEntityPartVendorCreditEntry, EntityPartVendorPaymentEntityPartVendorInvoiceEntry,
  EntityLocationPartAdjustment, EntityLocationPartAdjustmentEntry, EntityLocationPartEntityLocationPartLocationEntry,
  EntityLocationPartHistory, EntityLocationPartIncoming, EntityLocationPartKit, EntityLocationPartKitEntry,
  EntityLocationPartLocation, EntityLocationPartOrder, EntityLocationPartOrderEntry, EntityLocationPartOrderEntryHistory,
  EntityLocationPartOrderHistory, EntityLocationPartOutgoing, EntityLocationPartOutgoingAdjustmentHistory,
  EntityLocationPartSerialized, EntityLocationPartSerializedSerial, EntityLocationPartSerializedTireDetail,
  EntityLocationPartSerializedTireDetailHeader, EntityLocationPartSerializedTireDetailNote,
  EntityLocationPartSerializedTireDetailRawMaterial, EntityLocationPartSerializedTireDetailRepairPart,
  EntityLocationPartTransfer, EntityLocationPartTransferEntry,

  // Financial and Billing Tables (20 interfaces)
  EntityFeeHistory, EntityFeePaymentMethod, EntityInvoiceRow, EntityLaborRate, EntityLaborRateHistory,
  EntityPaymentMethod, EntityCreditTerm, EntityTaxLocation, EntityTaxLocationEntityLocationEntry,
  EntityTaxLocationEntry, EntityTaxLocationQuickBooksItemTaxability, EntityPartsMarkUp, EntityPartsMarkUpMatrix,
  EntityPartsMarkUpScale, EntityDistanceRate, EntityOutsideServicesRate, EntityOutsideServicesRateScale,
  EntitySuppliesRate,

  // Service and Component Tables (16 interfaces)
  EntityComponentField, EntityComponentFieldResponse, EntityComponentSystem, EntityComponentSystemCorrection,
  EntityComponentSystemCorrectionChecklist, EntityComponentSystemCorrectionEntityComponentFieldEntry,
  EntityComponentSystemCorrectionKit, EntityComponentSystemCorrectionKitEntry, EntityComponentSystemCorrectionPart,
  EntityComponentSystemCorrectionUsage, EntityComponentSystemEntityComponentFieldEntry, EntityUnitType,
  EntityUnitTypeEntityComponentEntry, EntityUnitTypeEntityComponentSystemEntry, EntityUnitTypeEntityComponentSystemCorrectionEntry,

  // Configuration and Settings Tables (16 interfaces)
  EntityRoleHistory, EntityRolePermissionEntry, EntityTermsOfService, EntityPriceFilePart,
  EntityPriceFilePartHistory, EntityProductDiscount, EntityQuickBooksAccount, EntityQuickBooksItem,
  EntityQuickBooksItemPriority, EntityRepairOrderSeverityOptions, EntityRepairOrderUrgencyOptions,
  EntityRepairRequestUrgency
} from './EntityTableTypes';

// ===== CATEGORY DATA INTERFACES =====

// Core Business Data (6 tables)
export interface CoreBusinessData {
  entity: Entity;
  addresses: EntityAddress[];
  locations: EntityLocation[];
  employees: EntityEmployee[];
  roles: EntityRole[];
  history: EntityHistory[];
  metadata: {
    entityId: number;
    category: 'Core Business';
    totalRecords: number;
    tableCount: 6;
    exportTimestamp: string;
  };
}

// Employee Management Data (15 tables)
export interface EmployeeManagementData {
  achievementHistory: EntityEmployeeAchievementHistory[];
  entityLocationEntry: EntityEmployeeEntityLocationEntry[];
  entityRoleEntry: EntityEmployeeEntityRoleEntry[];
  eventHistory: EntityEmployeeEventHistory[];
  filter: EntityEmployeeFilter[];
  history: EntityEmployeeHistory[];
  noteStatus: EntityEmployeeNoteStatus[];
  notificationConfiguration: EntityEmployeeNotificationConfiguration[];
  notificationSettings: EntityEmployeeNotificationSettings[];
  notificationStatus: EntityEmployeeNotificationStatus[];
  reportFavorite: EntityEmployeeReportFavorite[];
  schedule: EntityEmployeeSchedule[];
  statisticEntry: EntityEmployeeStatisticEntry[];
  timeStamp: EntityEmployeeTimeStamp[];
  timeStampActivity: EntityEmployeeTimeStampActivity[];
  metadata: {
    entityId: number;
    category: 'Employee Management';
    totalRecords: number;
    tableCount: 15;
    exportTimestamp: string;
  };
}

// Location Management Data (10 tables)
export interface LocationManagementData {
  apiConnection: EntityLocationApiConnection[];
  apiIntegration: EntityLocationApiIntegration[];
  calendarEvent: EntityLocationCalendarEvent[];
  calendarEventEntityEmployeeEntry: EntityLocationCalendarEventEntityEmployeeEntry[];
  entityFeeEntry: EntityLocationEntityFeeEntry[];
  history: EntityLocationHistory[];
  notificationSettings: EntityLocationNotificationSettings[];
  notificationStatus: EntityLocationNotificationStatus[];
  quickBooksDesktopInformation: EntityLocationQuickBooksDesktopInformation[];
  quickBooksInformation: EntityLocationQuickBooksInformation[];
  metadata: {
    entityId: number;
    category: 'Location Management';
    totalRecords: number;
    tableCount: 10;
    exportTimestamp: string;
  };
}

// Parts and Inventory Data (43 tables)
export interface PartsInventoryData {
  // EntityPart related (4 tables)
  parts: EntityPart[];
  partCrossReference: EntityPartCrossReference[];
  partTableTag: EntityPartTableTag[];
  
  // EntityPartVendor related (19 tables)
  partVendor: EntityPartVendor[];
  partVendorAddress: EntityPartVendorAddress[];
  partVendorAddressHistory: EntityPartVendorAddressHistory[];
  partVendorBridgestoneProductLine: EntityPartVendorBridgestoneProductLine[];
  partVendorContact: EntityPartVendorContact[];
  partVendorContactHistory: EntityPartVendorContactHistory[];
  partVendorCredit: EntityPartVendorCredit[];
  partVendorCreditLine: EntityPartVendorCreditLine[];
  partVendorEntityLocationEntry: EntityPartVendorEntityLocationEntry[];
  partVendorHistory: EntityPartVendorHistory[];
  partVendorInvoice: EntityPartVendorInvoice[];
  partVendorInvoiceEntityLocationPartOrderEntryEntry: EntityPartVendorInvoiceEntityLocationPartOrderEntryEntry[];
  partVendorInvoiceRepairOrderOrderVendorPartEntry: EntityPartVendorInvoiceRepairOrderOrderVendorPartEntry[];
  partVendorPayment: EntityPartVendorPayment[];
  partVendorPaymentEntityPartVendorCreditEntry: EntityPartVendorPaymentEntityPartVendorCreditEntry[];
  partVendorPaymentEntityPartVendorInvoiceEntry: EntityPartVendorPaymentEntityPartVendorInvoiceEntry[];
  
  // EntityLocationPart related (20 tables)
  locationPart: import('./DatabaseTypes').EntityLocationPart[];
  locationPartAdjustment: EntityLocationPartAdjustment[];
  locationPartAdjustmentEntry: EntityLocationPartAdjustmentEntry[];
  locationPartEntityLocationPartLocationEntry: EntityLocationPartEntityLocationPartLocationEntry[];
  locationPartHistory: EntityLocationPartHistory[];
  locationPartIncoming: EntityLocationPartIncoming[];
  locationPartKit: EntityLocationPartKit[];
  locationPartKitEntry: EntityLocationPartKitEntry[];
  locationPartLocation: EntityLocationPartLocation[];
  locationPartOrder: EntityLocationPartOrder[];
  locationPartOrderEntry: EntityLocationPartOrderEntry[];
  locationPartOrderEntryHistory: EntityLocationPartOrderEntryHistory[];
  locationPartOrderHistory: EntityLocationPartOrderHistory[];
  locationPartOutgoing: EntityLocationPartOutgoing[];
  locationPartOutgoingAdjustmentHistory: EntityLocationPartOutgoingAdjustmentHistory[];
  locationPartSerialized: EntityLocationPartSerialized[];
  locationPartSerializedSerial: EntityLocationPartSerializedSerial[];
  locationPartSerializedTireDetail: EntityLocationPartSerializedTireDetail[];
  locationPartSerializedTireDetailHeader: EntityLocationPartSerializedTireDetailHeader[];
  locationPartSerializedTireDetailNote: EntityLocationPartSerializedTireDetailNote[];
  locationPartSerializedTireDetailRawMaterial: EntityLocationPartSerializedTireDetailRawMaterial[];
  locationPartSerializedTireDetailRepairPart: EntityLocationPartSerializedTireDetailRepairPart[];
  locationPartTransfer: EntityLocationPartTransfer[];
  locationPartTransferEntry: EntityLocationPartTransferEntry[];
  
  metadata: {
    entityId: number;
    category: 'Parts and Inventory';
    totalRecords: number;
    tableCount: 43;
    exportTimestamp: string;
  };
}

// Financial and Billing Data (20 tables)
export interface FinancialBillingData {
  // Fee related
  fee: EntityFee[];
  feeHistory: EntityFeeHistory[];
  feePaymentMethod: EntityFeePaymentMethod[];
  
  // Invoice related
  invoice: EntityInvoice[];
  invoiceRow: EntityInvoiceRow[];
  
  // Labor rate
  laborRate: EntityLaborRate[];
  laborRateHistory: EntityLaborRateHistory[];
  
  // Payment methods and credit terms
  paymentMethod: EntityPaymentMethod[];
  creditTerm: EntityCreditTerm[];
  
  // Tax configuration
  taxLocation: EntityTaxLocation[];
  taxLocationEntityLocationEntry: EntityTaxLocationEntityLocationEntry[];
  taxLocationEntry: EntityTaxLocationEntry[];
  taxLocationQuickBooksItemTaxability: EntityTaxLocationQuickBooksItemTaxability[];
  
  // Parts pricing
  partsMarkUp: EntityPartsMarkUp[];
  partsMarkUpMatrix: EntityPartsMarkUpMatrix[];
  partsMarkUpScale: EntityPartsMarkUpScale[];
  
  // Other rates
  distanceRate: EntityDistanceRate[];
  outsideServicesRate: EntityOutsideServicesRate[];
  outsideServicesRateScale: EntityOutsideServicesRateScale[];
  suppliesRate: EntitySuppliesRate[];
  
  metadata: {
    entityId: number;
    category: 'Financial and Billing';
    totalRecords: number;
    tableCount: 20;
    exportTimestamp: string;
  };
}

// Service and Component Data (16 tables)
export interface ServiceComponentData {
  // Component related
  component: EntityComponent[];
  componentField: EntityComponentField[];
  componentFieldResponse: EntityComponentFieldResponse[];
  componentSystem: EntityComponentSystem[];
  componentSystemCorrection: EntityComponentSystemCorrection[];
  componentSystemCorrectionChecklist: EntityComponentSystemCorrectionChecklist[];
  componentSystemCorrectionEntityComponentFieldEntry: EntityComponentSystemCorrectionEntityComponentFieldEntry[];
  componentSystemCorrectionKit: EntityComponentSystemCorrectionKit[];
  componentSystemCorrectionKitEntry: EntityComponentSystemCorrectionKitEntry[];
  componentSystemCorrectionPart: EntityComponentSystemCorrectionPart[];
  componentSystemCorrectionUsage: EntityComponentSystemCorrectionUsage[];
  componentSystemEntityComponentFieldEntry: EntityComponentSystemEntityComponentFieldEntry[];
  
  // Unit type related
  unitType: EntityUnitType[];
  unitTypeEntityComponentEntry: EntityUnitTypeEntityComponentEntry[];
  unitTypeEntityComponentSystemEntry: EntityUnitTypeEntityComponentSystemEntry[];
  unitTypeEntityComponentSystemCorrectionEntry: EntityUnitTypeEntityComponentSystemCorrectionEntry[];
  
  metadata: {
    entityId: number;
    category: 'Service and Component';
    totalRecords: number;
    tableCount: 16;
    exportTimestamp: string;
  };
}

// Configuration and Settings Data (16 tables)
export interface ConfigurationSettingsData {
  // Basic configuration
  information: EntityInformation[];
  department: EntityDepartment[];
  manufacturer: EntityManufacturer[];
  note: EntityNote[];
  
  // Roles and permissions
  roleHistory: EntityRoleHistory[];
  rolePermissionEntry: EntityRolePermissionEntry[];
  
  // Terms of service
  termsOfService: EntityTermsOfService[];
  
  // Price files
  priceFilePart: EntityPriceFilePart[];
  priceFilePartHistory: EntityPriceFilePartHistory[];
  
  // Product discount
  productDiscount: EntityProductDiscount[];
  
  // QuickBooks integration
  quickBooksAccount: EntityQuickBooksAccount[];
  quickBooksItem: EntityQuickBooksItem[];
  quickBooksItemPriority: EntityQuickBooksItemPriority[];
  
  // Repair order options
  repairOrderSeverityOptions: EntityRepairOrderSeverityOptions[];
  repairOrderUrgencyOptions: EntityRepairOrderUrgencyOptions[];
  repairRequestUrgency: EntityRepairRequestUrgency[];
  
  metadata: {
    entityId: number;
    category: 'Configuration and Settings';
    totalRecords: number;
    tableCount: 16;
    exportTimestamp: string;
  };
}

// Combined data structure for all categories
export interface AllEntityCategoriesData {
  coreData: CoreBusinessData;
  employeeData: EmployeeManagementData;
  locationData: LocationManagementData;
  partsData: PartsInventoryData;
  financialData: FinancialBillingData;
  servicesData: ServiceComponentData;
  settingsData: ConfigurationSettingsData;
}
