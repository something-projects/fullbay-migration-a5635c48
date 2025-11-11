/**
 * Vehicle Fuzzy Match Strategy
 * Uses similarity algorithms for approximate vehicle matching
 */

import { BaseVehicleMatchingStrategy, VehicleMatchingContext, VehicleStrategyResult } from '../IVehicleMatchingStrategy';
import { AutoCareData, StandardizedVehicle } from '../../../types/AutoCareTypes';

export class VehicleFuzzyMatchStrategy extends BaseVehicleMatchingStrategy {
  readonly name = 'vehicle_fuzzy_match';
  readonly priority = 80;

  protected getDefaultConfig() {
    return {
      similarityThreshold: 0.7,
      maxCandidates: 5,
      minConfidence: 0.6,
      makeWeight: 0.4,
      modelWeight: 0.4,
      yearWeight: 0.2
    };
  }

  canHandle(context: VehicleMatchingContext): boolean {
    return !!(context.make || context.model);
  }

  async match(context: VehicleMatchingContext, autoCareData: AutoCareData): Promise<VehicleStrategyResult> {
    const { make, model, year } = context;
    
    if (!make && !model) {
      return this.createFailureResult('Make or model required for fuzzy matching');
    }

    const candidates: StandardizedVehicle[] = [];
    const normalizedMake = make ? this.normalizeName(make) : '';
    const normalizedModel = model ? this.normalizeName(model) : '';

    // Score all make/model combinations
    const scoredMatches: Array<{
      makeId: number,
      makeName: string,
      modelId: number,
      modelName: string,
      score: number
    }> = [];

    // Iterate through all makes
    for (const [makeId, makeData] of autoCareData.vcdb.makes) {
      let makeScore = 0;
      
      if (make) {
        const similarity = this.calculateSimilarity(normalizedMake, this.normalizeName(makeData.MakeName));
        makeScore = similarity * this.config.makeWeight;
      } else {
        makeScore = this.config.makeWeight; // No make penalty
      }

      // Skip if make similarity is too low
      if (make && makeScore < this.config.similarityThreshold * this.config.makeWeight) {
        continue;
      }

      // Iterate through models for this make
      for (const [modelId, modelData] of autoCareData.vcdb.models) {
        let modelScore = 0;
        
        if (model) {
          const similarity = this.calculateSimilarity(normalizedModel, this.normalizeName(modelData.ModelName));
          modelScore = similarity * this.config.modelWeight;
        } else {
          modelScore = this.config.modelWeight; // No model penalty
        }

        // Skip if model similarity is too low
        if (model && modelScore < this.config.similarityThreshold * this.config.modelWeight) {
          continue;
        }

        const totalScore = makeScore + modelScore;
        
        if (totalScore >= this.config.similarityThreshold) {
          scoredMatches.push({
            makeId,
            makeName: makeData.MakeName,
            modelId,
            modelName: modelData.ModelName,
            score: totalScore
          });
        }
      }
    }

    // Sort by score and limit results
    scoredMatches.sort((a, b) => b.score - a.score);
    const topMatches = scoredMatches.slice(0, this.config.maxCandidates);

    // Find base vehicles for top matches
    for (const match of topMatches) {
      // Find base vehicles for this make/model combination
      let bestYearMatch: { baseVehicleId: number, year: number, yearScore: number } | null = null;

      for (const [baseVehicleId, baseVehicle] of autoCareData.vcdb.baseVehicles) {
        if (baseVehicle.MakeID === match.makeId && baseVehicle.ModelID === match.modelId) {
          const vehicleYear = baseVehicle.YearID;
          let yearScore = this.config.yearWeight;

          // Calculate year score if year is provided
          if (year) {
            const yearDiff = Math.abs(vehicleYear - year);
            if (yearDiff === 0) {
              yearScore = this.config.yearWeight; // Exact year match
            } else if (yearDiff <= 2) {
              yearScore = this.config.yearWeight * 0.8; // Close year match
            } else if (yearDiff <= 5) {
              yearScore = this.config.yearWeight * 0.5; // Acceptable year match
            } else {
              yearScore = this.config.yearWeight * 0.2; // Poor year match
            }
          }

          // Keep the best year match for this make/model
          if (!bestYearMatch || yearScore > bestYearMatch.yearScore) {
            bestYearMatch = { baseVehicleId, year: vehicleYear, yearScore };
          }
        }
      }

      if (bestYearMatch) {
        const finalConfidence = Math.min(1.0, match.score + bestYearMatch.yearScore);
        
        if (finalConfidence >= this.config.minConfidence) {
          const standardizedVehicle = this.createStandardizedVehicle(
            match.makeId,
            match.makeName,
            match.modelId,
            match.modelName,
            bestYearMatch.year,
            bestYearMatch.baseVehicleId,
            finalConfidence
          );

          candidates.push(standardizedVehicle);
        }
      }
    }

    if (candidates.length === 0) {
      return this.createFailureResult(`No fuzzy matches found above confidence threshold ${this.config.minConfidence}`);
    }

    // Sort by confidence
    candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    return this.createSuccessResult(
      candidates.slice(0, this.config.maxCandidates),
      candidates[0].confidence || 0,
      `Found ${candidates.length} fuzzy match${candidates.length > 1 ? 'es' : ''} with similarity >= ${this.config.similarityThreshold}`
    );
  }
}