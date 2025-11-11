import { useState } from 'react';
import type { OverviewData, VehicleMatchingData, PartsMatchingData } from '@/types/analytics';

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface AnalyticsCache {
  overview: CacheItem<OverviewData> | null;
  vehicleMatching: CacheItem<VehicleMatchingData> | null;
  partsMatching: CacheItem<PartsMatchingData> | null;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = 'analytics-cache';

export function useAnalyticsCache() {
  const [cache, setCache] = useState<AnalyticsCache>(() => {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AnalyticsCache;
        const now = Date.now();
        
        // Check if any cache items are still valid
        const validCache: AnalyticsCache = {
          overview: parsed.overview && parsed.overview.expiresAt > now ? parsed.overview : null,
          vehicleMatching: parsed.vehicleMatching && parsed.vehicleMatching.expiresAt > now ? parsed.vehicleMatching : null,
          partsMatching: parsed.partsMatching && parsed.partsMatching.expiresAt > now ? parsed.partsMatching : null,
        };
        
        return validCache;
      }
    } catch (error) {
      console.warn('Failed to load analytics cache:', error);
    }
    
    return {
      overview: null,
      vehicleMatching: null,
      partsMatching: null,
    };
  });

  const saveToStorage = (newCache: AnalyticsCache) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));
    } catch (error) {
      console.warn('Failed to save analytics cache:', error);
    }
  };

  const getCachedData = <T>(key: keyof AnalyticsCache): T | null => {
    const item = cache[key] as CacheItem<T> | null;
    if (item && item.expiresAt > Date.now()) {
      return item.data;
    }
    return null;
  };

  const setCachedData = <T>(key: keyof AnalyticsCache, data: T) => {
    const now = Date.now();
    const cacheItem: CacheItem<T> = {
      data,
      timestamp: now,
      expiresAt: now + CACHE_DURATION,
    };

    const newCache = {
      ...cache,
      [key]: cacheItem,
    };

    setCache(newCache);
    saveToStorage(newCache);
  };

  const invalidateCache = (key?: keyof AnalyticsCache) => {
    if (key) {
      const newCache = {
        ...cache,
        [key]: null,
      };
      setCache(newCache);
      saveToStorage(newCache);
    } else {
      const emptyCache: AnalyticsCache = {
        overview: null,
        vehicleMatching: null,
        partsMatching: null,
      };
      setCache(emptyCache);
      saveToStorage(emptyCache);
    }
  };

  const isCacheValid = (key: keyof AnalyticsCache): boolean => {
    const item = cache[key];
    return item !== null && item.expiresAt > Date.now();
  };

  const getCacheInfo = () => {
    const now = Date.now();
    return {
      overview: cache.overview ? {
        age: now - cache.overview.timestamp,
        expiresIn: cache.overview.expiresAt - now,
        isValid: cache.overview.expiresAt > now,
      } : null,
      vehicleMatching: cache.vehicleMatching ? {
        age: now - cache.vehicleMatching.timestamp,
        expiresIn: cache.vehicleMatching.expiresAt - now,
        isValid: cache.vehicleMatching.expiresAt > now,
      } : null,
      partsMatching: cache.partsMatching ? {
        age: now - cache.partsMatching.timestamp,
        expiresIn: cache.partsMatching.expiresAt - now,
        isValid: cache.partsMatching.expiresAt > now,
      } : null,
    };
  };

  return {
    getCachedData,
    setCachedData,
    invalidateCache,
    isCacheValid,
    getCacheInfo,
  };
}
