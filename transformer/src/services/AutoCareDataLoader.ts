/**
 * Pure JavaScript AutoCare Data Loader
 * Replaces DuckDB with in-memory Maps for better performance
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  AutoCareData, 
  StandardizedPart, 
  StandardizedVehicle,
  VCdbMake,
  VCdbModel,
  VCdbBaseVehicle,
  PCdbPart,
  PCdbPartsDescription
} from '../types/AutoCareTypes';

export interface LoadedData {
  partsIndex: Map<string, StandardizedPart>;
  vehiclesIndex: Map<string, StandardizedVehicle>;
  fuzzyPartsIndex: Map<string, StandardizedPart[]>;
  makesByName: Map<string, VCdbMake>;
  modelsByName: Map<string, VCdbModel[]>;
}

/**
 * Fast JSON-based data loader that replaces DuckDB
 */
export class AutoCareDataLoader {
  private partsMap = new Map<string, StandardizedPart>();
  private vehiclesMap = new Map<string, StandardizedVehicle>();
  private fuzzyIndex = new Map<string, StandardizedPart[]>();
  private makesByName = new Map<string, VCdbMake>();
  private modelsByName = new Map<string, VCdbModel[]>();

  /**
   * Load AutoCare data from JSON files into memory maps
   */
  async loadData(vcdbPath: string, pcdbPath: string): Promise<LoadedData> {
    console.log('📂 Loading AutoCare data from JSON files...');
    const startTime = Date.now();

    // Load Parts data
    console.log('  📄 Loading Parts.json...');
    const partsPath = path.join(pcdbPath, 'Parts.json');
    if (!fs.existsSync(partsPath)) {
      throw new Error(`Parts.json not found at ${partsPath}`);
    }
    const parts: PCdbPart[] = JSON.parse(fs.readFileSync(partsPath, 'utf8'));

    // Load Parts descriptions
    console.log('  📄 Loading PartsDescription.json...');
    const descPath = path.join(pcdbPath, 'PartsDescription.json');
    const descriptions: PCdbPartsDescription[] = fs.existsSync(descPath) 
      ? JSON.parse(fs.readFileSync(descPath, 'utf8'))
      : [];

    // Load Vehicle data
    console.log('  📄 Loading VCdb data...');
    const makes: VCdbMake[] = JSON.parse(
      fs.readFileSync(path.join(vcdbPath, 'Make.json'), 'utf8')
    );
    const models: VCdbModel[] = JSON.parse(
      fs.readFileSync(path.join(vcdbPath, 'Model.json'), 'utf8')
    );
    const baseVehicles: VCdbBaseVehicle[] = JSON.parse(
      fs.readFileSync(path.join(vcdbPath, 'BaseVehicle.json'), 'utf8')
    );

    // Create lookup maps
    console.log('  🗂️  Building lookup maps...');
    const descriptionMap = new Map(
      descriptions.map(d => [d.PartsDescriptionID, d.PartsDescription])
    );
    const makeMap = new Map(makes.map(m => [m.MakeID, m]));
    const modelMap = new Map(models.map(m => [m.ModelID, m]));

    // Build parts index
    console.log('  🔧 Building parts index...');
    for (const part of parts) {
      const normalized = this.normalizeName(part.PartTerminologyName);
      
      const standardized: StandardizedPart = {
        partId: String(part.PartTerminologyID),
        partName: part.PartTerminologyName,
        partTerminologyId: part.PartTerminologyID,
        partTerminologyName: part.PartTerminologyName,
        partsDescriptionId: part.PartsDescriptionId,
        descriptions: part.PartsDescriptionId ? 
          [descriptionMap.get(part.PartsDescriptionId) || ''].filter(Boolean) : [],
        confidence: 1.0,
        matchingMethod: 'exact',
        source: 'AutoCare_PCdb',
        relatedParts: [],
        aliases: [],
        supersessions: []
      };
      
      // Debug log for confidence tracking
      if (part.PartTerminologyName.toLowerCase().includes('machine') || 
          part.PartTerminologyName.toLowerCase().includes('air filter') ||
          part.PartTerminologyName.toLowerCase().includes('oil filter')) {
      }
      
      this.partsMap.set(normalized, standardized);
      
      // Build fuzzy search index (by first 3 characters)
      const prefix = normalized.substring(0, 3);
      if (!this.fuzzyIndex.has(prefix)) {
        this.fuzzyIndex.set(prefix, []);
      }
      this.fuzzyIndex.get(prefix)!.push(standardized);
    }

    // Build vehicle index
    console.log('  🚗 Building vehicle index...');
    for (const baseVehicle of baseVehicles) {
      const make = makeMap.get(baseVehicle.MakeID);
      const model = modelMap.get(baseVehicle.ModelID);
      
      if (make && model) {
        const key = this.getVehicleKey(make.MakeName, model.ModelName, baseVehicle.YearID);
        
        const standardized: StandardizedVehicle = {
          makeId: baseVehicle.MakeID,
          makeName: make.MakeName,
          modelId: baseVehicle.ModelID,
          modelName: model.ModelName,
          year: baseVehicle.YearID,
          baseVehicleId: baseVehicle.BaseVehicleID,
          confidence: 1.0
        };
        
        this.vehiclesMap.set(key, standardized);
      }
    }

    // Build name-based lookup maps for compatibility
    console.log('  📚 Building name-based indexes...');
    for (const make of makes) {
      this.makesByName.set(this.normalizeName(make.MakeName), make);
    }
    
    for (const model of models) {
      const normalized = this.normalizeName(model.ModelName);
      if (!this.modelsByName.has(normalized)) {
        this.modelsByName.set(normalized, []);
      }
      this.modelsByName.get(normalized)!.push(model);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Loaded AutoCare data in ${duration}ms:`);
    console.log(`   Parts: ${this.partsMap.size}`);
    console.log(`   Vehicles: ${this.vehiclesMap.size}`);
    console.log(`   Makes: ${this.makesByName.size}`);
    console.log(`   Models: ${this.modelsByName.size}`);

    return {
      partsIndex: this.partsMap,
      vehiclesIndex: this.vehiclesMap,
      fuzzyPartsIndex: this.fuzzyIndex,
      makesByName: this.makesByName,
      modelsByName: this.modelsByName
    };
  }

  /**
   * Normalize name for consistent matching
   */
  private normalizeName(name: string): string {
    if (!name) return '';
    
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      // Apply common part name mappings
      .replace(/oilfilter/g, 'engineoilfilter')
      .replace(/airfilter/g, 'engineairfilter')
      .replace(/fuelfilter/g, 'fuelfilter')
      .replace(/cabinfilter/g, 'cabinairfilter')
      .replace(/brakepads/g, 'discbrakepad')
      .replace(/brakeshoes/g, 'drumbrakelinings')
      .replace(/sparkplugs/g, 'sparkplug')
      .replace(/wiperblades/g, 'windshieldwiperblade');
  }

  /**
   * Generate vehicle lookup key
   */
  private getVehicleKey(make: string, model: string, year: number): string {
    const normMake = this.normalizeName(make);
    const normModel = this.normalizeName(model);
    return `${normMake}|${normModel}|${year}`;
  }
}