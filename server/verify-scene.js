import { Client } from 'pg';
const client = new Client({ connectionString: 'postgres://door:door_dev@localhost:5432/door' });

(async () => {
  await client.connect();
  try {
    const wz = await client.query(
      "SELECT snapshot_json FROM inventory_3d_terrain_work_zones WHERE id = 'd0d4f34f-36e9-4669-a4db-652047c5129e'"
    );
    const snap = typeof wz.rows[0].snapshot_json === 'string' 
      ? JSON.parse(wz.rows[0].snapshot_json) 
      : wz.rows[0].snapshot_json;
    
    console.log('=== Updated Work Zone Snapshot ===');
    console.log('Keys:', Object.keys(snap));
    console.log('has warehouseScene:', !!snap.warehouseScene);
    console.log('has editorDocument:', !!snap.editorDocument);
    console.log('editorDocument.solids:', snap.editorDocument?.solids?.length || 0);
    console.log('editorDocument.terrainMeshes:', snap.editorDocument?.terrainMeshes?.length || 0);
    console.log('editorDocument.profiles:', snap.editorDocument?.profiles?.length || 0);
    
    // Check first solid
    if (snap.editorDocument?.solids?.length > 0) {
      const s = snap.editorDocument.solids[0];
      console.log('\nFirst solid:', JSON.stringify({ kind: s.kind, osmId: s.osmId, height: s.heightMeters }).substring(0, 200));
    }
    
    // Check terrain mesh
    if (snap.editorDocument?.terrainMeshes?.length > 0) {
      const tm = snap.editorDocument.terrainMeshes[0];
      console.log('\nTerrain mesh:', JSON.stringify({
        kind: tm.kind,
        vertices: tm.vertices?.length || 0,
        faces: tm.indices?.length || 0,
        bounds: tm.boundsMeters,
      }).substring(0, 200));
    }
    
    // Check warehouseScene
    if (snap.warehouseScene) {
      const ws = snap.warehouseScene;
      console.log('\nwarehouseScene keys:', Object.keys(ws));
      console.log('osmBuildings preserved:', ws.osmBuildings?.count || 0);
    }
    
  } catch(e) { console.error(e.message); }
  finally { await client.end(); }
})();
