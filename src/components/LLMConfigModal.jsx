import React, { useState } from 'react';
import { Modal, Form, Input, Select, Typography } from 'antd';
import { useReimbursementStore } from '../stores/useReimbursementStore';

const { Text } = Typography;

const PROVIDER_DEFAULTS = {
    qwen: {
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        modelName: 'qwen-vl-plus'
    },
    openai: {
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4o'
    },
    custom: {
        baseUrl: '',
        modelName: ''
    }
};

export default function LLMConfigModal({ visible, onClose }) {
    const { llmConfig, setLlmConfig } = useReimbursementStore();
    const [form] = Form.useForm();
    const [provider, setProvider] = useState(llmConfig.provider);

    const handleOk = () => {
        form.validateFields().then(values => {
            setLlmConfig({
                provider: values.provider,
                baseUrl: values.baseUrl,
                apiKey: values.apiKey,
                modelName: values.modelName
            });
            onClose();
        });
    };

    const onProviderChange = (value) => {
        setProvider(value);
        const defaults = PROVIDER_DEFAULTS[value] || PROVIDER_DEFAULTS.custom;
        form.setFieldsValue({
            baseUrl: defaults.baseUrl,
            modelName: defaults.modelName
        });
    };

    return (
        <Modal
            title="AI 识别引擎配置 (自带 Key)"
            open={visible}
            onOk={handleOk}
            onCancel={onClose}
            width={600}
        >
            <div style={{ marginBottom: 16 }}>
                <Text type="secondary">
                    发票整理工具依赖具备"视觉(Vision)"的大语言模型。<br />
                    您的 API Key 仅保存在浏览器本地，每次调用随图片发往后端完成代理请求，绝不在服务器长期保存。
                </Text>
            </div>

            <Form
                form={form}
                layout="vertical"
                initialValues={{
                    provider: llmConfig.provider,
                    baseUrl: llmConfig.baseUrl,
                    apiKey: llmConfig.apiKey,
                    modelName: llmConfig.modelName
                }}
            >
                <Form.Item name="provider" label="模型提供商">
                    <Select onChange={onProviderChange}>
                        <Select.Option value="qwen">阿里云百炼 (推荐通义千问 VL)</Select.Option>
                        <Select.Option value="openai">OpenAI (GPT-4V/4o)</Select.Option>
                        <Select.Option value="custom">自定义 / 开源兼容接口</Select.Option>
                    </Select>
                </Form.Item>

                <Form.Item
                    name="baseUrl"
                    label="API Base URL (必须兼容 OpenAI Chat Completions格式)"
                    rules={[{ required: true, message: '必须输入后端地址' }]}
                >
                    <Input placeholder="例如: https://dashscope.aliyuncs.com/compatible-mode/v1" />
                </Form.Item>

                <Form.Item
                    name="apiKey"
                    label="API Key (密钥)"
                    rules={[{ required: true, message: '请提供 API Key 才能调用大模型' }]}
                >
                    <Input.Password placeholder="sk-..." />
                </Form.Item>

                <Form.Item
                    name="modelName"
                    label="模型名称"
                    rules={[{ required: true, message: '请输入模型名称' }]}
                >
                    <Input placeholder="如: qwen-vl-plus, gpt-4o, glm-4v" />
                </Form.Item>
            </Form>
        </Modal>
    );
}