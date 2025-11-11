import { PartAsset } from '../types/AutoCareTypes';
import { AutoCareAggregator } from './AutoCareAggregator';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface AssetQuery {
  partTerminologyId: number;
  assetTypes?: ('Image' | 'Document' | 'Video' | 'CAD' | 'Installation')[];
  resolutions?: ('Thumbnail' | 'Low' | 'Medium' | 'High' | 'Ultra')[];
  languages?: string[];
  maxResults?: number;
  includeMetadata?: boolean;
}

export interface AssetResult {
  partTerminologyId: number;
  assets: ManagedAsset[];
  totalFound: number;
  queryTime: number;
}

export interface ManagedAsset {
  assetId: string;
  assetType: 'Image' | 'Document' | 'Video' | 'CAD' | 'Installation';
  fileName: string;
  fileSize: number;
  mimeType: string;
  resolution?: 'Thumbnail' | 'Low' | 'Medium' | 'High' | 'Ultra';
  language?: string;
  description?: string;
  url: string;
  localPath?: string;
  cached: boolean;
  lastAccessed?: Date;
  downloadCount: number;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    format?: string;
    quality?: string;
    [key: string]: any;
  };
}

export interface AssetDownloadOptions {
  forceRefresh?: boolean;
  timeout?: number;
  retryCount?: number;
  validateChecksum?: boolean;
}

export interface AssetCacheConfig {
  enabled: boolean;
  maxSizeGB: number;
  maxAgeHours: number;
  cleanupIntervalHours: number;
  compressionEnabled: boolean;
  allowedTypes: string[];
}

export interface AssetStatistics {
  totalAssets: number;
  byType: { [type: string]: number };
  byResolution: { [resolution: string]: number };
  cacheStats: {
    totalCached: number;
    cacheSize: number;
    hitRate: number;
    missRate: number;
  };
  downloadStats: {
    totalDownloads: number;
    failedDownloads: number;
    averageDownloadTime: number;
  };
}

/**
 * Asset Manager
 * 
 * Manages part assets including images, documents, videos, and 3D models
 * Provides caching, download management, and asset optimization
 */
