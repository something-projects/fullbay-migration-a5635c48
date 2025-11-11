import { promises as fs } from 'fs';
import path from 'path';
import type { CustomerMatch, CustomerSuggestion, CustomerUpdatePayload } from '../../shared/onboarding.js';
import { pathExists, readJson } from './fileUtils.js';

interface CustomerIndexData {
  customerId: string;
  title?: string;
  legalName?: string;
  phone?: string;
  active?: number;
  status?: string;
  units?: Array<{
    customerUnitId: number;
    make?: string;
    model?: string;
    year?: number;
    active?: number;
  }>;
  summary?: {
    totalUnits?: number;
    totalServiceOrders?: number;
    lastActivity?: string;
  };
}

interface CustomerEntityData {
  customerId?: string;
  title?: string;
  legalName?: string;
  accountNumber?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  billingAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  primaryContact?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  creditLimit?: number;
  paymentTerms?: string;
  customerType?: string;
  notes?: string;
}

export async function loadCustomerMatches(entityOutputDir: string): Promise<CustomerMatch[]> {
  const customersDir = path.join(entityOutputDir, 'customers');
  if (!(await pathExists(customersDir))) {
    return [];
  }

  const matches: CustomerMatch[] = [];
  const customerEntries = await fs.readdir(customersDir, { withFileTypes: true });

  for (const customerEntry of customerEntries) {
    if (!customerEntry.isDirectory()) continue;

    const customerId = customerEntry.name;
    const customerDir = path.join(customersDir, customerId);
    const indexPath = path.join(customerDir, 'index.json');
    const entityPath = path.join(customerDir, 'entity.json');

    try {
      // Load index.json for summary data
      const indexData = await pathExists(indexPath)
        ? await readJson<CustomerIndexData>(indexPath)
        : null;

      // Load entity.json for detailed data
      const entityData = await pathExists(entityPath)
        ? await readJson<CustomerEntityData>(entityPath)
        : null;

      if (!indexData && !entityData) {
        continue;
      }

      const match = createCustomerMatch(customerId, indexData, entityData);
      matches.push(match);
    } catch (error) {
      console.warn(`Failed to load customer ${customerId}:`, error);
    }
  }

  return matches.sort((a, b) => a.customerName.localeCompare(b.customerName));
}

