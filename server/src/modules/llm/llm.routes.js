import express from 'express';
import multer from 'multer';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { parsePdfTemplate, generateMarathonData, cleanupTempFiles } from './llm.service.js';

const router = express.Router();

// Multer 配置：仅接受 PDF，最大 50MB
const upload = multer({
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('仅支持 PDF 文件'));
    },
});

// 内存缓存已上传的 PDF 解析结果（简易方案，生产可改用 Redis）
const templateCache = new Map();

/**
 * POST /api/llm/upload-template
 * 上传 PDF 报告模板，提取文本和章节结构
 */
router.post('/upload-template', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '请上传 PDF 文件' });
        }

        const result = await parsePdfTemplate(req.file.buffer);
        const templateId = `tpl_${Date.now()}`;

        // 缓存完整文本（用于后续 LLM 调用）
        templateCache.set(templateId, {
            fullText: result.fullText,
            fileName: req.file.originalname,
            uploadedAt: new Date().toISOString(),
        });

        // 1小时后自动清理
        setTimeout(() => templateCache.delete(templateId), 3600_000);

        res.json({
            success: true,
            data: {
                templateId,
                fileName: req.file.originalname,
                totalPages: result.totalPages,
                totalChars: result.totalChars,
                sectionCount: result.sections.length,
                sections: result.sections.map(s => ({
                    index: s.index,
                    title: s.title,
                    contentPreview: s.contentPreview,
                    contentLength: s.contentLength,
                })),
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/llm/generate-marathon-data
 * SSE 流式生成报告数据 + Word 文档
 * Body: { year, model, templateId }
 */
router.post('/generate-marathon-data', async (req, res) => {
    const { year, model, templateId } = req.body;

    if (!year || typeof year !== 'number' || year < 2006 || year > 2025) {
        return res.status(400).json({ success: false, error: '年份参数无效（2006–2025）' });
    }

    if (!templateId || !templateCache.has(templateId)) {
        return res.status(400).json({ success: false, error: '请先上传 PDF 模板' });
    }

    const template = templateCache.get(templateId);
    const validModels = ['glm-5', 'kimi-k2.5', 'MiniMax-M2.5', 'qwen-max', 'qwen-plus'];
    const selectedModel = validModels.includes(model) ? model : 'qwen-max';

    const useSSE = req.query.stream === 'true' || req.headers.accept === 'text/event-stream';

    if (useSSE) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });

        const sendEvent = (type, data) => {
            res.write(`event: ${type}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);

        try {
            const result = await generateMarathonData(year, selectedModel, template.fullText, (stage, data) => {
                if (typeof stage === 'string' && !data) {
                    sendEvent('progress', { message: stage });
                } else {
                    sendEvent(stage, { message: `${stage}`, data: typeof data === 'object' ? data : undefined });
                }
            });

            // 不在 SSE 里传 filePath（安全），只传 fileName
            sendEvent('result', {
                success: true,
                data: {
                    ...result,
                    word_file: { fileName: result.word_file.fileName },
                },
            });
        } catch (err) {
            sendEvent('error', { success: false, error: err.message });
        } finally {
            clearInterval(heartbeat);
            res.end();
        }
    } else {
        try {
            const result = await generateMarathonData(year, selectedModel, template.fullText);
            res.json({
                success: true,
                data: {
                    ...result,
                    word_file: { fileName: result.word_file.fileName },
                },
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
});

/**
 * GET /api/llm/download/:fileName
 * 下载生成的 Word 文档
 */
router.get('/download/:fileName', async (req, res) => {
    try {
        const fileName = req.params.fileName;
        // 安全检查：只允许下载我们自己生成的文件名格式
        if (!fileName.endsWith('.docx') || fileName.includes('..') || fileName.includes('/')) {
            return res.status(400).json({ success: false, error: '文件名无效' });
        }

        const tempDir = join(process.cwd(), 'uploads', 'llm-temp');
        const filePath = join(tempDir, fileName);
        const buffer = await readFile(filePath);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.send(buffer);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return res.status(404).json({ success: false, error: '文件不存在或已过期' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// 每小时清理临时文件
setInterval(() => cleanupTempFiles().catch(() => { }), 3600_000);

export default router;
