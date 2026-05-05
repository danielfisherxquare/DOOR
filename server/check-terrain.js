import { Client } from 'pg';

const client = new Client({ connectionString: 'postgres://door:door_dev@localhost:5432/door' });

(async () => {
  await client.connect();
  try {
    // Check the terrain work zone snapshot_json
    const tz = await client.query(
      "SELECT id, name, status, snapshot_json, terrain_resolution, metadata FROM inventory_3d_terrain_work_zones WHERE id = $1",
      ['5c4c5d9a-c063-4e5d-9eea-71bf593ad2bb']
    );
    
    if (!tz.rows[0]) {
      console.log('Work zone not found');
      return;
    }
    
    const wz = tz.rows[0];
    console.log('=== Work Zone ===');
    console.log('id:', wz.id);
    console.log('name:', wz.name);
    console.log('status:', wz.status);
    console.log('terrain_resolution:', wz.terrain_resolution);
    
    const snap = typeof wz.snapshot_json === 'string' ? JSON.parse(wz.snapshot_json) : wz.snapshot_json;
    console.log('\n=== Snapshot JSON keys ===');
    console.log(Object.keys(snap || {}));
    
    console.log('\n=== Terrain Patch ===');
    if (snap.terrainPatch) {
      const tp = snap.terrainPatch;
      console.log('kind:', tp.kind);
      console.log('source:', tp.source);
      console.log('rows:', tp.rows);
      console.log('cols:', tp.cols);
      console.log('resolutionMeters:', tp.resolutionMeters);
      console.log('boundsMeters:', JSON.stringify(tp.boundsMeters));
      console.log('minElevationMeters:', tp.minElevationMeters);
      console.log('maxElevationMeters:', tp.maxElevationMeters);
      console.log('heightDeltaMeters:', tp.heightDeltaMeters);
      console.log('heightsRelative count:', tp.heightsRelative ? tp.heightsRelative.length : 0);
      if (tp.heightsRelative && tp.heightsRelative.length > 0) {
        console.log('heights sample (first 10):', tp.heightsRelative.slice(0, 10));
      }
      console.log('cellMask count:', tp.cellMask ? tp.cellMask.length : 0);
    } else {
      console.log('NO terrainPatch in snapshot!');
    }
    
    console.log('\n=== Metadata ===');
    console.log(JSON.stringify(wz.metadata, null, 2));
    
    console.log('\n=== clipPolygonWgs84 ===');
    console.log(JSON.stringify(snap.clipPolygonWgs84 || snap.boundary || 'not found', null, 2).substring(0, 500));

  } catch(e) { console.error(e.message); }
  finally { await client.end(); }
})();
