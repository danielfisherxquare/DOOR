import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMapStore } from '../../stores/mapStore';
import MapAdvancedPanel from './MapAdvancedPanel';
import { CommandDetailPane } from '../command/CommandPrimitives';
import studioProjectApi from '../../services/studioProjectApi';
import { getSpatialObjectLabel, SPATIAL_OBJECT_PRESETS, mapNodeToSpatialObjectPayload } from '../../utils/map/spatialObjects';
import { getTerrainWorkZoneLabel, terrainWorkZoneToGeoJSONFeature, terrainWorkZoneToMapNode } from '../../utils/map/terrainWorkZones';
import { applyAssetTemplateToNode, inferTemplateObjectType, type StudioAssetTemplate } from '../../utils/map/assetTemplates';
import { measureGeometry } from '../../utils/map/measurements';
import { buildAppHref } from '../app/appConfig';
import { showError, showSuccess } from '../../utils/toast';
import './MapFeaturePanel.css';

interface MapFeaturePanelProps {
  nodeId: string;
  onClose?: () => void;
}

type TabType = 'properties' | 'advanced';

export default function MapFeaturePanel({ nodeId, onClose }: MapFeaturePanelProps) {
  const { treeNodes, updateFeature, deleteFeature, setTreeNodes, setDrawnFeatures, recordHistory } = useMapStore();
  const [activeTab, setActiveTab] = useState<TabType>('properties');
  const [syncing, setSyncing] = useState(false);
  const [assetTemplates, setAssetTemplates] = useState<StudioAssetTemplate[]>([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const node = treeNodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const isStudioDerived = node.source === 'studio-derived';
  const projectId = searchParams.get('projectId');
  const orgId = searchParams.get('orgId');
  const raceId = searchParams.get('raceId');
  const isTerrainWorkZone = node.source === 'terrain-work-zone' || Boolean(node.backendWorkZoneId);
  const activeWorkZoneId = node.backendWorkZoneId || node.focusZoneId || null;
  const detailSubtitle = isTerrainWorkZone
    ? `工作区: ${getTerrainWorkZoneLabel(node.zoneType)}`
    : `类型: ${node.featureType || '未知'}`;
  const hasTerrainPatch = Boolean(node.terrainPatchGeneratedAt || node.terrainHeightDeltaMeters);
  const hasPublishManifest = Boolean(node.publishManifestGeneratedAt || node.publishManifestObjectCount);
  const hasExportPackage = Boolean(node.exportPackageGeneratedAt || node.exportPackageResourceCount);
  const hasExecutedExport = Boolean(node.exportTaskId || node.exportOutputRoot);
  const activeTemplate = node.templateId
    ? assetTemplates.find((item) => item.id === node.templateId) || null
    : null;
  const measurementSummary = node.geometry ? measureGeometry(node.geometry).summary : '无几何';

  useEffect(() => {
    let active = true;

    if (!orgId) {
      setAssetTemplates([]);
      return () => {
        active = false;
      };
    }

    studioProjectApi.listAssetTemplates(orgId || undefined)
      .then((result) => {
        if (!active) return;
        setAssetTemplates(Array.isArray(result?.data) ? result.data : []);
      })
      .catch((error: any) => {
        if (!active) return;
        console.warn('[MapFeaturePanel] Failed to load asset templates', error);
        setAssetTemplates([]);
      });

    return () => {
      active = false;
    };
  }, [orgId]);

  const handleChange = (field: keyof typeof node, value: string | number) => {
    recordHistory();
    updateFeature(nodeId, { [field]: value });
  };

  const handleTemplateChange = (templateId: string) => {
    if (!templateId) {
      updateFeature(nodeId, {
        templateId: null,
        templateName: null,
        variantId: null,
        assetTemplateKind: null,
        assetTemplateSource: null,
      });
      return;
    }

    const template = assetTemplates.find((item) => item.id === templateId);
    if (!template) return;
    updateFeature(nodeId, applyAssetTemplateToNode(template, node as any));
  };

  const handleSync = async () => {
    if (!projectId || isStudioDerived) return;
    setSyncing(true);
    try {
      let response;
      if (isTerrainWorkZone) {
        if (node.geometry?.type !== 'Polygon') {
          throw new Error('地形工作区必须是 Polygon');
        }
        const payload = {
          name: node.name || getTerrainWorkZoneLabel(node.zoneType),
          zoneType: node.zoneType || 'focus-zone',
          clipPolygonWgs84: node.geometry,
          terrainResolution: node.terrainResolution ?? 2,
          includedObjectIds: node.includedObjectIds || [],
          publishTarget: {
            mode: node.zoneType || 'focus-zone',
            sourceNodeId: node.id,
          },
          metadata: {
            source: 'map-feature-panel',
            sourceNodeId: node.id,
          },
          status: 'ready',
        };
        response = activeWorkZoneId
          ? await studioProjectApi.updateTerrainWorkZone(activeWorkZoneId, payload, orgId || undefined)
          : await studioProjectApi.createTerrainWorkZone(projectId, payload, orgId || undefined);
      } else {
        const payload = mapNodeToSpatialObjectPayload({
          ...node,
          syncStatus: 'dirty',
        } as any);
        response = node.backendObjectId
          ? await studioProjectApi.updateSpatialObject(node.backendObjectId, payload, orgId || undefined)
          : await studioProjectApi.createSpatialObject(projectId, payload, orgId || undefined);
      }
      if (isTerrainWorkZone) {
        const zoneId = response?.data?.id || activeWorkZoneId || null;
        updateFeature(nodeId, {
          backendWorkZoneId: zoneId,
          focusZoneId: zoneId,
          syncStatus: 'synced',
          sourceProjectId: projectId,
          source: 'terrain-work-zone',
        });
        showSuccess(activeWorkZoneId ? '地形工作区已更新' : '地形工作区已创建');
      } else {
        const objectId = response?.data?.id || node.backendObjectId || null;
        updateFeature(nodeId, {
          backendObjectId: objectId,
          syncStatus: 'synced',
          sourceProjectId: projectId,
          source: 'spatial-object',
        });
        showSuccess(node.backendObjectId ? '项目空间对象已更新' : '项目空间对象已创建');
      }
    } catch (error: any) {
      showError(`${isTerrainWorkZone ? '同步地形工作区' : '同步空间对象'}失败：${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteRemote = async () => {
    if (!projectId) return;
    setSyncing(true);
    try {
      if (isTerrainWorkZone) {
        if (!activeWorkZoneId) return;
        await studioProjectApi.deleteTerrainWorkZone(activeWorkZoneId, orgId || undefined);
      } else {
        if (!node.backendObjectId) return;
        await studioProjectApi.deleteSpatialObject(node.backendObjectId, orgId || undefined);
      }
      deleteFeature(nodeId);
      showSuccess(isTerrainWorkZone ? '地形工作区已删除' : '项目空间对象已删除');
      onClose?.();
    } catch (error: any) {
      showError(`删除失败：${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateTerrainWorkZone = async () => {
    if (!projectId || !node.geometry || node.geometry.type !== 'Polygon') return;
    setSyncing(true);
    try {
      const payload = {
        name: `${node.name || getSpatialObjectLabel(node.objectType)} 工作区`,
        zoneType: 'focus-zone',
        clipPolygonWgs84: node.geometry,
        includedObjectIds: node.backendObjectId ? [node.backendObjectId] : [],
        publishTarget: {
          mode: 'focus-zone',
          sourceNodeId: node.id,
        },
        metadata: {
          source: 'map-feature-panel',
          sourceNodeId: node.id,
          objectType: node.objectType || 'generic',
        },
      };
      const response = node.focusZoneId
        ? await studioProjectApi.updateTerrainWorkZone(node.focusZoneId, payload, orgId || undefined)
        : await studioProjectApi.createTerrainWorkZone(projectId, payload, orgId || undefined);
      const zoneRecord = response?.data || null;
      if (zoneRecord?.id && node.backendObjectId) {
        await studioProjectApi.updateSpatialObject(node.backendObjectId, {
          focusZoneId: zoneRecord.id,
        }, orgId || undefined);
      }
      updateFeature(nodeId, {
        focusZoneId: zoneRecord?.id || null,
        syncStatus: node.backendObjectId ? 'synced' : (node.syncStatus || 'local'),
      });
      if (zoneRecord?.id) {
        const terrainNode = terrainWorkZoneToMapNode(zoneRecord);
        const terrainFeature = terrainWorkZoneToGeoJSONFeature(zoneRecord, terrainNode.id);
        const currentState = useMapStore.getState();
        if (!currentState.treeNodes.some((item) => item.id === terrainNode.id || item.backendWorkZoneId === zoneRecord.id)) {
          setTreeNodes([...currentState.treeNodes, terrainNode]);
        }
        if (terrainFeature && !currentState.drawnFeatures.some((feature) => {
          const props = (feature.properties || {}) as any;
          return feature.id === terrainFeature.id || props.backendWorkZoneId === zoneRecord.id;
        })) {
          setDrawnFeatures([...currentState.drawnFeatures, terrainFeature]);
        }
      }
      showSuccess('地形工作区已创建');
    } catch (error: any) {
      showError(`创建地形工作区失败：${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenWorkbench = () => {
    if (!projectId || !activeWorkZoneId) return;
    const href = buildAppHref(`/3d-studio/${projectId}`, { orgId, raceId });
    const nextUrl = new URL(href, window.location.origin);
    nextUrl.searchParams.set('focusZoneId', activeWorkZoneId);
    nextUrl.searchParams.set('sourceNodeId', node.id);
    nextUrl.searchParams.set('openMode', 'terrain-work-zone');
    navigate(`${nextUrl.pathname}${nextUrl.search}`);
  };

  const handleOpenBoundWorkbench = () => {
    if (!projectId || !node.focusZoneId) return;
    const href = buildAppHref(`/3d-studio/${projectId}`, { orgId, raceId });
    const nextUrl = new URL(href, window.location.origin);
    nextUrl.searchParams.set('focusZoneId', node.focusZoneId);
    nextUrl.searchParams.set('sourceNodeId', node.id);
    nextUrl.searchParams.set('openMode', 'terrain-work-zone');
    navigate(`${nextUrl.pathname}${nextUrl.search}`);
  };

  const handleGenerateTerrainPatch = async () => {
    if (!activeWorkZoneId) return;
    setSyncing(true);
    try {
      const zoneResult = await studioProjectApi.getTerrainWorkZone(activeWorkZoneId, orgId || undefined);
      const zoneRecord = zoneResult?.data;
      if (!zoneRecord) {
        throw new Error('未找到地形工作区');
      }

      const { generateTerrainPatchForZone } = await import('../../utils/map/focusZoneTerrainPatch');
      const terrainPatch = await generateTerrainPatchForZone(zoneRecord, {
        terrainResolution: node.terrainResolution ?? zoneRecord.terrainResolution ?? 2,
      });

      const updateResult = await studioProjectApi.updateTerrainWorkZone(activeWorkZoneId, {
        snapshotJson: {
          ...(zoneRecord.snapshotJson || {}),
          terrainPatch,
        },
        metadata: {
          ...(zoneRecord.metadata || {}),
          terrainPatchGeneratedAt: terrainPatch.sampledAt,
          terrainHeightDeltaMeters: terrainPatch.heightDeltaMeters,
        },
        terrainResolution: terrainPatch.resolutionMeters,
        status: 'ready',
      }, orgId || undefined);

      const updatedZone = updateResult?.data || zoneRecord;
      updateFeature(nodeId, {
        terrainResolution: updatedZone.terrainResolution ?? terrainPatch.resolutionMeters,
        syncStatus: 'synced',
        terrainPatchGeneratedAt: terrainPatch.sampledAt,
        terrainHeightDeltaMeters: terrainPatch.heightDeltaMeters,
      });
      showSuccess('Terrain patch 已生成');
    } catch (error: any) {
      showError(`生成 terrain patch 失败：${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleGeneratePublishManifest = async () => {
    if (!activeWorkZoneId) return;
    setSyncing(true);
    try {
      const result = await studioProjectApi.generateTerrainWorkZonePublishManifest(activeWorkZoneId, orgId || undefined);
      const zoneRecord = result?.data?.zone;
      const manifest = result?.data?.manifest;
      if (!zoneRecord || !manifest) {
        throw new Error('发布清单生成结果无效');
      }

      const nextNode = terrainWorkZoneToMapNode(zoneRecord);
      updateFeature(nodeId, {
        terrainResolution: nextNode.terrainResolution,
        terrainPatchGeneratedAt: nextNode.terrainPatchGeneratedAt,
        terrainHeightDeltaMeters: nextNode.terrainHeightDeltaMeters,
        publishManifestGeneratedAt: nextNode.publishManifestGeneratedAt,
        publishManifestObjectCount: nextNode.publishManifestObjectCount,
        publishManifestBatchCount: nextNode.publishManifestBatchCount,
        publishManifestLodSummary: nextNode.publishManifestLodSummary,
        publishManifestInstancingEligibleCount: nextNode.publishManifestInstancingEligibleCount,
        publishManifestGeometryFamilyCount: nextNode.publishManifestGeometryFamilyCount,
        syncStatus: 'synced',
      });
      showSuccess(`发布清单已生成，共 ${manifest.summary?.totalObjects || 0} 个对象 / ${manifest.summary?.batchCount || 0} 个批次`);
    } catch (error: any) {
      showError(`生成发布清单失败：${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerateExportPackage = async () => {
    if (!activeWorkZoneId) return;
    setSyncing(true);
    try {
      const result = await studioProjectApi.generateTerrainWorkZoneExportPackage(activeWorkZoneId, orgId || undefined);
      const zoneRecord = result?.data?.zone;
      const exportPackage = result?.data?.exportPackage;
      if (!zoneRecord || !exportPackage) {
        throw new Error('导出包生成结果无效');
      }

      const nextNode = terrainWorkZoneToMapNode(zoneRecord);
      updateFeature(nodeId, {
        terrainResolution: nextNode.terrainResolution,
        terrainPatchGeneratedAt: nextNode.terrainPatchGeneratedAt,
        terrainHeightDeltaMeters: nextNode.terrainHeightDeltaMeters,
        publishManifestGeneratedAt: nextNode.publishManifestGeneratedAt,
        publishManifestObjectCount: nextNode.publishManifestObjectCount,
        publishManifestBatchCount: nextNode.publishManifestBatchCount,
        publishManifestLodSummary: nextNode.publishManifestLodSummary,
        publishManifestInstancingEligibleCount: nextNode.publishManifestInstancingEligibleCount,
        publishManifestGeometryFamilyCount: nextNode.publishManifestGeometryFamilyCount,
        exportPackageGeneratedAt: nextNode.exportPackageGeneratedAt,
        exportPackageResourceCount: nextNode.exportPackageResourceCount,
        exportPackageLodResources: nextNode.exportPackageLodResources,
        exportPackageInstancingReadyResources: nextNode.exportPackageInstancingReadyResources,
        exportPackageInstancingReadyObjects: nextNode.exportPackageInstancingReadyObjects,
        syncStatus: 'synced',
      });
      showSuccess(`导出包已生成，共 ${exportPackage.summary?.totalResources || 0} 个资源`);
    } catch (error: any) {
      showError(`生成导出包失败：${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleExecuteExport = async () => {
    if (!activeWorkZoneId) return;
    setSyncing(true);
    try {
      const result = await studioProjectApi.executeTerrainWorkZoneExport(activeWorkZoneId, orgId || undefined);
      const zoneRecord = result?.data?.zone;
      const task = result?.data?.task;
      if (!zoneRecord || !task) {
        throw new Error('导出执行结果无效');
      }

      const nextNode = terrainWorkZoneToMapNode(zoneRecord);
      updateFeature(nodeId, {
        terrainResolution: nextNode.terrainResolution,
        terrainPatchGeneratedAt: nextNode.terrainPatchGeneratedAt,
        terrainHeightDeltaMeters: nextNode.terrainHeightDeltaMeters,
        publishManifestGeneratedAt: nextNode.publishManifestGeneratedAt,
        publishManifestObjectCount: nextNode.publishManifestObjectCount,
        publishManifestBatchCount: nextNode.publishManifestBatchCount,
        publishManifestLodSummary: nextNode.publishManifestLodSummary,
        publishManifestInstancingEligibleCount: nextNode.publishManifestInstancingEligibleCount,
        publishManifestGeometryFamilyCount: nextNode.publishManifestGeometryFamilyCount,
        exportPackageGeneratedAt: nextNode.exportPackageGeneratedAt,
        exportPackageResourceCount: nextNode.exportPackageResourceCount,
        exportPackageLodResources: nextNode.exportPackageLodResources,
        exportPackageInstancingReadyResources: nextNode.exportPackageInstancingReadyResources,
        exportPackageInstancingReadyObjects: nextNode.exportPackageInstancingReadyObjects,
        exportTaskId: nextNode.exportTaskId,
        exportTaskStatus: nextNode.exportTaskStatus,
        exportOutputRoot: nextNode.exportOutputRoot,
        syncStatus: 'synced',
      });
      showSuccess(`导出执行完成，输出目录 ${task.relativeOutputRoot}`);
    } catch (error: any) {
      showError(`执行导出失败：${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const getTabs = () => (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
      <button
        className={`btn btn--sm ${activeTab === 'properties' ? 'btn--primary' : 'btn--ghost'}`}
        onClick={() => setActiveTab('properties')}
      >
        属性
      </button>
      <button
        className={`btn btn--sm ${activeTab === 'advanced' ? 'btn--primary' : 'btn--ghost'}`}
        onClick={() => setActiveTab('advanced')}
      >
        详情
      </button>
    </div>
  );

  return (
    <CommandDetailPane 
      title={node.name || '未命名要素'} 
      subtitle={detailSubtitle}
      actions={(
        <button
          type="button"
          className="btn btn--icon btn--ghost"
          onClick={onClose}
          title="关闭详情"
          aria-label="关闭详情"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
        </button>
      )}
      className="feature-panel-wrap"
    >
      {getTabs()}

      {/* 内容区 */}
      <div className="feature-panel-content">
        {activeTab === 'properties' ? (
          <>
            <div className="feature-form-group">
              <label>名称</label>
              <input
                type="text"
                value={node.name || ''}
                disabled={isStudioDerived}
                onChange={(e) => handleChange('name', e.target.value)}
              />
              {isStudioDerived && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  楼层名称来自结构数据，请在结构模式中修改。
                </span>
              )}
            </div>

            <div className="feature-form-group">
              <label>类型</label>
              <span style={{ fontSize: '14px', color: 'var(--text-primary)', padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                {isTerrainWorkZone ? getTerrainWorkZoneLabel(node.zoneType) : node.featureType}
              </span>
            </div>

            <div className="feature-form-group">
              <label>量算</label>
              <span style={{ fontSize: '14px', color: 'var(--text-primary)', padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                {measurementSummary}
              </span>
            </div>

            {!isTerrainWorkZone ? (
              <>
                <div className="feature-form-group">
                  <label>标准件模板</label>
                  <select
                    value={node.templateId || ''}
                    disabled={isStudioDerived}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                  >
                    <option value="">不使用模板</option>
                    {assetTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}{template.source === 'builtin' ? ' · 内置' : ''}
                      </option>
                    ))}
                  </select>
                  {activeTemplate && (
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      分类: {activeTemplate.category || 'generic'} · 类型: {inferTemplateObjectType(activeTemplate)}
                    </span>
                  )}
                </div>

                <div className="feature-form-group">
                  <label>语义对象</label>
                  <select
                    value={node.objectType || 'generic'}
                    disabled={isStudioDerived}
                    onChange={(e) => handleChange('objectType', e.target.value)}
                  >
                    {SPATIAL_OBJECT_PRESETS.map((preset) => (
                      <option key={preset.objectType} value={preset.objectType}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="feature-form-group">
                  <label>落地方式</label>
                  <select
                    value={node.placementMode || 'follow-terrain'}
                    disabled={isStudioDerived}
                    onChange={(e) => handleChange('placementMode', e.target.value)}
                  >
                    <option value="follow-terrain">贴地</option>
                    <option value="level-platform">找平平台</option>
                    <option value="vertical-keep">主体垂直</option>
                  </select>
                </div>

                <div className="feature-form-group">
                  <label>品牌包</label>
                  <select
                    value={node.brandingPackId || 'neutral'}
                    disabled={isStudioDerived}
                    onChange={(e) => handleChange('brandingPackId', e.target.value)}
                  >
                    <option value="neutral">中性白模</option>
                    <option value="race-red">赛事红</option>
                    <option value="sponsor-blue">赞助蓝</option>
                    <option value="energy-green">能量绿</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>

                <div className="feature-form-group">
                  <label>门楣样式</label>
                  <select
                    value={node.fasciaStyle || 'classic'}
                    disabled={isStudioDerived}
                    onChange={(e) => handleChange('fasciaStyle', e.target.value)}
                  >
                    <option value="classic">经典门楣</option>
                    <option value="boxed">盒式门楣</option>
                    <option value="banner">横幅门楣</option>
                    <option value="towered">塔冠门楣</option>
                  </select>
                </div>

                <div className="feature-form-group">
                  <label>赞助商标识</label>
                  <input
                    type="text"
                    value={node.sponsorName || ''}
                    disabled={isStudioDerived}
                    placeholder="例如 Sponsor A"
                    onChange={(e) => handleChange('sponsorName', e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="feature-form-group">
                  <label>工作区类型</label>
                  <select
                    value={node.zoneType || 'focus-zone'}
                    disabled={isStudioDerived}
                    onChange={(e) => handleChange('zoneType', e.target.value)}
                  >
                    <option value="focus-zone">重点区工作区</option>
                    <option value="terrain-clip">地形裁剪区</option>
                    <option value="corridor-zone">赛道走廊区</option>
                  </select>
                </div>

                <div className="feature-form-group">
                  <label>地形分辨率</label>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={node.terrainResolution ?? 2}
                    onChange={(e) => handleChange('terrainResolution', Number(e.target.value))}
                  />
                  <span style={{ fontSize: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {node.terrainResolution ?? 2} m
                  </span>
                </div>

                <div className="feature-form-group">
                  <label>关联对象</label>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)', padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    {(node.includedObjectIds || []).length} 个
                  </span>
                </div>

                <div className="feature-form-group">
                  <label>发布清单</label>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)', padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    {hasPublishManifest
                      ? `${node.publishManifestObjectCount || 0} 对象 / ${node.publishManifestBatchCount || 0} 批次`
                      : '尚未生成'}
                  </span>
                  {node.publishManifestLodSummary && (
                    <span style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      LOD0 {node.publishManifestLodSummary.LOD0 || 0} / LOD1 {node.publishManifestLodSummary.LOD1 || 0} / LOD2 {node.publishManifestLodSummary.LOD2 || 0}
                    </span>
                  )}
                  {(node.publishManifestInstancingEligibleCount || node.publishManifestGeometryFamilyCount) && (
                    <span style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      可实例化 {node.publishManifestInstancingEligibleCount || 0} / 几何家族 {node.publishManifestGeometryFamilyCount || 0}
                    </span>
                  )}
                </div>

                <div className="feature-form-group">
                  <label>导出包</label>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)', padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    {hasExportPackage
                      ? `${node.exportPackageResourceCount || 0} 个资源`
                      : '尚未生成'}
                  </span>
                  {node.exportPackageLodResources && (
                    <span style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      LOD0 {node.exportPackageLodResources.LOD0 || 0} / LOD1 {node.exportPackageLodResources.LOD1 || 0} / LOD2 {node.exportPackageLodResources.LOD2 || 0}
                    </span>
                  )}
                  {(node.exportPackageInstancingReadyResources || node.exportPackageInstancingReadyObjects) && (
                    <span style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Instancing-ready 资源 {node.exportPackageInstancingReadyResources || 0} / 对象 {node.exportPackageInstancingReadyObjects || 0}
                    </span>
                  )}
                </div>

                <div className="feature-form-group">
                  <label>导出执行</label>
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)', padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                    {hasExecutedExport ? (node.exportTaskStatus || 'completed') : '尚未执行'}
                  </span>
                  {node.exportOutputRoot && (
                    <span style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                      输出: {node.exportOutputRoot}
                    </span>
                  )}
                </div>
              </>
            )}

            {!isStudioDerived && (
              <div className="feature-form-group">
                <label>同步状态</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '999px' }}>
                    {isTerrainWorkZone
                      ? (activeWorkZoneId ? `已绑定 ${getTerrainWorkZoneLabel(node.zoneType)}` : '仅本地工作区')
                      : (node.backendObjectId ? `已绑定 ${getSpatialObjectLabel(node.objectType)}` : '仅本地')}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {node.syncStatus || ((node.backendObjectId || activeWorkZoneId) ? 'synced' : 'local')}
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="feature-form-group">
                <label>颜色 (可选)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="color"
                    value={node.color || '#3388ff'}
                    onChange={(e) => handleChange('color', e.target.value)}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{node.color || '#3388ff'}</span>
                </div>
              </div>

              <div className="feature-form-group">
                <label>{isTerrainWorkZone ? '边框颜色' : '强调色'}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="color"
                    value={(isTerrainWorkZone ? node.strokeColor : node.accentColor) || '#ffffff'}
                    onChange={(e) => handleChange(isTerrainWorkZone ? 'strokeColor' : 'accentColor', e.target.value)}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {(isTerrainWorkZone ? node.strokeColor : node.accentColor) || '#ffffff'}
                  </span>
                </div>
              </div>

              {!isTerrainWorkZone && (
                <div className="feature-form-group">
                  <label>边框颜色</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="color"
                      value={node.strokeColor || '#3388ff'}
                      onChange={(e) => handleChange('strokeColor', e.target.value)}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{node.strokeColor || '#3388ff'}</span>
                  </div>
                </div>
              )}

            </div>

            <div className="feature-form-group">
              <label>边框宽度 (px)</label>
              <input
                type="range"
                min="1"
                max="10"
                value={node.strokeWeight || 3}
                onChange={(e) => handleChange('strokeWeight', Number(e.target.value))}
              />
              <span style={{ fontSize: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{node.strokeWeight || 3} px</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="feature-form-group">
                <label>填充颜色</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="color"
                    value={node.fillColor || '#3388ff'}
                    onChange={(e) => handleChange('fillColor', e.target.value)}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{node.fillColor || '#3388ff'}</span>
                </div>
              </div>
            </div>

            <div className="feature-form-group">
              <label>填充透明度</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={node.fillOpacity ?? 0.3}
                onChange={(e) => handleChange('fillOpacity', Number(e.target.value))}
              />
              <span style={{ fontSize: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{node.fillOpacity ?? 0.3}</span>
            </div>

            {!isStudioDerived && projectId && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="btn btn--primary" onClick={handleSync} disabled={syncing}>
                  {syncing
                    ? '同步中...'
                    : isTerrainWorkZone
                      ? (activeWorkZoneId ? '更新工作区' : '保存工作区')
                      : (node.backendObjectId ? '更新到项目' : '保存到项目')}
                </button>
                {(node.backendObjectId || activeWorkZoneId) && (
                  <button type="button" className="btn btn--ghost" onClick={handleDeleteRemote} disabled={syncing}>
                    {isTerrainWorkZone ? '删除工作区' : '删除项目对象'}
                  </button>
                )}
                {isTerrainWorkZone && activeWorkZoneId && (
                  <button type="button" className="btn btn--ghost" onClick={handleOpenWorkbench}>
                    进入工作台
                  </button>
                )}
              </div>
            )}

            {isTerrainWorkZone && activeWorkZoneId && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn--ghost" onClick={handleGenerateTerrainPatch} disabled={syncing}>
                  {syncing ? '处理中...' : hasTerrainPatch ? '刷新 Terrain Patch' : '生成 Terrain Patch'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={handleGeneratePublishManifest}
                  disabled={syncing || !hasTerrainPatch}
                >
                  {syncing ? '处理中...' : hasPublishManifest ? '刷新发布清单' : '生成发布清单'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={handleGenerateExportPackage}
                  disabled={syncing || !hasPublishManifest}
                >
                  {syncing ? '处理中...' : hasExportPackage ? '刷新导出包' : '生成导出包'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={handleExecuteExport}
                  disabled={syncing || !hasExportPackage}
                >
                  {syncing ? '处理中...' : hasExecutedExport ? '重新执行导出' : '执行导出'}
                </button>
                {hasTerrainPatch && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                    已缓存局部高程
                  </span>
                )}
                {!hasTerrainPatch && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                    需先生成 Terrain Patch
                  </span>
                )}
                {hasPublishManifest && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                    最近一次: {node.publishManifestGeneratedAt}
                  </span>
                )}
                {hasExportPackage && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                    导出包: {node.exportPackageGeneratedAt}
                  </span>
                )}
                {hasExecutedExport && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                    任务: {node.exportTaskStatus}
                  </span>
                )}
              </div>
            )}

            {!isStudioDerived && projectId && !isTerrainWorkZone && node.geometry?.type === 'Polygon' && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="btn btn--ghost" onClick={handleCreateTerrainWorkZone} disabled={syncing}>
                  {node.focusZoneId ? '刷新地形工作区' : '生成地形工作区'}
                </button>
                {node.focusZoneId && (
                  <button type="button" className="btn btn--ghost" onClick={handleOpenBoundWorkbench}>
                    进入工作台
                  </button>
                )}
                {node.focusZoneId && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                    工作区: {node.focusZoneId}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <MapAdvancedPanel nodeId={nodeId} />
        )}
      </div>
    </CommandDetailPane>
  );
}
