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
    
    const osm = snap.osmBuildings;
    const buildings = osm.buildings;
    
    // Check footprint coordinates of a few buildings
    console.log('=== Footprint Coordinate Check ===');
    for (let i of [0, 5, 50, 100, 200]) {
      if (buildings[i]) {
        const b = buildings[i];
        const fp = b.footprintWgs84;
        if (fp && fp.coordinates && fp.coordinates[0]) {
          const pts = fp.coordinates[0];
          const firstPt = pts[0];
          const lastPt = pts[pts.length - 1];
          const isClosed = firstPt[0] === lastPt[0] && firstPt[1] === lastPt[1];
          const hasDupe = pts.length > 2 && 
            Math.abs(pts[0][0] - pts[pts.length-2][0]) < 0.00001 &&
            Math.abs(pts[0][1] - pts[pts.length-2][1]) < 0.00001;
          
          console.log(`[${i}] ${b.name || 'unnamed'}: ${pts.length} pts, closed=${isClosed}, dupEndFirstLast=${hasDupe}, height=${b.heightMeters}m`);
        }
      }
    }
    
    // Count total unique buildings with valid footprints
    const validFootprints = buildings.filter(b => 
      b.footprintWgs84?.coordinates?.[0]?.length >= 3
    );
    console.log(`\nValid footprints: ${validFootprints.length}/${buildings.length}`);
    
    // Check for duplicate endpoint issue
    const withDupe = buildings.filter(b => {
      const pts = b.footprintWgs84?.coordinates?.[0];
      if (!pts || pts.length < 4) return false;
      const first = pts[0];
      const last = pts[pts.length - 1];
      return Math.abs(first[0] - last[0]) < 0.00001 && Math.abs(first[1] - last[1]) < 0.00001;
    });
    console.log(`With closed-loop dupes: ${withDupe.length}`);

  } catch(e) { console.error(e.message); }
  finally { await client.end(); }
})();
