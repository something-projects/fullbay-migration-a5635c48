import { PartInterchange, StandardizedPart } from '../types/AutoCareTypes';
import { AutoCareAggregator } from './AutoCareAggregator';

export interface InterchangeQuery {
  partTerminologyId: number;
  qualityGrades?: ('OEM' | 'OES' | 'Premium' | 'Standard' | 'Economy')[];
  interchangeTypes?: ('Direct' | 'Functional' | 'Form-Fit-Function')[];
  brandPreferences?: string[];
  maxResults?: number;
}

export interface InterchangeResult {
  originalPart: {
    partTerminologyId: number;
    partTerminologyName: string;
  };
  interchangeableParts: InterchangePart[];
  totalFound: number;
  queryTime: number;
}

export interface InterchangePart {
  partNumber: string;
  brandId: number;
  brandName: string;
  qualityGrade: 'OEM' | 'OES' | 'Premium' | 'Standard' | 'Economy';
  interchangeType: 'Direct' | 'Functional' | 'Form-Fit-Function';
  confidence: number; // 0-1 based on quality grade and type
  notes?: string;
  availability?: {
    inStock: boolean;
    leadTime?: number;
    supplier?: string;
  };
  pricing?: {
    price: number;
    currency: string;
    priceType: string;
  };
}

export interface InterchangeRecommendation {
  recommendedParts: InterchangePart[];
  reasoning: string;
  confidenceScore: number;
  alternativeOptions: InterchangePart[];
}

/**
 * Interchange Service
 * 
 * Provides intelligent part interchange and substitution recommendations
 * using AutoCare PIES interchange data
 */
export class InterchangeService {
  private aggregator: AutoCareAggregator;
  private qualityGradeWeights: { [key: string]: number } = {
    'OEM': 1.0,
    'OES': 0.95,
    'Premium': 0.9,
    'Standard': 0.8,
    'Economy': 0.7
  };
  
  private interchangeTypeWeights: { [key: string]: number } = {
    'Direct': 1.0,
    'Functional': 0.9,
    'Form-Fit-Function': 0.85
  };

  constructor(aggregator: AutoCareAggregator) {
    this.aggregator = aggregator;
  }

