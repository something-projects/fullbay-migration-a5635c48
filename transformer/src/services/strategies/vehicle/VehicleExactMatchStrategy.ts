/**
 * Vehicle Exact Match Strategy
 * Attempts exact matching for make, model, and year
 */

import { BaseVehicleMatchingStrategy, VehicleMatchingContext, VehicleStrategyResult } from '../IVehicleMatchingStrategy';
import { AutoCareData, StandardizedVehicle } from '../../../types/AutoCareTypes';

export class VehicleExactMatchStrategy extends BaseVehicleMatchingStrategy {
  readonly name = 'vehicle_exact_match';
  readonly priority = 100; // Highest priority

  protected getDefaultConfig() {
    return {
      exactConfidence: 1.0,
      requireYear: true,
      enableSubModelMatch: true
    };
  }

  canHandle(context: VehicleMatchingContext): boolean {
    return !!(context.make && context.model && context.year);
  }

  async match(context: VehicleMatchingContext, autoCareData: AutoCareData): Promise<VehicleStrategyResult> {
    const { make, model, year, subModel } = context;
    
    if (!make || !model || !year) {
      return this.createFailureResult('Missing required fields: make, model, or year');
    }

    const candidates: StandardizedVehicle[] = [];
    const normalizedMake = this.normalizeName(make);
    const normalizedModel = this.normalizeName(model);

    // Find exact make match
    const makeMatch = autoCareData.vcdb.makesByName.get(normalizedMake);
    if (!makeMatch) {
      return this.createFailureResult(`Make "${make}" not found`);
    }

    // Find exact model match
    const modelMatches = autoCareData.vcdb.modelsByName.get(normalizedModel) || [];
    const modelMatch = modelMatches.find(m => m.VehicleTypeID); // Get first valid model
    if (!modelMatch) {
      return this.createFailureResult(`Model "${model}" not found for make "${make}"`);
    }

    // Find base vehicles for this make/model/year combination
    for (const [baseVehicleId, baseVehicle] of autoCareData.vcdb.baseVehicles) {
      if (baseVehicle.MakeID === makeMatch.MakeID && 
          baseVehicle.ModelID === modelMatch.ModelID &&
          baseVehicle.YearID === year) {
        
        // Found exact match for make/model/year
        const standardizedVehicle = this.createStandardizedVehicle(
          makeMatch.MakeID,
          makeMatch.MakeName,
          modelMatch.ModelID,
          modelMatch.ModelName,
          year,
          baseVehicleId,
          this.config.exactConfidence
        );

        // If subModel is provided, try to find vehicles with matching subModel
        if (subModel && this.config.enableSubModelMatch) {
          const normalizedSubModel = this.normalizeName(subModel);
          
          // Find vehicles for this base vehicle
          for (const [vehicleId, vehicle] of autoCareData.vcdb.vehicles) {
            if (vehicle.BaseVehicleID === baseVehicleId && vehicle.SubmodelID) {
              const subModelData = autoCareData.vcdb.subModels.get(vehicle.SubmodelID);
              if (subModelData && this.normalizeName(subModelData.SubmodelName) === normalizedSubModel) {
                // Found exact subModel match
                standardizedVehicle.vehicleId = vehicleId;
                standardizedVehicle.subModelId = vehicle.SubmodelID;
                standardizedVehicle.subModelName = subModelData.SubmodelName;
                break;
              }
            }
          }
        }

        candidates.push(standardizedVehicle);
      }
    }

    if (candidates.length === 0) {
      return this.createFailureResult(`No vehicles found for ${make} ${model} ${year}${subModel ? ` ${subModel}` : ''}`);
    }

    // Sort by confidence (exact matches first)
    candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    return this.createSuccessResult(
      candidates,
      candidates[0].confidence || this.config.exactConfidence,
      `Found ${candidates.length} exact match${candidates.length > 1 ? 'es' : ''}`
    );
  }
}