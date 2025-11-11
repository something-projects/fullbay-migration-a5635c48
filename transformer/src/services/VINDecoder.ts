/**
 * VIN Decoder Service
 * Integrates with NHTSA VIN decode API to get accurate vehicle information
 */

import https from 'https';
import * as fs from 'fs';
import * as path from 'path';

export interface VINDecodeResult {
  vin: string;
  make?: string;
  model?: string;
  year?: number;
  bodyClass?: string;
  engineModel?: string;
  fuelType?: string;
  manufacturerName?: string;
  success: boolean;
  errorMessage?: string;
}

export interface VINDecodeStats {
  totalAttempts: number;
  successfulDecodes: number;
  failedDecodes: number;
  cacheHits: number;
  apiCalls: number;
}

export class VINDecoder {
  private cache = new Map<string, VINDecodeResult>();
  private cacheLoaded = false;
  private cacheDirty = false;
  private stats: VINDecodeStats = {
    totalAttempts: 0,
    successfulDecodes: 0,
    failedDecodes: 0,
    cacheHits: 0,
    apiCalls: 0
  };

  private readonly baseUrl = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues';
  private readonly batchUrl = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesBatch';
  private readonly requestDelay = 100; // 100ms between requests to avoid rate limiting
  private readonly BATCH_SIZE = 50; // NHTSA batch limit
  private readonly CONCURRENCY = Math.max(1, Math.min(6, parseInt(process.env.VIN_BATCH_CONCURRENCY || '3', 10))); // modest concurrency
  private readonly cacheFile = path.resolve(__dirname, '../../.cache/vin_cache.json');
  private readonly agent = new https.Agent({ keepAlive: true, maxSockets: 8 });

