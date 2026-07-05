import { useState } from 'react';
import useReimbursementStore from '../../../stores/reimbursementStore';

function statusLabel(file) {
  if (file.status === 'ocr_processing') return '识别中';
  if (file.status === 'preview' && file.isDuplicate) return '重复待确认';
  if (file.status === 'preview') return '待识别';
  if (file.status === 'failed') return '失败，可重试';
  return file.status || '等待处理';
}

function getFileName(file) {
  return file.originalName || file.fileName || file.original_name || file.file_name || '未命名票据';
}

function MobileOcrQueue({ projectId, files = [] }) {
  const recognizeFromFile = useReimbursementStore((state) => state.recognizeFromFile);
  const fetchPreviewFiles = useReimbursementStore((state) => state.fetchPreviewFiles);
  const fetchRecords = useReimbursementStore((state) => state.fetchRecords);
  const [activeFileId, setActiveFileId] = useState(null);
  const [queueNotice, setQueueNotice] = useState('');
  const pendingFiles = files.filter((file) => file.status === 'preview' || file.status === 'ocr_processing');

  const recognize = async (file) => {
    if (!projectId || file.status === 'ocr_processing') return;

    setActiveFileId(file.id);
    setQueueNotice('');
    try {
      const result = await recognizeFromFile(projectId, file.id, false, { refresh: false });
      if (result?.needConfirm) {
        setQueueNotice('检测到重复票据，请在桌面工作区确认后再识别。');
      }
      await Promise.all([fetchPreviewFiles(projectId), fetchRecords(projectId)]);
    } catch (error) {
      setQueueNotice(error?.message || '识别失败，请重试');
    } finally {
      setActiveFileId(null);
    }
  };

  return (
    <section className="mobile-ocr-queue" aria-label="识别队列">
      <header className="mobile-ocr-queue__header">
        <h3>识别队列</h3>
        <span>{pendingFiles.length} 个文件</span>
      </header>
      {queueNotice ? <div className="mobile-ocr-queue__notice">{queueNotice}</div> : null}
      {pendingFiles.length === 0 ? (
        <div className="mobile-ocr-queue__empty">暂无待识别票据</div>
      ) : pendingFiles.map((file) => (
        <article key={file.id} className="mobile-ocr-queue__item">
          <div className="mobile-ocr-queue__copy">
            <strong>{getFileName(file)}</strong>
            <span>{statusLabel(file)}</span>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={file.status === 'ocr_processing' || activeFileId === file.id}
            onClick={() => recognize(file)}
          >
            {file.status === 'ocr_processing' || activeFileId === file.id ? '识别中' : '识别'}
          </button>
        </article>
      ))}
    </section>
  );
}

export default MobileOcrQueue;
