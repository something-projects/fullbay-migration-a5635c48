import { promises as fs } from 'fs';
import path from 'path';
import type { VehicleMatch, VehicleSuggestion, VehicleUpdatePayload } from '../../shared/onboarding.js';
import { pathExists, readJson } from './fileUtils.js';
import { transformerApiClient, TransformerApiClientError } from './transformerApiClient.js';

interface UnitEntity {
  customerUnitId: number;
  title?: string;
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  status?: string | null;
  standardizedVehicle?: {
    makeName?: string;
    modelName?: string;
    year?: number;
    confidence?: number;
    baseVehicleId?: number;
  } | null;
}

interface CustomerEntityMeta {
  title?: string;
  legalName?: string;
  notes?: string;
  description?: string;
  status?: string;
  accessMethod?: string;
}

interface UnitRecord {
  filePath: string;
  entity: UnitEntity;
  customerId: string;
  customerName?: string;
  customerDescription?: string;
}

export async function loadVehicleMatches(entityOutputDir: string): Promise<VehicleMatch[]> {
  const unitRecords = await collectUnitEntities(entityOutputDir);
  const matches = unitRecords.map((record) =>
    createVehicleMatch(record.entity, {
      customerId: record.customerId,
      customerName: record.customerName,
      customerDescription: record.customerDescription
    })
  );
  return matches.sort((a, b) => a.label.localeCompare(b.label));
}

