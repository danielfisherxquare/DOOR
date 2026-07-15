import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('reimbursement table renders OCR cost and latency summary from records', () => {
  const table = read('src/views/reimbursement/components/ReimbursementTable.jsx');

  assert.ok(
    table.includes("from '../utils/ocrMetrics'"),
    'ReimbursementTable should use the shared OCR metrics helper',
  );
  assert.ok(table.includes('识别成本'), 'summary should name OCR cost');
  assert.ok(table.includes('Token'), 'summary should expose token usage');
  assert.ok(table.includes('调用'), 'summary should expose model call count');
  assert.ok(table.includes('平均耗时'), 'summary should expose average OCR latency');
  assert.ok(table.includes('图片压缩'), 'summary should expose image payload savings');
  assert.ok(table.includes('需复核'), 'summary should expose OCR review workload');
  assert.ok(table.includes('badge--review'), 'rows should show a compact review badge');
});

test('recognize drop zone renders OCR cost summary beside recognized records', () => {
  const dropZone = read('src/views/reimbursement/components/RecognizeDropZone.jsx');

  assert.ok(
    dropZone.includes("from '../utils/ocrMetrics'"),
    'RecognizeDropZone should use the shared OCR metrics helper',
  );
  assert.ok(dropZone.includes('Token'), 'recognized-records header should expose token usage');
  assert.ok(dropZone.includes('平均耗时'), 'recognized-records header should expose average OCR latency');
  assert.ok(dropZone.includes('图片压缩'), 'recognized-records header should expose image payload savings');
  assert.ok(dropZone.includes('需复核'), 'recognized-records header should expose OCR review workload');
  assert.ok(dropZone.includes('recognized-record-card__review-badge'), 'recognized records should show review badges');
});

test('preview workspace preserves server-side OCR processing state after refresh', () => {
  const workspace = read('src/views/reimbursement/components/PreviewWorkspace.jsx');
  const thumbnails = read('src/views/reimbursement/components/ThumbnailGrid.jsx');

  assert.ok(workspace.includes("f.status === 'ocr_processing'"), 'preview list should keep processing files visible');
  assert.ok(workspace.includes('stats.processing'), 'toolbar should show server-side processing count');
  assert.ok(workspace.includes('getRecognitionPageCount'), 'recognition should account for paid OCR page count');
  assert.ok(workspace.includes('预计识别页'), 'toolbar should expose estimated paid OCR pages');
  assert.ok(workspace.includes('确认继续识别？'), 'multi-page paid OCR batches should require explicit confirmation');
  assert.ok(workspace.includes('selectedPreviewFileIds'), 'discard should only target removable preview files');
  assert.ok(thumbnails.includes("ocr_processing: '识别中'"), 'thumbnail status labels should cover persisted OCR processing');
  assert.ok(thumbnails.includes("file.status === 'ocr_processing'"), 'processing cards should be locked visually and interactively');
});

test('batch recognition count matches actionable preview files', () => {
  const workspace = read('src/views/reimbursement/components/PreviewWorkspace.jsx');

  assert.ok(
    workspace.includes('逐张识别 ({selectedPreviewFileIds.length})'),
    'batch recognition button should show the number of files it can actually submit',
  );
  assert.ok(
    !workspace.includes('逐张识别 ({selectedIds.size})'),
    'batch recognition button should not count stale, recognized, or processing selections',
  );
});

test('duplicate force recognition confirms multi-page paid OCR cost', () => {
  const workspace = read('src/views/reimbursement/components/PreviewWorkspace.jsx');
  const forceIndex = workspace.indexOf('const handleForceRecognize = async (file) =>');
  const forceBody = workspace.slice(forceIndex, workspace.indexOf('// 批量识别', forceIndex));

  assert.ok(forceIndex >= 0, 'preview workspace should expose duplicate force recognition handler');
  assert.ok(forceBody.includes('getRecognitionPageCount(file)'), 'force recognition should inspect duplicate file page count');
  assert.ok(forceBody.includes('付费 OCR 模型'), 'force recognition should tell operators it will call the paid OCR model');
  assert.ok(forceBody.includes('recognizeFile(file.id, true)'), 'force recognition should still call the backend force path after confirmation');
});

