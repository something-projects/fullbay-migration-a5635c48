/**
 * AutoCare Industry Standards Data Types
 * 
 * VCdb (Vehicle Configuration Database) and PCdb (Parts Catalog Database)
 * industry standard data structure definitions
 */

// VCdb Types - Vehicle Configuration Database
export interface VCdbMake {
  MakeID: number;
  MakeName: string;
}

export interface VCdbModel {
  ModelID: number;
  ModelName: string;
  VehicleTypeID: number;
}

export interface VCdbYear {
  YearID: number; // This is actually the year number
}

export interface VCdbBaseVehicle {
  BaseVehicleID: number;
  YearID: number;
  MakeID: number;
  ModelID: number;
}

export interface VCdbVehicle {
  VehicleID: number;
  BaseVehicleID: number;
  SubmodelID?: number;
  RegionID: number;
  Source: string;
  PublicationStageID: number;
}

export interface VCdbSubModel {
  SubmodelID: number;
  SubmodelName: string;
}

// Extended VCdb Types for Enhanced Vehicle Information
export interface VCdbVehicleType {
  VehicleTypeID: number;
  VehicleTypeName: string;
  VehicleTypeGroupID: number;
}

export interface VCdbEngineBase {
  EngineBaseID: number;
  Liter: string;
  CC: string;
  CID: string;
  Cylinders: string;
  BlockType: string;
  EngBoreIn: string;
  EngBoreMetric: string;
  EngStrokeIn: string;
  EngStrokeMetric: string;
  EngineHeadType?: string;
  FuelType?: string;
  Aspiration?: string;
  CylinderHeadType?: string;
  FuelDeliveryType?: string;
  FuelDeliverySubType?: string;
  FuelSystemControlType?: string;
  FuelSystemDesign?: string;
}

export interface VCdbEngineConfig {
  EngineConfigID: number;
  EngineBaseID: number;
  AspirationID: number;
  FuelTypeID: number;
  PowerOutputID: number;
  EngineDesignationID: number;
  ValvesID: number;
  EngineMfrID?: number;
  EngineVersionID?: number;
}

export interface VCdbAspiration {
  AspirationID: number;
  AspirationName: string;
}

export interface VCdbFuelType {
  FuelTypeID: number;
  FuelTypeName: string;
}

export interface VCdbEngineDesignation {
  EngineDesignationID: number;
  EngineDesignationName: string;
}

export interface VCdbPowerOutput {
  PowerOutputID: number;
  PowerOutputName: string;
}

export interface VCdbValves {
  ValvesID: number;
  ValvesName: string;
}

export interface VCdbTransmissionType {
  TransmissionTypeID: number;
  TransmissionTypeName: string;
}

export interface VCdbTransmissionNumSpeeds {
  TransmissionNumSpeedsID: number;
  TransmissionNumSpeedsName: string;
}

export interface VCdbDriveType {
  DriveTypeID: number;
  DriveTypeName: string;
}

export interface VCdbBodyType {
  BodyTypeID: number;
  BodyTypeName: string;
}

export interface VCdbBodyNumDoors {
  BodyNumDoorsID: number;
  BodyNumDoorsName: string;
}

export interface VCdbWheelBase {
  WheelBaseID: number;
  WheelBaseName: string;
}

export interface VCdbBrakeType {
  BrakeTypeID: number;
  BrakeTypeName: string;
}

export interface VCdbBrakeABS {
  BrakeABSID: number;
  BrakeABSName: string;
}

// Vehicle-to-configuration relationship tables
export interface VCdbVehicleToEngineConfig {
  VehicleToEngineConfigID: number;
  VehicleID: number;
  EngineConfigID: number;
  Source: string | null;
}

export interface VCdbVehicleToTransmission {
  VehicleToTransmissionID: number;
  VehicleID: number;
  TransmissionID: number;
  Source: string | null;
}

export interface VCdbVehicleToDriveType {
  VehicleToDriveTypeID: number;
  VehicleID: number;
  DriveTypeID: number;
  Source: string | null;
}

export interface VCdbVehicleToBodyConfig {
  VehicleToBodyConfigID: number;
  VehicleID: number;
  BodyTypeID: number;
  BodyNumDoorsID: number;
  Source: string | null;
}

