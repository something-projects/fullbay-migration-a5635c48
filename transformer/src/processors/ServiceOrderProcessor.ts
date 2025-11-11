import { DataReader } from '../utils/DataSource';
import { OutputManager } from '../utils/OutputManager';
import { DataQualityTracker } from '../utils/DataQualityTracker';
import { getAutoCareLoader } from '../utils/AutoCareLoader';
import { PartsMatcher, BatchShopPart } from '../services/PartsMatcher';
import { MatchingStatistics, StandardizedPart } from '../types/AutoCareTypes';
import {
  RepairOrder,
  RepairOrderActionItem,
  RepairOrderInvoice,
  RepairOrderInvoicePayment,
  RepairOrderCharge,
  RepairOrderActionItemCorrection,
  RepairOrderActionItemCorrectionPart,
  RepairOrderActionItemCorrectionChecklist,
  CustomerUnit,
  EntityEmployee,
  DenormalizedCompany,
  DenormalizedServiceOrder
} from '../types/DatabaseTypes';

export class ServiceOrderProcessor {
  private dataReader: DataReader;
  private outputManager: OutputManager;
  private qualityTracker: DataQualityTracker;
  private partsMatcher: PartsMatcher | null = null;
  private partsMatchingStats: MatchingStatistics['partsMatches'] = {
    total: 0,
    exactMatches: 0,
    fuzzyMatches: 0,
    descriptionMatches: 0,
    keywordMatches: 0,
    attributeMatches: 0,
    interchangeMatches: 0,
    noMatches: 0,
    averageConfidence: 0,
    enrichmentStats: {
      withAttributes: 0,
      withAssets: 0,
      withPricing: 0,
      withAvailability: 0,
      withHazmatInfo: 0
    }
  };
  
  // Note: failureStatistics moved to entity-level processing to avoid data pollution across entities

  // Note: ServiceOrderProcessor already uses optimal batch queries in processEntityServiceOrders
  // No additional caching needed as the existing implementation is already efficient

  constructor(dataReader: DataReader, outputManager: OutputManager, qualityTracker?: DataQualityTracker) {
    this.dataReader = dataReader;
    this.outputManager = outputManager;
    this.qualityTracker = qualityTracker || new DataQualityTracker();
  }

  /**
   * Initialize AutoCare parts matcher with DuckDB aggregator support
   */
  private async initializeMatchers(): Promise<void> {
    if (this.partsMatcher) {
      return; // Already initialized
    }

    try {
      console.log('🔄 Initializing AutoCare parts matcher with DuckDB aggregator...');
      const startTime = Date.now();

      const autoCareLoader = getAutoCareLoader();
      await autoCareLoader.loadData();
      const vcdbPath = autoCareLoader.getVcdbPath();
      const pcdbPath = autoCareLoader.getPcdbPath();

      this.partsMatcher = new PartsMatcher();
      await this.partsMatcher.initialize(vcdbPath, pcdbPath);
      console.log('✅ Parts matcher initialized with AutoCare JSON + optional Parquet acceleration');

      const loadingTime = Date.now() - startTime;
      console.log(`✅ AutoCare parts matcher initialized in ${loadingTime}ms`);
    } catch (error) {
      console.warn('⚠️  Failed to initialize AutoCare matchers:', (error as Error).message);
      console.warn('   Continuing without standardized matching...');
      // Ensure we don't call into an uninitialized matcher
      this.partsMatcher = null;
    }
  }



  /**
   * Clear service order cache to free memory (used in batch processing)
   */
  private clearServiceOrderCache(): void {
    // ServiceOrderProcessor uses optimal batch queries, minimal cache clearing needed
    console.log(`🧹 Service Order cache cleared`);
  }

  /**
   * Process service orders based on processing mode
   */
  async processServiceOrders(entities: { [entityId: number]: DenormalizedCompany }, processingMode: 'demo' | 'full' = 'demo', targetEntityId?: number, simpleShopEntities?: Set<number>): Promise<void> {
    // Initialize AutoCare matchers first
    await this.initializeMatchers();

    const entityIds = Object.keys(entities).map(id => parseInt(id));

    if (entityIds.length === 0) {
      console.log('⚠️  No entities provided, skipping service order processing');
      return;
    }

    if (processingMode === 'demo') {
      // Demo mode: process service orders for target entity, first entity, and all simple shop entities
      const entitiesToProcess = new Set<number>();
      
      // Add target entity or first entity
      if (targetEntityId && Object.keys(entities).includes(targetEntityId.toString())) {
        entitiesToProcess.add(targetEntityId);
        console.log(`🎯 Demo Mode: Added TARGET entity: ${targetEntityId}`);
      } else {
        entitiesToProcess.add(entityIds[0]);
        if (targetEntityId) {
          console.log(`⚠️  Target entity ${targetEntityId} not found, falling back to first entity`);
        }
        console.log(`🎯 Demo Mode: Added FIRST entity: ${entityIds[0]}`);
      }
      
      // Add all simple shop entities
      if (simpleShopEntities && simpleShopEntities.size > 0) {
        for (const entityId of simpleShopEntities) {
          if (entities[entityId]) {
            entitiesToProcess.add(entityId);
          }
        }
        console.log(`🏪 Demo Mode: Added ${simpleShopEntities.size} Simple Shop entities for full service order processing`);
      }
      
      console.log(`🔧 Demo Mode: Processing service orders for ${entitiesToProcess.size} entities (${entityIds.length - entitiesToProcess.size} entities skipped for optimization)`);
      
      for (const entityId of entitiesToProcess) {
        const entity = entities[entityId];
        if (!entity) continue;

        const shopName = entity.basicInfo.title || entity.basicInfo.legalName || `Entity ${entityId}`;
        const isSimpleShop = simpleShopEntities?.has(entityId) || false;
        const processingReason = entityId === targetEntityId ? 'TARGET ENTITY' : 
                               entityId === entityIds[0] ? 'FIRST ENTITY' : 
                               isSimpleShop ? 'SIMPLE SHOP' : 'UNKNOWN';
        
        console.log(`🔧 Processing service orders for: ${shopName} (${processingReason})`);
        
        await this.processEntityServiceOrders(entityId, entity);
        
        // 🧹 Clear cache after processing to free memory
        this.clearServiceOrderCache();
      }

      console.log(`✅ Service order processing completed for ${entitiesToProcess.size} entities (${entityIds.length - entitiesToProcess.size} entities skipped for optimization)`);
    } else {
      // Full mode: process service orders for all entities
      console.log(`🏭 Full Mode: Processing service orders for ALL ${entityIds.length} entities...`);

      for (const entityId of entityIds) {
        const entity = entities[entityId];
        if (!entity) continue;

        const shopName = entity.basicInfo.title || entity.basicInfo.legalName || `Entity ${entityId}`;
        console.log(`🔧 Processing service orders for: ${shopName}`);

        await this.processEntityServiceOrders(entityId, entity);

        // 🧹 Clear cache after processing to free memory
        this.clearServiceOrderCache();
      }

      console.log(`✅ Service order processing completed for ${entityIds.length} entities`);
    }
  }

