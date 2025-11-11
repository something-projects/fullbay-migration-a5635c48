import { promises as fs } from 'fs';
import path from 'path';
import type { PartMatch, PartSuggestion, PartUpdatePayload } from '../../shared/onboarding.js';
import { pathExists, readJson } from './fileUtils.js';
import { matchGenericPart, type GenericPart } from './partsMatcher.js';
import { transformerApiClient, TransformerApiClientError } from './transformerApiClient.js';

interface StandardizedPartRecord {
  title?: string;
  partNumber?: string | null;
  description?: string | null;
  category?: string | null;
  standardizedPart: {
    partId?: string | number;
    partName?: string;
    partTerminologyId?: number;
    partTerminologyName?: string;
    confidence?: number;
    matchingMethod?: string;
  };
}

interface PartCluster {
  key: string;
  canonicalLabel: string;
  occurrences: number;
  partNumbers: Map<string, number>;
}

export async function loadPartMatches(entityOutputDir: string): Promise<PartMatch[]> {
  const records = await collectStandardizedPartRecords(entityOutputDir);
  const clusters = buildClusters(records);
  const partMap = new Map<string, PartMatch>();

  for (const record of records) {
    const key = derivePartKey(record);
    const base = buildPartMatch(record, clusters.get(normalizeLabel(record.description || record.standardizedPart.partName || '')));

    if (!partMap.has(key)) {
      partMap.set(key, base);
    } else {
      const existing = partMap.get(key)!;
      existing.matchRate = Math.max(existing.matchRate, base.matchRate);
      existing.matchedAttributes = Array.from(new Set([...existing.matchedAttributes, ...base.matchedAttributes]));
      existing.unmatchedAttributes = Array.from(new Set([...existing.unmatchedAttributes, ...base.unmatchedAttributes]));
      existing.suggestions = mergeSuggestions(existing.suggestions, base.suggestions);
    }
  }

  return Array.from(partMap.values()).sort((a, b) => {
    const diff = b.matchRate - a.matchRate;
    if (diff !== 0) return diff;
    return (a.oemPartNumber || a.partId).localeCompare(b.oemPartNumber || b.partId);
  });
}

export function summarizePartFailures(parts: PartMatch[]) {
  const total = parts.length;
  const validated = parts.filter((part) => part.status === 'validated').length;
  const legacy = parts.filter((part) => part.status === 'legacy').length;
  const pending = total - validated - legacy;

  const reasonCounts = new Map<string, { reason: string; count: number }>();

  for (const part of parts) {
    for (const reason of part.unmatchedAttributes) {
      const key = reason.toLowerCase();
      const existing = reasonCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        reasonCounts.set(key, { reason, count: 1 });
      }
    }
  }

  const topFailures = Array.from(reasonCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totals: {
      total,
      validated,
      legacy,
      pending
    },
    topFailures
  };
}

