/**
 * Invoice Aggregator
 * 
 * Aggregates invoice data from all service orders into a single index file
 * for easy access and financial reporting.
 * 
 * Per October 1st meeting requirement:
 * "Invoices and billable hours are critical to preserve"
 */

import { promises as fs } from 'fs';
import * as path from 'path';

export interface AggregatedInvoice {
  // Invoice identification
  repairOrderInvoiceId: number;
  invoiceNumber: number;
  invoiceDate?: string;
  
  // Customer information
  customerId?: number;
  customerTitle?: string;
  customerBillingEmployee?: string;
  customerBillingEmail?: string;
  
  // Service order reference
  repairOrderId: number;
  repairOrderNumber?: number;
  
  // Unit reference
  customerUnitId?: number;
  unitDescription?: string;
  
  // Financial totals
  chargeTotal?: number;
  partsTotal?: number;
  laborHoursTotal?: number;
  laborTotal?: number;
  suppliesTotal?: number;
  subTotal?: number;
  taxTotal?: number;
  total?: number;
  balance?: number;
  
  // Status
  status?: string;
  exported: boolean;
  
  // Integration flags
  sentToFleetNet: boolean;
  sentToIbs: boolean;
  quickBooksId?: string;
  
  // Timestamps
  created?: string;
  modified?: string;
  
  // File paths for reference
  serviceOrderPath: string;
  
  // Payment summary
  paymentCount: number;
  totalPaid: number;
  
  // Charges summary
  chargesCount: number;
}

export interface InvoiceAggregationSummary {
  totalInvoices: number;
  totalRevenue: number;
  totalBalance: number;
  totalPaid: number;
  averageInvoiceAmount: number;
  
  // Status breakdown
  byStatus: Record<string, number>;
  
  // Export status
  exported: number;
  notExported: number;
  
  // Integration status
  sentToQuickBooks: number;
  sentToFleetNet: number;
  sentToIbs: number;
  
  // Date range
  earliestDate?: string;
  latestDate?: string;
  
  // Generated timestamp
  generatedAt: string;
}

