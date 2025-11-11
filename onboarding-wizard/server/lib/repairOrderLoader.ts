import { promises as fs } from 'fs';
import path from 'path';
import type { RepairOrderMatch, RepairOrderSuggestion, RepairOrderUpdatePayload } from '../../shared/onboarding.js';
import { pathExists, readJson } from './fileUtils.js';

interface RepairOrderData {
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

export async function loadRepairOrderMatches(entityOutputDir: string): Promise<RepairOrderMatch[]> {
  const repairOrdersPath = path.join(entityOutputDir, 'repair-orders.json');

  if (!(await pathExists(repairOrdersPath))) {
    console.log('No repair-orders.json file found, generating mock data');
    return generateMockRepairOrders();
  }

  try {
    const data = await readJson<{ repairOrders?: RepairOrderData[] }>(repairOrdersPath);

    if (!data.repairOrders || data.repairOrders.length === 0) {
      console.log('No repair orders in export, using mock data');
      return generateMockRepairOrders();
    }

    const matches = data.repairOrders.map(ro => createRepairOrderMatch(ro));
    return matches.sort((a, b) => {
      const dateA = new Date(a.createdDate || '').getTime();
      const dateB = new Date(b.createdDate || '').getTime();
      return dateB - dateA; // Most recent first
    });
  } catch (error) {
    console.error('Error loading repair orders:', error);
    return generateMockRepairOrders();
  }
}

export function summarizeRepairOrderFailures(orders: RepairOrderMatch[]) {
  const total = orders.length;
  const validated = orders.filter((ro) => ro.status === 'validated').length;
  const legacy = orders.filter((ro) => ro.status === 'legacy').length;
  const pending = total - validated - legacy;

  const reasonCounts = new Map<string, { reason: string; count: number }>();

  for (const order of orders) {
    if (order.issues) {
      for (const issue of order.issues) {
        const key = issue.toLowerCase();
        const existing = reasonCounts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          reasonCounts.set(key, { reason: issue, count: 1 });
        }
      }
    }
  }

  const topFailures = Array.from(reasonCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totals: {
      total,
      validated,
      legacy,
      pending
    },
    topFailures
  };
}

function createRepairOrderMatch(ro: RepairOrderData): RepairOrderMatch {
  const matchedAttributes: string[] = [];
  const unmatchedAttributes: string[] = [];
  const issues: string[] = [];

  // Check RO Number
  if (ro.roNumber) {
    matchedAttributes.push('roNumber');
  } else {
    unmatchedAttributes.push('roNumber');
    issues.push('missing-ro-number');
  }

  // Check customer
  if (ro.customerId) {
    matchedAttributes.push('customerId');
  } else {
    unmatchedAttributes.push('customerId');
    issues.push('missing-customer');
  }

  // Check unit
  if (ro.customerUnitId) {
    matchedAttributes.push('customerUnitId');
  } else {
    unmatchedAttributes.push('customerUnitId');
    issues.push('missing-unit');
  }

  // Check dates
  if (ro.createdDate) {
    matchedAttributes.push('createdDate');
  } else {
    unmatchedAttributes.push('createdDate');
    issues.push('missing-created-date');
  }

  if (ro.workFlowStatus === 'completed' || ro.workFlowStatus === 'closed') {
    if (ro.completedDate) {
      matchedAttributes.push('completedDate');
    } else {
      unmatchedAttributes.push('completedDate');
      issues.push('missing-completed-date');
    }
  }

  // Check financial data
  if (ro.laborTotal !== undefined && ro.laborTotal > 0) {
    matchedAttributes.push('laborTotal');
  }

  if (ro.partsTotal !== undefined && ro.partsTotal > 0) {
    matchedAttributes.push('partsTotal');
  }

  if (ro.grandTotal !== undefined && ro.grandTotal > 0) {
    matchedAttributes.push('grandTotal');
  } else {
    unmatchedAttributes.push('grandTotal');
    issues.push('missing-total');
  }

  // Check for calculation mismatches
  if (ro.grandTotal && ro.laborTotal !== undefined && ro.partsTotal !== undefined) {
    const calculated = (ro.laborTotal || 0) + (ro.partsTotal || 0) + (ro.outsideTotal || 0) - (ro.discountTotal || 0) + (ro.taxTotal || 0);
    if (Math.abs(calculated - ro.grandTotal) > 0.01) {
      issues.push('calculation-mismatch');
    }
  }

  // Check payment status
  if (ro.paidAmount !== undefined && ro.grandTotal !== undefined) {
    if (ro.paidAmount > 0) {
      matchedAttributes.push('paidAmount');
    }
    if (ro.balanceDue === undefined || ro.balanceDue > 0.01) {
      issues.push('unpaid-balance');
    }
  }

  const matchRate = Math.round((matchedAttributes.length / Math.max(matchedAttributes.length + unmatchedAttributes.length, 1)) * 100);
  const status = unmatchedAttributes.length === 0 ? 'validated' : 'pending';

  const match: RepairOrderMatch = {
    repairOrderId: String(ro.repairOrderId),
    roNumber: ro.roNumber || '',
    customerId: String(ro.customerId),
    customerName: ro.customerName || '',
    customerUnitId: ro.customerUnitId ? String(ro.customerUnitId) : '',
    unitLabel: ro.unitLabel || '',
    createdDate: ro.createdDate || '',
    completedDate: ro.completedDate || '',
    workFlowStatus: ro.workFlowStatus || '',
    description: ro.description || '',
    odometer: ro.odometer || 0,
    laborTotal: ro.laborTotal || 0,
    partsTotal: ro.partsTotal || 0,
    outsideTotal: ro.outsideTotal || 0,
    discountTotal: ro.discountTotal || 0,
    taxTotal: ro.taxTotal || 0,
    grandTotal: ro.grandTotal || 0,
    paidAmount: ro.paidAmount || 0,
    balanceDue: ro.balanceDue || 0,
    matchRate,
    matchedAttributes,
    unmatchedAttributes,
    status,
    suggestions: buildRepairOrderSuggestions(matchedAttributes, unmatchedAttributes, String(ro.repairOrderId)),
    invoiceCount: ro.paidAmount && ro.paidAmount > 0 ? 1 : 0,
    hasFinancialData: (ro.paidAmount || 0) > 0,
    issues: issues.length > 0 ? issues : undefined
  };

  return match;
}

