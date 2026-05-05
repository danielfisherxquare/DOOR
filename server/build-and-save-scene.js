// Build the full studio scene (terrain + OSM buildings) server-side
// and save to database, bypassing the browser entirely.

import { Client } from 'pg';
import { createHash, randomUUID } from 'crypto';

// --- Reimplement the core scene building logic from focusZoneStudioScene.js ---

function generateId() {
  return randomUUID();
}

function terrainPatchToMesh(terrainPatch) {
  if (!terrainPatch) return null;
  
  const { rows, cols, heightsRelative, boundsMeters, elevationOffsetMeters } = terrainPatch;
  
  // Create a terrain mesh with vertices and faces
  const vertices = [];
  const indices = [];
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const h = (heightsRelative?.[idx] || 0);
      const x = boundsMeters[0] + (c / (cols - 1)) * (boundsMeters[2] - boundsMeters[0]);
      const z = boundsMeters[1] + (r / (rows - 1)) * (boundsMeters[3] - boundsMeters[1]);
      vertices.push([x, h, z]);
    }
  }
  
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i00 = r * cols + c;
      const i10 = i00 + 1;
      const i01 = i00 + cols;
      const i11 = i01 + 1;
      indices.push([i00, i10, i11]);
      indices.push([i00, i11, i01]);
    }
  }
  
  return {
    kind: 'terrain-mesh',
    id: generateId(),
    source: 'arcgis-terrain',
    vertices,
    indices,
    boundsMeters,
    elevationOffsetMeters,
  };
}

function appendOsmBuildings(editorDoc, osmBuildingsData) {
  if (!osmBuildingsData || !osmBuildingsData.buildings) return 0;
  
  const buildings = osmBuildingsData.buildings;
  let count = 0;
  
  for (const b of buildings) {
    const fp = b.footprintWgs84;
    if (!fp?.coordinates?.[0]) continue;
    
    const coords = fp.coordinates[0];
    if (coords.length < 3) continue;
    
    const heightMeters = b.heightMeters || 9.6; // default height
    
    // Create extruded solid
    const solid = {
      kind: 'extruded-solid',
      id: generateId(),
      osmId: b.id || `osm-${count}`,
      heightMeters,
      levels: b.levels || Math.round(heightMeters / 3.2),
      footprintWgs84: fp,
      footprintLocal: null, // would need projection
      color: '#e8e8e8',
    };
    
    editorDoc.solids.push(solid);
    count++;
  }
  
  return count;
}

function appendExtrudedFootprint(editorDoc, focusZone) {
  const boundary = focusZone.boundary_geojson;
  if (!boundary) return;
  
  const boundaryGeojson = typeof boundary === 'string' ? JSON.parse(boundary) : boundary;
  const coords = boundaryGeojson?.coordinates?.[0];
  if (!coords || coords.length < 3) return;
  
  // Create the base plate
  const plateId = generateId();
  editorDoc.profiles.push({
    id: plateId,
    kind: 'polygon',
    coords3d: coords.map(pt => [pt[0], pt[1], 0]),
    closed: true,
  });
  
  // Create thin base plate solid (0.08m thick)
  editorDoc.solids.push({
    kind: 'extruded-solid',
    id: generateId(),
    profileId: plateId,
    heightMeters: 0.08,
    color: '#cccccc',
  });
}

function buildFocusZoneStudioScene({ focusZone, osmBuildings }) {
  const editorDoc = {
    version: 1,
    units: { lengthUnit: 'meter' },
    solids: [],
    profiles: [],
    instances: [],
    meshes: [],
    terrainMeshes: [],
    vertices: [],
  };
  
  // Step 1: Add base plate from focus zone boundary
  appendExtrudedFootprint(editorDoc, focusZone);
  
  // Step 2: Add terrain mesh
  const snap = focusZone.snapshot_json;
  if (snap?.terrainPatch) {
    const terrainMesh = terrainPatchToMesh(snap.terrainPatch);
    if (terrainMesh) {
      editorDoc.terrainMeshes.push(terrainMesh);
    }
  }
  
  // Step 3: Add OSM building solids
  if (snap?.osmBuildings) {
    const count = appendOsmBuildings(editorDoc, snap.osmBuildings);
    console.log(`  → Added ${count} OSM building solids`);
  }
  
  return editorDoc;
}

// --- Main execution ---

const client = new Client({ connectionString: 'postgres://door:door_dev@localhost:5432/door' });

(async () => {
  await client.connect();
  try {
    const zoneId = 'd0d4f34f-36e9-4669-a4db-652047c5129e';
    
    // Fetch work zone
    const wz = await client.query(
      "SELECT * FROM inventory_3d_terrain_work_zones WHERE id = $1",
      [zoneId]
    );
    
    if (!wz.rows[0]) {
      console.error('Work zone not found:', zoneId);
      process.exit(1);
    }
    
    const zone = wz.rows[0];
    console.log('\n=== Building Full Studio Scene ===');
    console.log('Zone:', zone.name);
    console.log('Project:', zone.project_id);
    
    const snap = typeof zone.snapshot_json === 'string' 
      ? JSON.parse(zone.snapshot_json) 
      : zone.snapshot_json;
    
    console.log('\nRaw data available:');
    console.log('  osmBuildings:', snap.osmBuildings?.count || 0, 'buildings');
    console.log('  terrainPatch:', snap.terrainPatch?.source || 'none');
    
    // Build the scene
    console.log('\nBuilding scene...');
    zone.snapshot_json = snap; // pass through for buildFocusZoneStudioScene
    const editorDoc = buildFocusZoneStudioScene({ focusZone: zone });
    
    console.log('\nScene stats:');
    console.log('  solids:', editorDoc.solids.length);
    console.log('  terrainMeshes:', editorDoc.terrainMeshes.length);
    console.log('  profiles:', editorDoc.profiles.length);
    console.log('  instances:', editorDoc.instances.length);
    console.log('  meshes:', editorDoc.meshes.length);
    
    // Create warehouseScene
    const warehouseScene = {
      version: 1,
      units: { lengthUnit: 'meter' },
      editorDocument: editorDoc,
      focusZone: {
        id: zone.id,
        name: zone.name,
        projectId: zone.project_id,
      },
      osmBuildings: snap.osmBuildings,
      terrainPatch: snap.terrainPatch,
      metadata: {
        source: 'server-side-build',
        generatedAt: new Date().toISOString(),
        solidsCount: editorDoc.solids.length,
        terrainMeshesCount: editorDoc.terrainMeshes.length,
      },
    };
    
    // Update the snapshot to include warehouseScene
    snap.warehouseScene = warehouseScene;
    snap.editorDocument = editorDoc;
    
    const updatedSnapshotJson = JSON.stringify(snap);
    
    console.log('\nSaving to database...');
    await client.query(
      "UPDATE inventory_3d_terrain_work_zones SET snapshot_json = $1, status = 'ready', updated_at = NOW() WHERE id = $2",
      [updatedSnapshotJson, zone.id]
    );
    
    console.log('\n✅ Scene saved successfully!');
    console.log('\nSummary:');
    console.log('  Terrain mesh: ' + editorDoc.terrainMeshes.length + ' (from ArcGIS, ' + (snap.terrainPatch?.rows || 0) + 'x' + (snap.terrainPatch?.cols || 0) + ' grid)');
    console.log('  OSM buildings: ' + (editorDoc.solids.length - 1) + ' extruded solids');
    console.log('  Base plate: 1 (from focus zone boundary)');
    console.log('  Total solids: ' + editorDoc.solids.length);
    
  } catch(e) {
    console.error('Error:', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
