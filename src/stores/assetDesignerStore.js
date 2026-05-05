import { create } from 'zustand'

function cloneScene(value) {
    if (value === null || value === undefined) return value
    if (typeof structuredClone === 'function') return structuredClone(value)
    return JSON.parse(JSON.stringify(value))
}

function sameScene(left, right) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

const initialSelection = { type: 'warehouse', id: null }

const initialWallDrawState = {
    isDrawing: false,
    startPoint: null,      // { x, z } 场景坐标
    currentPoint: null,    // { x, z } 当前鼠标位置
    chainMode: true,       // 链式绘制模式
}

// 默认楼层
const DEFAULT_LEVEL = {
    id: 'L001',
    name: '一层',
    elevation: 0,
    height: 4.5,
    isDefault: true,
}

const useAssetDesignerStore = create((set, get) => ({
    mode: 'select',
    sceneType: 'warehouse', // 'warehouse' | 'outdoor-event'
    paintMode: null, // null | 'zoneColor' | 'floorMaterial' | 'rackFinish'
    activeMaterialId: null,
    placeMode: null, // null | 'rack' | 'prefab'
    activeTemplateId: null,
    activePrefabId: null,
    selection: initialSelection,
    persistedScene: null,
    draftScene: null,
    dirty: false,
    showAdvancedJson: false,
    sidebarTab: 'structure', // 'structure' | 'furnish' | 'zones'
    inspectorOpen: false,
    catalogOpen: false,
    theme: 'dark', // 'dark' | 'light'
    history: [],
    future: [],

    // 墙面绘制状态
    wallDrawState: initialWallDrawState,

    // 门窗放置状态
    openingMode: null, // null | 'door' | 'window'
    activeOpeningPreset: null,

    // 结构元素放置状态
    structureMode: null, // null | 'column' | 'beam' | 'stair' | 'ramp'
    activeStructurePreset: null,

    // 楼层状态
    levels: [DEFAULT_LEVEL],
    activeLevelId: 'L001',
    viewMode: 'single', // 'single' | 'all' | 'slice'

    // 测量状态
    measurements: [],
    measurementMode: null, // null | 'distance' | 'area' | 'angle'

    // 导出/分享状态
    exportPanelOpen: false,
    shareDialogOpen: false,

    hydrateScene: (scene, nextSelection = null) => {
        const snapshot = cloneScene(scene)
        set({
            persistedScene: snapshot,
            draftScene: cloneScene(snapshot),
            dirty: false,
            history: [],
            future: [],
            selection: nextSelection || { type: 'warehouse', id: scene?.warehouse?.id ?? null },
            // 初始化楼层
            levels: snapshot?.levels || [DEFAULT_LEVEL],
            activeLevelId: snapshot?.activeLevelId || 'L001',
            viewMode: snapshot?.viewMode || 'single',
        })
    },

    stageScene: (updater) => {
        const current = get().draftScene
        if (!current) return

        const base = cloneScene(current)
        const next = typeof updater === 'function' ? updater(base) : cloneScene(updater)
        if (!next || sameScene(current, next)) return

        const persistedScene = get().persistedScene
        set((state) => ({
            draftScene: cloneScene(next),
            history: [...state.history, cloneScene(current)].slice(-30),
            future: [],
            dirty: !sameScene(persistedScene, next),
        }))
    },

    markSaved: (scene) => {
        const nextScene = cloneScene(scene ?? get().draftScene)
        set({
            persistedScene: nextScene,
            draftScene: cloneScene(nextScene),
            dirty: false,
            history: [],
            future: [],
        })
    },

    setMode: (mode) => set({
        mode,
        paintMode: mode === 'paint' ? get().paintMode || 'zoneColor' : null,
        placeMode: mode === 'place' ? get().placeMode : null,
    }),
    setPaintMode: (paintMode) => set({ paintMode, mode: 'paint' }),
    setActiveMaterial: (materialId) => set({ activeMaterialId: materialId }),
    setPlaceMode: (templateId) => set({ mode: 'place', placeMode: 'rack', activeTemplateId: templateId }),
    setPrefabPlaceMode: (prefabId) => set({ mode: 'place', placeMode: 'prefab', activePrefabId: prefabId }),
    setSceneType: (sceneType) => set({ sceneType }),
    selectEntity: (type, id = null) => set({ selection: { type, id }, inspectorOpen: !!id }),
    toggleAdvancedJson: () => set((state) => ({ showAdvancedJson: !state.showAdvancedJson })),
    setSidebarTab: (tab) => set({ sidebarTab: tab }),
    toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
    toggleCatalog: () => set((state) => ({ catalogOpen: !state.catalogOpen })),
    toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

    // 墙面绘制 actions
    startWallDraw: (point) => set({
        wallDrawState: {
            isDrawing: true,
            startPoint: point,
            currentPoint: point,
            chainMode: true,
        }
    }),
    updateWallPreview: (point) => set((state) => ({
        wallDrawState: {
            ...state.wallDrawState,
            currentPoint: point,
        }
    })),
    commitWallDraw: () => set({
        wallDrawState: {
            isDrawing: true,
            startPoint: null,
            currentPoint: null,
            chainMode: true,
        }
    }),
    cancelWallDraw: () => set({
        wallDrawState: initialWallDrawState
    }),
    setWallChainMode: (chainMode) => set((state) => ({
        wallDrawState: { ...state.wallDrawState, chainMode }
    })),

    // 门窗放置 actions
    setOpeningMode: (mode) => set({ openingMode: mode }),
    setActiveOpeningPreset: (preset) => set({ activeOpeningPreset: preset }),
    setDoorMode: (preset = null) => set({ mode: 'door', openingMode: 'door', activeOpeningPreset: preset }),
    setWindowMode: (preset = null) => set({ mode: 'window', openingMode: 'window', activeOpeningPreset: preset }),

    // 结构元素放置 actions
    setStructureMode: (mode) => set({ structureMode: mode }),
    setActiveStructurePreset: (preset) => set({ activeStructurePreset: preset }),
    setColumnMode: (preset = null) => set({ mode: 'column', structureMode: 'column', activeStructurePreset: preset }),
    setBeamMode: (preset = null) => set({ mode: 'beam', structureMode: 'beam', activeStructurePreset: preset }),
    setStairMode: (preset = null) => set({ mode: 'stair', structureMode: 'stair', activeStructurePreset: preset }),
    setRampMode: (preset = null) => set({ mode: 'ramp', structureMode: 'ramp', activeStructurePreset: preset }),

    // 楼层管理 actions
    setActiveLevel: (levelId) => set({ activeLevelId: levelId }),
    setViewMode: (mode) => set({ viewMode: mode }),

    addLevel: (level = {}) => set((state) => {
        const maxId = state.levels.reduce((max, l) => {
            const num = parseInt(String(l.id).replace(/\D/g, ''), 10)
            return !isNaN(num) && num > max ? num : max
        }, 0)
        const lastLevel = state.levels[state.levels.length - 1]
        const newElevation = lastLevel ? lastLevel.elevation + lastLevel.height : 0
        const newLevel = {
            id: `L${String(maxId + 1).padStart(3, '0')}`,
            name: `${state.levels.length + 1}层`,
            elevation: newElevation,
            height: 4.0,
            isDefault: false,
            ...level,
        }
        return { levels: [...state.levels, newLevel] }
    }),

    updateLevel: (levelId, updates) => set((state) => ({
        levels: state.levels.map(l =>
            l.id === levelId ? { ...l, ...updates } : l
        ),
    })),

    deleteLevel: (levelId) => set((state) => {
        if (state.levels.length <= 1) return state // 至少保留一个楼层
        const newLevels = state.levels.filter(l => l.id !== levelId)
        const newActiveId = state.activeLevelId === levelId
            ? newLevels[0]?.id
            : state.activeLevelId
        return {
            levels: newLevels,
            activeLevelId: newActiveId,
        }
    }),

    // 测量 actions
    setMeasurementMode: (mode) => set({ measurementMode: mode }),
    setMeasureMode: (mode = 'distance') => set({ mode: 'measure', measurementMode: mode }),

    addMeasurement: (measurement) => set((state) => ({
        measurements: [...state.measurements, {
            id: `M${Date.now()}`,
            ...measurement,
            levelId: state.activeLevelId,
            visible: true,
        }]
    })),

    removeMeasurement: (id) => set((state) => ({
        measurements: state.measurements.filter(m => m.id !== id)
    })),

    clearMeasurements: () => set({ measurements: [] }),

    // 导出/分享 actions
    toggleExportPanel: () => set((state) => ({ exportPanelOpen: !state.exportPanelOpen })),
    toggleShareDialog: () => set((state) => ({ shareDialogOpen: !state.shareDialogOpen })),
    openExportPanel: () => set({ exportPanelOpen: true }),
    closeExportPanel: () => set({ exportPanelOpen: false }),
    openShareDialog: () => set({ shareDialogOpen: true }),
    closeShareDialog: () => set({ shareDialogOpen: false }),

    undo: () => {
        const { history, future, draftScene, persistedScene } = get()
        if (!history.length) return
        const previous = history[history.length - 1]
        set({
            draftScene: cloneScene(previous),
            history: history.slice(0, -1),
            future: [cloneScene(draftScene), ...future].slice(0, 30),
            dirty: !sameScene(persistedScene, previous),
        })
    },

    redo: () => {
        const { history, future, draftScene, persistedScene } = get()
        if (!future.length) return
        const next = future[0]
        set({
            draftScene: cloneScene(next),
            history: [...history, cloneScene(draftScene)].slice(-30),
            future: future.slice(1),
            dirty: !sameScene(persistedScene, next),
        })
    },

    resetDesigner: () => set({
        mode: 'select',
        sceneType: 'warehouse',
        paintMode: null,
        activeMaterialId: null,
        placeMode: null,
        activeTemplateId: null,
        activePrefabId: null,
        selection: initialSelection,
        persistedScene: null,
        draftScene: null,
        dirty: false,
        showAdvancedJson: false,
        sidebarTab: 'structure',
        inspectorOpen: false,
        catalogOpen: false,
        history: [],
        future: [],
        wallDrawState: initialWallDrawState,
        openingMode: null,
        activeOpeningPreset: null,
        structureMode: null,
        activeStructurePreset: null,
        levels: [DEFAULT_LEVEL],
        activeLevelId: 'L001',
        viewMode: 'single',
        measurements: [],
        measurementMode: null,
        exportPanelOpen: false,
        shareDialogOpen: false,
    }),
}))

export default useAssetDesignerStore
