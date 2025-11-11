export interface Customer {
  customerId: number;
  entityId: number;
  name: string;
  title?: string;
  legalName?: string;
  status: string;
  unitCount: number;
  totalRepairOrders: number;
  phone?: string;
  email?: string;
  units?: CustomerUnit[];
  addresses?: CustomerAddress[];
}

export interface CustomerUnit {
  customerUnitId: number;
  customerId: number;
  title?: string;
  status: string;
  licensePlate?: string;
  licensePlateState?: string;
  number?: string;
  fleetNumber?: string;
  year?: number;
  make?: string;
  model?: string;
  engineMake?: string;
  engineModel?: string;
  vin?: string;
  mileage?: number;
  hoursOfOperation?: number;
  serviceHistory?: {
    totalServiceOrders: number;
  };
  serviceOrders?: ServiceOrder[];
}

export interface ServiceOrder {
  repairOrderId: number;
  repairOrderNumber: number;
  customerUnitId: number;
  customerId: number;
  entityId: number;
  workFlowStatus: string;
  partsFlowStatus?: string;
  description?: string;
  scheduledDate?: string;
  completedDate?: string;
  created?: string;
  modified?: string;
  actionItems?: ActionItem[];
}

export interface ActionItem {
  repairOrderActionItemId: number;
  repairOrderId: number;
  actionItemType: string;
  description: string;
  hours: number;
  entityLaborRateId: number;
  status: string;
}

export interface CustomerAddress {
  customerAddressId: number;
  customerId: number;
  addressType: string;
  isPrimary: number;
  name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface Company {
  name: string;
  entityId: number;
  customerCount: number;
  units?: number;
  serviceOrders?: number;
}

export interface ExportData {
  timestamp: string;
  displayName: string;
  success?: boolean;
  entitiesProcessed?: number;
  processingTimeFormatted?: string;
}