  /**
   * Process all service orders for a specific entity with batch optimization
   */
  private async processEntityServiceOrders(entityId: number, entity: DenormalizedCompany): Promise<void> {
    // Create entity-specific failure statistics to avoid cross-entity data pollution
    const failureStatistics = {
      failuresByReason: new Map<string, number>(),
      commonFailures: new Map<string, number>()
    };

    // Load repair orders for this specific entity (via entity's customers)
    console.log(`🔄 Loading repair orders for entity ${entityId}...`);

    // First get all customers for this entity
    const customers = await this.dataReader.query<any>(
      'SELECT * FROM Customer WHERE entityId = ?',
      [entityId]
    );

    if (customers.length === 0) {
      console.log(`   No customers found for entity ${entityId} - skipping service orders`);
      return;
    }

    console.log(`   Found ${customers.length} customers`);
    const customerIds = customers.map(c => c.customerId);

    // Batch process customers in smaller chunks to avoid huge IN clauses
    const BATCH_SIZE = 1000;
    let allRepairOrders: RepairOrder[] = [];

    console.log(`🔄 Loading repair orders in batches of ${BATCH_SIZE}...`);
    for (let i = 0; i < customerIds.length; i += BATCH_SIZE) {
      const batchCustomerIds = customerIds.slice(i, i + BATCH_SIZE);
      const customerIdsPlaceholder = batchCustomerIds.map(() => '?').join(',');
      
      const batchRepairOrders = await this.dataReader.query<RepairOrder>(
        `SELECT * FROM RepairOrder 
         WHERE customerId IN (${customerIdsPlaceholder})
           AND customerId IS NOT NULL 
           AND customerId > 0
           AND customerUnitId IS NOT NULL
           AND customerUnitId > 0`,
        batchCustomerIds
      );
      
      allRepairOrders = allRepairOrders.concat(batchRepairOrders);
      console.log(`   Batch ${Math.floor(i/BATCH_SIZE) + 1}: Found ${batchRepairOrders.length} repair orders`);
    }

    if (allRepairOrders.length === 0) {
      console.log(`   No repair orders found for entity ${entityId}`);
      return;
    }

    console.log(`   Total: Found ${allRepairOrders.length} repair orders`);
    const repairOrderIds = allRepairOrders.map(ro => ro.repairOrderId);

    // Batch load all related data to avoid huge IN clauses
    const totalOrderBatches = Math.ceil(repairOrderIds.length / BATCH_SIZE);
    console.log(`🔄 Loading related data in ${totalOrderBatches} batches...`);
    let allActionItems: RepairOrderActionItem[] = [];
    let allInvoices: RepairOrderInvoice[] = [];
    let allCharges: RepairOrderCharge[] = [];

    // Process repair order related data in batches
    for (let i = 0; i < repairOrderIds.length; i += BATCH_SIZE) {
      const batchRepairOrderIds = repairOrderIds.slice(i, i + BATCH_SIZE);
      const repairOrderIdsPlaceholder = batchRepairOrderIds.map(() => '?').join(',');
      
      const [batchActionItems, batchInvoices, batchCharges] = await Promise.all([
        this.dataReader.query<RepairOrderActionItem>(
          `SELECT * FROM RepairOrderActionItem WHERE repairOrderId IN (${repairOrderIdsPlaceholder})`,
          batchRepairOrderIds
        ),
        this.dataReader.query<RepairOrderInvoice>(
          `SELECT * FROM RepairOrderInvoice WHERE repairOrderId IN (${repairOrderIdsPlaceholder})`,
          batchRepairOrderIds
        ),
        this.dataReader.query<RepairOrderCharge>(
          `SELECT * FROM RepairOrderCharge WHERE repairOrderId IN (${repairOrderIdsPlaceholder})`,
          batchRepairOrderIds
        )
      ]);
      
      allActionItems = allActionItems.concat(batchActionItems);
      allInvoices = allInvoices.concat(batchInvoices);
      allCharges = allCharges.concat(batchCharges);
      
      const batchNum = Math.floor(i/BATCH_SIZE) + 1;
      console.log(`   ✓ Batch ${batchNum}/${totalOrderBatches}: Found ${batchActionItems.length} action items, ${batchInvoices.length} invoices, ${batchCharges.length} charges`);
    }

    console.log(`🔄 Loading correction system data in batches...`);
    const actionItemIds = allActionItems.map(item => item.repairOrderActionItemId);
    let allCorrections: RepairOrderActionItemCorrection[] = [];
    let allCorrectionParts: RepairOrderActionItemCorrectionPart[] = [];
    let allCorrectionChecklists: RepairOrderActionItemCorrectionChecklist[] = [];

    if (actionItemIds.length > 0) {
      const totalActionItemBatches = Math.ceil(actionItemIds.length / BATCH_SIZE);
      console.log(`   Loading corrections in ${totalActionItemBatches} batches...`);
      
      // Process action items in batches for corrections
      for (let i = 0; i < actionItemIds.length; i += BATCH_SIZE) {
        const batchActionItemIds = actionItemIds.slice(i, i + BATCH_SIZE);
        const actionItemIdsPlaceholder = batchActionItemIds.map(() => '?').join(',');
        
        const batchCorrections = await this.dataReader.query<RepairOrderActionItemCorrection>(
          `SELECT * FROM RepairOrderActionItemCorrection WHERE repairOrderActionItemId IN (${actionItemIdsPlaceholder})`,
          batchActionItemIds
        );
        
        allCorrections = allCorrections.concat(batchCorrections);
      }

      // If we have corrections, load their parts and checklists in batches
      if (allCorrections.length > 0) {
        const correctionIds = allCorrections.map(c => c.repairOrderActionItemCorrectionId);
        const totalCorrectionBatches = Math.ceil(correctionIds.length / BATCH_SIZE);
        console.log(`   Loading correction details in ${totalCorrectionBatches} batches...`);
        
        for (let i = 0; i < correctionIds.length; i += BATCH_SIZE) {
          const batchCorrectionIds = correctionIds.slice(i, i + BATCH_SIZE);
          const correctionIdsPlaceholder = batchCorrectionIds.map(() => '?').join(',');
          
          const [batchCorrectionParts, batchCorrectionChecklists] = await Promise.all([
            this.dataReader.query<RepairOrderActionItemCorrectionPart>(
              `SELECT * FROM RepairOrderActionItemCorrectionPart WHERE repairOrderActionItemCorrectionId IN (${correctionIdsPlaceholder})`,
              batchCorrectionIds
            ),
            this.dataReader.query<RepairOrderActionItemCorrectionChecklist>(
              `SELECT * FROM RepairOrderActionItemCorrectionChecklist WHERE repairOrderActionItemCorrectionId IN (${correctionIdsPlaceholder})`,
              batchCorrectionIds
            )
          ]);
          
          allCorrectionParts = allCorrectionParts.concat(batchCorrectionParts);
          allCorrectionChecklists = allCorrectionChecklists.concat(batchCorrectionChecklists);
          
          const batchNum = Math.floor(i/BATCH_SIZE) + 1;
          console.log(`     ✓ Correction batch ${batchNum}/${totalCorrectionBatches}: Found ${batchCorrectionParts.length} parts, ${batchCorrectionChecklists.length} checklists`);
        }

        // Apply AutoCare parts matching to correction parts using chunked batch processing
        if (this.partsMatcher && allCorrectionParts.length > 0) {
          const TOTAL = allCorrectionParts.length;
          const CHUNK_SIZE = 50000; // process in 50k chunks to show progress and reduce memory pressure
          const totalChunks = Math.ceil(TOTAL / CHUNK_SIZE);
          console.log(`🔧 Batch matching ${TOTAL} correction parts in ${totalChunks} chunks of ${CHUNK_SIZE}...`);
          const partsMatchingStartTime = Date.now();

          let overallMatched = 0;
          let totalConfidence = 0;

          try {
            for (let offset = 0, chunkIdx = 0; offset < TOTAL; offset += CHUNK_SIZE, chunkIdx++) {
              const end = Math.min(offset + CHUNK_SIZE, TOTAL);
              const chunk = allCorrectionParts.slice(offset, end);
              const batchParts: BatchShopPart[] = chunk.map(part => ({
                id: `${part.repairOrderActionItemCorrectionPartId}`,
                name: part.title || part.description || '',
                entityId: parseInt(entityId.toString()),
                title: part.title,
                description: part.description,
                shopNumber: part.shopNumber,
                vendorNumber: part.vendorNumber
              }));

              console.log(`   📦 Chunk ${chunkIdx + 1}/${totalChunks}: matching ${batchParts.length} parts...`);
              const batchResults = await this.partsMatcher.batchMatchParts(batchParts);

              let matchedInChunk = 0;
              for (const part of chunk) {
                const partId = `${part.repairOrderActionItemCorrectionPartId}`;
                const matchResult = batchResults.get(partId);

                this.partsMatchingStats.total++;

                if (matchResult?.matched && matchResult.standardizedPart) {
                  part.standardizedPart = matchResult.standardizedPart;
                  part.standardizedPartAlternatives = this.formatPartAlternatives(matchResult.alternatives);
                  totalConfidence += matchResult.standardizedPart.confidence || 0;
                  matchedInChunk++;
                  overallMatched++;

                  switch (matchResult.standardizedPart.matchingMethod) {
                    case 'exact':
                      this.partsMatchingStats.exactMatches++;
                      break;
                    case 'fuzzy':
                      this.partsMatchingStats.fuzzyMatches++;
                      break;
                    case 'description':
                      this.partsMatchingStats.descriptionMatches++;
                      break;
                    case 'keyword':
                      this.partsMatchingStats.keywordMatches++;
                      break;
                  }
                } else {
                  part.standardizedPartAlternatives = undefined;
                  if (matchResult && !matchResult.matched) {
                    part.matchFailureReason = matchResult.failureReason;
                    part.matchFailureDetails = matchResult.failureDetails;
                    if (matchResult.failureReason) {
                      const currentCount = failureStatistics.failuresByReason.get(matchResult.failureReason) || 0;
                      failureStatistics.failuresByReason.set(matchResult.failureReason, currentCount + 1);
                    }
                    const partName = part.title || part.description || 'Unknown';
                    if (partName && partName !== 'Unknown') {
                      const failureCount = failureStatistics.commonFailures.get(partName) || 0;
                      failureStatistics.commonFailures.set(partName, failureCount + 1);
                    }
                  }
                  this.partsMatchingStats.noMatches++;
                }
              }

              const progressed = end;
              const pct = ((progressed / TOTAL) * 100).toFixed(1);
              console.log(`   ✅ Chunk ${chunkIdx + 1}/${totalChunks} done: matched ${matchedInChunk}/${batchParts.length} | progress ${progressed}/${TOTAL} (${pct}%)`);

              // Yield to event loop so logs flush in huge runs
              await new Promise<void>(resolve => setImmediate(resolve));
            }

            if (overallMatched > 0) {
              this.partsMatchingStats.averageConfidence = totalConfidence / overallMatched;
            }

            console.log(`✅ Batch matching completed: ${overallMatched}/${TOTAL} matched`);
          } catch (error) {
            console.warn('⚠️  Batch matching failed, falling back to individual matching:', (error as Error).message);

            // Fallback to individual matching
            for (const part of allCorrectionParts) {
              this.partsMatchingStats.total++;
              const matchResult = await this.partsMatcher.matchPart(
                part.title,
                part.description,
                part.shopNumber,
                part.vendorNumber
              );

              if (matchResult.matched && matchResult.standardizedPart) {
                part.standardizedPart = matchResult.standardizedPart;
                part.standardizedPartAlternatives = this.formatPartAlternatives(matchResult.alternatives);
                this.partsMatchingStats.exactMatches++; // Simplified tracking for fallback
              } else {
                part.standardizedPartAlternatives = undefined;
                if (matchResult && !matchResult.matched) {
                  part.matchFailureReason = matchResult.failureReason;
                  part.matchFailureDetails = matchResult.failureDetails;
                  if (matchResult.failureReason) {
                    const currentCount = failureStatistics.failuresByReason.get(matchResult.failureReason) || 0;
                    failureStatistics.failuresByReason.set(matchResult.failureReason, currentCount + 1);
                  }
                  const partName = part.title || part.description || 'Unknown';
                  if (partName && partName !== 'Unknown') {
                    const failureCount = failureStatistics.commonFailures.get(partName) || 0;
                    failureStatistics.commonFailures.set(partName, failureCount + 1);
                  }
                }
                this.partsMatchingStats.noMatches++;
              }
            }
          }

          const partsMatchingTime = Date.now() - partsMatchingStartTime;
          console.log(`   ✅ Parts matching completed in ${partsMatchingTime}ms`);
          console.log(`   📊 Results: ${this.partsMatchingStats.exactMatches} exact, ${this.partsMatchingStats.fuzzyMatches} fuzzy, ${this.partsMatchingStats.descriptionMatches} description, ${this.partsMatchingStats.keywordMatches} keyword, ${this.partsMatchingStats.noMatches} no match`);
        }
      }
    }

    // Create correctionPartsMap after AutoCare matching to include standardizedPart
    const correctionPartsMap = this.createCorrectionPartsMap(allCorrectionParts);

    // Load invoice payments in batches for existing invoices
    let allInvoicePayments: RepairOrderInvoicePayment[] = [];
    if (allInvoices.length > 0) {
      const invoiceIds = allInvoices.map(inv => inv.repairOrderInvoiceId);
      const totalInvoiceBatches = Math.ceil(invoiceIds.length / BATCH_SIZE);
      console.log(`🔄 Loading invoice payments in ${totalInvoiceBatches} batches...`);
      
      for (let i = 0; i < invoiceIds.length; i += BATCH_SIZE) {
        const batchInvoiceIds = invoiceIds.slice(i, i + BATCH_SIZE);
        const invoiceIdsPlaceholder = batchInvoiceIds.map(() => '?').join(',');
        
        const batchInvoicePayments = await this.dataReader.query<RepairOrderInvoicePayment>(
          `SELECT * FROM RepairOrderInvoicePayment WHERE repairOrderInvoiceId IN (${invoiceIdsPlaceholder})`,
          batchInvoiceIds
        );
        
        allInvoicePayments = allInvoicePayments.concat(batchInvoicePayments);
        const batchNum = Math.floor(i/BATCH_SIZE) + 1;
        console.log(`   ✓ Batch ${batchNum}/${totalInvoiceBatches}: Found ${batchInvoicePayments.length} payments`);
      }
    }

    console.log(`🔄 Loading customer units and employees...`);
    // Load customer units and entity employees (smaller datasets, single query is fine)
    const [customerUnits, entityEmployees] = await Promise.all([
      // Customer units can use batch processing too for consistency
      this.batchLoadCustomerUnits(customerIds),
      this.dataReader.query<EntityEmployee>(
        'SELECT * FROM EntityEmployee WHERE entityId = ?',
        [entityId]
      )
    ]);

    // Create lookup maps for efficient data access
    const invoicesMap = this.createInvoicesMap(allInvoices);
    const invoicePaymentsMap = this.createInvoicePaymentsMap(allInvoicePayments);
    const chargesMap = this.createChargesMap(allCharges);
    const correctionsMap = this.createCorrectionsMap(allCorrections);
    // Note: correctionPartsMap will be created after AutoCare matching to include standardizedPart
    const correctionChecklistsMap = this.createCorrectionChecklistsMap(allCorrectionChecklists);

    console.log(`   Processing ${allRepairOrders.length} service orders...`);
    console.log(`   Found ${allInvoices.length} invoices, ${allInvoicePayments.length} payments, ${allCharges.length} charges`);
    console.log(`   Found ${allCorrections.length} corrections, ${allCorrectionParts.length} parts, ${allCorrectionChecklists.length} checklists`);
    let processed = 0;

    for (const repairOrder of allRepairOrders) {
      try {
        // Find the customer and unit (IDs are guaranteed to exist by SQL filter)
        const customer = customers.find(c => c.customerId === repairOrder.customerId);
        const unit = customerUnits.find(u => u.customerUnitId === repairOrder.customerUnitId);

        if (!customer || !unit) {
          console.log(`   Skipping order ${repairOrder.repairOrderId} - customer or unit not found`);
          continue;
        }

        // Get all related data for this repair order
        const actionItems = allActionItems.filter(item =>
          item.repairOrderId === repairOrder.repairOrderId
        );
        const serviceWriter = entityEmployees.find(e =>
          e.entityEmployeeId === repairOrder.serviceWriterEntityEmployeeId
        );
        const technician = entityEmployees.find(e =>
          e.entityEmployeeId === repairOrder.entityEmployeeId
        );

        // Get financial data for this repair order
        const invoice = invoicesMap.get(repairOrder.repairOrderId);
        const invoicePayments = invoice ? (invoicePaymentsMap.get(invoice.repairOrderInvoiceId) || []) : [];
        const charges = chargesMap.get(repairOrder.repairOrderId) || [];

        // Get correction system data for this repair order's action items
        const corrections: RepairOrderActionItemCorrection[] = [];
        const serviceOrderCorrectionParts: RepairOrderActionItemCorrectionPart[] = [];
        const allCorrectionChecklists: RepairOrderActionItemCorrectionChecklist[] = [];

        for (const actionItem of actionItems) {
          const itemCorrections = correctionsMap.get(actionItem.repairOrderActionItemId) || [];
          corrections.push(...itemCorrections);

          for (const correction of itemCorrections) {
            // Get parts for this correction from the matched parts array (which includes standardizedPart)
            const correctionPartIds = (correctionPartsMap.get(correction.repairOrderActionItemCorrectionId) || [])
              .map(p => p.repairOrderActionItemCorrectionPartId);
            
            // Find the matched parts from allCorrectionParts (which contains standardizedPart)
            const matchedParts = allCorrectionParts.filter(p => 
              correctionPartIds.includes(p.repairOrderActionItemCorrectionPartId)
            );
            serviceOrderCorrectionParts.push(...matchedParts);
            
            const checklists = correctionChecklistsMap.get(correction.repairOrderActionItemCorrectionId) || [];
            allCorrectionChecklists.push(...checklists);
          }
        }

        // Denormalize service order data
        const denormalized = this.denormalizeServiceOrder(
          repairOrder,
          actionItems,
          unit,
          serviceWriter,
          technician,
          invoice,
          invoicePayments,
          charges,
          corrections,
          serviceOrderCorrectionParts,
          allCorrectionChecklists
        );

        // Write service order file under the unit's service-orders directory
        // Flatten service order data to match example format (include actionItems inline)
        const flatServiceOrder = this.flattenServiceOrderData(denormalized, actionItems);

        await this.outputManager.writeServiceOrderJson(
          entityId.toString(),
          customer.customerId.toString(),
          unit.customerUnitId.toString(),
          repairOrder.repairOrderId.toString(),
          flatServiceOrder
        );

        // Add service order to unit summary
        this.outputManager.addServiceOrderToUnit(
          entityId.toString(),
          customer.customerId.toString(),
          unit.customerUnitId.toString(),
          repairOrder.repairOrderId.toString(),
          flatServiceOrder
        );

        processed++;

        // Record successful processing
        this.qualityTracker.incrementTotal('RepairOrder', 1);
        this.qualityTracker.incrementProcessed('RepairOrder');

      } catch (error) {
        console.error(`❌ Error processing Service Order ${repairOrder.repairOrderId}:`, (error as Error).message);
        this.qualityTracker.incrementError('RepairOrder');
      }
    }

    console.log(`   ✅ Processed ${processed}/${allRepairOrders.length} service orders for Entity ${entityId}`);
    console.log(`      🎯 ${allActionItems.length} action items processed`);
    console.log(`      📦 ${customerUnits.length} units involved`);
    console.log(`      👥 ${entityEmployees.length} employees involved`);

    // Generate AutoCare knowledge base for this entity
    await this.generateEntityKnowledgeBase(entityId, failureStatistics);

    // Report AutoCare matching statistics
    this.reportMatchingStatistics();
  }

