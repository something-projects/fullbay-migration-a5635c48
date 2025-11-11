export interface CustomerBootstrapRequest {
  customerId: string;
  displayName?: string;
  notes?: string;
}

export interface CustomerLookupRequest {
  username: string;
}

export interface CustomerLookupResponse {
  customerId: string;
  displayName?: string;
  legalName?: string;
  matchedField: 'title' | 'legalName' | 'customerId';
  matchType: 'exact' | 'partial' | 'id';
}

export interface CustomerProfile {
  customerId: string;
  displayName?: string;
  status: 'pending' | 'ready' | 'reviewing' | 'completed' | 'errored';
  lastExportedAt?: string;
  sourceOutputPath?: string;
  customerDirectory?: string;
  notes?: string;
}

export interface VehicleSuggestion {
  suggestionId: string;
  kind: 'vin-format' | 'autocare-standardized' | 'related-unit';
  title: string;
  description?: string;
  payload: VehicleUpdatePayload;
}

export interface WizardSession {
  sessionId: string;
  customer: CustomerProfile;
  startedAt: string;
  transformerJobId?: string;
}

export interface VehicleMatch {
  unitId: string;
  label: string;
  vin?: string;
  make?: string;
  model?: string;
  modelYear?: number;
  matchRate: number;
  matchedAttributes: string[];
  unmatchedAttributes: string[];
  lastUpdated?: string;
  status: 'pending' | 'updating' | 'legacy' | 'validated';
  notes?: string;
  suggestions: VehicleSuggestion[];
  autoCareReference?: {
    makeName?: string;
    modelName?: string;
    year?: number;
    confidence?: number;
  };
  customerId?: string;
  customerName?: string;
  customerDescription?: string;
}

export interface VehicleUpdatePayload {
  vin?: string;
  make?: string;
  model?: string;
  modelYear?: number;
  markAsLegacy?: boolean;
  notes?: string;
}

export interface PartSuggestion {
  suggestionId: string;
  kind:
    | 'normalized-label'
    | 'autocare-standardized'
    | 'clustered-alias'
    | 'add-category'
    | 'review-match'
    | 'no-autocare-match'
    | 'missing-part-number'
    | 'missing-description';
  title: string;
  description?: string;
  payload: PartUpdatePayload;
}

export interface PartMatch {
  partId: string;
  oemPartNumber?: string;
  description?: string;
  category?: string;
  matchRate: number;
  matchedAttributes: string[];
  unmatchedAttributes: string[];
  status: 'pending' | 'legacy' | 'validated';
  lastUpdated?: string;
  notes?: string;
  suggestions: PartSuggestion[];
  autoCareReference?: {
    partName?: string;
    matchingMethod?: string;
    confidence?: number;
  };
  // Fullbay Generic Part metadata
  genericPartMetadata?: {
    fullbayPartId: string;
    category: 'oil' | 'filter' | 'fluid' | 'supply' | 'tire' | 'grease' | 'other';
    matchedPattern: string;
    originalDescription: string;
  };
}

export interface PartUpdatePayload {
  overridePartNumber?: string;
  overrideDescription?: string;
  markAsLegacy?: boolean;
  notes?: string;
}

export interface ReviewSummary {
  vehiclesReviewed: number;
  vehiclesValidated: number;
  partsReviewed: number;
  partsValidated: number;
  employeesReviewed?: number;
  employeesValidated?: number;
  customersReviewed?: number;
  customersValidated?: number;
  repairOrdersReviewed?: number;
  repairOrdersValidated?: number;
  exportPath?: string;
  userValidatedPath?: string; // New: user-validated directory path
}

// ========================================
// Entity Employee Migration Types
// ========================================

export interface EmployeeSuggestion {
  suggestionId: string;
  kind: 'normalized-name' | 'duplicate-detection' | 'role-mapping';
  title: string;
  description?: string;
  payload: EmployeeUpdatePayload;
}

export interface EmployeeMatch {
  entityEmployeeId: string;
  firstName: string;
  lastName: string;
  email?: string;
  jobTitle?: string;
  hourlyWage?: number;
  phoneNumber?: string;
  active: boolean;
  matchRate: number;
  matchedAttributes: string[];
  unmatchedAttributes: string[];
  status: 'pending' | 'updating' | 'legacy' | 'validated';
  lastUpdated?: string;
  notes?: string;
  suggestions: EmployeeSuggestion[];
  issues?: string[]; // e.g., 'missing-email', 'duplicate-name', 'invalid-wage'
}