  /**
   * Decode a single VIN
   */
  async decodeVIN(vin: string): Promise<VINDecodeResult> {
    this.ensureCacheLoaded();
    this.stats.totalAttempts++;

    // Validate VIN format
    if (!this.isValidVIN(vin)) {
      this.stats.failedDecodes++;
      return {
        vin,
        success: false,
        errorMessage: 'Invalid VIN format (must be 17 characters)'
      };
    }

    // Check cache first
    if (this.cache.has(vin)) {
      this.stats.cacheHits++;
      return this.cache.get(vin)!;
    }

    // Call NHTSA API
    try {
      const result = await this.callNHTSAAPI(vin);
      this.cache.set(vin, result);
      this.cacheDirty = true;
      
      if (result.success) {
        this.stats.successfulDecodes++;
      } else {
        this.stats.failedDecodes++;
      }
      
      return result;
    } catch (error) {
      this.stats.failedDecodes++;
      const errorResult: VINDecodeResult = {
        vin,
        success: false,
        errorMessage: `API Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      this.cache.set(vin, errorResult); // Cache failures too
      this.cacheDirty = true;
      return errorResult;
    }
  }

  /**
   * Decode multiple VINs with rate limiting
   */
  async decodeBatch(vins: string[]): Promise<Map<string, VINDecodeResult>> {
    const results = new Map<string, VINDecodeResult>();
    
    for (let i = 0; i < vins.length; i++) {
      const vin = vins[i];
      const result = await this.decodeVIN(vin);
      results.set(vin, result);
      
      // Add delay between requests to avoid rate limiting
      if (i < vins.length - 1 && !this.cache.has(vin)) {
        await this.sleep(this.requestDelay);
      }
    }
    
    return results;
  }

  /**
   * Decode multiple VINs using NHTSA batch API (much faster)
   */
  async decodeBatchWithAPI(vins: string[]): Promise<Map<string, VINDecodeResult>> {
    this.ensureCacheLoaded();
    const results = new Map<string, VINDecodeResult>();
    const uniqueVins = [...new Set(vins)]; // Remove duplicates
    
    // Check cache first
    const uncachedVins: string[] = [];
    for (const vin of uniqueVins) {
      this.stats.totalAttempts++;
      
      if (this.cache.has(vin)) {
        results.set(vin, this.cache.get(vin)!);
        this.stats.cacheHits++;
      } else {
        uncachedVins.push(vin);
      }
    }
    
    if (uncachedVins.length === 0) {
      console.log(`   💾 All ${uniqueVins.length} VINs found in cache`);
      return results;
    }
    
    console.log(`   🚗 Processing ${uncachedVins.length} new VINs using batch API (${this.stats.cacheHits} cached)`);
    
    // Process uncached VINs in batches with modest concurrency
    const batches: string[][] = [];
    for (let i = 0; i < uncachedVins.length; i += this.BATCH_SIZE) {
      batches.push(uncachedVins.slice(i, i + this.BATCH_SIZE));
    }

    let next = 0;
    const worker = async (w: number) => {
      while (next < batches.length) {
        const idx = next++;
        const batch = batches[idx];
        const rangeStart = idx * this.BATCH_SIZE + 1;
        const rangeEnd = rangeStart + batch.length - 1;
        console.log(`   📦 Worker ${w}: VINs ${rangeStart}-${rangeEnd} of ${uncachedVins.length}...`);
        try {
          const batchResults = await this.callBatchAPI(batch);
          for (const [vin, result] of batchResults) {
            results.set(vin, result);
            this.cache.set(vin, result);
            this.cacheDirty = true;
            if (result.success) this.stats.successfulDecodes++; else this.stats.failedDecodes++;
          }
          const successCount = Array.from(batchResults.values()).filter(r => r.success).length;
          console.log(`   ✅ Worker ${w} batch done: ${successCount}/${batch.length} successful`);
        } catch (error) {
          console.warn(`   ⚠️  Worker ${w} batch failed; falling back to single VINs:`, error instanceof Error ? error.message : error);
          for (const vin of batch) {
            try {
              const result = await this.decodeVIN(vin);
              results.set(vin, result);
            } catch (fallbackError) {
              console.warn(`   ❌ Failed to decode VIN ${vin}:`, fallbackError instanceof Error ? fallbackError.message : fallbackError);
            }
          }
        }
        // small pacing to be polite
        await this.sleep(this.requestDelay);
      }
    };

    const workers = Array.from({ length: Math.min(this.CONCURRENCY, batches.length) }, (_, i) => worker(i + 1));
    await Promise.all(workers);
    
    // Persist cache after processing
    this.persistCacheSafely();
    
    return results;
  }

  /**
   * Call NHTSA batch API for multiple VINs
   */
  private async callBatchAPI(vins: string[]): Promise<Map<string, VINDecodeResult>> {
    this.stats.apiCalls++;
    
    const data = `DATA=${vins.join(';')}&format=json`;
    const postData = Buffer.from(data, 'utf8');
    const options: any = {
      hostname: 'vpic.nhtsa.dot.gov',
      port: 443,
      path: '/api/vehicles/DecodeVinValuesBatch',
      method: 'POST',
      agent: this.agent,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length,
        'User-Agent': 'Fullbay-Transformer/1.0',
        'Accept': 'application/json'
      },
      timeout: 15000
    };

    const attempt = (retries: number): Promise<Map<string, VINDecodeResult>> => new Promise((resolve, reject) => {
      const req = https.request(options, (res: any) => {
        let responseData = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: any) => { responseData += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            if (retries > 0 && (res.statusCode === 429 || res.statusCode >= 500)) {
              const backoff = (1 + Math.random()) * 500;
              setTimeout(() => attempt(retries - 1).then(resolve).catch(reject), backoff);
              return;
            }
            reject(new Error(`Batch API HTTP ${res.statusCode}`));
            return;
          }
          try {
            const response = JSON.parse(responseData);
            const results = this.parseBatchResponse(vins, response);
            resolve(results);
          } catch (error) {
            reject(new Error(`Failed to parse batch API response: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        });
      });
      req.on('error', (error: Error) => {
        if (retries > 0) {
          const backoff = (1 + Math.random()) * 500;
          setTimeout(() => attempt(retries - 1).then(resolve).catch(reject), backoff);
        } else {
          reject(new Error(`Batch API request failed: ${error.message}`));
        }
      });
      req.write(postData);
      req.end();
    });

    return attempt(2);
  }

  /**
   * Parse NHTSA batch API response
   */
  private parseBatchResponse(vins: string[], response: any): Map<string, VINDecodeResult> {
    const results = new Map<string, VINDecodeResult>();
    
    if (!response.Results || !Array.isArray(response.Results)) {
      // If batch fails, mark all VINs as failed
      for (const vin of vins) {
        results.set(vin, {
          vin,
          success: false,
          errorMessage: 'No results returned from batch API'
        });
      }
      return results;
    }
    
    // Group results by VIN (batch API returns flat array)
    const resultsByVin = new Map<string, any>();
    for (const result of response.Results) {
      const vin = result.VIN?.trim();
      if (vin) {
        resultsByVin.set(vin, result);
      }
    }
    
    // Parse each VIN result
    for (const vin of vins) {
      const apiResult = resultsByVin.get(vin);
      if (apiResult) {
        results.set(vin, this.parseNHTSAResponse(vin, { Results: [apiResult] }));
      } else {
        results.set(vin, {
          vin,
          success: false,
          errorMessage: 'VIN not found in batch response'
        });
      }
    }
    
    return results;
  }

  /**
   * Call NHTSA API for VIN decode
   */
  private async callNHTSAAPI(vin: string): Promise<VINDecodeResult> {
    this.stats.apiCalls++;
    const url = `${this.baseUrl}/${vin}?format=json`;
    const options: any = { agent: this.agent, timeout: 10000 };

    return new Promise((resolve, reject) => {
      const req = https.get(url, options, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            const response = JSON.parse(data);
            const result = this.parseNHTSAResponse(vin, response);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse API response: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        });
      });
      req.on('error', (error) => reject(new Error(`API request failed: ${error.message}`)));
    });
  }

  /**
   * Parse NHTSA API response
   */
  private parseNHTSAResponse(vin: string, response: any): VINDecodeResult {
    const results = response.Results;
    if (!results || !Array.isArray(results) || results.length === 0) {
      return {
        vin,
        success: false,
        errorMessage: 'No results returned from API'
      };
    }

    const data = results[0]; // NHTSA returns array with one element
    
    // Check for API errors
    if (data.ErrorCode && data.ErrorCode !== '0') {
      return {
        vin,
        success: false,
        errorMessage: data.ErrorText || 'API returned error'
      };
    }

    // Extract vehicle information
    const make = this.cleanString(data.Make);
    const model = this.cleanString(data.Model);
    const yearStr = this.cleanString(data.ModelYear);
    const year = yearStr ? parseInt(yearStr, 10) : undefined;
    
    // Only consider successful if we got essential info
    const success = !!(make && model && year && year > 1900 && year <= new Date().getFullYear() + 1);
    
    return {
      vin,
      make,
      model,
      year: year && !isNaN(year) ? year : undefined,
      bodyClass: this.cleanString(data.BodyClass),
      engineModel: this.cleanString(data.EngineModel),
      fuelType: this.cleanString(data.FuelTypePrimary),
      manufacturerName: this.cleanString(data.ManufacturerName),
      success,
      errorMessage: success ? undefined : 'Incomplete vehicle information returned'
    };
  }

  /**
   * Clean and validate string from API response
   */
  private cleanString(value: any): string | undefined {
    if (!value || typeof value !== 'string') return undefined;
    
    const cleaned = value.trim();
    
    // NHTSA returns these values for unknown/empty fields
    if (cleaned === '' || cleaned === 'Not Applicable' || cleaned === 'N/A' || cleaned === '--') {
      return undefined;
    }
    
    return cleaned;
  }

  /**
   * Validate VIN format
   */
  private isValidVIN(vin: string): boolean {
    if (!vin || typeof vin !== 'string') return false;
    
    // Remove spaces and convert to uppercase
    const cleanVIN = vin.replace(/\s+/g, '').toUpperCase();
    
    // Must be exactly 17 characters
    if (cleanVIN.length !== 17) return false;
    
    // Must contain only letters (except I, O, Q) and numbers
    const vinPattern = /^[A-HJ-NPR-Z0-9]{17}$/;
    if (!vinPattern.test(cleanVIN)) return false;
    
    return true;
  }

  /**
   * Light-weight local year decode from VIN (position 10). Returns undefined if invalid.
   */
  static decodeYearFromVIN(vin?: string): number | undefined {
    if (!vin || vin.length < 10) return undefined;
    const c = vin.toUpperCase()[9];
    const map: Record<string, number> = {
      A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016, H: 2017, J: 2018, K: 2019,
      L: 2020, M: 2021, N: 2022, P: 2023, R: 2024, S: 2025, T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030,
      '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005, '6': 2006, '7': 2007, '8': 2008, '9': 2009
    };
    const y = map[c];
    if (!y) return undefined;
    // Basic sanity: allow +/- 1 year into future
    const max = new Date().getFullYear() + 1;
    if (y > max || y < 1980) return undefined;
    return y;
  }

  /** Persist cache to disk if dirty */
  persistCacheSafely(): void {
    try {
      if (!this.cacheDirty) return;
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      const obj: Record<string, VINDecodeResult> = {} as any;
      for (const [k, v] of this.cache.entries()) obj[k] = v;
      fs.writeFileSync(this.cacheFile, JSON.stringify(obj), 'utf8');
      this.cacheDirty = false;
    } catch {}
  }

  private ensureCacheLoaded(): void {
    if (this.cacheLoaded) return;
    try {
      const raw = fs.readFileSync(this.cacheFile, 'utf8');
      const obj = JSON.parse(raw);
      for (const k of Object.keys(obj)) this.cache.set(k, obj[k]);
      console.log(`💾 VIN cache loaded: ${this.cache.size} entries`);
    } catch {}
    this.cacheLoaded = true;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get decode statistics
   */
  getStats(): VINDecodeStats {
    return { ...this.stats };
  }

  /**
   * Clear cache and reset stats
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      totalAttempts: 0,
      successfulDecodes: 0,
      failedDecodes: 0,
      cacheHits: 0,
      apiCalls: 0
    };
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}
