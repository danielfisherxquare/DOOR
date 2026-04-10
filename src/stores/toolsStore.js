import { create } from 'zustand'

const mockTools = [
  {
    id: 'mechanical-clock-3d',
    name: '3D 机械计时钟',
    description: '真正的3D段式翻转时钟，每个笔画都是立体六面体，翻转时可见金属侧面',
    icon: '🕰️',
    status: 'online',
    path: '/tool/mechanical-clock-3d',
    apiEndpoint: '/tools/mechanical-clock-3d',
    component: 'MechanicalClock3D',
    public: true,
  },
]

const useToolsStore = create((set) => ({
  tools: [],
  currentTool: null,
  isLoading: false,
  error: null,

  fetchTools: async () => {
    set({ isLoading: true, error: null })

    try {
      set({ tools: mockTools, isLoading: false })
    } catch (error) {
      set({ error: error.message, isLoading: false })
    }
  },

  fetchToolById: async (id) => {
    set({ isLoading: true, error: null })

    try {
      const tool = mockTools.find((item) => item.id === id)
      set({ currentTool: tool, isLoading: false })
      return tool
    } catch (error) {
      set({ error: error.message, isLoading: false })
      return null
    }
  },

  invokeTool: async () => {
    set({ isLoading: true, error: null })

    try {
      set({ isLoading: false })
      return { success: true, data: { result: '操作成功' } }
    } catch (error) {
      set({ error: error.message, isLoading: false })
      return { success: false, error: error.message }
    }
  },

  clearCurrentTool: () => {
    set({ currentTool: null })
  },
}))

export default useToolsStore
