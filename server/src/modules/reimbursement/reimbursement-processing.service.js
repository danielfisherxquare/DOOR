import knex from '../../db/knex.js';
import {
  attachDocumentReview,
  buildReviewRecordData,
} from './reimbursement-record-data.js';

const ACTIVE_PROCESSING_STATUSES = ['processing', 'completed'];

// Keep the legacy userId argument while callers migrate to the focused processing service.
export async function startProcessingFile(projectId, userId, { fileName, fileType, fileHash }) {
  return knex.transaction(async (trx) => {
    const lockKey = `reimbursement-ocr:${projectId}:${fileType}:${fileHash}`;
    await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?)::bigint)', [lockKey]);

    // Error and skipped rows remain retryable; active or completed work is deduplicated.
    const existing = await trx('reimbursement_processed_files')
      .where({
        project_id: projectId,
        file_hash: fileHash,
        file_type: fileType,
      })
      .whereIn('status', ACTIVE_PROCESSING_STATUSES)
      .first();

    if (existing) {
      const [record] = await trx('reimbursement_processed_files')
        .insert({
          project_id: projectId,
          file_name: fileName,
          file_type: fileType,
          file_hash: fileHash,
          status: 'skipped',
          processed_at: trx.fn.now(),
        })
        .returning('*');

      return { skipped: true, record, existing };
    }

    const [record] = await trx('reimbursement_processed_files')
      .insert({
        project_id: projectId,
        file_name: fileName,
        file_type: fileType,
        file_hash: fileHash,
        status: 'processing',
        started_at: trx.fn.now(),
      })
      .returning('*');

    return { skipped: false, record };
  });
}

export async function getProcessingStats(projectId) {
  const stats = await knex('reimbursement_processed_files')
    .where({ project_id: projectId })
    .select('status')
    .count('* as count')
    .groupBy('status');

  const result = {
    pending: 0,
    processing: 0,
    completed: 0,
    skipped: 0,
    errored: 0,
  };

  for (const stat of stats) {
    const status = stat.status;
    const count = Number(stat.count);
    if (status === 'pending') result.pending = count;
    else if (status === 'processing') result.processing = count;
    else if (status === 'completed') result.completed = count;
    else if (status === 'skipped') result.skipped = count;
    else if (status === 'error') result.errored = count;
  }

  return result;
}

export async function getProcessingJobs(projectId, status) {
  let query = knex('reimbursement_processed_files')
    .where({ project_id: projectId })
    .orderBy('processed_at', 'desc')
    .limit(100);

  if (status) {
    query = query.where({ status });
  }

  return query;
}

export async function getDuplicateFiles(projectId) {
  return knex('reimbursement_processed_files')
    .where({ project_id: projectId, status: 'skipped' })
    .orderBy('processed_at', 'desc');
}

export async function getErrorFiles(projectId) {
  return knex('reimbursement_processed_files')
    .where({ project_id: projectId, status: 'error' })
    .orderBy('processed_at', 'desc');
}

export async function clearProcessingRecords(projectId) {
  return knex('reimbursement_processed_files')
    .where({ project_id: projectId })
    .del();
}

export async function updateProcessingStatus(
  recordId,
  status,
  { errorMessage, ocrResult, ocrMeta, documentType } = {},
) {
  const reviewedOcrMeta = attachDocumentReview(
    ocrMeta,
    documentType,
    buildReviewRecordData(documentType, ocrResult),
  );
  const updateData = {
    status,
    processed_at: knex.fn.now(),
    error_message: errorMessage ?? undefined,
    ocr_result: ocrResult ?? undefined,
    ocr_meta: reviewedOcrMeta ?? undefined,
  };

  return knex('reimbursement_processed_files')
    .where({ id: recordId })
    .update(updateData);
}
