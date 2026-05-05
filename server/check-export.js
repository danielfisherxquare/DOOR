import { Client } from 'pg';

const client = new Client({ connectionString: 'postgres://door:door_dev@localhost:5432/door' });

(async () => {
  await client.connect();
  try {
    // Check terrain work zones
    const tz = await client.query(
      "SELECT id, project_id, name, status FROM inventory_3d_terrain_work_zones WHERE project_id = $1",
      ['681cf00e-06fb-406f-9e9f-da9e138d3aa8']
    );
    console.log('=== Terrain Work Zones ===');
    console.log(JSON.stringify(tz.rows, null, 2));
    
    // Get full snapshot
    const proj = await client.query(
      "SELECT snapshot_json FROM inventory_3d_projects WHERE id = $1",
      ['681cf00e-06fb-406f-9e9f-da9e138d3aa8']
    );
    const snap = proj.rows[0].snapshot_json;
    const parsed = typeof snap === 'string' ? JSON.parse(snap) : snap;
    
    console.log('\n=== Snapshot Structure ===');
    console.log('buildings:', parsed.buildings ? parsed.buildings.length : 'undefined');
    console.log('zones:', parsed.zones ? parsed.zones.length : 'undefined');
    if (parsed.zones && parsed.zones.length > 0) {
      console.log('First zone:', JSON.stringify(parsed.zones[0], null, 2).substring(0, 800));
    }
    console.log('structures:', parsed.structures ? parsed.structures.length : 'undefined');
    console.log('warehouses:', parsed.warehouses ? parsed.warehouses.length : 'undefined');
    console.log('mapLayers:', parsed.mapLayers ? parsed.mapLayers.length : 'undefined');
    
    if (parsed.site) {
      console.log('site:', JSON.stringify(parsed.site, null, 2).substring(0, 500));
    }
    
    // Check if the 3D studio editor actually shows building white models
    // The "GIS 初始白模" message means it uses OSM building data, not stored buildings
    
    // Check terrain_work_zones for focus zone data
    if (tz.rows[0]) {
      const wzDetail = await client.query(
        "SELECT * FROM inventory_3d_terrain_work_zones WHERE id = $1",
        [tz.rows[0].id]
      );
      console.log('\n=== Work Zone Detail ===');
      const wz = wzDetail.rows[0];
      console.log('id:', wz.id);
      console.log('name:', wz.name);
      console.log('status:', wz.status);
      if (wz.boundary_geojson) {
        const geojson = typeof wz.boundary_geojson === 'string' ? JSON.parse(wz.boundary_geojson) : wz.boundary_geojson;
        console.log('boundary GeoJSON type:', geojson.type);
        console.log('coordinates count:', geojson.coordinates ? geojson.coordinates[0] ? geojson.coordinates[0].length : 0 : 0);
      }
    }

  } catch(e) { console.error(e.message); }
  finally { await client.end(); }
})();
