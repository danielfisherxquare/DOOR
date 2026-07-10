/**
 * Reimbursement Store
 * 发票报销状态管理
 * 使用 Zustand + persist
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import request, { requestRaw, requestWithLongTimeout } from '../utils/request';
import { maskPersistedReimbursementLlmConfig } from '../utils/reimbursementLlmConfig';

const DEFAULT_LLM_CONFIG = {
  provider: 'qwen',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: '',
  modelName: 'qwen3.5-plus',
};

function parseContentDispositionFilename(contentDisposition) {
  if (!contentDisposition) return '';

  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1] || '';
}

function downloadBlob(blob, fallbackName, contentDisposition) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = parseContentDispositionFilename(contentDisposition) || fallbackName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

async function uploadWithAuth(path, formData) {
  return request.post(path, formData);
}

function mergeLlmConfig(...configs) {
  const merged = { ...DEFAULT_LLM_CONFIG };

  for (const config of configs) {
    if (!config || typeof config !== 'object') continue;

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed || key === 'apiKey') {
          merged[key] = trimmed;
        }
        continue;
      }

      if (value != null) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function applySettingsState(set, get, settings) {
  const currentConfig = get().llmConfig;
  const nextConfig = mergeLlmConfig(currentConfig, settings?.llmConfig);

  set({
    llmConfig: nextConfig,
    defaultReporter: settings?.defaultReporter ?? get().defaultReporter,
    hasServerLlmConfig: Boolean(settings?.hasServerLlmConfig),
    settingsLoaded: true,
  });
}

// ==================== 类型定义 ====================

/**
 * @typedef {Object} LlmConfig
 * @property {string} provider
 * @property {string} baseUrl
 * @property {string} apiKey
 * @property {string} modelName
 */

/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} status
 * @property {number} record_count
 * @property {number} total_income
 * @property {number} total_expense
 */

/**
 * @typedef {Object} ReimbursementRecord
 * @property {string} id
 * @property {number} index
 * @property {string} payment_date
 * @property {string} category
 * @property {string} sub_category
 * @property {string} description
 * @property {number} income
 * @property {number} expense
 * @property {string} reporter
 * @property {boolean} has_invoice
 * @property {string} company
 * @property {string} remarks
 */

/**
 * @typedef {Object} Attachment
 * @property {string} id
 * @property {string} record_id
 * @property {string} file_name
 * @property {string} original_name
 * @property {string} file_type
 * @property {number} file_size
 * @property {string} mime_type
 * @property {string} local_path
 */

// ==================== Store定义 ====================

