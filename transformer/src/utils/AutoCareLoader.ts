import * as fs from 'fs';
import * as path from 'path';
import {
  AutoCareData,
  VCdbMake,
  VCdbModel,
  VCdbYear,
  VCdbBaseVehicle,
  VCdbVehicle,
  VCdbSubModel,
  VCdbVehicleType,
  VCdbEngineBase,
  VCdbEngineConfig,
  VCdbAspiration,
  VCdbFuelType,
  VCdbEngineDesignation,
  VCdbPowerOutput,
  VCdbValves,
  VCdbTransmissionType,
  VCdbTransmissionNumSpeeds,
  VCdbDriveType,
  VCdbBodyType,
  VCdbBodyNumDoors,
  VCdbWheelBase,
  VCdbBrakeType,
  VCdbBrakeABS,
  VCdbVehicleToEngineConfig,
  VCdbVehicleToTransmission,
  VCdbVehicleToDriveType,
  VCdbVehicleToBodyConfig,
  VCdbVehicleToWheelbase,
  VCdbVehicleToBrakeConfig,
  PCdbPart,
  PCdbPartsDescription
} from '../types/AutoCareTypes';

/**
 * AutoCare Data Loader
 * 
 * Loads and caches AutoCare VCdb and PCdb standard files
 * Creates efficient lookup maps for vehicle and parts matching
 */
export class AutoCareLoader {
  private data: AutoCareData | null = null;
  private vcdbPath: string;
  private pcdbPath: string;

  constructor(vcdbPath: string, pcdbPath: string) {
    this.vcdbPath = vcdbPath;
    this.pcdbPath = pcdbPath;
  }

