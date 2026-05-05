import { Client } from 'pg';

const client = new Client({ connectionString: 'postgres://door:door_dev@localhost:5432/door' });

(async () => {
  await client.connect();
  try {
    const detail = await client.query(
      "SELECT snapshot_json FROM inventory_3d_terrain_work_zones WHERE id = $1",
      ['d0d4f34f-36e9-4669-a4db-652047c5129e']
    );
    const snap = typeof detail.rows[0].snapshot_json === 'string' 
      ? JSON.parse(detail.rows[0].snapshot_json) 
      : detail.rows[0].snapshot_json;
    
    console.log('=== Top-level keys ===');
    console.log(Object.keys(snap));
    
    // Check terrainPatch
    if (snap.terrainPatch) {
      const tp = snap.terrainPatch;
      console.log('\n=== terrainPatch ===');
      console.log('source:', tp.source);
      console.log('rows:', tp.rows);
      console.log('cols:', tp.cols);
      console.log('resolutionMeters:', tp.resolutionMeters);
      console.log('minElevationMeters:', tp.minElevationMeters);
      console.log('maxElevationMeters:', tp.maxElevationMeters);
      console.log('heights count:', tp.heightsRelative?.length);
    }
    
    // Check osmBuildings
    if (snap.osmBuildings) {
      const osm = snap.osmBuildings;
      console.log('\n=== osmBuildings ===');
      console.log('type:', Array.isArray(osm) ? 'array' : typeof osm);
      if (Array.isArray(osm)) {
        console.log('count:', osm.length);
        if (osm.length > 0) {
          console.log('\nFirst 3 buildings:');
          osm.slice(0, 3).forEach((b, i) => {
            console.log(`  [${i}]`, JSON.stringify({
              id: b.id,
              type: b.type,
              height: b.height || b.properties?.height || b.levels,
              footprint: b.footprint?.length || b.coordinates?.length,
              levels: b.levels || b.properties?.levels,
            }, null, 2));
          });
        }
      } else {
        console.log('content (first 500 chars):', JSON.stringify(osm, null, 2).substring(0, 500));
      }
    } else {
      console.log('\n=== NO osmBuildings! ===');
    }
    
    // Check warehouseScene if it exists
    if (snap.warehouseScene) {
      const scene = snap.warehouseScene;
      console.log('\n=== warehouseScene ===');
      if (scene.editorDocument) {
        const doc = scene.editorDocument;
        console.log('editorDocument:', {
          solids: doc.solids?.length || 0,
          profiles: doc.profiles?.length || 0,
          terrainMeshes: doc.terrainMeshes?.length || 0,
        });
      }
    }

  } catch(e) { console.error(e.message); }
  finally { await client.end(); }
})();
