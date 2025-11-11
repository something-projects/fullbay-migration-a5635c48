/**
 * Unified Matcher - Pure JavaScript/TypeScript implementation
 * Replaces both PartsMatcher and VehicleMatcher with a single, fast implementation
 */

import { 
  StandardizedPart, 
  StandardizedVehicle, 
  PartsMatchResult, 
  VehicleMatchResult,
  PartsMatchFailureReason,
  VehicleMatchFailureReason,
  VCdbMake,
  VCdbModel
} from '../types/AutoCareTypes';

export interface UnifiedMatcherConfig {
  enableFuzzyMatch?: boolean;
  fuzzyThreshold?: number;
  enableYearRange?: boolean;
  yearRangeTolerance?: number;
  enableCache?: boolean;
  cacheSize?: number;
  debugMode?: boolean;
}

export interface BatchShopPart {
  id: string;
  name: string;
  entityId: number;
  title?: string;
  description?: string;
  shopNumber?: string;
  vendorNumber?: string;
}

export interface BatchShopVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  entityId: number;
}

/**
 * High-performance unified matcher using pure JavaScript
 */
export class UnifiedMatcher {
  private partsIndex: Map<string, StandardizedPart>;
  private vehiclesIndex: Map<string, StandardizedVehicle>;
  private fuzzyPartsIndex: Map<string, StandardizedPart[]>;
  private makesByName: Map<string, VCdbMake>;
  private modelsByName: Map<string, VCdbModel[]>;
  
  private config: UnifiedMatcherConfig;
  private cache = new Map<string, any>();

  constructor(
    partsIndex: Map<string, StandardizedPart>,
    vehiclesIndex: Map<string, StandardizedVehicle>,
    fuzzyPartsIndex: Map<string, StandardizedPart[]>,
    makesByName: Map<string, VCdbMake>,
    modelsByName: Map<string, VCdbModel[]>,
    config?: Partial<UnifiedMatcherConfig>
  ) {
    this.partsIndex = partsIndex;
    this.vehiclesIndex = vehiclesIndex;
    this.fuzzyPartsIndex = fuzzyPartsIndex;
    this.makesByName = makesByName;
    this.modelsByName = modelsByName;
    
    this.config = {
      enableFuzzyMatch: true,
      fuzzyThreshold: 0.7,
      enableYearRange: true,
      yearRangeTolerance: 2,
      enableCache: true,
      cacheSize: 10000,
      debugMode: false,
      ...config
    };
  }

  // ===== PARTS MATCHING =====

