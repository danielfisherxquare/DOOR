/**
 * Watcher Panel
 * 目录监控面板组件 - 完整版
 * 显示处理状态统计、活跃任务、错误和重复文件
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import useReimbursementStore from '../../../stores/reimbursementStore';
import {
  hasFileSystemAccess,
  selectDirectory,
  DirectoryWatcher,
  isInvoiceFile,
  isPaymentFile,
} from '../utils/fileSystemAccess';

// 图标组件
const FolderIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

function WatcherPanel() {
  const {
    activeProjectId,
    llmConfig,
    hasServerLlmConfig,
    processingStats,
    duplicateFiles,
    errorFiles,
    processInvoiceOcr,
    processPaymentOcr,
    addRecord,
    fetchProcessingStats,
    fetchDuplicateFiles,
    fetchErrorFiles,
    watchDirectoryHandle,
    setWatchDirectoryHandle,
  } = useReimbursementStore();

  const [isWatching, setIsWatching] = useState(false);
  const [watcherName, setWatcherName] = useState('');
  const [status, setStatus] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const watcherRef = useRef(null);

  const hasFsa = hasFileSystemAccess();
  const hasLlmConfig = Boolean(hasServerLlmConfig || (llmConfig.apiKey && llmConfig.baseUrl));

  // 加载统计数据
  useEffect(() => {
    if (activeProjectId) {
      fetchProcessingStats();
      fetchDuplicateFiles();
      fetchErrorFiles();
    }
  }, [activeProjectId, fetchProcessingStats, fetchDuplicateFiles, fetchErrorFiles]);

  // 刷新所有数据
  const refreshAllData = useCallback(async () => {
    if (!activeProjectId) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchProcessingStats(),
        fetchDuplicateFiles(),
        fetchErrorFiles(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [activeProjectId, fetchProcessingStats, fetchDuplicateFiles, fetchErrorFiles]);

  // 处理新文件
  const handleNewFiles = useCallback(async (files) => {
    if (!hasLlmConfig) {
      setStatus('请先配置模型 API，或确认服务端已配置默认 OCR 模型');
      return;
    }

    for (const { file, name } of files) {
      try {
        if (isInvoiceFile(name)) {
          setStatus(`正在处理发票: ${name}`);
          const result = await processInvoiceOcr(file);
          if (result.success && result.data && !result.skipped) {
            await addRecord({
              payment_date: result.data.date,
              category: result.data.category,
              sub_category: result.data.subCategory,
              description: result.data.details,
              expense: result.data.amount,
              company: result.data.buyer,
              has_invoice: true,
            });
          } else if (result.skipped) {
            setStatus(`跳过重复文件: ${name}`);
          }
        } else if (isPaymentFile(name)) {
          setStatus(`正在处理付款凭证: ${name}`);
          const result = await processPaymentOcr(file);
          if (result.success && result.data && !result.skipped) {
            // 检查是否有匹配结果
            if (result.matchResult?.autoMatched) {
              setStatus(`付款凭证已自动匹配到发票`);
            } else if (result.matchResult?.pendingMatch) {
              setStatus(`付款凭证需要手动匹配 (${result.matchResult.candidateCount} 个候选)`);
            } else if (result.matchResult?.createdRecord || result.recordId) {
              setStatus(`付款凭证已写入独立报销记录`);
            } else {
              setStatus(`付款凭证识别完成，但未返回写库结果`);
            }
          } else if (result.skipped) {
            setStatus(`跳过重复文件: ${name}`);
          }
        }
        // 刷新统计
        await refreshAllData();
      } catch (err) {
        console.error(`Error processing ${name}:`, err);
        setStatus(`处理失败: ${err.message}`);
      }
    }
    setStatus(`处理完成`);
  }, [hasLlmConfig, processInvoiceOcr, processPaymentOcr, addRecord, refreshAllData]);

  // 开始监控
  const startWatching = useCallback(async () => {
    if (!activeProjectId) {
      setStatus('请先选择项目');
      return;
    }

    const result = await selectDirectory({ mode: 'read' });
    if (!result.success) {
      setStatus(result.error || '选择目录失败');
      return;
    }

    setWatcherName(result.name);

    if (result.type === 'fsa' && result.handle) {
      // Chrome/Edge: 可以持续监控
      setWatchDirectoryHandle(result.handle);
      const watcher = new DirectoryWatcher(result, handleNewFiles);
      watcherRef.current = watcher;
      await watcher.start();
      setIsWatching(true);
      setStatus('正在监控目录...');
    } else if (result.files) {
      // Safari/Firefox: 一次性处理所有文件
      setStatus('正在处理文件...');
      await handleNewFiles(result.files.map(f => ({ file: f, name: f.name })));
    }
  }, [activeProjectId, handleNewFiles, setWatchDirectoryHandle]);

  // 停止监控
  const stopWatching = useCallback(() => {
    if (watcherRef.current) {
      watcherRef.current.stop();
      watcherRef.current = null;
    }
    setIsWatching(false);
    setWatchDirectoryHandle(null);
    setStatus('');
  }, [setWatchDirectoryHandle]);

  // 清理
  useEffect(() => {
    return () => {
      if (watcherRef.current) {
        watcherRef.current.stop();
      }
    };
  }, []);

  if (!activeProjectId) return null;

  // 计算总数
  const totalCount = processingStats.processing + processingStats.completed +
                     processingStats.skipped + processingStats.errored;
  const progressPercent = totalCount > 0
    ? Math.round((processingStats.completed + processingStats.skipped + processingStats.errored) / totalCount * 100)
    : 0;

  return (
    <div className={`watcher-panel ${isExpanded ? 'watcher-panel--expanded' : ''}`}>
      {/* 头部 */}
      <div className="watcher-panel__header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="watcher-panel__status">
          <div className={`watcher-panel__indicator ${isWatching ? 'watcher-panel__indicator--active' : ''}`}>
            {isWatching ? '●' : '○'}
          </div>
          <div className="watcher-panel__title">
            <span className="watcher-panel__title-text">文件夹监控</span>
            <span className="watcher-panel__title-status">
              {isWatching ? '监听中' : '已停止'}
            </span>
          </div>
        </div>

        {/* 快速统计 */}
        <div className="watcher-panel__quick-stats">
          {processingStats.processing > 0 && (
            <span className="watcher-stat-badge watcher-stat-badge--processing">
              处理中 {processingStats.processing}
            </span>
          )}
          {processingStats.completed > 0 && (
            <span className="watcher-stat-badge watcher-stat-badge--completed">
              完成 {processingStats.completed}
            </span>
          )}
          {processingStats.skipped > 0 && (
            <span className="watcher-stat-badge watcher-stat-badge--skipped">
              重复 {processingStats.skipped}
            </span>
          )}
          {processingStats.errored > 0 && (
            <span className="watcher-stat-badge watcher-stat-badge--errored">
              错误 {processingStats.errored}
            </span>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="watcher-panel__actions" onClick={(e) => e.stopPropagation()}>
          {!isWatching ? (
            <button className="watcher-action-btn" onClick={startWatching} title="开始监控">
              ▶
            </button>
          ) : (
            <button className="watcher-action-btn watcher-action-btn--active" onClick={stopWatching} title="停止监控">
              ⏹
            </button>
          )}
          <button
            className={`watcher-action-btn ${isRefreshing ? 'watcher-action-btn--loading' : ''}`}
            onClick={refreshAllData}
            disabled={isRefreshing}
            title="刷新状态"
          >
            <RefreshIcon />
          </button>
          <button className="watcher-action-btn" title={isExpanded ? '收起' : '展开'}>
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* 进度条 */}
      {isWatching && totalCount > 0 && (
        <div className="watcher-panel__progress">
          <div
            className="watcher-panel__progress-bar"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* 展开详情 */}
      {isExpanded && (
        <div className="watcher-panel__details">
          {/* 提示信息 */}
          {!hasFsa && (
            <p className="watcher-panel__notice">
              当前浏览器不支持实时监控，将使用一次性文件选择。
              建议使用 <strong>Chrome</strong> 或 <strong>Edge</strong> 浏览器获得完整功能。
            </p>
          )}

          {/* 统计卡片 */}
          <div className="watcher-stats-grid">
            <div className="watcher-stat-card watcher-stat-card--processing">
              <div className="watcher-stat-value">{processingStats.processing}</div>
              <div className="watcher-stat-label">处理中</div>
            </div>
            <div className="watcher-stat-card watcher-stat-card--completed">
              <div className="watcher-stat-value">{processingStats.completed}</div>
              <div className="watcher-stat-label">已完成</div>
            </div>
            <div className="watcher-stat-card watcher-stat-card--skipped">
              <div className="watcher-stat-value">{processingStats.skipped}</div>
              <div className="watcher-stat-label">重复</div>
            </div>
            <div className="watcher-stat-card watcher-stat-card--errored">
              <div className="watcher-stat-value">{processingStats.errored}</div>
              <div className="watcher-stat-label">错误</div>
            </div>
          </div>

          {/* 监控目录 */}
          {watcherName && (
            <div className="watcher-info">
              <CheckIcon />
              <span>监控目录: {watcherName}</span>
            </div>
          )}

          {/* 状态信息 */}
          {status && (
            <div className="watcher-status">
              {status}
            </div>
          )}

          {/* 重复文件列表 */}
          {duplicateFiles.length > 0 && (
            <div className="watcher-list">
              <div className="watcher-list__title">
                <CopyIcon /> 重复文件 ({duplicateFiles.length})
              </div>
              <div className="watcher-list__items">
                {duplicateFiles.slice(0, 5).map((file) => (
                  <div key={file.id} className="watcher-list__item">
                    <span className="watcher-list__item-name" title={file.file_name}>
                      {file.file_name}
                    </span>
                    <span className={`watcher-list__item-type watcher-list__item-type--${file.file_type}`}>
                      {file.file_type === 'invoice' ? '发票' : '付款'}
                    </span>
                  </div>
                ))}
                {duplicateFiles.length > 5 && (
                  <div className="watcher-list__more">
                    还有 {duplicateFiles.length - 5} 个...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 错误文件列表 */}
          {errorFiles.length > 0 && (
            <div className="watcher-list watcher-list--errors">
              <div className="watcher-list__title">
                <AlertIcon /> 错误文件 ({errorFiles.length})
              </div>
              <div className="watcher-list__items">
                {errorFiles.slice(0, 5).map((file) => (
                  <div key={file.id} className="watcher-list__item">
                    <span className="watcher-list__item-name" title={file.file_name}>
                      {file.file_name}
                    </span>
                    <span className="watcher-list__item-status">处理失败</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="watcher-panel__actions-row">
            {!isWatching ? (
              <button className="btn btn--primary" onClick={startWatching}>
                {hasFsa ? '选择监控目录' : '选择文件夹'}
              </button>
            ) : (
              <button className="btn btn--danger" onClick={stopWatching}>
                停止监控
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default WatcherPanel;