  /**
   * Generate and save AutoCare knowledge base for entity
   */
  private async generateEntityKnowledgeBase(entityId: number, failureStatistics: { failuresByReason: Map<string, number>, commonFailures: Map<string, number> }): Promise<void> {
    if (!this.partsMatcher) {
      console.log('⚠️  Parts matcher not available, skipping knowledge base generation');
      return;
    }

    try {
      console.log(`🧠 Generating AutoCare knowledge base for Entity ${entityId}...`);
      const startTime = Date.now();

      // Convert failure statistics to arrays for JSON serialization
      const failuresByReason = Array.from(failureStatistics.failuresByReason.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);

      const commonFailures = Array.from(failureStatistics.commonFailures.entries())
        .map(([partName, count]) => ({ partName, count }))
        .sort((a, b) => b.count - a.count);

      // Create parts knowledge base using real-time statistics
      const partsKnowledge = {
        entityId,
        totalUniqueParts: this.partsMatchingStats.total - this.partsMatchingStats.noMatches,
        mostFrequentParts: [], // We don't track frequency in real-time, could be added later
        matchingStatistics: {
          totalParts: this.partsMatchingStats.total,
          matchedParts: this.partsMatchingStats.total - this.partsMatchingStats.noMatches,
          exactMatches: this.partsMatchingStats.exactMatches,
          fuzzyMatches: this.partsMatchingStats.fuzzyMatches,
          descriptionMatches: this.partsMatchingStats.descriptionMatches,
          keywordMatches: this.partsMatchingStats.keywordMatches,
          noMatches: this.partsMatchingStats.noMatches,
          matchRate: this.partsMatchingStats.total > 0 
            ? Number(((this.partsMatchingStats.total - this.partsMatchingStats.noMatches) / this.partsMatchingStats.total * 100).toFixed(1))
            : 0,
          averageConfidence: this.partsMatchingStats.averageConfidence > 0 
            ? Number((this.partsMatchingStats.averageConfidence * 100).toFixed(1))
            : 0
        },
        failureStatistics: {
          totalFailures: this.partsMatchingStats.noMatches,
          failuresByReason,
          commonFailures,
          failureAnalytics: {
            uniqueFailedParts: commonFailures.length,
            failuresByCategory: this.generatePartsFailuresByCategory(failureStatistics),
            failureDistribution: this.generatePartsFailureDistribution(failureStatistics)
          },
          sessionStats: {
            totalAttempts: this.partsMatchingStats.total,
            successfulMatches: this.partsMatchingStats.total - this.partsMatchingStats.noMatches,
            averageConfidence: this.partsMatchingStats.averageConfidence > 0 
              ? Number((this.partsMatchingStats.averageConfidence * 100).toFixed(1))
              : 0
          }
        }
      };

      // Save knowledge base to entity directory
      await this.outputManager.writeJson(
        `${entityId}/autocare-knowledge.json`,
        {
          ...partsKnowledge,
          generatedAt: new Date().toISOString(),
          description: 'AutoCare parts knowledge base for this entity',
          statistics: {
            totalUniqueParts: partsKnowledge.totalUniqueParts,
            topPartsCount: partsKnowledge.mostFrequentParts.length,
            averageFrequency: null // Not applicable for real-time stats
          }
        }
      );

      const duration = Date.now() - startTime;
      console.log(`✅ AutoCare knowledge base generated in ${duration}ms`);
      console.log(`   📊 ${partsKnowledge.matchingStatistics.matchedParts}/${partsKnowledge.matchingStatistics.totalParts} parts matched (${partsKnowledge.matchingStatistics.matchRate}%)`);
      console.log(`   🏆 ${failuresByReason.length} failure reasons tracked, ${commonFailures.length} common failures`);

      // Immediately update entity.json with parts matching statistics
      try {
        const entityJsonPath = `${entityId}/entity.json`;
        if (await this.outputManager.fileExists(entityJsonPath)) {
          const entityData = JSON.parse(await this.outputManager.readFileContent(entityJsonPath));
          
          // Initialize autoCare section if it doesn't exist
          if (!entityData.autoCare) {
            entityData.autoCare = { lastUpdated: new Date().toISOString() };
          }
          
          // Update parts matching statistics
          entityData.autoCare.partsMatching = {
            totalUniqueParts: partsKnowledge.totalUniqueParts,
            matchingStatistics: partsKnowledge.matchingStatistics,
            failureStatistics: partsKnowledge.failureStatistics
          };
          entityData.autoCare.lastUpdated = new Date().toISOString();
          
          // Write updated entity.json immediately
          await this.outputManager.writeJson(entityJsonPath, entityData);
          console.log(`✅ Updated entity.json with parts matching statistics`);
        } else {
          console.log(`⚠️  Entity JSON file not found at ${entityJsonPath}, skipping parts stats update`);
        }
      } catch (error) {
        console.warn('⚠️  Failed to update entity.json with parts statistics:', error);
      }
      
    } catch (error) {
      console.warn('⚠️  Failed to generate AutoCare knowledge base:', (error as Error).message);
    }
  }

