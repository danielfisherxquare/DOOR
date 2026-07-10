import knex from '../../db/knex.js'
import { checkKeyHealth } from '../../utils/key-guard.js'

export async function checkReadiness({ database = knex, keyHealth = checkKeyHealth } = {}) {
  await database.raw('SELECT 1')
  const keyStatus = await keyHealth(database)
  if (!keyStatus.healthy) {
    return {
      healthy: false,
      body: {
        status: 'error',
        database: 'connected',
        encryption: 'key_mismatch',
        message: '加密密钥与数据库不匹配，请检查 .env 文件',
      },
    }
  }
  return {
    healthy: true,
    body: { status: 'ok', database: 'connected', encryption: 'ok' },
  }
}