function buildRepairOrderSuggestions(
  matchedAttributes: string[],
  unmatchedAttributes: string[],
  repairOrderId: string
): RepairOrderSuggestion[] {
  const suggestions: RepairOrderSuggestion[] = [];

  if (unmatchedAttributes.includes('roNumber')) {
    suggestions.push({
      suggestionId: `ro-${repairOrderId}`,
      kind: 'date-validation',
      title: 'Add RO number',
      description: 'Assign a repair order number',
      payload: {}
    });
  }

  if (unmatchedAttributes.includes('completedDate')) {
    suggestions.push({
      suggestionId: `completed-${repairOrderId}`,
      kind: 'date-validation',
      title: 'Set completed date',
      description: 'Mark when this order was completed',
      payload: {}
    });
  }

  return suggestions;
}

export function applyRepairOrderUpdate(
  order: RepairOrderMatch,
  payload: RepairOrderUpdatePayload
): RepairOrderMatch {
  const updated = { ...order };

  // Apply field updates
  if (payload.roNumber !== undefined) updated.roNumber = payload.roNumber;
  if (payload.customerId !== undefined) updated.customerId = payload.customerId;
  if (payload.customerUnitId !== undefined) updated.customerUnitId = payload.customerUnitId;
  if (payload.createdDate !== undefined) updated.createdDate = payload.createdDate;
  if (payload.completedDate !== undefined) updated.completedDate = payload.completedDate;
  if (payload.workFlowStatus !== undefined) updated.workFlowStatus = payload.workFlowStatus;
  if (payload.description !== undefined) updated.description = payload.description;
  if (payload.odometer !== undefined) updated.odometer = payload.odometer;
  if (payload.laborTotal !== undefined) updated.laborTotal = payload.laborTotal;
  if (payload.partsTotal !== undefined) updated.partsTotal = payload.partsTotal;
  if (payload.outsideTotal !== undefined) updated.outsideTotal = payload.outsideTotal;
  if (payload.discountTotal !== undefined) updated.discountTotal = payload.discountTotal;
  if (payload.taxTotal !== undefined) updated.taxTotal = payload.taxTotal;
  if (payload.notes !== undefined) updated.notes = payload.notes;

  // Handle legacy status
  if (payload.markAsLegacy) {
    updated.status = 'legacy';
    updated.lastUpdated = new Date().toISOString();
    return updated;
  }

  // Recalculate totals
  const subtotal = (updated.laborTotal || 0) + (updated.partsTotal || 0) + (updated.outsideTotal || 0);
  const afterDiscount = subtotal - (updated.discountTotal || 0);
  updated.grandTotal = afterDiscount + (updated.taxTotal || 0);
  updated.balanceDue = updated.grandTotal - (updated.paidAmount || 0);

  // Recalculate match attributes
  const matchedAttributes: string[] = [];
  const unmatchedAttributes: string[] = [];
  const issues: string[] = [];

  if (updated.roNumber) matchedAttributes.push('roNumber');
  else { unmatchedAttributes.push('roNumber'); issues.push('missing-ro-number'); }

  if (updated.customerId) matchedAttributes.push('customerId');
  else { unmatchedAttributes.push('customerId'); issues.push('missing-customer'); }

  if (updated.customerUnitId) matchedAttributes.push('customerUnitId');
  else { unmatchedAttributes.push('customerUnitId'); issues.push('missing-unit'); }

  if (updated.createdDate) matchedAttributes.push('createdDate');
  else { unmatchedAttributes.push('createdDate'); issues.push('missing-created-date'); }

  if (updated.workFlowStatus === 'completed' || updated.workFlowStatus === 'closed') {
    if (updated.completedDate) matchedAttributes.push('completedDate');
    else { unmatchedAttributes.push('completedDate'); issues.push('missing-completed-date'); }
  }

  if (updated.laborTotal && updated.laborTotal > 0) matchedAttributes.push('laborTotal');
  if (updated.partsTotal && updated.partsTotal > 0) matchedAttributes.push('partsTotal');

  if (updated.grandTotal && updated.grandTotal > 0) matchedAttributes.push('grandTotal');
  else { unmatchedAttributes.push('grandTotal'); issues.push('missing-total'); }

  if (updated.paidAmount && updated.paidAmount > 0) matchedAttributes.push('paidAmount');
  if (updated.balanceDue > 0.01) issues.push('unpaid-balance');

  updated.matchedAttributes = matchedAttributes;
  updated.unmatchedAttributes = unmatchedAttributes;
  updated.matchRate = Math.round((matchedAttributes.length / Math.max(matchedAttributes.length + unmatchedAttributes.length, 1)) * 100);
  updated.status = unmatchedAttributes.length === 0 ? 'validated' : 'pending';
  updated.issues = issues.length > 0 ? issues : undefined;
  updated.lastUpdated = new Date().toISOString();
  updated.suggestions = buildRepairOrderSuggestions(matchedAttributes, unmatchedAttributes, updated.repairOrderId);

  return updated;
}