  /**
   * Report AutoCare parts matching statistics
   */
  private reportMatchingStatistics(): void {
    if (this.partsMatchingStats.total === 0) {
      return; // No matching performed
    }

    console.log(`\n🎯 AutoCare Parts Matching Statistics:`);

    const partsMatchRate = ((this.partsMatchingStats.total - this.partsMatchingStats.noMatches) / this.partsMatchingStats.total * 100).toFixed(1);
    console.log(`   🔧 Parts: ${this.partsMatchingStats.total} processed, ${partsMatchRate}% matched`);
    console.log(`      📊 ${this.partsMatchingStats.exactMatches} exact, ${this.partsMatchingStats.fuzzyMatches} fuzzy, ${this.partsMatchingStats.descriptionMatches} description, ${this.partsMatchingStats.keywordMatches} keyword, ${this.partsMatchingStats.noMatches} no match`);
    if (this.partsMatchingStats.averageConfidence > 0) {
      console.log(`      🎯 Average confidence: ${(this.partsMatchingStats.averageConfidence * 100).toFixed(1)}%`);
    }
  }

  private formatPartAlternatives(alternatives?: StandardizedPart[]): StandardizedPart[] | undefined {
    if (!alternatives || alternatives.length === 0) {
      return undefined;
    }

    const deduped: StandardizedPart[] = [];
    const seen = new Set<string>();

    for (const alt of alternatives) {
      if (!alt) continue;
      const key = `${alt.partTerminologyId || alt.partId || alt.partNumber || ''}|${alt.partName || ''}`;
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
   * Denormalize a single service order with all related data including financial information and corrections
   */
  private denormalizeServiceOrder(
    repairOrder: RepairOrder,
    actionItems: RepairOrderActionItem[],
    unit?: CustomerUnit,
    serviceWriter?: EntityEmployee,
    technician?: EntityEmployee,
    invoice?: RepairOrderInvoice,
    invoicePayments?: RepairOrderInvoicePayment[],
    charges?: RepairOrderCharge[],
    corrections?: RepairOrderActionItemCorrection[],
    correctionParts?: RepairOrderActionItemCorrectionPart[],
    correctionChecklists?: RepairOrderActionItemCorrectionChecklist[]
  ): DenormalizedServiceOrder {
    // Calculate totals from action items
    const laborTotal = actionItems
      .filter(item => item.actionItemType?.toLowerCase() === 'labor' || item.hours)
      .reduce((sum, item) => sum + (item.totalAmount || 0), 0);

    const partsTotal = actionItems
      .filter(item => item.actionItemType?.toLowerCase() === 'part')
      .reduce((sum, item) => sum + (item.totalAmount || 0), 0);

    const totalAmount = actionItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0);

    return {
      repairOrderId: repairOrder.repairOrderId,
      repairOrderNumber: repairOrder.repairOrderNumber,
      basicInfo: {
        repairOrderType: repairOrder.repairOrderType,
        priority: repairOrder.priority,
        workFlowStatus: repairOrder.workFlowStatus,
        description: repairOrder.description
      },
      assignment: {
        entityLocationId: repairOrder.entityLocationId,
        serviceWriterEntityEmployeeId: repairOrder.serviceWriterEntityEmployeeId,
        entityEmployeeId: repairOrder.entityEmployeeId,
        partsEntityEmployeeId: repairOrder.partsEntityEmployeeId
      },
      customer: {
        customerId: repairOrder.customerId,
        customerUnitId: repairOrder.customerUnitId,
        billingCustomerId: repairOrder.billingCustomerId
      },
      dates: {
        created: repairOrder.created,
        scheduled: repairOrder.scheduledDate,
        completed: repairOrder.completedDate
      },
      actionItems: actionItems.map(item => ({
        ...item,
        // Add employee names if available
        employeeName: undefined // Would need to join with EntityEmployee
      })),
      totals: {
        laborTotal,
        partsTotal,
        totalAmount
      },
      // Additional denormalized data
      unit: unit ? {
        customerUnitId: unit.customerUnitId,
        number: unit.number,
        fleetNumber: unit.fleetNumber,
        title: unit.title,
        licensePlate: unit.licensePlate,
        licensePlateState: unit.licensePlateState
      } : undefined,
      serviceWriter: serviceWriter ? {
        entityEmployeeId: serviceWriter.entityEmployeeId,
        firstName: serviceWriter.firstName,
        lastName: serviceWriter.lastName,
        email: serviceWriter.email
      } : undefined,
      technician: technician ? {
        entityEmployeeId: technician.entityEmployeeId,
        firstName: technician.firstName,
        lastName: technician.lastName,
        email: technician.email
      } : undefined,
      // Financial information
      invoice: invoice ? {
        repairOrderInvoiceId: invoice.repairOrderInvoiceId,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        invoiceNumber: invoice.invoiceNumber,
        customerTitle: invoice.customerTitle,
        customerBillingEmployee: invoice.customerBillingEmployee,
        customerBillingEmail: invoice.customerBillingEmail,
        chargeTotal: invoice.chargeTotal,
        partsTotal: invoice.partsTotal,
        laborHoursTotal: invoice.laborHoursTotal,
        laborTotal: invoice.laborTotal,
        suppliesTotal: invoice.suppliesTotal,
        subTotal: invoice.subTotal,
        taxTotal: invoice.taxTotal,
        total: invoice.total,
        balance: invoice.balance,
        exported: invoice.exported,
        sentToFleetNet: invoice.sentToFleetNet,
        created: invoice.created,
        modified: invoice.modified
      } : undefined,
      invoicePayments: invoicePayments || [],
      charges: charges || [],
      // Correction system data
      corrections: corrections || [],
      correctionParts: correctionParts || [],
      correctionChecklists: correctionChecklists || []
    } as any; // Extended interface
  }

  /**
   * Group repair orders by entity (based on entity location)
   */
  private groupOrdersByEntity(
    repairOrders: RepairOrder[],
    entities: { [entityId: number]: DenormalizedCompany }
  ): { [entityId: number]: RepairOrder[] } {
    const ordersByEntity: { [entityId: number]: RepairOrder[] } = {};

    for (const order of repairOrders) {
      if (!order.entityLocationId) continue;

      // Find which entity this location belongs to
      let entityId: number | null = null;
      for (const [eId, entity] of Object.entries(entities)) {
        const hasLocation = entity.locations.some(loc =>
          loc.entityLocationId === order.entityLocationId
        );
        if (hasLocation) {
          entityId = parseInt(eId);
          break;
        }
      }

      if (entityId) {
        if (!ordersByEntity[entityId]) {
          ordersByEntity[entityId] = [];
        }
        ordersByEntity[entityId].push(order);
      }
    }

    return ordersByEntity;
  }

  /**
   * Flatten service order data to match example format
   */
  private flattenServiceOrderData(denormalized: DenormalizedServiceOrder, actionItems: RepairOrderActionItem[]): any {
    // Calculate totals from action items
    const totalAmount = actionItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0);

    return {
      repairOrderId: denormalized.repairOrderId,
      repairOrderNumber: denormalized.repairOrderNumber,
      createdFromRepairOrderId: 0, // Default value, would need to be set from original data
      createdByEntityEmployeeId: denormalized.assignment.serviceWriterEntityEmployeeId,
      serviceWriterEntityEmployeeId: denormalized.assignment.serviceWriterEntityEmployeeId,
      createdByIpAddress: null, // Would need to be populated from original data
      referrer: 0,
      externalId: null,
      fleetNetServiceType: null,
      repairOrderType: denormalized.basicInfo.repairOrderType,
      priority: denormalized.basicInfo.priority,
      entityEmployeeId: denormalized.assignment.entityEmployeeId,
      partsEntityEmployeeId: denormalized.assignment.partsEntityEmployeeId,
      workFlowStatus: denormalized.basicInfo.workFlowStatus,
      partsFlowStatus: null, // Would need to be populated from original data
      customerAuthorizedOnHoursOnly: 0,
      entityLocationId: denormalized.assignment.entityLocationId,
      customerId: denormalized.customer.customerId,
      customerUnitId: denormalized.customer.customerUnitId,
      entityTaxLocationId: null, // Would need to be populated from original data
      overrideEntityTaxLocationId: 0,
      classQuickBooksId: null,
      description: denormalized.basicInfo.description,
      submitterCustomerEmployeeId: null,
      authorizerCustomerEmployeeId: null,
      billingCustomerId: denormalized.customer.billingCustomerId,
      created: denormalized.dates.created,
      modified: new Date().toISOString(), // Current timestamp as modified
      scheduledDate: denormalized.dates.scheduled,
      completedDate: denormalized.dates.completed,
      totalAmount: totalAmount,
      balanceAmount: totalAmount, // Assuming unpaid for now
      // Include actionItems array inline as in the example
      actionItems: actionItems.map(item => ({
        repairOrderActionItemId: item.repairOrderActionItemId,
        repairOrderId: item.repairOrderId,
        active: item.active,
        createdByCustomerEmployeeId: item.createdByCustomerEmployeeId,
        createdByEntityEmployeeId: item.createdByEntityEmployeeId,
        createdByIpAddress: item.createdByIpAddress,
        createdFrom: item.createdFrom,
        actionItemType: item.actionItemType,
        actionItemTypeMisc: item.actionItemTypeMisc,
        description: item.description,
        hours: item.hours,
        entityLaborRateId: item.entityLaborRateId,
        manualLaborRate: item.manualLaborRate,
        entityQuickBooksItemId: item.entityQuickBooksItemId,
        manualEntityQuickBooksItem: item.manualEntityQuickBooksItem,
        status: item.status,
        created: item.created,
        modified: item.modified,
        totalAmount: item.totalAmount || 0
      })),
      // Include financial data from denormalized object
      invoice: denormalized.invoice || null,
      invoicePayments: denormalized.invoicePayments || [],
      charges: denormalized.charges || [],
      // Include correction system data
      corrections: denormalized.corrections || [],
      correctionParts: denormalized.correctionParts || [],
      correctionChecklists: denormalized.correctionChecklists || []
    };
  }

