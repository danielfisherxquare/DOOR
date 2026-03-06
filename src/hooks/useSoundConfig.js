import { useState, useEffect } from 'react'

const STORAGE_KEY = 'mechanical_clock_sound_config'

export const DEFAULT_CONFIG = {
    // 层1: 卡扣释放 (Trigger Click)
    triggerFreq: 1250,
    triggerVol: 1,
    triggerDuration: 0.1,

    // 层2: 沉重沉寂的物理落地 (Heavy Thud)
    thudStartFreq: 30,
    thudEndFreq: 5,
    thudVol: 0.1,
    thudDuration: 0.05,

    // 层3: 厚重金属碰撞 (Thick Metal Clack)
    clackFilterFreq: 1350,
    clackVol: 1.6,
    clackDuration: 0.3,

    // 层4: 机箱内部低频余震 (Casing Resonance)
    resStartFreq: 30,
    resEndFreq: 10,
    resVol: 0,
    resDuration: 0.05,

    // 层5: 金属质感 (Metallic Ping)
    metalFreq: 4000,
    metalEndFreq: 5000,
    metalVol: 0.1,
    metalDuration: 0.05,
    metalDetune: 50,

    // 层6: 空洞现场回声 (Hall Echo)
    echoDelay: 0.05,
    echoDecay: 0.15,
    echoIterations: 1,
    echoVol: 0.1,
    echoFilterFreq: 1100,

    // 全局设定
    globalVolume: 1.5,
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