function generateMockRepairOrders(): RepairOrderMatch[] {
  return [
    {
      repairOrderId: 'ro_001',
      roNumber: 'RO-2024-001',
      customerId: 'cust_001',
      customerName: 'ABC Trucking Co',
      customerUnitId: 'unit_001',
      unitLabel: '2018 Freightliner Cascadia',
      createdDate: '2024-01-15',
      completedDate: '2024-01-17',
      workFlowStatus: 'completed',
      description: 'Annual PM Service',
      odometer: 245000,
      laborTotal: 850.00,
      partsTotal: 1250.00,
      outsideTotal: 0,
      discountTotal: 0,
      taxTotal: 168.00,
      grandTotal: 2268.00,
      paidAmount: 2268.00,
      balanceDue: 0,
      matchRate: 100,
      matchedAttributes: ['roNumber', 'customerId', 'customerUnitId', 'createdDate', 'completedDate', 'workFlowStatus', 'laborTotal', 'partsTotal', 'taxTotal', 'grandTotal'],
      unmatchedAttributes: [],
      status: 'validated',
      suggestions: [],
      invoiceCount: 1,
      hasFinancialData: true,
    },
    {
      repairOrderId: 'ro_002',
      roNumber: 'RO-2024-002',
      customerId: 'cust_002',
      customerName: 'CIMS Fleet Services',
      customerUnitId: '',
      unitLabel: '',
      createdDate: '2024-02-10',
      completedDate: '',
      workFlowStatus: 'open',
      description: 'Brake repair and inspection',
      odometer: 0,
      laborTotal: 450.00,
      partsTotal: 320.00,
      outsideTotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 770.00,
      paidAmount: 0,
      balanceDue: 770.00,
      matchRate: 60,
      matchedAttributes: ['roNumber', 'customerId', 'createdDate', 'workFlowStatus', 'laborTotal', 'partsTotal'],
      unmatchedAttributes: ['customerUnitId', 'completedDate', 'odometer', 'taxTotal'],
      status: 'pending',
      suggestions: [],
      invoiceCount: 0,
      hasFinancialData: false,
      issues: ['missing-unit', 'missing-completed-date', 'unpaid-balance'],
    },
    {
      repairOrderId: 'ro_003',
      roNumber: '',
      customerId: 'cust_003',
      customerName: 'XYZ Logistics',
      customerUnitId: 'unit_003',
      unitLabel: '2020 Peterbilt 579',
      createdDate: '2024-03-05',
      completedDate: '2024-03-06',
      workFlowStatus: 'completed',
      description: 'Oil change and inspection',
      odometer: 189000,
      laborTotal: 125.00,
      partsTotal: 180.00,
      outsideTotal: 0,
      discountTotal: 15.00,
      taxTotal: 23.40,
      grandTotal: 313.40,
      paidAmount: 313.40,
      balanceDue: 0,
      matchRate: 90,
      matchedAttributes: ['customerId', 'customerUnitId', 'createdDate', 'completedDate', 'workFlowStatus', 'laborTotal', 'partsTotal', 'discountTotal', 'taxTotal', 'grandTotal'],
      unmatchedAttributes: ['roNumber'],
      status: 'pending',
      suggestions: [],
      invoiceCount: 1,
      hasFinancialData: true,
      issues: ['missing-ro-number'],
    },
  ];
}
