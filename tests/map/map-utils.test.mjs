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
    ],
    outdir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });

  const measurements = await import(pathToFileURL(path.join(outdir, 'measurements.js')).href);
  const geojsonExchange = await import(pathToFileURL(path.join(outdir, 'geojsonExchange.js')).href);

  return {
    measurements,
    geojsonExchange,
    cleanup: () => fs.rm(outdir, { recursive: true, force: true }),
  };
}

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
