import { promises as fs } from 'fs';
import path from 'path';
import type { FinancialMatch, FinancialUpdatePayload } from '../../shared/onboarding.js';

interface RepairOrderInvoice {
  repairOrderInvoiceId: number;
  invoiceNumber: number;
  invoiceDate?: string;
  customerId?: number;
  customerTitle?: string;
  customerBillingEmployee?: string;
  customerBillingEmail?: string;
  repairOrderId: number;
  repairOrderNumber?: number;
  customerUnitId?: number;
  chargeTotal?: number;
  partsTotal?: number;
  laborHoursTotal?: number;
  laborTotal?: number;
  suppliesTotal?: number;
  subTotal?: number;
  taxTotal?: number;
  total?: number;
  balance?: number;
  status?: string;
  exported: boolean;
  sentToFleetNet: boolean;
  sentToIbs: boolean;
  quickBooksId?: string;
  created?: string;
  modified?: string;
  serviceOrderPath: string;
  paymentCount: number;
  totalPaid: number;
  chargesCount: number;
}

interface InvoicesData {
  entityId: number;
  summary: {
    totalInvoices: number;
    totalRevenue: number;
    totalBalance: number;
    totalPaid: number;
  };
  invoices: RepairOrderInvoice[];
  generatedAt: string;
}

export async function loadFinancialMatches(outputPath: string): Promise<FinancialMatch[]> {
  try {
    const invoicesPath = path.join(outputPath, 'invoices.json');
    const content = await fs.readFile(invoicesPath, 'utf-8');
    const data: InvoicesData = JSON.parse(content);

    const matches: FinancialMatch[] = [];

    // Process repair order invoices
    if (data.invoices && Array.isArray(data.invoices)) {
      for (const invoice of data.invoices) {
        const totalAmount = invoice.total || 0;
        const paidAmount = invoice.totalPaid || 0;
        const balanceDue = invoice.balance !== undefined ? invoice.balance : (totalAmount - paidAmount);

        // Determine payment status from invoice status
        let paymentStatus: 'unpaid' | 'partial' | 'paid' | 'void' = 'unpaid';
        if (invoice.status === 'void') {
          paymentStatus = 'void';
        } else if (invoice.status === 'paid' || balanceDue === 0) {
          paymentStatus = 'paid';
        } else if (paidAmount > 0 && balanceDue > 0) {
          paymentStatus = 'partial';
        }

        // Calculate match rate based on available data
        let matchRate = 0.5; // Base rate
        const matchedAttributes: string[] = [];
        const unmatchedAttributes: string[] = [];

        if (invoice.customerTitle) {
          matchRate += 0.2;
          matchedAttributes.push('customer-name');
        } else {
          unmatchedAttributes.push('customer-name');
        }

        if (invoice.total && invoice.total > 0) {
          matchRate += 0.2;
          matchedAttributes.push('total-amount');
        } else {
          unmatchedAttributes.push('total-amount');
        }

        if (invoice.invoiceDate) {
          matchRate += 0.1;
          matchedAttributes.push('invoice-date');
        } else {
          unmatchedAttributes.push('invoice-date');
        }

        if (invoice.repairOrderNumber) {
          matchRate += 0.1;
          matchedAttributes.push('repair-order');
        } else {
          unmatchedAttributes.push('repair-order');
        }

        // Issues detection
        const issues: string[] = [];
        if (!invoice.customerTitle) issues.push('missing-customer-name');
        if (!invoice.total || invoice.total <= 0) issues.push('invalid-amount');
        if (!invoice.invoiceDate) issues.push('missing-invoice-date');
        if (!invoice.repairOrderNumber) issues.push('missing-repair-order');
        if (totalAmount < 0) issues.push('negative-amount');

        // Determine status based on match rate and issues
        let status: 'pending' | 'updating' | 'legacy' | 'validated' = 'pending';
        if (matchRate >= 0.9 && issues.length === 0) {
          status = 'validated';
        } else if (issues.length > 2) {
          status = 'legacy';
        }

        const financialMatch: FinancialMatch = {
          invoiceId: invoice.repairOrderInvoiceId.toString(),
          invoiceNumber: invoice.invoiceNumber.toString(),
          repairOrderId: invoice.repairOrderId.toString(),
          roNumber: invoice.repairOrderNumber?.toString(),
          customerId: invoice.customerId?.toString() || '',
          customerName: invoice.customerTitle || 'Unknown Customer',
          invoiceDate: invoice.invoiceDate || invoice.created,
          paidDate: invoice.status === 'paid' ? invoice.modified : undefined,
          subtotal: invoice.subTotal || 0,
          taxAmount: invoice.taxTotal || 0,
          totalAmount,
          paidAmount,
          balanceDue,
          paymentStatus,
          paymentMethod: undefined, // Not available in RepairOrderInvoice
          matchRate,
          matchedAttributes,
          unmatchedAttributes,
          status,
          lastUpdated: invoice.modified || new Date().toISOString(),
          notes: undefined,
          suggestions: [],
          issues,
          hasPayments: invoice.paymentCount > 0
        };

        matches.push(financialMatch);
      }
    }

    return matches;
  } catch (error) {
    console.error('Error loading financial data from invoices.json:', error);
    return [];
  }
}

