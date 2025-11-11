// Entity Table Interfaces - All 126 Entity-related table interfaces
// This file contains interfaces for all Entity tables as identified from the database

// ===== EMPLOYEE MANAGEMENT TABLES (15 interfaces) =====

export interface EntityEmployeeAchievementHistory {
  entityEmployeeAchievementHistoryId: number;
  entityEmployeeId: number;
  achievementId: number;
  dateAchieved?: string;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeEntityLocationEntry {
  entityEmployeeEntityLocationEntryId: number;
  entityEmployeeId: number;
  entityLocationId: number;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeEntityRoleEntry {
  entityEmployeeEntityRoleEntryId: number;
  entityEmployeeId: number;
  entityRoleId: number;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeEventHistory {
  entityEmployeeEventHistoryId: number;
  entityEmployeeId: number;
  eventType?: string;
  eventDescription?: string;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeFilter {
  entityEmployeeFilterId: number;
  entityEmployeeId: number;
  filterName?: string;
  filterValue?: string;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeHistory {
  entityEmployeeHistoryId: number;
  entityEmployeeId: number;
  adminId?: number;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityEmployeeNoteStatus {
  entityEmployeeNoteStatusId: number;
  entityEmployeeId: number;
  noteId: number;
  status?: string;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeNotificationConfiguration {
  entityEmployeeNotificationConfigurationId: number;
  entityEmployeeId: number;
  notificationType?: string;
  isEnabled: boolean;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeNotificationSettings {
  entityEmployeeNotificationSettingsId: number;
  entityEmployeeId: number;
  settingName?: string;
  settingValue?: string;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeNotificationStatus {
  entityEmployeeNotificationStatusId: number;
  entityEmployeeId: number;
  notificationId: number;
  status?: string;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeReportFavorite {
  entityEmployeeReportFavoriteId: number;
  entityEmployeeId: number;
  reportName?: string;
  reportParameters?: string;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeSchedule {
  entityEmployeeScheduleId: number;
  entityEmployeeId: number;
  scheduleDate?: string;
  startTime?: string;
  endTime?: string;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeStatisticEntry {
  entityEmployeeStatisticEntryId: number;
  entityEmployeeId: number;
  statisticType?: string;
  statisticValue?: number;
  periodStart?: string;
  periodEnd?: string;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeTimeStamp {
  entityEmployeeTimeStampId: number;
  entityEmployeeId: number;
  clockIn?: string;
  clockOut?: string;
  totalHours?: number;
  created?: string;
  modified?: string;
}

export interface EntityEmployeeTimeStampActivity {
  entityEmployeeTimeStampActivityId: number;
  entityId: number;
  entityEmployeeId: number;
  activityType?: string;
  activityDescription?: string;
  startTime?: string;
  endTime?: string;
  created?: string;
  modified?: string;
}

// ===== LOCATION MANAGEMENT TABLES (10 interfaces) =====

export interface EntityLocationApiConnection {
  entityLocationApiConnectionId: number;
  entityLocationId: number;
  apiType?: string;
  connectionString?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityLocationApiIntegration {
  entityLocationApiIntegrationId: number;
  entityLocationId: number;
  integrationType?: string;
  integrationSettings?: string;
  isEnabled: boolean;
  created?: string;
  modified?: string;
}

export interface EntityLocationCalendarEvent {
  entityLocationCalendarEventId: number;
  entityLocationId: number;
  eventTitle?: string;
  eventDescription?: string;
  startDateTime?: string;
  endDateTime?: string;
  created?: string;
  modified?: string;
}

export interface EntityLocationCalendarEventEntityEmployeeEntry {
  entityLocationCalendarEventEntityEmployeeEntryId: number;
  entityLocationCalendarEventId: number;
  entityEmployeeId: number;
  role?: string;
  created?: string;
  modified?: string;
}

export interface EntityLocationEntityFeeEntry {
  entityLocationEntityFeeEntryId: number;
  entityLocationId: number;
  entityFeeId: number;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityLocationHistory {
  entityLocationHistoryId: number;
  entityLocationId: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityLocationNotificationSettings {
  entityLocationNotificationSettingsId: number;
  entityLocationId: number;
  settingName?: string;
  settingValue?: string;
  created?: string;
  modified?: string;
}

export interface EntityLocationNotificationStatus {
  entityLocationNotificationStatusId: number;
  entityLocationId: number;
  notificationId: number;
  status?: string;
  created?: string;
  modified?: string;
}

export interface EntityLocationQuickBooksDesktopInformation {
  entityLocationQuickBooksDesktopInformationId: number;
  entityLocationId: number;
  companyFile?: string;
  connectionString?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityLocationQuickBooksInformation {
  entityLocationQuickBooksInformationId: number;
  entityLocationId: number;
  companyId?: string;
  accessToken?: string;
  refreshToken?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

// ===== PARTS AND INVENTORY TABLES (43 interfaces) =====

export interface EntityPartCrossReference {
  entityPartCrossReferenceId: number;
  entityId: number;
  partNumber?: string;
  crossReferencePartNumber?: string;
  manufacturer?: string;
  created?: string;
  modified?: string;
}

export interface EntityPartTableTag {
  entityPartTableTagId: number;
  entityPartId: number;
  tableTagId: number;
  created?: string;
  modified?: string;
}

export interface EntityPartVendor {
  entityPartVendorId: number;
  entityId: number;
  vendorName?: string;
  vendorCode?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityPartVendorAddress {
  entityPartVendorAddressId: number;
  entityPartVendorId: number;
  addressType?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  created?: string;
  modified?: string;
}

export interface EntityPartVendorAddressHistory {
  entityPartVendorAddressHistoryId: number;
  entityPartVendorAddressId: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityPartVendorBridgestoneProductLine {
  entityPartVendorBridgestoneProductLineId: number;
  entityPartVendorId: number;
  productLineCode?: string;
  productLineName?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityPartVendorContact {
  entityPartVendorContactId: number;
  entityPartVendorId: number;
  contactName?: string;
  contactTitle?: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
  created?: string;
  modified?: string;
}

export interface EntityPartVendorContactHistory {
  entityPartVendorContactHistoryId: number;
  entityPartVendorContactId: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityPartVendorCredit {
  entityPartVendorCreditId: number;
  entityPartVendorId: number;
  creditLimit?: number;
  currentBalance?: number;
  availableCredit?: number;
  created?: string;
  modified?: string;
}

export interface EntityPartVendorCreditLine {
  entityPartVendorCreditLineId: number;
  entityPartVendorId: number;
  creditLineAmount?: number;
  interestRate?: number;
  termDays: number;
  created?: string;
  modified?: string;
}

export interface EntityPartVendorEntityLocationEntry {
  entityPartVendorEntityLocationEntryId: number;
  entityPartVendorId: number;
  entityLocationId: number;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityPartVendorHistory {
  entityPartVendorHistoryId: number;
  entityPartVendorId: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityPartVendorInvoice {
  entityPartVendorInvoiceId: number;
  entityPartVendorId: number;
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

export interface EntityPartVendorInvoiceEntityLocationPartOrderEntryEntry {
  entityPartVendorInvoiceEntityLocationPartOrderEntryEntryId: number;
  entityPartVendorInvoiceId: number;
  entityLocationPartOrderEntryId: number;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  created?: string;
  modified?: string;
}

export interface EntityPartVendorInvoiceRepairOrderOrderVendorPartEntry {
  entityPartVendorInvoiceRepairOrderOrderVendorPartEntryId: number;
  entityPartVendorInvoiceId: number;
  repairOrderId: number;
  vendorPartId: number;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  created?: string;
  modified?: string;
}

export interface EntityPartVendorPayment {
  entityPartVendorPaymentId: number;
  entityPartVendorId: number;
  paymentDate?: string;
  paymentAmount?: number;
  paymentMethod?: string;
  referenceNumber?: string;
  created?: string;
  modified?: string;
}

export interface EntityPartVendorPaymentEntityPartVendorCreditEntry {
  entityPartVendorPaymentEntityPartVendorCreditEntryId: number;
  entityPartVendorPaymentId: number;
  entityPartVendorCreditId: number;
  appliedAmount?: number;
  created?: string;
  modified?: string;
}

export interface EntityPartVendorPaymentEntityPartVendorInvoiceEntry {
  entityPartVendorPaymentEntityPartVendorInvoiceEntryId: number;
  entityPartVendorPaymentId: number;
  entityPartVendorInvoiceId: number;
  appliedAmount?: number;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartAdjustment {
  entityLocationPartAdjustmentId: number;
  entityLocationId: number;
  adjustmentDate?: string;
  adjustmentType?: string;
  reason?: string;
  totalValue?: number;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartAdjustmentEntry {
  entityLocationPartAdjustmentEntryId: number;
  entityLocationPartAdjustmentId: number;
  entityLocationPartId: number;
  quantityAdjusted: number;
  unitCost?: number;
  totalCost?: number;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartEntityLocationPartLocationEntry {
  entityLocationPartEntityLocationPartLocationEntryId: number;
  entityLocationPartId: number;
  entityLocationPartLocationId: number;
  quantity: number;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartHistory {
  entityLocationPartHistoryId: number;
  entityLocationPartId: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityLocationPartIncoming {
  entityLocationPartIncomingId: number;
  entityLocationId: number;
  entityLocationPartId: number;
  quantity: number;
  expectedDate?: string;
  receivedDate?: string;
  unitCost?: number;
  totalCost?: number;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartKit {
  entityLocationPartKitId: number;
  entityLocationId: number;
  kitName?: string;
  kitDescription?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartKitEntry {
  entityLocationPartKitEntryId: number;
  entityLocationPartKitId: number;
  entityLocationPartId: number;
  quantity: number;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartLocation {
  entityLocationPartLocationId: number;
  entityLocationId: number;
  locationName?: string;
  locationDescription?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartOrder {
  entityLocationPartOrderId: number;
  entityLocationId: number;
  orderNumber?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  actualDeliveryDate?: string;
  status?: string;
  totalAmount?: number;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartOrderEntry {
  entityLocationPartOrderEntryId: number;
  entityLocationPartOrderId: number;
  entityLocationPartId: number;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost?: number;
  totalCost?: number;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartOrderEntryHistory {
  entityLocationPartOrderEntryHistoryId: number;
  entityLocationPartOrderEntryId: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityLocationPartOrderHistory {
  entityLocationPartOrderHistoryId: number;
  entityLocationPartOrderId: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityLocationPartOutgoing {
  entityLocationPartOutgoingId: number;
  entityLocationId: number;
  entityLocationPartId: number;
  quantity: number;
  outgoingDate?: string;
  reason?: string;
  unitCost?: number;
  totalCost?: number;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartOutgoingAdjustmentHistory {
  entityLocationPartOutgoingAdjustmentHistoryId: number;
  entityLocationPartOutgoingId: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityLocationPartSerialized {
  entityLocationPartSerializedId: number;
  entityLocationId: number;
  entityLocationPartId: number;
  serialNumber?: string;
  status?: string;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartSerializedSerial {
  entityLocationPartSerializedSerialId: number;
  entityLocationPartSerializedId: number;
  serialNumber?: string;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartSerializedTireDetail {
  entityLocationPartSerializedTireDetailId: number;
  entityLocationPartSerializedId: number;
  tireSize?: string;
  treadDepth?: number;
  pressure?: number;
  condition?: string;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartSerializedTireDetailHeader {
  entityLocationPartSerializedTireDetailHeaderId: number;
  entityLocationPartSerializedTireDetailId: number;
  headerType?: string;
  headerValue?: string;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartSerializedTireDetailNote {
  entityLocationPartSerializedTireDetailNoteId: number;
  entityLocationPartSerializedTireDetailId: number;
  note?: string;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartSerializedTireDetailRawMaterial {
  entityLocationPartSerializedTireDetailRawMaterialId: number;
  entityLocationPartSerializedTireDetailId: number;
  materialType?: string;
  materialQuantity?: number;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartSerializedTireDetailRepairPart {
  entityLocationPartSerializedTireDetailRepairPartId: number;
  entityLocationPartSerializedTireDetailId: number;
  repairPartId: number;
  quantity: number;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartTransfer {
  entityLocationPartTransferId: number;
  fromEntityLocationId: number;
  toEntityLocationId: number;
  transferDate?: string;
  status?: string;
  created?: string;
  modified?: string;
}

export interface EntityLocationPartTransferEntry {
  entityLocationPartTransferEntryId: number;
  entityLocationPartTransferId: number;
  entityLocationPartId: number;
  quantity: number;
  created?: string;
  modified?: string;
}

// ===== FINANCIAL AND BILLING TABLES (20 interfaces) =====

export interface EntityFeeHistory {
  entityFeeHistoryId: number;
  entityId: number;
  entityFeeId: number;
  entityEmployeeId?: number;
  historyType?: string;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityFeePaymentMethod {
  entityFeePaymentMethodId: number;
  entityFeeId: number;
  paymentMethod: string;
  notifyVisa: number;
  created?: string;
  modified?: string;
}

export interface EntityInvoiceRow {
  entityInvoiceRowId: number;
  entityInvoiceId?: number;
  parentEntityInvoiceRowId?: number;
  entityLocationId?: number;
  productId: number;
  productLevel: number;
  priceBookProductBundleId: number;
  service?: string;
  quantity?: number;
  rate?: number;
  taxAmount: number;
  refunded: number;
  created?: string;
  modified?: string;
}

export interface EntityLaborRate {
  entityLaborRateId: number;
  entityId: number;
  title?: string;
  rate?: number;
  isDefault: boolean;
  entityQuickBooksItemId?: number;
  created?: string;
  modified?: string;
}

export interface EntityLaborRateHistory {
  entityLaborRateHistoryId: number;
  entityId?: number;
  entityLaborRateId?: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  isAddDelete?: number;
  changedValues?: string;
  created?: string;
}

export interface EntityPaymentMethod {
  entityPaymentMethodId: number;
  entityId: number;
  title?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityCreditTerm {
  entityCreditTermId: number;
  entityId: number;
  termName?: string;
  termDays: number;
  discountPercentage?: number;
  discountDays?: number;
  created?: string;
  modified?: string;
}

export interface EntityTaxLocation {
  entityTaxLocationId: number;
  entityId: number;
  locationName?: string;
  taxRate?: number;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityTaxLocationEntityLocationEntry {
  entityTaxLocationEntityLocationEntryId: number;
  entityTaxLocationId?: number;
  entityLocationId?: number;
  quickBooksId?: string;
}

export interface EntityTaxLocationEntry {
  entityTaxLocationEntryId: number;
  entityTaxLocationId: number;
  title?: string;
  rate?: number;
  created?: string;
  modified?: string;
}

export interface EntityTaxLocationQuickBooksItemTaxability {
  entityQuickBooksItemId: number;
  entityTaxLocationId: number;
  taxability?: 'D' | 'T' | 'NT';
}

export interface EntityPartsMarkUp {
  entityPartsMarkUpId: number;
  entityId?: number;
  isDefault: number;
  title?: string;
  created?: string;
  modified?: string;
}

export interface EntityPartsMarkUpMatrix {
  entityPartsMarkUpMatrixId: number;
  entityLocationId: number;
  entityPartsMarkUpId: number;
  customerId: number;
  entityPartVendorId: number;
  partCategoryTableCategoryId: number;
  priceLevelTableCategoryId: number;
  saleType: string;
  created?: string;
  modified?: string;
}

export interface EntityPartsMarkUpScale {
  entityPartsMarkUpScaleId: number;
  entityPartsMarkUpId?: number;
  rate?: number;
  min?: number;
  max?: number;
  created?: string;
  modified?: string;
}

export interface EntityDistanceRate {
  entityDistanceRateId: number;
  entityId: number;
  rateName?: string;
  ratePerMile?: number;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityOutsideServicesRate {
  entityOutsideServicesRateId: number;
  entityId?: number;
  isDefault: number;
  title?: string;
  created?: string;
  modified?: string;
}

export interface EntityOutsideServicesRateScale {
  entityOutsideServicesRateScaleId: number;
  entityOutsideServicesRateId?: number;
  rate?: number;
  min?: number;
  max?: number;
  created?: string;
  modified?: string;
}

export interface EntitySuppliesRate {
  entitySuppliesRateId: number;
  entityId?: number;
  isDefault: number;
  title?: string;
  displayTitle?: string;
  rate?: number;
  includeType: string;
  minimum: number;
  maximum: number;
  chargeMinType: number;
  created?: string;
  modified?: string;
}

// ===== SERVICE AND COMPONENT TABLES (16 interfaces) =====

export interface EntityComponentField {
  entityComponentFieldId: number;
  entityComponentId: number;
  fieldName?: string;
  fieldType?: string;
  fieldValue?: string;
  isRequired: boolean;
  created?: string;
  modified?: string;
}

export interface EntityComponentFieldResponse {
  entityComponentFieldResponseId: number;
  entityComponentFieldId: number;
  responseValue?: string;
  created?: string;
  modified?: string;
}

export interface EntityComponentSystem {
  entityComponentSystemId: number;
  entityComponentId: number;
  systemName?: string;
  systemDescription?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityComponentSystemCorrection {
  entityComponentSystemCorrectionId: number;
  entityComponentSystemId: number;
  correctionName?: string;
  correctionDescription?: string;
  estimatedHours?: number;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityComponentSystemCorrectionChecklist {
  entityComponentSystemCorrectionChecklistId: number;
  entityComponentSystemCorrectionId: number;
  checklistItem?: string;
  isRequired: boolean;
  position: number;
  created?: string;
  modified?: string;
}

export interface EntityComponentSystemCorrectionEntityComponentFieldEntry {
  entityComponentSystemCorrectionEntityComponentFieldEntryId: number;
  entityComponentSystemCorrectionId: number;
  entityComponentFieldId: number;
  isRequired: boolean;
  created?: string;
  modified?: string;
}

export interface EntityComponentSystemCorrectionKit {
  entityComponentSystemCorrectionKitId: number;
  entityId: number;
  entityComponentSystemCorrectionId: number;
  kitName?: string;
  kitDescription?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityComponentSystemCorrectionKitEntry {
  entityComponentSystemCorrectionKitEntryId: number;
  entityComponentSystemCorrectionKitId: number;
  entityPartId: number;
  quantity: number;
  created?: string;
  modified?: string;
}

export interface EntityComponentSystemCorrectionPart {
  entityComponentSystemCorrectionPartId: number;
  entityComponentSystemCorrectionId: number;
  entityPartId: number;
  quantity: number;
  isRequired: boolean;
  created?: string;
  modified?: string;
}

export interface EntityComponentSystemCorrectionUsage {
  entityComponentSystemCorrectionUsageId: number;
  entityComponentSystemCorrectionId: number;
  usageDate?: string;
  quantity: number;
  created?: string;
  modified?: string;
}

export interface EntityComponentSystemEntityComponentFieldEntry {
  entityComponentSystemEntityComponentFieldEntryId: number;
  entityComponentSystemId: number;
  entityComponentFieldId: number;
  isRequired: boolean;
  created?: string;
  modified?: string;
}

export interface EntityUnitType {
  entityUnitTypeId: number;
  entityId: number;
  typeName?: string;
  typeDescription?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityUnitTypeEntityComponentEntry {
  entityUnitTypeEntityComponentEntryId: number;
  entityUnitTypeId: number;
  entityComponentId: number;
  isRequired: boolean;
  created?: string;
  modified?: string;
}

export interface EntityUnitTypeEntityComponentSystemEntry {
  entityUnitTypeEntityComponentSystemEntryId: number;
  entityUnitTypeId: number;
  entityComponentSystemId: number;
  isRequired: boolean;
  created?: string;
  modified?: string;
}

export interface EntityUnitTypeEntityComponentSystemCorrectionEntry {
  entityUnitTypeEntityComponentSystemCorrectionEntryId: number;
  entityUnitTypeId: number;
  entityComponentSystemCorrectionId: number;
  isRequired: boolean;
  created?: string;
  modified?: string;
}

// ===== CONFIGURATION AND SETTINGS TABLES (16 interfaces) =====

export interface EntityRoleHistory {
  entityRoleHistoryId: number;
  entityId: number;
  entityRoleId: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityRolePermissionEntry {
  entityRolePermissionEntryId: number;
  entityRoleId: number;
  permissionId: number;
  isGranted: boolean;
  created?: string;
  modified?: string;
}

export interface EntityTermsOfService {
  entityTermsOfServiceId: number;
  entityId: number;
  termsVersion?: string;
  termsContent?: string;
  effectiveDate?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityPriceFilePart {
  entityPriceFilePartId: number;
  entityId: number;
  partNumber?: string;
  description?: string;
  cost?: number;
  price?: number;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityPriceFilePartHistory {
  entityPriceFilePartHistoryId: number;
  entityPriceFilePartId: number;
  entityEmployeeId?: number;
  ipAddress?: string;
  changedValues?: string;
  created?: string;
}

export interface EntityProductDiscount {
  entityProductDiscountId: number;
  entityId: number;
  productId: number;
  discountPercentage?: number;
  discountAmount?: number;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityQuickBooksAccount {
  entityQuickBooksAccountId: number;
  entityId: number;
  accountName?: string;
  accountType?: string;
  quickBooksId?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityQuickBooksItem {
  entityQuickBooksItemId: number;
  entityId: number;
  itemName?: string;
  itemType?: string;
  quickBooksId?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityQuickBooksItemPriority {
  entityQuickBooksItemPriorityId: number;
  entityQuickBooksItemId: number;
  priority: number;
  created?: string;
  modified?: string;
}

export interface EntityRepairOrderSeverityOptions {
  entityRepairOrderSeverityOptionsId: number;
  entityId: number;
  severityLevel?: string;
  severityDescription?: string;
  colorCode?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityRepairOrderUrgencyOptions {
  entityRepairOrderUrgencyOptionsId: number;
  entityId: number;
  urgencyLevel?: string;
  urgencyDescription?: string;
  colorCode?: string;
  isActive: boolean;
  created?: string;
  modified?: string;
}

export interface EntityRepairRequestUrgency {
  entityRepairRequestUrgencyId: number;
  entityId: number;
  urgencyName?: string;
  urgencyDescription?: string;
  priorityLevel: number;
  isActive: boolean;
  created?: string;
  modified?: string;
}