export class AssetManager {
  private aggregator: AutoCareAggregator;
  private cacheConfig: AssetCacheConfig;
  private cacheDir: string;
  private assetCache: Map<string, ManagedAsset> = new Map();
  private downloadStats = {
    totalDownloads: 0,
    failedDownloads: 0,
    totalDownloadTime: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  constructor(
    aggregator: AutoCareAggregator,
    cacheConfig?: Partial<AssetCacheConfig>,
    cacheDir?: string
  ) {
    this.aggregator = aggregator;
    this.cacheDir = cacheDir || path.join(process.cwd(), 'cache', 'assets');
    
    this.cacheConfig = {
      enabled: true,
      maxSizeGB: 5,
      maxAgeHours: 168, // 7 days
      cleanupIntervalHours: 24,
      compressionEnabled: true,
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4'],
      ...cacheConfig
    };

    this.initializeCache();
    this.startCleanupScheduler();
  }

  /**
   * Get assets for a part
   */
  async getPartAssets(query: AssetQuery): Promise<AssetResult> {
    const startTime = Date.now();
    
    try {
      // Get asset data from aggregator
      const assetData = await this.aggregator.getPartAssets(query.partTerminologyId);
      
      if (assetData.length === 0) {
        return {
          partTerminologyId: query.partTerminologyId,
          assets: [],
          totalFound: 0,
          queryTime: Date.now() - startTime
        };
      }

      // Filter assets based on query criteria
      let filteredAssets = this.filterAssets(assetData, query);
      
      // Convert to managed assets
      const managedAssets = await this.convertToManagedAssets(filteredAssets, query.includeMetadata);
      
      // Sort by priority (images first, then by resolution)
      managedAssets.sort(this.compareAssetPriority);
      
      // Apply result limit
      const maxResults = query.maxResults || 50;
      const resultAssets = managedAssets.slice(0, maxResults);

      return {
        partTerminologyId: query.partTerminologyId,
        assets: resultAssets,
        totalFound: managedAssets.length,
        queryTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('❌ Asset query failed:', error);
      throw new Error(`Failed to get part assets: ${(error as Error).message}`);
    }
  }

  /**
   * Download and cache an asset
   */
  async downloadAsset(
    assetId: string,
    options: AssetDownloadOptions = {}
  ): Promise<{ success: boolean; localPath?: string; error?: string }> {
    const startTime = Date.now();
    
    try {
      const asset = this.assetCache.get(assetId);
      if (!asset) {
        return { success: false, error: 'Asset not found in cache' };
      }

      // Check if already cached and not forcing refresh
      if (asset.cached && asset.localPath && !options.forceRefresh) {
        if (fs.existsSync(asset.localPath)) {
          asset.lastAccessed = new Date();
          asset.downloadCount++;
          this.downloadStats.cacheHits++;
          return { success: true, localPath: asset.localPath };
        }
      }

      // Download the asset
      const downloadResult = await this.performDownload(asset, options);
      
      if (downloadResult.success) {
        asset.cached = true;
        asset.localPath = downloadResult.localPath;
        asset.lastAccessed = new Date();
        asset.downloadCount++;
        this.downloadStats.totalDownloads++;
        this.downloadStats.totalDownloadTime += Date.now() - startTime;
        this.downloadStats.cacheMisses++;
        
        return { success: true, localPath: downloadResult.localPath };
      } else {
        this.downloadStats.failedDownloads++;
        return { success: false, error: downloadResult.error };
      }
    } catch (error) {
      this.downloadStats.failedDownloads++;
      console.error('❌ Asset download failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get asset by ID
   */
  getAsset(assetId: string): ManagedAsset | undefined {
    return this.assetCache.get(assetId);
  }

  /**
   * Get assets by type
   */
  getAssetsByType(assetType: string): ManagedAsset[] {
    return Array.from(this.assetCache.values())
      .filter(asset => asset.assetType === assetType);
  }

  /**
   * Get cached assets for a part
   */
  getCachedAssets(partTerminologyId: number): ManagedAsset[] {
    return Array.from(this.assetCache.values())
      .filter(asset => asset.assetId.startsWith(`${partTerminologyId}_`));
  }

  /**
   * Preload assets for multiple parts
   */
  async preloadAssets(
    partIds: number[],
    assetTypes: ('Image' | 'Document' | 'Video' | 'CAD' | 'Installation')[] = ['Image'],
    maxAssetsPerPart: number = 3
  ): Promise<{ success: number; failed: number; details: any[] }> {
    const results = {
      success: 0,
      failed: 0,
      details: [] as any[]
    };

    for (const partId of partIds) {
      try {
        const query: AssetQuery = {
          partTerminologyId: partId,
          assetTypes: assetTypes,
          maxResults: maxAssetsPerPart
        };

        const assetResult = await this.getPartAssets(query);
        
        // Download top priority assets
        for (const asset of assetResult.assets.slice(0, maxAssetsPerPart)) {
          const downloadResult = await this.downloadAsset(asset.assetId);
          
          if (downloadResult.success) {
            results.success++;
          } else {
            results.failed++;
          }
          
          results.details.push({
            partId,
            assetId: asset.assetId,
            success: downloadResult.success,
            error: downloadResult.error
          });
        }
      } catch (error) {
        results.failed++;
        results.details.push({
          partId,
          success: false,
          error: (error as Error).message
        });
      }
    }

    return results;
  }

  /**
   * Clear cache for specific part or all
   */
  async clearCache(partTerminologyId?: number): Promise<{ cleared: number; errors: string[] }> {
    const result = { cleared: 0, errors: [] as string[] };
    
    try {
      const assetsToRemove = partTerminologyId
        ? Array.from(this.assetCache.values()).filter(asset => 
            asset.assetId.startsWith(`${partTerminologyId}_`)
          )
        : Array.from(this.assetCache.values());

      for (const asset of assetsToRemove) {
        try {
          if (asset.localPath && fs.existsSync(asset.localPath)) {
            fs.unlinkSync(asset.localPath);
          }
          this.assetCache.delete(asset.assetId);
          result.cleared++;
        } catch (error) {
          result.errors.push(`Failed to remove ${asset.assetId}: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      result.errors.push(`Cache clear failed: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Get asset statistics
   */
  getStatistics(): AssetStatistics {
    const assets = Array.from(this.assetCache.values());
    
    const byType: { [type: string]: number } = {};
    const byResolution: { [resolution: string]: number } = {};
    let totalCached = 0;
    let cacheSize = 0;
    let totalDownloads = 0;

    for (const asset of assets) {
      // Count by type
      byType[asset.assetType] = (byType[asset.assetType] || 0) + 1;
      
      // Count by resolution
      if (asset.resolution) {
        byResolution[asset.resolution] = (byResolution[asset.resolution] || 0) + 1;
      }
      
      // Cache stats
      if (asset.cached) {
        totalCached++;
        cacheSize += asset.fileSize;
      }
      
      totalDownloads += asset.downloadCount;
    }

    const totalRequests = this.downloadStats.cacheHits + this.downloadStats.cacheMisses;
    const hitRate = totalRequests > 0 ? this.downloadStats.cacheHits / totalRequests : 0;
    const missRate = totalRequests > 0 ? this.downloadStats.cacheMisses / totalRequests : 0;
    
    const averageDownloadTime = this.downloadStats.totalDownloads > 0
      ? this.downloadStats.totalDownloadTime / this.downloadStats.totalDownloads
      : 0;

    return {
      totalAssets: assets.length,
      byType,
      byResolution,
      cacheStats: {
        totalCached,
        cacheSize,
        hitRate: Math.round(hitRate * 100) / 100,
        missRate: Math.round(missRate * 100) / 100
      },
      downloadStats: {
        totalDownloads: this.downloadStats.totalDownloads,
        failedDownloads: this.downloadStats.failedDownloads,
        averageDownloadTime: Math.round(averageDownloadTime)
      }
    };
  }

  /**
   * Optimize cache (remove old/unused assets)
   */
  async optimizeCache(): Promise<{ removed: number; spaceSaved: number; errors: string[] }> {
    const result = { removed: 0, spaceSaved: 0, errors: [] as string[] };
    
    try {
      const now = new Date();
      const maxAgeMs = this.cacheConfig.maxAgeHours * 60 * 60 * 1000;
      const assets = Array.from(this.assetCache.values());
      
      // Sort by last accessed (oldest first)
      assets.sort((a, b) => {
        const aTime = a.lastAccessed?.getTime() || 0;
        const bTime = b.lastAccessed?.getTime() || 0;
        return aTime - bTime;
      });

      let currentCacheSize = assets
        .filter(a => a.cached)
        .reduce((sum, a) => sum + a.fileSize, 0);
      
      const maxCacheSize = this.cacheConfig.maxSizeGB * 1024 * 1024 * 1024;

      for (const asset of assets) {
        let shouldRemove = false;
        
        // Remove if too old
        if (asset.lastAccessed && (now.getTime() - asset.lastAccessed.getTime()) > maxAgeMs) {
          shouldRemove = true;
        }
        
        // Remove if cache is too large
        if (currentCacheSize > maxCacheSize) {
          shouldRemove = true;
        }
        
        if (shouldRemove && asset.cached && asset.localPath) {
          try {
            if (fs.existsSync(asset.localPath)) {
              fs.unlinkSync(asset.localPath);
              result.spaceSaved += asset.fileSize;
              currentCacheSize -= asset.fileSize;
            }
            asset.cached = false;
            asset.localPath = undefined;
            result.removed++;
          } catch (error) {
            result.errors.push(`Failed to remove ${asset.assetId}: ${(error as Error).message}`);
          }
        }
      }
    } catch (error) {
      result.errors.push(`Cache optimization failed: ${(error as Error).message}`);
    }

    return result;
  }

  // Private helper methods

  private async initializeCache(): Promise<void> {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (error) {
      console.error('❌ Failed to initialize asset cache:', error);
    }
  }

  private startCleanupScheduler(): void {
    if (this.cacheConfig.enabled && this.cacheConfig.cleanupIntervalHours > 0) {
      setInterval(async () => {
        try {
          await this.optimizeCache();
        } catch (error) {
          console.error('❌ Scheduled cache cleanup failed:', error);
        }
      }, this.cacheConfig.cleanupIntervalHours * 60 * 60 * 1000);
    }
  }

  private filterAssets(assetData: any[], query: AssetQuery): any[] {
    let filtered = assetData;

    // Filter by asset types
    if (query.assetTypes && query.assetTypes.length > 0) {
      filtered = filtered.filter(asset => 
        query.assetTypes!.includes(asset.assetType)
      );
    }

    // Filter by resolutions
    if (query.resolutions && query.resolutions.length > 0) {
      filtered = filtered.filter(asset => 
        !asset.resolution || query.resolutions!.includes(asset.resolution)
      );
    }

    // Filter by languages
    if (query.languages && query.languages.length > 0) {
      filtered = filtered.filter(asset => 
        !asset.language || query.languages!.includes(asset.language)
      );
    }

    return filtered;
  }

  private async convertToManagedAssets(
    assetData: any[],
    includeMetadata: boolean = false
  ): Promise<ManagedAsset[]> {
    const managedAssets: ManagedAsset[] = [];

    for (const asset of assetData) {
      const assetId = this.generateAssetId(asset);
      
      const managedAsset: ManagedAsset = {
        assetId,
        assetType: asset.assetType,
        fileName: asset.fileName || `asset_${assetId}`,
        fileSize: asset.fileSize || 0,
        mimeType: asset.mimeType || this.guessMimeType(asset.fileName),
        resolution: asset.resolution,
        language: asset.language,
        description: asset.description,
        url: asset.url,
        cached: false,
        downloadCount: 0
      };

      if (includeMetadata && asset.metadata) {
        managedAsset.metadata = asset.metadata;
      }

      // Check if already in cache
      const existingAsset = this.assetCache.get(assetId);
      if (existingAsset) {
        managedAssets.push(existingAsset);
      } else {
        this.assetCache.set(assetId, managedAsset);
        managedAssets.push(managedAsset);
      }
    }

    return managedAssets;
  }

  private generateAssetId(asset: any): string {
    const data = `${asset.partTerminologyId}_${asset.assetType}_${asset.fileName}_${asset.url}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  private guessMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.avi': 'video/avi',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private compareAssetPriority(a: ManagedAsset, b: ManagedAsset): number {
    // Priority order: Image > Document > Video > CAD > Installation
    const typePriority: { [key: string]: number } = {
      'Image': 1,
      'Document': 2,
      'Video': 3,
      'CAD': 4,
      'Installation': 5
    };
    
    const aPriority = typePriority[a.assetType] || 10;
    const bPriority = typePriority[b.assetType] || 10;
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    // For same type, prioritize by resolution
    const resolutionPriority: { [key: string]: number } = {
      'Ultra': 1,
      'High': 2,
      'Medium': 3,
      'Low': 4,
      'Thumbnail': 5
    };
    
    const aResPriority = resolutionPriority[a.resolution || ''] || 6;
    const bResPriority = resolutionPriority[b.resolution || ''] || 6;
    
    return aResPriority - bResPriority;
  }

  private async performDownload(
    asset: ManagedAsset,
    options: AssetDownloadOptions
  ): Promise<{ success: boolean; localPath?: string; error?: string }> {
    try {
      // This is a placeholder for actual download implementation
      // In a real implementation, you would use fetch or axios to download the file
      
      const fileName = `${asset.assetId}_${asset.fileName}`;
      const localPath = path.join(this.cacheDir, fileName);
      
      // Simulate download (replace with actual HTTP request)
      console.log(`📥 Downloading asset: ${asset.url} -> ${localPath}`);
      
      // For now, just create an empty file to simulate caching
      fs.writeFileSync(localPath, '');
      
      return { success: true, localPath };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}