test('single drag recognition surfaces backend duplicate confirmation', () => {
  const dropZone = read('src/views/reimbursement/components/RecognizeDropZone.jsx');
  const workspace = read('src/views/reimbursement/components/PreviewWorkspace.jsx');
  const dropIndex = dropZone.indexOf('const handleDrop = async (e) =>');
  const dropBody = dropZone.slice(dropIndex, dropZone.indexOf('const confirmForceRecognize', dropIndex));
  const workspaceDropIndex = workspace.indexOf('const handleDrop = async (file) =>');
  const workspaceDropBody = workspace.slice(workspaceDropIndex, workspace.indexOf('// 强制识别重复文件', workspaceDropIndex));

  assert.ok(dropIndex >= 0, 'drop zone should await async recognition results');
  assert.ok(dropBody.includes('const result = await onDrop(parsedFile)'), 'drop zone should inspect backend recognition response');
  assert.ok(dropBody.includes("result?.status === 'needConfirm'"), 'drop zone should detect backend duplicate confirmation state');
  assert.ok(dropBody.includes('setShowConfirmModal(true)'), 'backend duplicate state should open the force-recognition modal');
  assert.ok(workspaceDropBody.includes('return recognizeFile(file.id, false)'), 'workspace drop handler should return backend duplicate status to the drop zone');
});

test('record edits refresh server-derived OCR review state', () => {
  const store = read('src/stores/reimbursementStore.js');
  const updateIndex = store.indexOf('updateRecord: async');
  const putIndex = store.indexOf('request.put(', updateIndex);
  const recordEndpointIndex = store.indexOf('/app/reimbursements/records/', putIndex);
  const refreshIndex = store.indexOf('fetchRecords(get().activeProjectId)', putIndex);

  assert.ok(updateIndex >= 0, 'store should expose updateRecord');
  assert.ok(putIndex >= 0, 'updateRecord should persist the operator edit');
  assert.ok(recordEndpointIndex > putIndex, 'updateRecord should call the record update endpoint');
  assert.ok(refreshIndex > recordEndpointIndex, 'updateRecord should reload records so OCR review badges use refreshed server metadata');
});

test('record edit and delete failures remain visible to the operator', () => {
  const store = read('src/stores/reimbursementStore.js');
  const table = read('src/views/reimbursement/components/ReimbursementTable.jsx');
  const updateIndex = store.indexOf('updateRecord: async');
  const updateBody = store.slice(updateIndex, store.indexOf('deleteRecord: async', updateIndex));
  const deleteIndex = store.indexOf('deleteRecord: async');
  const deleteBody = store.slice(deleteIndex, store.indexOf('batchUpdateRecords: async', deleteIndex));
  const saveIndex = table.indexOf('const saveEdit = async () =>');
  const saveBody = table.slice(saveIndex, table.indexOf('const cancelEdit', saveIndex));

  assert.ok(updateBody.includes('throw error'), 'updateRecord should reject when saving a row fails');
  assert.ok(deleteBody.includes('throw error'), 'deleteRecord should reject when deleting a row fails');
  assert.ok(
    saveBody.indexOf('setEditingId(null)') > saveBody.indexOf('await updateRecord(editingId, editData)'),
    'row edit mode should only close after updateRecord succeeds',
  );
});

