import { StandardizedPart } from '../types/AutoCareTypes';
import { AutoCareAggregator } from './AutoCareAggregator';
import { PartsMatcher } from './PartsMatcher';
import { InterchangeService, InterchangeQuery } from './InterchangeService';
import { AssetManager, AssetQuery } from './AssetManager';

export interface RecommendationQuery {
  partTerminologyId?: number;
  partNumber?: string;
  partDescription?: string;
  vehicleInfo?: {
    make: string;
    model: string;
    year: number;
    engine?: string;
    transmission?: string;
  };
   context?: {
    serviceType?: string;
    repairHistory?: string[];
    customerPreferences?: {
      preferredBrands?: string[];
      qualityPreference?: 'economy' | 'standard' | 'premium' | 'oem';
      priceRange?: { min: number; max: number };
    };
    urgency?: 'low' | 'medium' | 'high';
    location?: string;
  };
  filters?: {
    includeInterchanges?: boolean;
    includeAlternatives?: boolean;
    includeUpgrades?: boolean;
    maxResults?: number;
    includeAssets?: boolean;
  };
}

export interface RecommendationResult {
  originalPart?: StandardizedPart;
  recommendations: RecommendedPart[];
  alternativeOptions?: RecommendedPart[];
  upgradeOptions?: RecommendedPart[];
  reasoning: string;
  confidenceScore: number;
  queryTime: number;
}

export interface RecommendedPart extends StandardizedPart {
  recommendationType: 'exact' | 'interchange' | 'alternative' | 'upgrade';
  recommendationReason: string;
  recommendationScore: number;
  priceDifference?: number;
  availabilityStatus?: string;
  leadTime?: number;
  compatibilityNotes?: string;
  previewAsset?: {
    assetId: string;
    assetType: string;
    url: string;
  };
}

export interface RecommendationStatistics {
  totalRecommendations: number;
  acceptanceRate: number;
  byRecommendationType: { [type: string]: number };
  topRecommendedBrands: { brand: string; count: number }[];
  averageConfidenceScore: number;
}

/**
 * Part Recommendation Service
 * 
 * Provides intelligent part recommendations based on multiple factors:
 * - Part attributes and specifications
 * - Interchange compatibility
 * - Vehicle compatibility
 * - Customer preferences and repair history
 * - Availability and pricing
 */
export class PartRecommendationService {
  private aggregator: AutoCareAggregator;
  private partsMatcher: PartsMatcher;
  private interchangeService: InterchangeService;
  private assetManager?: AssetManager;
  private recommendationStats: {
    totalRecommendations: number;
    acceptedRecommendations: number;
    byType: { [type: string]: number };
    byBrand: { [brand: string]: number };
    totalConfidenceScore: number;
  };

  constructor(
    aggregator: AutoCareAggregator,
    partsMatcher: PartsMatcher,
    interchangeService: InterchangeService,
    assetManager?: AssetManager
  ) {
    this.aggregator = aggregator;
    this.partsMatcher = partsMatcher;
    this.interchangeService = interchangeService;
    this.assetManager = assetManager;
    
    this.recommendationStats = {
      totalRecommendations: 0,
      acceptedRecommendations: 0,
      byType: {},
      byBrand: {},
      totalConfidenceScore: 0
    };
  }