export interface VCdbVehicleToWheelbase {
  VehicleToWheelbaseID: number;
  VehicleID: number;
  WheelBaseID: number;
  Source: string | null;
}

export interface VCdbVehicleToBrakeConfig {
  VehicleToBrakeConfigID: number;
  VehicleID: number;
  BrakeConfigID: number;
  FrontBrakeTypeID?: number;
  RearBrakeTypeID?: number;
  BrakeABSID?: number;
  BrakeSystemID?: number;
  Source: string | null;
}

// PCdb Types - Parts Catalog Database
export interface PCdbPart {
  PartTerminologyID: number;
  PartTerminologyName: string;
  PartsDescriptionId: number;
  RevDate: string;
}

export interface PCdbPartsDescription {
  PartsDescriptionID: number;
  PartsDescription: string;
}

// Loaded AutoCare Data Cache
export interface AutoCareData {
  vcdb: {
    // Basic vehicle data
    makes: Map<number, VCdbMake>;
    models: Map<number, VCdbModel>;
    years: Map<number, number>; // YearID -> actual year
    baseVehicles: Map<number, VCdbBaseVehicle>;
    vehicles: Map<number, VCdbVehicle>;
    subModels: Map<number, VCdbSubModel>;
    
    // Extended vehicle configuration data
    vehicleTypes: Map<number, VCdbVehicleType>;
    engineBases: Map<number, VCdbEngineBase>;
    engineConfigs: Map<number, VCdbEngineConfig>;
    aspirations: Map<number, VCdbAspiration>;
    fuelTypes: Map<number, VCdbFuelType>;
    engineDesignations: Map<number, VCdbEngineDesignation>;
    engineMfrs: Map<number, any>; // Engine manufacturers
    engineVersions: Map<number, any>; // Engine versions
    powerOutputs: Map<number, VCdbPowerOutput>;
    valves: Map<number, VCdbValves>;
    transmissionTypes: Map<number, VCdbTransmissionType>;
    transmissionBases: Map<number, any>; // Transmission bases
    transmissionMfrs: Map<number, any>; // Transmission manufacturers
    transmissions: Map<number, any>; // Transmission details
    transmissionNumSpeeds: Map<number, VCdbTransmissionNumSpeeds>;
    driveTypes: Map<number, VCdbDriveType>;
    bodyTypes: Map<number, VCdbBodyType>;
    bodyNumDoors: Map<number, VCdbBodyNumDoors>;
    wheelBases: Map<number, VCdbWheelBase>;
    brakeTypes: Map<number, VCdbBrakeType>;
    brakeABS: Map<number, VCdbBrakeABS>;
    
    // Vehicle-to-configuration relationship maps
    vehicleToEngineConfigs: Map<number, VCdbVehicleToEngineConfig[]>; // VehicleID -> configs
    vehicleToTransmissions: Map<number, VCdbVehicleToTransmission[]>;
    vehicleToDriveTypes: Map<number, VCdbVehicleToDriveType[]>;
    vehicleToBodyConfigs: Map<number, VCdbVehicleToBodyConfig[]>;
    vehicleToWheelbases: Map<number, VCdbVehicleToWheelbase[]>;
    vehicleToBrakeConfigs: Map<number, VCdbVehicleToBrakeConfig[]>;
    vehicleToBedConfigs: Map<number, any[]>; // Vehicle to bed config
    vehicleToSteeringConfigs: Map<number, any[]>; // Vehicle to steering config
    vehicleToSpringConfigs: Map<number, any[]>; // Vehicle to spring config
    bedTypes: Map<number, any>; // Bed types
    bedLengths: Map<number, any>; // Bed lengths
    brakeSystems: Map<number, any>; // Brake systems
    steeringTypes: Map<number, any>; // Steering types
    steeringSystems: Map<number, any>; // Steering systems
    springTypes: Map<number, any>; // Spring types
    
    // Reverse lookup maps for matching
    makesByName: Map<string, VCdbMake>;
    modelsByName: Map<string, VCdbModel[]>; // Multiple models can have same name
  };
  pcdb: {
    parts: Map<number, PCdbPart>;
    descriptions: Map<number, PCdbPartsDescription>;
    
    // Reverse lookup maps for matching
    partsByName: Map<string, PCdbPart>;
    partsByDescription: Map<string, PCdbPart[]>;
    
    // Extended PIES data
    attributes: Map<number, PartAttribute[]>; // partTerminologyId -> attributes
    interchange: Map<number, PartInterchange[]>; // partTerminologyId -> interchange parts
    assets: Map<number, PartAsset[]>; // partTerminologyId -> assets
    packaging: Map<number, PartPackaging>; // partTerminologyId -> packaging
    pricing: Map<number, PartPricing[]>; // partTerminologyId -> pricing
    availability: Map<number, PartAvailability[]>; // partTerminologyId -> availability
    hazmat: Map<number, PartHazmat>; // partTerminologyId -> hazmat info
    digitalAssets: Map<number, PartDigitalAsset[]>; // partTerminologyId -> digital assets
  };
}

