import React, { createContext, useContext, useReducer, ReactNode } from 'react';

interface PageState {
  data: any[];
  loading: boolean;
  currentPage: number;
  totalItems: number;
  lastUpdated?: number;
}

interface SearchState extends PageState {
  searchQuery: string;
  selectedStatus?: string;
  isSearchActive: boolean;
}

interface AppState {
  entities: PageState;
  entitiesSearch: SearchState;
  customers: { [entityId: string]: PageState };
  units: { [key: string]: PageState }; // key: entityId-customerId
  serviceOrders: { [key: string]: PageState }; // key: entityId-customerId-unitId
}

type AppAction = 
  | { type: 'SET_ENTITIES'; payload: { data: any[]; currentPage: number; totalItems: number } }
  | { type: 'SET_ENTITIES_LOADING'; payload: boolean }
  | { type: 'SET_ENTITIES_SEARCH'; payload: { data: any[]; currentPage: number; totalItems: number; searchQuery: string; selectedStatus?: string } }
  | { type: 'SET_ENTITIES_SEARCH_LOADING'; payload: boolean }
  | { type: 'CLEAR_ENTITIES_SEARCH' }
  | { type: 'SET_CUSTOMERS'; payload: { entityId: string; data: any[]; currentPage: number; totalItems: number } }
  | { type: 'SET_CUSTOMERS_LOADING'; payload: { entityId: string; loading: boolean } }
  | { type: 'SET_UNITS'; payload: { entityId: string; customerId: string; data: any[]; currentPage: number; totalItems: number } }
  | { type: 'SET_UNITS_LOADING'; payload: { entityId: string; customerId: string; loading: boolean } }
  | { type: 'SET_SERVICE_ORDERS'; payload: { entityId: string; customerId: string; unitId: string; data: any[]; currentPage: number; totalItems: number } }
  | { type: 'SET_SERVICE_ORDERS_LOADING'; payload: { entityId: string; customerId: string; unitId: string; loading: boolean } }
  | { type: 'CLEAR_CACHE' };

const initialState: AppState = {
  entities: {
    data: [],
    loading: false,
    currentPage: 1,
    totalItems: 0
  },
  entitiesSearch: {
    data: [],
    loading: false,
    currentPage: 1,
    totalItems: 0,
    searchQuery: '',
    selectedStatus: '',
    isSearchActive: false
  },
  customers: {},
  units: {},
  serviceOrders: {}
};

function appStateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_ENTITIES':
      return {
        ...state,
        entities: {
          ...action.payload,
          loading: false,
          lastUpdated: Date.now()
        }
      };
    
    case 'SET_ENTITIES_LOADING':
      return {
        ...state,
        entities: {
          ...state.entities,
          loading: action.payload
        }
      };
    
    case 'SET_ENTITIES_SEARCH':
      return {
        ...state,
        entitiesSearch: {
          ...action.payload,
          loading: false,
          isSearchActive: true,
          lastUpdated: Date.now()
        }
      };
    
    case 'SET_ENTITIES_SEARCH_LOADING':
      return {
        ...state,
        entitiesSearch: {
          ...state.entitiesSearch,
          loading: action.payload
        }
      };
    
    case 'CLEAR_ENTITIES_SEARCH':
      return {
        ...state,
        entitiesSearch: {
          data: [],
          loading: false,
          currentPage: 1,
          totalItems: 0,
          searchQuery: '',
          selectedStatus: '',
          isSearchActive: false
        }
      };
    
    case 'SET_CUSTOMERS':
      return {
        ...state,
        customers: {
          ...state.customers,
          [action.payload.entityId]: {
            data: action.payload.data,
            currentPage: action.payload.currentPage,
            totalItems: action.payload.totalItems,
            loading: false,
            lastUpdated: Date.now()
          }
        }
      };
    
    case 'SET_CUSTOMERS_LOADING':
      return {
        ...state,
        customers: {
          ...state.customers,
          [action.payload.entityId]: {
            ...state.customers[action.payload.entityId] || { data: [], currentPage: 1, totalItems: 0 },
            loading: action.payload.loading
          }
        }
      };
    
    case 'SET_UNITS':
      const unitsKey = `${action.payload.entityId}-${action.payload.customerId}`;
      return {
        ...state,
        units: {
          ...state.units,
          [unitsKey]: {
            data: action.payload.data,
            currentPage: action.payload.currentPage,
            totalItems: action.payload.totalItems,
            loading: false,
            lastUpdated: Date.now()
          }
        }
      };
    
    case 'SET_UNITS_LOADING':
      const unitsLoadingKey = `${action.payload.entityId}-${action.payload.customerId}`;
      return {
        ...state,
        units: {
          ...state.units,
          [unitsLoadingKey]: {
            ...state.units[unitsLoadingKey] || { data: [], currentPage: 1, totalItems: 0 },
            loading: action.payload.loading
          }
        }
      };
    
    case 'SET_SERVICE_ORDERS':
      const ordersKey = `${action.payload.entityId}-${action.payload.customerId}-${action.payload.unitId}`;
      return {
        ...state,
        serviceOrders: {
          ...state.serviceOrders,
          [ordersKey]: {
            data: action.payload.data,
            currentPage: action.payload.currentPage,
            totalItems: action.payload.totalItems,
            loading: false,
            lastUpdated: Date.now()
          }
        }
      };
    
    case 'SET_SERVICE_ORDERS_LOADING':
      const ordersLoadingKey = `${action.payload.entityId}-${action.payload.customerId}-${action.payload.unitId}`;
      return {
        ...state,
        serviceOrders: {
          ...state.serviceOrders,
          [ordersLoadingKey]: {
            ...state.serviceOrders[ordersLoadingKey] || { data: [], currentPage: 1, totalItems: 0 },
            loading: action.payload.loading
          }
        }
      };
    
    case 'CLEAR_CACHE':
      return initialState;
    
    default:
      return state;
  }
}

interface AppStateContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appStateReducer, initialState);
  
  return (
    <AppStateContext.Provider value={{ state, dispatch }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}

// Helper functions
export function isCacheValid(lastUpdated?: number, maxAge: number = 5 * 60 * 1000): boolean {
  if (!lastUpdated) return false;
  return Date.now() - lastUpdated < maxAge;
}

export function getCustomersKey(entityId: string): string {
  return entityId;
}

export function getUnitsKey(entityId: string, customerId: string): string {
  return `${entityId}-${customerId}`;
}

export function getServiceOrdersKey(entityId: string, customerId: string, unitId: string): string {
  return `${entityId}-${customerId}-${unitId}`;
}