  /**
   * Load all AutoCare data into memory with optimized lookups
   */
  async loadData(): Promise<AutoCareData> {
    if (this.data) {
      return this.data as any;
    }

    // Check if paths are provided
    if (!this.vcdbPath || !this.pcdbPath) {
      console.log('⚠️  AutoCare paths not configured, skipping AutoCare data loading');
      this.data = ({
        vcdb: {
          makes: new Map(),
          models: new Map(),
          years: new Map(),
          baseVehicles: new Map(),
          vehicles: new Map(),
          subModels: new Map(),
          vehicleTypes: new Map(),
          engineBases: new Map(),
          engineConfigs: new Map(),
          aspirations: new Map(),
          fuelTypes: new Map(),
          engineDesignations: new Map(),
          powerOutputs: new Map(),
          valves: new Map(),
          engineMfrs: new Map(),
          engineVersions: new Map(),
          transmissionBases: new Map(),
          transmissionMfrs: new Map(),
          transmissionTypes: new Map(),
          transmissionNumSpeeds: new Map(),
          driveTypes: new Map(),
          bodyTypes: new Map(),
          bodyNumDoors: new Map(),
          wheelBases: new Map(),
          brakeConfigs: new Map(),
          brakeTypes: new Map(),
          brakeABS: new Map(),
          brakeSystems: new Map(),
          steerTypes: new Map(),
          springTypes: new Map(),
          bedConfigs: new Map(),
          vehicleToEngineConfigs: new Map(),
          vehicleToTransmissions: new Map(),
          vehicleToDriveTypes: new Map(),
          vehicleToBodyConfigs: new Map(),
          vehicleToWheelbases: new Map(),
          vehicleToBrakeConfigs: new Map(),
          makesByName: new Map(),
          modelsByName: new Map()
        },
        pcdb: {
          parts: new Map(),
          descriptions: new Map(),
          partsByName: new Map(),
          partsByDescription: new Map(),
          attributes: new Map(),
          interchange: new Map(),
          assets: new Map(),
          packaging: new Map(),
          pricing: new Map(),
          availability: new Map(),
          hazmat: new Map(),
          digitalAssets: new Map()
        }
      }) as any;
      return this.data as any;
    }

    console.log('🔄 Loading AutoCare standard data...');
    const startTime = Date.now();

    try {
      // Load VCdb data
      const vcdbData = await this.loadVCdbData();
      
      // Load PCdb data  
      const pcdbData = await this.loadPCdbData();

      this.data = {
        vcdb: vcdbData,
        pcdb: pcdbData
      } as any;

      const loadTime = Date.now() - startTime;
      console.log(`✅ AutoCare data loaded successfully in ${loadTime}ms`);
      console.log(`   - VCdb: ${vcdbData.makes.size} makes, ${vcdbData.models.size} models, ${vcdbData.baseVehicles.size} base vehicles`);
      console.log(`   - PCdb: ${pcdbData.parts.size} parts, ${pcdbData.descriptions.size} descriptions`);

      return this.data!;
    } catch (error) {
      console.error('❌ Failed to load AutoCare data:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Load Vehicle Configuration Database (VCdb) data
   */
  private async loadVCdbData() {
    console.log('   Loading basic VCdb data...');
    
    // Core vehicle data
    const makes = await this.loadJsonFile<VCdbMake[]>(path.join(this.vcdbPath, 'Make.json'));
    const models = await this.loadJsonFile<VCdbModel[]>(path.join(this.vcdbPath, 'Model.json'));
    const years = await this.loadJsonFile<VCdbYear[]>(path.join(this.vcdbPath, 'Year.json'));
    const baseVehicles = await this.loadJsonFile<VCdbBaseVehicle[]>(path.join(this.vcdbPath, 'BaseVehicle.json'));
    
    // Optional files - may not exist in all datasets
    let vehicles: VCdbVehicle[] = [];
    let subModels: VCdbSubModel[] = [];
    
    try {
      vehicles = await this.loadJsonFile<VCdbVehicle[]>(path.join(this.vcdbPath, 'Vehicle.json'));
    } catch (e) {
      console.warn('⚠️  Vehicle.json not found, skipping detailed vehicle data:', (e as Error).message);
    }
    
    try {
      subModels = await this.loadJsonFile<VCdbSubModel[]>(path.join(this.vcdbPath, 'SubModel.json'));
    } catch (e) {
      console.warn('⚠️  SubModel.json not found, skipping submodel data:', (e as Error).message);
    }

    console.log('   Loading extended VCdb configuration data...');
    
    // Extended configuration data (optional)
    const vehicleTypes = await this.loadOptionalJsonFile<VCdbVehicleType>(path.join(this.vcdbPath, 'VehicleType.json'));
    const engineBases = await this.loadOptionalJsonFile<VCdbEngineBase>(path.join(this.vcdbPath, 'EngineBase.json'));
    const engineConfigs = await this.loadOptionalJsonFile<VCdbEngineConfig>(path.join(this.vcdbPath, 'EngineConfig.json'));
    const aspirations = await this.loadOptionalJsonFile<VCdbAspiration>(path.join(this.vcdbPath, 'Aspiration.json'));
    const fuelTypes = await this.loadOptionalJsonFile<VCdbFuelType>(path.join(this.vcdbPath, 'FuelType.json'));
    const engineDesignations = await this.loadOptionalJsonFile<VCdbEngineDesignation>(path.join(this.vcdbPath, 'EngineDesignation.json'));
    const powerOutputs = await this.loadOptionalJsonFile<VCdbPowerOutput>(path.join(this.vcdbPath, 'PowerOutput.json'));
    const valves = await this.loadOptionalJsonFile<VCdbValves>(path.join(this.vcdbPath, 'Valves.json'));
    const transmissionTypes = await this.loadOptionalJsonFile<VCdbTransmissionType>(path.join(this.vcdbPath, 'TransmissionType.json'));
    const transmissionNumSpeeds = await this.loadOptionalJsonFile<VCdbTransmissionNumSpeeds>(path.join(this.vcdbPath, 'TransmissionNumSpeeds.json'));
    const driveTypes = await this.loadOptionalJsonFile<VCdbDriveType>(path.join(this.vcdbPath, 'DriveType.json'));
    const bodyTypes = await this.loadOptionalJsonFile<VCdbBodyType>(path.join(this.vcdbPath, 'BodyType.json'));
    const bodyNumDoors = await this.loadOptionalJsonFile<VCdbBodyNumDoors>(path.join(this.vcdbPath, 'BodyNumDoors.json'));
    const wheelBases = await this.loadOptionalJsonFile<VCdbWheelBase>(path.join(this.vcdbPath, 'WheelBase.json'));
    const brakeTypes = await this.loadOptionalJsonFile<VCdbBrakeType>(path.join(this.vcdbPath, 'BrakeType.json'));
    const brakeABS = await this.loadOptionalJsonFile<VCdbBrakeABS>(path.join(this.vcdbPath, 'BrakeABS.json'));

    console.log('   Loading vehicle-to-configuration relationships...');
    
    // Vehicle-to-configuration relationship data (optional)
    const vehicleToEngineConfigs = await this.loadOptionalJsonFile<VCdbVehicleToEngineConfig>(path.join(this.vcdbPath, 'VehicleToEngineConfig.json'));
    const vehicleToTransmissions = await this.loadOptionalJsonFile<VCdbVehicleToTransmission>(path.join(this.vcdbPath, 'VehicleToTransmission.json'));
    const vehicleToDriveTypes = await this.loadOptionalJsonFile<VCdbVehicleToDriveType>(path.join(this.vcdbPath, 'VehicleToDriveType.json'));
    const vehicleToBodyConfigs = await this.loadOptionalJsonFile<VCdbVehicleToBodyConfig>(path.join(this.vcdbPath, 'VehicleToBodyConfig.json'));
    const vehicleToWheelbases = await this.loadOptionalJsonFile<VCdbVehicleToWheelbase>(path.join(this.vcdbPath, 'VehicleToWheelbase.json'));
    const vehicleToBrakeConfigs = await this.loadOptionalJsonFile<VCdbVehicleToBrakeConfig>(path.join(this.vcdbPath, 'VehicleToBrakeConfig.json'));

    // Build efficient lookup maps
    const makesMap = new Map(makes.map(make => [make.MakeID, make]));
    const modelsMap = new Map(models.map(model => [model.ModelID, model]));
    const yearsMap = new Map(years.map(year => [year.YearID, year.YearID])); // YearID is the actual year
    const baseVehiclesMap = new Map(baseVehicles.map(bv => [bv.BaseVehicleID, bv]));
    const vehiclesMap = new Map(vehicles.map(v => [v.VehicleID, v]));
    const subModelsMap = new Map(subModels.map(sm => [sm.SubmodelID, sm]));

    // Extended configuration maps - handle empty arrays gracefully
    const vehicleTypesMap = new Map(vehicleTypes.map(vt => [vt.VehicleTypeID, vt]));
    const engineBasesMap = new Map(engineBases.map(eb => [eb.EngineBaseID, eb]));
    const engineConfigsMap = new Map(engineConfigs.map(ec => [ec.EngineConfigID, ec]));
    const aspirationsMap = new Map(aspirations.map(a => [a.AspirationID, a]));
    const fuelTypesMap = new Map(fuelTypes.map(ft => [ft.FuelTypeID, ft]));
    const engineDesignationsMap = new Map(engineDesignations.map(ed => [ed.EngineDesignationID, ed]));
    const powerOutputsMap = new Map(powerOutputs.map(po => [po.PowerOutputID, po]));
    const valvesMap = new Map(valves.map(v => [v.ValvesID, v]));
    const transmissionTypesMap = new Map(transmissionTypes.map(tt => [tt.TransmissionTypeID, tt]));
    const transmissionNumSpeedsMap = new Map(transmissionNumSpeeds.map(tns => [tns.TransmissionNumSpeedsID, tns]));
    const driveTypesMap = new Map(driveTypes.map(dt => [dt.DriveTypeID, dt]));
    const bodyTypesMap = new Map(bodyTypes.map(bt => [bt.BodyTypeID, bt]));
    const bodyNumDoorsMap = new Map(bodyNumDoors.map(bnd => [bnd.BodyNumDoorsID, bnd]));
    const wheelBasesMap = new Map(wheelBases.map(wb => [wb.WheelBaseID, wb]));
    const brakeTypesMap = new Map(brakeTypes.map(bt => [bt.BrakeTypeID, bt]));
    const brakeABSMap = new Map(brakeABS.map(ba => [ba.BrakeABSID, ba]));

    // Build relationship maps (VehicleID -> array of relationships)
    const vehicleToEngineConfigsMap = this.groupByVehicleId(vehicleToEngineConfigs);
    const vehicleToTransmissionsMap = this.groupByVehicleId(vehicleToTransmissions);
    const vehicleToDriveTypesMap = this.groupByVehicleId(vehicleToDriveTypes);
    const vehicleToBodyConfigsMap = this.groupByVehicleId(vehicleToBodyConfigs);
    const vehicleToWheelbasesMap = this.groupByVehicleId(vehicleToWheelbases);
    const vehicleToBrakeConfigsMap = this.groupByVehicleId(vehicleToBrakeConfigs);

    // Create reverse lookup maps for matching
    const makesByName = new Map<string, VCdbMake>();
    for (const make of makes) {
      const normalizedName = this.normalizeName(make.MakeName);
      makesByName.set(normalizedName, make);
      
      // Add common variations
      this.addMakeVariations(makesByName, make);
    }

    const modelsByName = new Map<string, VCdbModel[]>();
    for (const model of models) {
      const normalizedName = this.normalizeName(model.ModelName);
      if (!modelsByName.has(normalizedName)) {
        modelsByName.set(normalizedName, []);
      }
      modelsByName.get(normalizedName)!.push(model);
    }

    return {
      // Basic vehicle data
      makes: makesMap,
      models: modelsMap,
      years: yearsMap,
      baseVehicles: baseVehiclesMap,
      vehicles: vehiclesMap,
      subModels: subModelsMap,
      
      // Extended configuration data
      vehicleTypes: vehicleTypesMap,
      engineBases: engineBasesMap,
      engineConfigs: engineConfigsMap,
      aspirations: aspirationsMap,
      fuelTypes: fuelTypesMap,
      engineDesignations: engineDesignationsMap,
      powerOutputs: powerOutputsMap,
      valves: valvesMap,
      transmissionTypes: transmissionTypesMap,
      transmissionNumSpeeds: transmissionNumSpeedsMap,
      driveTypes: driveTypesMap,
      bodyTypes: bodyTypesMap,
      bodyNumDoors: bodyNumDoorsMap,
      wheelBases: wheelBasesMap,
      brakeTypes: brakeTypesMap,
      brakeABS: brakeABSMap,
      
      // Vehicle-to-configuration relationships
      vehicleToEngineConfigs: vehicleToEngineConfigsMap,
      vehicleToTransmissions: vehicleToTransmissionsMap,
      vehicleToDriveTypes: vehicleToDriveTypesMap,
      vehicleToBodyConfigs: vehicleToBodyConfigsMap,
      vehicleToWheelbases: vehicleToWheelbasesMap,
      vehicleToBrakeConfigs: vehicleToBrakeConfigsMap,
      
      // Reverse lookup maps
      makesByName,
      modelsByName
    };
  }

  /**
   * Load Parts Catalog Database (PCdb) data
   */
  private async loadPCdbData() {
    const parts = await this.loadJsonFile<PCdbPart[]>(path.join(this.pcdbPath, 'Parts.json'));
    const descriptions = await this.loadJsonFile<PCdbPartsDescription[]>(
      path.join(this.pcdbPath, 'PartsDescription.json')
    );

    // Build lookup maps
    const partsMap = new Map(parts.map(part => [part.PartTerminologyID, part]));
    const descriptionsMap = new Map(descriptions.map(desc => [desc.PartsDescriptionID, desc]));

    // Create reverse lookup maps for matching
    const partsByName = new Map<string, PCdbPart>();
    for (const part of parts) {
      const normalizedName = this.normalizeName(part.PartTerminologyName);
      partsByName.set(normalizedName, part);
    }

    const partsByDescription = new Map<string, PCdbPart[]>();
    for (const part of parts) {
      const description = descriptionsMap.get(part.PartsDescriptionId);
      if (description && description.PartsDescription) {
        const keywords = this.extractKeywords(description.PartsDescription);
        for (const keyword of keywords) {
          if (!partsByDescription.has(keyword)) {
            partsByDescription.set(keyword, []);
          }
          partsByDescription.get(keyword)!.push(part);
        }
      }
    }

    return {
      parts: partsMap,
      descriptions: descriptionsMap,
      partsByName,
      partsByDescription,
      // Extended PIES data - initialize as empty maps
      attributes: new Map(),
      interchange: new Map(),
      assets: new Map(),
      packaging: new Map(),
      pricing: new Map(),
      availability: new Map(),
      hazmat: new Map(),
      digitalAssets: new Map()
    };
  }

  /**
   * Get VCdb path for DuckDB integration
   */
  getVcdbPath(): string {
    return this.vcdbPath;
  }

  /**
   * Get PCdb path for DuckDB integration 
   */
  getPcdbPath(): string {
    return this.pcdbPath;
  }

  /**
   * Load and parse JSON file
   */
  private async loadJsonFile<T>(filePath: string): Promise<T> {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as T;
  }

  /**
   * Normalize name for matching (lowercase, remove special chars, etc.)
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Add common make name variations for better matching
   */
  private addMakeVariations(makesByName: Map<string, VCdbMake>, make: VCdbMake) {
    const variations: { [key: string]: string[] } = {
      'General Motors': ['gm', 'general motors corp'],
      'Mercedes-Benz': ['mercedes', 'mercedes benz', 'mb'],
      'AM General': ['am general llc'],
      'Mitsubishi Fuso': ['mitsubishi', 'fuso'],
      'IC Corporation': ['ic corp', 'international'],
      'Freightliner': ['freightliner llc', 'freightliner trucks'],
      'Thomas': ['thomas bus', 'thomas built buses'],
      'Blue Bird': ['blue bird corp', 'bluebird'],
      'Emergency One': ['e one', 'e-one'],
      'American LaFrance': ['alf', 'american lafrance'],
      'Pierce Mfg. Inc.': ['pierce', 'pierce manufacturing'],
      'Western Star': ['western star trucks'],
      'Motor Coach Industries': ['mci', 'motor coach'],
      'New Flyer': ['new flyer industries'],
      'Seagrave Fire Apparatus': ['seagrave'],
      'North American Bus Industries (NABI)': ['nabi', 'north american bus'],
      'Workhorse Custom Chassis': ['workhorse'],
      'Dennis Eagle': ['dennis'],
      'GreenPower Motors': ['greenpower'],
      'Rosenbauer America': ['rosenbauer']
    };

    const makeName = make.MakeName;
    if (variations[makeName]) {
      for (const variation of variations[makeName]) {
        makesByName.set(this.normalizeName(variation), make);
      }
    }
  }

  /**
   * Extract keywords from parts description for matching
   */
  private extractKeywords(description: string): string[] {
    const keywords: string[] = [];
    const normalized = this.normalizeName(description);
    
    // Split into words and filter out common words
    const words = normalized.split(' ').filter(word => 
      word.length > 2 && 
      !['the', 'and', 'for', 'with', 'that', 'this', 'are', 'used'].includes(word)
    );
    
    // Add individual words
    keywords.push(...words);
    
    // Add 2-word phrases
    for (let i = 0; i < words.length - 1; i++) {
      keywords.push(`${words[i]} ${words[i + 1]}`);
    }
    
    return keywords;
  }

  /**
   * Get cached data (must call loadData first)
   */
  getData(): AutoCareData {
    if (!this.data) {
      throw new Error('AutoCare data not loaded. Call loadData() first.');
    }
    return this.data;
  }

  /**
   * Clear cached data to free memory
   */
  clearCache(): void {
    this.data = null;
  }

  /**
   * Load JSON file with optional handling - returns empty array if file doesn't exist
   */
  private async loadOptionalJsonFile<T>(filePath: string): Promise<T[]> {
    try {
      return await this.loadJsonFile<T[]>(filePath);
    } catch (e) {
      // File not found is not an error - return empty array
      return [];
    }
  }

  /**
   * Group relationship data by VehicleID
   */
  private groupByVehicleId<T extends { VehicleID: number }>(
    relationships: T[]
  ): Map<number, T[]> {
    const grouped = new Map<number, T[]>();
    for (const rel of relationships) {
      if (!grouped.has(rel.VehicleID)) {
        grouped.set(rel.VehicleID, []);
      }
      grouped.get(rel.VehicleID)!.push(rel);
    }
    return grouped;
  }
}

/**
 * Singleton instance for global access
 */
let globalLoader: AutoCareLoader | null = null;

export function getAutoCareLoader(): AutoCareLoader {
  if (!globalLoader) {
    // Default paths - should be configured via environment or parameters
    const vcdbPath = process.env.AUTOCARE_VCDB_PATH || 
      './autocare-data/VCdb';
    const pcdbPath = process.env.AUTOCARE_PCDB_PATH || 
      './autocare-data/PCdb';
    
    globalLoader = new AutoCareLoader(vcdbPath, pcdbPath);
  }
  return globalLoader;
}

export function setAutoCareLoader(loader: AutoCareLoader): void {
  globalLoader = loader;
}