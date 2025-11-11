/**
 * Generic Parts Pattern Matcher
 * 
 * Implements the "Fullbay Generic Parts" strategy from the October 1st meeting.
 * Uses AI/regex to identify common parts that don't need exact PIES matches.
 * 
 * Key Quote from Steve:
 * "If we find stuff that is named a certain way that imply a certain type of part,
 *  we can auto-guess at it... we should be able to say something that says something 
 *  like, hey, if you see 15W30, that's a 15W30 oil part."
 */

export interface GenericPart {
  fullbayPartId: string;
  category: 'oil' | 'filter' | 'fluid' | 'supply' | 'tire' | 'grease' | 'other';
  displayName: string;
  confidence: number;
  matchedPattern: string;
  originalDescription: string;
}

export interface GenericPartPattern {
  name: string;
  category: GenericPart['category'];
  regex: RegExp;
  displayNameBuilder: (match: RegExpMatchArray, original: string) => string;
  confidence: number;
  priority: number; // Lower number = higher priority
}

/**
 * Pattern definitions for common parts
 * Ordered by priority - more specific patterns first
 */
const GENERIC_PART_PATTERNS: GenericPartPattern[] = [
  // ========================================
  // OIL PRODUCTS (High Priority)
  // ========================================
  {
    name: 'Engine Oil - Weight Specific',
    category: 'oil',
    regex: /\b(\d+W[-\s]?\d+)\b/i,
    displayNameBuilder: (match) => `Fullbay Generic ${match[1].replace(/\s/g, '')} Engine Oil`,
    confidence: 0.95,
    priority: 1
  },
  {
    name: 'Synthetic Oil',
    category: 'oil',
    regex: /\b(synthetic|synth)\s+(oil|motor\s+oil|engine\s+oil)/i,
    displayNameBuilder: () => 'Fullbay Generic Synthetic Engine Oil',
    confidence: 0.90,
    priority: 2
  },
  {
    name: 'Diesel Oil',
    category: 'oil',
    regex: /\b(diesel|heavy\s+duty)\s+(oil|motor\s+oil|engine\s+oil)/i,
    displayNameBuilder: () => 'Fullbay Generic Diesel Engine Oil',
    confidence: 0.90,
    priority: 2
  },
  {
    name: 'Generic Oil',
    category: 'oil',
    regex: /\b(motor\s+oil|engine\s+oil)\b/i,
    displayNameBuilder: () => 'Fullbay Generic Engine Oil',
    confidence: 0.85,
    priority: 3
  },

  // ========================================
  // FILTERS (High Priority)
  // ========================================
  {
    name: 'Fuel Filter',
    category: 'filter',
    regex: /\b(fuel|diesel)\s+filter\b/i,
    displayNameBuilder: () => 'Fullbay Generic Fuel Filter',
    confidence: 0.95,
    priority: 1
  },
  {
    name: 'Oil Filter',
    category: 'filter',
    regex: /\boil\s+filter\b/i,
    displayNameBuilder: () => 'Fullbay Generic Oil Filter',
    confidence: 0.95,
    priority: 1
  },
  {
    name: 'Air Filter',
    category: 'filter',
    regex: /\bair\s+filter\b/i,
    displayNameBuilder: () => 'Fullbay Generic Air Filter',
    confidence: 0.95,
    priority: 1
  },
  {
    name: 'Cabin Filter',
    category: 'filter',
    regex: /\bcabin\s+(air\s+)?filter\b/i,
    displayNameBuilder: () => 'Fullbay Generic Cabin Air Filter',
    confidence: 0.95,
    priority: 1
  },
  {
    name: 'Hydraulic Filter',
    category: 'filter',
    regex: /\bhydraulic\s+filter\b/i,
    displayNameBuilder: () => 'Fullbay Generic Hydraulic Filter',
    confidence: 0.95,
    priority: 1
  },
  {
    name: 'Transmission Filter',
    category: 'filter',
    regex: /\b(transmission|trans)\s+filter\b/i,
    displayNameBuilder: () => 'Fullbay Generic Transmission Filter',
    confidence: 0.95,
    priority: 1
  },

  // ========================================
  // FLUIDS (Medium Priority)
  // ========================================
  {
    name: 'Coolant',
    category: 'fluid',
    regex: /\b(coolant|antifreeze|anti-freeze)\b/i,
    displayNameBuilder: () => 'Fullbay Generic Coolant/Antifreeze',
    confidence: 0.90,
    priority: 2
  },
  {
    name: 'Brake Fluid',
    category: 'fluid',
    regex: /\bbrake\s+fluid\b/i,
    displayNameBuilder: () => 'Fullbay Generic Brake Fluid',
    confidence: 0.95,
    priority: 1
  },
  {
    name: 'Transmission Fluid',
    category: 'fluid',
    regex: /\b(transmission|trans|atf)\s+fluid\b/i,
    displayNameBuilder: () => 'Fullbay Generic Transmission Fluid',
    confidence: 0.95,
    priority: 1
  },
  {
    name: 'Hydraulic Fluid',
    category: 'fluid',
    regex: /\bhydraulic\s+(fluid|oil)\b/i,
    displayNameBuilder: () => 'Fullbay Generic Hydraulic Fluid',
    confidence: 0.90,
    priority: 2
  },
  {
    name: 'Power Steering Fluid',
    category: 'fluid',
    regex: /\bpower\s+steering\s+fluid\b/i,
    displayNameBuilder: () => 'Fullbay Generic Power Steering Fluid',
    confidence: 0.95,
    priority: 1
  },
  {
    name: 'Windshield Washer Fluid',
    category: 'fluid',
    regex: /\b(windshield|washer|wiper)\s+(fluid|wash)\b/i,
    displayNameBuilder: () => 'Fullbay Generic Windshield Washer Fluid',
    confidence: 0.90,
    priority: 2
  },
  {
    name: 'DEF (Diesel Exhaust Fluid)',
    category: 'fluid',
    regex: /\b(def|diesel\s+exhaust\s+fluid|adblue)\b/i,
    displayNameBuilder: () => 'Fullbay Generic DEF (Diesel Exhaust Fluid)',
    confidence: 0.95,
    priority: 1
  },

  // ========================================
  // GREASE & LUBRICANTS (Medium Priority)
  // ========================================
  {
    name: 'Grease',
    category: 'grease',
    regex: /\b(grease|lubricant)\b/i,
    displayNameBuilder: () => 'Fullbay Generic Grease/Lubricant',
    confidence: 0.85,
    priority: 3
  },

  // ========================================
  // SUPPLIES (High Priority - Very Common)
  // ========================================
  {
    name: 'Zip Ties',
    category: 'supply',
    regex: /\b(zip\s*tie|cable\s+tie)\b/i,
    displayNameBuilder: () => 'Fullbay Generic Zip Ties',
    confidence: 0.95,
    priority: 1
  },
  {
    name: 'Shop Rags',
    category: 'supply',
    regex: /\b(shop\s+rag|rag|towel|wipe)\b/i,
    displayNameBuilder: () => 'Fullbay Generic Shop Rags',
    confidence: 0.90,
    priority: 2
  },
  {
    name: 'Gloves',
    category: 'supply',
    regex: /\b(glove|nitrile|latex)\b/i,
    displayNameBuilder: () => 'Fullbay Generic Gloves',
    confidence: 0.90,
    priority: 2
  },
  {
    name: 'Shop Supplies',
    category: 'supply',
    regex: /\b(shop\s+suppl|misc\s+suppl|supplies)\b/i,
    displayNameBuilder: () => 'Fullbay Generic Shop Supplies',
    confidence: 0.85,
    priority: 3
  },
  {
    name: 'Tape',
    category: 'supply',
    regex: /\b(duct\s+tape|electrical\s+tape|tape)\b/i,
    displayNameBuilder: () => 'Fullbay Generic Tape',
    confidence: 0.85,
    priority: 3
  },
  {
    name: 'Clamps',
    category: 'supply',
    regex: /\b(clamp|hose\s+clamp)\b/i,
    displayNameBuilder: () => 'Fullbay Generic Clamps',
    confidence: 0.85,
    priority: 3
  },

  // ========================================
  // TIRES (Medium Priority)
  // ========================================
  {
    name: 'Tire - Size Specific',
    category: 'tire',
    regex: /\b(\d{2,3}\/\d{2,3}[A-Z]?\d{2})\b/i,
    displayNameBuilder: (match) => `Fullbay Generic Tire ${match[1]}`,
    confidence: 0.90,
    priority: 2
  },
  {
    name: 'Tire - Generic',
    category: 'tire',
    regex: /\btire\b/i,
    displayNameBuilder: () => 'Fullbay Generic Tire',
    confidence: 0.80,
    priority: 4
  }
];

