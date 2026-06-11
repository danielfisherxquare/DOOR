/**
 * Color Scheme Service
 * 配色方案服务 - 处理配色方案和机构配色设置的 CRUD 操作
 * 支持按层级（admin/app/ops）区分配色
 */

import knex from '../../db/knex.js';

// 预设配色方案（硬编码）- 按层级区分
const PRESET_SCHEMES = {
  admin: [
    {
      id: 'preset-industrial-red',
      name: '工业红',
      description: 'ArcSpro 默认管理层配色',
      is_preset: true,
      surface: 'admin',
      config: {
        accent: '#D8262C',
        accentHover: '#b30018',
        accentActive: '#930011',
        accentSoft: 'rgba(216, 38, 44, 0.08)',
        accentLight: '#ffb3ad',
        bgPrimary: '#fcf9f8',
        bgSecondary: '#f0eded',
        surface: '#ffffff',
        panel: '#1c1917',
        textPrimary: '#1b1c1c',
        textSecondary: '#454747',
        textMuted: '#78716c',
        border: '#e7e5e4',
      },
    },
    {
      id: 'preset-ocean-blue',
      name: '深海蓝',
      description: '科技感配色方案',
      is_preset: true,
      surface: 'admin',
      config: {
        accent: '#2563EB',
        accentHover: '#1d4ed8',
        accentActive: '#1e40af',
        accentSoft: 'rgba(37, 99, 235, 0.08)',
        accentLight: '#93c5fd',
        bgPrimary: '#f8fafc',
        bgSecondary: '#f1f5f9',
        surface: '#ffffff',
        panel: '#1c1917',
        textPrimary: '#0f172a',
        textSecondary: '#475569',
        textMuted: '#64748b',
        border: '#e2e8f0',
      },
    },
    {
      id: 'preset-royal-purple',
      name: '皇室紫',
      description: '创意设计主题配色',
      is_preset: true,
      surface: 'admin',
      config: {
        accent: '#7C3AED',
        accentHover: '#6D28D9',
        accentActive: '#5B21B6',
        accentSoft: 'rgba(124, 58, 237, 0.08)',
        accentLight: '#DDD6FE',
        bgPrimary: '#faf5ff',
        bgSecondary: '#f3e8ff',
        surface: '#ffffff',
        panel: '#1c1917',
        textPrimary: '#1e1b4b',
        textSecondary: '#4c1d95',
        textMuted: '#7c3aed',
        border: '#e9d5ff',
      },
    },
    {
      id: 'preset-midnight-black',
      name: '曜石黑',
      description: '极简高端主题配色',
      is_preset: true,
      surface: 'admin',
      config: {
        accent: '#374151',
        accentHover: '#1f2937',
        accentActive: '#111827',
        accentSoft: 'rgba(55, 65, 81, 0.08)',
        accentLight: '#d1d5db',
        bgPrimary: '#f9fafb',
        bgSecondary: '#f3f4f6',
        surface: '#ffffff',
        panel: '#111827',
        textPrimary: '#111827',
        textSecondary: '#4b5563',
        textMuted: '#9ca3af',
        border: '#e5e7eb',
      },
    },
  ],
  app: [
    {
      id: 'preset-amber-gold',
      name: '琥珀黄',
      description: 'ArcSpro 应用层配色',
      is_preset: true,
      surface: 'app',
      config: {
        accent: '#D4A017',
        accentHover: '#B8890E',
        accentActive: '#9A7209',
        accentSoft: 'rgba(212, 160, 23, 0.08)',
        accentLight: '#FDE68A',
        bgPrimary: '#faf9f7',
        bgSecondary: '#f0eeeb',
        surface: '#ffffff',
        panel: '#1c1917',
        textPrimary: '#1c1917',
        textSecondary: '#57534e',
        textMuted: '#78716c',
        border: '#e7e5e4',
      },
    },
    {
      id: 'preset-forest-green',
      name: '森林绿',
      description: '环保健康主题配色',
      is_preset: true,
      surface: 'app',
      config: {
        accent: '#059669',
        accentHover: '#047857',
        accentActive: '#065f46',
        accentSoft: 'rgba(5, 150, 105, 0.08)',
        accentLight: '#A7F3D0',
        bgPrimary: '#f0fdf4',
        bgSecondary: '#ecfdf5',
        surface: '#ffffff',
        panel: '#1c1917',
        textPrimary: '#14532d',
        textSecondary: '#166534',
        textMuted: '#22c55e',
        border: '#bbf7d0',
      },
    },
    {
      id: 'preset-ocean-blue',
      name: '深海蓝',
      description: '科技感配色方案',
      is_preset: true,
      surface: 'app',
      config: {
        accent: '#2563EB',
        accentHover: '#1d4ed8',
        accentActive: '#1e40af',
        accentSoft: 'rgba(37, 99, 235, 0.08)',
        accentLight: '#93c5fd',
        bgPrimary: '#f8fafc',
        bgSecondary: '#f1f5f9',
        surface: '#ffffff',
        panel: '#1c1917',
        textPrimary: '#0f172a',
        textSecondary: '#475569',
        textMuted: '#64748b',
        border: '#e2e8f0',
      },
    },
  ],
  ops: [
    {
      id: 'preset-volcano-orange',
      name: '火山橙',
      description: 'ArcSpro 默认执行层配色',
      is_preset: true,
      surface: 'ops',
      config: {
        accent: '#EA580C',
        accentHover: '#C2410C',
        accentActive: '#9A3412',
        accentSoft: 'rgba(234, 88, 12, 0.08)',
        accentLight: '#FED7AA',
        bgPrimary: '#fffaf5',
        bgSecondary: '#fef6ee',
        surface: '#ffffff',
        panel: '#1c1917',
        textPrimary: '#1c1917',
        textSecondary: '#57534e',
        textMuted: '#78716c',
        border: '#e7e5e4',
      },
    },
    {
      id: 'preset-forest-green',
      name: '森林绿',
      description: '环保健康主题配色',
      is_preset: true,
      surface: 'ops',
      config: {
        accent: '#059669',
        accentHover: '#047857',
        accentActive: '#065f46',
        accentSoft: 'rgba(5, 150, 105, 0.08)',
        accentLight: '#A7F3D0',
        bgPrimary: '#f0fdf4',
        bgSecondary: '#ecfdf5',
        surface: '#ffffff',
        panel: '#1c1917',
        textPrimary: '#14532d',
        textSecondary: '#166534',
        textMuted: '#22c55e',
        border: '#bbf7d0',
      },
    },
    {
      id: 'preset-ocean-blue',
      name: '深海蓝',
      description: '科技感配色方案',
      is_preset: true,
      surface: 'ops',
      config: {
        accent: '#2563EB',
        accentHover: '#1d4ed8',
        accentActive: '#1e40af',
        accentSoft: 'rgba(37, 99, 235, 0.08)',
        accentLight: '#93c5fd',
        bgPrimary: '#f8fafc',
        bgSecondary: '#f1f5f9',
        surface: '#ffffff',
        panel: '#1c1917',
        textPrimary: '#0f172a',
        textSecondary: '#475569',
        textMuted: '#64748b',
        border: '#e2e8f0',
      },
    },
  ],
};