// Engine Configuration Information
export interface VehicleEngineInfo {
  engineConfigId?: number;
  engineBaseId?: number;
  displacement?: number; // Liter value as number
  cid?: number; // Cubic inch displacement
  cc?: number; // Cubic centimeter displacement
  cylinders?: number;
  blockType?: string; // "V", "I" (Inline)
  headType?: string; // Engine head type
  fuelType?: string; // "Gasoline", "Diesel", "Electric"
  aspiration?: string; // "Naturally Aspirated", "Turbocharged"
  cylinderHeadType?: string; // Cylinder head type
  fuelDeliveryType?: string; // Fuel delivery type
  fuelDeliverySubType?: string; // Fuel delivery sub type
  fuelSystemControlType?: string; // Fuel system control type
  fuelSystemDesign?: string; // Fuel system design
  manufacturer?: string; // Engine manufacturer
  version?: string; // Engine version
  powerOutput?: string; // "350HP", "260KW"
  engineDesignation?: string; // "LT1", "ISX12"
  valves?: number; // Total valves
}

// Transmission Information
export interface VehicleTransmissionInfo {
  transmissionId?: number;
  transmissionType?: string; // "Automatic", "Manual"
  numSpeeds?: string; // "10-Speed", "6-Speed"
  driveType?: string; // "RWD", "FWD", "AWD"
  type?: string; // Transmission type
  speeds?: string; // Speed count
  manufacturer?: string; // Transmission manufacturer
  baseName?: string; // Transmission base name
}

// Body Configuration Information
export interface VehicleBodyInfo {
  bodyType?: string; // "Bus", "Pickup", "Van"
  wheelbase?: string; // "276 in"
  doors?: number;
  bedLength?: string; // For trucks
  bedType?: string; // Bed type
  steeringType?: string; // Steering type
  steeringSystem?: string; // Steering system
  frontSuspension?: string; // Front suspension
  rearSuspension?: string; // Rear suspension
}

// Brake System Information
export interface VehicleBrakeInfo {
  brakeType?: string; // "Air", "Hydraulic"
  abs?: boolean;
  frontBrakeType?: string; // Front brake type
  rearBrakeType?: string; // Rear brake type
  brakeSystem?: string; // Brake system
}

// Standardized Vehicle Information (Enhanced)
export interface StandardizedVehicle {
  // Basic vehicle identification
  makeId: number;
  makeName: string;
  modelId: number;
  modelName: string;
  year: number;
  baseVehicleId: number;
  vehicleId?: number;
  subModelId?: number;
  subModelName?: string;
  confidence: number; // 0-1 matching confidence score
  isAlternative?: boolean;

  // Vehicle type classification
  vehicleType?: string; // "Medium/Heavy Truck", "Motorhome/Recreational Vehicle"
  vehicleTypeId?: number;

  // Detailed configuration (optional - populated when data available)
  engine?: VehicleEngineInfo;
  transmission?: VehicleTransmissionInfo;
  body?: VehicleBodyInfo;
  brakes?: VehicleBrakeInfo;
}

// AutoCare Related Parts
export interface AutoCareRelatedPart {
  partTerminologyId: number;
  partTerminologyName: string;
  relationshipType: string;
}

// AutoCare Supersessions (replacement parts)
export interface AutoCareSupersession {
  partTerminologyId: number;
  partTerminologyName: string;
  type: 'supersedes' | 'superseded_by';
}

// PIES Extended Data Types

// Part Attributes from PartAttribute.json
export interface PartAttribute {
  partTerminologyId: number;
  attributeId: number;
  attributeName: string;
  attributeValue: string;
  unitOfMeasure?: string;
  attributeType: 'Physical' | 'Performance' | 'Application' | 'Marketing';
}

