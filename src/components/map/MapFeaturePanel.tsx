import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMapStore } from '../../stores/mapStore';
import MapAdvancedPanel from './MapAdvancedPanel';
import { CommandDetailPane } from '../command/CommandPrimitives';
import studioProjectApi from '../../services/studioProjectApi';
import { getSpatialObjectLabel, mapNodeToSpatialObjectPayload } from '../../utils/map/spatialObjects';
import { getTerrainWorkZoneLabel, terrainWorkZoneToMapNode } from '../../utils/map/terrainWorkZones';
import { measureGeometry } from '../../utils/map/measurements';
import { createBlankStudioScene } from '../../utils/studioProjectUtils';
import { buildAppHref } from '../app/appConfig';
import { showError, showSuccess } from '../../utils/toast';
import './MapFeaturePanel.css';

interface MapFeaturePanelProps {
  nodeId: string;
  onClose?: () => void;
  projectId?: string | null;
  orgId?: string | null;
  raceId?: string | null;
}

type TabType = 'properties' | 'advanced' | 'export';
const SCENE_EXPORT_POLL_INTERVAL_MS = 1500;
const SCENE_EXPORT_MAX_ATTEMPTS = 80;

function normalizeStudioProjectId(projectId?: string | null) {
  const normalized = String(projectId || '').trim();
  if (!normalized || normalized === 'new') return null;
  return normalized;
}

