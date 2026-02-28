import { create } from 'zustand'

/**
 * 机械计时钟状态管理
 * 使用 Zustand 进行状态管理
 * 
 * 支持两种模式：
 * - timer: 计时器模式（递增计时）
 * - clock: 时钟模式（显示北京时间 UTC+8）
 */

/**
 * 获取北京时间（Asia/Shanghai），使用 Intl.DateTimeFormat 保证正确性
 */
const beijingFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  hour: 'numeric', minute: 'numeric', second: 'numeric',
  hour12: false
})

const getBeijingTime = (offsetMs = 0) => {
  const now = new Date(Date.now() + offsetMs)
  const parts = beijingFormatter.formatToParts(now)
  const hours = parseInt(parts.find(p => p.type === 'hour').value) % 24
  const minutes = parseInt(parts.find(p => p.type === 'minute').value)
  const seconds = parseInt(parts.find(p => p.type === 'second').value)
  return { hours, minutes, seconds }
}

/**
 * 将 { hours, minutes, seconds } 转为总秒数
 */
const timeToTotalSeconds = ({ hours, minutes, seconds }) =>
  hours * 3600 + minutes * 60 + seconds

/**
 * 从总秒数解析时间部分（用于计时器模式）
 */
const parseTimerParts = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return {
    hours,
    minutes,
    seconds,
    hoursDigits: [hours],  // 计时器：单个数字
    minutesDigits: [Math.floor(minutes / 10), minutes % 10],
    secondsDigits: [Math.floor(seconds / 10), seconds % 10]
  }
}

/**
 * 从 { hours, minutes, seconds } 解析时间部分（用于时钟模式）
 */
const parseClockParts = ({ hours, minutes, seconds }) => {
  return {
    hours,
    minutes,
    seconds,
    hoursDigits: [Math.floor(hours / 10), hours % 10],  // 时钟：两位数字
    minutesDigits: [Math.floor(minutes / 10), minutes % 10],
    secondsDigits: [Math.floor(seconds / 10), seconds % 10]
  }
}

/**
 * 时间校准：依次尝试 WorldTimeAPI → TimeAPI.io → fallback(offset=0)
 */
const calibrateFromAPI = async () => {
  const apis = [
    {
      // WorldTimeAPI: 返回 ISO 8601 含时区偏移 → "2026-02-28T09:56:10.123456+08:00"
      // new Date() 可正确解析 +08:00 得到 UTC 毫秒时间戳
      url: 'https://worldtimeapi.org/api/timezone/Asia/Shanghai',
      parse: (data) => new Date(data.datetime).getTime()
    },
    {
      // TimeAPI.io: 返回 Asia/Shanghai 本地时间，无时区标记 → "2026-02-28T09:56:10"
      // 必须追加 +08:00（北京时间），NOT "Z"(UTC)！
      url: 'https://timeapi.io/api/time/current/zone?timeZone=Asia/Shanghai',
      parse: (data) => new Date(`${data.dateTime}+08:00`).getTime()
    }
  ]

  for (const api of apis) {
    try {
      const before = Date.now()
      const res = await fetch(api.url, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) continue
      const data = await res.json()
      const after = Date.now()
      const roundTrip = after - before
      const serverTime = api.parse(data)
      // 校准偏移量 = 服务器时间 - 本地时间（补偿网络延迟的一半）
      const offset = serverTime - before - Math.floor(roundTrip / 2)
      // 校准成功
      return offset
    } catch (e) {
      console.warn(`[Clock] 校准失败 via ${api.url}:`, e.message)
    }
  }

  console.warn('[Clock] 所有校准 API 不可用，使用本地时间')
  return 0
}


