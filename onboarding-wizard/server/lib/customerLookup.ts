import path from 'path';
import { promises as fs } from 'fs';
import type { CustomerLookupRequest, CustomerLookupResponse } from '../../shared/onboarding.js';
import { pathExists, readJson } from './fileUtils.js';

interface EntityIndexEntry {
  entityId: number | string;
  title?: string;
  legalName?: string;
}

interface DirectoryEntry {
  customerId: string;
  displayName?: string;
  legalName?: string;
  normalizedTitle?: string;
  normalizedLegalName?: string;
}

const directoryCache = new Map<string, Promise<DirectoryEntry[]>>();

function normalize(value?: string | null): string | undefined {
  return value?.trim().toLowerCase();
}

async function loadDirectory(outputRoot: string): Promise<DirectoryEntry[]> {
  if (!directoryCache.has(outputRoot)) {
    directoryCache.set(
      outputRoot,
      (async () => {
        const indexPath = path.join(outputRoot, 'index.json');

        if (await pathExists(indexPath)) {
          const indexData = await readJson<{ entities?: EntityIndexEntry[] }>(indexPath);
          if (Array.isArray(indexData.entities)) {
            return indexData.entities
              .map((entity) => {
                const customerId = String(entity.entityId);
                const displayName = entity.title || entity.legalName;
                const legalName = entity.legalName;
                return {
                  customerId,
                  displayName,
                  legalName,
                  normalizedTitle: normalize(displayName),
                  normalizedLegalName: normalize(legalName)
                } satisfies DirectoryEntry;
              })
              .filter((entry) => !!entry.customerId);
          }
        }

        const entries: DirectoryEntry[] = [];
        const children = await fs.readdir(outputRoot, { withFileTypes: true });

        for (const child of children) {
          if (!child.isDirectory()) continue;
          if (!/^\d+$/.test(child.name)) continue;

          const entityPath = path.join(outputRoot, child.name, 'entity.json');
          let displayName: string | undefined;
          let legalName: string | undefined;

          if (await pathExists(entityPath)) {
            try {
              const entityData = await readJson<{ entity?: { title?: string; legalName?: string } }>(entityPath);
              displayName = entityData.entity?.title || entityData.entity?.legalName;
              legalName = entityData.entity?.legalName;
            } catch (error) {
              console.warn(`Failed to parse ${entityPath}:`, error);
            }
          }

          entries.push({
            customerId: child.name,
            displayName,
            legalName,
            normalizedTitle: normalize(displayName),
            normalizedLegalName: normalize(legalName)
          });
        }

        return entries;
      })()
    );
  }

  return directoryCache.get(outputRoot)!;
}

function makeHttpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

function formatEntry(entry: DirectoryEntry): string {
  const parts = [entry.customerId];
  if (entry.displayName) {
    parts.push(entry.displayName);
  }
  return parts.join(' - ');
}

export async function findCustomerByUsername(
  payload: CustomerLookupRequest,
  outputRoot: string
): Promise<CustomerLookupResponse> {
  const username = payload.username?.trim();
  if (!username) {
    throw makeHttpError(400, 'username is required');
  }

  const normalizedQuery = username.toLowerCase();
  const directory = await loadDirectory(outputRoot);

  if (/^\d+$/.test(username)) {
    const exactId = directory.find((entry) => entry.customerId === username);
    if (exactId) {
      return {
        customerId: exactId.customerId,
        displayName: exactId.displayName,
        legalName: exactId.legalName,
        matchedField: 'customerId',
        matchType: 'id'
      } satisfies CustomerLookupResponse;
    }

    const entityPath = path.join(outputRoot, username, 'entity.json');
    if (await pathExists(entityPath)) {
      const entityData = await readJson<{ entity?: { title?: string; legalName?: string } }>(entityPath);
      const displayName = entityData.entity?.title || entityData.entity?.legalName;
      return {
        customerId: username,
        displayName,
        legalName: entityData.entity?.legalName,
        matchedField: 'customerId',
        matchType: 'id'
      } satisfies CustomerLookupResponse;
    }
  }

  const exactMatch = directory.find((entry) => {
    if (entry.normalizedTitle === normalizedQuery) {
      return true;
    }
    if (entry.normalizedLegalName === normalizedQuery) {
      return true;
    }
    return false;
  });

  if (exactMatch) {
    const matchedField = exactMatch.normalizedTitle === normalizedQuery ? 'title' : 'legalName';
    return {
      customerId: exactMatch.customerId,
      displayName: exactMatch.displayName,
      legalName: exactMatch.legalName,
      matchedField,
      matchType: 'exact'
    } satisfies CustomerLookupResponse;
  }

  const partialMatches = directory.filter((entry) => {
    if (entry.normalizedTitle && entry.normalizedTitle.includes(normalizedQuery)) {
      return true;
    }
    if (entry.normalizedLegalName && entry.normalizedLegalName.includes(normalizedQuery)) {
      return true;
    }
    return false;
  });

  if (partialMatches.length === 1) {
    const [match] = partialMatches;
    const matchedField = match.normalizedTitle?.includes(normalizedQuery) ? 'title' : 'legalName';
    return {
      customerId: match.customerId,
      displayName: match.displayName,
      legalName: match.legalName,
      matchedField,
      matchType: 'partial'
    } satisfies CustomerLookupResponse;
  }

  if (partialMatches.length > 1) {
    const preview = partialMatches.slice(0, 5).map(formatEntry);
    const suffix = partialMatches.length > preview.length ? '...' : '';
    throw makeHttpError(409, `Multiple matches found for "${username}": ${preview.join(', ')}${suffix}`);
  }

  throw makeHttpError(404, `No customer found for "${username}"`);
}