export function summarizeCustomerFailures(customers: CustomerMatch[]) {
  const total = customers.length;
  const validated = customers.filter((c) => c.status === 'validated').length;
  const legacy = customers.filter((c) => c.status === 'legacy').length;
  const pending = total - validated - legacy;

  const reasonCounts = new Map<string, { reason: string; count: number }>();

  for (const customer of customers) {
    for (const reason of customer.unmatchedAttributes) {
      const key = reason.toLowerCase();
      const existing = reasonCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        reasonCounts.set(key, { reason, count: 1 });
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

function createCustomerMatch(
  customerId: string,
  indexData: CustomerIndexData | null,
  entityData: CustomerEntityData | null
): CustomerMatch {
  const matchedAttributes: string[] = [];
  const unmatchedAttributes: string[] = [];

  const customerName = indexData?.title || entityData?.title || indexData?.legalName || entityData?.legalName || `Customer ${customerId}`;
  const legalName = entityData?.legalName || indexData?.legalName;
  const accountNumber = entityData?.accountNumber;
  const taxId = entityData?.taxId;
  const phone = entityData?.phone || indexData?.phone;
  const email = entityData?.email;
  const active = indexData?.active === 1;

  // Check required/important fields
  if (customerName && customerName !== `Customer ${customerId}`) {
    matchedAttributes.push('Customer name');
  } else {
    unmatchedAttributes.push('Customer name missing');
  }

  if (legalName) {
    matchedAttributes.push('Legal name');
  } else {
    unmatchedAttributes.push('Legal name missing');
  }

  if (phone) {
    matchedAttributes.push('Phone');
  } else {
    unmatchedAttributes.push('Phone missing');
  }

  if (email) {
    matchedAttributes.push('Email');
  } else {
    unmatchedAttributes.push('Email missing');
  }

  if (entityData?.billingAddress?.street && entityData?.billingAddress?.city && entityData?.billingAddress?.state) {
    matchedAttributes.push('Complete billing address');
  } else if (entityData?.billingAddress?.street || entityData?.billingAddress?.city) {
    matchedAttributes.push('Partial billing address');
    unmatchedAttributes.push('Incomplete billing address');
  } else {
    unmatchedAttributes.push('Billing address missing');
  }

  if (entityData?.primaryContact?.name && entityData?.primaryContact?.phone) {
    matchedAttributes.push('Primary contact');
  } else {
    unmatchedAttributes.push('Primary contact missing');
  }

  if (taxId) {
    matchedAttributes.push('Tax ID');
  }

  if (accountNumber) {
    matchedAttributes.push('Account number');
  }

  if (!active) {
    unmatchedAttributes.push('Inactive customer');
  }

  const matchRate = Math.round((matchedAttributes.length / 9) * 100);
  const status = unmatchedAttributes.length === 0 ? 'validated' : 'pending';

  const match: CustomerMatch = {
    customerId,
    customerName,
    legalName,
    accountNumber,
    taxId,
    active,
    billingAddress: entityData?.billingAddress,
    primaryContact: entityData?.primaryContact,
    customerType: (entityData?.customerType as any) || 'fleet',
    creditLimit: entityData?.creditLimit,
    paymentTerms: entityData?.paymentTerms,
    matchRate,
    matchedAttributes,
    unmatchedAttributes,
    status,
    suggestions: buildCustomerSuggestions(matchedAttributes, unmatchedAttributes, customerId),
    unitCount: indexData?.summary?.totalUnits || 0,
    repairOrderCount: indexData?.summary?.totalServiceOrders || 0,
    totalSpent: undefined, // Would need financial data
    issues: unmatchedAttributes.length > 0 ? unmatchedAttributes : undefined
  };

  return match;
}

function buildCustomerSuggestions(
  matchedAttributes: string[],
  unmatchedAttributes: string[],
  customerId: string
): CustomerSuggestion[] {
  const suggestions: CustomerSuggestion[] = [];

  if (unmatchedAttributes.includes('Email missing')) {
    suggestions.push({
      suggestionId: `email-${customerId}`,
      kind: 'add-email',
      title: 'Add customer email',
      description: 'Add an email address for invoicing and communication',
      payload: {}
    });
  }

  if (unmatchedAttributes.includes('Phone missing')) {
    suggestions.push({
      suggestionId: `phone-${customerId}`,
      kind: 'add-phone',
      title: 'Add customer phone',
      description: 'Add a phone number for contact purposes',
      payload: {}
    });
  }

  if (unmatchedAttributes.includes('Billing address missing') || unmatchedAttributes.includes('Incomplete billing address')) {
    suggestions.push({
      suggestionId: `address-${customerId}`,
      kind: 'add-address',
      title: 'Complete billing address',
      description: 'Add or complete the billing address for invoicing',
      payload: {}
    });
  }

  if (unmatchedAttributes.includes('Primary contact missing')) {
    suggestions.push({
      suggestionId: `contact-${customerId}`,
      kind: 'add-contact',
      title: 'Add primary contact',
      description: 'Add a primary contact person for this customer',
      payload: {}
    });
  }

  return suggestions;
}

export function applyCustomerUpdate(
  customer: CustomerMatch,
  payload: CustomerUpdatePayload
): CustomerMatch {
  const updated = { ...customer };

  // Apply field updates
  if (payload.customerName !== undefined) updated.customerName = payload.customerName;
  if (payload.legalName !== undefined) updated.legalName = payload.legalName;
  if (payload.accountNumber !== undefined) updated.accountNumber = payload.accountNumber;
  if (payload.taxId !== undefined) updated.taxId = payload.taxId;
  if (payload.customerType !== undefined) updated.customerType = payload.customerType;
  if (payload.creditLimit !== undefined) updated.creditLimit = payload.creditLimit;
  if (payload.paymentTerms !== undefined) updated.paymentTerms = payload.paymentTerms;
  if (payload.notes !== undefined) updated.notes = payload.notes;

  // Update nested objects
  if (payload.billingAddress) {
    updated.billingAddress = {
      ...updated.billingAddress,
      ...payload.billingAddress
    };
  }

  if (payload.primaryContact) {
    updated.primaryContact = {
      ...updated.primaryContact,
      ...payload.primaryContact
    };
  }

  // Handle legacy status
  if (payload.markAsLegacy) {
    updated.status = 'legacy';
    updated.lastUpdated = new Date().toISOString();
    return updated;
  }

  // Recalculate match rate and status
  const matchedAttributes: string[] = [];
  const unmatchedAttributes: string[] = [];

  if (updated.customerName && updated.customerName !== `Customer ${updated.customerId}`) {
    matchedAttributes.push('Customer name');
  } else {
    unmatchedAttributes.push('Customer name missing');
  }

  if (updated.legalName) {
    matchedAttributes.push('Legal name');
  } else {
    unmatchedAttributes.push('Legal name missing');
  }

  if (updated.billingAddress?.street && updated.billingAddress?.city && updated.billingAddress?.state) {
    matchedAttributes.push('Complete billing address');
  } else if (updated.billingAddress?.street || updated.billingAddress?.city) {
    matchedAttributes.push('Partial billing address');
    unmatchedAttributes.push('Incomplete billing address');
  } else {
    unmatchedAttributes.push('Billing address missing');
  }

  if (updated.primaryContact?.name && updated.primaryContact?.phone) {
    matchedAttributes.push('Primary contact');
  } else {
    unmatchedAttributes.push('Primary contact missing');
  }

  if (updated.taxId) {
    matchedAttributes.push('Tax ID');
  }

  if (updated.accountNumber) {
    matchedAttributes.push('Account number');
  }

  updated.matchedAttributes = matchedAttributes;
  updated.unmatchedAttributes = unmatchedAttributes;
  updated.matchRate = Math.round((matchedAttributes.length / 9) * 100);
  updated.status = unmatchedAttributes.length === 0 ? 'validated' : 'pending';
  updated.lastUpdated = new Date().toISOString();
  updated.suggestions = buildCustomerSuggestions(matchedAttributes, unmatchedAttributes, updated.customerId);
  updated.issues = unmatchedAttributes.length > 0 ? unmatchedAttributes : undefined;

  return updated;
}
