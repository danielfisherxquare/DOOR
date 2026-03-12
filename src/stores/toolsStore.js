import { create } from 'zustand'

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
    id: 'interview-tool',
    name: '数字化面试评分',
    description: '体育赛事公司面试评分与候选人对比工具',
    icon: '🏅',
    status: 'online',
    path: '/interview',
    type: 'creative'
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
  }
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
  }
}))

export default useToolsStore
