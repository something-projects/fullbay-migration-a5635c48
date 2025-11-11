import axios from 'axios';
import {
  CustomerBootstrapRequest,
  CustomerLookupRequest,
  CustomerLookupResponse,
  CustomerMatch,
  CustomerUpdatePayload,
  EmployeeMatch,
  EmployeeUpdatePayload,
  FinancialMatch,
  FinancialUpdatePayload,
  PartMatch,
  PartUpdatePayload,
  RepairOrderMatch,
  RepairOrderUpdatePayload,
  ReviewSummary,
  VehicleMatch,
  VehicleUpdatePayload,
  WizardSession
} from '../../shared/onboarding';

const client = axios.create({
  baseURL: '/api',
  timeout: 60000
});

// Create separate client for long-running operations (no timeout limit)
const longRunningClient = axios.create({
  baseURL: '/api',
  timeout: 0  // 0 = no timeout limit
});

interface BootstrapResponse {
  session: WizardSession;
  vehicles: VehicleMatch[];
  parts: PartMatch[];
}

interface CustomersResponse {
  customers: CustomerMatch[];
  summary: {
    totals: {
      total: number;
      validated: number;
      legacy: number;
      pending: number;
    };
    topFailures: Array<{ reason: string; count: number }>;
  };
}

interface VehiclesResponse {
  vehicles: VehicleMatch[];
  summary: {
    totals: {
      total: number;
      validated: number;
      legacy: number;
      pending: number;
    };
    topFailures: Array<{ reason: string; count: number }>;
  };
}

interface PartsResponse {
  parts: PartMatch[];
  summary: {
    totals: {
      total: number;
      validated: number;
      legacy: number;
      pending: number;
    };
    topFailures: Array<{ reason: string; count: number }>;
  };
}

interface EmployeesResponse {
  employees: EmployeeMatch[];
  summary: {
    totals: {
      total: number;
      validated: number;
      legacy: number;
      pending: number;
    };
    topFailures: Array<{ reason: string; count: number }>;
  };
}

interface RepairOrdersResponse {
  repairOrders: RepairOrderMatch[];
  summary: {
    totals: {
      total: number;
      validated: number;
      legacy: number;
      pending: number;
    };
    topFailures: Array<{ reason: string; count: number }>;
  };
}

interface FinancialResponse {
  invoices: FinancialMatch[];
  summary: {
    totals: {
      total: number;
      validated: number;
      legacy: number;
      pending: number;
    };
    topFailures: Array<{ reason: string; count: number }>;
  };
}

interface SummaryResponse {
  summary: ReviewSummary;
}

export const onboardingApi = {
  async lookupCustomer(payload: CustomerLookupRequest): Promise<CustomerLookupResponse> {
    const { data } = await client.post<CustomerLookupResponse>('/onboarding/lookup', payload);
    return data;
  },

  async bootstrapCustomer(payload: CustomerBootstrapRequest): Promise<BootstrapResponse> {
    // Use client without timeout limit, as bootstrap needs to load large amounts of data
    const { data } = await longRunningClient.post<BootstrapResponse>('/onboarding/bootstrap', payload);
    return data;
  },

  async fetchCustomers(customerId: string): Promise<CustomersResponse> {
    const { data } = await client.get<CustomersResponse>(`/onboarding/${customerId}/customers`);
    return data;
  },

  async updateCustomer(customerId: string, customerRecordId: string, payload: CustomerUpdatePayload): Promise<CustomerMatch> {
    const { data } = await client.post<CustomerMatch>(`/onboarding/${customerId}/customers/${customerRecordId}`, payload);
    return data;
  },

  async fetchVehicles(customerId: string): Promise<VehiclesResponse> {
    const { data } = await client.get<VehiclesResponse>(`/onboarding/${customerId}/vehicles`);
    return data;
  },

  async updateVehicle(customerId: string, vehicleId: string, payload: VehicleUpdatePayload): Promise<VehicleMatch> {
    const { data } = await client.post<VehicleMatch>(`/onboarding/${customerId}/vehicles/${vehicleId}`, payload);
    return data;
  },

  async fetchParts(customerId: string): Promise<PartsResponse> {
    const { data } = await client.get<PartsResponse>(`/onboarding/${customerId}/parts`);
    return data;
  },

  async updatePart(customerId: string, partId: string, payload: PartUpdatePayload): Promise<PartMatch> {
    const { data} = await client.post<PartMatch>(`/onboarding/${customerId}/parts/${partId}`, payload);
    return data;
  },

  async fetchEmployees(customerId: string): Promise<EmployeesResponse> {
    const { data } = await client.get<EmployeesResponse>(`/onboarding/${customerId}/employees`);
    return data;
  },

  async updateEmployee(customerId: string, employeeId: string, payload: EmployeeUpdatePayload): Promise<EmployeeMatch> {
    const { data } = await client.post<EmployeeMatch>(`/onboarding/${customerId}/employees/${employeeId}`, payload);
    return data;
  },

  async fetchRepairOrders(customerId: string): Promise<RepairOrdersResponse> {
    const { data } = await client.get<RepairOrdersResponse>(`/onboarding/${customerId}/repair-orders`);
    return data;
  },

  async updateRepairOrder(customerId: string, orderId: string, payload: RepairOrderUpdatePayload): Promise<RepairOrderMatch> {
    const { data } = await client.post<RepairOrderMatch>(`/onboarding/${customerId}/repair-orders/${orderId}`, payload);
    return data;
  },

  async fetchFinancial(customerId: string): Promise<FinancialResponse> {
    const { data } = await client.get<FinancialResponse>(`/onboarding/${customerId}/financial`);
    return data;
  },

  async updateFinancial(customerId: string, invoiceId: string, payload: FinancialUpdatePayload): Promise<FinancialMatch> {
    const { data } = await client.post<FinancialMatch>(`/onboarding/${customerId}/financial/${invoiceId}`, payload);
    return data;
  },

  async completeReview(customerId: string): Promise<SummaryResponse> {
    // Use client without timeout limit, as export operation may take a long time (especially for large datasets)
    const { data } = await longRunningClient.post<SummaryResponse>(`/onboarding/${customerId}/complete`, {});
    return data;
  }
};
