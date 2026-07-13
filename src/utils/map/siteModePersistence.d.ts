import type {
  JsonObject,
  SiteModeMutationResult,
  SiteProviderStatus,
  TerrainWorkZoneRecord,
} from '../../services/siteModeApi'

export function createSiteProjectSnapshot(input: { name: string }): JsonObject

export function buildSiteModeSaveRequest(input: {
  focusZoneId: string
  snapshotJson: JsonObject
  expectedRevision: number
  clientMutationId?: string
}): {
  focusZoneId: string
  snapshotJson: JsonObject
  expectedRevision: number
  clientMutationId?: string
}

export function hydrateSiteFocusZone(
  focusZone: TerrainWorkZoneRecord,
): TerrainWorkZoneRecord

export function resolveSiteBakePresentation(input: {
  focusZone: TerrainWorkZoneRecord
  providerStatus?: SiteProviderStatus | null
  bakeStatus?: SiteModeMutationResult['bakeStatus'] | null
  warnings?: string[] | null
}): {
  providerStatus: SiteProviderStatus
  bakeStatus: SiteModeMutationResult['bakeStatus']
  warnings: string[]
}
