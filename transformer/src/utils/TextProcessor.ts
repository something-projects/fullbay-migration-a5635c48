/**
 * Text processing utilities for AutoCare matching
 * Provides common text normalization, similarity calculation, and keyword extraction
 */

export class TextProcessor {
  // Common abbreviations and their full forms
  private static readonly ABBREVIATION_MAP = new Map<string, string>([
    // Common automotive abbreviations
    ['auto', 'automatic'],
    ['man', 'manual'],
    ['trans', 'transmission'],
    ['eng', 'engine'],
    ['cyl', 'cylinder'],
    ['turbo', 'turbocharged'],
    ['supercharged', 'supercharged'],
    ['awd', 'all wheel drive'],
    ['4wd', 'four wheel drive'],
    ['fwd', 'front wheel drive'],
    ['rwd', 'rear wheel drive'],
    
    // Measurement units
    ['l', 'liter'],
    ['cc', 'cubic centimeter'],
    ['hp', 'horsepower'],
    ['kw', 'kilowatt'],
    ['rpm', 'revolutions per minute'],
    
    // Common parts abbreviations
    ['a/c', 'air conditioning'],
    ['ac', 'air conditioning'],
    ['alt', 'alternator'],
    ['batt', 'battery'],
    ['cat', 'catalytic converter'],
    ['cv', 'constant velocity'],
    ['ecu', 'engine control unit'],
    ['egr', 'exhaust gas recirculation'],
    ['map', 'manifold absolute pressure'],
    ['o2', 'oxygen'],
    ['pcv', 'positive crankcase ventilation'],
    ['tps', 'throttle position sensor'],
    ['vvt', 'variable valve timing']
  ]);

  /**
   * Normalize text for matching - comprehensive cleaning and standardization
   */
  static normalize(text: string): string {
    if (!text || typeof text !== 'string') return '';
    
    let normalized = text.toLowerCase().trim();
    
    // Remove common prefixes/suffixes that don't affect matching
    normalized = normalized.replace(/^(oem|oe|aftermarket|genuine|original)\s+/gi, '');
    normalized = normalized.replace(/\s+(oem|oe|aftermarket|genuine|original)$/gi, '');
    
    // Remove brackets and their contents (often brand/part numbers)
    normalized = normalized.replace(/\([^)]*\)/g, '');
    normalized = normalized.replace(/\[[^\]]*\]/g, '');
    normalized = normalized.replace(/\{[^}]*\}/g, '');
    
    // Remove special characters except hyphens and underscores
    normalized = normalized.replace(/[^\w\s-]/g, ' ');
    
    // Normalize hyphens and underscores to spaces
    normalized = normalized.replace(/[-_]+/g, ' ');
    
    // Expand common abbreviations
    for (const [abbrev, full] of this.ABBREVIATION_MAP) {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      normalized = normalized.replace(regex, full);
    }
    
    // Remove extra whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  /**
   * Extract meaningful keywords from text
   */
  static extractKeywords(text: string): string[] {
    if (!text || typeof text !== 'string') return [];
    
    const normalized = this.normalize(text);
    const words = normalized.split(/\s+/).filter(word => word.length > 0);
    
    // Filter out common stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'among', 'within',
      'without', 'along', 'following', 'across', 'behind', 'beyond', 'plus',
      'except', 'since', 'until', 'upon', 'within', 'onto', 'per'
    ]);
    
    const keywords = words.filter(word => 
      word.length > 2 && !stopWords.has(word.toLowerCase())
    );
    
    // Remove duplicates while preserving order
    return [...new Set(keywords)];
  }

  /**
   * Calculate similarity between two strings using combination of methods
   */
  static calculateSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    
    const norm1 = this.normalize(str1);
    const norm2 = this.normalize(str2);
    
    if (norm1 === norm2) return 1;
    
    // Combine multiple similarity metrics
    const levenshtein = this.levenshteinSimilarity(norm1, norm2);
    const jaccard = this.jaccardSimilarity(norm1, norm2);
    const tokenSet = this.tokenSetSimilarity(norm1, norm2);
    
    // Weighted average - token set is most important for automotive parts
    return (tokenSet * 0.5) + (jaccard * 0.3) + (levenshtein * 0.2);
  }

  /**
   * Levenshtein distance based similarity
   */
  static levenshteinSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : 1 - (distance / maxLength);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Jaccard similarity based on character bigrams
   */
  static jaccardSimilarity(str1: string, str2: string): number {
    const bigrams1 = this.getBigrams(str1);
    const bigrams2 = this.getBigrams(str2);
    
    const intersection = new Set([...bigrams1].filter(x => bigrams2.has(x)));
    const union = new Set([...bigrams1, ...bigrams2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Token set similarity - best for automotive part names
   */
  static tokenSetSimilarity(str1: string, str2: string): number {
    const tokens1 = new Set(str1.split(/\s+/).filter(t => t.length > 0));
    const tokens2 = new Set(str2.split(/\s+/).filter(t => t.length > 0));
    
    if (tokens1.size === 0 && tokens2.size === 0) return 1;
    if (tokens1.size === 0 || tokens2.size === 0) return 0;
    
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return intersection.size / union.size;
  }

  /**
   * Generate character bigrams for a string
   */
  private static getBigrams(str: string): Set<string> {
    const bigrams = new Set<string>();
    const padded = ' ' + str + ' ';
    
    for (let i = 0; i < padded.length - 1; i++) {
      bigrams.add(padded.slice(i, i + 2));
    }
    
    return bigrams;
  }

  /**
   * Check if text contains all required keywords
   */
  static containsAllKeywords(text: string, keywords: string[]): boolean {
    if (!keywords || keywords.length === 0) return true;
    
    const normalized = this.normalize(text);
    const textKeywords = this.extractKeywords(normalized);
    const textKeywordsSet = new Set(textKeywords);
    
    return keywords.every(keyword => 
      textKeywordsSet.has(this.normalize(keyword))
    );
  }

  /**
   * Find the best matching text from an array
   */
  static findBestMatch(
    target: string, 
    candidates: string[], 
    minSimilarity: number = 0.7
  ): { text: string; similarity: number } | null {
    let bestMatch: { text: string; similarity: number } | null = null;
    
    for (const candidate of candidates) {
      const similarity = this.calculateSimilarity(target, candidate);
      
      if (similarity >= minSimilarity && 
          (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { text: candidate, similarity };
      }
    }
    
    return bestMatch;
  }

  /**
   * Tokenize text into meaningful units
   */
  static tokenize(text: string): string[] {
    const normalized = this.normalize(text);
    return normalized.split(/\s+/).filter(token => token.length > 0);
  }

  /**
   * Check if one text is a subset of another (for partial matching)
   */
  static isSubset(subset: string, superset: string): boolean {
    const subsetTokens = new Set(this.tokenize(subset));
    const supersetTokens = new Set(this.tokenize(superset));
    
    return [...subsetTokens].every(token => supersetTokens.has(token));
  }

  /**
   * Extract numeric values from text
   */
  static extractNumbers(text: string): number[] {
    const matches = text.match(/\d+(?:\.\d+)?/g);
    return matches ? matches.map(Number).filter(n => !isNaN(n)) : [];
  }

  /**
   * Clean part number - remove common formatting
   */
  static cleanPartNumber(partNumber: string): string {
    if (!partNumber) return '';
    
    return partNumber
      .replace(/[-\s_\.]/g, '')
      .toUpperCase()
      .trim();
  }
}