// Part Interchange from PartInterchange.json
export interface PartInterchange {
  partTerminologyId: number;
  interchangePartNumber: string;
  brandId: number;
  brandName: string;
  qualityGrade: 'OEM' | 'OES' | 'Premium' | 'Standard' | 'Economy';
  interchangeType: 'Direct' | 'Functional' | 'Form-Fit-Function';
  notes?: string;
}

// Part Assets from PartAsset.json
export interface PartAsset {
  partTerminologyId: number;
  assetId: number;
  assetType: 'Image' | 'Document' | 'Video' | 'CAD' | 'Installation';
  assetUrl: string;
  assetDescription?: string;
  isPrimary: boolean;
  language?: string;
  fileSize?: number;
  mimeType?: string;
}

// Part Packaging from PartPackaging.json
export interface PartPackaging {
  partTerminologyId: number;
  packageType: 'Individual' | 'Set' | 'Kit' | 'Bulk';
  packageQuantity: number;
  packageDimensions?: {
    length: number;
    width: number;
    height: number;
    weight: number;
    unitOfMeasure: string;
  };
  packageDescription?: string;
}

// Part Pricing from PartPricing.json
export interface PartPricing {
  partTerminologyId: number;
  priceType: 'MSRP' | 'Wholesale' | 'Dealer' | 'Retail';
  price: number;
  currency: string;
  effectiveDate: string;
  expirationDate?: string;
  priceBreaks?: {
    quantity: number;
    price: number;
  }[];
}

// Part Availability from PartAvailability.json
export interface PartAvailability {
  partTerminologyId: number;
  supplierId: number;
  supplierName: string;
  availabilityStatus: 'InStock' | 'LimitedStock' | 'BackOrder' | 'Discontinued';
  quantityOnHand?: number;
  leadTime?: number; // days
  lastUpdated: string;
}

// Part Hazmat from PartHazmat.json
export interface PartHazmat {
  partTerminologyId: number;
  isHazardous: boolean;
  hazmatClass?: string;
  unNumber?: string;
  packingGroup?: string;
  shippingRestrictions?: {
    ground: boolean;
    air: boolean;
    international: boolean;
  };
  storageRequirements?: string[];
  handlingInstructions?: string;
}

// Part Digital Assets from PartDigitalAsset.json
export interface PartDigitalAsset {
  partTerminologyId: number;
  digitalAssetId: number;
  assetType: 'ProductImage' | 'InstallationGuide' | 'TechnicalDrawing' | 'WarrantyInfo' | 'SafetyDataSheet';
  assetUrl: string;
  thumbnailUrl?: string;
  title: string;
  description?: string;
  language: string;
  fileFormat: string;
  fileSize: number;
  resolution?: string;
  createdDate: string;
  lastModified: string;
}

// Enhanced Category Information
export interface PartCategoryInfo {
  primaryCategory: string;
  subCategory?: string;
  categoryConfidence: number;
  categorySource: 'name_pattern' | 'description' | 'terminology';
}

// Enhanced Technical Specifications
export interface TechnicalSpecification {
  specType: 'dimension' | 'weight' | 'material' | 'electrical' | 'performance' | 'compatibility';
  name: string;
  value: string;
  unit?: string;
  confidence: number;
}

// Standardized Parts Information (Enhanced with full AutoCare relationships)
export interface StandardizedPart {
  partId?: string; // Part ID as string
  partNumber?: string; // Part number
  brandId?: string; // Brand ID
  partTypeName?: string; // Part type name
  partName?: string; // Part name
  confidence?: number; // 0-1 matching confidence score
  matchType?: string; // 'exact' | 'fuzzy' | 'description' | 'keyword' | 'attribute'
  source?: string; // Data source
  
  // Legacy fields for compatibility
  partTerminologyId?: number;
  partTerminologyName?: string;
  partsDescriptionId?: number;
  descriptions?: string[]; // Multiple descriptions from AutoCare
  matchingMethod?: 'exact' | 'fuzzy' | 'description' | 'keyword' | 'attribute';
  
  // AutoCare relationship data
  relatedParts?: AutoCareRelatedPart[];
  aliases?: string[];
  supersessions?: AutoCareSupersession[];
  
