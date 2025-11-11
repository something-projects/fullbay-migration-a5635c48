import * as fs from 'fs-extra';
import * as path from 'path';

export interface CacheConfig {
  cacheDir: string;
  maxMemoryMB: number;
  chunkSize: number;
  reuseCache?: boolean;
  devMode?: boolean;
  devLimit?: number;
}

export class DataCache<T> {
  private config: CacheConfig;
  private currentMemoryUsage: number = 0;
  private memoryCache: Map<string, T[]> = new Map();
  private chunkCounter: number = 0;

  constructor(config: CacheConfig) {
    this.config = config;
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    fs.ensureDirSync(this.config.cacheDir);
  }

  private getMemoryUsage(data: T[]): number {
    return Buffer.byteLength(JSON.stringify(data), 'utf8') / (1024 * 1024);
  }

  private async flushToDisk(key: string, data: T[]): Promise<string> {
    const fileName = `${key}_chunk_${this.chunkCounter++}.json`;
    const filePath = path.join(this.config.cacheDir, fileName);
    await fs.writeJson(filePath, data);
    return filePath;
  }

  private async loadFromDisk(filePath: string): Promise<T[]> {
    return await fs.readJson(filePath);
  }

  async addBatch(key: string, batch: T[]): Promise<void> {
    const batchSize = this.getMemoryUsage(batch);
    
    if (!this.memoryCache.has(key)) {
      this.memoryCache.set(key, []);
    }

    const current = this.memoryCache.get(key)!;
    current.push(...batch);

    this.currentMemoryUsage += batchSize;

    if (this.currentMemoryUsage > this.config.maxMemoryMB || current.length > this.config.chunkSize) {
      const filePath = await this.flushToDisk(key, current);
      console.log(`💾 Flushed ${current.length} ${key} records to disk: ${path.basename(filePath)}`);
      
      this.memoryCache.set(key, []);
      this.currentMemoryUsage -= this.getMemoryUsage(current);
    }
  }

  async *getAllRecords(key: string): AsyncGenerator<T[], void, unknown> {
    const cacheFiles = await this.getCacheFiles(key);
    
    for (const filePath of cacheFiles) {
      const data = await this.loadFromDisk(filePath);
      yield data;
    }

    if (this.memoryCache.has(key) && this.memoryCache.get(key)!.length > 0) {
      yield this.memoryCache.get(key)!;
    }
  }

  private async getCacheFiles(key: string): Promise<string[]> {
    try {
      const files = await fs.readdir(this.config.cacheDir);
      return files
        .filter(file => file.startsWith(`${key}_chunk_`) && file.endsWith('.json'))
        .map(file => path.join(this.config.cacheDir, file))
        .sort();
    } catch (error) {
      return [];
    }
  }

  async clear(): Promise<void> {
    if (this.config.reuseCache) {
      console.log('💾 Reusing existing cache data...');
      return;
    }
    
    try {
      await fs.emptyDir(this.config.cacheDir);
      this.memoryCache.clear();
      this.currentMemoryUsage = 0;
      this.chunkCounter = 0;
      console.log('🗑️  Cleared cache directory');
    } catch (error) {
      console.warn('Failed to clear cache directory:', error);
    }
  }

  async getRecordCount(key: string): Promise<number> {
    let count = 0;
    
    for await (const batch of this.getAllRecords(key)) {
      count += batch.length;
    }
    
    return count;
  }

  async hasCachedData(key: string): Promise<boolean> {
    const cacheFiles = await this.getCacheFiles(key);
    return cacheFiles.length > 0 || (this.memoryCache.has(key) && this.memoryCache.get(key)!.length > 0);
  }

  async shouldSkipLoading(key: string): Promise<boolean> {
    if (!this.config.reuseCache) return false;
    return await this.hasCachedData(key);
  }
}