export function applyFinancialUpdate(
  financial: FinancialMatch,
  payload: FinancialUpdatePayload
): FinancialMatch {
  const updated: FinancialMatch = { ...financial };
  
  if (payload.invoiceNumber !== undefined) updated.invoiceNumber = payload.invoiceNumber;
  if (payload.repairOrderId !== undefined) updated.repairOrderId = payload.repairOrderId;
  if (payload.customerId !== undefined) updated.customerId = payload.customerId;
  if (payload.invoiceDate !== undefined) updated.invoiceDate = payload.invoiceDate;
  if (payload.dueDate !== undefined) updated.dueDate = payload.dueDate;
  if (payload.paidDate !== undefined) updated.paidDate = payload.paidDate;
  if (payload.subtotal !== undefined) updated.subtotal = payload.subtotal;
  if (payload.taxAmount !== undefined) updated.taxAmount = payload.taxAmount;
  if (payload.totalAmount !== undefined) updated.totalAmount = payload.totalAmount;
  if (payload.paidAmount !== undefined) updated.paidAmount = payload.paidAmount;
  if (payload.paymentStatus !== undefined) updated.paymentStatus = payload.paymentStatus;
  if (payload.paymentMethod !== undefined) updated.paymentMethod = payload.paymentMethod;
  if (payload.notes !== undefined) updated.notes = payload.notes;
  
  // Recalculate balance due
  if (updated.totalAmount !== undefined && updated.paidAmount !== undefined) {
    updated.balanceDue = updated.totalAmount - updated.paidAmount;
  }
  
  // Handle legacy marking
  if (payload.markAsLegacy) {
    updated.status = 'legacy';
    updated.matchRate = Math.min(updated.matchRate, 0.85);
  } else {
    // Recalculate match rate and status
    let newMatchRate = 0.5;
    const newMatchedAttributes: string[] = [];
    const newUnmatchedAttributes: string[] = [];
    
    if (updated.customerName) {
      newMatchRate += 0.2;
      newMatchedAttributes.push('customer-name');
    } else {
      newUnmatchedAttributes.push('customer-name');
    }
    
    if (updated.totalAmount && updated.totalAmount > 0) {
      newMatchRate += 0.2;
      newMatchedAttributes.push('total-amount');
    } else {
      newUnmatchedAttributes.push('total-amount');
    }
    
    if (updated.invoiceDate) {
      newMatchRate += 0.1;
      newMatchedAttributes.push('invoice-date');
    } else {
      newUnmatchedAttributes.push('invoice-date');
    }
    
    updated.matchRate = newMatchRate;
    updated.matchedAttributes = newMatchedAttributes;
    updated.unmatchedAttributes = newUnmatchedAttributes;
    
    // Update status based on new match rate
    if (newMatchRate >= 0.9) {
      updated.status = 'validated';
    } else if (newMatchRate < 0.7) {
      updated.status = 'pending';
    }
  }
  
  updated.lastUpdated = new Date().toISOString();
  
  return updated;
}

export function summarizeFinancialFailures(financials: FinancialMatch[]): {
  totals: {
    total: number;
    validated: number;
    legacy: number;
    pending: number;
  };
  topFailures: Array<{ reason: string; count: number }>;
} {
  const totals = {
    total: financials.length,
    validated: financials.filter(f => f.status === 'validated').length,
    legacy: financials.filter(f => f.status === 'legacy').length,
    pending: financials.filter(f => f.status === 'pending').length
  };
  
  // Count failure reasons
  const failureCounts = new Map<string, number>();
  
  for (const financial of financials) {
    if (financial.issues) {
      for (const issue of financial.issues) {
        failureCounts.set(issue, (failureCounts.get(issue) || 0) + 1);
      }
    }
    
    for (const attr of financial.unmatchedAttributes) {
      const reason = `missing-${attr}`;
      failureCounts.set(reason, (failureCounts.get(reason) || 0) + 1);
    }
  }
  
  const topFailures = Array.from(failureCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  return { totals, topFailures };
}