/**
 * 获取预设配色方案
 * @param {string} surface - 层级（admin/app/ops）
 */
export function getPresets(surface) {
  return PRESET_SCHEMES[surface] || PRESET_SCHEMES.admin;
}

/**
 * 获取预设方案 by ID
 */
export function getPresetById(id) {
  // 在所有层级中查找
  for (const surface of Object.values(PRESET_SCHEMES)) {
    const preset = surface.find((p) => p.id === id);
    if (preset) return preset;
  }
  return null;
}

/**
 * 获取所有配色方案（含预设和自定义）
 * @param {string} orgId - 机构 ID
 * @param {string} surface - 层级（admin/app/ops）
 */
export async function getAllSchemes(orgId, surface = 'admin') {
  const customSchemes = await knex('color_schemes')
    .where('org_id', orgId)
    .where('surface', surface)
    .orderBy('created_at', 'desc');

  return {
    presets: getPresets(surface),
    custom: customSchemes.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      isPreset: false,
      surface: s.surface,
      config: s.config,
    })),
  };
}

/**
 * 获取单个配色方案
 * @param {string} schemeId - 方案 ID
 */
export async function getScheme(schemeId) {
  // 先检查是否为预设
  const preset = getPresetById(schemeId);
  if (preset) return preset;

  // 否则查询数据库
  const scheme = await knex('color_schemes').where('id', schemeId).first();
  if (!scheme) return null;

  return {
    id: scheme.id,
    name: scheme.name,
    description: scheme.description,
    isPreset: false,
    surface: scheme.surface,
    config: scheme.config,
  };
}