  // Enhanced data from existing sources
  category?: PartCategoryInfo;
  technicalSpecifications?: TechnicalSpecification[];
  
  // Extended PIES data
  attributes?: PartAttribute[] | any; // Allow flexible attributes
  interchangeableParts?: PartInterchange[];
  assets?: PartAsset[];
  packaging?: PartPackaging;
  pricing?: PartPricing[];
  availability?: PartAvailability[];
  hazmat?: PartHazmat;
  digitalAssets?: PartDigitalAsset[];
  
  // Additional flags
  isAlternative?: boolean;
}

// Matching Configuration
export interface VehicleMatchConfig {
  enableFuzzyMatch: boolean;
  fuzzyThreshold: number; // 0-1, minimum similarity score
  enableYearRange: boolean;
  yearRangeTolerance: number; // +/- years to consider
  enableCache?: boolean;
  cacheSize?: number;
  debugMode?: boolean;
}

export interface PartsMatchConfig {
  enableFuzzyMatch: boolean;
  fuzzyThreshold: number;
  enableDescriptionMatch: boolean;
  descriptionThreshold: number;
  enableKeywordMatch: boolean;
  keywordWeights: { [key: string]: number };
  // Extended matching options
  enableAttributeMatch: boolean;
  attributeWeights: { [attributeType: string]: number };
  enableInterchangeMatch: boolean;
  interchangeQualityPreference: ('OEM' | 'OES' | 'Premium' | 'Standard' | 'Economy')[];
  enableAssetEnrichment: boolean;
  preferredAssetTypes: ('Image' | 'Document' | 'Video' | 'CAD' | 'Installation')[];
  enablePricingFilter: boolean;
  priceRange?: {
    min?: number;
    max?: number;
    currency: string;
  };
  enableAvailabilityFilter: boolean;
  preferredAvailabilityStatus: ('InStock' | 'LimitedStock' | 'BackOrder' | 'Discontinued')[];
  enableCache?: boolean;
  cacheSize?: number;
  debugMode?: boolean;
}

// Failure Reason Enums - Clearer distinction between user data issues vs AutoCare limitations
export enum VehicleMatchFailureReason {
  // User data quality issues
  MISSING_MAKE = 'MISSING_MAKE',                      // No make provided by user
  MISSING_MODEL = 'MISSING_MODEL',                    // No model provided by user
  MISSING_YEAR = 'MISSING_YEAR',                      // No year provided by user
  INVALID_YEAR = 'INVALID_YEAR',                      // Year is invalid (too old/new)
  
  // AutoCare database coverage limitations
  MAKE_NOT_IN_AUTOCARE = 'MAKE_NOT_IN_AUTOCARE',     // Make not found in AutoCare VCdb
  MODEL_NOT_IN_AUTOCARE = 'MODEL_NOT_IN_AUTOCARE',   // Model not found for make in VCdb
  VEHICLE_NOT_IN_AUTOCARE = 'VEHICLE_NOT_IN_AUTOCARE', // Vehicle configuration not in VCdb
  YEAR_NOT_SUPPORTED = 'YEAR_NOT_SUPPORTED',         // Year not supported for this make/model
  
  // Match quality issues
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',                  // Match found but confidence too low
  AMBIGUOUS_MATCH = 'AMBIGUOUS_MATCH',               // Multiple matches with similar confidence
  
  // System errors
  EXCEPTION_ERROR = 'EXCEPTION_ERROR',               // Unexpected technical error
  NO_INPUT_DATA = 'NO_INPUT_DATA',                   // Legacy fallback
  NO_MATCH_RESULT = 'NO_MATCH_RESULT',               // Vehicle was not included in batch processing
  
  // Vehicle data issues
  NO_VEHICLE_DATA = 'NO_VEHICLE_DATA',               // Unit has no vehicle identification data at all
  VIN_DECODE_FAILED = 'VIN_DECODE_FAILED'            // Has VIN but failed to decode to make/model/year
}

export enum PartsMatchFailureReason {
  // User data quality issues
  MISSING_PART_NAME = 'MISSING_PART_NAME',           // No part name or title provided
  MISSING_DESCRIPTION = 'MISSING_DESCRIPTION',       // No description provided
  VAGUE_PART_NAME = 'VAGUE_PART_NAME',              // Part name too generic/vague
  
