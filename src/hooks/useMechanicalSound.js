import { useCallback, useRef } from 'react'

import { getStoredSoundConfig } from './useSoundConfig'

/**
 * 机械翻页显示器声音合成 Hook
 * 
 * 提供三种声音：
 * - playFlipSound: 翻页钟大叶片翻转声（5层模型）
 * - playClickSound: 按钮点击声
 * - playSegmentFlipSound: 七段显示器单笔画翻转声（2层精简模型）
 */
const useMechanicalSound = () => {
  const audioContextRef = useRef(null)

  // 获取或创建 AudioContext（复用同一个实例，避免超限）
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return audioContextRef.current
  }, [])

  /**
   * 创建噪声缓冲区
   */
  const createNoiseBuffer = useCallback((audioContext, duration) => {
    const sampleCount = audioContext.sampleRate * duration
    const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5
    }

    return buffer
  }, [])

  /**
   * 播放机械翻页声（大叶片）
   */
  const playFlipSound = useCallback((volume = 0.4) => {
    try {
      const audioContext = getAudioContext()

      if (audioContext.state === 'suspended') {
        audioContext.resume()
      }

      const currentTime = audioContext.currentTime
      const randomFactor = 0.9 + Math.random() * 0.2
      const randomDetune = (Math.random() - 0.5) * 20

      // 1. 低频撞击声
      const thudOsc = audioContext.createOscillator()
      thudOsc.type = 'sine'
      thudOsc.frequency.setValueAtTime(120 * randomFactor, currentTime)
      thudOsc.frequency.exponentialRampToValueAtTime(40, currentTime + 0.08)
      thudOsc.detune.setValueAtTime(randomDetune, currentTime)

      const thudGain = audioContext.createGain()
      thudGain.gain.setValueAtTime(volume * 0.5, currentTime)
      thudGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.08)

      const thudFilter = audioContext.createBiquadFilter()
      thudFilter.type = 'lowpass'
      thudFilter.frequency.setValueAtTime(200, currentTime)
      thudFilter.Q.setValueAtTime(1, currentTime)

      thudOsc.connect(thudFilter)
      thudFilter.connect(thudGain)
      thudGain.connect(audioContext.destination)
      thudOsc.start(currentTime)
      thudOsc.stop(currentTime + 0.1)

      // 2. 中频咔嗒声
      const clickNoise = audioContext.createBufferSource()
      clickNoise.buffer = createNoiseBuffer(audioContext, 0.05)

      const clickFilter = audioContext.createBiquadFilter()
      clickFilter.type = 'bandpass'
      clickFilter.frequency.setValueAtTime(2500 * randomFactor, currentTime)
      clickFilter.Q.setValueAtTime(2, currentTime)

      const clickGain = audioContext.createGain()
      clickGain.gain.setValueAtTime(volume * 0.6, currentTime)
      clickGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.04)

      clickNoise.connect(clickFilter)
      clickFilter.connect(clickGain)
      clickGain.connect(audioContext.destination)
      clickNoise.start(currentTime)
      clickNoise.stop(currentTime + 0.05)

      // 3. 高频翻转声
      const flapNoise = audioContext.createBufferSource()
      flapNoise.buffer = createNoiseBuffer(audioContext, 0.08)

      const flapFilter = audioContext.createBiquadFilter()
      flapFilter.type = 'highpass'
      flapFilter.frequency.setValueAtTime(3000 * randomFactor, currentTime)

      const flapGain = audioContext.createGain()
      flapGain.gain.setValueAtTime(0, currentTime)
      flapGain.gain.linearRampToValueAtTime(volume * 0.3, currentTime + 0.02)
      flapGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.08)

      flapNoise.connect(flapFilter)
      flapFilter.connect(flapGain)
      flapGain.connect(audioContext.destination)
      flapNoise.start(currentTime + 0.01)
      flapNoise.stop(currentTime + 0.1)

      // 4. 金属脆响
      const metalOsc = audioContext.createOscillator()
      metalOsc.type = 'triangle'
      metalOsc.frequency.setValueAtTime(4000 * randomFactor, currentTime)
      metalOsc.frequency.exponentialRampToValueAtTime(1500, currentTime + 0.03)
      metalOsc.detune.setValueAtTime(randomDetune * 2, currentTime)

      const metalGain = audioContext.createGain()
      metalGain.gain.setValueAtTime(volume * 0.15, currentTime)
      metalGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.025)

      metalOsc.connect(metalGain)
      metalGain.connect(audioContext.destination)
      metalOsc.start(currentTime + 0.02)
      metalOsc.stop(currentTime + 0.05)

      // 5. 空腔共鸣
      const resonanceOsc = audioContext.createOscillator()
      resonanceOsc.type = 'sine'
      resonanceOsc.frequency.setValueAtTime(80 * randomFactor, currentTime)
      resonanceOsc.detune.setValueAtTime(randomDetune, currentTime)

      const resonanceGain = audioContext.createGain()
      resonanceGain.gain.setValueAtTime(volume * 0.2, currentTime)
      resonanceGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.15)

      const resonanceFilter = audioContext.createBiquadFilter()
      resonanceFilter.type = 'lowpass'
      resonanceFilter.frequency.setValueAtTime(150, currentTime)

      resonanceOsc.connect(resonanceFilter)
      resonanceFilter.connect(resonanceGain)
      resonanceGain.connect(audioContext.destination)
      resonanceOsc.start(currentTime)
      resonanceOsc.stop(currentTime + 0.2)

    } catch (error) {
      console.warn('播放声音失败:', error)
    }
  }, [getAudioContext, createNoiseBuffer])

  /**
   * 播放按钮点击声
   */
  const playClickSound = useCallback((volume = 0.25) => {
    try {
      const audioContext = getAudioContext()

      if (audioContext.state === 'suspended') {
        audioContext.resume()
      }

      const currentTime = audioContext.currentTime
      const randomFactor = 0.95 + Math.random() * 0.1

      const clickOsc = audioContext.createOscillator()
      clickOsc.type = 'square'
      clickOsc.frequency.setValueAtTime(800 * randomFactor, currentTime)
      clickOsc.frequency.exponentialRampToValueAtTime(200, currentTime + 0.03)

      const clickGain = audioContext.createGain()
      clickGain.gain.setValueAtTime(volume, currentTime)
      clickGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.04)

      const clickFilter = audioContext.createBiquadFilter()
      clickFilter.type = 'bandpass'
      clickFilter.frequency.setValueAtTime(1500, currentTime)
      clickFilter.Q.setValueAtTime(2, currentTime)

      clickOsc.connect(clickFilter)
      clickFilter.connect(clickGain)
      clickGain.connect(audioContext.destination)
      clickOsc.start(currentTime)
      clickOsc.stop(currentTime + 0.05)

      const noiseSource = audioContext.createBufferSource()
      noiseSource.buffer = createNoiseBuffer(audioContext, 0.02)

      const noiseGain = audioContext.createGain()
      noiseGain.gain.setValueAtTime(volume * 0.3, currentTime)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.02)

      noiseSource.connect(noiseGain)
      noiseGain.connect(audioContext.destination)
      noiseSource.start(currentTime)
      noiseSource.stop(currentTime + 0.03)

    } catch (error) {
      console.warn('播放声音失败:', error)
    }
  }, [getAudioContext, createNoiseBuffer])

  /**
   * 播放电磁机械式七段显示器单笔画翻转声
   * 
   * @param {AudioContext} audioContext - 外部传入的 AudioContext 实例
   * @param {Object} customConfig - 自定义音效配置（可选），若无则使用 localStorage 中的配置
   */
  const playSegmentFlipSound = useCallback((audioContext, customConfig = null) => {
    try {
      if (!audioContext) return

      const config = customConfig || getStoredSoundConfig()
      const volume = config.globalVolume || 0.5

      // 如果 AudioContext 被暂停（浏览器自动挂起策略），恢复它
      if (audioContext.state === 'suspended') {
        audioContext.resume()
      }

      const time = audioContext.currentTime

      // 整体持续时间：给足回声和余音空间
      const totalDuration = 1.0
      // 模拟巨大叶片的动作迟缓，撞击声将有微小延迟 (20ms-30ms)
      const impactDelay = 0.02 + Math.random() * 0.01

      // 随机微调参数，让每次声音略有不同，增加自然感
      const randomFactor = 0.95 + Math.random() * 0.1

      // ========================================
      // 层1: 卡扣释放声 (Trigger Click)
      // 极短促的金属释放声，作为整个翻转过程的前奏
      // ========================================
      const triggerDuration = config.triggerDuration
      const triggerBuffer = audioContext.createBuffer(1, audioContext.sampleRate * triggerDuration, audioContext.sampleRate)
      const triggerData = triggerBuffer.getChannelData(0)
      for (let i = 0; i < triggerData.length; i++) {
        triggerData[i] = (Math.random() * 2 - 1) * 0.5
      }

      const triggerSource = audioContext.createBufferSource()
      triggerSource.buffer = triggerBuffer

      const triggerFilter = audioContext.createBiquadFilter()
      triggerFilter.type = 'bandpass'
      triggerFilter.frequency.setValueAtTime(config.triggerFreq * randomFactor, time)
      triggerFilter.Q.setValueAtTime(1.2, time)

      const triggerGain = audioContext.createGain()
      triggerGain.gain.setValueAtTime(0, time)
      triggerGain.gain.linearRampToValueAtTime(volume * config.triggerVol, time + 0.005)
      triggerGain.gain.exponentialRampToValueAtTime(0.001, time + triggerDuration)

      triggerSource.connect(triggerFilter)
      triggerFilter.connect(triggerGain)
      triggerGain.connect(audioContext.destination)

      triggerSource.start(time)
      triggerSource.stop(time + triggerDuration)

      // ========================================
      // 层2: 沉重沉寂的物理落地 (Heavy Thud)
      // 50公斤质量感的来源，深沉强大的低频瞬态
      // ========================================
      const thudOsc = audioContext.createOscillator()
      thudOsc.type = 'sine'
      const impactTime = time + impactDelay
      thudOsc.frequency.setValueAtTime(config.thudStartFreq * randomFactor, impactTime)
      thudOsc.frequency.exponentialRampToValueAtTime(Math.max(1, config.thudEndFreq), impactTime + config.thudDuration)

      const thudGain = audioContext.createGain()
      thudGain.gain.setValueAtTime(0, impactTime)
      thudGain.gain.linearRampToValueAtTime(volume * config.thudVol, impactTime + 0.01)
      thudGain.gain.exponentialRampToValueAtTime(0.001, impactTime + config.thudDuration + 0.05)

      thudOsc.connect(thudGain)
      thudGain.connect(audioContext.destination)

      thudOsc.start(impactTime)
      thudOsc.stop(impactTime + config.thudDuration + 0.1)

      // ========================================
      // 层3: 厚重金属碰撞 (Thick Metal Clack)
      // 提供巨大的机械体积感和碰撞细节
      // ========================================
      const clackDuration = config.clackDuration
      const clackBuffer = audioContext.createBuffer(1, audioContext.sampleRate * clackDuration, audioContext.sampleRate)
      const clackData = clackBuffer.getChannelData(0)
      for (let i = 0; i < clackData.length; i++) {
        clackData[i] = (Math.random() * 2 - 1) * 0.8
      }

      const clackSource = audioContext.createBufferSource()
      clackSource.buffer = clackBuffer

      const clackFilter = audioContext.createBiquadFilter()
      clackFilter.type = 'bandpass'
      clackFilter.frequency.setValueAtTime(config.clackFilterFreq * randomFactor, impactTime)
      clackFilter.Q.setValueAtTime(1.5, impactTime)

      const clackGain = audioContext.createGain()
      clackGain.gain.setValueAtTime(0, impactTime)
      clackGain.gain.linearRampToValueAtTime(volume * config.clackVol, impactTime + 0.01)
      clackGain.gain.exponentialRampToValueAtTime(0.001, impactTime + clackDuration)

      clackSource.connect(clackFilter)
      clackFilter.connect(clackGain)
      clackGain.connect(audioContext.destination)

      clackSource.start(impactTime)
      clackSource.stop(impactTime + clackDuration)

      // ========================================
      // 层4: 机箱内部低频余震 (Casing Resonance)
      // 大型机械装置运作后的低音轰鸣扩散
      // ========================================
      const resOsc = audioContext.createOscillator()
      resOsc.type = 'triangle'
      resOsc.frequency.setValueAtTime(config.resStartFreq * randomFactor, impactTime)
      resOsc.frequency.exponentialRampToValueAtTime(Math.max(1, config.resEndFreq), impactTime + config.resDuration)

      const resFilter = audioContext.createBiquadFilter()
      resFilter.type = 'lowpass'
      resFilter.frequency.setValueAtTime(300, impactTime)

      const resGain = audioContext.createGain()
      resGain.gain.setValueAtTime(0, impactTime)
      resGain.gain.linearRampToValueAtTime(volume * config.resVol, impactTime + 0.05)
      resGain.gain.exponentialRampToValueAtTime(0.001, impactTime + config.resDuration + 0.05)

      resOsc.connect(resFilter)
      resFilter.connect(resGain)
      resGain.connect(audioContext.destination)

      resOsc.start(impactTime)
      resOsc.stop(impactTime + config.resDuration + 0.1)

      // ========================================
      // 层5: 金属质感 (Metallic Ping)
      // 高频三角波谐波 + 快速衰减，模拟金属撞击的"叮"声
      // ========================================
      const metalOsc = audioContext.createOscillator()
      metalOsc.type = 'triangle'
      metalOsc.frequency.setValueAtTime(config.metalFreq * randomFactor, impactTime)
      metalOsc.frequency.exponentialRampToValueAtTime(
        Math.max(1, config.metalEndFreq), impactTime + config.metalDuration
      )
      metalOsc.detune.setValueAtTime((Math.random() - 0.5) * config.metalDetune, impactTime)

      // 第二谐波叠加，增加金属的丰富度
      const metalOsc2 = audioContext.createOscillator()
      metalOsc2.type = 'square'
      metalOsc2.frequency.setValueAtTime(config.metalFreq * 1.5 * randomFactor, impactTime)
      metalOsc2.frequency.exponentialRampToValueAtTime(
        Math.max(1, config.metalEndFreq * 1.5), impactTime + config.metalDuration * 0.7
      )

      const metalGain = audioContext.createGain()
      metalGain.gain.setValueAtTime(0, impactTime)
      metalGain.gain.linearRampToValueAtTime(volume * config.metalVol, impactTime + 0.002)
      metalGain.gain.exponentialRampToValueAtTime(0.001, impactTime + config.metalDuration)

      const metalGain2 = audioContext.createGain()
      metalGain2.gain.setValueAtTime(0, impactTime)
      metalGain2.gain.linearRampToValueAtTime(volume * config.metalVol * 0.3, impactTime + 0.002)
      metalGain2.gain.exponentialRampToValueAtTime(0.001, impactTime + config.metalDuration * 0.7)

      metalOsc.connect(metalGain)
      metalOsc2.connect(metalGain2)
      metalGain.connect(audioContext.destination)
      metalGain2.connect(audioContext.destination)

      metalOsc.start(impactTime)
      metalOsc2.start(impactTime)
      metalOsc.stop(impactTime + config.metalDuration + 0.05)
      metalOsc2.stop(impactTime + config.metalDuration + 0.05)

      // ========================================
      // 层6: 空洞现场回声 (Hall Echo)
      // 用多段延迟+衰减模拟大型空间的混响尾音
      // ========================================
      const echoNodes = []
      const iterations = Math.min(Math.max(1, Math.round(config.echoIterations)), 8)

      // 创建回声源：基于撞击噪声的滤波副本
      const echoDuration = 0.04
      const echoBuffer = audioContext.createBuffer(1, audioContext.sampleRate * echoDuration, audioContext.sampleRate)
      const echoData = echoBuffer.getChannelData(0)
      for (let i = 0; i < echoData.length; i++) {
        echoData[i] = (Math.random() * 2 - 1) * 0.6
      }

      for (let i = 0; i < iterations; i++) {
        const echoSource = audioContext.createBufferSource()
        echoSource.buffer = echoBuffer

        const echoFilter = audioContext.createBiquadFilter()
        echoFilter.type = 'lowpass'
        // 每次回声高频逐渐衰减，模拟空气吸收
        echoFilter.frequency.setValueAtTime(
          config.echoFilterFreq * Math.pow(0.7, i), impactTime
        )

        const echoGain = audioContext.createGain()
        const echoStartTime = impactTime + config.echoDelay * (i + 1)
        const decayFactor = Math.pow(config.echoDecay, i + 1)
        echoGain.gain.setValueAtTime(0, echoStartTime)
        echoGain.gain.linearRampToValueAtTime(
          volume * config.echoVol * decayFactor, echoStartTime + 0.005
        )
        echoGain.gain.exponentialRampToValueAtTime(0.001, echoStartTime + echoDuration)

        echoSource.connect(echoFilter)
        echoFilter.connect(echoGain)
        echoGain.connect(audioContext.destination)

        echoSource.start(echoStartTime)
        echoSource.stop(echoStartTime + echoDuration)

        echoNodes.push(echoSource, echoFilter, echoGain)
      }

      // ========================================
      // 资源清理
      // ========================================
      setTimeout(() => {
        triggerSource.disconnect()
        triggerFilter.disconnect()
        triggerGain.disconnect()

        thudOsc.disconnect()
        thudGain.disconnect()

        clackSource.disconnect()
        clackFilter.disconnect()
        clackGain.disconnect()

        resOsc.disconnect()
        resFilter.disconnect()
        resGain.disconnect()

        metalOsc.disconnect()
        metalOsc2.disconnect()
        metalGain.disconnect()
        metalGain2.disconnect()

        echoNodes.forEach(node => node.disconnect())
      }, totalDuration * 1000 + 100)

    } catch (error) {
      console.warn('播放七段显示器笔画翻转声失败:', error)
    }
  }, [])

  return {
    getAudioContext,
    playFlipSound,
    playClickSound,
    playSegmentFlipSound
  }
}

export default useMechanicalSound