export function summarizeVehicleFailures(vehicles: VehicleMatch[]) {
  const total = vehicles.length;
  const validated = vehicles.filter((v) => v.status === 'validated').length;
  const legacy = vehicles.filter((v) => v.status === 'legacy').length;
  const pending = total - validated - legacy;

  const reasonCounts = new Map<string, { reason: string; count: number }>();

  for (const vehicle of vehicles) {
    for (const reason of vehicle.unmatchedAttributes) {
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

export async function applyVehicleUpdate(existing: VehicleMatch, payload: VehicleUpdatePayload): Promise<VehicleMatch> {
  const updated: VehicleMatch = {
    ...existing,
    vin: payload.vin ?? existing.vin,
    make: payload.make ?? existing.make,
    model: payload.model ?? existing.model,
    modelYear: payload.modelYear ?? existing.modelYear,
    notes: payload.notes ?? existing.notes,
    lastUpdated: new Date().toISOString(),
    status: existing.status
  };

  // Check if key fields changed - if so, re-run matching via transformer API
  const keyFieldsChanged =
    (payload.make && payload.make !== existing.make) ||
    (payload.model && payload.model !== existing.model) ||
    (payload.modelYear && payload.modelYear !== existing.modelYear) ||
    (payload.vin && payload.vin !== existing.vin);

  if (keyFieldsChanged && transformerApiClient.isEnabled()) {
    try {
      // Call transformer API to re-match vehicle with updated data
      const matchResult = await transformerApiClient.matchVehicle({
        make: updated.make || '',
        model: updated.model || '',
        year: updated.modelYear || 0,
        vin: updated.vin
      });

      // Update vehicle with new matching results
      if (matchResult.matched && matchResult.standardizedVehicle) {
        updated.autoCareReference = {
          makeName: matchResult.standardizedVehicle.make,
          modelName: matchResult.standardizedVehicle.model,
          year: matchResult.standardizedVehicle.year,
          confidence: matchResult.confidence
        };
        updated.matchRate = matchResult.confidence;

        // Update matched attributes with new AutoCare data
        const matchedAttrs = new Set(updated.matchedAttributes);
        matchedAttrs.add(`AutoCare make: ${matchResult.standardizedVehicle.make}`);
        matchedAttrs.add(`AutoCare model: ${matchResult.standardizedVehicle.model}`);
        matchedAttrs.add(`AutoCare confidence: ${Math.round(matchResult.confidence * 100)}%`);
        updated.matchedAttributes = Array.from(matchedAttrs);
      } else {
        // No match found, clear AutoCare reference
        updated.autoCareReference = undefined;
        updated.matchRate = 0;
      }

      console.log(`✅ Re-matched vehicle ${updated.unitId}: confidence ${Math.round(updated.matchRate * 100)}%`);
    } catch (error) {
      // Graceful degradation: log error but continue with existing data
      if (error instanceof TransformerApiClientError) {
        console.warn(`⚠️  Vehicle re-matching failed for ${updated.unitId}: ${error.message} (status ${error.statusCode})`);
      } else {
        console.warn(`⚠️  Vehicle re-matching failed for ${updated.unitId}:`, error);
      }
      // Keep existing autoCareReference and matchRate
    }
  }

  const recalculated = recalcVehicle(updated);
  if (payload.markAsLegacy === true) {
    recalculated.status = 'legacy';
  } else if (payload.markAsLegacy === false || recalculated.unmatchedAttributes.length === 0) {
    // Explicitly removing from legacy or all attributes matched
    recalculated.status = recalculated.unmatchedAttributes.length === 0 ? 'validated' : 'pending';
  } else if (existing.status !== 'legacy') {
    // Only recalculate status if not legacy and markAsLegacy not specified
    recalculated.status = recalculated.unmatchedAttributes.length === 0 ? 'validated' : 'pending';
  }
  recalculated.suggestions = buildVehicleSuggestions(recalculated);
  return recalculated;
}

function createVehicleMatch(
  unit: UnitEntity,
  metadata: { customerId: string; customerName?: string; customerDescription?: string }
): VehicleMatch {
  const baseLabel = unit.title || `Unit ${unit.customerUnitId}`;
  const label = unit.standardizedVehicle?.modelName
    ? `${baseLabel} • ${unit.standardizedVehicle.modelName}`
    : baseLabel;

  const match: VehicleMatch = {
    unitId: String(unit.customerUnitId),
    label,
    vin: unit.vin ?? undefined,
    make: unit.make ?? undefined,
    model: unit.model ?? undefined,
    modelYear: unit.year ?? undefined,
    matchRate: normalizeConfidence(unit.standardizedVehicle?.confidence),
    matchedAttributes: buildMatchedAttributes(unit),
    unmatchedAttributes: [],
    status: 'pending',
    suggestions: [],
    customerId: metadata.customerId,
    customerName: metadata.customerName || `Customer ${metadata.customerId}`,
    customerDescription: metadata.customerDescription,
    autoCareReference: unit.standardizedVehicle
      ? {
          makeName: unit.standardizedVehicle.makeName,
          modelName: unit.standardizedVehicle.modelName,
          year: unit.standardizedVehicle.year,
          confidence: normalizeConfidence(unit.standardizedVehicle.confidence)
        }
      : undefined
  };

  const recalculated = recalcVehicle(match);
  recalculated.suggestions = buildVehicleSuggestions(recalculated);
  return recalculated;
}

function recalcVehicle(vehicle: VehicleMatch): VehicleMatch {
  const matched = new Set(vehicle.matchedAttributes);
  const unmatched = new Set<string>();

  const normalizedVin = normalizeVin(vehicle.vin);
  if (normalizedVin) {
    matched.add('VIN present');
  } else {
    unmatched.add('VIN missing or incomplete');
    matched.delete('VIN present');
  }

  if (!vehicle.make) {
    unmatched.add('Make missing');
  }
  if (!vehicle.model) {
    unmatched.add('Model missing');
  }
  if (!vehicle.modelYear) {
    unmatched.add('Model year missing');
  }

  const confidence = typeof vehicle.matchRate === 'number' ? normalizeConfidence(vehicle.matchRate) : 0;
  if (confidence === 0) {
    unmatched.add('No AutoCare match');
  } else if (confidence < 0.8) {
    unmatched.add(`Low confidence (${Math.round(confidence * 100)}%)`);
  }

  return {
    ...vehicle,
    matchRate: confidence,
    matchedAttributes: Array.from(matched),
    unmatchedAttributes: Array.from(unmatched)
  };
}

function buildVehicleSuggestions(vehicle: VehicleMatch): VehicleSuggestion[] {
  const suggestions: VehicleSuggestion[] = [];
  const normalizedVin = normalizeVin(vehicle.vin);
  if (vehicle.vin && normalizedVin && normalizedVin !== vehicle.vin) {
    suggestions.push({
      suggestionId: `vin-format-${vehicle.unitId}`,
      kind: 'vin-format',
      title: 'Normalize VIN formatting',
      description: 'Upper-case and strip spacing/punctuation for better AutoCare VIN matching.',
      payload: { vin: normalizedVin }
    });
  }

  if (vehicle.autoCareReference) {
    const payload: VehicleUpdatePayload = {
      make: vehicle.autoCareReference.makeName ?? vehicle.make,
      model: vehicle.autoCareReference.modelName ?? vehicle.model,
      modelYear: vehicle.autoCareReference.year ?? vehicle.modelYear
    };

    const shouldSuggest =
      (payload.make && payload.make !== vehicle.make) ||
      (payload.model && payload.model !== vehicle.model) ||
      (payload.modelYear && payload.modelYear !== vehicle.modelYear);

    if (shouldSuggest) {
      suggestions.push({
        suggestionId: `autocare-${vehicle.unitId}`,
        kind: 'autocare-standardized',
        title: 'Apply AutoCare standardized vehicle data',
        description: 'Use AutoCare-provided make, model, and year details to improve matching confidence.',
        payload
      });
    }
  }

  return suggestions;
}

function buildMatchedAttributes(unit: UnitEntity): string[] {
  const attributes = new Set<string>();
  if (unit.vin) {
    attributes.add('VIN present');
  }
  if (unit.make) {
    attributes.add(`Captured make: ${unit.make}`);
  }
  if (unit.model) {
    attributes.add(`Captured model: ${unit.model}`);
  }
  if (unit.year) {
    attributes.add(`Captured year: ${unit.year}`);
  }
  if (unit.standardizedVehicle?.makeName) {
    attributes.add(`AutoCare make: ${unit.standardizedVehicle.makeName}`);
  }
  if (unit.standardizedVehicle?.modelName) {
    attributes.add(`AutoCare model: ${unit.standardizedVehicle.modelName}`);
  }
  if (typeof unit.standardizedVehicle?.confidence === 'number') {
    attributes.add(`AutoCare confidence: ${Math.round(normalizeConfidence(unit.standardizedVehicle.confidence) * 100)}%`);
  }
  return Array.from(attributes);
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

function normalizeVin(vin?: string): string | undefined {
  if (!vin) {
    return undefined;
  }
  const stripped = vin.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (stripped.length === 0) {
    return undefined;
  }
  return stripped;
}

async function collectUnitEntities(entityOutputDir: string): Promise<UnitRecord[]> {
  const customersDir = path.join(entityOutputDir, 'customers');
  if (!(await pathExists(customersDir))) {
    return [];
  }

  const unitRecords: UnitRecord[] = [];
  const customerEntries = await fs.readdir(customersDir, { withFileTypes: true });
  for (const customerEntry of customerEntries) {
    if (!customerEntry.isDirectory()) continue;
    const customerId = customerEntry.name;
    const customerDir = path.join(customersDir, customerId);
    const unitsDir = path.join(customersDir, customerEntry.name, 'units');
    if (!(await pathExists(unitsDir))) continue;

    let customerName: string | undefined;
    let customerDescription: string | undefined;
    const customerMetaPath = path.join(customerDir, 'entity.json');
    if (await pathExists(customerMetaPath)) {
      try {
        const customerMeta = await readJson<CustomerEntityMeta>(customerMetaPath);
        customerName = customerMeta.title || customerMeta.legalName || `Customer ${customerId}`;
        customerDescription =
          customerMeta.notes ||
          customerMeta.description ||
          (customerMeta.status ? `Status: ${customerMeta.status}` : undefined) ||
          (customerMeta.accessMethod ? `Access: ${customerMeta.accessMethod}` : undefined);
      } catch (error) {
        console.warn(`Failed to parse customer metadata for ${customerId}:`, error);
      }
    }

    const unitEntries = await fs.readdir(unitsDir, { withFileTypes: true });
    for (const unitEntry of unitEntries) {
      if (!unitEntry.isDirectory()) continue;
      const entityFile = path.join(unitsDir, unitEntry.name, 'entity.json');
      if (await pathExists(entityFile)) {
        const entity = await readJson<UnitEntity>(entityFile);
        unitRecords.push({
          filePath: entityFile,
          entity,
          customerId,
          customerName,
          customerDescription
        });
      }
    }
  }

  return unitRecords;
}
