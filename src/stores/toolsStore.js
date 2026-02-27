import { create } from 'zustand'

// 模拟工具数据（实际项目中从后台API获取）
const mockTools = [
  {
    id: 'json-formatter',
    name: 'JSON 格式化',
    description: 'JSON 数据格式化、压缩、校验工具',
    icon: '📋',
    status: 'online',
    apiEndpoint: '/api/tools/json-formatter'
  },
  {
    id: 'base64-encoder',
    name: 'Base64 编解码',
    description: 'Base64 编码与解码工具',
    icon: '🔐',
    status: 'online',
    apiEndpoint: '/api/tools/base64-encoder'
  },
  {
    id: 'qrcode-generator',
    name: '二维码生成',
    description: '生成自定义二维码图片',
    icon: '📱',
    status: 'online',
    apiEndpoint: '/api/tools/qrcode-generator'
  },
  {
    id: 'color-picker',
    name: '颜色选择器',
    description: '颜色选取、转换、调色板生成',
    icon: '🎨',
    status: 'online',
    apiEndpoint: '/api/tools/color-picker'
  },
  {
    id: 'timestamp-converter',
    name: '时间戳转换',
    description: '时间戳与日期时间格式互转',
    icon: '⏰',
    status: 'online',
    apiEndpoint: '/api/tools/timestamp-converter'
  },
  {
    id: 'image-compressor',
    name: '图片压缩',
    description: '在线图片压缩优化工具',
    icon: '🖼️',
    status: 'maintenance',
    apiEndpoint: '/api/tools/image-compressor'
  },
  {
    id: 'diff-checker',
    name: '文本对比',
    description: '两段文本差异对比分析',
    icon: '📝',
    status: 'online',
    apiEndpoint: '/api/tools/diff-checker'
  },
  {
    id: 'regex-tester',
    name: '正则测试',
    description: '正则表达式在线测试工具',
    icon: '🔍',
    status: 'online',
    apiEndpoint: '/api/tools/regex-tester'
  },
  {
    id: 'uuid-generator',
    name: 'UUID 生成器',
    description: '批量生成 UUID/GUID',
    icon: '🔑',
    status: 'online',
    apiEndpoint: '/api/tools/uuid-generator'
  },
  {
    id: 'markdown-editor',
    name: 'Markdown 编辑器',
    description: 'Markdown 在线编辑与预览',
    icon: '📄',
    status: 'offline',
    apiEndpoint: '/api/tools/markdown-editor'
  },
  {
    id: 'api-tester',
    name: 'API 测试',
    description: 'HTTP API 在线测试调试工具',
    icon: '🌐',
    status: 'online',
    apiEndpoint: '/api/tools/api-tester'
  },
  {
    id: 'sql-formatter',
    name: 'SQL 格式化',
    description: 'SQL 语句格式化美化工具',
    icon: '🗃️',
    status: 'online',
    apiEndpoint: '/api/tools/sql-formatter'
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
      
      // 模拟请求延迟
      await new Promise(resolve => setTimeout(resolve, 500))
      
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
      
      // 模拟请求延迟
      await new Promise(resolve => setTimeout(resolve, 300))
      
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
      
      // 模拟请求延迟
      await new Promise(resolve => setTimeout(resolve, 800))
      
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