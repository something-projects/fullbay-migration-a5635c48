/**
 * Keyword Match Strategy
 * Matches based on important automotive keywords and their weights
 */

import { BaseMatchingStrategy, MatchingContext, StrategyResult } from '../IMatchingStrategy';
import { AutoCareData, StandardizedPart, PCdbPart } from '../../../types/AutoCareTypes';
import { TextProcessor } from '../../../utils/TextProcessor';

export class KeywordMatchStrategy extends BaseMatchingStrategy {
  readonly name = 'keyword_match';
  readonly priority = 60;

  private keywordWeights = new Map<string, number>([
    // High priority automotive parts
    ['brake', 1.0],
    ['engine', 1.0],
    ['transmission', 1.0],
    ['oil', 0.9],
    ['filter', 0.9],
    ['clutch', 0.9],
    ['battery', 0.9],
    ['alternator', 0.9],
    ['starter', 0.9],
    
    // Medium priority
    ['belt', 0.8],
    ['hose', 0.8],
    ['gasket', 0.8],
    ['seal', 0.8],
    ['bearing', 0.8],
    ['pump', 0.8],
    ['sensor', 0.8],
    ['valve', 0.8],
    
    // Lower priority
    ['kit', 0.6],
    ['assembly', 0.7],
    ['housing', 0.6],
    ['mount', 0.6],
    ['bracket', 0.6],
    ['clamp', 0.5],
    ['screw', 0.4],
    ['bolt', 0.4],
    ['washer', 0.3],
    ['nut', 0.3]
  ]);

  protected getDefaultConfig() {
    return {
      minKeywordWeight: 0.5,
      maxKeywords: 10,
      keywordBoostFactor: 1.2,
      baseConfidence: 0.6,
      requireMultipleKeywords: false,
      minTotalScore: 0.8
    };
  }

  canHandle(context: MatchingContext): boolean {
    if (!context.title && !context.description) return false;
    
    const text = `${context.title || ''} ${context.description || ''}`.toLowerCase();
    const keywords = this.extractWeightedKeywords(text);
    
    return keywords.length > 0;
  }

  async match(context: MatchingContext, autoCareData: AutoCareData): Promise<StrategyResult> {
    const searchTerms: string[] = [];
    const candidates: StandardizedPart[] = [];

    const text = `${context.title || ''} ${context.description || ''}`;
    const weightedKeywords = this.extractWeightedKeywords(text);
    
    if (weightedKeywords.length === 0) {
      return this.createFailureResult(searchTerms, 'No weighted keywords found');
    }

    // Add keywords to search terms
    searchTerms.push(...weightedKeywords.map(k => k.keyword));

    // Search for parts containing these keywords
    const keywordMatches = await this.findKeywordMatches(
      weightedKeywords,
      autoCareData,
      searchTerms
    );

    // Score and rank matches
    for (const match of keywordMatches) {
      const score = this.calculateKeywordScore(weightedKeywords, match.partName, match.description);
      
      if (score >= this.config.minTotalScore) {
        const confidence = Math.min(
          this.config.baseConfidence + (score * 0.3),
          0.95
        );
        
        const standardized = this.createStandardizedPart(
          match.part,
          confidence,
          'keyword'
        );
        
        if (standardized) {
          standardized.attributes = {
            ...standardized.attributes,
            keywordScore: score,
            matchedKeywords: this.getMatchedKeywords(weightedKeywords, match.partName, match.description)
          } as any;
          candidates.push(standardized);
        }
      }
    }

    // Sort by confidence
    candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    const topConfidence = candidates.length > 0 ? (candidates[0].confidence || 0) : 0;

    return this.createSuccessResult(
      candidates.slice(0, 10), // Limit to top 10
      topConfidence,
      searchTerms,
      `Found ${candidates.length} keyword matches using ${weightedKeywords.length} keywords`
    );
  }