  /**
   * Get part recommendations based on query
   */
  async getRecommendations(query: RecommendationQuery): Promise<RecommendationResult> {
    const startTime = Date.now();
    
    try {
      // Step 1: Identify the original part
      const originalPart = await this.identifyOriginalPart(query);
      
      if (!originalPart) {
        return {
          recommendations: [],
          reasoning: 'Could not identify the original part based on the provided information.',
          confidenceScore: 0,
          queryTime: Date.now() - startTime
        };
      }

      // Step 2: Get interchange parts if requested
      const interchangeParts = query.filters?.includeInterchanges !== false
        ? await this.getInterchangeRecommendations(originalPart, query)
        : [];

      // Step 3: Get alternative parts if requested
      const alternativeParts = query.filters?.includeAlternatives !== false
        ? await this.getAlternativeRecommendations(originalPart, query)
        : [];

      // Step 4: Get upgrade options if requested
      const upgradeParts = query.filters?.includeUpgrades !== false
        ? await this.getUpgradeRecommendations(originalPart, query)
        : [];

      // Step 5: Combine and rank all recommendations
      const allRecommendations = [
        ...interchangeParts,
        ...alternativeParts,
        ...upgradeParts
      ];

      // Sort by recommendation score
      allRecommendations.sort((a, b) => b.recommendationScore - a.recommendationScore);
      
      // Apply result limit
      const maxResults = query.filters?.maxResults || 5;
      const primaryRecommendations = allRecommendations.slice(0, maxResults);
      
      // Get alternative options (next best recommendations)
      const alternativeOptions = allRecommendations
        .slice(maxResults, maxResults + 3)
        .filter(part => part.recommendationType !== 'upgrade');
      
      // Get upgrade options
      const upgradeOptions = upgradeParts.slice(0, 2);

      // Step 6: Enrich with assets if requested and available
      if (query.filters?.includeAssets && this.assetManager) {
        await this.enrichRecommendationsWithAssets(
          [...primaryRecommendations, ...alternativeOptions, ...upgradeOptions]
        );
      }

      // Calculate overall confidence score
      const confidenceScore = this.calculateOverallConfidence(primaryRecommendations);
      
      // Generate reasoning
      const reasoning = this.generateRecommendationReasoning(
        originalPart,
        primaryRecommendations,
        query
      );

      // Update statistics
      this.updateRecommendationStats(primaryRecommendations, confidenceScore);

      return {
        originalPart,
        recommendations: primaryRecommendations,
        alternativeOptions,
        upgradeOptions,
        reasoning,
        confidenceScore,
        queryTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('❌ Recommendation generation failed:', error);
      throw new Error(`Failed to generate recommendations: ${(error as Error).message}`);
    }
  }

  /**
   * Record recommendation acceptance
   */
  recordRecommendationAcceptance(
    recommendedPartId: number,
    recommendationType: string,
    accepted: boolean
  ): void {
    this.recommendationStats.totalRecommendations++;
    
    if (accepted) {
      this.recommendationStats.acceptedRecommendations++;
    }
    
    this.recommendationStats.byType[recommendationType] = 
      (this.recommendationStats.byType[recommendationType] || 0) + 1;
  }

  /**
   * Get recommendation statistics
   */
  getRecommendationStatistics(): RecommendationStatistics {
    const acceptanceRate = this.recommendationStats.totalRecommendations > 0
      ? this.recommendationStats.acceptedRecommendations / this.recommendationStats.totalRecommendations
      : 0;
    
    const averageConfidenceScore = this.recommendationStats.totalRecommendations > 0
      ? this.recommendationStats.totalConfidenceScore / this.recommendationStats.totalRecommendations
      : 0;
    
    // Get top brands
    const brandEntries = Object.entries(this.recommendationStats.byBrand);
    const topBrands = brandEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([brand, count]) => ({ brand, count }));

    return {
      totalRecommendations: this.recommendationStats.totalRecommendations,
      acceptanceRate: Math.round(acceptanceRate * 100) / 100,
      byRecommendationType: this.recommendationStats.byType,
      topRecommendedBrands: topBrands,
      averageConfidenceScore: Math.round(averageConfidenceScore * 100) / 100
    };
  }

  /**
   * Reset recommendation statistics
   */
  resetStatistics(): void {
    this.recommendationStats = {
      totalRecommendations: 0,
      acceptedRecommendations: 0,
      byType: {},
      byBrand: {},
      totalConfidenceScore: 0
    };
  }

  // Private helper methods

