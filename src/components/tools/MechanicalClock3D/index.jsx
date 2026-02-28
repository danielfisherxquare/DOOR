import { useEffect } from 'react'
import Digit3D from './Digit3D'
import Colon3D from './Colon3D'
import ControlPanel from '../MechanicalClock/ControlPanel'
import useClockStore from '../../../stores/clockStore'
import './mechanical-clock-3d.css'

/**
 * 3D 机械式七段显示器主组件
 * 
 * 真正的 3D 翻转时钟：每个笔画都是具有厚度的六面立方体
 * 显示格式: H : MM : SS
 */
const MechanicalClock3D = () => {
    const { time, isRunning, start, pause, reset, getTimeParts, getPrevTimeParts } = useClockStore()
    const mode = useClockStore(state => state.mode)
    const toggleMode = useClockStore(state => state.toggleMode)
    const isSlowMotion = useClockStore(state => state.isSlowMotion)
    const toggleSlowMotion = useClockStore(state => state.toggleSlowMotion)
    const timeParts = getTimeParts()
    const prevTimeParts = getPrevTimeParts()

    const isBlank = mode === 'timer' && time === 0 && !isRunning

    // 慢动作倍率
    const speedMult = isSlowMotion ? 8 : 1

    // 挂载时如果是时钟模式，自动启动
    useEffect(() => {
        const { mode, startClock } = useClockStore.getState()
        if (mode === 'clock') startClock()

        return () => {
            const state = useClockStore.getState()
            state.stopClock()
            state.pause()
        }
    }, [])

    return (
        <div className="mc3d">
            {/* 左上角慢动作按钮 */}
            <button
                className={`clock-btn mc3d__slow-btn ${isSlowMotion ? 'mc3d__slow-btn--active' : ''}`}
                onClick={toggleSlowMotion}
                title={isSlowMotion ? '恢复正常速度' : '慢动作 (1/8 速度)'}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {isSlowMotion ? (
                        /* 快进图标 */
                        <>
                            <polygon points="5,4 15,12 5,20" fill="currentColor" />
                            <polygon points="13,4 23,12 13,20" fill="currentColor" />
                        </>
                    ) : (
                        /* 蜗牛/慢速图标 - 用 0.5x 文字 */
                        <text x="12" y="16" textAnchor="middle" fontSize="13" fontWeight="bold" fill="currentColor" stroke="none">⅛</text>
                    )}
                </svg>
            </button>

            {/* 右上角模式切换按钮 */}
            <button
                className={`clock-btn mc3d__mode-btn ${mode === 'clock' ? 'mc3d__mode-btn--clock' : ''}`}
                onClick={toggleMode}
                title={mode === 'timer' ? '切换到时钟模式' : '切换到计时器模式'}
            >
                {mode === 'timer' ? (
                    /* 时钟图标 */
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                ) : (
                    /* 计时器图标 */
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="10" y1="2" x2="14" y2="2" />
                        <line x1="12" y1="2" x2="12" y2="6" />
                        <circle cx="12" cy="14" r="8" />
                        <polyline points="12 10 12 14 15 14" />
                    </svg>
                )}
            </button>

            {/* 时钟显示区域 */}
            <div className={`mc3d__display ${isBlank ? 'is-blank' : ''}`}>
                {(() => {
                    if (mode === 'clock') {
                        // 时钟模式：HH:MM:SS，无前导零抑制，小时位2个Digit
                        const hd = timeParts.hoursDigits   // [tens, ones]
                        const md = timeParts.minutesDigits  // [tens, ones]
                        const sd = timeParts.secondsDigits  // [tens, ones]
                        const phd = prevTimeParts.hoursDigits
                        const pmd = prevTimeParts.minutesDigits
                        const psd = prevTimeParts.secondsDigits

                        return (
                            <>
                                <div className="mc3d__group">
                                    <Digit3D value={hd[0]} prevValue={phd[0]} digitDelay={150 * speedMult} />
                                    <Digit3D value={hd[1]} prevValue={phd[1]} digitDelay={120 * speedMult} />
                                </div>
                                <Colon3D isRunning={true} />
                                <div className="mc3d__group">
                                    <Digit3D value={md[0]} prevValue={pmd[0]} digitDelay={90 * speedMult} />
                                    <Digit3D value={md[1]} prevValue={pmd[1]} digitDelay={60 * speedMult} />
                                </div>
                                <Colon3D isRunning={true} />
                                <div className="mc3d__group">
                                    <Digit3D value={sd[0]} prevValue={psd[0]} digitDelay={30 * speedMult} />
                                    <Digit3D value={sd[1]} prevValue={psd[1]} digitDelay={0} />
                                </div>
                            </>
                        )
                    }

                    // 计时器模式：前导零抑制
                    const allDigits = [
                        timeParts.hoursDigits[0],
                        timeParts.minutesDigits[0], timeParts.minutesDigits[1],
                        timeParts.secondsDigits[0], timeParts.secondsDigits[1],
                    ]
                    const allPrev = [
                        prevTimeParts.hoursDigits[0],
                        prevTimeParts.minutesDigits[0], prevTimeParts.minutesDigits[1],
                        prevTimeParts.secondsDigits[0], prevTimeParts.secondsDigits[1],
                    ]
                    let idx = allDigits.findIndex(d => d !== 0)
                    if (idx === -1) idx = allDigits.length
                    let pidx = allPrev.findIndex(d => d !== 0)
                    if (pidx === -1) pidx = allPrev.length
                    const dd = allDigits.map((d, i) => i < idx ? null : d)
                    const pd = allPrev.map((d, i) => i < pidx ? null : d)

                    return (
                        <>
                            <div className="mc3d__group">
                                <Digit3D value={dd[0]} prevValue={pd[0]} digitDelay={120 * speedMult} />
                            </div>
                            <Colon3D isRunning={isRunning} />
                            <div className="mc3d__group">
                                <Digit3D value={dd[1]} prevValue={pd[1]} digitDelay={90 * speedMult} />
                                <Digit3D value={dd[2]} prevValue={pd[2]} digitDelay={60 * speedMult} />
                            </div>
                            <Colon3D isRunning={isRunning} />
                            <div className="mc3d__group">
                                <Digit3D value={dd[3]} prevValue={pd[3]} digitDelay={30 * speedMult} />
                                <Digit3D value={dd[4]} prevValue={pd[4]} digitDelay={0} />
                            </div>
                        </>
                    )
                })()}
            </div>

            {/* 控制按钮（完全复用现有组件） */}
            <ControlPanel
                isRunning={isRunning}
                onStart={start}
                onPause={pause}
                onReset={reset}
                mode={mode}
            />

            {/* 标签 */}
            <div className="mc3d__label">
                时 : 分 : 秒
            </div>
        </div>
    )
}

export default MechanicalClock3D
