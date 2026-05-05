import { Client } from 'pg';

const client = new Client({ connectionString: 'postgres://door:door_dev@localhost:5432/door' });

(async () => {
  await client.connect();
  try {
    const wz = await client.query(
      "SELECT id, name, status, created_at FROM inventory_3d_terrain_work_zones ORDER BY created_at DESC LIMIT 5"
    );
    console.log('=== Latest Work Zones ===');
    console.log(JSON.stringify(wz.rows, null, 2));
    
    // Check the newest work zone snapshot
    if (wz.rows[0]) {
      const detail = await client.query(
        "SELECT snapshot_json FROM inventory_3d_terrain_work_zones WHERE id = $1",
        [wz.rows[0].id]
      );
      const snap = typeof detail.rows[0].snapshot_json === 'string' 
        ? JSON.parse(detail.rows[0].snapshot_json) 
        : detail.rows[0].snapshot_json;
      
      console.log('\n=== Latest Work Zone Snapshot ===');
      console.log('Name:', wz.rows[0].name);
      console.log('keys:', Object.keys(snap || {}));
      
      if (snap.warehouseScene) {
        const scene = snap.warehouseScene;
        console.log('\nwarehouseScene keys:', Object.keys(scene || {}));
        
        if (scene.editorDocument) {
          const doc = scene.editorDocument;
          console.log('\neditorDocument:', {
            solids: doc.solids?.length || 0,
            profiles: doc.profiles?.length || 0,
            instances: doc.instances?.length || 0,
            meshes: doc.meshes?.length || 0,
            terrainMeshes: doc.terrainMeshes?.length || 0,
          });
          
          if (doc.solids && doc.solids.length > 0) {
            console.log('\nFirst solid:', JSON.stringify(doc.solids[0], null, 2).substring(0, 300));
          }
          if (doc.terrainMeshes && doc.terrainMeshes.length > 0) {
            console.log('\nFirst terrainMesh:', JSON.stringify(doc.terrainMeshes[0], null, 2).substring(0, 300));
          }
        }
        
        if (scene.osmBuildings) {
          console.log('\nosmBuildings count:', scene.osmBuildings.length);
          if (scene.osmBuildings.length > 0) {
            console.log('First OSM building:', JSON.stringify(scene.osmBuildings[0], null, 2).substring(0, 300));
          }
        }
      }
    }
    
    // Check project snapshot
    const proj = await client.query(
      "SELECT snapshot_json FROM inventory_3d_projects WHERE id = '681cf00e-06fb-406f-9e9f-da9e138d3aa8'"
    );
    const projSnap = typeof proj.rows[0].snapshot_json === 'string'
      ? JSON.parse(proj.rows[0].snapshot_json)
      : proj.rows[0].snapshot_json;
    
    console.log('\n=== Project Snapshot ===');
    console.log('keys:', Object.keys(projSnap || {}));
    console.log('terrainPatches:', projSnap.terrainPatches?.length || 0);
    console.log('buildings:', projSnap.buildings?.length || 0);
    
  } catch(e) { console.error(e.message); }
  finally { await client.end(); }
})();
