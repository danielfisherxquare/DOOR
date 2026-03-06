import { create } from 'zustand'

// 模拟工具数据（实际项目中从后台API获取）
const mockTools = [
  {
    id: 'mechanical-clock',
    name: '机械计时钟',
    description: '具有物理翻转动画效果的机械式计时器，模拟真实电磁翻板显示器',
    icon: '⏱️',
    status: 'online',
    apiEndpoint: '/api/tools/mechanical-clock',
    component: 'MechanicalClock'  // 指定前端组件名称
  },
  {
    id: 'mechanical-clock-3d',
    name: '3D 机械计时钟',
    description: '真正的3D段式翻转时钟，每个笔画都是立体六面体，翻转时可见金属侧面',
    icon: '🕰️',
    status: 'online',
    apiEndpoint: '/api/tools/mechanical-clock-3d',
    component: 'MechanicalClock3D'
  },
  {
    id: 'app-download',
    name: '应用下载',
    description: '下载相关应用程序',
    icon: '📥',
    status: 'online',
    apiEndpoint: '/api/tools/app-download',
    component: 'AppDownload'
  }
]

const useToolsStore = create((set, get) => ({
  tools: [],
  currentTool: null,
  isLoading: false,
  error: null,

  // 获取工具列表
  fetchTools: async () => {
    set({ isLoading: true, error: null })

    try {
      // TODO: 替换为实际的后台API
      // const response = await toolsApi.getTools()
      set({ tools: mockTools, isLoading: false })
    } catch (error) {
      set({ error: error.message, isLoading: false })
    }
  },

  // 获取单个工具详情
  fetchToolById: async (id) => {
    set({ isLoading: true, error: null })

    try {
      // TODO: 替换为实际的后台API
      // const response = await toolsApi.getToolById(id)
      const tool = mockTools.find(t => t.id === id)
      set({ currentTool: tool, isLoading: false })
      return tool
    } catch (error) {
      set({ error: error.message, isLoading: false })
      return null
    }
  },

  // 调用工具
  invokeTool: async (id, params) => {
    set({ isLoading: true, error: null })

    try {
      // TODO: 替换为实际的后台API
      // const response = await toolsApi.invokeTool(id, params)
      set({ isLoading: false })
      return { success: true, data: { result: '操作成功' } }
    } catch (error) {
      set({ error: error.message, isLoading: false })
      return { success: false, error: error.message }
    }
  },

  // 清除当前工具
  clearCurrentTool: () => {
    set({ currentTool: null })
  }
}))

export default useToolsStore