export default function MapFeaturePanel({
  nodeId,
  onClose,
  projectId: projectIdProp = null,
  orgId: orgIdProp = null,
  raceId: raceIdProp = null,
}: MapFeaturePanelProps) {
  const { treeNodes, updateFeature, deleteFeature, recordHistory, viewMode } = useMapStore();
  const [activeTab, setActiveTab] = useState<TabType>('properties');
  const [syncing, setSyncing] = useState(false);
  const [localProjectId, setLocalProjectId] = useState<string | null>(null);
  const [exportDiagnostics, setExportDiagnostics] = useState<any>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const node = treeNodes.find((n) => n.id === nodeId);
  const routeProjectId = normalizeStudioProjectId(projectIdProp || searchParams.get('projectId'));
  const projectId = routeProjectId || localProjectId;
  const orgId = orgIdProp || searchParams.get('orgId');
  const raceId = raceIdProp || searchParams.get('raceId');
  const is3DMode = viewMode === '3D' || viewMode === '3DGlobe';

  useEffect(() => {
    if (activeTab === 'export' && !is3DMode) {
      setActiveTab('properties');
    }
  }, [activeTab, is3DMode]);

  if (!node) return null;

  const isStudioDerived = node.source === 'studio-derived';
  const isTerrainWorkZone = node.source === 'terrain-work-zone' || Boolean(node.backendWorkZoneId);
  const activeWorkZoneId = node.backendWorkZoneId || node.focusZoneId || null;
  const detailSubtitle = isTerrainWorkZone
    ? `工作区: ${getTerrainWorkZoneLabel(node.zoneType)}`
    : `类型: ${node.featureType || '未知'}`;
  const hasTerrainPatch = Boolean(node.terrainPatchGeneratedAt || node.terrainHeightDeltaMeters);
  const hasPublishManifest = Boolean(node.publishManifestGeneratedAt || node.publishManifestObjectCount);
  const hasExportPackage = Boolean(node.exportPackageGeneratedAt || node.exportPackageResourceCount);
  const hasExecutedExport = Boolean(node.exportTaskId || node.exportOutputRoot);
  const measurementSummary = node.geometry ? measureGeometry(node.geometry).summary : '无几何';
  const exportDisabledReason = !is3DMode
    ? '请先切换到 3D 模式'
    : !orgId
      ? '当前地图缺少机构上下文'
      : isStudioDerived
        ? 'Studio 派生对象不能从地图侧导出'
        : node.geometry?.type !== 'Polygon'
          ? '请选择面域或矩形选区'
          : null;

  const handleChange = (field: keyof typeof node, value: string | number) => {
    recordHistory();
    updateFeature(nodeId, { [field]: value });
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

  const updateNodeFromWorkZone = (zoneRecord: any, targetProjectId = projectId) => {
    if (!zoneRecord?.id) return;
    const nextNode = terrainWorkZoneToMapNode(zoneRecord) as any;
    updateFeature(nodeId, {
      source: 'terrain-work-zone',
      sourceProjectId: targetProjectId || undefined,
      backendWorkZoneId: zoneRecord.id,
      focusZoneId: zoneRecord.id,
      zoneType: nextNode.zoneType,
      terrainResolution: nextNode.terrainResolution,
      includedObjectIds: [],
      geometry: nextNode.geometry || node.geometry,
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
      geometrySource: nextNode.geometrySource,
      syncStatus: 'synced',
    });
  };

  const updateNodeFromGeneratedScene = (jobRecord: any) => {
    if (!jobRecord) return;
    const osmDiagnostics = jobRecord?.generatedScene?.manifestJson?.osm?.diagnostics
      || jobRecord?.generatedScene?.metadata?.osmDiagnostics
      || null;
    if (osmDiagnostics) setExportDiagnostics(osmDiagnostics);
    updateFeature(nodeId, {
      generatedSceneId: jobRecord.generatedSceneId || null,
      generatedSceneStatus: jobRecord.generatedScene?.status || jobRecord.status || null,
      generatedSceneJobId: jobRecord.id || null,
      generatedSceneQualityPreset: jobRecord.qualityPreset || null,
      generatedSceneOsmCount: osmDiagnostics?.returnedCount ?? jobRecord.generatedScene?.manifestJson?.stats?.osmBuildingCount ?? undefined,
      generatedSceneOsmDiagnostics: osmDiagnostics || undefined,
    });
  };

  const getExportDiagnosticRows = () => {
    const diagnostics = exportDiagnostics || (node as any).generatedSceneOsmDiagnostics || null;
    if (!diagnostics) return null;
    const filters = diagnostics.filters || {};
    return [
      ['OSM 原始元素', diagnostics.rawElementCount ?? 0],
      ['可渲染建筑元素', diagnostics.renderableElementCount ?? 0],
      ['识别 footprint', diagnostics.footprintCount ?? 0],
      ['保留建筑', diagnostics.returnedCount ?? 0],
      ['超大面积过滤', filters.areaTooLarge ?? 0],
      ['主轴过长过滤', filters.majorTooLong ?? 0],
      ['长条异常过滤', filters.ribbonLike ?? 0],
      ['building:part 压制父轮廓', filters.suppressedByBuildingParts ?? 0],
      ['超过数量上限截断', filters.truncatedByMaxBuildings ?? 0],
    ];
  };

  const ensureExportProject = async () => {
    if (projectId) return projectId;
    if (!orgId) throw new Error('当前地图缺少机构上下文');

    const projectName = `GIS 选区白模 - ${node.name || '未命名选区'}`;
    const result = await studioProjectApi.createProject({
      name: projectName,
      sceneType: 'outdoor-event',
      projectType: 'site',
      sourceType: 'blank',
      snapshotJson: createBlankStudioScene({
        name: projectName,
        sceneType: 'outdoor-event',
        projectType: 'site',
      }),
    }, orgId || undefined);
    const createdProject = result?.data;
    if (!createdProject?.id) throw new Error('自动创建 3D Studio 项目失败');

    setLocalProjectId(createdProject.id);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('projectId', createdProject.id);
    if (orgId) nextParams.set('orgId', orgId);
    if (raceId) nextParams.set('raceId', raceId);
    setSearchParams(nextParams, { replace: true });
    return createdProject.id;
  };

  const ensureSelectionWorkZone = async () => {
    const targetProjectId = await ensureExportProject();
    if (!node.geometry || node.geometry.type !== 'Polygon') throw new Error('请选择面域或矩形选区');

    const payload = {
      name: node.name || '地图选区白模',
      zoneType: 'focus-zone',
      clipPolygonWgs84: node.geometry,
      terrainResolution: node.terrainResolution ?? 2,
      includedObjectIds: [],
      publishTarget: {
        mode: 'focus-zone',
        sourceNodeId: node.id,
        exportIntent: 'map-selection-white-model',
      },
      metadata: {
        source: 'map-selection-export',
        sourceNodeId: node.id,
        semanticObjectMode: 'disabled',
      },
      status: 'ready',
    };
    const response = activeWorkZoneId
      ? await studioProjectApi.updateTerrainWorkZone(activeWorkZoneId, payload, orgId || undefined)
      : await studioProjectApi.createTerrainWorkZone(targetProjectId, payload, orgId || undefined);
    const zoneRecord = response?.data;
    if (!zoneRecord?.id) throw new Error('工作区创建结果无效');
    updateNodeFromWorkZone(zoneRecord, targetProjectId);
    return zoneRecord;
  };

  const ensureTerrainPatch = async (zoneRecord: any) => {
    if (zoneRecord?.snapshotJson?.terrainPatch) return zoneRecord;

    const result = await studioProjectApi.syncTerrainWorkZoneTerrainPatch(zoneRecord.id, {
      terrainResolution: node.terrainResolution ?? zoneRecord.terrainResolution ?? 2,
    }, orgId || undefined);
    const updatedZone = result?.data?.zone || zoneRecord;
    updateNodeFromWorkZone(updatedZone, updatedZone.projectId || zoneRecord.projectId || projectId);
    return updatedZone;
  };

  const waitForSceneExportJob = async (jobId: string) => {
    let latestJob: any = null;
    for (let attempt = 0; attempt < SCENE_EXPORT_MAX_ATTEMPTS; attempt += 1) {
      const response = await studioProjectApi.getSceneExportJob(jobId, orgId || undefined);
      latestJob = response?.data || null;
      if (!latestJob) throw new Error('导出任务返回为空');
      updateNodeFromGeneratedScene(latestJob);
      if (latestJob.status === 'completed') return latestJob;
      if (latestJob.status === 'failed') {
        throw new Error(latestJob.errorMessage || '选区白模导出失败');
      }
      await new Promise((resolve) => window.setTimeout(resolve, SCENE_EXPORT_POLL_INTERVAL_MS));
    }
    throw new Error(`导出任务超时${latestJob?.stage ? `：${latestJob.stage}` : ''}`);
  };

  const ensureCompletedSceneExport = async (targetType: 'studio' | 'file') => {
    const zoneRecord = await ensureSelectionWorkZone();
    const zoneWithTerrain = await ensureTerrainPatch(zoneRecord);
    const targetProjectId = zoneWithTerrain?.projectId || projectId || await ensureExportProject();
    const response = await studioProjectApi.createTerrainWorkZoneSceneExportJob(
      targetProjectId,
      zoneWithTerrain.id,
      {
        targetType,
        qualityPreset: 'standard',
      },
      orgId || undefined,
    );
    const initialJob = response?.data;
    if (!initialJob?.id) throw new Error('导出任务创建失败');
    updateNodeFromGeneratedScene(initialJob);
    if (initialJob.status === 'completed') return { zoneRecord: zoneWithTerrain, jobRecord: initialJob };
    const completedJob = await waitForSceneExportJob(initialJob.id);
    return { zoneRecord: zoneWithTerrain, jobRecord: completedJob };
  };

  const triggerSceneDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  const getDownloadFilename = (headers: Record<string, string>, fallback: string) => {
    const contentDisposition = headers['content-disposition'] || headers['Content-Disposition'] || '';
    const match = contentDisposition.match(/filename\\*?=(?:UTF-8''|\"?)([^\";]+)/i);
    if (!match?.[1]) return fallback;
    try {
      return decodeURIComponent(match[1].replace(/\"/g, ''));
    } catch {
      return match[1].replace(/\"/g, '');
    }
  };

  const handleExportToStudio = async () => {
    if (exportDisabledReason) {
      showError(exportDisabledReason);
      return;
    }
    setSyncing(true);
    try {
      const { jobRecord } = await ensureCompletedSceneExport('studio');
      const sceneId = jobRecord?.generatedSceneId;
      if (!sceneId) throw new Error('导出任务缺少 generated scene');
      const importResult = await studioProjectApi.importGeneratedSceneToStudio(sceneId, {
        name: `${node.name || '地图选区'} Studio 导入`,
      }, orgId || undefined);
      const importedProjectId = importResult?.data?.studioProject?.id;
      if (!importedProjectId) throw new Error('导入 Studio 项目失败');
      showSuccess('选区白模已导入 3D Studio');
      const href = buildAppHref(`/3d-studio/${importedProjectId}`, { orgId, raceId });
      navigate(new URL(href, window.location.origin).pathname + new URL(href, window.location.origin).search);
    } catch (error: any) {
      showError(`导出到 3D Studio 失败：${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleExportWhiteModelFile = async () => {
    if (exportDisabledReason) {
      showError(exportDisabledReason);
      return;
    }
    setSyncing(true);
    try {
      const { jobRecord } = await ensureCompletedSceneExport('file');
      const sceneId = jobRecord?.generatedSceneId;
      if (!sceneId) throw new Error('导出任务缺少 generated scene');
      const downloadResponse = await studioProjectApi.downloadGeneratedScene(sceneId, {
        asset: 'glb',
        orgId: orgId || undefined,
      });
      const filename = getDownloadFilename(downloadResponse.headers || {}, `${node.name || 'white-model'}.glb`);
      triggerSceneDownload(downloadResponse.data, filename);
      showSuccess('白模文件已生成并开始下载');
    } catch (error: any) {
      showError(`导出白模文件失败：${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const getTabs = () => (
    <div className="feature-panel-tabs" role="tablist" aria-label="图形信息标签">
      <button
        type="button"
        className={`feature-panel-tab ${activeTab === 'properties' ? 'is-active' : ''}`}
        onClick={() => setActiveTab('properties')}
        role="tab"
        aria-selected={activeTab === 'properties'}
      >
        属性
      </button>
      <button
        type="button"
        className={`feature-panel-tab ${activeTab === 'advanced' ? 'is-active' : ''}`}
        onClick={() => setActiveTab('advanced')}
        role="tab"
        aria-selected={activeTab === 'advanced'}
      >
        详情
      </button>
      <button
        type="button"
        className={`feature-panel-tab ${activeTab === 'export' ? 'is-active' : ''}`}
        onClick={() => setActiveTab('export')}
        role="tab"
        aria-selected={activeTab === 'export'}
        disabled={!is3DMode}
        title={is3DMode ? '导出选区白模' : '切换到 3D 模式后可用'}
      >
        导出
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
          className="feature-panel-close"
          onClick={onClose}
          title="关闭详情"
          aria-label="关闭详情"
        >
          <span className="material-symbols-outlined">close</span>
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
                <span className="feature-panel-help">
                  楼层名称来自结构数据，请在结构模式中修改。
                </span>
              )}
            </div>

            <div className="feature-form-group">
              <label>类型</label>
              <span className="feature-panel-static">
                {isTerrainWorkZone ? getTerrainWorkZoneLabel(node.zoneType) : node.featureType}
              </span>
            </div>

            <div className="feature-form-group">
              <label>量算</label>
              <span className="feature-panel-static feature-panel-static--multiline">
                {measurementSummary}
              </span>
            </div>

            {isTerrainWorkZone && (
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
                  <span className="feature-panel-static">
                    {(node.includedObjectIds || []).length} 个
                  </span>
                </div>

                <div className="feature-form-group">
                  <label>发布清单</label>
                  <span className="feature-panel-static">
                    {hasPublishManifest
                      ? `${node.publishManifestObjectCount || 0} 对象 / ${node.publishManifestBatchCount || 0} 批次`
                      : '尚未生成'}
                  </span>
                  {node.publishManifestLodSummary && (
                    <span className="feature-panel-help">
                      LOD0 {node.publishManifestLodSummary.LOD0 || 0} / LOD1 {node.publishManifestLodSummary.LOD1 || 0} / LOD2 {node.publishManifestLodSummary.LOD2 || 0}
                    </span>
                  )}
                  {(node.publishManifestInstancingEligibleCount || node.publishManifestGeometryFamilyCount) && (
                    <span className="feature-panel-help">
                      可实例化 {node.publishManifestInstancingEligibleCount || 0} / 几何家族 {node.publishManifestGeometryFamilyCount || 0}
                    </span>
                  )}
                </div>

                <div className="feature-form-group">
                  <label>导出包</label>
                  <span className="feature-panel-static">
                    {hasExportPackage
                      ? `${node.exportPackageResourceCount || 0} 个资源`
                      : '尚未生成'}
                  </span>
                  {node.exportPackageLodResources && (
                    <span className="feature-panel-help">
                      LOD0 {node.exportPackageLodResources.LOD0 || 0} / LOD1 {node.exportPackageLodResources.LOD1 || 0} / LOD2 {node.exportPackageLodResources.LOD2 || 0}
                    </span>
                  )}
                  {(node.exportPackageInstancingReadyResources || node.exportPackageInstancingReadyObjects) && (
                    <span className="feature-panel-help">
                      Instancing-ready 资源 {node.exportPackageInstancingReadyResources || 0} / 对象 {node.exportPackageInstancingReadyObjects || 0}
                    </span>
                  )}
                </div>

                <div className="feature-form-group">
                  <label>导出执行</label>
                  <span className="feature-panel-static">
                    {hasExecutedExport ? (node.exportTaskStatus || 'completed') : '尚未执行'}
                  </span>
                  {node.exportOutputRoot && (
                    <span className="feature-panel-help feature-panel-help--break">
                      输出: {node.exportOutputRoot}
                    </span>
                  )}
                </div>
              </>
            )}

            {!isStudioDerived && (
              <div className="feature-form-group">
                <label>同步状态</label>
                <div className="feature-panel-status-row">
                  <span className="feature-panel-status-pill">
                    {isTerrainWorkZone
                      ? (activeWorkZoneId ? `已绑定 ${getTerrainWorkZoneLabel(node.zoneType)}` : '仅本地工作区')
                      : (node.backendObjectId ? `已绑定 ${getSpatialObjectLabel(node.objectType)}` : '仅本地')}
                  </span>
                  <span className="feature-panel-help">
                    {node.syncStatus || ((node.backendObjectId || activeWorkZoneId) ? 'synced' : 'local')}
                  </span>
                </div>
              </div>
            )}

            <div className="feature-panel-grid feature-panel-grid--two">
              <div className="feature-form-group">
                <label>颜色 (可选)</label>
                <div className="feature-panel-color-row">
                  <input
                    type="color"
                    value={node.color || '#3388ff'}
                    onChange={(e) => handleChange('color', e.target.value)}
                  />
                  <span className="feature-panel-color-value">{node.color || '#3388ff'}</span>
                </div>
              </div>

              <div className="feature-form-group">
                <label>{isTerrainWorkZone ? '边框颜色' : '强调色'}</label>
                <div className="feature-panel-color-row">
                  <input
                    type="color"
                    value={(isTerrainWorkZone ? node.strokeColor : node.accentColor) || '#ffffff'}
                    onChange={(e) => handleChange(isTerrainWorkZone ? 'strokeColor' : 'accentColor', e.target.value)}
                  />
                  <span className="feature-panel-color-value">
                    {(isTerrainWorkZone ? node.strokeColor : node.accentColor) || '#ffffff'}
                  </span>
                </div>
              </div>

              {!isTerrainWorkZone && (
                <div className="feature-form-group">
                  <label>边框颜色</label>
                  <div className="feature-panel-color-row">
                    <input
                      type="color"
                      value={node.strokeColor || '#3388ff'}
                      onChange={(e) => handleChange('strokeColor', e.target.value)}
                    />
                    <span className="feature-panel-color-value">{node.strokeColor || '#3388ff'}</span>
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
              <span className="feature-panel-range-value">{node.strokeWeight || 3} px</span>
            </div>

            <div className="feature-panel-grid feature-panel-grid--two">
              <div className="feature-form-group">
                <label>填充颜色</label>
                <div className="feature-panel-color-row">
                  <input
                    type="color"
                    value={node.fillColor || '#3388ff'}
                    onChange={(e) => handleChange('fillColor', e.target.value)}
                  />
                  <span className="feature-panel-color-value">{node.fillColor || '#3388ff'}</span>
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
              <span className="feature-panel-range-value">{node.fillOpacity ?? 0.3}</span>
            </div>

            {!isStudioDerived && projectId && (
              <div className="feature-panel-actions">
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
              </div>
            )}
          </>
        ) : activeTab === 'export' ? (
          <div className="feature-export-tab">
            <div className="feature-export-card">
              <span className="feature-export-eyebrow">选区白模</span>
              <strong>导出当前面域</strong>
              <span>
                只使用当前选区边界和地形数据生成白模，不依赖旧配置。
              </span>
            </div>

            <div className="feature-export-status-grid">
              <div>
                <span>地图模式</span>
                <strong>{is3DMode ? '3D 可用' : '仅 3D 可用'}</strong>
              </div>
              <div>
                <span>选区类型</span>
                <strong>{node.geometry?.type || '无几何'}</strong>
              </div>
              <div>
                <span>量算</span>
                <strong>{measurementSummary}</strong>
              </div>
              <div>
                <span>工作区</span>
                <strong>{activeWorkZoneId || '导出时自动创建'}</strong>
              </div>
              <div>
                <span>项目</span>
                <strong>{projectId || '导出时自动创建'}</strong>
              </div>
              <div>
                <span>地形缓存</span>
                <strong>{hasTerrainPatch ? '已生成' : '导出时自动生成'}</strong>
              </div>
              <div>
                <span>白模文件</span>
                <strong>{hasExecutedExport ? (node.exportTaskStatus || '已导出') : '尚未导出'}</strong>
              </div>
            </div>

            {exportDisabledReason && (
              <span className="feature-panel-static feature-panel-static--multiline">
                {exportDisabledReason}
              </span>
            )}

            {getExportDiagnosticRows() && (
              <div className="feature-export-diagnostics">
                <div className="feature-export-diagnostics__header">
                  <span>OSM 导出诊断</span>
                  <strong>{(exportDiagnostics || (node as any).generatedSceneOsmDiagnostics)?.truncatedByMaxBuildings ? '已触顶' : '正常'}</strong>
                </div>
                <div className="feature-export-diagnostics__grid">
                  {getExportDiagnosticRows()?.map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <span className="feature-panel-help">
                  若“可渲染建筑元素”本身很少，是 OSM 数据不足；若过滤项很高，是 footprint 被判定为大院、街区或异常轮廓。
                </span>
              </div>
            )}

            <div className="feature-panel-actions feature-panel-actions--stacked">
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleExportToStudio}
                disabled={syncing || Boolean(exportDisabledReason)}
              >
                {syncing ? '处理中...' : '导出到 3D Studio'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleExportWhiteModelFile}
                disabled={syncing || Boolean(exportDisabledReason)}
              >
                {syncing ? '处理中...' : '导出白模文件'}
              </button>
            </div>

            {node.exportOutputRoot && (
              <span className="feature-panel-help feature-panel-help--break">
                最近输出: {node.exportOutputRoot}
              </span>
            )}
          </div>
        ) : (
          <MapAdvancedPanel nodeId={nodeId} />
        )}
      </div>
    </CommandDetailPane>
  );
}