  /**
   * Match a single part - synchronous and fast
   */
  matchPart(
    title?: string,
    description?: string,
    shopNumber?: string,
    vendorNumber?: string
  ): PartsMatchResult {
    const name = title || description || shopNumber || vendorNumber;
    if (!name) {
      return {
        matched: false,
        failureReason: PartsMatchFailureReason.MISSING_PART_NAME,
        failureDetails: 'No part name, description, or part numbers provided',
        originalData: { title, description, shopNumber, vendorNumber }
      };
    }

    // Check cache
    const cacheKey = `part:${name}`;
    if (this.config.enableCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const normalized = this.normalizeName(name);
    
    // 1. Exact match - O(1)
    const exact = this.partsIndex.get(normalized);
    if (exact) {
      // Debug log for confidence tracking
      if (name && (name.toLowerCase().includes('machine') || 
          name.toLowerCase().includes('air filter') ||
          name.toLowerCase().includes('oil filter'))) {
        console.log(`[CONFIDENCE_DEBUG] UnifiedMatcher: Exact match found`, {
          inputName: name,
          normalized: normalized,
          exactPartName: exact.partTerminologyName || exact.partName,
          originalConfidence: exact.confidence,
          newConfidence: 1.0,
          source: 'exact_match_override'
        });
      }
      
      const result: PartsMatchResult = {
        matched: true,
        standardizedPart: { ...exact, confidence: 1.0, matchingMethod: 'exact' },
        attemptedMethods: ['exact'],
        originalData: { title, description, shopNumber, vendorNumber }
      };
      this.cacheResult(cacheKey, result);
      return result;
    }

    // 2. Fuzzy match if enabled - now with alternatives
    if (this.config.enableFuzzyMatch) {
      const top3Matches = this.findTop3FuzzyPartMatches(normalized);
      if (top3Matches.length > 0) {
        const [bestMatchRaw, ...otherMatches] = top3Matches;
        const bestMatch: StandardizedPart = {
          ...bestMatchRaw,
          matchingMethod: 'fuzzy',
          isAlternative: false
        };
        const seen = new Set<string>();
        const primaryKey = `${bestMatch.partTerminologyId || bestMatch.partId || bestMatch.partNumber || ''}|${bestMatch.partName || ''}`;
        seen.add(primaryKey);
        const alternatives = otherMatches.reduce<StandardizedPart[]>((acc, alt) => {
          if (!alt) return acc;
          const key = `${alt.partTerminologyId || alt.partId || alt.partNumber || ''}|${alt.partName || ''}`;
          if (seen.has(key)) return acc;
          seen.add(key);
          acc.push({
            ...alt,
            matchingMethod: alt.matchingMethod || 'fuzzy',
            isAlternative: true
          });
          return acc;
        }, []);
        
        // Debug log for confidence tracking
        if (name && (name.toLowerCase().includes('machine') || 
            name.toLowerCase().includes('air filter') ||
            name.toLowerCase().includes('oil filter'))) {
          console.log(`[CONFIDENCE_DEBUG] UnifiedMatcher: Fuzzy match found`, {
            inputName: name,
            normalized: normalized,
            fuzzyPartName: bestMatch.partTerminologyName || bestMatch.partName,
            confidence: bestMatch.confidence,
            threshold: this.config.fuzzyThreshold,
            alternativesCount: alternatives.length,
            source: 'fuzzy_match'
          });
        }
        
        const result: PartsMatchResult = {
          matched: true,
          standardizedPart: bestMatch,
          alternatives: alternatives.length > 0 ? alternatives : undefined,
          attemptedMethods: ['exact', 'fuzzy'],
          originalData: { title, description, shopNumber, vendorNumber }
        };
        this.cacheResult(cacheKey, result);
        return result;
      }
    }

    // No match found - determine specific failure reason
    let failureReason: PartsMatchFailureReason;
    let failureDetails: string;
    
    // Detect service/labor/non-part items using title/description context
    const serviceText = `${title || ''} ${description || ''}`.toLowerCase();
    const serviceTerms = [
      'labor', 'service', 'inspection', 'diagnostic', 'disposal',
      'environmental fee', 'shop supplies', 'misc', 'miscellaneous',
      'tax', 'discount', 'credit', 'core charge', 'shipping', 'freight'
    ];
    
    if (serviceTerms.some(term => serviceText.includes(term))) {
      failureReason = PartsMatchFailureReason.SERVICE_ITEM;
      failureDetails = `Line item appears to be a service/labor charge: "${name}"`;
    } else {
      // Check if part name is too vague/generic
      const normalizedLower = normalized.toLowerCase();
      const vagueTerms = ['part', 'item', 'component', 'piece', 'thing', 'stuff'];
      if (vagueTerms.some(term => normalizedLower === term || normalizedLower.includes(`${term} `))) {
        failureReason = PartsMatchFailureReason.VAGUE_PART_NAME;
        failureDetails = `Part name "${name}" is too generic for AutoCare matching`;
      } else if (name.length <= 2) {
        failureReason = PartsMatchFailureReason.VAGUE_PART_NAME;
        failureDetails = `Part name "${name}" is too short for reliable matching`;
      } else {
        // Has specific name but not found in AutoCare
        failureReason = PartsMatchFailureReason.PART_NOT_IN_AUTOCARE;
        failureDetails = `"${name}" not found in AutoCare PCdb database`;
      }
    }

    const result: PartsMatchResult = {
      matched: false,
      failureReason,
      failureDetails,
      attemptedMethods: this.config.enableFuzzyMatch ? ['exact', 'fuzzy'] : ['exact'],
      originalData: { title, description, shopNumber, vendorNumber }
    };
    this.cacheResult(cacheKey, result);
    return result;
  }

  /**
   * Batch match parts - simple loop, very fast for typical batch sizes
   */
  batchMatchParts(parts: BatchShopPart[]): Map<string, PartsMatchResult> {
    const results = new Map<string, PartsMatchResult>();
    const total = parts.length;
    const startTime = Date.now();
    let lastProgressTime = startTime;

    // 进度报告间隔
    // 调整进度输出：更短的时间间隔，按规模自适应条目间隔
    const PROGRESS_INTERVAL = total >= 1000000 ? 20000 : 5000; // 百万级每 20,000 个；否则每 5,000 个
    const TIME_UPDATE_INTERVAL = 10000; // 每 10 秒

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const result = this.matchPart(
        part.title || part.name,
        part.description,
        part.shopNumber,
        part.vendorNumber
      );
      results.set(part.id, result);

      // 输出进度日志
      if ((i + 1) % PROGRESS_INTERVAL === 0 || Date.now() - lastProgressTime > TIME_UPDATE_INTERVAL) {
        const progress = ((i + 1) / total * 100).toFixed(1);
        const elapsed = Date.now() - startTime;
        const rate = (i + 1) / (elapsed / 1000); // 零件/秒
        const remaining = (total - i - 1) / rate; // 秒
        const remainingMin = Math.floor(remaining / 60);
        const remainingSec = Math.floor(remaining % 60);

        console.log(`   ⚙️  Progress: ${i + 1}/${total} (${progress}%) | ${rate.toFixed(0)} parts/sec | ETA: ${remainingMin}m ${remainingSec}s`);
        lastProgressTime = Date.now();
      }
    }

    return results;
  }

