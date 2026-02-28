import { useState, useEffect } from 'react'

const STORAGE_KEY = 'mechanical_clock_sound_config'

export const DEFAULT_CONFIG = {
    // 层1: 卡扣释放 (Trigger Click)
    triggerFreq: 1500,
    triggerVol: 0.3,
    triggerDuration: 0.015,

    // 层2: 沉重沉寂的物理落地 (Heavy Thud)
    thudStartFreq: 80,
    thudEndFreq: 20,
    thudVol: 1.5,
    thudDuration: 0.1,

    // 层3: 厚重金属碰撞 (Thick Metal Clack)
    clackFilterFreq: 400,
    clackVol: 0.8,
    clackDuration: 0.06,

    // 层4: 机箱内部低频余震 (Casing Resonance)
    resStartFreq: 150,
    resEndFreq: 80,
    resVol: 0.4,
    resDuration: 0.2,

    // 层5: 金属质感 (Metallic Ping)
    metalFreq: 4000,
    metalEndFreq: 1500,
    metalVol: 0.15,
    metalDuration: 0.04,
    metalDetune: 30,

    // 层6: 空洞现场回声 (Hall Echo)
    echoDelay: 0.08,
    echoDecay: 0.4,
    echoIterations: 4,
    echoVol: 0.25,
    echoFilterFreq: 2000,

    // 全局设定
    globalVolume: 0.5,
}

// 获取合并后的声音配置，保证有新增字段时不会崩溃
export const getStoredSoundConfig = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
            return { ...DEFAULT_CONFIG, ...JSON.parse(stored) }
        }
    } catch (e) {
        console.error('Failed to load sound config from localStorage', e)
    }
    return { ...DEFAULT_CONFIG }
}

export const useSoundConfig = () => {
    const [config, setConfig] = useState(getStoredSoundConfig)

    // 当配置改变时触发持久化保存
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
        } catch (e) {
            console.error('Failed to save sound config to localStorage', e)
        }
    }, [config])

    const updateConfig = (key, value) => {
        setConfig(prev => ({
            ...prev,
            [key]: value
        }))
    }

    const resetConfig = () => {
        setConfig({ ...DEFAULT_CONFIG })
    }

    const importConfig = (newConfig) => {
        // 与默认值合并，确保向前兼容
        setConfig({ ...DEFAULT_CONFIG, ...newConfig })
    }

    return {
        config,
        updateConfig,
        resetConfig,
        importConfig
    }
}
