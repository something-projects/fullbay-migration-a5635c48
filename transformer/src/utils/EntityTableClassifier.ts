/**
 * Entity table classifier - categorizes Entity-related tables by hierarchy level
 */

export interface TableClassification {
  level: number;
  tableName: string;
  camelCaseName: string;
  parentRelation: string;
}

export class EntityTableClassifier {
  /**
   * Classify Entity-related table names by hierarchy level
   * Level 1: Entity (base table)  
   * Level 2: EntityHistory, EntityEmployee, EntityLocation (Entity + one word)
   * Level 3: EntityEmployeeSchedule, EntityLocationHistory (Entity + two words)
   * Level 4+: EntityEmployeeNotificationStatus (Entity + three+ words)
   */
  static classifyEntityTables(): { [level: number]: TableClassification[] } {
    const allEntityTables = [
      'Entity',
      'EntityAddress',
      'EntityComponent',
      'EntityComponentField',
      'EntityComponentFieldResponse',
      'EntityComponentSystem',
      'EntityComponentSystemCorrection',
      'EntityComponentSystemCorrectionChecklist',
      'EntityComponentSystemCorrectionEntityComponentFieldEntry',
      'EntityComponentSystemCorrectionKit',
      'EntityComponentSystemCorrectionKitEntry',
      'EntityComponentSystemCorrectionPart',
      'EntityComponentSystemCorrectionUsage',
      'EntityComponentSystemEntityComponentFieldEntry',
      'EntityCreditTerm',
      'EntityCustomerGroup',
      'EntityDepartment',
      'EntityDistanceRate',
      'EntityEmployee',
      'EntityEmployeeAchievementHistory',
      'EntityEmployeeEntityLocationEntry',
      'EntityEmployeeEntityRoleEntry',
      'EntityEmployeeEventHistory',
      'EntityEmployeeFilter',
      'EntityEmployeeHistory',
      'EntityEmployeeNoteStatus',
      'EntityEmployeeNotificationConfiguration',
      'EntityEmployeeNotificationSettings',
      'EntityEmployeeNotificationStatus',
      'EntityEmployeeReportFavorite',
      'EntityEmployeeSchedule',
      'EntityEmployeeStatisticEntry',
      'EntityEmployeeTimeStamp',
      'EntityEmployeeTimeStampActivity',
      'EntityFee',
      'EntityFeeHistory',
      'EntityFeePaymentMethod',
      'EntityHistory',
      'EntityInformation',
      'EntityInvoice',
      'EntityInvoiceRow',
      'EntityLaborRate',
      'EntityLaborRateHistory',
      'EntityLocation',
      'EntityLocationApiConnection',
      'EntityLocationApiIntegration',
      'EntityLocationCalendarEvent',
      'EntityLocationCalendarEventEntityEmployeeEntry',
      'EntityLocationEntityFeeEntry',
      'EntityLocationHistory',
      'EntityLocationNotificationSettings',
      'EntityLocationNotificationStatus',
      'EntityLocationPart',
      'EntityLocationPartAdjustment',
      'EntityLocationPartAdjustmentEntry',
      'EntityLocationPartEntityLocationPartLocationEntry',
      'EntityLocationPartHistory',
      'EntityLocationPartIncoming',
      'EntityLocationPartKit',
      'EntityLocationPartKitEntry',
      'EntityLocationPartLocation',
      'EntityLocationPartOrder',
      'EntityLocationPartOrderEntry',
      'EntityLocationPartOrderEntryHistory',
      'EntityLocationPartOrderHistory',
      'EntityLocationPartOutgoing',
      'EntityLocationPartOutgoingAdjustmentHistory',
      'EntityLocationPartSerialized',
      'EntityLocationPartSerializedSerial',
      'EntityLocationPartSerializedTireDetail',
      'EntityLocationPartSerializedTireDetailHeader',
      'EntityLocationPartSerializedTireDetailNote',
      'EntityLocationPartSerializedTireDetailRawMaterial',
      'EntityLocationPartSerializedTireDetailRepairPart',
      'EntityLocationPartTransfer',
      'EntityLocationPartTransferEntry',
      'EntityLocationPartTransferHistory',
      'EntityLocationQuickBooksDesktopInformation',
      'EntityLocationQuickBooksInformation',
      'EntityManufacturer',
      'EntityNote',
      'EntityOutsideServicesRate',
      'EntityOutsideServicesRateScale',
      'EntityPart',
      'EntityPartCrossReference',
      'EntityPartTableTag',
      'EntityPartVendor',
      'EntityPartVendorAddress',
      'EntityPartVendorAddressHistory',
      'EntityPartVendorApiConnection',
      'EntityPartVendorBridgestoneProductLine',
      'EntityPartVendorContact',
      'EntityPartVendorContactHistory',
      'EntityPartVendorCredit',
      'EntityPartVendorCreditLine',
      'EntityPartVendorEntityLocationEntry',
      'EntityPartVendorHistory',
      'EntityPartVendorInvoice',
      'EntityPartVendorInvoiceEntityLocationPartOrderEntryEntry',
      'EntityPartVendorInvoiceRepairOrderOrderVendorPartEntry',
      'EntityPartVendorPayment',
      'EntityPartVendorPaymentEntityPartVendorCreditEntry',
      'EntityPartVendorPaymentEntityPartVendorInvoiceEntry',
      'EntityPartsMarkUp',
      'EntityPartsMarkUpMatrix',
      'EntityPartsMarkUpScale',
      'EntityPaymentMethod',
      'EntityPriceFilePart',
      'EntityPriceFilePartHistory',
      'EntityProductDiscount',
      'EntityQuickBooksAccount',
      'EntityQuickBooksItem',
      'EntityQuickBooksItemPriority',
      'EntityRepairOrderSeverityOptions',
      'EntityRepairOrderUrgencyOptions',
      'EntityRepairRequestUrgency',
      'EntityRole',
      'EntityRoleHistory',
      'EntityRolePermissionEntry',
      'EntitySuppliesRate',
      'EntityTaxLocation',
      'EntityTaxLocationEntityLocationEntry',
      'EntityTaxLocationEntry',
      'EntityTaxLocationQuickBooksItemTaxability',
      'EntityTermsOfService',
      'EntityUnitType',
      'EntityUnitTypeEntityComponentEntry',
      'EntityUnitTypeEntityComponentSystemCorrectionEntry',
      'EntityUnitTypeEntityComponentSystemEntry'
    ];

    const classification: { [level: number]: TableClassification[] } = {};

    allEntityTables.forEach(tableName => {
      const level = this.getTableLevel(tableName);
      const camelCaseName = this.toCamelCase(tableName);
      const parentRelation = this.getParentRelation(tableName);

      if (!classification[level]) {
        classification[level] = [];
      }

      classification[level].push({
        level,
        tableName,
        camelCaseName,
        parentRelation
      });
    });

    return classification;
  }

