import { create } from 'zustand';
import { CustomerProfile, PartMatch, ReviewSummary, VehicleMatch } from '../../shared/onboarding';

interface WizardState {
  sessionId?: string;
  customer?: CustomerProfile;
  vehicles: VehicleMatch[];
  parts: PartMatch[];
  summary?: ReviewSummary;
  vehicleSummary?: {
    totals: {
      total: number;
      validated: number;
      legacy: number;
      pending: number;
    };
    topFailures: Array<{ reason: string; count: number }>;
  };
  partSummary?: {
    totals: {
      total: number;
      validated: number;
      legacy: number;
      pending: number;
    };
    topFailures: Array<{ reason: string; count: number }>;
  };
  setSessionId: (sessionId: string) => void;
  setCustomerProfile: (customer: CustomerProfile) => void;
  setVehicles: (vehicles: VehicleMatch[]) => void;
  setVehicleSummary: (summary: WizardState['vehicleSummary']) => void;
  updateVehicle: (vehicleId: string, updater: (vehicle: VehicleMatch) => VehicleMatch) => void;
  setParts: (parts: PartMatch[]) => void;
  setPartSummary: (summary: WizardState['partSummary']) => void;
  updatePart: (partId: string, updater: (part: PartMatch) => PartMatch) => void;
  setSummary: (summary: ReviewSummary) => void;
  reset: () => void;
}

const initialState = {
  vehicles: [] as VehicleMatch[],
  parts: [] as PartMatch[]
};

export const useWizardStore = create<WizardState>((set) => ({
  ...initialState,
  setSessionId: (sessionId) => set({ sessionId }),
  setCustomerProfile: (customer) => set({ customer }),
  setVehicles: (vehicles) => set({ vehicles }),
  setVehicleSummary: (vehicleSummary) => set({ vehicleSummary }),
  updateVehicle: (vehicleId, updater) =>
    set((state) => ({
      vehicles: state.vehicles.map((vehicle) =>
        vehicle.unitId === vehicleId ? updater(vehicle) : vehicle
      )
    })),
  setParts: (parts) => set({ parts }),
  setPartSummary: (partSummary) => set({ partSummary }),
  updatePart: (partId, updater) =>
    set((state) => ({
      parts: state.parts.map((part) => (part.partId === partId ? updater(part) : part))
    })),
  setSummary: (summary) => set({ summary }),
  reset: () => set({
    ...initialState,
    sessionId: undefined,
    customer: undefined,
    summary: undefined,
    vehicleSummary: undefined,
    partSummary: undefined
  })
}));