export class InvoiceAggregator {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /**
   * Aggregate all invoices for a single entity
   */
  async aggregateEntityInvoices(entityId: number): Promise<void> {
    console.log(`\n📊 Aggregating invoices for entity ${entityId}...`);
    
    const entityPath = path.join(this.outputDir, String(entityId));
    const customersPath = path.join(entityPath, 'customers');
    
    // Check if entity directory exists
    if (!(await this.pathExists(customersPath))) {
      console.log(`⚠️  No customers directory found for entity ${entityId}`);
      return;
    }

    const invoices: AggregatedInvoice[] = [];
    
    // Traverse all service orders
    const customers = await fs.readdir(customersPath, { withFileTypes: true });
    
    for (const customerEntry of customers) {
      if (!customerEntry.isDirectory()) continue;
      
      const customerId = customerEntry.name;
      const unitsPath = path.join(customersPath, customerId, 'units');
      
      if (!(await this.pathExists(unitsPath))) continue;
      
      const units = await fs.readdir(unitsPath, { withFileTypes: true });
      
      for (const unitEntry of units) {
        if (!unitEntry.isDirectory()) continue;
        
        const unitId = unitEntry.name;
        const serviceOrdersPath = path.join(unitsPath, unitId, 'service-orders');
        
        if (!(await this.pathExists(serviceOrdersPath))) continue;
        
        const serviceOrders = await fs.readdir(serviceOrdersPath, { withFileTypes: true });
        
        for (const soEntry of serviceOrders) {
          if (!soEntry.isDirectory()) continue;
          
          const repairOrderId = soEntry.name;
          const entityFilePath = path.join(serviceOrdersPath, repairOrderId, 'entity.json');
          
          if (!(await this.pathExists(entityFilePath))) continue;
          
          try {
            const serviceOrderData = JSON.parse(await fs.readFile(entityFilePath, 'utf8'));
            
            // Extract invoice if it exists
            if (serviceOrderData.invoice) {
              const invoice = this.extractInvoiceData(
                serviceOrderData,
                customerId,
                unitId,
                repairOrderId,
                `customers/${customerId}/units/${unitId}/service-orders/${repairOrderId}`
              );
              
              if (invoice) {
                invoices.push(invoice);
              }
            }
          } catch (error) {
            console.warn(`⚠️  Failed to read service order ${repairOrderId}:`, error);
          }
        }
      }
    }

    // Sort by invoice date (newest first)
    invoices.sort((a, b) => {
      const dateA = a.invoiceDate || a.created || '';
      const dateB = b.invoiceDate || b.created || '';
      return dateB.localeCompare(dateA);
    });

    // Generate summary
    const summary = this.generateSummary(invoices);

    // Write aggregated data
    const outputData = {
      entityId,
      summary,
      invoices,
      generatedAt: new Date().toISOString()
    };

    const outputPath = path.join(entityPath, 'invoices.json');
    await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2), 'utf8');

    console.log(`✅ Aggregated ${invoices.length} invoices for entity ${entityId}`);
    console.log(`   💰 Total Revenue: $${summary.totalRevenue.toLocaleString()}`);
    console.log(`   📊 Total Balance: $${summary.totalBalance.toLocaleString()}`);
    console.log(`   📄 Exported to: invoices.json`);
  }

  /**
   * Extract invoice data from service order
   */
  private extractInvoiceData(
    serviceOrder: any,
    customerId: string,
    unitId: string,
    repairOrderId: string,
    relativePath: string
  ): AggregatedInvoice | null {
    const invoice = serviceOrder.invoice;
    if (!invoice) return null;

    const invoicePayments = serviceOrder.invoicePayments || [];
    const charges = serviceOrder.charges || [];

    // Calculate total paid from payments
    const totalPaid = invoicePayments.reduce((sum: number, payment: any) => {
      return sum + (parseFloat(payment.amount) || 0);
    }, 0);

    return {
      // Invoice identification
      repairOrderInvoiceId: invoice.repairOrderInvoiceId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      
      // Customer information
      customerId: parseInt(customerId),
      customerTitle: invoice.customerTitle || serviceOrder.customerTitle,
      customerBillingEmployee: invoice.customerBillingEmployee,
      customerBillingEmail: invoice.customerBillingEmail,
      
      // Service order reference
      repairOrderId: serviceOrder.repairOrderId || parseInt(repairOrderId),
      repairOrderNumber: serviceOrder.repairOrderNumber,
      
      // Unit reference
      customerUnitId: parseInt(unitId),
      unitDescription: serviceOrder.unitDescription,
      
      // Financial totals
      chargeTotal: this.parseNumber(invoice.chargeTotal),
      partsTotal: this.parseNumber(invoice.partsTotal),
      laborHoursTotal: this.parseNumber(invoice.laborHoursTotal),
      laborTotal: this.parseNumber(invoice.laborTotal),
      suppliesTotal: this.parseNumber(invoice.suppliesTotal),
      subTotal: this.parseNumber(invoice.subTotal),
      taxTotal: this.parseNumber(invoice.taxTotal),
      total: this.parseNumber(invoice.total),
      balance: this.parseNumber(invoice.balance),
      
      // Status
      status: invoice.status,
      exported: invoice.exported === 1 || invoice.exported === true,
      
      // Integration flags
      sentToFleetNet: invoice.sentToFleetNet === 1 || invoice.sentToFleetNet === true,
      sentToIbs: invoice.sentToIbs === 1 || invoice.sentToIbs === true,
      quickBooksId: invoice.quickBooksId,
      
      // Timestamps
      created: invoice.created,
      modified: invoice.modified,
      
      // File paths
      serviceOrderPath: relativePath,
      
      // Payment summary
      paymentCount: invoicePayments.length,
      totalPaid,
      
      // Charges summary
      chargesCount: charges.length
    };
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(invoices: AggregatedInvoice[]): InvoiceAggregationSummary {
    const totalInvoices = invoices.length;
    let totalRevenue = 0;
    let totalBalance = 0;
    let totalPaid = 0;
    
    const byStatus: Record<string, number> = {};
    let exported = 0;
    let notExported = 0;
    let sentToQuickBooks = 0;
    let sentToFleetNet = 0;
    let sentToIbs = 0;
    
    let earliestDate: string | undefined;
    let latestDate: string | undefined;

    for (const invoice of invoices) {
      // Financial totals
      totalRevenue += invoice.total || 0;
      totalBalance += invoice.balance || 0;
      totalPaid += invoice.totalPaid || 0;
      
      // Status breakdown
      const status = invoice.status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
      
      // Export status
      if (invoice.exported) {
        exported++;
      } else {
        notExported++;
      }
      
      // Integration status
      if (invoice.quickBooksId) sentToQuickBooks++;
      if (invoice.sentToFleetNet) sentToFleetNet++;
      if (invoice.sentToIbs) sentToIbs++;
      
      // Date range
      const invoiceDate = invoice.invoiceDate || invoice.created;
      if (invoiceDate) {
        if (!earliestDate || invoiceDate < earliestDate) {
          earliestDate = invoiceDate;
        }
        if (!latestDate || invoiceDate > latestDate) {
          latestDate = invoiceDate;
        }
      }
    }

    const averageInvoiceAmount = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;

    return {
      totalInvoices,
      totalRevenue,
      totalBalance,
      totalPaid,
      averageInvoiceAmount,
      byStatus,
      exported,
      notExported,
      sentToQuickBooks,
      sentToFleetNet,
      sentToIbs,
      earliestDate,
      latestDate,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Parse string number to float
   */
  private parseNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * Check if path exists
   */
  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Aggregate invoices for all entities in output directory
   */
  async aggregateAllEntities(): Promise<void> {
    console.log(`\n📊 Aggregating invoices for all entities in ${this.outputDir}...`);
    
    const entries = await fs.readdir(this.outputDir, { withFileTypes: true });
    const entityDirs = entries.filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name));
    
    console.log(`📁 Found ${entityDirs.length} entity directories`);
    
    for (const entityDir of entityDirs) {
      const entityId = parseInt(entityDir.name);
      try {
        await this.aggregateEntityInvoices(entityId);
      } catch (error) {
        console.error(`❌ Failed to aggregate invoices for entity ${entityId}:`, error);
      }
    }
    
    console.log(`\n✅ Invoice aggregation complete for all entities`);
  }
}