export async function applyPartUpdate(existing: PartMatch, payload: PartUpdatePayload): Promise<PartMatch> {
  const updated: PartMatch = {
    ...existing,
    oemPartNumber: payload.overridePartNumber ?? existing.oemPartNumber,
    description: payload.overrideDescription ?? existing.description,
    notes: payload.notes ?? existing.notes,
    lastUpdated: new Date().toISOString(),
    status: payload.markAsLegacy ? 'legacy' : existing.status,
    suggestions: existing.suggestions
  };

  // Check if key fields changed - if so, re-run matching via transformer API
  const keyFieldsChanged =
    (payload.overridePartNumber && payload.overridePartNumber !== existing.oemPartNumber) ||
    (payload.overrideDescription && payload.overrideDescription !== existing.description);

  if (keyFieldsChanged && transformerApiClient.isEnabled()) {
    try {
      // Call transformer API to re-match part with updated data
      const matchResult = await transformerApiClient.matchPart({
        partNumber: updated.oemPartNumber || '',
        description: updated.description,
        manufacturer: undefined // Could be added to PartUpdatePayload in the future
      });

      // Update part with new matching results
      if (matchResult.matched && matchResult.standardizedPart) {
        updated.autoCareReference = {
          partName: matchResult.standardizedPart.description,
          matchingMethod: matchResult.standardizedPart.matchType || 'api-rematched',
          confidence: matchResult.confidence
        };
        updated.matchRate = matchResult.confidence;

        // Update matched attributes with new AutoCare data
        const matchedAttrs = new Set(updated.matchedAttributes);
        matchedAttrs.add(`AutoCare part: ${matchResult.standardizedPart.description}`);
        matchedAttrs.add(`AutoCare confidence: ${Math.round(matchResult.confidence * 100)}%`);
        if (matchResult.standardizedPart.category) {
          updated.category = matchResult.standardizedPart.category;
          matchedAttrs.add(`Category: ${matchResult.standardizedPart.category}`);
        }
        updated.matchedAttributes = Array.from(matchedAttrs);
      } else {
        // No match found, clear AutoCare reference
        updated.autoCareReference = undefined;
        updated.matchRate = 0;
      }

      console.log(`✅ Re-matched part ${updated.partId}: confidence ${Math.round(updated.matchRate * 100)}%`);
    } catch (error) {
      // Graceful degradation: log error but continue with existing data
      if (error instanceof TransformerApiClientError) {
        console.warn(`⚠️  Part re-matching failed for ${updated.partId}: ${error.message} (status ${error.statusCode})`);
      } else {
        console.warn(`⚠️  Part re-matching failed for ${updated.partId}:`, error);
      }
      // Keep existing autoCareReference and matchRate
    }
  }

  const recalculated = recalcPart(updated);
  if (payload.markAsLegacy) {
    recalculated.status = 'legacy';
  } else if (recalculated.unmatchedAttributes.length === 0) {
    recalculated.status = 'validated';
  } else {
    recalculated.status = 'pending';
  }

  return {
    ...recalculated,
    suggestions: buildPartSuggestions(recalculated)
  };
}

function buildPartMatch(record: StandardizedPartRecord, cluster?: PartCluster): PartMatch {
  const confidence = normalizeConfidence(record.standardizedPart.confidence);
  const matchedAttributes = new Set<string>();
  const unmatchedAttributes = new Set<string>();

  // Try to match against Fullbay Generic Parts first
  const genericMatch = tryGenericPartMatch(record, confidence);
  if (genericMatch) {
    return genericMatch;
  }

  if (record.partNumber) {
    matchedAttributes.add(`Captured part number: ${record.partNumber}`);
  } else {
    unmatchedAttributes.add('Part number missing');
  }

  if (record.description) {
    matchedAttributes.add('In-house description present');
  } else {
    unmatchedAttributes.add('Description missing');
  }

  if (record.standardizedPart.partName) {
    matchedAttributes.add(`AutoCare part: ${record.standardizedPart.partName}`);
  }

  if (!confidence) {
    unmatchedAttributes.add('No AutoCare match');
  } else if (confidence < 0.75) {
    unmatchedAttributes.add(`Low confidence (${Math.round(confidence * 100)}%)`);
  }

  if (record.standardizedPart.matchingMethod && record.standardizedPart.matchingMethod !== 'exact') {
    unmatchedAttributes.add(`Matching method: ${record.standardizedPart.matchingMethod}`);
  }

  const partMatch: PartMatch = {
    partId: derivePartKey(record),
    oemPartNumber: record.partNumber ?? undefined,
    description: record.description ?? record.standardizedPart.partName ?? undefined,
    category: record.standardizedPart.partTerminologyName ?? record.category ?? undefined,
    matchRate: confidence,
    matchedAttributes: Array.from(matchedAttributes),
    unmatchedAttributes: Array.from(unmatchedAttributes),
    status: 'pending',
    suggestions: [],
    autoCareReference: {
      partName: record.standardizedPart.partName,
      matchingMethod: record.standardizedPart.matchingMethod,
      confidence
    }
  };

  const recalculated = recalcPart(partMatch);
  recalculated.suggestions = buildPartSuggestions(recalculated, cluster);
  return recalculated;
}