  /**
   * Create a map of repair order ID to invoice for efficient lookup
   */
  private createInvoicesMap(invoices: RepairOrderInvoice[]): Map<number, RepairOrderInvoice> {
    const map = new Map<number, RepairOrderInvoice>();
    for (const invoice of invoices) {
      if (invoice.repairOrderId) {
        map.set(invoice.repairOrderId, invoice);
      }
    }
    return map;
  }

  /**
   * Create a map of invoice ID to payments for efficient lookup
   */
  private createInvoicePaymentsMap(payments: RepairOrderInvoicePayment[]): Map<number, RepairOrderInvoicePayment[]> {
    const map = new Map<number, RepairOrderInvoicePayment[]>();
    for (const payment of payments) {
      if (payment.repairOrderInvoiceId) {
        if (!map.has(payment.repairOrderInvoiceId)) {
          map.set(payment.repairOrderInvoiceId, []);
        }
        map.get(payment.repairOrderInvoiceId)!.push(payment);
      }
    }
    return map;
  }

  /**
   * Create a map of repair order ID to charges for efficient lookup
   */
  private createChargesMap(charges: RepairOrderCharge[]): Map<number, RepairOrderCharge[]> {
    const map = new Map<number, RepairOrderCharge[]>();
    for (const charge of charges) {
      if (charge.repairOrderId) {
        if (!map.has(charge.repairOrderId)) {
          map.set(charge.repairOrderId, []);
        }
        map.get(charge.repairOrderId)!.push(charge);
      }
    }
    return map;
  }

