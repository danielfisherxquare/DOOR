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
    
    console.log('=== Full snapshot keys ===');
    console.log(Object.keys(snap));
    console.log('\n=== Full snapshot JSON (first 2000 chars) ===');
    console.log(JSON.stringify(snap, null, 2).substring(0, 2000));

  } catch(e) { console.error(e.message); }
  finally { await client.end(); }
})();
