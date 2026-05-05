import { Client } from 'pg';

const client = new Client({ connectionString: 'postgres://door:door_dev@localhost:5432/door' });

(async () => {
  await client.connect();
  try {
    const wz = await client.query(
      "SELECT id, name, project_id, created_at, status FROM inventory_3d_terrain_work_zones ORDER BY created_at DESC LIMIT 10"
    );
    console.log('=== All Work Zones ===');
    wz.rows.forEach(r => {
      console.log(r.id.substring(0,8) + ' | ' + r.name + ' | ' + r.project_id.substring(0,8) + ' | ' + r.status);
    });
    
    // Check the OSM 测试区域 snapshot
    const newSnap = await client.query(
      "SELECT snapshot_json FROM inventory_3d_terrain_work_zones WHERE id = 'd0d4f34f-36e9-4669-a4db-652047c5129e'"
    );
    const snap = typeof newSnap.rows[0].snapshot_json === 'string' 
      ? JSON.parse(newSnap.rows[0].snapshot_json) 
      : newSnap.rows[0].snapshot_json;
    
    console.log('\n=== OSM 测试区域 Snapshot ===');
    console.log('Keys:', Object.keys(snap));
    console.log('osmBuildings count:', snap.osmBuildings?.count || 0);
    console.log('terrainPatch source:', snap.terrainPatch?.source || 'none');
    console.log('has warehouseScene:', !!snap.warehouseScene);
    console.log('has editorDocument:', !!snap.editorDocument);
    
    // Check the project snapshot
    const proj = await client.query(
      "SELECT snapshot_json FROM inventory_3d_projects WHERE id = '681cf00e-06fb-406f-9e9f-da9e138d3aa8'"
    );
    const projSnap = typeof proj.rows[0].snapshot_json === 'string'
      ? JSON.parse(proj.rows[0].snapshot_json)
      : proj.rows[0].snapshot_json;
    
    console.log('\n=== Project Snapshot ===');
    console.log('Keys:', Object.keys(projSnap || {}));
    console.log('buildings:', projSnap.buildings?.length || 0);
    console.log('terrainPatches:', projSnap.terrainPatches?.length || 0);
    console.log('has warehouseScene:', !!projSnap.warehouseScene);
    console.log('has editorDocument:', !!projSnap.editorDocument);
    
  } catch(e) { console.error(e.message); }
  finally { await client.end(); }
})();