  /**
   * Get hierarchy level for a table name
   */
  private static getTableLevel(tableName: string): number {
    if (tableName === 'Entity') {
      return 1;
    }

    // Remove 'Entity' prefix and split by capital letters
    const withoutEntity = tableName.substring(6); // Remove 'Entity'
    const parts = withoutEntity.split(/(?=[A-Z])/).filter(part => part.length > 0);
    
    return parts.length + 1; // +1 because we removed 'Entity'
  }

  /**
   * Convert table name to camelCase for JSON property name
   */
  private static toCamelCase(tableName: string): string {
    const withoutEntity = tableName.substring(6); // Remove 'Entity'
    if (!withoutEntity) return 'entity'; // For base 'Entity' table
    
    return withoutEntity.charAt(0).toLowerCase() + withoutEntity.slice(1);
  }

  /**
   * Determine parent relation field (usually 'entityId')
   */
  private static getParentRelation(tableName: string): string {
    if (tableName === 'Entity') {
      return ''; // Base table has no parent
    }
    
    // Most Entity tables relate back via entityId
    // Some special cases might need entityLocationId, entityEmployeeId, etc.
    return 'entityId';
  }

  /**
   * Get Level 2 tables (Entity + one word) - these are the ones we want to aggregate
   */
  static getLevel2Tables(): TableClassification[] {
    const classification = this.classifyEntityTables();
    return classification[2] || [];
  }

  /**
   * Get Level 1 and 2 tables combined for aggregation
   */
  static getTablesForAggregation(): TableClassification[] {
    const classification = this.classifyEntityTables();
    const level1 = classification[1] || [];
    const level2 = classification[2] || [];
    
    return [...level1, ...level2];
  }

  /**
   * Display classification results for debugging
   */
  static debugClassification(): void {
    const classification = this.classifyEntityTables();
    
    console.log('Entity Table Classification:');
    Object.keys(classification).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
      console.log(`\nLevel ${level}:`);
      classification[parseInt(level)].forEach(table => {
        console.log(`  ${table.tableName} -> ${table.camelCaseName}`);
      });
    });
  }
}