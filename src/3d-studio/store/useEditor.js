import { create } from 'zustand'

export const TOOL_TYPES = {
  SELECT: 'select',
  SKETCH: 'sketch',
  PUSHPULL: 'pushpull',
  MOVE: 'move',
  ROTATE: 'rotate',
  MEASURE: 'measure',
}

const initialState = {
  activeTool: TOOL_TYPES.SELECT,
  sketchMode: 'line',
  inspectorOpen: true,
  sceneTreeOpen: false,
  projectName: '未命名项目',
  dirty: false,
  sceneType: 'warehouse',
  viewportView: 'iso',
  inferenceHint: null,
  selectionMode: 'object',
  selectedGeometry: null,
  geometrySelectionVersion: 0,
  measurements: [],
  openingPlacement: null,
  pushPullPreview: null,
}

const useEditor = create((set, get) => ({
  ...initialState,

  setTool: (activeTool) => {
    set((state) => ({
      activeTool,
      selectedGeometry: activeTool === TOOL_TYPES.MEASURE ? state.selectedGeometry : state.selectedGeometry,
    }))
  },

  setSketchMode: (sketchMode) => set({ sketchMode }),
  toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
  toggleSceneTree: () => set((state) => ({ sceneTreeOpen: !state.sceneTreeOpen })),
  setProjectName: (projectName) => set({ projectName }),
  setDirty: (dirty) => set({ dirty }),
  setSceneType: (sceneType) => set({ sceneType }),
  setViewportView: (viewportView) => set({ viewportView }),
  setInferenceHint: (inferenceHint) => set({ inferenceHint }),
  clearInferenceHint: () => set({ inferenceHint: null }),
  setSelectionMode: (selectionMode) => set({ selectionMode }),
  setSelectedGeometry: (selectedGeometry) => set({ selectedGeometry }),
  clearSelectedGeometry: () => set({ selectedGeometry: null }),
  markGeometrySelectionHandled: () => set((state) => ({ geometrySelectionVersion: state.geometrySelectionVersion + 1 })),
  startOpeningPlacement: (placement) => set({
    openingPlacement: placement
      ? {
          preview: null,
          ...placement,
        }
      : null,
  }),
  updateOpeningPlacement: (patch) => set((state) => ({
    openingPlacement: state.openingPlacement ? { ...state.openingPlacement, ...patch } : state.openingPlacement,
  })),
  clearOpeningPlacement: () => set({ openingPlacement: null }),

  addMeasurement: (measurement) => set((state) => ({
    measurements: [
      ...state.measurements,
      {
        id: measurement.id || `measure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        visible: measurement.visible !== false,
        ...measurement,
      },
    ],
  })),
  clearMeasurements: () => set({ measurements: [] }),
  removeMeasurement: (id) => set((state) => ({
    measurements: state.measurements.filter((item) => item.id !== id),
  })),

  setPushPullPreview: (pushPullPreview) => set({ pushPullPreview }),

  reset: () => {
    const currentProjectName = get().projectName
    const currentSceneType = get().sceneType
    set({
      ...initialState,
      projectName: currentProjectName || initialState.projectName,
      sceneType: currentSceneType || initialState.sceneType,
    })
  },
}))

export default useEditor
