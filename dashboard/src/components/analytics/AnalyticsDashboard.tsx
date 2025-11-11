import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Filter, TrendingUp, Database, Car, Wrench } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';


import { useAnalyticsCache } from '@/hooks/useAnalyticsCache';

import type { OverviewData, VehicleMatchingData, PartsMatchingData, FilterOptions } from '@/types/analytics';
import { FilterControls } from './FilterControls';
import { VehicleMatchingCharts } from './VehicleMatchingCharts';
import { OverviewCards } from './OverviewCards';
import { PartsMatchingCharts } from './PartsMatchingCharts';

export function AnalyticsDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getCachedData, setCachedData, isCacheValid, invalidateCache, getCacheInfo } = useAnalyticsCache();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState({
    overview: true,
    vehicleMatching: false,
    partsMatching: false
  });
  const [data, setData] = useState<{
    overview: OverviewData | null;
    vehicleMatching: VehicleMatchingData | null;
    partsMatching: PartsMatchingData | null;
  }>({
    overview: null,
    vehicleMatching: null,
    partsMatching: null
  });
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterOptions>({});
  const [showFilters, setShowFilters] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Cache for unfiltered (complete) data
  const unfilteredDataRef = useRef<{
    vehicleMatching: VehicleMatchingData | null;
    partsMatching: PartsMatchingData | null;
  }>({
    vehicleMatching: null,
    partsMatching: null
  });
  
  // Request deduplication - prevent multiple simultaneous requests
  const loadingRefs = useRef({
    overview: false,
    vehicleMatching: false,
    partsMatching: false
  });

  // Load initial overview data
  useEffect(() => {
    // Check cache first
    const cachedOverview = getCachedData<OverviewData>('overview');
    if (cachedOverview && isCacheValid('overview')) {
      setData(prev => ({ ...prev, overview: cachedOverview }));
      setLoading(prev => ({ ...prev, overview: false }));
      setLastUpdated(new Date());
      console.log('📋 Using cached overview data');
    } else {
      loadOverviewData();
    }
  }, []);

  // Simplified tab switching logic without circular dependencies
  useEffect(() => {
    if (activeTab === 'vehicles' && !data.vehicleMatching && !loading.vehicleMatching && !loadingRefs.current.vehicleMatching) {
      const isUnfiltered = !filters.entityIds || filters.entityIds.length === 0;
      const cachedVehicleData = getCachedData<VehicleMatchingData>('vehicleMatching');
      
      if (cachedVehicleData && isCacheValid('vehicleMatching') && isUnfiltered) {
        setData(prev => ({ ...prev, vehicleMatching: cachedVehicleData }));
        // Also set as unfiltered cache if not set
        if (!unfilteredDataRef.current.vehicleMatching) {
          unfilteredDataRef.current.vehicleMatching = cachedVehicleData;
        }
        console.log('📋 Using cached vehicle matching data');
      } else {
        // Delay to avoid immediate execution, pass current filters
        setTimeout(() => loadVehicleMatchingData(filters), 100);
      }
    } else if (activeTab === 'parts' && !data.partsMatching && !loading.partsMatching && !loadingRefs.current.partsMatching) {
      const isUnfiltered = !filters.entityIds || filters.entityIds.length === 0;
      const cachedPartsData = getCachedData<PartsMatchingData>('partsMatching');
      
      if (cachedPartsData && isCacheValid('partsMatching') && isUnfiltered) {
        setData(prev => ({ ...prev, partsMatching: cachedPartsData }));
        // Also set as unfiltered cache if not set
        if (!unfilteredDataRef.current.partsMatching) {
          unfilteredDataRef.current.partsMatching = cachedPartsData;
        }
        console.log('📋 Using cached parts matching data');
      } else {
        // Delay to avoid immediate execution, pass current filters
        setTimeout(() => loadPartsMatchingData(filters), 100);
      }
    }
  }, [activeTab, data.vehicleMatching, data.partsMatching, loading.vehicleMatching, loading.partsMatching, filters]);

  // Clear filters when switching tabs
  useEffect(() => {
    if (filters.entityIds && filters.entityIds.length > 0) {
      console.log('🔄 Switching tabs, clearing filters');
      setFilters({});
      setShowFilters(false); // Also close filter panel if open
    }
  }, [activeTab]);

  const loadOverviewData = useCallback(async () => {
    // Prevent duplicate requests
    if (loadingRefs.current.overview) {
      console.log('🚫 Overview request already in progress, skipping...');
      return;
    }

    try {
      loadingRefs.current.overview = true;
      setLoading(prev => ({ ...prev, overview: true }));
      setError(null);
      
      console.log('📊 Loading overview data...');
      const response = await fetch('/api/analytics/overview');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const overviewData = await response.json();
      setData(prev => ({ ...prev, overview: overviewData }));
      setCachedData('overview', overviewData);
      setLastUpdated(new Date());
      
      toast({
        title: "Data Loaded",
        description: `Overview data loaded successfully, processing time: ${overviewData.processingTime}ms`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load overview data';
      setError(errorMessage);
      toast({
        title: "Loading Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      loadingRefs.current.overview = false;
      setLoading(prev => ({ ...prev, overview: false }));
    }
  }, []);

  const loadVehicleMatchingData = useCallback(async (filterOptions?: FilterOptions) => {
    // Prevent duplicate requests
    if (loadingRefs.current.vehicleMatching) {
      console.log('🚫 Vehicle matching request already in progress, skipping...');
      return;
    }

    const isUnfiltered = !filterOptions?.entityIds || filterOptions.entityIds.length === 0;

    // If requesting unfiltered data and we have cached unfiltered data, use it
    if (isUnfiltered && unfilteredDataRef.current.vehicleMatching) {
      console.log('📋 Using cached unfiltered vehicle matching data');
      setData(prev => ({ ...prev, vehicleMatching: unfilteredDataRef.current.vehicleMatching }));
      return;
    }

    try {
      loadingRefs.current.vehicleMatching = true;
      setLoading(prev => ({ ...prev, vehicleMatching: true }));
      
      // Build query parameters
      const params = new URLSearchParams();
      if (filterOptions?.entityIds && filterOptions.entityIds.length > 0) {
        params.append('entityIds', filterOptions.entityIds.join(','));
      }
      
      const url = `/api/analytics/vehicle-matching${params.toString() ? '?' + params.toString() : ''}`;
      console.log(`🚗 Loading vehicle matching data ${isUnfiltered ? '(complete)' : '(filtered)'} with URL:`, url);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const vehicleData = await response.json();
      setData(prev => ({ ...prev, vehicleMatching: vehicleData }));
      
      // Cache unfiltered data separately for fast reset
      if (isUnfiltered) {
        unfilteredDataRef.current.vehicleMatching = vehicleData;
        setCachedData('vehicleMatching', vehicleData);
      }
      
      toast({
        title: "Vehicle Data Loaded",
        description: `Processing time: ${vehicleData.processingTime}ms`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load vehicle matching data';
      setError(errorMessage);
      toast({
        title: "Loading Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      loadingRefs.current.vehicleMatching = false;
      setLoading(prev => ({ ...prev, vehicleMatching: false }));
    }
  }, [toast, setCachedData]);

  const loadPartsMatchingData = useCallback(async (filterOptions?: FilterOptions) => {
    // Prevent duplicate requests
    if (loadingRefs.current.partsMatching) {
      console.log('🚫 Parts matching request already in progress, skipping...');
      return;
    }

    const isUnfiltered = !filterOptions?.entityIds || filterOptions.entityIds.length === 0;

    // If requesting unfiltered data and we have cached unfiltered data, use it
    if (isUnfiltered && unfilteredDataRef.current.partsMatching) {
      console.log('📋 Using cached unfiltered parts matching data');
      setData(prev => ({ ...prev, partsMatching: unfilteredDataRef.current.partsMatching }));
      return;
    }

    try {
      loadingRefs.current.partsMatching = true;
      setLoading(prev => ({ ...prev, partsMatching: true }));
      
      // Build query parameters
      const params = new URLSearchParams();
      if (filterOptions?.entityIds && filterOptions.entityIds.length > 0) {
        params.append('entityIds', filterOptions.entityIds.join(','));
      }
      
      const url = `/api/analytics/parts-matching${params.toString() ? '?' + params.toString() : ''}`;
      console.log(`🔧 Loading parts matching data ${isUnfiltered ? '(complete)' : '(filtered)'} with URL:`, url);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const partsData = await response.json();
      setData(prev => ({ ...prev, partsMatching: partsData }));
      
      // Cache unfiltered data separately for fast reset
      if (isUnfiltered) {
        unfilteredDataRef.current.partsMatching = partsData;
        setCachedData('partsMatching', partsData);
      }
      
      toast({
        title: "Parts Data Loaded",
        description: `Processing time: ${partsData.processingTime}ms`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load parts matching data';
      setError(errorMessage);
      toast({
        title: "Loading Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      loadingRefs.current.partsMatching = false;
      setLoading(prev => ({ ...prev, partsMatching: false }));
    }
  }, [toast, setCachedData]);

  const refreshAllData = async () => {
    // Clear all caches first
    invalidateCache();
    
    await Promise.all([
      loadOverviewData(),
      data.vehicleMatching ? loadVehicleMatchingData() : Promise.resolve(),
      data.partsMatching ? loadPartsMatchingData() : Promise.resolve()
    ]);
    
    toast({
      title: "Data Refreshed",
      description: "All caches cleared, data reloaded",
    });
  };

  const handleFilterChange = useCallback((newFilters: FilterOptions) => {
    // Check if filters actually changed
    const hasFiltersChanged = JSON.stringify(filters) !== JSON.stringify(newFilters);
    
    setFilters(newFilters);
    
    // Only reload data if filters actually changed
    if (hasFiltersChanged) {
      console.log('🔄 Filters changed, reloading data:', newFilters);
      
      if (activeTab === 'vehicles' && data.vehicleMatching) {
        loadVehicleMatchingData(newFilters);
      }
      if (activeTab === 'parts' && data.partsMatching) {
        loadPartsMatchingData(newFilters);
      }
    } else {
      console.log('📋 Filters unchanged, skipping data reload');
    }
  }, [filters, activeTab, data.vehicleMatching, data.partsMatching, loadVehicleMatchingData, loadPartsMatchingData]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center space-x-3">
                <TrendingUp className="h-8 w-8 text-blue-600" />
                <span>AutoCare Data Analytics</span>
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Vehicle and Parts Matching Data Analysis
                <br />
                <span className="text-sm italic">Only includes entities with AutoCare data ({data.overview?.entitiesWithAutocare || 0} of {data.overview?.totalEntities || 0} entities)</span>
                {(() => {
                  const cacheInfo = getCacheInfo();
                  const hasValidCache = Object.values(cacheInfo).some(info => info?.isValid);
                  if (hasValidCache) {
                    return (
                      <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                        📋 Using cached data
                      </span>
                    );
                  }
                  return null;
                })()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {activeTab !== 'overview' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                <span>Filter</span>
              </Button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <Database className="h-5 w-5" />
                <span className="font-medium">Data Loading Error</span>
              </div>
              <p className="text-red-600 dark:text-red-400 mt-2">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshAllData}
                className="mt-3"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Filter Controls */}
        {showFilters && (
          <div className="mb-6">
            <FilterControls
              filters={filters}
              onFiltersChange={handleFilterChange}
              onClose={() => setShowFilters(false)}
            />
          </div>
        )}

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              <span>Vehicle Matching</span>
            </TabsTrigger>
            <TabsTrigger value="parts" className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              <span>Parts Matching</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewCards
              data={data.overview}
              loading={loading.overview}
            />
          </TabsContent>

          <TabsContent value="vehicles" className="space-y-6">
            <VehicleMatchingCharts
              data={data.vehicleMatching}
              loading={loading.vehicleMatching}
              filters={filters}
            />
          </TabsContent>

          <TabsContent value="parts" className="space-y-6">
            <PartsMatchingCharts
              data={data.partsMatching}
              loading={loading.partsMatching}
              filters={filters}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
