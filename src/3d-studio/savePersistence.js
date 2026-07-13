export function planDirtySave({
  hasSaveHandler,
  dirty,
  saveStatus,
  autoSaveDelayMs,
  saveInFlight,
  savePaused = false,
}) {
  if (!hasSaveHandler || !dirty) {
    return { markDirty: false, scheduleAutoSave: false, queueAfterFlight: false }
  }

  const protectedStatus = saveStatus === 'saving' || saveStatus === 'conflict' || savePaused
  const autoSaveEnabled =
    Number(autoSaveDelayMs) > 0 && saveStatus !== 'conflict' && !savePaused

  return {
    markDirty: !protectedStatus,
    scheduleAutoSave: autoSaveEnabled && !saveInFlight,
    queueAfterFlight: autoSaveEnabled && saveInFlight,
  }
}

export function pickStudioSaveEnvelope(pendingEnvelope, nextEnvelope) {
  return pendingEnvelope || nextEnvelope
}

export function shouldRetainStudioSaveEnvelope(error) {
  const status = Number(error?.status ?? error?.response?.status)
  if (!Number.isFinite(status) || status <= 0) return true
  return status >= 500 || [408, 425, 429].includes(status)
}

export function planStudioSaveSuccess(envelope, currentChangeVersion, autoSaveDelayMs) {
  const savedVersion = Number(envelope?.saveVersion) || 0
  const hasNewerEdits = Number(currentChangeVersion) > savedVersion
  return {
    savedVersion,
    hasNewerEdits,
    queueLatest: hasNewerEdits && Number(autoSaveDelayMs) > 0,
  }
}

export function withExpectedRevision(payload, expectedRevision) {
  const revision = Number(expectedRevision)
  if (!Number.isInteger(revision) || revision < 1) return payload
  return { ...payload, expectedRevision: revision }
}

export function buildFocusZoneWorkbenchSaveRequest({
  focusZoneId,
  warehouseId,
  snapshotJson,
  expectedRevision,
  clientMutationId,
}) {
  const revision = Number(expectedRevision)
  if (!focusZoneId || !warehouseId || !Number.isInteger(revision) || revision < 1) {
    throw new Error('重点区工作台保存缺少有效的项目、仓库或版本信息')
  }

  return {
    focusZoneId,
    warehouseId,
    snapshotJson,
    expectedRevision: revision,
    clientMutationId,
  }
}

export async function runWithEditorMutationLock({ controller, mutation }) {
  if (
    !controller ||
    typeof controller.pauseAndFlush !== 'function' ||
    typeof controller.resume !== 'function'
  ) {
    return { started: false, reason: 'controller-unavailable', value: null }
  }
  if (typeof mutation !== 'function') {
    throw new TypeError('mutation must be a function')
  }

  try {
    const flushed = await controller.pauseAndFlush()
    if (!flushed) {
      return { started: false, reason: 'save-failed', value: null }
    }
    return { started: true, reason: null, value: await mutation() }
  } finally {
    controller.resume()
  }
}
