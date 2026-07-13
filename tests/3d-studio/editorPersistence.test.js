import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import useEditor from '../../src/3d-studio/store/useEditor.js'
import {
  buildFocusZoneWorkbenchSaveRequest,
  pickStudioSaveEnvelope,
  planDirtySave,
  planStudioSaveSuccess,
  runWithEditorMutationLock,
  shouldRetainStudioSaveEnvelope,
  withExpectedRevision,
} from '../../src/3d-studio/savePersistence.js'

test('studio save version does not clear edits made while a save is in flight', () => {
  const editor = useEditor.getState()
  editor.reset()

  useEditor.getState().setDirty(true)
  const saveVersion = useEditor.getState().changeVersion
  useEditor.getState().setDirty(true)
  useEditor.getState().markSaved(saveVersion)

  assert.equal(useEditor.getState().dirty, true)
  assert.equal(useEditor.getState().savedVersion, saveVersion)
  assert.ok(useEditor.getState().changeVersion > saveVersion)
})

test('studio save version clears dirty only after the latest edit is persisted', () => {
  useEditor.getState().reset()
  useEditor.getState().setDirty(true)
  useEditor.getState().setDirty(true)
  const latestVersion = useEditor.getState().changeVersion

  useEditor.getState().markSaved(latestVersion)

  assert.equal(useEditor.getState().dirty, false)
  assert.equal(useEditor.getState().savedVersion, latestVersion)
})

test('manual-save studio reports dirty without scheduling autosave', () => {
  const plan = planDirtySave({
    hasSaveHandler: true,
    dirty: true,
    saveStatus: 'saved',
    autoSaveDelayMs: 0,
    saveInFlight: false,
  })

  assert.deepEqual(plan, {
    markDirty: true,
    scheduleAutoSave: false,
    queueAfterFlight: false,
  })
})

test('studio project update carries the revision used to build the save', () => {
  const payload = withExpectedRevision({ snapshotJson: { sceneType: 'outdoor-event' } }, 7)

  assert.equal(payload.expectedRevision, 7)
})

test('focus-zone workbench save carries one project-bound mutation contract', () => {
  const snapshotJson = { sceneType: 'outdoor-event', editorDocument: { solids: [] } }
  const payload = buildFocusZoneWorkbenchSaveRequest({
    focusZoneId: 'zone-1',
    warehouseId: 'warehouse-1',
    snapshotJson,
    expectedRevision: 12,
    clientMutationId: 'mutation-1',
  })

  assert.deepEqual(payload, {
    focusZoneId: 'zone-1',
    warehouseId: 'warehouse-1',
    snapshotJson,
    expectedRevision: 12,
    clientMutationId: 'mutation-1',
  })
})