/**
 * Matches a part description against generic part patterns
 * Returns the best match based on confidence and priority
 */
export function matchGenericPart(description: string): GenericPart | null {
  if (!description || description.trim().length === 0) {
    return null;
  }

  const normalizedDescription = description.trim();
  const matches: Array<{ pattern: GenericPartPattern; match: RegExpMatchArray }> = [];

  // Find all matching patterns
  for (const pattern of GENERIC_PART_PATTERNS) {
    const match = normalizedDescription.match(pattern.regex);
    if (match) {
      matches.push({ pattern, match });
    }
  }

  // No matches found
  if (matches.length === 0) {
    return null;
  }

  // Sort by priority (lower number first), then by confidence (higher first)
  matches.sort((a, b) => {
    if (a.pattern.priority !== b.pattern.priority) {
      return a.pattern.priority - b.pattern.priority;
    }
    return b.pattern.confidence - a.pattern.confidence;
  });

  // Use the best match
  const bestMatch = matches[0];
  const displayName = bestMatch.pattern.displayNameBuilder(bestMatch.match, normalizedDescription);
  const fullbayPartId = generateFullbayPartId(bestMatch.pattern.category, displayName);

  return {
    fullbayPartId,
    category: bestMatch.pattern.category,
    displayName,
    confidence: bestMatch.pattern.confidence,
    matchedPattern: bestMatch.pattern.name,
    originalDescription: normalizedDescription
  };
}