const useReimbursementStore = create(
  persist(
    (set, get) => ({
      // ==================== 状态 ====================
      projects: [],
      activeProjectId: null,
      activeProject: null,
      records: [],
      attachments: {}, // record_id -> Attachment[]
      pendingMatches: [],
      isLoading: false,
      error: null,
      settingsLoaded: false,
      hasServerLlmConfig: false,

      // 处理状态统计
      processingStats: {
        pending: 0,
        processing: 0,
        completed: 0,
        skipped: 0,
        errored: 0,
      },
      // 处理记录列表
      processingJobs: [],
      // 重复文件列表
      duplicateFiles: [],
      // 错误文件列表
      errorFiles: [],

      // 预览工作区
      previewFiles: [],
      previewStats: {
        total: 0,
        preview: 0,
        recognized: 0,
        duplicates: 0,
      },
      // 正在识别的文件ID集合
      recognizingFileIds: new Set(),

      // LLM配置
      llmConfig: { ...DEFAULT_LLM_CONFIG },

      // 用户设置
      defaultReporter: '',
      watchDirectoryHandle: null, // File System Access API 句柄

      // ==================== 项目管理 ====================

      fetchSettings: async () => {
        try {
          const { settings } = await request.get('/app/reimbursements/settings')
          applySettingsState(set, get, settings)
          return settings
        } catch (error) {
          set({ error: error.message, settingsLoaded: true })
          throw error
        }
      },

      saveLlmConfig: async (config, options = {}) => {
        const nextConfig = mergeLlmConfig(get().llmConfig, config);
        const nextDefaultReporter = options.defaultReporter ?? get().defaultReporter;
        set({ llmConfig: nextConfig, error: null });

        try {
          const { settings } = await request.put('/app/reimbursements/settings', {
            defaultReporter: nextDefaultReporter,
            llmConfig: nextConfig,
          })
          applySettingsState(set, get, settings)
          return settings
        } catch (error) {
          set({ error: error.message })
          throw error
        }
      },

      saveDefaultReporter: async (reporter) => {
        const nextDefaultReporter = reporter?.trim?.() ?? '';
        set({ error: null });

        try {
          const { settings } = await request.put('/app/reimbursements/settings', {
            defaultReporter: nextDefaultReporter,
            llmConfig: get().llmConfig,
          });
          applySettingsState(set, get, settings);
          return settings;
        } catch (error) {
          set({ error: error.message });
          throw error;
        }
      },

      fetchProjects: async () => {
        set({ isLoading: true, error: null });
        try {
          const { projects } = await request.get('/app/reimbursements/projects')
          const activeId = get().activeProjectId;
          const matchedActiveProject = activeId ? projects.find((project) => project.id === activeId) : null;
          set({
            projects,
            activeProject: matchedActiveProject || null,
            isLoading: false,
          })

          // 如果没有活跃项目，自动选择第一个
          if (!activeId && projects.length > 0) {
            await get().switchProject(projects[0].id);
          } else if (activeId && !matchedActiveProject) {
            if (projects.length > 0) {
              await get().switchProject(projects[0].id);
            } else {
              set({
                activeProjectId: null,
                activeProject: null,
                records: [],
                pendingMatches: [],
              });
            }
          }
        } catch (error) {
          set({ error: error.message, isLoading: false });
        }
      },

      createProject: async (name, shortName = null, description = null) => {
        set({ isLoading: true, error: null });
        try {
          const { project } = await request.post('/app/reimbursements/projects', { name, shortName, description })
          set({
            projects: [...get().projects, project],
            activeProjectId: project.id,
            activeProject: project,
            records: [],
            isLoading: false,
          });
          return project;
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      switchProject: async (projectId) => {
        set({ isLoading: true, error: null });
        try {
          const project = get().projects.find(p => p.id === projectId);
          set({ activeProjectId: projectId, activeProject: project });
          await get().fetchRecords(projectId);
          await get().fetchProcessingStats();
          await get().fetchPendingMatches();
          set({ isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
        }
      },

      deleteProject: async (projectId) => {
        set({ isLoading: true, error: null });
        try {
          await request.delete(`/app/reimbursements/projects/${projectId}`)
          const projects = get().projects.filter(p => p.id !== projectId)
          set({ projects })

          if (get().activeProjectId === projectId) {
            set({
              activeProjectId: null,
              activeProject: null,
              records: [],
              pendingMatches: [],
              previewFiles: [],
              processingStats: {
                pending: 0,
                processing: 0,
                completed: 0,
                skipped: 0,
                errored: 0,
              },
            });
            if (projects.length > 0) {
              await get().switchProject(projects[0].id);
            }
          }
          set({ isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      updateProject: async (projectId, updates) => {
        set({ isLoading: true, error: null });
        try {
          const { project } = await request.put(`/app/reimbursements/projects/${projectId}`, updates);
          const projects = get().projects.map((item) => (item.id === projectId ? project : item));
          set({
            projects,
            activeProject: get().activeProjectId === projectId ? project : get().activeProject,
            isLoading: false,
          });
          return project;
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      clearProjectRecords: async (projectId) => {
        set({ isLoading: true, error: null });
        try {
          await request.delete(`/app/reimbursements/projects/${projectId}/records`);
          await get().fetchProjects();

          if (get().activeProjectId === projectId) {
            await Promise.all([
              get().fetchRecords(projectId),
              get().fetchProcessingStats(),
              get().fetchPendingMatches(),
              get().fetchPreviewFiles(projectId),
            ]);
          }

          set({ isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      // ==================== 记录管理 ====================

      fetchRecords: async (projectId) => {
        try {
          const { records } = await request.get(`/app/reimbursements/projects/${projectId}/records`)
          set({ records })
        } catch (error) {
          set({ error: error.message });
        }
      },

      addRecord: async (recordData) => {
        const projectId = get().activeProjectId;
        if (!projectId) throw new Error('没有活跃项目');

        set({ isLoading: true, error: null });
        try {
          await request.post(`/app/reimbursements/projects/${projectId}/records`, recordData)
          await get().fetchRecords(projectId)
          set({ isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      updateRecord: async (recordId, updates) => {
        set({ isLoading: true, error: null });
        try {
          await request.put(`/app/reimbursements/records/${recordId}`, updates)
          await get().fetchRecords(get().activeProjectId)
          set({ isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      deleteRecord: async (recordId) => {
        set({ isLoading: true, error: null });
        try {
          await request.delete(`/app/reimbursements/records/${recordId}`)
          await get().fetchRecords(get().activeProjectId)
          await get().fetchProjects();
          set({ isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      batchUpdateRecords: async (recordIds, updates) => {
        set({ isLoading: true, error: null });
        try {
          await request.post('/app/reimbursements/records/batch-update', { recordIds, updates });
          await get().fetchRecords(get().activeProjectId);
          await get().fetchProjects();
          set({ isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      batchDeleteRecords: async (recordIds) => {
        set({ isLoading: true, error: null });
        try {
          await request.post('/app/reimbursements/records/batch-delete', { recordIds });
          await get().fetchRecords(get().activeProjectId);
          await get().fetchProjects();
          set({ isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      // ==================== OCR处理 ====================

      processInvoiceOcr: async (file) => {
        const config = get().llmConfig;
        const projectId = get().activeProjectId;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('config', JSON.stringify(config));
        if (projectId) {
          formData.append('projectId', projectId);
        }

        const result = await uploadWithAuth('/app/reimbursements/ocr/invoice', formData);

        // 刷新处理统计
        if (projectId && !result.skipped) {
          await get().fetchProcessingStats();
        }

        return result;
      },

      processPaymentOcr: async (file) => {
        const config = get().llmConfig;
        const projectId = get().activeProjectId;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('config', JSON.stringify(config));
        if (projectId) {
          formData.append('projectId', projectId);
        }

        const result = await uploadWithAuth('/app/reimbursements/ocr/payment', formData);

        // 刷新处理统计和待匹配项
        if (projectId && !result.skipped) {
          await get().fetchProcessingStats();
          if (result.matchResult?.pendingMatch) {
            await get().fetchPendingMatches();
          }
        }

        return result;
      },

      // ==================== 处理状态管理 ====================

      fetchProcessingStats: async () => {
        const projectId = get().activeProjectId;
        if (!projectId) return;

        try {
          const { stats } = await request.get(`/app/reimbursements/projects/${projectId}/stats`);
          set({ processingStats: stats });
        } catch (error) {
          console.error('获取处理统计失败:', error);
        }
      },

      fetchProcessingJobs: async (status) => {
        const projectId = get().activeProjectId;
        if (!projectId) return;

        try {
          const { jobs } = await request.get(`/app/reimbursements/projects/${projectId}/jobs`, {
            params: { status },
          });
          set({ processingJobs: jobs });
        } catch (error) {
          console.error('获取处理记录失败:', error);
        }
      },

      fetchDuplicateFiles: async () => {
        const projectId = get().activeProjectId;
        if (!projectId) return;

        try {
          const { duplicates } = await request.get(`/app/reimbursements/projects/${projectId}/duplicates`);
          set({ duplicateFiles: duplicates });
        } catch (error) {
          console.error('获取重复文件失败:', error);
        }
      },

      fetchErrorFiles: async () => {
        const projectId = get().activeProjectId;
        if (!projectId) return;

        try {
          const { errors } = await request.get(`/app/reimbursements/projects/${projectId}/errors`);
          set({ errorFiles: errors });
        } catch (error) {
          console.error('获取错误文件失败:', error);
        }
      },

      // ==================== 待匹配项管理 ====================

      fetchPendingMatches: async () => {
        const projectId = get().activeProjectId;
        if (!projectId) return;

        try {
          const { matches } = await request.get(`/app/reimbursements/projects/${projectId}/pending-matches`);
          set({ pendingMatches: matches });
        } catch (error) {
          console.error('获取待匹配项失败:', error);
        }
      },

      resolvePendingMatch: async (matchId, recordId) => {
        set({ isLoading: true, error: null });
        try {
          await request.post(`/app/reimbursements/pending-matches/${matchId}/resolve`, { recordId });
          await get().fetchPendingMatches();
          await get().fetchRecords(get().activeProjectId);
          await get().fetchPreviewFiles(get().activeProjectId);
          await get().fetchProjects();
          set({ isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      rejectPendingMatch: async (matchId) => {
        set({ isLoading: true, error: null });
        try {
          await request.post(`/app/reimbursements/pending-matches/${matchId}/reject`);
          await get().fetchPendingMatches();
          await get().fetchRecords(get().activeProjectId);
          await get().fetchPreviewFiles(get().activeProjectId);
          await get().fetchProjects();
          set({ isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      // ==================== 预览工作区管理 ====================

      fetchPreviewFiles: async (projectId) => {
        const targetProjectId = projectId || get().activeProjectId;
        if (!targetProjectId) return;

        try {
          const { list } = await request.get(`/app/reimbursements/projects/${targetProjectId}/preview/list`);
          set({ previewFiles: list });
        } catch (error) {
          console.error('获取预览文件失败:', error);
        }
      },

      fetchPreviewStats: async () => {
        const projectId = get().activeProjectId;
        if (!projectId) return;

        try {
          const { stats } = await request.get(`/app/reimbursements/projects/${projectId}/preview/stats`);
          set({ previewStats: stats });
        } catch (error) {
          console.error('获取预览统计失败:', error);
        }
      },

      importToPreview: async (projectId, files, documentType = 'invoice') => {
        set({ isLoading: true, error: null });
        try {
          const formData = new FormData();
          files.forEach((file) => {
            formData.append('files', file);
          });
          formData.append('documentType', documentType);

          const result = await request.post(
            `/app/reimbursements/projects/${projectId}/preview/import`,
            formData
          );
          await get().fetchPreviewFiles(projectId);
          await get().fetchPendingMatches();
          set({ isLoading: false });
          return result;
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      recognizeFromFile: async (projectId, fileId, forceRecognize, options = {}) => {
        const shouldRefresh = options.refresh !== false;
        set({ isLoading: true, error: null });
        try {
          // 使用长超时实例，因为 OCR 识别可能需要较长时间
          const result = await requestWithLongTimeout.post(
            `/app/reimbursements/projects/${projectId}/preview/${fileId}/recognize`,
            { forceRecognize }
          );

          // 如果需要确认（重复文件），返回确认信息
          if (result.needConfirm) {
            set({ isLoading: false });
            return result;
          }

          if (shouldRefresh) {
            await get().fetchPreviewFiles(projectId);
            await get().fetchRecords(projectId);
            await get().fetchPendingMatches();
            await get().fetchProjects();
          }
          set({ isLoading: false });
          return result;
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      discardFile: async (projectId, fileId) => {
        set({ isLoading: true, error: null });
        try {
          await request.delete(`/app/reimbursements/projects/${projectId}/preview/${fileId}`);
          await get().fetchPreviewFiles(projectId);
          set({ isLoading: false });
        } catch (error) {
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      // 识别状态管理
      addRecognizingFile: (fileId) => {
        set(state => ({
          recognizingFileIds: new Set([...state.recognizingFileIds, fileId])
        }));
      },

      removeRecognizingFile: (fileId) => {
        set(state => {
          const newSet = new Set(state.recognizingFileIds);
          newSet.delete(fileId);
          return { recognizingFileIds: newSet };
        });
      },

      // ==================== 配置管理 ====================

      setLlmConfig: (config) => set({ llmConfig: { ...get().llmConfig, ...config } }),

      setDefaultReporter: (reporter) => set({ defaultReporter: reporter }),

      setWatchDirectoryHandle: (handle) => set({ watchDirectoryHandle: handle }),

      // ==================== 附件管理 ====================

      getAttachments: (recordId) => {
        const record = get().records.find(r => r.id === recordId);
        return record?.attachments || [];
      },

      getAttachmentUrl: async (storagePath) => {
        if (!storagePath) return null;
        try {
          const response = await requestRaw.get(storagePath, { responseType: 'blob' });
          return URL.createObjectURL(response.data);
        } catch {
          return null;
        }
      },

      getAttachmentThumbnail: async (attachmentId) => {
        if (!attachmentId) return null;
        try {
          const response = await requestRaw.get(
            `/app/reimbursements/attachments/${attachmentId}/thumbnail`,
            { responseType: 'blob' }
          );
          return URL.createObjectURL(response.data);
        } catch {
          return null;
        }
      },

      getAttachmentImage: async (attachmentId) => {
        if (!attachmentId) return null;
        try {
          const response = await requestRaw.get(
            `/app/reimbursements/attachments/${attachmentId}/image`,
            { responseType: 'blob' }
          );
          return URL.createObjectURL(response.data);
        } catch {
          return null;
        }
      },

      // ==================== 导出功能 ====================

      exportToExcel: async () => {
        const projectId = get().activeProjectId;
        if (!projectId) throw new Error('没有活跃项目');

        const response = await requestRaw.post('/app/reimbursements/export', { projectId }, {
          responseType: 'blob',
        });
        const fallbackName = `${get().activeProject?.name || '报销单'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        downloadBlob(response.data, fallbackName, response.headers['content-disposition']);
      },

      exportWithImages: async () => {
        const projectId = get().activeProjectId;
        if (!projectId) throw new Error('没有活跃项目');

        const response = await requestRaw.get(
          `/app/reimbursements/projects/${projectId}/export-with-images`,
          { responseType: 'blob' }
        );
        const fallbackName = `${get().activeProject?.name || '报销单'}_${new Date().toISOString().slice(0, 10)}.zip`;
        downloadBlob(response.data, fallbackName, response.headers['content-disposition']);
      },

      // ==================== 附件管理 ====================

      deleteAttachment: async (attachmentId) => {
        return request.delete(`/app/reimbursements/attachments/${attachmentId}`);
      },

      replaceAttachment: async (attachmentId, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return request.put(
          `/app/reimbursements/attachments/${attachmentId}/replace`,
          formData
        );
      },

      // ==================== 清理 ====================

      clearError: () => set({ error: null }),
    }),
    {
      name: 'reimbursement-storage',
      version: 2,
      migrate: (persistedState) => ({
        ...(persistedState || {}),
        llmConfig: maskPersistedReimbursementLlmConfig(persistedState?.llmConfig),
      }),
      partialize: (state) => ({
        llmConfig: maskPersistedReimbursementLlmConfig(state.llmConfig),
        defaultReporter: state.defaultReporter,
        hasServerLlmConfig: state.hasServerLlmConfig,
      }),
    }
  )
);

export default useReimbursementStore;