  private async identifyOriginalPart(query: RecommendationQuery): Promise<StandardizedPart | undefined> {
    try {
      // If part terminology ID is provided, get part directly
      if (query.partTerminologyId) {
        // Use batchMatchParts to find the part by terminology ID
        const shopParts = [{
          id: `temp_${query.partTerminologyId}`,
          name: `Part_${query.partTerminologyId}`,
          entityId: 1
        }];
        const matchResult = await this.aggregator.batchMatchParts(shopParts);
        const match = matchResult.get(`temp_${query.partTerminologyId}`);
        if (match) {
          return this.convertAutoCareMatchToStandardizedPart(match);
        }
        return undefined;
      }
      
      // If part number is provided, try exact match
      if (query.partNumber) {
        const matchResult = await this.partsMatcher.matchPart(
          query.partNumber,
          query.partDescription || ''
        );
        
        if (matchResult && matchResult.matched && matchResult.standardizedPart && (matchResult.standardizedPart.confidence || 0) > 0.7) {
          return matchResult.standardizedPart;
        }
      }
      
      // If description is provided, try description match
      if (query.partDescription) {
        const matchResult = await this.partsMatcher.matchPart(
          '',
          query.partDescription
        );
        
        if (matchResult && matchResult.matched && matchResult.standardizedPart && (matchResult.standardizedPart.confidence || 0) > 0.6) {
          return matchResult.standardizedPart;
        }
      }
      
      // If vehicle info is provided, try to find parts for that vehicle
      if (query.vehicleInfo && (query.partNumber || query.partDescription)) {
        // This would require integration with a vehicle parts catalog
        // For now, we'll return undefined
      }
      
      return undefined;
    } catch (error) {
      console.error('❌ Failed to identify original part:', error);
      return undefined;
    }
  }

  private async getInterchangeRecommendations(
    originalPart: StandardizedPart,
    query: RecommendationQuery
  ): Promise<RecommendedPart[]> {
    try {
      // Create interchange query
      const interchangeQuery: InterchangeQuery = {
        partTerminologyId: originalPart.partTerminologyId || 0,
        maxResults: 10
      };
      
      // Apply customer preferences if available
      if (query.context?.customerPreferences) {
        const prefs = query.context.customerPreferences;
        
        if (prefs.preferredBrands && prefs.preferredBrands.length > 0) {
          interchangeQuery.brandPreferences = prefs.preferredBrands;
        }
        
        if (prefs.qualityPreference) {
          interchangeQuery.qualityGrades = this.getQualityGradesForPreference(prefs.qualityPreference);
        }
      }
      
      // Get interchange parts
      const interchangeResult = await this.interchangeService.findInterchangeParts(interchangeQuery);
      
      // Convert to recommended parts
      return interchangeResult.interchangeableParts.map(part => {
        const recommendedPart: RecommendedPart = {
          partTerminologyId: 0, // InterchangePart doesn't have partTerminologyId
          partTerminologyName: part.partNumber,
          partsDescriptionId: 0, // InterchangePart doesn't have partsDescriptionId,
          descriptions: [`${part.brandName} ${part.partNumber}`],
          confidence: part.confidence,
          matchingMethod: 'exact',
          relatedParts: [],
          aliases: [],
          supersessions: [],
          attributes: [], // TODO: Extract attributes from InterchangePart
          interchangeableParts: [],
          assets: [], // TODO: Extract assets from InterchangePart
          packaging: undefined, // TODO: Extract packaging from InterchangePart
          pricing: part.pricing ? [{
            partTerminologyId: 0, // TODO: Get from actual data
            priceType: part.pricing.priceType as 'MSRP' | 'Wholesale' | 'Dealer' | 'Retail',
            price: part.pricing.price,
            currency: part.pricing.currency,
            effectiveDate: new Date().toISOString(),
            expirationDate: undefined,
            priceBreaks: []
          }] : undefined,
          availability: part.availability ? [{
              partTerminologyId: 0, // TODO: Get from actual data
              supplierId: 0, // TODO: Get from actual data
              supplierName: part.availability.supplier || 'Unknown',
              availabilityStatus: part.availability.inStock ? 'InStock' as const : 'Discontinued' as const,
              quantityOnHand: part.availability.inStock ? 100 : 0,
              leadTime: part.availability.leadTime || 0,
              lastUpdated: new Date().toISOString()
            }] : undefined,
          hazmat: undefined, // TODO: Extract hazmat data from InterchangePart
          digitalAssets: undefined, // TODO: Extract digital assets from InterchangePart

          recommendationType: 'interchange',
          recommendationReason: `${part.interchangeType || 'Direct'} interchange with Standard quality grade`,
          recommendationScore: part.confidence
        };
        
        // Add pricing information if available
        if (part.pricing && originalPart.pricing && originalPart.pricing.length > 0) {
          recommendedPart.priceDifference = part.pricing.price - originalPart.pricing[0].price;
        }
        
        // Add availability information if available
        if (part.availability) {
          recommendedPart.availabilityStatus = part.availability.inStock ? 'In Stock' : 'Out of Stock';
          recommendedPart.leadTime = part.availability.leadTime;
        }
        
        return recommendedPart;
      });
    } catch (error) {
      console.error('❌ Failed to get interchange recommendations:', error);
      return [];
    }
  }

