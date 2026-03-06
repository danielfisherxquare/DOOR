/**
 * Tools Controller — 公开的工具相关 API
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 安装包存放目录
const UPLOADS_DIR = path.resolve(__dirname, '../../../uploads/apps');
const APP_FILENAME = '管理器.exe';

/**
 * GET /api/tools/download-app
 * 下载打包好的客户端安装包
 */
export async function downloadApp(req, res, next) {
    try {
        const filePath = path.join(UPLOADS_DIR, APP_FILENAME);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: '安装包尚未上传，请联系管理员',
            });
        }

        // 获取文件大小信息
        const stat = fs.statSync(filePath);

        res.set({
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(APP_FILENAME)}`,
            'Content-Length': stat.size,
            'Content-Type': 'application/octet-stream',
        });

        res.download(filePath, APP_FILENAME, (err) => {
            if (err && !res.headersSent) {
                next(err);
            }
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/tools/app-info
 * 获取客户端安装包的信息（是否可下载、文件大小等）
 */
export async function getAppInfo(req, res, next) {
    try {
        const filePath = path.join(UPLOADS_DIR, APP_FILENAME);

        if (!fs.existsSync(filePath)) {
            return res.json({
                success: true,
                data: {
                    available: false,
                    filename: APP_FILENAME,
                    size: 0,
                    updatedAt: null,
                },
            });
        }

        const stat = fs.statSync(filePath);

        res.json({
            success: true,
            data: {
                available: true,
                filename: APP_FILENAME,
                size: stat.size,
                updatedAt: stat.mtime.toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
}