test('export actions expose busy and failure feedback instead of raw promise handlers', () => {
  const table = read('src/views/reimbursement/components/ReimbursementTable.jsx');

  assert.ok(table.includes('exportFeedback'), 'export actions should render operator feedback');
  assert.ok(table.includes('summarizeExportReadiness'), 'table should compute export readiness before download');
  assert.ok(table.includes('getRecordExportIssueLabels'), 'table should compute row-level export risks for filtering');
  assert.ok(table.includes('qualityFilter'), 'table should keep an operator quality filter state');
  assert.ok(table.includes('只看风险'), 'toolbar should expose an export-risk queue filter');
  assert.ok(table.includes('只看复核'), 'toolbar should expose an OCR-review queue filter');
  assert.ok(table.includes('reimbursement-table__risk-list'), 'rows should show compact row-level export risks');
  assert.ok(table.includes('confirm(exportReadiness.confirmMessage)'), 'risky exports should ask for explicit confirmation');
  assert.ok(table.includes('导出检查'), 'toolbar should expose export-readiness status');
  assert.ok(table.includes('handleExportToExcel'), 'Excel export should use a guarded click handler');
  assert.ok(table.includes('handleExportWithImages'), 'ZIP export should use a guarded click handler');
  assert.ok(!table.includes('onClick={exportToExcel}'), 'Excel export should not attach the raw async store function');
  assert.ok(!table.includes('onClick={exportWithImages}'), 'ZIP export should not attach the raw async store function');
});

test('reimbursement module exposes mobile capture and card-first surfaces', () => {
  const page = read('src/views/reimbursement/ReimbursementTool.jsx');
  const mobileShell = read('src/views/reimbursement/components/ReimbursementMobileHome.jsx');
  const table = read('src/views/reimbursement/components/ReimbursementTable.jsx');
  const css = read('src/views/reimbursement/reimbursement.css');

  assert.ok(page.includes('ReimbursementMobileHome'), 'ReimbursementTool should render a mobile workflow surface');
  assert.ok(mobileShell.includes('capture="environment"'), 'mobile capture should hint rear camera capture');
  assert.ok(mobileShell.includes('MobileOcrQueue'), 'mobile flow should render an OCR queue');
  assert.ok(mobileShell.includes('MobileReviewCard'), 'mobile flow should render review cards');
  assert.ok(table.includes('AppH5DataTable'), 'record table should use the shared responsive table primitive');
  assert.ok(table.includes('mobileCards='), 'record table should provide mobile cards');
  assert.ok(css.includes('.reimbursement-mobile-home'), 'mobile reimbursement shell should have concrete styles');
});

test('mobile reimbursement queue preserves OCR review and upload metadata', () => {
  const queue = read('src/views/reimbursement/components/MobileOcrQueue.jsx');
  const card = read('src/views/reimbursement/components/MobileReviewCard.jsx');
  const store = read('src/stores/reimbursementStore.js');

  assert.ok(queue.includes("file.status === 'ocr_processing'"), 'mobile queue should keep processing files visible and locked');
  assert.ok(queue.includes('recognizeFromFile(projectId, file.id, false, { refresh: false })'), 'mobile queue should use the existing paid OCR recognition path');
  assert.ok(card.includes('getOcrReviewStatus'), 'mobile review cards should show OCR review status');
  assert.ok(card.includes('getRecordExportIssueLabels'), 'mobile review cards should keep export risk labels visible');
  assert.ok(store.includes("metadata = {}"), 'importToPreview should accept optional upload metadata');
  assert.ok(store.includes("formData.append('sourceDevice'"), 'mobile camera uploads should preserve sourceDevice metadata');
});

test('project switching stays available during background reimbursement loading', () => {
  const selector = read('src/views/reimbursement/components/ProjectSelector.jsx');

  assert.ok(
    selector.includes('canSwitchProjects'),
    'ProjectSelector should derive select availability from loaded project options',
  );
  assert.ok(
    !selector.includes('disabled={isLoading}'),
    'ProjectSelector should not disable switching because unrelated reimbursement work is loading',
  );
});

test('matching center supports mobile wizard layout', () => {
  const modal = read('src/views/reimbursement/components/MatchingCenterModal.jsx');
  const css = read('src/views/reimbursement/reimbursement.css');

  assert.ok(modal.includes('matching-modal__wizard-step'), 'matching modal should expose wizard sections');
  assert.ok(css.includes('.matching-modal--mobile-wizard'), 'matching modal should have mobile wizard class');
  assert.ok(css.includes('bottom: 0'), 'mobile matching modal should behave like a bottom sheet');
});
