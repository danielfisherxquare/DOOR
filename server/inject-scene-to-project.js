import { Client } from 'pg';
const client = new Client({ connectionString: 'postgres://door:door_dev@localhost:5432/door' });

(async () => {
  await client.connect();
  try {
    const projectId = '681cf00e-06fb-406f-9e9f-da9e138d3aa8';
    const zoneId = 'd0d4f34f-36e9-4669-a4db-652047c5129e';
    
    // Get the work zone scene data
    const wz = await client.query(
      "SELECT snapshot_json FROM inventory_3d_terrain_work_zones WHERE id = $1",
      [zoneId]
    );
    const wzSnap = typeof wz.rows[0].snapshot_json === 'string'
      ? JSON.parse(wz.rows[0].snapshot_json)
      : wz.rows[0].snapshot_json;
    
    console.log('Work zone has editorDocument:', !!wzSnap.editorDocument);
    console.log('editorDocument.solids:', wzSnap.editorDocument?.solids?.length || 0);
    console.log('editorDocument.terrainMeshes:', wzSnap.editorDocument?.terrainMeshes?.length || 0);
    
    // Get current project snapshot
    const proj = await client.query(
      "SELECT snapshot_json FROM inventory_3d_projects WHERE id = $1",
      [projectId]
    );
    const projSnap = typeof proj.rows[0].snapshot_json === 'string'
      ? JSON.parse(proj.rows[0].snapshot_json)
      : proj.rows[0].snapshot_json;
    
    console.log('\nCurrent project snapshot keys:', Object.keys(projSnap));
    console.log('Current buildings:', projSnap.buildings?.length || 0);
    
    // Merge the editorDocument into the project snapshot
    if (wzSnap.editorDocument) {
      // Replace project snapshot with the full scene
      projSnap.editorDocument = wzSnap.editorDocument;
      projSnap.buildings = wzSnap.editorDocument.solids.map(s => ({
        id: s.id,
        kind: s.kind,
        osmId: s.osmId,
        height: s.heightMeters,
      }));
      projSnap.terrainPatches = wzSnap.editorDocument.terrainMeshes.map(tm => ({
        id: tm.id,
        kind: 'terrain-mesh',
        vertices: tm.vertices?.length || 0,
        faces: tm.indices?.length || 0,
      }));
      projSnap.focusZoneId = zoneId;
      projSnap.focusZoneName = wzSnap.focusZone?.name || 'OSM 测试区域';
      projSnap.hasTerrain = true;
      projSnap.hasOsmBuildings = true;
      projSnap.importedObjectsCount = wzSnap.editorDocument.solids.length;
      
      // Update the project snapshot
      await client.query(
        "UPDATE inventory_3d_projects SET snapshot_json = $1, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(projSnap), projectId]
      );
      
      console.log('\n✅ Project snapshot updated with full scene!');
      console.log('  buildings:', projSnap.buildings.length);
      console.log('  terrainPatches:', projSnap.terrainPatches.length);
      console.log('  focusZone:', projSnap.focusZoneName);
    } else {
      console.log('No editorDocument in work zone!');
    }
    
  } catch(e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  } finally {
    await client.end();
  }
})();