/**
 * Try to match part against Fullbay Generic Parts patterns
 * Returns a validated PartMatch if generic match succeeds, null otherwise
 */
function tryGenericPartMatch(record: StandardizedPartRecord, autoCareConfidence: number): PartMatch | null {
  // Only try generic matching if:
  // 1. AutoCare match is weak or missing (confidence < 0.75)
  // 2. We have a description to match against
  const description = record.description || record.title;
  if (!description || autoCareConfidence >= 0.75) {
    return null;
  }

  const genericPart = matchGenericPart(description);
  if (!genericPart) {
    return null;
  }

  // Build a validated PartMatch using the generic part
  const matchedAttributes = new Set<string>();
  const unmatchedAttributes = new Set<string>();

  matchedAttributes.add(`Fullbay Generic Part: ${genericPart.displayName}`);
  matchedAttributes.add(`Category: ${genericPart.category}`);
  matchedAttributes.add(`Pattern: ${genericPart.matchedPattern}`);
  matchedAttributes.add(`Confidence: ${Math.round(genericPart.confidence * 100)}%`);

  if (record.partNumber) {
    matchedAttributes.add(`Original part number: ${record.partNumber}`);
  }

  // Generic parts are considered validated
  const partMatch: PartMatch = {
    partId: genericPart.fullbayPartId,
    oemPartNumber: record.partNumber ?? undefined,
    description: genericPart.displayName,
    category: genericPart.category,
    matchRate: genericPart.confidence,
    matchedAttributes: Array.from(matchedAttributes),
    unmatchedAttributes: Array.from(unmatchedAttributes),
    status: 'validated',
    suggestions: [],
    autoCareReference: {
      partName: record.standardizedPart.partName,
      matchingMethod: 'fullbay-generic',
      confidence: genericPart.confidence
    },
    // Store generic part metadata
    genericPartMetadata: {
      fullbayPartId: genericPart.fullbayPartId,
      category: genericPart.category,
      matchedPattern: genericPart.matchedPattern,
      originalDescription: genericPart.originalDescription
    }
  };

  return partMatch;
}

function recalcPart(part: PartMatch): PartMatch {
  const matched: Set<string> = new Set(part.matchedAttributes);
  const unmatched: Set<string> = new Set(part.unmatchedAttributes);

  if (!part.oemPartNumber) {
    unmatched.add('Part number missing');
    matched.forEach((value: string) => {
      if (value.startsWith('Captured part number')) {
        matched.delete(value);
      }
    });
  }

  if (!part.description) {
    unmatched.add('Description missing');
  }

  const confidence = normalizeConfidence(part.matchRate);
  if (!confidence) {
    unmatched.add('No AutoCare match');
  } else if (confidence < 0.75) {
    unmatched.add(`Low confidence (${Math.round(confidence * 100)}%)`);
  }

  return {
    ...part,
    matchRate: confidence,
    matchedAttributes: Array.from(matched),
    unmatchedAttributes: Array.from(unmatched)
  };
}