/**
 * 创建自定义配色方案
 * @param {string} orgId - 机构 ID
 * @param {string} surface - 层级（admin/app/ops）
 * @param {Object} data - 方案数据
 */
export async function createScheme(orgId, surface, data) {
  const [scheme] = await knex('color_schemes')
    .insert({
      org_id: orgId,
      surface: surface || 'admin',
      name: data.name,
      description: data.description || '',
      config: JSON.stringify(data.config || {}),
    })
    .returning('*');

  return {
    id: scheme.id,
    name: scheme.name,
    description: scheme.description,
    isPreset: false,
    surface: scheme.surface,
    config: scheme.config,
  };
}

/**
 * 更新配色方案
 * @param {string} orgId - 机构 ID
 * @param {string} surface - 层级（admin/app/ops）
 * @param {string} schemeId - 方案 ID
 * @param {Object} data - 更新数据
 */
export async function updateScheme(orgId, surface, schemeId, data) {
  const updateData = { updated_at: knex.fn.now() };
  if (data.name) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.config) updateData.config = JSON.stringify(data.config);

  const [scheme] = await knex('color_schemes')
    .where('id', schemeId)
    .where('org_id', orgId)
    .where('surface', surface)
    .update(updateData)
    .returning('*');

  if (!scheme) return null;

  return {
    id: scheme.id,
    name: scheme.name,
    description: scheme.description,
    isPreset: false,
    surface: scheme.surface,
    config: scheme.config,
  };
}

/**
 * 删除配色方案
 * @param {string} orgId - 机构 ID
 * @param {string} surface - 层级（admin/app/ops）
 * @param {string} schemeId - 方案 ID
 */
export async function deleteScheme(orgId, surface, schemeId) {
  // 不能删除预设
  if (schemeId.startsWith('preset-')) {
    throw new Error('Cannot delete preset scheme');
  }

  const deleted = await knex('color_schemes')
    .where('id', schemeId)
    .where('org_id', orgId)
    .where('surface', surface)
    .del();

  return deleted > 0;
}

/**
 * 获取机构当前配色设置
 * @param {string} orgId - 机构 ID
 * @param {string} surface - 层级（admin/app/ops）
 */
export async function getOrgScheme(orgId, surface = 'admin') {
  const setting = await knex('org_color_settings')
    .where('org_id', orgId)
    .where('surface', surface)
    .first();

  if (!setting) {
    return { scheme: null, customConfig: null };
  }

  const scheme = await getScheme(setting.scheme_id);
  return {
    scheme,
    customConfig: setting.custom_config,
  };
}

/**
 * 设置机构配色
 * @param {string} orgId - 机构 ID
 * @param {string} surface - 层级（admin/app/ops）
 * @param {string} schemeId - 方案 ID
 * @param {Object} customConfig - 自定义配置覆盖
 */
export async function setOrgScheme(orgId, surface, schemeId, customConfig = null) {
  // 验证方案存在
  const scheme = await getScheme(schemeId);
  if (!scheme) {
    throw new Error('Scheme not found');
  }

  const existing = await knex('org_color_settings')
    .where('org_id', orgId)
    .where('surface', surface)
    .first();

  if (existing) {
    await knex('org_color_settings')
      .where('org_id', orgId)
      .where('surface', surface)
      .update({
        scheme_id: schemeId,
        custom_config: customConfig ? JSON.stringify(customConfig) : null,
        updated_at: knex.fn.now(),
      });
  } else {
    await knex('org_color_settings')
      .insert({
        org_id: orgId,
        surface: surface || 'admin',
        scheme_id: schemeId,
        custom_config: customConfig ? JSON.stringify(customConfig) : null,
      });
  }

  return { success: true };
}

/**
 * 重置机构配色
 * @param {string} orgId - 机构 ID
 * @param {string} surface - 层级（admin/app/ops）
 */
export async function resetOrgScheme(orgId, surface = 'admin') {
  await knex('org_color_settings')
    .where('org_id', orgId)
    .where('surface', surface)
    .del();

  return { success: true };
}

export default {
  getPresets,
  getPresetById,
  getAllSchemes,
  getScheme,
  createScheme,
  updateScheme,
  deleteScheme,
  getOrgScheme,
  setOrgScheme,
  resetOrgScheme,
};