  // ===== VEHICLE MATCHING =====

  /**
   * Match a single vehicle - synchronous and fast
   */
  matchVehicle(make?: string, model?: string, year?: number): VehicleMatchResult {
    if (!make && !model && !year) {
      return {
        matched: false,
        failureReason: VehicleMatchFailureReason.NO_INPUT_DATA,
        failureDetails: 'No make, model, or year provided',
        originalData: { make, model, year }
      };
    }

    // Check cache
    const cacheKey = `vehicle:${make}|${model}|${year}`;
    if (this.config.enableCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Get top 3 vehicle matches
    const top3Matches = this.findTop3VehicleMatches(make, model, year);
    
    if (top3Matches.length > 0) {
      const [bestMatchRaw, ...otherMatches] = top3Matches;
      const bestMatch: StandardizedVehicle = {
        ...bestMatchRaw,
        isAlternative: false
      };
      const seen = new Set<string>();
      const primaryKey = `${bestMatch.baseVehicleId}|${bestMatch.vehicleId || ''}|${bestMatch.subModelId || ''}`;
      seen.add(primaryKey);
      const alternatives = otherMatches.reduce<StandardizedVehicle[]>((acc, alt) => {
        if (!alt) return acc;
        const key = `${alt.baseVehicleId}|${alt.vehicleId || ''}|${alt.subModelId || ''}`;
        if (seen.has(key)) return acc;
        seen.add(key);
        acc.push({
          ...alt,
          isAlternative: true
        });
        return acc;
      }, []);
      
      // Determine the matching method based on confidence
      let matchingMethod = 'enhanced_variant';
      if (bestMatch.confidence === 1.0) {
        matchingMethod = 'exact';
      } else if (bestMatch.confidence === 0.95) {
        matchingMethod = 'format_variant';
      } else if (bestMatch.confidence <= 0.8) {
        matchingMethod = 'year_range';
      }
      
      const result: VehicleMatchResult = {
        matched: true,
        standardizedVehicle: bestMatch,
        alternatives: alternatives.length > 0 ? alternatives : undefined,
        attemptedMethods: ['exact', 'format_variant', 'enhanced_variant', 'year_range'],
        originalData: { make, model, year }
      };
      this.cacheResult(cacheKey, result);
      return result;
    }

    // No match found
    const result: VehicleMatchResult = {
      matched: false,
      failureReason: VehicleMatchFailureReason.VEHICLE_NOT_IN_AUTOCARE,
      failureDetails: `No match found for ${make} ${model} ${year}`,
      attemptedMethods: ['exact', 'format_variant', 'enhanced_variant', 'year_range'],
      originalData: { make, model, year }
    };
    this.cacheResult(cacheKey, result);
    return result;
  }

  /**
   * Batch match vehicles - simple loop
   */
  batchMatchVehicles(vehicles: BatchShopVehicle[]): Map<string, VehicleMatchResult> {
    const results = new Map<string, VehicleMatchResult>();
    
    for (const vehicle of vehicles) {
      const result = this.matchVehicle(vehicle.make, vehicle.model, vehicle.year);
      results.set(vehicle.id, result);
    }
    
    return results;
  }

  // ===== PRIVATE HELPER METHODS =====

  private normalizeName(name: string): string {
    if (!name) return '';
    
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      // Apply common mappings
      .replace(/oilfilter/g, 'engineoilfilter')
      .replace(/airfilter/g, 'engineairfilter')
      .replace(/fuelfilter/g, 'fuelfilter')
      .replace(/brakepads/g, 'discbrakepad');
  }

  private getVehicleKey(make?: string, model?: string, year?: number): string {
    const normMake = make ? this.normalizeName(make) : '';
    const normModel = model ? this.normalizeName(model) : '';
    return `${normMake}|${normModel}|${year || 0}`;
  }

  private getVariantKey(make: string, model: string, year: number): string {
    const normMake = this.normalizeName(make);
    // Remove hyphens and spaces for format variants (F-150 -> F150)
    const normModel = this.normalizeName(model).replace(/[-\s]/g, '');
    return `${normMake}|${normModel}|${year}`;
  }

  private findFuzzyPartMatch(normalized: string): StandardizedPart | null {
    const top3 = this.findTop3FuzzyPartMatches(normalized);
    return top3.length > 0 ? top3[0] : null;
  }

  private findTop3FuzzyPartMatches(normalized: string): StandardizedPart[] {
    const prefix = normalized.substring(0, 3);
    const candidates = this.fuzzyPartsIndex.get(prefix) || [];
    
    const matches: { part: StandardizedPart; score: number }[] = [];
    const threshold = this.config.fuzzyThreshold || 0.7;
    
    for (const candidate of candidates) {
      const candidateNorm = this.normalizeName(candidate.partName || candidate.partTerminologyName || '');
      const score = this.calculateSimilarity(normalized, candidateNorm);
      
      if (score >= threshold) {
        // Mark as fuzzy match; downstream stats rely on matchingMethod
        const scoredPart = { ...candidate, confidence: score, matchingMethod: 'fuzzy' as const };
        matches.push({ part: scoredPart, score });
        
        // Debug log for confidence tracking in fuzzy match
        const candidateName = candidate.partName || candidate.partTerminologyName || '';
        if (candidateName.toLowerCase().includes('machine') || 
            candidateName.toLowerCase().includes('air filter') ||
            candidateName.toLowerCase().includes('oil filter')) {
          console.log(`[CONFIDENCE_DEBUG] UnifiedMatcher: Fuzzy candidate found`, {
            inputNormalized: normalized,
            candidateName: candidateName,
            candidateNormalized: candidateNorm,
            similarityScore: score,
            originalConfidence: candidate.confidence,
            newConfidence: score,
            source: 'fuzzy_candidate_creation'
          });
        }
      }
    }
    
    // Sort by score descending and return top 3
    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(m => m.part);
  }

  private findTop3VehicleMatches(make?: string, model?: string, year?: number): StandardizedVehicle[] {
    if (!make || !model) return [];
    
    const matches: { vehicle: StandardizedVehicle; score: number }[] = [];
    
    // 1. Try exact match first
    const directKey = this.getVehicleKey(make, model, year);
    const directMatch = this.vehiclesIndex.get(directKey);
    if (directMatch) {
      matches.push({ vehicle: { ...directMatch, confidence: 1.0 }, score: 1.0 });
    }
    
    // 2. Try format variants (F-150 vs F150)
    const variantKey = this.getVariantKey(make, model, year || 0);
    const variantMatch = this.vehiclesIndex.get(variantKey);
    if (variantMatch && !matches.find(m => m.vehicle.baseVehicleId === variantMatch.baseVehicleId)) {
      matches.push({ vehicle: { ...variantMatch, confidence: 0.95 }, score: 0.95 });
    }
    
    // 3. Generate model variants and try matching
    const modelVariants = this.generateModelVariants(model);
    for (const variant of modelVariants) {
      const variantKey = this.getVehicleKey(make, variant, year);
      const match = this.vehiclesIndex.get(variantKey);
      if (match && !matches.find(m => m.vehicle.baseVehicleId === match.baseVehicleId)) {
        matches.push({ vehicle: { ...match, confidence: 0.9 }, score: 0.9 });
        if (matches.length >= 3) break; // Stop if we have enough matches
      }
    }
    
    // 4. Try partial match (prefix matching)
    if (matches.length < 3) {
      const normalizedModel = this.normalizeName(model);
      const normalizedMake = this.normalizeName(make);
      for (const [key, vehicle] of this.vehiclesIndex) {
        const keyParts = key.split('|');
        if (keyParts.length >= 3 && 
            keyParts[0] === normalizedMake && 
            keyParts[1].startsWith(normalizedModel) &&
            keyParts[2] === String(year || 0) &&
            !matches.find(m => m.vehicle.baseVehicleId === vehicle.baseVehicleId)) {
          matches.push({ vehicle: { ...vehicle, confidence: 0.85 }, score: 0.85 });
          if (matches.length >= 3) break;
        }
      }
    }
    
    // 5. Try similar model search (same make, similar model names)
    if (matches.length < 3 && model) {
      const normalizedMake = this.normalizeName(make);
      const normalizedModel = this.normalizeName(model);
      for (const [key, vehicle] of this.vehiclesIndex) {
        const keyParts = key.split('|');
        if (keyParts.length >= 3 && 
            keyParts[0] === normalizedMake && 
            keyParts[2] === String(year || 0) &&
            keyParts[1] !== normalizedModel && // Different model
            this.calculateSimilarity(normalizedModel, keyParts[1]) >= 0.6 &&
            !matches.find(m => m.vehicle.baseVehicleId === vehicle.baseVehicleId)) {
          const similarity = this.calculateSimilarity(normalizedModel, keyParts[1]);
          const confidence = 0.7 + (similarity - 0.6) * 0.3; // Scale 0.6-1.0 to 0.7-0.82
          matches.push({ vehicle: { ...vehicle, confidence }, score: confidence });
          if (matches.length >= 3) break;
        }
      }
    }
    
    // 6. Try year range matches if still need more
    if (matches.length < 3 && this.config.enableYearRange && year) {
      const tolerance = this.config.yearRangeTolerance || 2;
      for (let offset = 1; offset <= tolerance && matches.length < 3; offset++) {
        // Try future years
        const futureKey = this.getVehicleKey(make, model, year + offset);
        const futureMatch = this.vehiclesIndex.get(futureKey);
        if (futureMatch && !matches.find(m => m.vehicle.baseVehicleId === futureMatch.baseVehicleId)) {
          const penalty = offset * 0.05;
          const confidence = Math.max(0.3, 0.8 - penalty);
          matches.push({ vehicle: { ...futureMatch, confidence }, score: confidence });
        }
        
        // Try past years
        if (matches.length < 3) {
          const pastKey = this.getVehicleKey(make, model, year - offset);
          const pastMatch = this.vehiclesIndex.get(pastKey);
          if (pastMatch && !matches.find(m => m.vehicle.baseVehicleId === pastMatch.baseVehicleId)) {
            const penalty = offset * 0.05;
            const confidence = Math.max(0.3, 0.8 - penalty);
            matches.push({ vehicle: { ...pastMatch, confidence }, score: confidence });
          }
        }
      }
    }
    
    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(m => m.vehicle);
  }

  private findVehicleWithVariants(make?: string, model?: string, year?: number): StandardizedVehicle | null {
    const matches = this.findTop3VehicleMatches(make, model, year);
    return matches.length > 0 ? matches[0] : null;
  }

  private generateModelVariants(model: string): string[] {
    const variants = [];
    
    // Handle E450 <-> E-450 format
    if (/^[A-Z]\d+$/i.test(model)) {
      // E450 -> E-450
      variants.push(model.replace(/^([A-Z])(\d+)$/i, '$1-$2'));
    } else if (/^[A-Z]-\d+$/i.test(model)) {
      // E-450 -> E450
      variants.push(model.replace('-', ''));
    }
    
    // Handle F150/F-150 and similar formats
    if (/^[A-Z]\d+$/i.test(model)) {
      variants.push(model.replace(/^([A-Z])(\d+)$/i, '$1-$2'));
    }
    
    // Add common suffix combinations
    const suffixes = ['Super Duty', 'Econoline', 'HD', 'SD'];
    suffixes.forEach(suffix => {
      variants.push(`${model} ${suffix}`);
      if (model.includes('-')) {
        variants.push(`${model.replace('-', '')} ${suffix}`);
      }
    });
    
    return variants;
  }

  private findYearRangeMatch(make: string, model: string, year: number): StandardizedVehicle | null {
    const tolerance = this.config.yearRangeTolerance || 2;
    
    for (let offset = 1; offset <= tolerance; offset++) {
      // Try year + offset
      const futureKey = this.getVehicleKey(make, model, year + offset);
      const future = this.vehiclesIndex.get(futureKey);
      if (future) {
        const penalty = offset * 0.05; // 5% penalty per year difference
        return { ...future, confidence: Math.max(0.3, 0.8 - penalty) };
      }
      
      // Try year - offset
      const pastKey = this.getVehicleKey(make, model, year - offset);
      const past = this.vehiclesIndex.get(pastKey);
      if (past) {
        const penalty = offset * 0.05;
        return { ...past, confidence: Math.max(0.3, 0.8 - penalty) };
      }
    }
    
    return null;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;
    
    // Simple substring matching for performance
    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.8;
    }
    
    // Character-level Jaccard similarity for normalized parts (fixed)
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));
    
    const intersection = new Set([...set1].filter(c => set2.has(c)));
    const union = new Set([...set1, ...set2]);
    
    const similarity = intersection.size / union.size;
    
    // Ensure similarity stays within reasonable bounds
    return Math.min(similarity, 0.9);
  }

  private cacheResult(key: string, result: any): void {
    if (!this.config.enableCache) return;
    
    if (this.cache.size >= this.config.cacheSize!) {
      // Simple LRU: clear half the cache
      const entries = Array.from(this.cache.entries());
      entries.slice(0, Math.floor(entries.length / 2)).forEach(([k]) => {
        this.cache.delete(k);
      });
    }
    
    this.cache.set(key, result);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.config.cacheSize,
      enabled: this.config.enableCache
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
