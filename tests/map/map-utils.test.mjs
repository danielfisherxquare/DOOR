import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

async function loadMapUtils() {
  const outdir = path.join(os.tmpdir(), `door-map-utils-${process.pid}-${Date.now()}`);
  await fs.mkdir(outdir, { recursive: true });
  await esbuild.build({
    entryPoints: [
      path.resolve('src/utils/map/measurements.ts'),
      path.resolve('src/utils/map/geojsonExchange.ts'),
      path.resolve('src/utils/map/providerRuntimeStatus.ts'),
    ],
    outdir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });

  const measurements = await import(pathToFileURL(path.join(outdir, 'measurements.js')).href)
  const geojsonExchange = await import(pathToFileURL(path.join(outdir, 'geojsonExchange.js')).href)
  const providerRuntimeStatus = await import(
    pathToFileURL(path.join(outdir, 'providerRuntimeStatus.js')).href
  )

  return {
    measurements,
    geojsonExchange,
    providerRuntimeStatus,
    cleanup: () => fs.rm(outdir, { recursive: true, force: true }),
  };
}

test('provider runtime status never reports ready when a required provider failed or is unavailable', async () => {
  const { providerRuntimeStatus, cleanup } = await loadMapUtils()
  try {
    const sources = providerRuntimeStatus.createProviderRuntimeSources()
    sources.imagery = {
      ...sources.imagery,
      status: 'ready',
      provider: 'Esri 卫星影像',
    }
    sources.terrain = {
      ...sources.terrain,
      status: 'ready',
      provider: 'ArcGIS Terrain',
    }

    assert.equal(
      providerRuntimeStatus.deriveProviderOverallStatus(sources, false).overall,
      'ready',
      'disabled buildings are optional'
    )
    assert.equal(
      providerRuntimeStatus.deriveProviderOverallStatus(sources, true).overall,
      'unavailable',
      'enabled but unavailable buildings block ready'
    )

    sources.buildings = {
      ...sources.buildings,
      status: 'failed',
      provider: 'OSM 白模',
      retryable: true,
    }
    assert.equal(providerRuntimeStatus.deriveProviderOverallStatus(sources, true).overall, 'failed')

    sources.buildings = { ...sources.buildings, status: 'ready' }
    sources.terrain = { ...sources.terrain, status: 'degraded' }
    assert.equal(
      providerRuntimeStatus.deriveProviderOverallStatus(sources, true).overall,
      'degraded'
    )
  } finally {
    await cleanup()
  }
})

test('provider errors are classified into safe retry behavior', async () => {
  const { providerRuntimeStatus, cleanup } = await loadMapUtils()
  try {
    assert.deepEqual(
      providerRuntimeStatus.classifyProviderError({ statusCode: 401, message: 'request failed' }),
      {
        code: 'unauthorized',
        message: '访问凭据无效或没有权限',
        retryable: false,
        statusCode: 401,
      }
    )
    assert.equal(
      providerRuntimeStatus.classifyProviderError({ statusCode: 429 }).code,
      'rate-limited'
    )
    assert.equal(
      providerRuntimeStatus.classifyProviderError(new Error('network connection failed')).retryable,
      true
    )
    assert.equal(
      providerRuntimeStatus.classifyProviderError(new DOMException('superseded', 'AbortError'))
        .code,
      'aborted'
    )
  } finally {
    await cleanup()
  }
})

test('tileset presentation refresh preserves failure evidence until a real clean load', async () => {
  const { providerRuntimeStatus, cleanup } = await loadMapUtils()
  try {
    assert.equal(
      providerRuntimeStatus.deriveTilesetRuntimeStatus({
        initialTilesLoaded: false,
        failedTileCount: 3,
        timedOut: false,
      }),
      'failed'
    )
    assert.equal(
      providerRuntimeStatus.deriveTilesetRuntimeStatus({
        initialTilesLoaded: true,
        failedTileCount: 1,
        timedOut: false,
      }),
      'degraded',
      'initial load cannot erase a previously observed tile failure'
    )
    assert.equal(
      providerRuntimeStatus.deriveTilesetRuntimeStatus({
        initialTilesLoaded: true,
        failedTileCount: 0,
        timedOut: false,
      }),
      'ready',
      'only a clean initialTilesLoaded event is ready'
    )
  } finally {
    await cleanup()
  }
})

