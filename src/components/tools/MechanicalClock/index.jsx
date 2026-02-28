import { useEffect } from 'react'
import Digit from './Digit'
import Colon from './Colon'
import ControlPanel from './ControlPanel'
import useClockStore from '../../../stores/clockStore'
import './mechanical-clock.css'

/**
 * 机械式七段显示器主组件 (Mechanical 7-Segment Display)
 * 
 * 显示格式: H : MM : SS (小时 : 分钟 : 秒)
 * 每个笔画独立翻转，带有物理回弹效果
 */
const MechanicalClock = () => {
  const { time, isRunning, start, pause, reset, getTimeParts, getPrevTimeParts } = useClockStore()
  const mode = useClockStore(state => state.mode)
  const toggleMode = useClockStore(state => state.toggleMode)
  const timeParts = getTimeParts()
  const prevTimeParts = getPrevTimeParts()

  // 钟不启动且时间为0时，添加 class 隐藏内部数字发光片
  const isBlank = mode === 'timer' && time === 0 && !isRunning

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
    <div className="mechanical-clock">
      {/* 模式切换按钮 */}
      <button
        className={`clock-btn mc-mode-btn ${mode === 'clock' ? 'mc-mode-btn--clock' : ''}`}
        onClick={toggleMode}
        title={mode === 'timer' ? '切换到时钟模式' : '切换到计时器模式'}
      >
        {mode === 'timer' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="10" y1="2" x2="14" y2="2" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <circle cx="12" cy="14" r="8" />
            <polyline points="12 10 12 14 15 14" />
          </svg>
        )}
      </button>

      {/* 时钟显示区域 */}
      <div className={`clock-display ${isBlank ? 'is-blank' : ''}`}>
        {(() => {
          if (mode === 'clock') {
            // 时钟模式：HH:MM:SS
            const hd = timeParts.hoursDigits
            const md = timeParts.minutesDigits
            const sd = timeParts.secondsDigits
            const phd = prevTimeParts.hoursDigits
            const pmd = prevTimeParts.minutesDigits
            const psd = prevTimeParts.secondsDigits

            return (
              <>
                <div className="digit-group">
                  <Digit value={hd[0]} prevValue={phd[0]} />
                  <Digit value={hd[1]} prevValue={phd[1]} />
                </div>
                <Colon isRunning={true} />
                <div className="digit-group">
                  <Digit value={md[0]} prevValue={pmd[0]} />
                  <Digit value={md[1]} prevValue={pmd[1]} />
                </div>
                <Colon isRunning={true} />
                <div className="digit-group">
                  <Digit value={sd[0]} prevValue={psd[0]} />
                  <Digit value={sd[1]} prevValue={psd[1]} />
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
              <div className="digit-group">
                <Digit value={dd[0]} prevValue={pd[0]} />
              </div>
              <Colon isRunning={isRunning} />
              <div className="digit-group">
                <Digit value={dd[1]} prevValue={pd[1]} />
                <Digit value={dd[2]} prevValue={pd[2]} />
              </div>
              <Colon isRunning={isRunning} />
              <div className="digit-group">
                <Digit value={dd[3]} prevValue={pd[3]} />
                <Digit value={dd[4]} prevValue={pd[4]} />
              </div>
            </>
          )
        })()}
      </div>

      {/* 控制按钮 */}
      <ControlPanel
        isRunning={isRunning}
        onStart={start}
        onPause={pause}
        onReset={reset}
        mode={mode}
      />

      {/* 标签 */}
      <div className="clock-label">
        时 : 分 : 秒
      </div>
    </div>
  )
}

export default MechanicalClock