export interface EmployeeUpdatePayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  jobTitle?: string;
  hourlyWage?: number;
  phoneNumber?: string;
  active?: boolean;
  markAsLegacy?: boolean;
  notes?: string;
}

// ========================================
// Customer Migration Types
// ========================================

export interface CustomerSuggestion {
  suggestionId: string;
  kind:
    | 'normalized-address'
    | 'contact-validation'
    | 'duplicate-detection'
    | 'add-email'
    | 'add-phone'
    | 'add-address'
    | 'add-contact';
  title: string;
  description?: string;
  payload: CustomerUpdatePayload;
}

export interface CustomerMatch {
  customerId: string;
  customerName: string;
  legalName?: string;
  accountNumber?: string;
  taxId?: string;
  active?: boolean;
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
  customerType?: 'fleet' | 'individual' | 'government' | 'other';
  creditLimit?: number;
  paymentTerms?: string;
  matchRate: number;
  matchedAttributes: string[];
  unmatchedAttributes: string[];
  status: 'pending' | 'updating' | 'legacy' | 'validated';
  lastUpdated?: string;
  notes?: string;
  suggestions: CustomerSuggestion[];
  unitCount?: number;
  repairOrderCount?: number;
  totalSpent?: number;
  issues?: string[]; // e.g., 'missing-address', 'duplicate-name', 'invalid-tax-id'
}

export interface CustomerUpdatePayload {
  customerName?: string;
  legalName?: string;
  accountNumber?: string;
  taxId?: string;
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
  customerType?: 'fleet' | 'individual' | 'government' | 'other';
  creditLimit?: number;
  paymentTerms?: string;
  markAsLegacy?: boolean;
  notes?: string;
}

// ========================================
// Repair Order Migration Types
// ========================================

export interface RepairOrderSuggestion {
  suggestionId: string;
  kind: 'date-validation' | 'status-mapping' | 'financial-calculation';
  title: string;
  description?: string;
  payload: RepairOrderUpdatePayload;
}

export interface RepairOrderMatch {
  repairOrderId: string;
  roNumber?: string;
  customerId: string;
  customerName?: string;
  customerUnitId?: string;
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
  matchRate: number;
  matchedAttributes: string[];
  unmatchedAttributes: string[];
  status: 'pending' | 'updating' | 'legacy' | 'validated';
  lastUpdated?: string;
  notes?: string;
  suggestions: RepairOrderSuggestion[];
  invoiceCount?: number;
  hasFinancialData?: boolean;
  issues?: string[]; // e.g., 'missing-customer', 'missing-unit', 'invalid-totals', 'negative-balance'
}

export interface RepairOrderUpdatePayload {
  roNumber?: string;
  customerId?: string;
  customerUnitId?: string;
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
  markAsLegacy?: boolean;
  notes?: string;
}

// ========================================
// Financial/Invoice Migration Types
// ========================================

export interface FinancialSuggestion {
  suggestionId: string;
  kind: 'payment-reconciliation' | 'tax-calculation' | 'invoice-matching';
  title: string;
  description?: string;
  payload: FinancialUpdatePayload;
}

export interface FinancialMatch {
  invoiceId: string;
  invoiceNumber?: string;
  repairOrderId?: string;
  roNumber?: string;
  customerId: string;
  customerName?: string;
  invoiceDate?: string;
  dueDate?: string;
  paidDate?: string;
  subtotal?: number;
  taxAmount?: number;
  totalAmount?: number;
  paidAmount?: number;
  balanceDue?: number;
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'void';
  paymentMethod?: string;
  matchRate: number;
  matchedAttributes: string[];
  unmatchedAttributes: string[];
  status: 'pending' | 'updating' | 'legacy' | 'validated';
  lastUpdated?: string;
  notes?: string;
  suggestions: FinancialSuggestion[];
  issues?: string[]; // e.g., 'missing-repair-order', 'calculation-mismatch', 'negative-amount'
  hasPayments?: boolean;
}

export interface FinancialUpdatePayload {
  invoiceNumber?: string;
  repairOrderId?: string;
  customerId?: string;
  invoiceDate?: string;
  dueDate?: string;
  paidDate?: string;
  subtotal?: number;
  taxAmount?: number;
  totalAmount?: number;
  paidAmount?: number;
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'void';
  paymentMethod?: string;
  markAsLegacy?: boolean;
  notes?: string;
}
