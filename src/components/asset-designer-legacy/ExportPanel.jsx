/**
 * ExportPanel — 导出面板
 * 提供截图、数据导出、平面图生成功能
 */
import { useState, useCallback } from 'react'
import useAssetDesignerStore from '../../stores/assetDesignerStore'
import { exportToJSON, exportToExcel, downloadText, downloadArrayBuffer } from '../../utils/exportUtils'
import { generateSVGFloorPlan, generatePDFFloorPlan } from '../../utils/floorPlanUtils'

export default function ExportPanel({ onClose }) {
  const { draftScene, levels } = useAssetDesignerStore()
  const [activeTab, setActiveTab] = useState('data')
  const [isExporting, setIsExporting] = useState(false)

  // 截图设置
  const [screenshotSettings, setScreenshotSettings] = useState({
    width: 1920,
    height: 1080,
    format: 'png',
    quality: 95,
  })

  // 数据导出设置
  const [dataSettings, setDataSettings] = useState({
    format: 'json',
    includeLevels: true,
    includeMeasurements: true,
  })

  // 平面图设置
  const [floorPlanSettings, setFloorPlanSettings] = useState({
    format: 'svg',
    scale: 100,
    includeDimensions: true,
    levelId: 'all',
  })

  const handleScreenshot = useCallback(() => {
    setIsExporting(true)
    try {
      // 提示用户使用浏览器截图
      alert('请使用浏览器开发者工具或截图软件进行截图。\n\n提示：按 F12 打开开发者工具，然后使用截图功能。')
    } finally {
      setIsExporting(false)
    }
  }, [])

  const handleDataExport = useCallback(() => {
    setIsExporting(true)
    try {
      const timestamp = Date.now()
      if (dataSettings.format === 'json') {
        const json = exportToJSON(draftScene, dataSettings)
        downloadText(json, `scene_${timestamp}.json`, 'application/json')
      } else if (dataSettings.format === 'xlsx') {
        const buffer = exportToExcel(draftScene, dataSettings)
        downloadArrayBuffer(buffer, `scene_${timestamp}.xlsx`)
      }
    } catch (error) {
      console.error('导出失败:', error)
      alert('导出失败: ' + error.message)
    } finally {
      setIsExporting(false)
    }
  }, [draftScene, dataSettings])

  const handleFloorPlanExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const timestamp = Date.now()
      const options = {
        ...floorPlanSettings,
        levelId: floorPlanSettings.levelId === 'all' ? null : floorPlanSettings.levelId,
      }

      if (floorPlanSettings.format === 'svg') {
        const svg = generateSVGFloorPlan(draftScene, options)
        downloadText(svg, `floorplan_${timestamp}.svg`, 'image/svg+xml')
      } else if (floorPlanSettings.format === 'pdf') {
        const doc = await generatePDFFloorPlan(draftScene, options)
        doc.save(`floorplan_${timestamp}.pdf`)
      }
    } catch (error) {
      console.error('平面图导出失败:', error)
      alert('平面图导出失败: ' + error.message)
    } finally {
      setIsExporting(false)
    }
  }, [draftScene, floorPlanSettings])

  return (
    <div className="export-panel">
      <div className="export-panel__header">
        <h3>导出</h3>
        <button className="export-panel__close" onClick={onClose}>×</button>
      </div>

      {/* Tab 切换 */}
      <div className="export-panel__tabs">
        <button
          className={`export-panel__tab ${activeTab === 'screenshot' ? 'active' : ''}`}
          onClick={() => setActiveTab('screenshot')}
        >
          截图
        </button>
        <button
          className={`export-panel__tab ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          数据
        </button>
        <button
          className={`export-panel__tab ${activeTab === 'floorplan' ? 'active' : ''}`}
          onClick={() => setActiveTab('floorplan')}
        >
          平面图
        </button>
      </div>

      <div className="export-panel__content">
        {/* 截图设置 */}
        {activeTab === 'screenshot' && (
          <div className="export-panel__section">
            <div className="export-panel__field">
              <label>分辨率</label>
              <div className="export-panel__row">
                <input
                  type="number"
                  value={screenshotSettings.width}
                  onChange={(e) => setScreenshotSettings(s => ({ ...s, width: Number(e.target.value) }))}
                  min={800}
                  max={4096}
                />
                <span>×</span>
                <input
                  type="number"
                  value={screenshotSettings.height}
                  onChange={(e) => setScreenshotSettings(s => ({ ...s, height: Number(e.target.value) }))}
                  min={600}
                  max={2160}
                />
              </div>
            </div>

            <div className="export-panel__field">
              <label>格式</label>
              <select
                value={screenshotSettings.format}
                onChange={(e) => setScreenshotSettings(s => ({ ...s, format: e.target.value }))}
              >
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
                <option value="webp">WebP</option>
              </select>
            </div>

            {screenshotSettings.format !== 'png' && (
              <div className="export-panel__field">
                <label>质量: {screenshotSettings.quality}%</label>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={screenshotSettings.quality}
                  onChange={(e) => setScreenshotSettings(s => ({ ...s, quality: Number(e.target.value) }))}
                />
              </div>
            )}

            <button
              className="export-panel__button"
              onClick={handleScreenshot}
              disabled={isExporting}
            >
              {isExporting ? '导出中...' : '导出截图'}
            </button>
          </div>
        )}

        {/* 数据导出设置 */}
        {activeTab === 'data' && (
          <div className="export-panel__section">
            <div className="export-panel__field">
              <label>格式</label>
              <select
                value={dataSettings.format}
                onChange={(e) => setDataSettings(s => ({ ...s, format: e.target.value }))}
              >
                <option value="json">JSON</option>
                <option value="xlsx">Excel (XLSX)</option>
              </select>
            </div>

            <div className="export-panel__field">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={dataSettings.includeLevels}
                  onChange={(e) => setDataSettings(s => ({ ...s, includeLevels: e.target.checked }))}
                />
                包含楼层信息
              </label>
            </div>

            <div className="export-panel__field">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={dataSettings.includeMeasurements}
                  onChange={(e) => setDataSettings(s => ({ ...s, includeMeasurements: e.target.checked }))}
                />
                包含测量数据
              </label>
            </div>

            <button
              className="export-panel__button"
              onClick={handleDataExport}
              disabled={isExporting}
            >
              {isExporting ? '导出中...' : '导出数据'}
            </button>
          </div>
        )}

        {/* 平面图设置 */}
        {activeTab === 'floorplan' && (
          <div className="export-panel__section">
            <div className="export-panel__field">
              <label>格式</label>
              <select
                value={floorPlanSettings.format}
                onChange={(e) => setFloorPlanSettings(s => ({ ...s, format: e.target.value }))}
              >
                <option value="svg">SVG (矢量图)</option>
                <option value="pdf">PDF (文档)</option>
              </select>
            </div>

            <div className="export-panel__field">
              <label>比例尺: 1m = {floorPlanSettings.scale}px</label>
              <input
                type="range"
                min={50}
                max={200}
                value={floorPlanSettings.scale}
                onChange={(e) => setFloorPlanSettings(s => ({ ...s, scale: Number(e.target.value) }))}
              />
            </div>

            <div className="export-panel__field">
              <label>楼层</label>
              <select
                value={floorPlanSettings.levelId}
                onChange={(e) => setFloorPlanSettings(s => ({ ...s, levelId: e.target.value }))}
              >
                <option value="all">所有楼层</option>
                {levels?.map((level) => (
                  <option key={level.id} value={level.id}>{level.name}</option>
                ))}
              </select>
            </div>

            <div className="export-panel__field">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={floorPlanSettings.includeDimensions}
                  onChange={(e) => setFloorPlanSettings(s => ({ ...s, includeDimensions: e.target.checked }))}
                />
                显示尺寸标注
              </label>
            </div>

            <button
              className="export-panel__button"
              onClick={handleFloorPlanExport}
              disabled={isExporting}
            >
              {isExporting ? '导出中...' : '导出平面图'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}