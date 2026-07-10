import knex from '../../db/knex.js';

const FINGERPRINT_SETTING_KEY = 'pii_key_fingerprint';

export async function readStoredEncryptionFingerprint(database = knex) {
  try {
    const row = await database('system_settings')
      .where('key', FINGERPRINT_SETTING_KEY)
      .first();
    return row?.value ?? null;
  } catch {
    // The settings table is created by the key guard during application startup.
    return null;
  }
}
