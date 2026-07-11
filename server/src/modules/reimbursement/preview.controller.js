/**
 * Preview Controller
 * 预览工作区控制器
 */

import * as previewService from './preview.service.js';
import * as reimbursementService from './reimbursement.service.js';
import { resolveReimbursementExportName } from './reimbursement-export-name.js';

const DEFAULT_LLM_CONFIG = {
    provider: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen3.5-plus',
};

/**
 * 获取服务端LLM配置
 */
function getServerLlmConfig() {
    const env = process.env;
    return {
        provider: env.REIMBURSEMENT_OCR_PROVIDER || DEFAULT_LLM_CONFIG.provider,
        baseUrl: env.REIMBURSEMENT_OCR_BASE_URL || DEFAULT_LLM_CONFIG.baseUrl,
        apiKey: env.REIMBURSEMENT_OCR_API_KEY || '',
        modelName: env.REIMBURSEMENT_OCR_MODEL_NAME || env.REIMBURSEMENT_OCR_MODEL || DEFAULT_LLM_CONFIG.modelName,
    };
}

/**
 * 获取合并后的LLM配置
 * 服务端付费 OCR 配置优先，避免旧浏览器 key 继续消耗或失效。
 */
export function resolveLlmConfig(userConfig, serverConfig = getServerLlmConfig()) {
    const hasServerApiKey = Boolean(serverConfig?.apiKey?.trim());

    if (hasServerApiKey) {
        return {
            ...DEFAULT_LLM_CONFIG,
            provider: serverConfig.provider || DEFAULT_LLM_CONFIG.provider,
            baseUrl: serverConfig.baseUrl || DEFAULT_LLM_CONFIG.baseUrl,
            apiKey: serverConfig.apiKey,
            modelName: serverConfig.modelName || DEFAULT_LLM_CONFIG.modelName,
        };
    }

    return {
        ...DEFAULT_LLM_CONFIG,
        provider: userConfig?.provider || serverConfig?.provider || DEFAULT_LLM_CONFIG.provider,
        baseUrl: userConfig?.baseUrl || serverConfig?.baseUrl || DEFAULT_LLM_CONFIG.baseUrl,
        apiKey: userConfig?.apiKey || '',
        modelName: userConfig?.modelName || serverConfig?.modelName || DEFAULT_LLM_CONFIG.modelName,
    };
}

/**
 * POST /api/reimbursement/projects/:id/preview/import
 * 导入文件到预览区
 */
export async function importToPreview(req, res, next) {
    try {
        const { id: projectId } = req.params;
        const userId = req.authContext?.userId;
        const documentType = req.body?.documentType === 'payment' ? 'payment' : 'invoice';

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: '未上传文件' });
        }

        const files = req.files.map(file => ({
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
        }));

        const result = await previewService.importToPreview(projectId, userId, files, documentType);

        res.json({
            success: true,
            imported: result.imported,
            duplicates: result.duplicates,
            documentType,
        });
    } catch (error) {
        console.error('导入预览区失败:', error);
        next(error);
    }
}

/**
 * GET /api/reimbursement/projects/:id/preview/list
 * 获取预览文件列表
 */
export async function getPreviewList(req, res, next) {
    try {
        const { id: projectId } = req.params;
        const list = await previewService.getPreviewList(projectId);
        res.json({ success: true, list });
    } catch (error) {
        console.error('获取预览列表失败:', error);
        next(error);
    }
}

/**
 * GET /api/reimbursement/projects/:id/preview/stats
 * 获取预览统计
 */
export async function getPreviewStats(req, res, next) {
    try {
        const { id: projectId } = req.params;
        const stats = await previewService.getPreviewStats(projectId);
        res.json({ success: true, stats });
    } catch (error) {
        console.error('获取预览统计失败:', error);
        next(error);
    }
}

/**
 * POST /api/reimbursement/projects/:id/preview/:fileId/recognize
 * 从预览区识别文件
 */
export async function recognizeFromPreview(req, res, next) {
    try {
        const { id: projectId, fileId } = req.params;
        const { forceRecognize } = req.body;
        const userId = req.authContext?.userId;

        // 获取用户的LLM配置
        const userSettings = await getProjectSettings(projectId);
        const llmConfig = resolveLlmConfig(userSettings?.llm_config);

        if (!llmConfig.apiKey || !llmConfig.baseUrl) {
            return res.status(400).json({
                success: false,
                error: '请先配置模型 API',
            });
        }

        const result = await previewService.recognizeFromPreview(
            projectId,
            userId,
            fileId,
            llmConfig,
            forceRecognize
        );

        res.json(result);
    } catch (error) {
        console.error('识别失败:', error);
        const status = error.status || error.statusCode || error.response?.status || 500;
        const message = error.expose
            ? error.message
            : (process.env.NODE_ENV === 'development'
                ? (error.message || '识别失败')
                : '识别失败');

        res.status(status).json({
            success: false,
            error: message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        });
    }
}

/**
 * DELETE /api/reimbursement/projects/:id/preview/:fileId
 * 从预览区移除文件
 */
export async function discardPreviewFile(req, res, next) {
    try {
        const { id: projectId, fileId } = req.params;
        await previewService.discardPreviewFile(projectId, fileId);
        res.json({ success: true });
    } catch (error) {
        console.error('移除预览文件失败:', error);
        next(error);
    }
}

/**
 * GET /api/reimbursement/projects/:id/export-with-images
 * 导出Excel和图片ZIP
 */
export async function exportWithImages(req, res, next) {
    try {
        const { id: projectId } = req.params;

        // 获取项目名称
        const project = await reimbursementService.getProjectById(projectId);

        const projectName = resolveReimbursementExportName(project);
        const exportDate = new Date().toISOString().slice(0, 10);

        // 生成ZIP
        const zipBuffer = await previewService.generateExportZip(projectId, projectName);

        // 设置响应头
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(`${projectName}_${exportDate}.zip`)}`
        );
        res.send(zipBuffer);
    } catch (error) {
        console.error('导出失败:', error);
        next(error);
    }
}

/**
 * 获取项目设置
 */
async function getProjectSettings(projectId) {
    return reimbursementService.getProjectUserSettings(projectId);
}
