/**
 * Vehicle Year Range Strategy
 * Matches vehicles within a year range when exact year match fails
 */

import { BaseVehicleMatchingStrategy, VehicleMatchingContext, VehicleStrategyResult } from '../IVehicleMatchingStrategy';
import { AutoCareData, StandardizedVehicle } from '../../../types/AutoCareTypes';

export class VehicleYearRangeStrategy extends BaseVehicleMatchingStrategy {
  readonly name = 'vehicle_year_range';
  readonly priority = 60;

  protected getDefaultConfig() {
    return {
      yearRangeTolerance: 3, // +/- 3 years
      maxCandidates: 8,
      baseConfidence: 0.8,
      yearPenaltyFactor: 0.05 // Reduce confidence by 5% per year difference
    };
  }

  canHandle(context: VehicleMatchingContext): boolean {
    return !!(context.make && context.model && context.year);
  }

  async match(context: VehicleMatchingContext, autoCareData: AutoCareData): Promise<VehicleStrategyResult> {
    const { make, model, year } = context;
    
    if (!make || !model || !year) {
      return this.createFailureResult('Make, model, and year required for year range matching');
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
    const modelMatch = modelMatches.find(m => m.VehicleTypeID);
    if (!modelMatch) {
      return this.createFailureResult(`Model "${model}" not found for make "${make}"`);
    }

    // Find base vehicles within year range
    const yearRangeMatches: Array<{
      baseVehicleId: number,
      vehicleYear: number,
      yearDiff: number,
      confidence: number
    }> = [];

    for (const [baseVehicleId, baseVehicle] of autoCareData.vcdb.baseVehicles) {
      if (baseVehicle.MakeID === makeMatch.MakeID && baseVehicle.ModelID === modelMatch.ModelID) {
        const vehicleYear = baseVehicle.YearID;
        const yearDiff = Math.abs(vehicleYear - year);
        
        // Check if within tolerance range
        if (yearDiff <= this.config.yearRangeTolerance) {
          // Calculate confidence based on year difference
          const yearPenalty = yearDiff * this.config.yearPenaltyFactor;
          const confidence = Math.max(0.1, this.config.baseConfidence - yearPenalty);
          
          yearRangeMatches.push({
            baseVehicleId,
            vehicleYear,
            yearDiff,
            confidence
          });
        }
      }
    }

    if (yearRangeMatches.length === 0) {
      return this.createFailureResult(
        `No vehicles found for ${make} ${model} within ${this.config.yearRangeTolerance} years of ${year}`
      );
    }

    // Sort by year difference (closest years first) and confidence
    yearRangeMatches.sort((a, b) => {
      if (a.yearDiff !== b.yearDiff) {
        return a.yearDiff - b.yearDiff;
      }
      return b.confidence - a.confidence;
    });

    // Create standardized vehicles
    for (const match of yearRangeMatches.slice(0, this.config.maxCandidates)) {
      const standardizedVehicle = this.createStandardizedVehicle(
        makeMatch.MakeID,
        makeMatch.MakeName,
        modelMatch.ModelID,
        modelMatch.ModelName,
        match.vehicleYear, // Use the actual vehicle year, not the requested year
        match.baseVehicleId,
        match.confidence
      );

      // Add year range information
      (standardizedVehicle as any).yearRange = {
        requestedYear: year,
        actualYear: match.vehicleYear,
        yearDifference: match.yearDiff
      };

      candidates.push(standardizedVehicle);
    }

    return this.createSuccessResult(
      candidates,
      candidates[0]?.confidence || 0,
      `Found ${candidates.length} vehicle${candidates.length > 1 ? 's' : ''} within ${this.config.yearRangeTolerance} years of ${year}`
    );
  }
}