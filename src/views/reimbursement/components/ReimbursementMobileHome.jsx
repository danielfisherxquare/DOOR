import { useRef, useState } from 'react';
import MobileOcrQueue from './MobileOcrQueue';
import MobileReviewCard from './MobileReviewCard';
import useReimbursementStore from '../../../stores/reimbursementStore';

function ReimbursementMobileHome({ projectId, records = [], pendingMatches = [], onOpenRecord }) {
  const invoiceInputRef = useRef(null);
  const paymentInputRef = useRef(null);
  const [captureNotice, setCaptureNotice] = useState('');
  const importToPreview = useReimbursementStore((state) => state.importToPreview);
  const fetchPreviewFiles = useReimbursementStore((state) => state.fetchPreviewFiles);
  const fetchRecords = useReimbursementStore((state) => state.fetchRecords);
  const previewFiles = useReimbursementStore((state) => state.previewFiles);

  const handleCapture = async (event, documentType) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || !projectId) return;

    setCaptureNotice('正在上传票据...');
    try {
      await importToPreview(projectId, files, documentType, { sourceDevice: 'mobile-camera' });
      await Promise.all([fetchPreviewFiles(projectId), fetchRecords(projectId)]);
      setCaptureNotice('已加入识别队列');
    } catch (error) {
      setCaptureNotice(error?.message || '上传失败，请重试');
    } finally {
      event.target.value = '';
    }
  };

  const reviewRecords = records.filter((record) => record.preview_file_id);

  return (
    <section className="reimbursement-mobile-home" aria-label="手机报销工作台">
      <div className="reimbursement-mobile-home__actions">
        <button type="button" className="btn btn--primary" onClick={() => invoiceInputRef.current?.click()}>
          拍发票
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => paymentInputRef.current?.click()}>
          拍付款凭证
        </button>
      </div>

      <input
        ref={invoiceInputRef}
        type="file"
        accept="image/*,.pdf"
        capture="environment"
        multiple
        hidden
        onChange={(event) => handleCapture(event, 'invoice')}
      />
      <input
        ref={paymentInputRef}
        type="file"
        accept="image/*,.pdf"
        capture="environment"
        multiple
        hidden
        onChange={(event) => handleCapture(event, 'payment')}
      />

      {captureNotice ? <div className="reimbursement-mobile-home__notice">{captureNotice}</div> : null}
      <MobileOcrQueue projectId={projectId} files={previewFiles} />

      <div className="reimbursement-mobile-home__section">
        <h3>待复核</h3>
        {pendingMatches.length > 0 ? (
          <div className="reimbursement-mobile-home__warning">{pendingMatches.length} 笔付款凭证需要确认匹配</div>
        ) : null}
        {reviewRecords.slice(0, 5).map((record) => (
          <MobileReviewCard key={record.id} record={record} onOpen={() => onOpenRecord?.(record.id)} />
        ))}
      </div>
    </section>
  );
}

export default ReimbursementMobileHome;
