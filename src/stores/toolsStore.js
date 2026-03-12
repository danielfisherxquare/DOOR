import { create } from 'zustand'

// 模拟工具数据（实际项目中从后台API获取）
const mockTools = [
  {
    id: 'admin-portal',
    name: '后台管理',
    description: '机构、用户、赛事与授权综合管理平台',
    icon: '⚙️',
    status: 'online',
    path: '/admin'
  },
  {
    id: 'scan-tool',
    name: '扫码功能',
    description: '扫码/输入 token 查询号码布发放状态',
    icon: '📸',
    status: 'online',
    path: '/scan'
  },
  {
    id: 'mechanical-clock-3d',
    name: '3D 机械计时钟',
    description: '真正的3D段式翻转时钟，每个笔画都是立体六面体，翻转时可见金属侧面',
    icon: '🕰️',
    status: 'online',
    apiEndpoint: '/tools/mechanical-clock-3d',
    component: 'MechanicalClock3D'
  },
  {
    id: 'app-download',
    name: '应用下载',
    description: '下载本地马拉松报名数据管理器客户端',
    icon: '📥',
    status: 'online',
    apiEndpoint: '/tools/app-download',
    component: 'AppDownload'
  },
  {
    id: 'interview-tool',
    name: '面试评估系统',
    description: '平面设计师面试评分与候选人对比工具',
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