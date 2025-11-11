/**
 * Repair Order Aggregator
 *
 * Scans hierarchical service-order files under
 *   output/<entityId>/customers/<customerId>/units/<unitId>/service-orders/<orderId>/entity.json
 * and emits a flattened entity-level file:
 *   output/<entityId>/repair-orders.json
 *
 * The output shape aligns with onboarding-wizard/server/lib/repairOrderLoader.ts
 * so the wizard can consume real data instead of falling back to mocks.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

export interface RepairOrderAggregateRow {
  repairOrderId: string | number;
  roNumber?: string;
  customerId: string | number;
  customerName?: string;
  customerUnitId?: string | number;
  unitLabel?: string;
  createdDate?: string;
  completedDate?: string;
  workFlowStatus?: string;
  description?: string;
  odometer?: number;
  laborTotal?: number;
  partsTotal?: number;
  outsideTotal?: number;
  discountTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  paidAmount?: number;
  balanceDue?: number;
}

export class RepairOrderAggregator {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /**
   * Aggregate repair orders for all entity directories under outputDir
   */
  async aggregateAllEntities(): Promise<void> {
    const entries = await fs.readdir(this.outputDir, { withFileTypes: true });
    const entityDirs = entries.filter(e => e.isDirectory() && /^\d+$/.test(e.name));
    console.log(`📁 Found ${entityDirs.length} entity directories for repair order aggregation`);
    for (const dir of entityDirs) {
      const entityId = parseInt(dir.name, 10);
      try {
        await this.aggregateEntityRepairOrders(entityId);
      } catch (error) {
        console.warn(`⚠️  Failed to aggregate repair orders for entity ${entityId}:`, error);
      }
    }
    console.log(`✅ Repair order aggregation complete for all entities`);
  }

  async aggregateEntityRepairOrders(entityId: number): Promise<void> {
    const entityPath = path.join(this.outputDir, String(entityId));
    const customersPath = path.join(entityPath, 'customers');

    if (!(await this.pathExists(customersPath))) {
      console.log(`⚠️  No customers directory found for entity ${entityId} — skipping repair order aggregation`);
      return;
    }

    const rows: RepairOrderAggregateRow[] = [];

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
            const serviceOrder = JSON.parse(await fs.readFile(entityFilePath, 'utf8'));
            const row = this.mapToAggregateRow(serviceOrder, customerId, unitId, repairOrderId);
            rows.push(row);
          } catch (error) {
            console.warn(`⚠️  Failed to read service order ${repairOrderId} for entity ${entityId}:`, error);
          }
        }
      }
    }

    // Sort by createdDate desc if available
    rows.sort((a, b) => {
      const da = a.createdDate || '';
      const db = b.createdDate || '';
      return db.localeCompare(da);
    });

    if (rows.length === 0) {
      console.log(`ℹ️  No service orders found for entity ${entityId}; not writing repair-orders.json`);
      return;
    }

    const output = { repairOrders: rows };
    const outputPath = path.join(entityPath, 'repair-orders.json');
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`✅ Aggregated ${rows.length} repair orders for entity ${entityId} → repair-orders.json`);
  }

  private mapToAggregateRow(serviceOrder: any, customerId: string, unitId: string, repairOrderIdFromPath: string): RepairOrderAggregateRow {
    const invoice = serviceOrder.invoice || {};
    const payments: any[] = Array.isArray(serviceOrder.invoicePayments) ? serviceOrder.invoicePayments : [];

    const paidAmount = payments.reduce((sum: number, p: any) => sum + this.parseNumber(p?.amount), 0);
    const grandTotal = this.parseNumber(invoice.total ?? serviceOrder.totalAmount);
    const balanceDue = invoice.balance !== undefined
      ? this.parseNumber(invoice.balance)
      : Math.max(0, grandTotal - paidAmount);

    return {
      repairOrderId: serviceOrder.repairOrderId ?? repairOrderIdFromPath,
      roNumber: serviceOrder.repairOrderNumber != null ? String(serviceOrder.repairOrderNumber) : undefined,
      customerId: serviceOrder.customerId ?? customerId,
      customerName: serviceOrder.customerTitle || invoice.customerTitle,
      customerUnitId: serviceOrder.customerUnitId ?? unitId,
      unitLabel: serviceOrder.unitDescription,
      createdDate: serviceOrder.created,
      completedDate: serviceOrder.completedDate,
      workFlowStatus: serviceOrder.workFlowStatus,
      description: serviceOrder.description,
      // Totals derived from invoice when present
      laborTotal: this.parseNumber(invoice.laborTotal),
      partsTotal: this.parseNumber(invoice.partsTotal),
      // outsideTotal / discountTotal not reliably available at this layer; omit to keep loader logic simple
      taxTotal: this.parseNumber(invoice.taxTotal),
      grandTotal,
      paidAmount,
      balanceDue
    };
  }

  private async pathExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  private parseNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string') {
      const n = parseFloat(value);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }
}
