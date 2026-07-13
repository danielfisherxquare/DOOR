import { useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useMapStore, type MapTreeNode } from '../../stores/mapStore';
import { CommandPanel, CommandEmptyState } from '../command/CommandPrimitives';
import studioProjectApi from '../../services/studioProjectApi';
import { showError, showSuccess } from '../../utils/toast';

type TreeFilter = 'all' | 'visible' | 'hidden' | 'dirty' | 'spatial' | 'terrain';

export default function MapObjectTree() {
  const {
    treeNodes,
    selectedNodeId,
    dirtyFeatureIds,
    setSelectedNodeId,
    setPropsPanelNodeId,
    deleteFeature,
    triggerFlyToFeature,
    renameFeature,
    setFeatureVisibility,
    recordHistory,
  } = useMapStore();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  const orgId = searchParams.get('orgId');
  const [filter, setFilter] = useState<TreeFilter>('all');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<MapTreeNode | null>(null);

  const dirtySet = useMemo(() => new Set(dirtyFeatureIds), [dirtyFeatureIds]);

  const visibleNodes = useMemo(() => {
    return treeNodes.filter((node) => {
      if (filter === 'visible') return node.visible !== false;
      if (filter === 'hidden') return node.visible === false;
      if (filter === 'dirty') return dirtySet.has(node.id) || node.syncStatus === 'dirty' || node.syncStatus === 'local';
      if (filter === 'spatial') return node.source === 'spatial-object' || Boolean(node.backendObjectId) || (!node.backendWorkZoneId && node.type === 'feature');
      if (filter === 'terrain') return node.source === 'terrain-work-zone' || Boolean(node.backendWorkZoneId);
      return true;
    });
  }, [dirtySet, filter, treeNodes]);

  const handleSelect = (id: string) => {
    if (selectedNodeId === id) {
      setSelectedNodeId(null);
      setPropsPanelNodeId(null);
      return;
    }
    setSelectedNodeId(id);
    setPropsPanelNodeId(id);
  };

  const handleDoubleClick = (node: MapTreeNode) => {
    // 双击定位：飞行到该图形
    if (node.type === 'feature' && node.geometry) {
      triggerFlyToFeature(node.id);
    }
  };

  const confirmDelete = async () => {
    const node = pendingDelete;
    if (!node) return;
    if (node.siteModeBound) {
      showError('卫星场地区域已绑定 3D 项目，不能从图层树删除；可以先隐藏图层。');
      setPendingDelete(null);
      return;
    }
    try {
      recordHistory();
      if (projectId && node.backendObjectId) {
        await studioProjectApi.deleteSpatialObject(node.backendObjectId, orgId || undefined);
        showSuccess('项目空间对象已删除');
      } else if (projectId && node.backendWorkZoneId) {
        await studioProjectApi.deleteTerrainWorkZone(node.backendWorkZoneId, orgId || undefined);
        showSuccess('地形工作区已删除');
      }
      deleteFeature(node.id);
      setPendingDelete(null);
    } catch (error: unknown) {
      showError(`删除图形失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const startRename = (node: MapTreeNode) => {
    setRenamingId(node.id);
    setDraftName(node.name || '');
  };

  const commitRename = (node: MapTreeNode) => {
    const nextName = draftName.trim();
    if (nextName && nextName !== node.name) {
      recordHistory();
      renameFeature(node.id, nextName);
    }
    setRenamingId(null);
  };

  const renderNode = (node: MapTreeNode, depth: number = 0) => (
    <div
      key={node.id}
      style={{
        paddingLeft: depth * 16 + 8,
        paddingRight: 8,
        paddingTop: 8,
        paddingBottom: 8,
        display: 'grid',
        gridTemplateColumns: '18px minmax(0, 1fr) 24px 24px',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
        background: selectedNodeId === node.id ? 'var(--surface-active)' : 'transparent',
        borderRadius: 'var(--radius-sm)',
        color: selectedNodeId === node.id ? 'var(--accent)' : 'var(--text-primary)',
      }}
      onClick={() => handleSelect(node.id)}
      onDoubleClick={() => handleDoubleClick(node)}
      onMouseEnter={(e) => {
        if (selectedNodeId !== node.id) {
          e.currentTarget.style.background = 'var(--surface-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (selectedNodeId !== node.id) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
      title="双击定位到此图形"
    >
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
        {node.type === 'folder' ? 'folder' : node.source === 'terrain-work-zone' ? 'terrain' : node.icon || 'place'}
      </span>
      <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
        {renamingId === node.id ? (
          <input
            value={draftName}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => commitRename(node)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename(node);
              if (e.key === 'Escape') setRenamingId(null);
            }}
            style={{ minWidth: 0, height: 28, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text-primary)', padding: '0 8px' }}
          />
        ) : (
          <span
            style={{ minWidth: 0, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startRename(node);
            }}
          >
            {node.name}
          </span>
        )}
        {(dirtySet.has(node.id) || node.type === 'feature') && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
            {dirtySet.has(node.id) && (
              <span style={{ fontSize: '11px', color: 'var(--warning)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--warning-soft)', border: '1px solid color-mix(in srgb, var(--warning) 28%, var(--border))', whiteSpace: 'nowrap' }}>
                未保存
              </span>
            )}
            {node.type === 'feature' && (
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                {node.source === 'terrain-work-zone' ? '工作区' : node.objectType ? '对象' : '图形'}
              </span>
            )}
          </div>
        )}
      </div>
      {node.type === 'feature' && (
        <button
          className="btn btn--sm btn--icon btn--ghost"
          style={{ padding: '4px', height: '24px', width: '24px', color: node.visible === false ? 'var(--text-muted)' : 'var(--text-secondary)' }}
          onClick={(e) => {
            e.stopPropagation();
            recordHistory();
            setFeatureVisibility(node.id, node.visible === false);
          }}
          title={node.visible === false ? '显示' : '隐藏'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{node.visible === false ? 'visibility_off' : 'visibility'}</span>
        </button>
      )}
      {node.type === 'feature' && node.source !== 'studio-derived' && !node.siteModeBound && (
        <button
          className="btn btn--sm btn--icon btn--ghost"
          style={{ padding: '4px', height: '24px', width: '24px', color: 'var(--danger)' }}
          onClick={(e) => {
            e.stopPropagation();
            setPendingDelete(node);
          }}
          title="删除"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
        </button>
      )}
    </div>
  );

  return (
    <CommandPanel 
      title="图层" 
      actions={<span className="command-shell__eyebrow">{visibleNodes.length}/{treeNodes.length} 个图形</span>}
      className="map-object-tree-panel"
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
        {[
          ['all', '全部'],
          ['visible', '可见'],
          ['hidden', '隐藏'],
          ['dirty', '未保存'],
          ['spatial', '对象'],
          ['terrain', '工作区'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`btn btn--sm ${filter === value ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setFilter(value as TreeFilter)}
          >
            {label}
          </button>
        ))}
      </div>
      {pendingDelete && (
        <div style={{ display: 'grid', gap: '8px', marginBottom: '12px', padding: '10px', border: '1px solid color-mix(in srgb, var(--danger) 30%, var(--border))', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--danger) 8%, var(--surface))' }}>
          <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>删除 {pendingDelete.name}？</strong>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>项目对象会同步删除，此操作可用撤销恢复本地状态。</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn--sm btn--primary" onClick={confirmDelete}>确认删除</button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setPendingDelete(null)}>取消</button>
          </div>
        </div>
      )}
      <div className="tree-content" style={{ marginTop: '-8px' }}>
        {visibleNodes.length === 0 ? (
          <CommandEmptyState
            icon="edit"
            title="暂无图形"
            description="使用左侧工具在地图上绘制"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {visibleNodes.map((node) => renderNode(node))}
          </div>
        )}
      </div>
    </CommandPanel>
  );
}