test('imagery and terrain stay loading until a real tile request resolves', async () => {
  const { providerRuntimeStatus, cleanup } = await loadMapUtils()
  try {
    let resolveTile
    const tilePromise = new Promise((resolve) => {
      resolveTile = resolve
    })
    let successfulTileCount = 0
    const requestTile = providerRuntimeStatus.observeFirstSuccessfulTileRequest(
      () => tilePromise,
      () => {
        successfulTileCount += 1
      }
    )

    assert.equal(
      providerRuntimeStatus.deriveTileRequestRuntimeStatus({
        hasSuccessfulTile: false,
        failedTileCount: 0,
      }),
      'loading',
      'provider construction alone is not ready evidence'
    )

    const firstRequest = requestTile()
    const secondRequest = requestTile()
    assert.equal(firstRequest, tilePromise, 'observer must preserve the provider request promise')
    assert.equal(successfulTileCount, 0, 'pending tile requests are not success evidence')

    resolveTile({ tile: 'ok' })
    await Promise.all([firstRequest, secondRequest])
    assert.equal(successfulTileCount, 1, 'only the first resolved tile records success')
    assert.equal(
      providerRuntimeStatus.deriveTileRequestRuntimeStatus({
        hasSuccessfulTile: true,
        failedTileCount: 0,
      }),
      'ready'
    )
    assert.equal(
      providerRuntimeStatus.deriveTileRequestRuntimeStatus(
        { hasSuccessfulTile: true, failedTileCount: 0 },
        'degraded'
      ),
      'degraded',
      'a working fallback remains degraded after its first successful tile'
    )
  } finally {
    await cleanup()
  }
})

test('a rejected tile is not success evidence and repeated pre-success failures become failed', async () => {
  const { providerRuntimeStatus, cleanup } = await loadMapUtils()
  try {
    let successfulTileCount = 0
    const requestTile = providerRuntimeStatus.observeFirstSuccessfulTileRequest(
      () => Promise.reject(new Error('network failed')),
      () => {
        successfulTileCount += 1
      }
    )

    await assert.rejects(requestTile(), /network failed/)
    assert.equal(successfulTileCount, 0)
    assert.equal(
      providerRuntimeStatus.deriveTileRequestRuntimeStatus({
        hasSuccessfulTile: false,
        failedTileCount: 3,
      }),
      'failed'
    )
  } finally {
    await cleanup()
  }
})

test('terrain double fallback reports the ArcGIS failure and uses its retry behavior', async () => {
  const { providerRuntimeStatus, cleanup } = await loadMapUtils()
  try {
    const classified = providerRuntimeStatus.classifyTerrainFallbackFailure(
      { statusCode: 401, message: 'invalid token' },
      new Error('network connection failed')
    )

    assert.equal(classified.code, 'network')
    assert.equal(classified.retryable, true)
    assert.match(classified.message, /访问凭据无效/)
    assert.match(classified.message, /ArcGIS 备用地形：网络或上游服务暂时不可用/)
  } finally {
    await cleanup()
  }
})

