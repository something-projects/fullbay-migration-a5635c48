/**
 * Exact Match Strategy
 * Attempts exact name matching with part mappings
 */

import { BaseMatchingStrategy, MatchingContext, StrategyResult } from '../IMatchingStrategy';
import { AutoCareData, StandardizedPart, PCdbPart } from '../../../types/AutoCareTypes';
import { PartsMappings } from '../../../data/PartsMappings';
import { TextProcessor } from '../../../utils/TextProcessor';

export class ExactMatchStrategy extends BaseMatchingStrategy {
  readonly name = 'exact_match';
  readonly priority = 100; // Highest priority

  protected getDefaultConfig() {
    return {
      enableMappings: true,
      mappingConfidence: 0.95,
      exactConfidence: 1.0,
      caseSensitive: false
    };
  }

  canHandle(context: MatchingContext): boolean {
    return !!(context.title || context.description);
  }

  async match(context: MatchingContext, autoCareData: AutoCareData): Promise<StrategyResult> {
    const searchTerms: string[] = [];
    const candidates: StandardizedPart[] = [];

    if (context.title) {
      const titleResult = await this.tryExactMatchOnTitle(
        context.title, 
        autoCareData, 
        searchTerms
      );
      candidates.push(...titleResult);
    }

    if (candidates.length === 0 && context.description) {
      const descResult = await this.tryExactMatchOnDescription(
        context.description,
        autoCareData,
        searchTerms
      );
      candidates.push(...descResult);
    }

    const confidence = candidates.length > 0 ? 
      (candidates[0].confidence || this.config.exactConfidence) : 0;

    return this.createSuccessResult(
      candidates,
      confidence,
      searchTerms,
      `Found ${candidates.length} exact matches`
    );
  }

  private async tryExactMatchOnTitle(
    title: string,
    autoCareData: AutoCareData,
    searchTerms: string[]
  ): Promise<StandardizedPart[]> {
    const candidates: StandardizedPart[] = [];
    const normalizedTitle = TextProcessor.normalize(title);
    searchTerms.push(normalizedTitle);

    // Try direct exact match
    const directMatch = autoCareData.pcdb.partsByName.get(normalizedTitle);
    if (directMatch) {
      const standardized = this.createStandardizedPart(
        directMatch, 
        this.config.exactConfidence, 
        'exact'
      );
      if (standardized) {
        candidates.push(standardized);
      }
    }

    // Try mapped names if enabled and no direct match
    if (candidates.length === 0 && this.config.enableMappings) {
      const mappedNames = PartsMappings.getMappedNames(normalizedTitle);
      if (mappedNames) {
        for (const mappedName of mappedNames) {
          const normalizedMapped = TextProcessor.normalize(mappedName);
          searchTerms.push(normalizedMapped);
          
          const mappedMatch = autoCareData.pcdb.partsByName.get(normalizedMapped);
          if (mappedMatch) {
            const standardized = this.createStandardizedPart(
              mappedMatch,
              this.config.mappingConfidence,
              'exact_mapped'
            );
            if (standardized) {
              candidates.push(standardized);
            }
          }
        }
      }
    }

    return candidates;
  }

  private async tryExactMatchOnDescription(
    description: string,
    autoCareData: AutoCareData,
    searchTerms: string[]
  ): Promise<StandardizedPart[]> {
    const candidates: StandardizedPart[] = [];
    
    // Extract meaningful keywords from description
    const keywords = TextProcessor.extractKeywords(description);
    searchTerms.push(...keywords);
    
    // Try to find parts by description keywords
    for (const keyword of keywords.slice(0, 3)) { // Limit to top 3 keywords
      const normalizedKeyword = TextProcessor.normalize(keyword);
      const keywordMatch = autoCareData.pcdb.partsByName.get(normalizedKeyword);
      
      if (keywordMatch) {
        const standardized = this.createStandardizedPart(
          keywordMatch,
          this.config.mappingConfidence * 0.8, // Lower confidence for keyword matches
          'exact_keyword'
        );
        if (standardized) {
          candidates.push(standardized);
        }
      }

      // Also try mapped names for keywords
      if (this.config.enableMappings) {
        const mappedNames = PartsMappings.getMappedNames(normalizedKeyword);
        if (mappedNames) {
          for (const mappedName of mappedNames) {
            const normalizedMapped = TextProcessor.normalize(mappedName);
            const mappedMatch = autoCareData.pcdb.partsByName.get(normalizedMapped);
            
            if (mappedMatch) {
              const standardized = this.createStandardizedPart(
                mappedMatch,
                this.config.mappingConfidence * 0.7,
                'exact_keyword_mapped'
              );
              if (standardized) {
                candidates.push(standardized);
                break; // Only take first mapped match per keyword
              }
            }
          }
        }
      }

      // Stop at first successful keyword match to avoid too many candidates
      if (candidates.length > 0) break;
    }

    return candidates;
  }

  private createStandardizedPart(
    pcdbPart: PCdbPart,
    confidence: number,
    matchType: string
  ): StandardizedPart | null {
    if (!pcdbPart) return null;

    return {
      partId: String(pcdbPart.PartTerminologyID),
      partNumber: pcdbPart.PartTerminologyName || '',
      brandId: undefined, // PCdbPart doesn't have BrandId
      partTypeName: '',
      partName: pcdbPart.PartTerminologyName || '',
      confidence,
      matchType,
      source: 'AutoCare_PCdb',
      attributes: {
        partTerminologyId: pcdbPart.PartTerminologyID,
        partsDescriptionId: pcdbPart.PartsDescriptionId
      }
    };
  }
}