  private async getAlternativeRecommendations(
    originalPart: StandardizedPart,
    query: RecommendationQuery
  ): Promise<RecommendedPart[]> {
    try {
      // Get alternative parts based on attributes
      const alternatives = await this.findSimilarPartsByAttributes(originalPart);
      
      // Convert to recommended parts
      return alternatives.map(part => {
        const similarityScore = this.calculateAttributeSimilarity(originalPart, part);
        
        const recommendedPart: RecommendedPart = {
          partTerminologyId: part.partTerminologyId,
          partTerminologyName: part.partTerminologyName,
          partsDescriptionId: part.partsDescriptionId,
          descriptions: part.descriptions || [],
          confidence: part.confidence,
          matchingMethod: part.matchingMethod,
          relatedParts: part.relatedParts || [],
          aliases: part.aliases || [],
          supersessions: part.supersessions || [],

          attributes: part.attributes || [],
          interchangeableParts: part.interchangeableParts || [],
          assets: part.assets || [],
          packaging: part.packaging,
          pricing: part.pricing,
          availability: part.availability,
          hazmat: part.hazmat,
          digitalAssets: part.digitalAssets,

          recommendationType: 'alternative',
          recommendationReason: `Similar specifications with ${Math.round(similarityScore * 100)}% attribute match`,
          recommendationScore: similarityScore * 0.9
        };
        
        // Calculate price difference if available
        if (part.pricing && originalPart.pricing && part.pricing.length > 0 && originalPart.pricing.length > 0) {
          recommendedPart.priceDifference = part.pricing[0].price - originalPart.pricing[0].price;
        }
        
        return recommendedPart;
      });
    } catch (error) {
      console.error('❌ Failed to get alternative recommendations:', error);
      return [];
    }
  }

