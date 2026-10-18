/**
 * Where a record came from. UI must surface this honestly.
 * - synthetic: deterministic demo/scenario data (not official fixtures)
 * - api: loaded from the ReMatch backend
 * - unavailable: requested but not present for this entity
 */
export type DataProvenance = 'synthetic' | 'api' | 'unavailable'

export function isSyntheticProvenance(
  provenance: DataProvenance,
): provenance is 'synthetic' {
  return provenance === 'synthetic'
}