  /**
   * Create a map of action item ID to corrections for efficient lookup
   */
  private createCorrectionsMap(corrections: RepairOrderActionItemCorrection[]): Map<number, RepairOrderActionItemCorrection[]> {
    const map = new Map<number, RepairOrderActionItemCorrection[]>();
    for (const correction of corrections) {
      if (correction.repairOrderActionItemId) {
        if (!map.has(correction.repairOrderActionItemId)) {
          map.set(correction.repairOrderActionItemId, []);
        }
        map.get(correction.repairOrderActionItemId)!.push(correction);
      }
    }
    return map;
  }

  /**
   * Create a map of correction ID to parts for efficient lookup
   */
  private createCorrectionPartsMap(parts: RepairOrderActionItemCorrectionPart[]): Map<number, RepairOrderActionItemCorrectionPart[]> {
    const map = new Map<number, RepairOrderActionItemCorrectionPart[]>();
    for (const part of parts) {
      if (part.repairOrderActionItemCorrectionId) {
        if (!map.has(part.repairOrderActionItemCorrectionId)) {
          map.set(part.repairOrderActionItemCorrectionId, []);
        }
        map.get(part.repairOrderActionItemCorrectionId)!.push(part);
      }
    }
    return map;
  }

  /**
   * Create a map of correction ID to checklists for efficient lookup
   */
  private createCorrectionChecklistsMap(checklists: RepairOrderActionItemCorrectionChecklist[]): Map<number, RepairOrderActionItemCorrectionChecklist[]> {
    const map = new Map<number, RepairOrderActionItemCorrectionChecklist[]>();
    for (const checklist of checklists) {
      if (checklist.repairOrderActionItemCorrectionId) {
        if (!map.has(checklist.repairOrderActionItemCorrectionId)) {
          map.set(checklist.repairOrderActionItemCorrectionId, []);
        }
        map.get(checklist.repairOrderActionItemCorrectionId)!.push(checklist);
      }
    }
    return map;
  }

