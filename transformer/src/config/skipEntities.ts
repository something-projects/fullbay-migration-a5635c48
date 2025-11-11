/**
 * Configuration for entities to skip during full processing
 * 
 * Entities listed in this array will only receive basic data processing
 * and will be skipped during full customer/service order processing,
 * unless manually triggered via the fetch data button in the dashboard.
 */

export const SKIP_ENTITIES_CONFIG = {
  /**
   * Array of entity IDs to skip during full processing
   * These entities will only get basic data (entity info, locations, employees)
   * but will skip customer and service order processing for performance reasons
   */
  skipEntityIds: [
    1,  // Demo account - COPY (large dataset, skip for performance)
    3   // Default Company - COPY (skip for performance)
  ],

  /**
   * Reason descriptions for why entities are skipped (for logging/documentation)
   */
  skipReasons: {
    1: "Large dataset - skip for performance optimization",
    3: "Default test entity - skip for performance optimization"
  } as Record<number, string>
};

/**
 * Check if an entity should be skipped during full processing
 */
export function shouldSkipEntity(entityId: number): boolean {
  return SKIP_ENTITIES_CONFIG.skipEntityIds.includes(entityId);
}

/**
 * Get the reason why an entity is being skipped
 */
export function getSkipReason(entityId: number): string {
  return SKIP_ENTITIES_CONFIG.skipReasons[entityId] || "Performance optimization";
}

/**
 * Get all entity IDs that are configured to be skipped
 */
export function getSkippedEntityIds(): number[] {
  return [...SKIP_ENTITIES_CONFIG.skipEntityIds];
}
