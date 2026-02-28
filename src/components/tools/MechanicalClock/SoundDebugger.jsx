import { useState, useRef } from 'react'
import { useSoundConfig, DEFAULT_CONFIG } from '../../../hooks/useSoundConfig'
import useMechanicalSound from '../../../hooks/useMechanicalSound'
import './sound-debugger.css'

const SoundDebugger = () => {
    const [isOpen, setIsOpen] = useState(false)
    const { config, updateConfig, resetConfig, importConfig } = useSoundConfig()
    const { playSegmentFlipSound, getAudioContext } = useMechanicalSound()
    const fileInputRef = useRef(null)

    if (!isOpen) {
        return (
            <button
                className="clock-btn sound-debugger-toggle"
                onClick={() => setIsOpen(true)}
                title="音效调试"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
            </button>
        )
    }

    const handleTestSound = () => {
        playSegmentFlipSound(getAudioContext(), config)
    }

    const handleSliderChange = (key, value) => {
        updateConfig(key, parseFloat(value))
    }

    const handleSliderRelease = () => {
        handleTestSound()
    }

    const exportConfig = () => {
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `clock-sound-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const handleImport = (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (evt) => {
            try {
                const parsed = JSON.parse(evt.target.result)
                importConfig(parsed)
                handleTestSound()
            } catch {
                alert('无法解析配置文件，请确认是合法的 JSON 格式')
            }
        }
        reader.readAsText(file)
        // 重置 input 以便同一文件可再次导入
        e.target.value = ''
    }

    const copyConfig = () => {
        navigator.clipboard.writeText(JSON.stringify(config, null, 2))
        alert('配置已复制到剪贴板！')
    }

    // 隐藏 file input
    const fileInput = (
        <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
        />
    )

    // ... 以下是滑块和面板 render
    const Slider = ({ label, configKey, min, max, step }) => (
        <div className="sd-slider-group">
            <div className="sd-slider-header">
                <span className="sd-slider-label">{label}</span>
                <span className="sd-slider-value">{config[configKey]}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={config[configKey]}
                onChange={(e) => handleSliderChange(configKey, e.target.value)}
                onMouseUp={handleSliderRelease}
                onTouchEnd={handleSliderRelease}
                className="sd-slider"
            />
        </div>
    )

    return (
        <div className="sd-panel">
            {/* 头部 */}
            <div className="sd-header">
                <h3 className="sd-title">🎧 音效调音台</h3>
                <button className="sd-close" onClick={() => setIsOpen(false)}>✕</button>
            </div>

            {/* 滚动区域 */}
            <div className="sd-body">
                {/* 全局音量 */}
                <div className="sd-section sd-section--global">
                    <Slider label="全局音量" configKey="globalVolume" min="0" max="2" step="0.05" />
                </div>

                {/* 层1 */}
                <div className="sd-section sd-section--trigger">
                    <h4 className="sd-section-title sd-section-title--trigger">1. Trigger · 释放摩擦</h4>
                    <Slider label="中心频率 (Hz)" configKey="triggerFreq" min="100" max="8000" step="50" />
                    <Slider label="衰减时长 (秒)" configKey="triggerDuration" min="0.001" max="0.1" step="0.001" />
                    <Slider label="层音量权重" configKey="triggerVol" min="0" max="3" step="0.1" />
                </div>

                {/* 层2 */}
                <div className="sd-section sd-section--thud">
                    <h4 className="sd-section-title sd-section-title--thud">2. Thud · 沉重砸地</h4>
                    <Slider label="起始冲击频率 (Hz)" configKey="thudStartFreq" min="20" max="500" step="5" />
                    <Slider label="深潜截止频率 (Hz)" configKey="thudEndFreq" min="1" max="200" step="1" />
                    <Slider label="余音/冲击时长 (秒)" configKey="thudDuration" min="0.01" max="0.8" step="0.01" />
                    <Slider label="爆发音量 (冲击感)" configKey="thudVol" min="0" max="5" step="0.1" />
                </div>

                {/* 层3 */}
                <div className="sd-section sd-section--clack">
                    <h4 className="sd-section-title sd-section-title--clack">3. Clack · 金属撞击</h4>
                    <Slider label="带通中心频率 (Hz)" configKey="clackFilterFreq" min="50" max="3000" step="10" />
                    <Slider label="响声时长 (秒)" configKey="clackDuration" min="0.01" max="0.3" step="0.01" />
                    <Slider label="层音量权重" configKey="clackVol" min="0" max="3" step="0.1" />
                </div>

                {/* 层4 */}
                <div className="sd-section sd-section--res">
                    <h4 className="sd-section-title sd-section-title--res">4. Resonance · 机壳回声</h4>
                    <Slider label="起始共鸣 (Hz)" configKey="resStartFreq" min="30" max="800" step="5" />
                    <Slider label="空腔深频 (Hz)" configKey="resEndFreq" min="10" max="400" step="5" />
                    <Slider label="回音消散时长 (秒)" configKey="resDuration" min="0.05" max="1.5" step="0.05" />
                    <Slider label="层音量权重" configKey="resVol" min="0" max="3" step="0.1" />
                </div>

                {/* 层5 */}
                <div className="sd-section sd-section--metal">
                    <h4 className="sd-section-title sd-section-title--metal">5. Metallic · 金属质感</h4>
                    <Slider label="金属频率 (Hz)" configKey="metalFreq" min="1000" max="12000" step="100" />
                    <Slider label="衰减截止频率 (Hz)" configKey="metalEndFreq" min="500" max="6000" step="100" />
                    <Slider label="持续时长 (秒)" configKey="metalDuration" min="0.01" max="0.2" step="0.005" />
                    <Slider label="音调偏移 (cents)" configKey="metalDetune" min="0" max="100" step="5" />
                    <Slider label="层音量权重" configKey="metalVol" min="0" max="2" step="0.05" />
                </div>

                {/* 层6 */}
                <div className="sd-section sd-section--echo">
                    <h4 className="sd-section-title sd-section-title--echo">6. Hall Echo · 空洞回声</h4>
                    <Slider label="回声间距 (秒)" configKey="echoDelay" min="0.02" max="0.3" step="0.01" />
                    <Slider label="衰减系数" configKey="echoDecay" min="0.1" max="0.9" step="0.05" />
                    <Slider label="回声次数" configKey="echoIterations" min="1" max="8" step="1" />
                    <Slider label="回声滤波频率 (Hz)" configKey="echoFilterFreq" min="500" max="8000" step="100" />
                    <Slider label="层音量权重" configKey="echoVol" min="0" max="2" step="0.05" />
                </div>
            </div>

            {/* 底部操作栏 */}
            <div className="sd-actions">
                <button className="sd-btn sd-btn--play" onClick={handleTestSound}>
                    ▶ 发声试听
                </button>
                <button className="sd-btn sd-btn--export" onClick={exportConfig}>
                    ⬇ 导出配置
                </button>
                <button className="sd-btn sd-btn--import" onClick={() => fileInputRef.current?.click()}>
                    ⬆ 导入配置
                </button>
                <button className="sd-btn sd-btn--copy" onClick={copyConfig}>
                    📋 复制JSON
                </button>
                <button className="sd-btn sd-btn--reset" onClick={resetConfig}>
                    ↺ 恢复默认
                </button>
            </div>

            {fileInput}

            <p className="sd-hint">所有更改自动保存 · 松开滑块自动发声</p>
        </div>
    )
}

export default SoundDebugger