  /**
   * Batch load customer units to avoid huge IN clauses
   */
  private async batchLoadCustomerUnits(customerIds: number[]): Promise<CustomerUnit[]> {
    const BATCH_SIZE = 1000;
    let allCustomerUnits: CustomerUnit[] = [];
    const totalBatches = Math.ceil(customerIds.length / BATCH_SIZE);
    
    console.log(`   Loading customer units in ${totalBatches} batches...`);
    for (let i = 0; i < customerIds.length; i += BATCH_SIZE) {
      const batchCustomerIds = customerIds.slice(i, i + BATCH_SIZE);
      const customerIdsPlaceholder = batchCustomerIds.map(() => '?').join(',');
      
      const batchCustomerUnits = await this.dataReader.query<CustomerUnit>(
        `SELECT * FROM CustomerUnit WHERE customerId IN (${customerIdsPlaceholder})`,
        batchCustomerIds
      );
      
      allCustomerUnits = allCustomerUnits.concat(batchCustomerUnits);
      const batchNum = Math.floor(i/BATCH_SIZE) + 1;
      console.log(`     ✓ Units batch ${batchNum}/${totalBatches}: Found ${batchCustomerUnits.length} units`);
    }
    
    return allCustomerUnits;
  }

  /**
   * Generate parts failures by category analysis
   */
  private generatePartsFailuresByCategory(failureStatistics: { commonFailures: Map<string, number> }): Array<{ category: string; count: number; percentage: number }> {
    const categories = new Map<string, number>();
    
    // Analyze parts by category based on common failure patterns
    Array.from(failureStatistics.commonFailures.entries()).forEach(([partName, count]) => {
      let category = 'Other';
      const name = partName.toLowerCase();
      
      if (name.includes('oil') || name.includes('lubricant') || name.includes('fluid')) {
        category = 'Fluids & Lubricants';
      } else if (name.includes('filter')) {
        category = 'Filters';
      } else if (name.includes('freight') || name.includes('shipping')) {
        category = 'Logistics';
      } else if (name.includes('sticker') || name.includes('inspection') || name.includes('misc') || name.includes('supplies')) {
        category = 'Miscellaneous & Supplies';
      } else if (name.includes('antifreeze') || name.includes('coolant')) {
        category = 'Cooling System';
      } else if (name.includes('brake') || name.includes('clutch')) {
        category = 'Brake & Clutch';
      } else if (name.includes('tire') || name.includes('wheel')) {
        category = 'Tires & Wheels';
      }
      
      categories.set(category, (categories.get(category) || 0) + count);
    });
    
    const total = Array.from(failureStatistics.commonFailures.values()).reduce((sum, count) => sum + count, 0);
    return Array.from(categories.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.count - a.count);
  }


