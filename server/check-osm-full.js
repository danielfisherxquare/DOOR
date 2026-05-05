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
    
    // Full osmBuildings inspection
    const osm = snap.osmBuildings;
    console.log('=== osmBuildings Full Structure ===');
    console.log('kind:', osm.kind);
    console.log('count:', osm.count);
    console.log('source:', osm.source);
    console.log('buildings array length:', osm.buildings?.length);
    
    if (osm.buildings && osm.buildings.length > 0) {
      const b = osm.buildings[0];
      console.log('\n=== First OSM Building (full) ===');
      console.log(JSON.stringify(b, null, 2).substring(0, 800));
      
      // Count buildings with height info
      const withHeight = osm.buildings.filter(b => b.height || b.tags?.height || b.tags?.building_levels || b.levels);
      console.log('\n=== Building Height Stats ===');
      console.log('With height info:', withHeight.length);
      console.log('Without height:', osm.buildings.length - withHeight.length);
      
      // Count with levels
      const withLevels = osm.buildings.filter(b => b.tags?.building_levels || b.tags?.levels);
      console.log('With levels:', withLevels.length);
      
      // Show a building with height
      const withH = osm.buildings.find(b => b.tags?.height || b.tags?.building_levels);
      if (withH) {
        console.log('\n=== Building WITH height ===');
        console.log('name:', withH.name);
        console.log('tags:', JSON.stringify(withH.tags, null, 2));
      }
      
      // Check footprint coordinates
      const b2 = osm.buildings[10];
      if (b2) {
        console.log('\n=== Building [10] footprint ===');
        console.log(JSON.stringify(b2.footprint || b2.coordinates || b2.geometry, null, 2).substring(0, 500));
      }
    }
    
    // Check if there's a warehouseScene or editorDocument
    console.log('\n=== Missing from snapshot ===');
    console.log('has warehouseScene:', !!snap.warehouseScene);
    console.log('has editorDocument:', !!snap.editorDocument);
    console.log('has terrainMeshes:', !!snap.terrainMeshes);

  } catch(e) { console.error(e.message); }
  finally { await client.end(); }
})();
