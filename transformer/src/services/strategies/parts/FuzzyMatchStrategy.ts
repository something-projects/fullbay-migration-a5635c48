/**
 * Fuzzy Match Strategy
 * Uses similarity algorithms for approximate matching
 */

import { BaseMatchingStrategy, MatchingContext, StrategyResult } from '../IMatchingStrategy';
import { AutoCareData, StandardizedPart, PCdbPart } from '../../../types/AutoCareTypes';
import { TextProcessor } from '../../../utils/TextProcessor';

export class FuzzyMatchStrategy extends BaseMatchingStrategy {
  readonly name = 'fuzzy_match';
  readonly priority = 80;

  protected getDefaultConfig() {
    return {
      similarityThreshold: 0.7,
      maxCandidates: 5,
      minConfidence: 0.6,
      enablePartialMatching: true,
      tokenSetWeight: 0.5,
      jaccardWeight: 0.3,
      levenshteinWeight: 0.2
    };
  }

  canHandle(context: MatchingContext): boolean {
    return !!(context.title || context.description);
  }

  async match(context: MatchingContext, autoCareData: AutoCareData): Promise<StrategyResult> {
    const searchTerms: string[] = [];
    let candidates: StandardizedPart[] = [];

    // Primary search on title
    if (context.title) {
      const titleCandidates = await this.fuzzyMatchOnTitle(
        context.title,
        autoCareData,
        searchTerms
      );
      candidates.push(...titleCandidates);
    }

    // Fallback to description if no good title matches
    if (candidates.length < 2 && context.description) {
      const descCandidates = await this.fuzzyMatchOnDescription(
        context.description,
        autoCareData,
        searchTerms
      );
      candidates.push(...descCandidates);
    }

    // Sort by confidence and limit results
    candidates = candidates
      .filter(c => (c.confidence || 0) >= this.config.minConfidence)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, this.config.maxCandidates);

    const topConfidence = candidates.length > 0 ? (candidates[0].confidence || 0) : 0;

    return this.createSuccessResult(
      candidates,
      topConfidence,
      searchTerms,
      `Found ${candidates.length} fuzzy matches with threshold ${this.config.similarityThreshold}`
    );
  }

  private async fuzzyMatchOnTitle(
    title: string,
    autoCareData: AutoCareData,
    searchTerms: string[]
  ): Promise<StandardizedPart[]> {
    const candidates: StandardizedPart[] = [];
    const normalizedTitle = TextProcessor.normalize(title);
    searchTerms.push(normalizedTitle);

    // Search through all parts by name
    const partNames = Array.from(autoCareData.pcdb.partsByName.keys());
    const similarities: Array<{name: string, similarity: number}> = [];

    for (const partName of partNames) {
      const similarity = TextProcessor.calculateSimilarity(normalizedTitle, partName);
      
      if (similarity >= this.config.similarityThreshold) {
        similarities.push({ name: partName, similarity });
      }
    }

    // Sort by similarity
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Convert to standardized parts
    for (const { name, similarity } of similarities.slice(0, this.config.maxCandidates)) {
      const pcdbPart = autoCareData.pcdb.partsByName.get(name);
      if (pcdbPart) {
        const standardized = this.createStandardizedPart(
          pcdbPart,
          similarity,
          'fuzzy_title'
        );
        if (standardized) {
          candidates.push(standardized);
        }
      }
    }

    return candidates;
  }

  private async fuzzyMatchOnDescription(
    description: string,
    autoCareData: AutoCareData,
    searchTerms: string[]
  ): Promise<StandardizedPart[]> {
    const candidates: StandardizedPart[] = [];
    const descriptionKeywords = TextProcessor.extractKeywords(description);
    searchTerms.push(...descriptionKeywords);

    if (descriptionKeywords.length === 0) {
      return candidates;
    }

    // For description matching, we'll try fuzzy matching on individual keywords
    const keywordMatches: Array<{part: PCdbPart, similarity: number}> = [];

    for (const keyword of descriptionKeywords.slice(0, 5)) { // Limit keywords processed
      const normalizedKeyword = TextProcessor.normalize(keyword);
      
      // Find fuzzy matches for this keyword
      const partNames = Array.from(autoCareData.pcdb.partsByName.keys());
      
      for (const partName of partNames) {
        if (partName.includes(normalizedKeyword) || 
            TextProcessor.calculateSimilarity(normalizedKeyword, partName) >= this.config.similarityThreshold) {
          
          const similarity = TextProcessor.calculateSimilarity(normalizedKeyword, partName);
          const pcdbPart = autoCareData.pcdb.partsByName.get(partName);
          
          if (pcdbPart && similarity >= this.config.similarityThreshold) {
            keywordMatches.push({ part: pcdbPart, similarity: similarity * 0.8 }); // Reduce confidence for keyword matches
          }
        }
      }
    }

    // Sort and deduplicate by part ID
    keywordMatches.sort((a, b) => b.similarity - a.similarity);
    const seenPartIds = new Set<string>();
    
    for (const { part, similarity } of keywordMatches) {
      const partId = String(part.PartTerminologyID);
      if (!seenPartIds.has(partId) && similarity >= this.config.minConfidence) {
        const standardized = this.createStandardizedPart(
          part,
          similarity,
          'fuzzy_description'
        );
        if (standardized) {
          candidates.push(standardized);
          seenPartIds.add(partId);
        }
      }

      // Stop when we have enough candidates
      if (candidates.length >= this.config.maxCandidates) {
        break;
      }
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
      brandId: undefined,
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

  /**
   * Advanced fuzzy matching using multiple algorithms
   */
  private calculateAdvancedSimilarity(str1: string, str2: string): number {
    const tokenSet = TextProcessor.tokenSetSimilarity(str1, str2);
    const jaccard = TextProcessor.jaccardSimilarity(str1, str2);
    const levenshtein = TextProcessor.levenshteinSimilarity(str1, str2);

    return (tokenSet * this.config.tokenSetWeight) +
           (jaccard * this.config.jaccardWeight) +
           (levenshtein * this.config.levenshteinWeight);
  }
}