function buildPartSuggestions(part: PartMatch, cluster?: PartCluster): PartSuggestion[] {
  const suggestions: PartSuggestion[] = [];

  if (!cluster) {
    const normalized = normalizeLabel(part.description ?? part.autoCareReference?.partName ?? undefined);
    if (normalized) {
      cluster = {
        key: normalized,
        canonicalLabel: part.description ? toTitleCase(part.description) : toTitleCase(part.autoCareReference?.partName ?? normalized),
        occurrences: 1,
        partNumbers: new Map(part.oemPartNumber ? [[part.oemPartNumber, 1]] : [])
      };
    }
  }

  if (part.autoCareReference?.partName && part.autoCareReference.partName !== part.description) {
    suggestions.push({
      suggestionId: `autocare-${part.partId}`,
      kind: 'autocare-standardized',
      title: 'Use AutoCare part name',
      description: 'Replace in-house description with the AutoCare standardized name.',
      payload: {
        overrideDescription: part.autoCareReference.partName
      }
    });
  }

  if (cluster && cluster.canonicalLabel && cluster.canonicalLabel !== (part.description ?? '')) {
    suggestions.push({
      suggestionId: `cluster-${part.partId}`,
      kind: 'clustered-alias',
      title: 'Normalize description casing',
      description: `Align with the most common form "${cluster.canonicalLabel}" used across similar parts to aid deduping.`,
      payload: {
        overrideDescription: cluster.canonicalLabel
      }
    });
  }

  if (!part.oemPartNumber && cluster && cluster.partNumbers.size === 1) {
    const [canonicalNumber] = cluster.partNumbers.keys();
    suggestions.push({
      suggestionId: `normalized-number-${part.partId}`,
      kind: 'normalized-label',
      title: 'Apply shared part number',
      description: 'Adopt the consistent part number observed for this description cluster.',
      payload: {
        overridePartNumber: canonicalNumber
      }
    });
  }

  // Suggestion for missing category
  if (!part.category && part.autoCareReference?.partName) {
    suggestions.push({
      suggestionId: `add-category-${part.partId}`,
      kind: 'add-category',
      title: 'Add part category',
      description: 'This part is missing a category classification. Consider reviewing and adding one.',
      payload: {}
    });
  }

  // Suggestion for low confidence matches
  const confidence = normalizeConfidence(part.matchRate);
  if (confidence > 0 && confidence < 0.75 && part.autoCareReference?.partName) {
    suggestions.push({
      suggestionId: `low-confidence-${part.partId}`,
      kind: 'review-match',
      title: `Low confidence match (${Math.round(confidence * 100)}%)`,
      description: 'The AutoCare match confidence is below 75%. Review the match quality or consider manual correction.',
      payload: {}
    });
  }

  // Suggestion for parts with no AutoCare match
  if (!confidence || confidence === 0) {
    suggestions.push({
      suggestionId: `no-match-${part.partId}`,
      kind: 'no-autocare-match',
      title: 'No AutoCare match found',
      description: 'This part has no AutoCare PIES match. Consider marking as legacy if no longer serviced.',
      payload: {
        markAsLegacy: false
      }
    });
  }

  // Suggestion for parts with missing part number
  if (!part.oemPartNumber) {
    suggestions.push({
      suggestionId: `missing-number-${part.partId}`,
      kind: 'missing-part-number',
      title: 'Part number missing',
      description: 'Add a part number to enable proper inventory tracking and ordering.',
      payload: {}
    });
  }

  // Suggestion for parts with missing description
  if (!part.description && !part.autoCareReference?.partName) {
    suggestions.push({
      suggestionId: `missing-desc-${part.partId}`,
      kind: 'missing-description',
      title: 'Description missing',
      description: 'Add a description to help identify this part in inventory and service orders.',
      payload: {}
    });
  }

  return mergeSuggestions(suggestions, []);
}

function buildClusters(records: StandardizedPartRecord[]): Map<string, PartCluster> {
  const clusters = new Map<string, PartCluster>();

  for (const record of records) {
    const label = record.description || record.standardizedPart.partName;
    if (!label) continue;

    const key = normalizeLabel(label);
    if (!key) continue;

    if (!clusters.has(key)) {
      clusters.set(key, {
        key,
        canonicalLabel: toTitleCase(label),
        occurrences: 0,
        partNumbers: new Map<string, number>()
      });
    }

    const cluster = clusters.get(key)!;
    cluster.occurrences += 1;

    if (record.partNumber) {
      const current = cluster.partNumbers.get(record.partNumber) ?? 0;
      cluster.partNumbers.set(record.partNumber, current + 1);
    }

    if (record.description && record.description.length > cluster.canonicalLabel.length) {
      cluster.canonicalLabel = toTitleCase(record.description);
    }
  }

  return clusters;
}