  /**
   * Find interchange parts for a given part
   */
  async findInterchangeParts(query: InterchangeQuery): Promise<InterchangeResult> {
    const startTime = Date.now();
    
    try {
      // Get interchange data from aggregator
      const interchangeData = await this.aggregator.getInterchangeParts(query.partTerminologyId);
      
      if (interchangeData.length === 0) {
        return {
          originalPart: {
            partTerminologyId: query.partTerminologyId,
            partTerminologyName: 'Unknown'
          },
          interchangeableParts: [],
          totalFound: 0,
          queryTime: Date.now() - startTime
        };
      }

      // Filter and process interchange parts
      let filteredParts = this.filterInterchangeParts(interchangeData, query);
      
      // Calculate confidence scores
      const processedParts = await this.processInterchangeParts(filteredParts);
      
      // Sort by confidence and apply result limit
      processedParts.sort((a, b) => b.confidence - a.confidence);
      
      const maxResults = query.maxResults || 20;
      const resultParts = processedParts.slice(0, maxResults);

      return {
        originalPart: {
          partTerminologyId: query.partTerminologyId,
          partTerminologyName: interchangeData[0]?.partTerminologyName || 'Unknown'
        },
        interchangeableParts: resultParts,
        totalFound: processedParts.length,
        queryTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('❌ Interchange query failed:', error);
      throw new Error(`Failed to find interchange parts: ${(error as Error).message}`);
    }
  }

  /**
   * Get intelligent interchange recommendations
   */
  async getRecommendations(
    partTerminologyId: number,
    context?: {
      vehicleInfo?: { make: string; model: string; year: number };
      budgetRange?: { min: number; max: number };
      urgency?: 'low' | 'medium' | 'high';
      qualityPreference?: 'economy' | 'standard' | 'premium' | 'oem';
    }
  ): Promise<InterchangeRecommendation> {
    const query: InterchangeQuery = {
      partTerminologyId,
      maxResults: 10
    };

    // Adjust query based on context
    if (context?.qualityPreference) {
      query.qualityGrades = this.getQualityGradesForPreference(context.qualityPreference);
    }

    const result = await this.findInterchangeParts(query);
    
    if (result.interchangeableParts.length === 0) {
      return {
        recommendedParts: [],
        reasoning: 'No interchange parts found for this component.',
        confidenceScore: 0,
        alternativeOptions: []
      };
    }

    // Apply intelligent filtering based on context
    const { recommended, alternatives, reasoning } = this.applyIntelligentFiltering(
      result.interchangeableParts,
      context
    );

    const confidenceScore = this.calculateOverallConfidence(recommended);

    return {
      recommendedParts: recommended,
      reasoning,
      confidenceScore,
      alternativeOptions: alternatives
    };
  }

  /**
   * Check if two parts are interchangeable
   */
  async arePartsInterchangeable(
    partId1: number,
    partId2: number
  ): Promise<{ interchangeable: boolean; confidence: number; details?: string }> {
    try {
      // Check direct interchange relationship
      const interchange1 = await this.aggregator.getInterchangeParts(partId1);
      const interchange2 = await this.aggregator.getInterchangeParts(partId2);

      // Check if partId2 is in partId1's interchange list
      const directMatch1 = interchange1.find(part => 
        part.partTerminologyId === partId2
      );

      // Check if partId1 is in partId2's interchange list
      const directMatch2 = interchange2.find(part => 
        part.partTerminologyId === partId1
      );

      if (directMatch1 || directMatch2) {
        const match = directMatch1 || directMatch2;
        const confidence = this.calculateInterchangeConfidence(match!);
        
        return {
          interchangeable: true,
          confidence,
          details: `${match!.interchangeType} interchange with ${match!.qualityGrade} quality grade`
        };
      }

      // Check for indirect interchange (both parts interchange with a common part)
      const commonInterchanges = this.findCommonInterchanges(interchange1, interchange2);
      
      if (commonInterchanges.length > 0) {
        const bestCommon = commonInterchanges[0];
        const confidence = this.calculateInterchangeConfidence(bestCommon) * 0.8; // Reduce confidence for indirect
        
        return {
          interchangeable: true,
          confidence,
          details: `Indirect interchange through common part ${bestCommon.partNumber}`
        };
      }

      return {
        interchangeable: false,
        confidence: 0,
        details: 'No interchange relationship found'
      };
    } catch (error) {
      console.error('❌ Interchange check failed:', error);
      return {
        interchangeable: false,
        confidence: 0,
        details: `Error checking interchange: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get interchange statistics for a part
   */
  async getInterchangeStatistics(partTerminologyId: number): Promise<{
    totalInterchanges: number;
    byQualityGrade: { [grade: string]: number };
    byInterchangeType: { [type: string]: number };
    byBrand: { [brand: string]: number };
    averageConfidence: number;
  }> {
    const interchangeData = await this.aggregator.getInterchangeParts(partTerminologyId);
    
    const stats = {
      totalInterchanges: interchangeData.length,
      byQualityGrade: {} as { [grade: string]: number },
      byInterchangeType: {} as { [type: string]: number },
      byBrand: {} as { [brand: string]: number },
      averageConfidence: 0
    };

    let totalConfidence = 0;

    for (const part of interchangeData) {
      // Count by quality grade
      stats.byQualityGrade[part.qualityGrade] = 
        (stats.byQualityGrade[part.qualityGrade] || 0) + 1;
      
      // Count by interchange type
      stats.byInterchangeType[part.interchangeType] = 
        (stats.byInterchangeType[part.interchangeType] || 0) + 1;
      
      // Count by brand
      stats.byBrand[part.brandName] = 
        (stats.byBrand[part.brandName] || 0) + 1;
      
      // Calculate confidence
      const confidence = this.calculateInterchangeConfidence(part);
      totalConfidence += confidence;
    }

    stats.averageConfidence = interchangeData.length > 0 
      ? totalConfidence / interchangeData.length 
      : 0;

    return stats;
  }

  // Private helper methods

  private filterInterchangeParts(
    interchangeData: any[],
    query: InterchangeQuery
  ): any[] {
    let filtered = interchangeData;

    // Filter by quality grades
    if (query.qualityGrades && query.qualityGrades.length > 0) {
      filtered = filtered.filter(part => 
        query.qualityGrades!.includes(part.qualityGrade)
      );
    }

    // Filter by interchange types
    if (query.interchangeTypes && query.interchangeTypes.length > 0) {
      filtered = filtered.filter(part => 
        query.interchangeTypes!.includes(part.interchangeType)
      );
    }

    // Filter by brand preferences
    if (query.brandPreferences && query.brandPreferences.length > 0) {
      filtered = filtered.filter(part => 
        query.brandPreferences!.some(brand => 
          part.brandName.toLowerCase().includes(brand.toLowerCase())
        )
      );
    }

    return filtered;
  }

  private async processInterchangeParts(interchangeData: any[]): Promise<InterchangePart[]> {
    const processedParts: InterchangePart[] = [];

    for (const part of interchangeData) {
      const confidence = this.calculateInterchangeConfidence(part);
      
      const interchangePart: InterchangePart = {
        partNumber: part.interchangePartNumber,
        brandId: part.brandId,
        brandName: part.brandName,
        qualityGrade: part.qualityGrade,
        interchangeType: part.interchangeType,
        confidence,
        notes: part.notes
      };

      // Note: Availability and pricing data enrichment is not currently available
      // These features would require additional data sources or API integrations

      processedParts.push(interchangePart);
    }

    return processedParts;
  }

  private calculateInterchangeConfidence(part: any): number {
    const qualityWeight = this.qualityGradeWeights[part.qualityGrade] || 0.5;
    const typeWeight = this.interchangeTypeWeights[part.interchangeType] || 0.5;
    
    // Base confidence from quality and type
    let confidence = (qualityWeight + typeWeight) / 2;
    
    // Boost confidence for OEM parts
    if (part.qualityGrade === 'OEM') {
      confidence = Math.min(1.0, confidence + 0.1);
    }
    
    // Boost confidence for direct interchange
    if (part.interchangeType === 'Direct') {
      confidence = Math.min(1.0, confidence + 0.05);
    }
    
    return Math.round(confidence * 100) / 100;
  }

  private getQualityGradesForPreference(preference: string): ('OEM' | 'OES' | 'Premium' | 'Standard' | 'Economy')[] {
    switch (preference) {
      case 'oem':
        return ['OEM', 'OES'];
      case 'premium':
        return ['OEM', 'OES', 'Premium'];
      case 'standard':
        return ['Premium', 'Standard'];
      case 'economy':
        return ['Standard', 'Economy'];
      default:
        return ['OEM', 'OES', 'Premium', 'Standard', 'Economy'];
    }
  }

  private applyIntelligentFiltering(
    parts: InterchangePart[],
    context?: any
  ): { recommended: InterchangePart[]; alternatives: InterchangePart[]; reasoning: string } {
    let recommended = [...parts];
    let reasoning = 'Showing all available interchange parts.';

    // Apply budget filtering
    if (context?.budgetRange) {
      const budgetFiltered = recommended.filter(part => 
        !part.pricing || 
        (part.pricing.price >= context.budgetRange.min && 
         part.pricing.price <= context.budgetRange.max)
      );
      
      if (budgetFiltered.length > 0) {
        recommended = budgetFiltered;
        reasoning = `Filtered to ${budgetFiltered.length} parts within budget range.`;
      }
    }

    // Apply urgency filtering
    if (context?.urgency === 'high') {
      const inStockParts = recommended.filter(part => 
        part.availability?.inStock || !part.availability
      );
      
      if (inStockParts.length > 0) {
        recommended = inStockParts;
        reasoning += ' Prioritized in-stock parts for urgent needs.';
      }
    }

    // Take top recommendations and alternatives
    const topRecommended = recommended.slice(0, 3);
    const alternatives = recommended.slice(3, 8);

    return { recommended: topRecommended, alternatives, reasoning };
  }

  private calculateOverallConfidence(parts: InterchangePart[]): number {
    if (parts.length === 0) return 0;
    
    const totalConfidence = parts.reduce((sum, part) => sum + part.confidence, 0);
    return Math.round((totalConfidence / parts.length) * 100) / 100;
  }

  private findCommonInterchanges(interchange1: any[], interchange2: any[]): any[] {
    const common: any[] = [];
    
    for (const part1 of interchange1) {
      for (const part2 of interchange2) {
        if (part1.interchangePartNumber === part2.interchangePartNumber) {
          common.push(part1);
        }
      }
    }
    
    return common.sort((a, b) => 
      this.calculateInterchangeConfidence(b) - this.calculateInterchangeConfidence(a)
    );
  }
}