test('StudioProjectPage routes focus-zone saves through the atomic workbench endpoint', () => {
  const source = readFileSync(
    new URL('../../src/views/app/StudioProjectPage.jsx', import.meta.url),
    'utf8',
  )
  const saveStart = source.indexOf('const handleWorkbenchSave')
  const saveEnd = source.indexOf('const handleSaveAssetTemplate', saveStart)
  const saveBlock = source.slice(saveStart, saveEnd)

  assert.ok(saveStart > 0 && saveEnd > saveStart)
  assert.match(saveBlock, /siteModeApi\.saveFocusZoneWorkbench\(/)
  assert.doesNotMatch(saveBlock, /siteModeApi\.saveSiteMode\(/)
  assert.match(saveBlock, /const savedProject = await persistSnapshot\(/)
  assert.doesNotMatch(saveBlock, /updateTerrainWorkZone\(/)
  assert.doesNotMatch(source, /studioInitialSnapshotGeneratedAt/)
  assert.match(source, /isSiteModeBoundTerrainWorkZone\(focusZone\)/)
})

test('bound site projects reopen through SiteMode instead of the generic editor', () => {
  const source = readFileSync(
    new URL('../../src/views/app/StudioProjectsPage.jsx', import.meta.url),
    'utf8',
  )
  const openStart = source.indexOf('async function handleOpenProject')
  const openEnd = source.indexOf('async function handleDelete', openStart)
  const openBlock = source.slice(openStart, openEnd)

  assert.ok(openStart > 0 && openEnd > openStart)
  assert.match(openBlock, /listTerrainWorkZones/)
  assert.match(openBlock, /isSiteModeBoundTerrainWorkZone/)
  assert.match(openBlock, /\/3d-studio\/site/)
  assert.match(openBlock, /focusZoneId/)

  const directSource = readFileSync(
    new URL('../../src/views/app/StudioProjectPage.jsx', import.meta.url),
    'utf8',
  )
  const loadStart = directSource.indexOf('const loadProject')
  const loadEnd = directSource.indexOf('useEffect(() => {\n    loadProject()', loadStart)
  const loadBlock = directSource.slice(loadStart, loadEnd)
  assert.match(loadBlock, /listTerrainWorkZones/)
  assert.match(loadBlock, /\/3d-studio\/site/)
  assert.match(loadBlock, /navigate\(url\.pathname \+ url\.search, \{ replace: true \}\)/)
})

test('autosave queues the latest edit while a save is in flight', () => {
  const plan = planDirtySave({
    hasSaveHandler: true,
    dirty: true,
    saveStatus: 'saving',
    autoSaveDelayMs: 1500,
    saveInFlight: true,
  })

  assert.deepEqual(plan, {
    markDirty: false,
    scheduleAutoSave: false,
    queueAfterFlight: true,
  })
})

test('response-loss retry replays the same save envelope before saving later edits', () => {
  const originalEnvelope = {
    snapshotJson: { editorDocument: { solids: [{ id: 'first' }] } },
    saveVersion: 4,
    expectedRevision: 8,
    clientMutationId: 'mutation-original',
  }
  const newerEnvelope = {
    snapshotJson: { editorDocument: { solids: [{ id: 'later' }] } },
    saveVersion: 5,
    expectedRevision: 8,
    clientMutationId: 'mutation-new',
  }

  assert.equal(shouldRetainStudioSaveEnvelope(new Error('Network Error')), true)
  assert.equal(shouldRetainStudioSaveEnvelope({ status: 503 }), true)
  assert.equal(shouldRetainStudioSaveEnvelope({ status: 409 }), false)
  assert.equal(
    pickStudioSaveEnvelope(originalEnvelope, newerEnvelope),
    originalEnvelope,
    'retry must preserve snapshot, revision and mutation id as one envelope',
  )
  assert.deepEqual(planStudioSaveSuccess(originalEnvelope, 5, 1500), {
    savedVersion: 4,
    hasNewerEdits: true,
    queueLatest: true,
  })
})

test('scene switches clear retry envelopes and ignore an old in-flight response', () => {
  const source = readFileSync(
    new URL('../../src/3d-studio/App.jsx', import.meta.url),
    'utf8',
  )
  const resetStart = source.indexOf('if (sceneLoadedRef.current && previousSceneKeyRef.current === sceneKey)')
  const resetEnd = source.indexOf('const buildSnapshot', resetStart)
  const resetBlock = source.slice(resetStart, resetEnd)

  assert.match(resetBlock, /sceneGenerationRef\.current \+= 1/)
  assert.match(resetBlock, /pendingSaveEnvelopeRef\.current = null/)
  assert.match(source, /saveEnvelope\.sceneGeneration !== sceneGenerationRef\.current/)
})

test('undo and redo mark the changed document dirty for autosave', () => {
  const source = readFileSync(
    new URL('../../src/3d-studio/App.jsx', import.meta.url),
    'utf8',
  )
  assert.match(source, /if \(redo\(\)\) setDirty\(true\)/)
  assert.match(source, /if \(undo\(\)\) setDirty\(true\)/)
})

test('revision conflict pauses dirty labeling and autosave coordination', () => {
  const plan = planDirtySave({
    hasSaveHandler: true,
    dirty: true,
    saveStatus: 'conflict',
    autoSaveDelayMs: 1500,
    saveInFlight: false,
  })

  assert.deepEqual(plan, {
    markDirty: false,
    scheduleAutoSave: false,
    queueAfterFlight: false,
  })
})

test('external mutation lock pauses dirty labeling and autosave coordination', () => {
  const plan = planDirtySave({
    hasSaveHandler: true,
    dirty: true,
    saveStatus: 'saving',
    autoSaveDelayMs: 1500,
    saveInFlight: true,
    savePaused: true,
  })

  assert.deepEqual(plan, {
    markDirty: false,
    scheduleAutoSave: false,
    queueAfterFlight: false,
  })
})

test('site rebake waits for the editor flush and keeps the lock through response application', async () => {
  const events = []
  let finishFlush
  const flushPending = new Promise((resolve) => {
    finishFlush = resolve
  })
  const controller = {
    async pauseAndFlush() {
      events.push('locked')
      await flushPending
      events.push('flushed')
      return true
    },
    resume() {
      events.push('resumed')
    },
  }

  const operation = runWithEditorMutationLock({
    controller,
    mutation: async () => {
      events.push('rebake-request')
      events.push('response-applied')
      return { revision: 9 }
    },
  })

  await Promise.resolve()
  assert.deepEqual(events, ['locked'])
  finishFlush()

  const result = await operation
  assert.deepEqual(events, [
    'locked',
    'flushed',
    'rebake-request',
    'response-applied',
    'resumed',
  ])
  assert.equal(result.started, true)
  assert.equal(result.value.revision, 9)
})

test('site rebake is cancelled when the editor cannot flush its latest edit', async () => {
  const events = []
  const result = await runWithEditorMutationLock({
    controller: {
      async pauseAndFlush() {
        events.push('flush-failed')
        return false
      },
      resume() {
        events.push('resumed')
      },
    },
    mutation: async () => {
      events.push('rebake-request')
    },
  })

  assert.deepEqual(events, ['flush-failed', 'resumed'])
  assert.deepEqual(result, {
    started: false,
    reason: 'save-failed',
    value: null,
  })
})