test('MapView3D wires ready transitions to resolved imagery and terrain tile requests', async () => {
  const source = await fs.readFile('src/components/map/MapView3D.tsx', 'utf8')
  const terrainStart = source.indexOf('const applyTerrainProvider')
  const terrainEnd = source.indexOf('void (async () =>', terrainStart)
  const imageryStart = source.indexOf("const generation = beginProviderLoad('imagery'")
  const imageryEnd = source.indexOf("if (buildingStyle === 'osmGeoJson')", imageryStart)
  assert.ok(terrainStart > 0 && terrainEnd > terrainStart)
  assert.ok(imageryStart > 0 && imageryEnd > imageryStart)

  const terrain = source.slice(terrainStart, terrainEnd)
  const imagery = source.slice(imageryStart, imageryEnd)
  assert.match(terrain, /observeFirstTerrainTileSuccess\(/)
  assert.match(terrain, /deriveTileRequestRuntimeStatus\(/)
  assert.match(terrain, /status: successStatus === 'ready' \? 'loading' : 'degraded'/)
  assert.match(imagery, /observeFirstImageryTileSuccess\(/)
  assert.match(imagery, /deriveTileRequestRuntimeStatus\(/)
  assert.match(imagery, /status: successStatus === 'ready' \? 'loading' : 'degraded'/)
  assert.match(
    source,
    /terminalFailure = classifyTerrainFallbackFailure\(error, fallbackError\)/
  )
})

test('latest viewport request wins when Overpass completions arrive out of order', async () => {
  const { providerRuntimeStatus, cleanup } = await loadMapUtils()
  try {
    const gate = providerRuntimeStatus.createLatestRequestGate()
    const committed = []
    const staleCleaned = []
    const deferred = () => {
      let resolve
      const promise = new Promise((next) => { resolve = next })
      return { promise, resolve }
    }
    const complete = (token, label) => {
      if (gate.isCurrent(token)) committed.push(label)
      else staleCleaned.push(label)
    }

    const viewportA = gate.begin('bbox-a')
    const completionA = deferred()
    const finishedA = completionA.promise.then(() => complete(viewportA, 'A'))

    const viewportB = gate.begin('bbox-b')
    const completionB = deferred()
    const finishedB = completionB.promise.then(() => complete(viewportB, 'B'))

    completionB.resolve()
    await finishedB
    completionA.resolve()
    await finishedA

    assert.deepEqual(committed, ['B'])
    assert.deepEqual(staleCleaned, ['A'])

    const source = await fs.readFile('src/components/map/MapView3D.tsx', 'utf8')
    assert.match(source, /const request = requestGate\.begin\(bboxKey\)/)
    assert.match(source, /if \(!isRequestCurrent\(request\)\) \{\s+disposeStaleDataSource\(dataSource\)/)
  } finally {
    await cleanup()
  }
})

test('OSM presentation changes update the existing tileset without restarting its provider', async () => {
  const source = await fs.readFile('src/components/map/MapView3D.tsx', 'utf8')
  const effectStart = source.indexOf('const osmTileset = osmBuildingsRef.current')
  const effectEnd = source.indexOf('// ── 三方OSM', effectStart)
  assert.ok(effectStart > 0 && effectEnd > effectStart, 'presentation-only effect must exist')

  const effectSource = source.slice(effectStart, effectEnd)
  assert.match(effectSource, /applyOsmTilesetPresentation\(/)
  assert.match(
    effectSource,
    /\[buildingStyle, hiddenOsmBuildings, renderQuality, viewerReadyToken\]/
  )
  assert.doesNotMatch(effectSource, /beginProviderLoad\(/)
  assert.doesNotMatch(effectSource, /updateProviderStatus\(/)
})

test('measureGeometry returns polygon area and perimeter summary', async () => {
  const { measurements, cleanup } = await loadMapUtils();
  try {
    const result = measurements.measureGeometry({
      type: 'Polygon',
      coordinates: [[
        [104.0, 30.0],
        [104.01, 30.0],
        [104.01, 30.01],
        [104.0, 30.01],
        [104.0, 30.0],
      ]],
    });

    assert.equal(result.vertexCount, 5);
    assert.ok(result.areaSquareMeters > 0);
    assert.ok(result.perimeterMeters > 0);
    assert.match(result.summary, /面积/);
  } finally {
    await cleanup();
  }
});

test('GeoJSON exchange preserves ArcSpro map metadata and imports as local drafts', async () => {
  const { geojsonExchange, cleanup } = await loadMapUtils();
  try {
    const feature = {
      type: 'Feature',
      id: 'feature-1',
      geometry: { type: 'Point', coordinates: [104.07, 30.57] },
      properties: { id: 'feature-1', name: '补给站', backendObjectId: 'remote-1' },
    };
    const node = {
      id: 'feature-1',
      name: '补给站',
      type: 'feature',
      visible: true,
      featureType: 'marker',
      color: '#3388ff',
      backendObjectId: 'remote-1',
      syncStatus: 'synced',
    };

    const collection = geojsonExchange.buildMapFeatureCollection([node], [feature], {
      exportName: '50km组 GIS 重点区',
      source: 'gis-map',
    });
    assert.equal(collection.features[0].properties.backendObjectId, 'remote-1');
    assert.equal(collection.features[0].properties.featureType, 'marker');
    assert.equal(collection.properties.doorExport.kind, 'gis-map-feature-collection');
    assert.equal(collection.properties.doorExport.export.originalBaseName, '50km组 GIS 重点区');
    assert.equal(collection.properties.doorExport.export.filenamePolicy, 'ascii-safe');
    assert.ok(collection.properties.doorExport.export.baseName.startsWith('50km-GIS-'));
    assert.deepEqual(collection.properties.doorExport.export.coordinateSystem, {
      type: 'wgs84',
      xAxis: 'longitude',
      yAxis: 'latitude',
      zAxis: 'height',
    });
    assert.deepEqual(collection.properties.doorExport.stats, {
      featureCount: 1,
      nodeCount: 1,
    });

    const imported = geojsonExchange.parseMapFeatureCollection(collection);
    assert.equal(imported.length, 1);
    assert.equal(imported[0].node.name, '补给站');
    assert.equal(imported[0].node.syncStatus, 'local');
    assert.equal(imported[0].feature.properties.backendObjectId, null);
  } finally {
    await cleanup();
  }
});