function mergeSuggestions(primary: PartSuggestion[], secondary: PartSuggestion[]): PartSuggestion[] {
  const suggestions = new Map<string, PartSuggestion>();
  for (const suggestion of [...primary, ...secondary]) {
    suggestions.set(suggestion.suggestionId, suggestion);
  }
  return Array.from(suggestions.values());
}

function normalizeConfidence(value?: number | null): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  if (value > 1) {
    return Math.min(value / 100, 1);
  }
  if (value < 0) {
    return 0;
  }
  return parseFloat(value.toFixed(4));
}

function derivePartKey(record: StandardizedPartRecord): string {
  if (record.partNumber && record.partNumber.trim().length > 0) {
    return record.partNumber.trim();
  }
  if (record.standardizedPart.partId) {
    return String(record.standardizedPart.partId);
  }
  if (record.standardizedPart.partTerminologyId) {
    return `terminology-${record.standardizedPart.partTerminologyId}`;
  }
  if (record.standardizedPart.partName) {
    return `name-${normalizeLabel(record.standardizedPart.partName)}`;
  }
  return `anon-${Math.random().toString(36).slice(2, 10)}`;
}

async function collectStandardizedPartRecords(entityOutputDir: string): Promise<StandardizedPartRecord[]> {
  const customersDir = path.join(entityOutputDir, 'customers');
  if (!(await pathExists(customersDir))) {
    return [];
  }

  const records: StandardizedPartRecord[] = [];
  const customerEntries = await fs.readdir(customersDir, { withFileTypes: true });
  for (const customerEntry of customerEntries) {
    if (!customerEntry.isDirectory()) continue;
    const unitsDir = path.join(customersDir, customerEntry.name, 'units');
    if (!(await pathExists(unitsDir))) continue;

    const unitEntries = await fs.readdir(unitsDir, { withFileTypes: true });
    for (const unitEntry of unitEntries) {
      if (!unitEntry.isDirectory()) continue;
      const serviceOrdersDir = path.join(unitsDir, unitEntry.name, 'service-orders');
      if (!(await pathExists(serviceOrdersDir))) continue;

      const serviceOrderEntries = await fs.readdir(serviceOrdersDir, { withFileTypes: true });
      for (const serviceOrderEntry of serviceOrderEntries) {
        if (!serviceOrderEntry.isDirectory()) continue;
        const entityFile = path.join(serviceOrdersDir, serviceOrderEntry.name, 'entity.json');
        if (!(await pathExists(entityFile))) continue;

        const serviceOrder = await readJson<unknown>(entityFile);
        const extracted = extractStandardizedParts(serviceOrder);
        records.push(...extracted);
      }
    }
  }

  return records;
}

function extractStandardizedParts(root: unknown): StandardizedPartRecord[] {
  const results: StandardizedPartRecord[] = [];
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        stack.push(item);
      }
      continue;
    }

    const record = value as Record<string, unknown>;
    if (record.standardizedPart && typeof record.standardizedPart === 'object') {
      results.push({
        title: typeof record.title === 'string' ? record.title : undefined,
        partNumber: typeof record.partNumber === 'string' ? record.partNumber : undefined,
        description: typeof record.description === 'string' ? record.description : undefined,
        category: typeof record.category === 'string' ? record.category : undefined,
        standardizedPart: record.standardizedPart as StandardizedPartRecord['standardizedPart']
      });
    }

    for (const key of Object.keys(record)) {
      stack.push(record[key]);
    }
  }

  return results;
}

function normalizeLabel(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
