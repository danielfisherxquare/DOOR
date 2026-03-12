import { create } from 'zustand'

// 只保留面试评估系统
const mockTools = [
  {
    id: 'interview-tool',
    name: '数字化打分系统',
    description: '体育赛事公司面试评分与候选人对比工具',
    icon: '🏅',
    status: 'online',
    path: '/interview'
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