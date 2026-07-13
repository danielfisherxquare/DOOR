import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

async function loadTerrainWorkZones() {
  const outdir = path.join(os.tmpdir(), `door-site-mode-zone-${process.pid}-${Date.now()}`)
  await fs.mkdir(outdir, { recursive: true })
  await esbuild.build({
    entryPoints: [path.resolve('src/utils/map/terrainWorkZones.ts')],
    outdir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  })

  return {
    module: await import(pathToFileURL(path.join(outdir, 'terrainWorkZones.js')).href),
    cleanup: () => fs.rm(outdir, { recursive: true, force: true }),
  }
}

test('site-mode terrain zones keep their project-bound mutation guard after hydration', async () => {
  const { module, cleanup } = await loadTerrainWorkZones()
  try {
    const fromMetadata = module.terrainWorkZoneToMapNode({
      id: 'zone-site',
      projectId: 'project-site',
      includedObjectIds: ['object-a', 'object-b'],
      zoneType: 'focus-zone',
      clipPolygonWgs84: {
        type: 'Polygon',
        coordinates: [[[104, 30], [104.01, 30], [104.01, 30.01], [104, 30]]],
      },
      metadata: { purpose: 'site-mode' },
    })
    assert.equal(fromMetadata.siteModeBound, true)
    assert.equal(module.isSiteModeBoundTerrainWorkZone(fromMetadata), true)
    assert.deepEqual(fromMetadata.includedObjectIds, ['object-a', 'object-b'])

    const fromBakeSnapshot = module.terrainWorkZoneToMapNode({
      id: 'zone-restored',
      snapshotJson: { siteBake: { status: 'degraded' } },
    })
    assert.equal(fromBakeSnapshot.siteModeBound, true)

    const genericZone = module.terrainWorkZoneToMapNode({ id: 'zone-generic' })
    assert.equal(genericZone.siteModeBound, false)

    assert.equal(module.isInternalMapSelectionExportZone({
      metadata: { purpose: 'map-selection-export', internal: true },
    }), true)
    assert.equal(module.isInternalMapSelectionExportZone({
      metadata: { purpose: 'site-mode' },
    }), false)
  } finally {
    await cleanup()
  }
})

test('GIS site bake response keeps included object associations in the local map node', async () => {
  const source = await fs.readFile('src/components/map/MapFeaturePanel.tsx', 'utf8')
  const handlerStart = source.indexOf('const updateNodeFromWorkZone')
  const handlerEnd = source.indexOf('const updateNodeFromGeneratedScene', handlerStart)
  assert.ok(handlerStart > 0 && handlerEnd > handlerStart)

  const handler = source.slice(handlerStart, handlerEnd)
  assert.match(handler, /includedObjectIds: nextNode\.includedObjectIds/)
  assert.doesNotMatch(handler, /includedObjectIds: \[\]/)
})

test('2D map deletion routes share the site-mode binding guard', async () => {
  const source = await fs.readFile('src/components/map/MapView2D.tsx', 'utf8')
  const handlerStart = source.indexOf('function handleDeleteSelected()')
  const handlerEnd = source.indexOf('// 初始化地图', handlerStart)
  assert.ok(handlerStart > 0 && handlerEnd > handlerStart)
  const handler = source.slice(handlerStart, handlerEnd)
  assert.match(handler, /selectedFeatureNode\.siteModeBound/)
  assert.match(handler, /return;/)
  assert.match(source, /disabled=\{!selectedFeatureNode \|\| selectedFeatureNode\.siteModeBound\}/)
  assert.match(source, /disabled=\{selectedFeatureNode\.siteModeBound\}/)
})

test('GIS site bake retries reuse the pending mutation id after a lost response', async () => {
  const source = await fs.readFile('src/components/map/MapFeaturePanel.tsx', 'utf8')
  const handlerStart = source.indexOf('const handleGenerateSiteScene')
  const handlerEnd = source.indexOf('const getTabs', handlerStart)
  assert.ok(handlerStart > 0 && handlerEnd > handlerStart)

  const handler = source.slice(handlerStart, handlerEnd)
  assert.match(source, /pendingSiteBakeMutationRef = useRef/)
  assert.match(handler, /pendingMutation\?\.key === mutationKey/)
  assert.match(handler, /clientMutationId,/)
  assert.match(handler, /pendingSiteBakeMutationRef\.current = null/)
  assert.ok(
    handler.indexOf('pendingSiteBakeMutationRef.current = null')
      < handler.indexOf('} catch'),
    'only a confirmed response clears the pending mutation id',
  )
})
