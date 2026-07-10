function conflict(message) {
  const error = new Error(message)
  error.status = 409
  error.code = 'REIMBURSEMENT_PENDING_MATCH_CONFLICT'
  error.expose = true
  return error
}

function assertPending(match) {
  if (match.status !== 'pending') throw conflict('待匹配项已处理，请刷新后重试')
}

export function createPendingMatchWorkflow({
  database,
  findMatchForUpdate,
  findTargetRecordForUpdate,
  createRejectedRecord,
  attachPaymentEvidence,
  mergePaymentReview,
  markMatchResolved,
  refreshProject,
}) {
  return {
    resolve(matchId, targetRecordId) {
      return database.transaction(async (trx) => {
        const match = await findMatchForUpdate(trx, matchId)
        if (!match) return null
        assertPending(match)

        const targetRecord = await findTargetRecordForUpdate(trx, match, targetRecordId)
        if (!targetRecord) return null

        await attachPaymentEvidence(trx, targetRecord.id, match.payment_data || {})
        await mergePaymentReview(trx, targetRecord, match.payment_data || {})
        return markMatchResolved(trx, match, targetRecord.id, 'resolved')
      })
    },

    reject(matchId) {
      return database.transaction(async (trx) => {
        const match = await findMatchForUpdate(trx, matchId)
        if (!match) return null
        assertPending(match)

        const record = await createRejectedRecord(trx, match)
        await attachPaymentEvidence(trx, record.id, match.payment_data || {})
        const updatedMatch = await markMatchResolved(trx, match, record.id, 'rejected')
        await refreshProject(trx, match.project_id)
        return updatedMatch
      })
    },
  }
}
