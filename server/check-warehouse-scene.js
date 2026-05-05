import { Client } from 'pg';

const client = new Client({ connectionString: 'postgres://door:door_dev@localhost:5432/door' });

(async () => {
  await client.connect();
  try {
    const tz = await client.query(
      "SELECT snapshot_json FROM inventory_3d_terrain_work_zones WHERE id = $1",
      ['5c4c5d9a-c063-4e5d-9eea-71bf593ad2bb']
    );
    
    if (!tz.rows[0]) { console.log('Not found'); return; }
    
    const snap = typeof tz.rows[0].snapshot_json === 'string' 
      ? JSON.parse(tz.rows[0].snapshot_json) 
      : tz.rows[0].snapshot_json;
    
    console.log('=== warehouseScene keys ===');
    console.log(Object.keys(snap.warehouseScene || {}));
    
    if (snap.warehouseScene) {
      const scene = snap.warehouseScene;
      console.log('\n=== scene.terrainPatch ===');
      if (scene.terrainPatch) {
        console.log('  rows:', scene.terrainPatch.rows);
        console.log('  cols:', scene.terrainPatch.cols);
        console.log('  source:', scene.terrainPatch.source);
        console.log('  heights count:', scene.terrainPatch.heightsRelative?.length);
      } else {
        console.log('  NO terrainPatch in warehouseScene!');
      }
      
      console.log('\n=== scene.buildings ===');
      if (scene.buildings) {
        console.log('  count:', scene.buildings.length);
        if (scene.buildings.length > 0) {
          console.log('  first:', JSON.stringify(scene.buildings[0], null, 2).substring(0, 500));
        }
      }
      
      console.log('\n=== scene.root (first 500 chars) ===');
      if (scene.root) {
        console.log(JSON.stringify(scene.root, null, 2).substring(0, 500));
      }
    }
    
    // Now check what the 3D studio actually loads from the project snapshot
    const proj = await client.query(
      "SELECT snapshot_json FROM inventory_3d_projects WHERE id = $1",
      ['681cf00e-06fb-406f-9e9f-da9e138d3aa8']
    );
    const projSnap = typeof proj.rows[0].snapshot_json === 'string'
      ? JSON.parse(proj.rows[0].snapshot_json)
      : proj.rows[0].snapshot_json;
    
    console.log('\n=== Project snapshot keys ===');
    console.log(Object.keys(projSnap || {}));
    
    if (projSnap.terrainPatches) {
      console.log('terrainPatches count:', projSnap.terrainPatches.length);
    } else {
      console.log('NO terrainPatches in project snapshot');
    }
    
    if (projSnap.buildings) {
      console.log('buildings count:', projSnap.buildings.length);
    }

  } catch(e) { console.error(e.message); }
  finally { await client.end(); }
})();
