import { create } from 'zustand'
import { applyMappings } from '../utils/excelProcessor'

const STANDARD_FIELDS = [
  { id: 'event', name: '比赛项目', required: false },
  { id: 'source', name: '报名来源', required: false },
  { id: 'orderGroupId', name: '订单组编号', required: false },
  { id: 'paymentStatus', name: '支付状态', required: false },
  { id: 'name', name: '姓名', required: true },
  { id: 'namePinyin', name: '姓名全拼', required: false },
  { id: 'phone', name: '手机号码', required: false },
  { id: 'country', name: '国家/地区', required: false },
  { id: 'idType', name: '证件类型', required: false },
  { id: 'idNumber', name: '证件号码', required: false },
  { id: 'gender', name: '性别', required: false },
  { id: 'age', name: '年龄', required: false },
  { id: 'birthday', name: '出生日期', required: false },
  { id: 'bloodType', name: '血型', required: false },
  { id: 'clothingSize', name: '衣服尺码', required: false },
  { id: 'email', name: '电子邮箱', required: false },
  { id: 'address', name: '居住地详细地址', required: false },
  { id: 'emergencyName', name: '紧急联系人姓名', required: false },
  { id: 'emergencyPhone', name: '紧急联系人电话', required: false },
  { id: 'province', name: '居住地（省）', required: false },
  { id: 'city', name: '居住地（市）', required: false },
  { id: 'district', name: '居住地（区）', required: false },
]

const useImportStore = create((set, get) => ({
  standardFields: STANDARD_FIELDS,
  uploadedFiles: [],
  currentStep: 'upload',
  importSessionId: null,
  importSessionRowCount: 0,
  isImporting: false,
  importError: null,

  addFile: (file) => set(state => ({
    uploadedFiles: [...state.uploadedFiles, file]
  })),

  removeFile: (fileId) => set(state => ({
    uploadedFiles: state.uploadedFiles.filter(f => f.id !== fileId)
  })),

  clearFiles: () => set({
    uploadedFiles: [],
    currentStep: 'upload',
    importSessionId: null,
    importSessionRowCount: 0,
    isImporting: false,
    importError: null,
  }),

  updateFileMappings: (fileId, mappings) => set(state => ({
    uploadedFiles: state.uploadedFiles.map(f =>
      f.id === fileId ? { ...f, mappings } : f
    )
  })),

  setStep: (step) => set({ currentStep: step }),

  setImportSession: (sessionId, rowCount) => set({
    importSessionId: sessionId,
    importSessionRowCount: rowCount
  }),

  setImporting: (isImporting) => set({ isImporting }),

  setImportError: (error) => set({ importError: error }),

  addStandardField: (field) => set(state => ({
    standardFields: [...state.standardFields, field]
  })),

  removeStandardField: (fieldId) => set(state => ({
    standardFields: state.standardFields.filter(f => f.id !== fieldId)
  })),

  getMergedData: () => {
    const { uploadedFiles, standardFields } = get()
    const allData = []
    for (const file of uploadedFiles) {
      const merged = applyMappings(
        file.fullData,
        file.mappings,
        file.originalFileName,
        standardFields,
        file.extractedSource,
        file.extractedEvent,
        file.eventPriority
      )
      allData.push(...merged)
    }
    return allData
  },
}))

export default useImportStore