  // Non-part/service items
  SERVICE_ITEM = 'SERVICE_ITEM',                    // Line item is a service/labor, not a part
  
  // AutoCare database coverage limitations
  PART_NOT_IN_AUTOCARE = 'PART_NOT_IN_AUTOCARE',    // Part not found in AutoCare PCdb
  CATEGORY_NOT_SUPPORTED = 'CATEGORY_NOT_SUPPORTED', // Part category not in AutoCare
  LIMITED_AUTOCARE_DATA = 'LIMITED_AUTOCARE_DATA',   // AutoCare data incomplete for this part
  
  // Match quality issues
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',                 // Match found but confidence too low
  AMBIGUOUS_MATCH = 'AMBIGUOUS_MATCH',              // Multiple matches with similar confidence
  CONFLICTING_ATTRIBUTES = 'CONFLICTING_ATTRIBUTES', // Part attributes conflict with matches
  
  // Search method failures
  EXACT_MATCH_FAILED = 'EXACT_MATCH_FAILED',        // No exact name matches
  FUZZY_MATCH_FAILED = 'FUZZY_MATCH_FAILED',        // Fuzzy matching below threshold
  KEYWORD_SEARCH_FAILED = 'KEYWORD_SEARCH_FAILED',  // Keyword extraction/matching failed
  ATTRIBUTE_MATCH_FAILED = 'ATTRIBUTE_MATCH_FAILED', // Attribute-based matching failed
  
  // System errors
  EXCEPTION_ERROR = 'EXCEPTION_ERROR',               // Unexpected technical error
  NO_INPUT_DATA = 'NO_INPUT_DATA'                    // Legacy fallback
}

// Match Results
export interface VehicleMatchResult {
  matched: boolean;
  standardizedVehicle?: StandardizedVehicle;
  alternatives?: StandardizedVehicle[]; // Alternative matches 
  failureReason?: VehicleMatchFailureReason; // Reason for failure if not matched
  failureDetails?: string; // Detailed failure information
  attemptedMethods?: string[]; // Methods that were attempted 
  searchAttempts?: { // Track what was searched for
    make?: string;
    normalizedMake?: string;
    model?: string;
    normalizedModel?: string;
    year?: number;
  };
  confidenceScores?: { // Track confidence scores for analysis
    exact?: number;
    fuzzy?: number;
    combined?: number;
  };
  originalData?: { 
    make?: string;
    model?: string;
    year?: number;
    subModel?: string;
    engineInfo?: string;
    transmissionInfo?: string;
    bodyInfo?: string;
    vin?: string;
    entityId?: number;
  };
}

export interface PartsMatchResult {
  matched: boolean;
  standardizedPart?: StandardizedPart;
  alternatives?: StandardizedPart[]; 
  failureReason?: PartsMatchFailureReason; // Reason for failure if not matched
  failureDetails?: string; // Detailed failure information
  attemptedMethods?: string[]; // Methods that were attempted (exact, fuzzy, keyword, etc.)
  searchTerms?: string[]; // Terms that were searched for
  extractedAttributes?: string[]; // Attributes extracted for matching
  confidenceScores?: { // Track confidence scores for analysis
    exact?: number;
    fuzzy?: number;
    keyword?: number;
    final?: number;
  };
  originalData: {
    title?: string;
    description?: string;
    shopNumber?: string;
    vendorNumber?: string;
  };
}

// Statistics and Quality Tracking
export interface MatchingStatistics {
  vehicleMatches: {
    total: number;
    exactMatches: number;
    fuzzyMatches: number;
    noMatches: number;
    averageConfidence: number;
  };
  partsMatches: {
    total: number;
    exactMatches: number;
    fuzzyMatches: number;
    descriptionMatches: number;
    keywordMatches: number;
    attributeMatches: number;
    interchangeMatches: number;
    noMatches: number;
    averageConfidence: number;
    enrichmentStats: {
      withAttributes: number;
      withAssets: number;
      withPricing: number;
      withAvailability: number;
      withHazmatInfo: number;
    };
  };
  processingTime: {
    loadingTime: number; // ms
    matchingTime: number; // ms
    enrichmentTime: number; // ms
  };
  cacheStats: {
    hitRate: number;
    totalRequests: number;
    cacheSize: number;
  };
}
