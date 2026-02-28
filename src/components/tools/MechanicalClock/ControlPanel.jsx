import { memo } from 'react'
import useMechanicalSound from '../../../hooks/useMechanicalSound'
import useClockStore from '../../../stores/clockStore'
import SoundDebugger from './SoundDebugger'

/**
 * 控制面板组件
 * 提供开始、暂停、重置、静音四个机械风格按钮
 * 
 * @param {Object} props
 * @param {boolean} props.isRunning - 计时器是否正在运行
 * @param {Function} props.onStart - 开始回调
 * @param {Function} props.onPause - 暂停回调
 * @param {Function} props.onReset - 重置回调
 */
const ControlPanel = memo(({ isRunning, onStart, onPause, onReset, mode = 'timer' }) => {
  const { isMuted, toggleMute } = useClockStore()
  const { playClickSound } = useMechanicalSound()

  const handleStart = () => {
    if (!isMuted) playClickSound(0.2)
    onStart()
  }

  const handlePause = () => {
    if (!isMuted) playClickSound(0.2)
    onPause()
  }

  const handleReset = () => {
    if (!isMuted) playClickSound(0.2)
    onReset()
  }

  const handleToggleMute = () => {
    // 切换静音时也播放一次声音，让用户知道当前状态
    if (isMuted) {
      playClickSound(0.15)
    }
    toggleMute()
  }

  return (
    <div className="clock-controls">
      {mode === 'timer' && (
        <>
          {!isRunning ? (
            <button className="clock-btn clock-btn--start" onClick={handleStart} title="开始">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </button>
          ) : (
            <button className="clock-btn clock-btn--pause" onClick={handlePause} title="暂停">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </button>
          )}

          <button className="clock-btn clock-btn--reset" onClick={handleReset} title="重置">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </button>
        </>
      )}

      <button
        className={`clock - btn ${isMuted ? 'clock-btn--muted' : 'clock-btn--sound'} `}
        onClick={handleToggleMute}
        title={isMuted ? '取消静音' : '静音'}
      >
        {isMuted ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </button>

      {/* 音效调试器 */}
      <div style={{ position: 'relative' }}>
        <SoundDebugger />
      </div>
    </div>
  )
})

ControlPanel.displayName = 'ControlPanel'

export default ControlPanel