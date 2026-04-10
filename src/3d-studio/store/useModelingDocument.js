import { create } from 'zustand'
import {
  addOpeningToDocument,
  createLoftSurfaceInDocument,
  createSweepSurfaceInDocument,
  createEditorDocumentFromWarehouseScene,
  createHistoryEntry,
  deleteSelectionFromDocument,
  extrudeProfileInDocument,
  insertRectangleProfile,
  insertArcSegment,
  insertBezierSegment,
  insertCircleProfile,
  insertSketchSegment3D,
  insertSketchPath,
  moveSelectionInDocument,
  normalizeEditorDocument,
  removeOpeningFromDocument,
  rotateSolidInDocument,
  updateCurveControlsInDocument,
  updateOpeningInDocument,
} from '../model/editorDocument'

const EMPTY_DOCUMENT = normalizeEditorDocument(null)
const MAX_HISTORY_ENTRIES = 20

const cloneDocument = (doc) => {
  if (typeof structuredClone === 'function') return structuredClone(doc)
  return JSON.parse(JSON.stringify(doc))
}

const useModelingDocument = create((set, get) => ({
  document: EMPTY_DOCUMENT,
  historyPast: [],
  historyFuture: [],

  loadFromScene: (scene) => {
    const document = createEditorDocumentFromWarehouseScene(scene)
    set({
      document,
      historyPast: [],
      historyFuture: [],
    })
  },

  replaceDocument: (document, { recordHistory = true, historyLabel = '编辑' } = {}) => {
    const normalized = normalizeEditorDocument(document)
    set((state) => ({
      document: normalized,
      historyPast: recordHistory
        ? [...state.historyPast, { label: historyLabel, document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES)
        : state.historyPast,
      historyFuture: recordHistory ? [] : state.historyFuture,
    }))
  },

  commitDocument: (document, previousDocument, historyLabel = '编辑') => {
    const normalized = normalizeEditorDocument(document)
    set((state) => ({
      document: normalized,
      historyPast: [...state.historyPast, { label: historyLabel, document: previousDocument ? cloneDocument(previousDocument) : cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    }))
  },

  appendHistoryLabel: (label, metadata = {}) => set((state) => ({
    document: {
      ...state.document,
      history: [...state.document.history, createHistoryEntry(label, metadata)].slice(-40),
    },
  })),

  insertSketchPath: (points, options = {}) => {
    const state = get()
    const result = insertSketchPath(state.document, points, options)
    if (result.error) return result
    set({
      document: {
        ...result.document,
        history: [...result.document.history, createHistoryEntry(options.historyLabel || '草图绘制')].slice(-40),
      },
      historyPast: [...state.historyPast, { label: options.historyLabel || '草图绘制', document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return result
  },

  insertRectangleProfile: (start, end, options = {}) => {
    const state = get()
    const result = insertRectangleProfile(state.document, start, end, options)
    if (result.error) return result
    set({
      document: {
        ...result.document,
        history: [...result.document.history, createHistoryEntry(options.historyLabel || '矩形轮廓')].slice(-40),
      },
      historyPast: [...state.historyPast, { label: options.historyLabel || '矩形轮廓', document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return result
  },

  insertSketchSegment3D: (start, end, options = {}) => {
    const state = get()
    const result = insertSketchSegment3D(state.document, start, end, options)
    if (result.error) return result
    set({
      document: {
        ...result.document,
        history: [...result.document.history, createHistoryEntry(options.historyLabel || '草图线段')].slice(-40),
      },
      historyPast: [...state.historyPast, { label: options.historyLabel || '草图线段', document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return result
  },

  insertArcSegment: (start, mid, end, options = {}) => {
    const state = get()
    const result = insertArcSegment(state.document, start, mid, end, options)
    if (result.error) return result
    set({
      document: {
        ...result.document,
        history: [...result.document.history, createHistoryEntry(options.historyLabel || '圆弧')].slice(-40),
      },
      historyPast: [...state.historyPast, { label: options.historyLabel || '圆弧', document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return result
  },

  insertBezierSegment: (start, control1, control2, end, options = {}) => {
    const state = get()
    const result = insertBezierSegment(state.document, start, control1, control2, end, options)
    if (result.error) return result
    set({
      document: {
        ...result.document,
        history: [...result.document.history, createHistoryEntry(options.historyLabel || '贝塞尔曲线')].slice(-40),
      },
      historyPast: [...state.historyPast, { label: options.historyLabel || '贝塞尔曲线', document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return result
  },

  insertCircleProfile: (center, radiusPoint, options = {}) => {
    const state = get()
    const result = insertCircleProfile(state.document, center, radiusPoint, options)
    if (result.error) return result
    set({
      document: {
        ...result.document,
        history: [...result.document.history, createHistoryEntry(options.historyLabel || '圆形轮廓')].slice(-40),
      },
      historyPast: [...state.historyPast, { label: options.historyLabel || '圆形轮廓', document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return result
  },

  updateCurveControls: (segmentId, patch, options = {}) => {
    const state = get()
    const result = updateCurveControlsInDocument(state.document, segmentId, patch)
    if (result.error) return result
    set({
      document: {
        ...result.document,
        history: [...result.document.history, createHistoryEntry(options.historyLabel || '调整曲线')].slice(-40),
      },
      historyPast: [...state.historyPast, { label: options.historyLabel || '调整曲线', document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return result
  },

  extrudeProfile: (profileId, height, options = {}) => {
    const state = get()
    const document = extrudeProfileInDocument(state.document, profileId, height, options)
    set({
      document: {
        ...document,
        history: [...document.history, createHistoryEntry(options.historyLabel || 'Push/Pull')].slice(-40),
      },
      historyPast: [...state.historyPast, { label: options.historyLabel || 'Push/Pull', document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return document
  },

  createSweepSurface: (profileId, pathSegmentIds, options = {}) => {
    const state = get()
    const result = createSweepSurfaceInDocument(state.document, profileId, pathSegmentIds, options)
    if (result.error) return result
    set({
      document: {
        ...result.document,
        history: [...result.document.history, createHistoryEntry(options.historyLabel || '扫掠曲面')].slice(-40),
      },
      historyPast: [...state.historyPast, { label: options.historyLabel || '扫掠曲面', document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return result
  },

  createLoftSurface: (profileIds, options = {}) => {
    const state = get()
    const result = createLoftSurfaceInDocument(state.document, profileIds, options)
    if (result.error) return result
    set({
      document: {
        ...result.document,
        history: [...result.document.history, createHistoryEntry(options.historyLabel || '放样曲面')].slice(-40),
      },
      historyPast: [...state.historyPast, { label: options.historyLabel || '放样曲面', document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return result
  },

  moveSelection: (selection, delta, historyLabel = '移动') => {
    const state = get()
    const document = moveSelectionInDocument(state.document, selection, delta)
    set({
      document: {
        ...document,
        history: [...document.history, createHistoryEntry(historyLabel)].slice(-40),
      },
      historyPast: [...state.historyPast, { label: historyLabel, document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return document
  },

  rotateSolid: (solidId, angleDelta, historyLabel = '旋转') => {
    const state = get()
    const document = rotateSolidInDocument(state.document, solidId, angleDelta)
    set({
      document: {
        ...document,
        history: [...document.history, createHistoryEntry(historyLabel)].slice(-40),
      },
      historyPast: [...state.historyPast, { label: historyLabel, document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return document
  },

  addOpening: (solidId, options = {}) => {
    const state = get()
    const result = addOpeningToDocument(state.document, solidId, options)
    if (result.error) return result
    set({
      document: {
        ...result.document,
        history: [...result.document.history, createHistoryEntry(options.historyLabel || '新增开洞')].slice(-40),
      },
      historyPast: [...state.historyPast, { label: options.historyLabel || '新增开洞', document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return result
  },

  removeOpening: (openingId, historyLabel = '删除开洞') => {
    const state = get()
    const document = removeOpeningFromDocument(state.document, openingId)
    set({
      document: {
        ...document,
        history: [...document.history, createHistoryEntry(historyLabel)].slice(-40),
      },
      historyPast: [...state.historyPast, { label: historyLabel, document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return document
  },

  updateOpening: (openingId, options = {}) => {
    const state = get()
    const result = updateOpeningInDocument(state.document, openingId, options)
    if (result.error) return result
    set({
      document: {
        ...result.document,
        history: [...result.document.history, createHistoryEntry(options.historyLabel || '调整开洞')].slice(-40),
      },
      historyPast: [...state.historyPast, { label: options.historyLabel || '调整开洞', document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return result
  },

  deleteSelection: (selection, historyLabel = '删除选择') => {
    const state = get()
    const result = deleteSelectionFromDocument(state.document, selection)
    if (!result.deletedCount) return result
    set({
      document: {
        ...result.document,
        history: [...result.document.history, createHistoryEntry(historyLabel)].slice(-40),
      },
      historyPast: [...state.historyPast, { label: historyLabel, document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: [],
    })
    return result
  },

  undo: () => {
    const state = get()
    const previous = state.historyPast[state.historyPast.length - 1]
    if (!previous) return false
    set({
      document: cloneDocument(previous.document),
      historyPast: state.historyPast.slice(0, -1),
      historyFuture: [{ label: previous.label, document: cloneDocument(state.document) }, ...state.historyFuture].slice(0, MAX_HISTORY_ENTRIES),
    })
    return true
  },

  redo: () => {
    const state = get()
    const next = state.historyFuture[0]
    if (!next) return false
    set({
      document: next.document,
      historyPast: [...state.historyPast, { label: next.label, document: cloneDocument(state.document) }].slice(-MAX_HISTORY_ENTRIES),
      historyFuture: state.historyFuture.slice(1),
    })
    return true
  },
}))

export default useModelingDocument
