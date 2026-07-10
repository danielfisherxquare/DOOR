import knex from '../../db/knex.js'
import { importSessionMapper } from '../../db/mappers/import-sessions.js'

function repositoryError(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.expose = true
  return error
}

async function readRowsFromChunks(database, sessionId) {
  const chunks = await database('import_session_chunks')
    .where({ session_id: sessionId })
    .orderBy('seq', 'asc')

  const rows = []
  for (const chunk of chunks) {
    let data = chunk.rows_data
    if (typeof data === 'string') data = JSON.parse(data)
    if (Array.isArray(data)) rows.push(...data)
  }
  return rows
}

export const importSessionRepository = {
  async findOrganization(orgId, database = knex) {
    const row = await database('organizations').where({ id: orgId }).first('id')
    return row ? { id: row.id } : null
  },

  async findRaceScope(raceId, database = knex) {
    const row = await database('races').where({ id: raceId }).first('id', 'org_id')
    return row ? { id: Number(row.id), orgId: row.org_id } : null
  },

  async lockRaceScope(orgId, raceId, database) {
    const row = await database('races')
      .where({ id: raceId, org_id: orgId })
      .forUpdate()
      .first('id', 'org_id')
    if (!row) {
      throw repositoryError(404, 'IMPORT_RACE_NOT_FOUND', 'Target race not found or forbidden')
    }
    return { id: Number(row.id), orgId: row.org_id }
  },

  async findSessionScope(sessionId, database = knex) {
    const row = await database('import_sessions').where({ id: sessionId }).first('id', 'org_id')
    return row ? { id: row.id, orgId: row.org_id } : null
  },

  async create(orgId, database = knex) {
    const [row] = await database('import_sessions').insert({ org_id: orgId }).returning('*')
    return importSessionMapper.fromDbRow(row)
  },

  async findById(orgId, sessionId, database = knex) {
    const row = await database('import_sessions').where({ org_id: orgId, id: sessionId }).first()
    return importSessionMapper.fromDbRow(row)
  },

  async lockOpenSession(orgId, sessionId, database) {
    const row = await database('import_sessions')
      .where({ org_id: orgId, id: sessionId })
      .forUpdate()
      .first()
    const session = importSessionMapper.fromDbRow(row)
    if (!session) {
      throw repositoryError(404, 'IMPORT_SESSION_NOT_FOUND', 'Session not found or forbidden')
    }
    if (session.status !== 'open') {
      throw repositoryError(409, 'IMPORT_SESSION_NOT_OPEN', 'Cannot modify a non-open session')
    }
    return session
  },

  async setSummary(orgId, sessionId, summary, database = knex) {
    const [row] = await database('import_sessions')
      .where({ org_id: orgId, id: sessionId, status: 'open' })
      .update({
        raw_count: summary.rawCount,
        raw_preview: JSON.stringify(summary.rawPreview),
        stats: JSON.stringify(summary.stats),
        updated_at: database.fn.now(),
      })
      .returning('*')
    return importSessionMapper.fromDbRow(row)
  },

  async appendChunk(orgId, sessionId, rowsData, database) {
    const execute = async (trx) => {
      await this.lockOpenSession(orgId, sessionId, trx)

      const maxSeqRow = await trx('import_session_chunks')
        .where({ session_id: sessionId })
        .max('seq as max_seq')
        .first()
      const nextSeq = Number(maxSeqRow?.max_seq ?? -1) + 1
      const rowCount = rowsData.length

      await trx('import_session_chunks').insert({
        session_id: sessionId,
        seq: nextSeq,
        rows_data: JSON.stringify(rowsData),
        row_count: rowCount,
      })

      const [updatedSession] = await trx('import_sessions')
        .where({ org_id: orgId, id: sessionId, status: 'open' })
        .update({
          total_rows: trx.raw('total_rows + ?', [rowCount]),
          updated_at: trx.fn.now(),
        })
        .returning('total_rows')
      if (!updatedSession) {
        throw repositoryError(409, 'IMPORT_SESSION_NOT_OPEN', 'Cannot append to a non-open session')
      }
      return Number(updatedSession.total_rows)
    }

    return database ? execute(database) : knex.transaction(execute)
  },

  async getChunk(orgId, sessionId, offset, limit, database = knex) {
    const session = await this.findById(orgId, sessionId, database)
    if (!session) {
      throw repositoryError(404, 'IMPORT_SESSION_NOT_FOUND', 'Session not found or forbidden')
    }
    const rows = await readRowsFromChunks(database, sessionId)
    return rows.slice(offset, offset + limit)
  },

  async listAllRows(orgId, sessionId, database) {
    const session = await this.findById(orgId, sessionId, database)
    if (!session) {
      throw repositoryError(404, 'IMPORT_SESSION_NOT_FOUND', 'Session not found or forbidden')
    }
    return readRowsFromChunks(database, sessionId)
  },

  async listRecordDuplicateCandidates(orgId, raceId, database) {
    return database('records')
      .select(
        'id',
        'id_number_hash',
        'duplicate_count',
        'mark',
        'source',
        'event',
        'duplicate_sources',
        'runner_category',
      )
      .where({ org_id: orgId, race_id: raceId })
      .whereNotNull('id_number_hash')
  },

  async insertRecords(rows, database) {
    if (rows.length > 0) await database('records').insert(rows)
    return rows.length
  },

  updateRecord(orgId, raceId, recordId, data, database) {
    return database('records').where({ id: recordId, org_id: orgId, race_id: raceId }).update(data)
  },

  async cancel(orgId, sessionId, database = knex) {
    const deleted = await database('import_sessions')
      .where({ org_id: orgId, id: sessionId })
      .delete()
    return deleted > 0
  },

  async markCommitted(orgId, sessionId, database = knex) {
    const [row] = await database('import_sessions')
      .where({ org_id: orgId, id: sessionId, status: 'open' })
      .update({
        status: 'committed',
        updated_at: database.fn.now(),
      })
      .returning('*')
    return importSessionMapper.fromDbRow(row)
  },
}