/**
 * Generate a unique Fullbay Part ID
 * Format: FB-{CATEGORY}-{HASH}
 */
function generateFullbayPartId(category: string, displayName: string): string {
  // Simple hash function for generating consistent IDs
  const hash = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 8);
  
  const categoryCode = category.substring(0, 3).toUpperCase();
  return `FB-${categoryCode}-${hash}`;
}

/**
 * Batch match multiple part descriptions
 */
export function batchMatchGenericParts(descriptions: string[]): Array<GenericPart | null> {
  return descriptions.map(desc => matchGenericPart(desc));
}

/**
 * Get statistics about generic part matching
 */
export function getMatchingStats(results: Array<GenericPart | null>): {
  total: number;
  matched: number;
  byCategory: Record<string, number>;
  matchRate: number;
} {
  const stats = {
    total: results.length,
    matched: 0,
    byCategory: {} as Record<string, number>,
    matchRate: 0
  };

  for (const result of results) {
    if (result) {
      stats.matched++;
      stats.byCategory[result.category] = (stats.byCategory[result.category] || 0) + 1;
    }
  }

  stats.matchRate = stats.total > 0 ? (stats.matched / stats.total) * 100 : 0;

  return stats;
}

/**
 * Get all available patterns (for documentation/testing)
 */
export function getAvailablePatterns(): GenericPartPattern[] {
  return [...GENERIC_PART_PATTERNS];
}

