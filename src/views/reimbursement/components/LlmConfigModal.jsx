/**
 * LLM Config Modal
 * LLM API配置弹窗
 */

import { useEffect, useState } from 'react';
import useReimbursementStore from '../../../stores/reimbursementStore';

const providers = [
  { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen3.5-plus' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { id: 'custom', name: '自定义', baseUrl: '', defaultModel: '' },
];

function LlmConfigModal({ visible, onClose }) {
  const { llmConfig, defaultReporter, hasServerLlmConfig, saveLlmConfig, setDefaultReporter } = useReimbursementStore();
  const [formData, setFormData] = useState(llmConfig);
  const [reporter, setReporter] = useState(defaultReporter);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (visible) {
      setFormData(llmConfig);
      setReporter(defaultReporter || '');
      setSaveError('');
    }
  }, [visible, llmConfig, defaultReporter]);

  const handleProviderChange = (providerId) => {
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      setFormData({
        ...formData,
        provider: providerId,
        baseUrl: provider.baseUrl || formData.baseUrl,
        modelName: provider.defaultModel || formData.modelName,
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError('');

    try {
      await saveLlmConfig(formData, { defaultReporter: reporter.trim() });
      setDefaultReporter(reporter.trim());
      onClose();
    } catch (error) {
      setSaveError(error.message || '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="invoice-modal-overlay" onClick={onClose}>
      <div className="invoice-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="invoice-modal-header">
          <h2>模型 API 配置</h2>
          <button className="invoice-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="invoice-modal-body">
          <div className="llm-config-form">
            <div className="llm-config-field">
              <label>服务商</label>
              <select
                value={formData.provider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="llm-config-field">
              <label>Base URL</label>
              <input
                type="text"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
              />
            </div>

            <div className="llm-config-field">
              <label>API Key</label>
              <input
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="sk-..."
              />
            </div>

            <div className="llm-config-field">
              <label>默认报销人</label>
              <input
                type="text"
                value={reporter}
                onChange={(e) => setReporter(e.target.value)}
                placeholder="例如：张三"
              />
              <span className="llm-config-hint">用于明细表一键写入已选记录，也会作为当前浏览器的默认值保存。</span>
            </div>

            <div className="llm-config-field">
              <label>模型名称</label>
              <input
                type="text"
                value={formData.modelName}
                onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
                placeholder="qwen3.5-plus"
              />
              <span className="llm-config-hint">建议使用支持视觉的模型（VL/Vision）</span>
            </div>
          </div>

          <div className="llm-config-notice">
            <p>注意：API Key 将存储在浏览器本地，请勿在公共电脑上保存。</p>
            {hasServerLlmConfig && <p>当前服务端已配置默认 OCR 模型，不填写本地 API Key 也可以直接使用。</p>}
            {saveError && <p className="llm-config-error">{saveError}</p>}
          </div>
        </div>

        <div className="llm-config-footer">
          <button className="btn btn--ghost" onClick={onClose} disabled={isSaving}>取消</button>
          <button className="btn btn--primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LlmConfigModal;