  private extractWeightedKeywords(text: string): Array<{keyword: string, weight: number}> {
    const keywords = TextProcessor.extractKeywords(text);
    const weighted: Array<{keyword: string, weight: number}> = [];

    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      
      // Direct keyword match
      if (this.keywordWeights.has(normalizedKeyword)) {
        const weight = this.keywordWeights.get(normalizedKeyword)!;
        if (weight >= this.config.minKeywordWeight) {
          weighted.push({ keyword: normalizedKeyword, weight });
        }
      } else {
        // Partial keyword matching (e.g., "braking" matches "brake")
        for (const [keywordPattern, weight] of this.keywordWeights) {
          if (weight >= this.config.minKeywordWeight &&
              (normalizedKeyword.includes(keywordPattern) || keywordPattern.includes(normalizedKeyword))) {
            weighted.push({ keyword: normalizedKeyword, weight: weight * 0.8 }); // Reduced weight for partial
            break;
          }
        }
      }
    }

    // Sort by weight and limit
    return weighted
      .sort((a, b) => b.weight - a.weight)
      .slice(0, this.config.maxKeywords);
  }

  private async findKeywordMatches(
    weightedKeywords: Array<{keyword: string, weight: number}>,
    autoCareData: AutoCareData,
    searchTerms: string[]
  ): Promise<Array<{part: PCdbPart, partName: string, description?: string}>> {
    const matches: Array<{part: PCdbPart, partName: string, description?: string}> = [];
    const processedParts = new Set<string>();

    // Search through parts by name first
    for (const partName of autoCareData.pcdb.partsByName.keys()) {
      const part = autoCareData.pcdb.partsByName.get(partName);
      if (!part || processedParts.has(String(part.PartTerminologyID))) continue;

      const containsKeywords = this.containsAnyKeyword(
        partName, 
        weightedKeywords.map(k => k.keyword)
      );

      if (containsKeywords) {
        matches.push({
          part,
          partName,
          description: part.PartTerminologyName
        });
        processedParts.add(String(part.PartTerminologyID));
      }
    }

    // Also search through part descriptions if available
    for (const [descKey, parts] of autoCareData.pcdb.partsByDescription) {
      // partsByDescription maps to array of parts, so we need to handle array
      const partsArray = Array.isArray(parts) ? parts : [parts];
      for (const part of partsArray) {
        if (processedParts.has(String(part.PartTerminologyID))) continue;

        const containsKeywords = this.containsAnyKeyword(
          descKey,
          weightedKeywords.map(k => k.keyword)
        );

        if (containsKeywords) {
          matches.push({
            part,
            partName: part.PartTerminologyName || '',
            description: descKey
          });
          processedParts.add(String(part.PartTerminologyID));
        }
      }
    }

    return matches;
  }

  private containsAnyKeyword(text: string, keywords: string[]): boolean {
    const normalizedText = text.toLowerCase();
    return keywords.some(keyword => normalizedText.includes(keyword));
  }

  private calculateKeywordScore(
    weightedKeywords: Array<{keyword: string, weight: number}>,
    partName: string,
    description?: string
  ): number {
    const text = `${partName} ${description || ''}`.toLowerCase();
    let totalScore = 0;
    let matchedKeywords = 0;

    for (const { keyword, weight } of weightedKeywords) {
      if (text.includes(keyword)) {
        totalScore += weight;
        matchedKeywords++;
      }
    }

    // Normalize score and apply boost for multiple keywords
    const normalizedScore = totalScore / Math.max(weightedKeywords.length, 1);
    const multiKeywordBoost = matchedKeywords > 1 ? this.config.keywordBoostFactor : 1.0;

    return normalizedScore * multiKeywordBoost;
  }

  private getMatchedKeywords(
    weightedKeywords: Array<{keyword: string, weight: number}>,
    partName: string,
    description?: string
  ): string[] {
    const text = `${partName} ${description || ''}`.toLowerCase();
    return weightedKeywords
      .filter(({ keyword }) => text.includes(keyword))
      .map(({ keyword }) => keyword);
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
}