  private async getUpgradeRecommendations(
    originalPart: StandardizedPart,
    query: RecommendationQuery
  ): Promise<RecommendedPart[]> {
    try {
      // Get upgrade parts (premium versions of the same part)
      const upgrades = await this.findUpgradeParts(originalPart);
      
      // Convert to recommended parts
      return upgrades.map(part => {
        const upgradeScore = this.calculateUpgradeValue(originalPart, part);
        
        const recommendedPart: RecommendedPart = {
          partTerminologyId: part.partTerminologyId,
          partTerminologyName: part.partTerminologyName,
          partsDescriptionId: part.partsDescriptionId,
          descriptions: part.descriptions || [],
          confidence: part.confidence,
          matchingMethod: part.matchingMethod,
          relatedParts: part.relatedParts || [],
          aliases: part.aliases || [],
          supersessions: part.supersessions || [],

          attributes: part.attributes || [],
          interchangeableParts: part.interchangeableParts || [],
          assets: part.assets || [],
          packaging: part.packaging,
          pricing: part.pricing,
          availability: part.availability,
          hazmat: part.hazmat,
          digitalAssets: part.digitalAssets,
          // brandName removed - not part of RecommendedPart interface
          // qualityGrade: 'Standard', // TODO: Extract from part data or attributes - removed as not part of RecommendedPart interface
          recommendationType: 'upgrade',
          recommendationReason: `Premium upgrade with improved specifications`,
          recommendationScore: upgradeScore * 0.85
        };
        
        // Calculate price difference if available
        if (part.pricing && originalPart.pricing && part.pricing.length > 0 && originalPart.pricing.length > 0) {
          recommendedPart.priceDifference = part.pricing[0].price - originalPart.pricing[0].price;
        }
        
        return recommendedPart;
      });
    } catch (error) {
      console.error('❌ Failed to get upgrade recommendations:', error);
      return [];
    }
  }

  private async findSimilarPartsByAttributes(part: StandardizedPart): Promise<StandardizedPart[]> {
    // This is a placeholder for actual implementation
    // In a real implementation, you would query the database for parts with similar attributes
    return [];
  }

  private async findUpgradeParts(part: StandardizedPart): Promise<StandardizedPart[]> {
    // This is a placeholder for actual implementation
    // In a real implementation, you would query the database for premium versions of the same part
    return [];
  }

  private calculateAttributeSimilarity(part1: StandardizedPart, part2: StandardizedPart): number {
    if (!part1.attributes || !part2.attributes || 
        part1.attributes.length === 0 || part2.attributes.length === 0) {
      return 0.5; // Default similarity if attributes are not available
    }
    
    // Count matching attributes
    let matchingAttributes = 0;
    let totalAttributes = 0;
    
    for (const attr1 of part1.attributes) {
      totalAttributes++;
      
      const matchingAttr = part2.attributes.find((attr2: any) => 
        attr2.attributeName === attr1.attributeName && attr2.attributeValue === attr1.attributeValue
      );
      
      if (matchingAttr) {
        matchingAttributes++;
      }
    }
    
    return totalAttributes > 0 ? matchingAttributes / totalAttributes : 0.5;
  }