const useClockStore = create((set, get) => ({
  // ===== 模式切换 =====
  mode: 'clock',  // 'timer' | 'clock'  — 默认时钟模式

  toggleMode: () => {
    const { mode } = get()
    if (mode === 'timer') {
      // 切换到时钟模式：停止计时器，启动时钟
      get().pause()
      get().startClock()
      set({ mode: 'clock' })
    } else {
      // 切换到计时器模式：停止时钟
      get().stopClock()
      set({ mode: 'timer' })
    }
  },

  // ===== 时钟模式状态 =====
  clockTime: null,          // { hours, minutes, seconds }
  clockPrevTime: null,      // 上一帧的时间（驱动翻转动画）
  clockIntervalId: null,    // 时钟定时器 ID
  timeOffset: 0,            // 与标准时间的偏移量(ms)
  isCalibrated: false,      // 是否已校准

  startClock: () => {
    const { clockIntervalId, isCalibrated, timeOffset } = get()
    if (clockIntervalId) return  // 已在运行

    // 立即显示当前时间
    const initialTime = getBeijingTime(timeOffset)
    set({
      clockTime: initialTime,
      clockPrevTime: null,  // 首帧无 prev
    })

    // 启动每秒更新
    const id = setInterval(() => {
      const { timeOffset: offset, clockTime: prev } = get()
      const current = getBeijingTime(offset)
      set({
        clockPrevTime: prev,
        clockTime: current,
      })
    }, 1000)

    set({ clockIntervalId: id })

    // 异步校准（仅首次）
    if (!isCalibrated) {
      calibrateFromAPI().then(offset => {
        set({ timeOffset: offset, isCalibrated: true })
        // 校准后立即刷新显示
        const { clockTime: prevTime } = get()
        set({
          clockPrevTime: prevTime,
          clockTime: getBeijingTime(offset),
        })
      })
    }
  },

  stopClock: () => {
    const { clockIntervalId } = get()
    if (clockIntervalId) {
      clearInterval(clockIntervalId)
    }
    set({ clockIntervalId: null })
  },

  // ===== 计时器模式状态（原有逻辑） =====
  time: 0,           // 总秒数
  prevTime: 0,       // 上一次的总秒数（用于触发动画）
  isRunning: false,   // 是否正在计时
  intervalId: null,  // 定时器ID
  isMuted: false,    // 是否静音

  // ===== 统一接口：根据模式返回不同数据 =====
  getTimeParts: () => {
    const { mode, time, clockTime } = get()

    if (mode === 'clock' && clockTime) {
      return parseClockParts(clockTime)
    }

    return parseTimerParts(time)
  },

  getPrevTimeParts: () => {
    const { mode, prevTime, clockPrevTime } = get()

    if (mode === 'clock') {
      if (clockPrevTime) {
        return parseClockParts(clockPrevTime)
      }
      // 首帧没有 prev，返回与当前相同避免触发动画
      const { clockTime } = get()
      if (clockTime) return parseClockParts(clockTime)
      return parseClockParts({ hours: 0, minutes: 0, seconds: 0 })
    }

    return parseTimerParts(prevTime)
  },

  // 开始计时
  start: () => {
    const { isRunning, isSlowMotion } = get()
    if (isRunning) return

    const interval = isSlowMotion ? 8000 : 1000
    const id = setInterval(() => {
      set(state => ({
        prevTime: state.time,
        time: state.time + 1
      }))
    }, interval)

    set({ isRunning: true, intervalId: id })
  },

  // 暂停计时
  pause: () => {
    const { intervalId } = get()
    if (intervalId) {
      clearInterval(intervalId)
    }
    set({ isRunning: false, intervalId: null })
  },

  // 重置计时
  reset: () => {
    const { intervalId, time } = get()
    if (intervalId) {
      clearInterval(intervalId)
    }
    // 将 prevTime 设为重置前的时间，这样触发从实体数字翻转回 null 的动画关闭效果
    set({ time: 0, prevTime: time, isRunning: false, intervalId: null })
  },

  // 切换计时状态
  toggle: () => {
    const { isRunning } = get()
    if (isRunning) {
      get().pause()
    } else {
      get().start()
    }
  },

  // 切换静音状态
  toggleMute: () => {
    set(state => ({ isMuted: !state.isMuted }))
  },

  // 慢动作模式（1/8 速度，用于调试动画效果）
  isSlowMotion: false,
  toggleSlowMotion: () => {
    const { isRunning, isSlowMotion } = get()
    set({ isSlowMotion: !isSlowMotion })
    // 如果正在运行，重启定时器以应用新速度
    if (isRunning) {
      get().pause()
      // 使用 setTimeout 确保 pause 完成后再 start
      setTimeout(() => get().start(), 10)
    }
  }
}))

export default useClockStore