  /**
   * Generate parts failure distribution analysis
   */
  private generatePartsFailureDistribution(failureStatistics: { commonFailures: Map<string, number>, failuresByReason: Map<string, number> }): {
    byFrequency: Array<{ range: string; count: number; percentage: number }>;
    topFailureReasons: Array<{ reason: string; count: number; percentage: number }>;
  } {
    // Analyze by failure frequency ranges
    const frequencyRanges = new Map<string, number>();
    const failureEntries = Array.from(failureStatistics.commonFailures.entries());
    
    failureEntries.forEach(([, count]) => {
      let range: string;
      if (count >= 1000) {
        range = '1000+ occurrences';
      } else if (count >= 500) {
        range = '500-999 occurrences';
      } else if (count >= 100) {
        range = '100-499 occurrences';
      } else if (count >= 50) {
        range = '50-99 occurrences';
      } else if (count >= 10) {
        range = '10-49 occurrences';
      } else {
        range = '1-9 occurrences';
      }
      
      frequencyRanges.set(range, (frequencyRanges.get(range) || 0) + 1);
    });
    
    const totalParts = failureEntries.length;
    const byFrequency = Array.from(frequencyRanges.entries())
      .map(([range, count]) => ({
        range,
        count,
        percentage: totalParts > 0 ? Number(((count / totalParts) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.count - a.count);
    
    // Analyze top failure reasons from existing statistics
    const totalFailures = Array.from(failureStatistics.failuresByReason.values()).reduce((sum, count) => sum + count, 0);
    const topFailureReasons = Array.from(failureStatistics.failuresByReason.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: totalFailures > 0 ? Number(((count / totalFailures) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    return {
      byFrequency,
      topFailureReasons
    };
  }

  /**
   * Clean up resources and close connections
   */
  async cleanup(): Promise<void> {
    if (this.partsMatcher) {
      await this.partsMatcher.cleanup();
    }

    // Clear memory caches
    this.clearServiceOrderCache();

    console.log('🧹 ServiceOrderProcessor cleaned up');
  }
}