  private calculateUpgradeValue(originalPart: StandardizedPart, upgradePart: StandardizedPart): number {
    // This is a simplified calculation
    // In a real implementation, you would compare specific attributes to determine upgrade value
    
    // Start with a base score
    let upgradeScore = 0.7;
    
    // Boost score if the upgrade has more attributes
    if (upgradePart.attributes && originalPart.attributes) {
      if (upgradePart.attributes.length > originalPart.attributes.length) {
        upgradeScore += 0.1;
      }
    }
    
    // Boost score if the upgrade has a higher quality grade
    const qualityGrades = ['Economy', 'Standard', 'Premium', 'OES', 'OEM'];
    const originalQuality = 'Standard'; // TODO: Extract from part data or attributes
    const upgradeQuality = 'Standard'; // TODO: Extract from part data or attributes
    
    const originalIndex = qualityGrades.indexOf(originalQuality);
    const upgradeIndex = qualityGrades.indexOf(upgradeQuality);
    
    if (upgradeIndex > originalIndex) {
      upgradeScore += 0.1 * (upgradeIndex - originalIndex);
    }
    
    return Math.min(1.0, upgradeScore);
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

  private async enrichRecommendationsWithAssets(recommendations: RecommendedPart[]): Promise<void> {
    if (!this.assetManager) return;
    
    for (const part of recommendations) {
      try {
        const assetQuery: AssetQuery = {
          partTerminologyId: part.partTerminologyId || 0,
          assetTypes: ['Image'],
          maxResults: 1
        };
        
        const assetResult = await this.assetManager.getPartAssets(assetQuery);
        
        if (assetResult.assets.length > 0) {
          const asset = assetResult.assets[0];
          part.previewAsset = {
            assetId: asset.assetId,
            assetType: asset.assetType,
            url: asset.url
          };
        }
      } catch (error) {
        // Continue without asset enrichment if it fails
      }
    }
  }

  private calculateOverallConfidence(recommendations: RecommendedPart[]): number {
    if (recommendations.length === 0) return 0;
    
    const totalScore = recommendations.reduce((sum, part) => sum + part.recommendationScore, 0);
    return Math.round((totalScore / recommendations.length) * 100) / 100;
  }

  private generateRecommendationReasoning(
    originalPart: StandardizedPart,
    recommendations: RecommendedPart[],
    query: RecommendationQuery
  ): string {
    if (recommendations.length === 0) {
      return 'No suitable recommendations found for this part.';
    }
    
    let reasoning = `Found ${recommendations.length} recommended parts for ${originalPart.partTerminologyName || 'the requested part'}.`;
    
    // Add context-specific reasoning
    if (query.context) {
      if (query.context.urgency === 'high') {
        reasoning += ' Prioritized parts with immediate availability due to high urgency.';
      }
      
      if (query.context.customerPreferences?.qualityPreference) {
        reasoning += ` Focused on ${query.context.customerPreferences.qualityPreference} quality parts based on customer preference.`;
      }
      
      if (query.context.customerPreferences?.preferredBrands?.length) {
        reasoning += ` Prioritized preferred brands: ${query.context.customerPreferences.preferredBrands.join(', ')}.`;
      }
    }
    
    // Add recommendation type breakdown
    const interchangeCount = recommendations.filter(p => p.recommendationType === 'interchange').length;
    const alternativeCount = recommendations.filter(p => p.recommendationType === 'alternative').length;
    const upgradeCount = recommendations.filter(p => p.recommendationType === 'upgrade').length;
    
    if (interchangeCount > 0) {
      reasoning += ` Includes ${interchangeCount} direct interchange part${interchangeCount > 1 ? 's' : ''}.`;
    }
    
    if (alternativeCount > 0) {
      reasoning += ` Includes ${alternativeCount} alternative part${alternativeCount > 1 ? 's' : ''} with similar specifications.`;
    }
    
    if (upgradeCount > 0) {
      reasoning += ` Includes ${upgradeCount} premium upgrade option${upgradeCount > 1 ? 's' : ''}.`;
    }
    
    return reasoning;
  }

  private updateRecommendationStats(recommendations: RecommendedPart[], confidenceScore: number): void {
    this.recommendationStats.totalRecommendations += recommendations.length;
    this.recommendationStats.totalConfidenceScore += confidenceScore * recommendations.length;
    
    for (const part of recommendations) {
      // Count by recommendation type
      this.recommendationStats.byType[part.recommendationType] = 
        (this.recommendationStats.byType[part.recommendationType] || 0) + 1;
      
      // Count by brand
      const brandName = 'Unknown'; // TODO: Extract from part data or attributes
      this.recommendationStats.byBrand[brandName] = 
        (this.recommendationStats.byBrand[brandName] || 0) + 1;
    }
  }

  private convertAutoCareMatchToStandardizedPart(match: any): StandardizedPart {
    return {
      partTerminologyId: match.partTerminologyId,
      partTerminologyName: match.partTerminologyName,
      partsDescriptionId: match.partsDescriptionId,
      descriptions: match.descriptions || [],
      confidence: match.confidence,
      matchingMethod: match.matchingMethod,
      relatedParts: match.relatedParts || [],
      aliases: match.aliases || [],
      supersessions: match.supersessions || [],
      attributes: match.attributes || [],
      interchangeableParts: match.interchangeableParts || [],
      assets: match.assets || [],
      category: match.category,
      technicalSpecifications: match.technicalSpecifications,
      packaging: match.packaging,
      pricing: match.pricing,
      availability: match.availability,
      hazmat: match.hazmat,
      digitalAssets: match.digitalAssets
    };
  }
}