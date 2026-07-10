/**
 * Reimbursement OCR Service
 * 发票报销OCR识别服务
 * 移植自 tool/src/components/utilities/reimbursement/ocrApi.ts
 */

import axios from 'axios';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import {
    assertSafeOcrBaseUrl,
    createSafeOcrHttpsAgent,
} from '../ocr/ocr-url-policy.js';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const MAX_PDF_RENDER_PAGES = 5;
const PDF_RENDER_SCALE = 200 / 72;
const JPEG_MIME_TYPE = 'image/jpeg';
const VISION_MAX_IMAGE_EDGE = 1800;
const VISION_JPEG_QUALITY = 82;
const OCR_MAX_COMPLETION_TOKENS = 700;
const PAYMENT_OCR_MAX_COMPLETION_TOKENS = 260;
const RAILWAY_OCR_MAX_COMPLETION_TOKENS = 420;
const execFileAsync = promisify(execFile);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_PDF_RENDER_SCRIPT = path.resolve(currentDir, '../../..', 'scripts', 'render_pdf_pages.py');
const PDFJS_CMAP_DIR = path.resolve(currentDir, '../../..', 'node_modules', 'pdfjs-dist', 'cmaps');
const PDFJS_STANDARD_FONT_DIR = path.resolve(currentDir, '../../..', 'node_modules', 'pdfjs-dist', 'standard_fonts');

// ==================== 金额解析启发式规则 ====================

export const asTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '');

export const parseAmountValue = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== 'string') return null;

    const normalized = value.replace(/,/g, '').replace(/[^\d.-]/g, '');
    if (!normalized) return null;

    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
};

export const pickFirstString = (...values) => {
    for (const value of values) {
        const text = asTrimmedString(value);
        if (text) return text;
    }
    return '';
};

export const pickFirstAmount = (...values) => {
    for (const value of values) {
        const amount = parseAmountValue(value);
        if (amount != null) return amount;
    }
    return null;
};

const isPdfUpload = ({ mimeType, filename }) =>
    mimeType === 'application/pdf' || String(filename || '').toLowerCase().endsWith('.pdf');

const looksRailwayUpload = (filename) => {
    const text = String(filename || '').toLowerCase();
    return /铁路|高铁|火车|客票|动车|train|railway|ticket/.test(text);
};

const getPdfRenderPageNumbers = (numPages, maxPages = MAX_PDF_RENDER_PAGES) => {
    if (!Number.isInteger(numPages) || numPages <= 0) {
        throw new Error(`Invalid PDF page count: ${numPages}`);
    }

    const renderPageCount = Math.min(numPages, maxPages);
    return Array.from({ length: renderPageCount }, (_, index) => index + 1);
};

const createNodeCanvasFactory = () => ({
    create(width, height) {
        const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
        const context = canvas.getContext('2d');
        return { canvas, context };
    },
    reset(canvasAndContext, width, height) {
        const target = canvasAndContext;
        target.canvas.width = Math.ceil(width);
        target.canvas.height = Math.ceil(height);
    },
    destroy(canvasAndContext) {
        const target = canvasAndContext;
        target.canvas.width = 0;
        target.canvas.height = 0;
        target.canvas = null;
        target.context = null;
    },
});

const readRenderedPageBuffers = async (outputDir) => {
    const entries = await fs.readdir(outputDir);
    const pageFiles = entries
        .filter((name) => /^page_\d+\.jpg$/i.test(name))
        .sort((left, right) => {
            const leftNumber = Number(left.match(/\d+/)?.[0] || 0);
            const rightNumber = Number(right.match(/\d+/)?.[0] || 0);
            return leftNumber - rightNumber;
        });

    return Promise.all(pageFiles.map((name) => fs.readFile(path.join(outputDir, name))));
};

const renderPdfToImageBuffersWithPython = async (fileBuffer) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'door-pdf-render-'));
    const inputPath = path.join(tempDir, 'input.pdf');
    const outputDir = path.join(tempDir, 'pages');

    try {
        await fs.writeFile(inputPath, fileBuffer);
        await execFileAsync('python', [
            PYTHON_PDF_RENDER_SCRIPT,
            inputPath,
            outputDir,
            String(PDF_RENDER_SCALE),
            String(MAX_PDF_RENDER_PAGES),
        ], {
            windowsHide: true,
        });

        const pageBuffers = await readRenderedPageBuffers(outputDir);
        if (!pageBuffers.length) {
            throw new Error('Python 渲染器没有输出任何页面');
        }

        return pageBuffers;
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
};

const renderPdfToImageBuffersWithPdfJs = async (fileBuffer) => {
    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(fileBuffer),
        disableWorker: true,
        isEvalSupported: false,
        useSystemFonts: true,
        cMapUrl: `${PDFJS_CMAP_DIR}${path.sep}`,
        cMapPacked: true,
        standardFontDataUrl: `${PDFJS_STANDARD_FONT_DIR}${path.sep}`,
    });

    const pdf = await loadingTask.promise;

    try {
        const pageNumbers = getPdfRenderPageNumbers(pdf.numPages);
        const imageBuffers = [];

        for (const pageNumber of pageNumbers) {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
            const canvasFactory = createNodeCanvasFactory();
            const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
            const { canvas, context } = canvasAndContext;

            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({
                canvasContext: context,
                viewport,
                canvasFactory,
            }).promise;

            imageBuffers.push(canvas.toBuffer(JPEG_MIME_TYPE, 92));
            page.cleanup();
            canvasFactory.destroy(canvasAndContext);
        }

        return imageBuffers;
    } catch (error) {
        throw new Error(`PDF 转图片失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        await pdf.destroy();
        loadingTask.destroy();
    }
};

const renderPdfToImageBuffers = async (fileBuffer) => {
    try {
        return await renderPdfToImageBuffersWithPython(fileBuffer);
    } catch (pythonError) {
        console.warn('[reimbursement] Python PDF renderer failed, fallback to pdfjs:', pythonError instanceof Error ? pythonError.message : pythonError);
        return renderPdfToImageBuffersWithPdfJs(fileBuffer);
    }
};

const roundCurrency = (value) => Math.round(value * 100) / 100;

export function resolveInvoiceAmounts(raw) {
    const taxInclusiveAmount = pickFirstAmount(
        raw.priceTaxTotalLower,
        raw.priceTaxTotal,
        raw.totalWithTax,
        raw.amountWithTax,
        raw.taxInclusiveAmount,
        raw.taxInclusiveTotal,
        raw.invoiceTotal,
        raw.grandTotal,
    );

    const taxAmount = pickFirstAmount(
        raw.taxAmount,
        raw.tax,
        raw.totalTax,
    );

    const lineAmount = pickFirstAmount(
        raw.lineAmount,
        raw.itemAmount,
        raw.amountExcludingTax,
        raw.netAmount,
        raw.amount,
        raw.totalAmount,
        raw.fareAmount,
        raw.ticketPrice,
        raw.price,
    );

    const unitPrice = pickFirstAmount(
        raw.unitPrice,
        raw.itemUnitPrice,
        raw.pricePerUnit,
    );

    const normalizedQuantity = pickFirstAmount(raw.quantity);
    const quantity = normalizedQuantity != null && normalizedQuantity > 0 ? normalizedQuantity : 1;

    const amount = taxInclusiveAmount
        ?? (lineAmount != null && taxAmount != null ? roundCurrency(lineAmount + taxAmount) : lineAmount);

    // 所有金额取绝对值，确保存储为正数
    return {
        amount: amount != null ? Math.abs(amount) : null,
        unitPrice: unitPrice != null ? Math.abs(unitPrice) : null,
        quantity,
        taxAmount: taxAmount != null ? Math.abs(taxAmount) : null,
        lineAmount: lineAmount != null ? Math.abs(lineAmount) : null,
    };
}

// ==================== 发票识别Prompt ====================

const INVOICE_PROMPT_V2 = `You are reading one invoice session. The request may contain 1 to 5 images.
All images belong to the same invoice document. Combine information across all images and return ONE JSON object only.

Important rules:
- For standard Chinese mainland VAT/electronic invoices, "amount" must be the tax-inclusive total from "价税合计(小写)". Never use the line-item "单价" or "金额" column as the reimbursement amount when a tax-inclusive total is present.
- If both line amount and tax amount are visible, prefer their tax-inclusive total. If "价税合计(小写)" is visible, it has the highest priority.
- Prefer the true reimbursement amount field. For railway e-ticket invoices, amount should come from "票价", "票价合计", or the fare area, not from invoice code numbers.
- ALL numeric amounts (amount, unitPrice, lineAmount, taxAmount) MUST be positive numbers. Never return negative values. If the invoice shows a credit note or negative amount, still return the absolute value as a positive number.
- For railway e-ticket invoices, the useful reimbursement date is usually the travel date shown in the ticket body. Do not prefer the top-right issue date when the travel date is available.
- If the invoice title or body indicates "电子发票（铁路电子客票）", "铁路电子客票", "火车票", or similar railway ticket wording, set "subCategory" to "高铁费".
- For railway e-ticket invoices, focus on these key fields:
  1. invoice type/title area near the top center
  2. travel date in the ticket body
  3. fare amount near "票价"
  4. seat class near "一等座/二等座/商务座"
- For railway e-ticket invoices, build "details" from route + train number + seat class when possible, such as "江油-成都东 C6315 一等座".
- Extract buyer/company from the purchaser area, including "购买方名称" when present.
- Return pure JSON only. Do not wrap with markdown.

Return JSON only:
{
  "amount": "number (always positive), for common mainland invoices this must be 价税合计(小写)",
  "date": "string",
  "invoiceNumber": "string, 发票号码，通常在发票右上角，纸质发票8位数字，数电发票20位数字",
  "invoiceCode": "string or null, 发票代码，通常在发票号码上方，10-12位数字。数电发票可能没有此字段",
  "buyer": "string",
  "details": "string",
  "subCategory": "must choose the best fit from: 备用金收入、打车费、高速费、高铁费、机票费、停车费、加油费、租车费、托运费、餐费、住宿费、保险费、物资采购费、快递费、劳务费、印刷费、租赁费、运输费、备用金支出、其他费用",
  "category": "string",
  "unitPrice": "number or null (always positive), only from the line-item 单价 column, never copied from 价税合计",
  "lineAmount": "number or null (always positive), optional line-item amount before tax",
  "taxAmount": "number or null (always positive), optional tax amount",
  "unit": "string or null",
  "quantity": "number or null",
  "targetName": "same as buyer when useful for matching"
}`;

const RAILWAY_INVOICE_PROMPT = `You are reading one railway e-ticket invoice session. The request may contain 1 to 5 ordered page images of the same document.
Extract the reimbursement-critical fields and return ONE JSON object only.

Focus on these fields:
- "amount": extract the fare from "票价" or the fare amount area. Return a positive number only. Never return negative values.
- "date": extract the travel date in the ticket body, such as "2026年03月01日". Use this instead of the issue date when both exist.
- "buyer": extract the purchaser company or buyer name, including "购买方名称" if present.
- "details": combine route + train number + seat class, such as "江油-成都东 C6315 一等座".
- "subCategory": always "高铁费".
- "category": use "交通费" unless the document clearly indicates a different higher-level category.
- "targetName": same as buyer.

If a field cannot be found, return null for that field.
Return pure JSON only:
{
  "amount": null,
  "date": null,
  "buyer": null,
  "details": null,
  "subCategory": "高铁费",
  "category": "交通费",
  "unitPrice": null,
  "unit": null,
  "quantity": null,
  "targetName": null
}`;

const PAYMENT_PROMPT_V2 = `You are reading one payment proof session. The request may contain 1 to 5 images.
All images belong to the same payment proof. Combine information across all images and return ONE JSON object only.

Important: "amount" MUST be a positive number. Never return negative values.

Return JSON only:
{
  "amount": null,
  "date": null,
  "payee": null,
  "category": "infer a category name from the payment context, such as '交通费', '餐费', '住宿费', etc.",
  "targetName": "extract the payee or receiver name to help match invoices"
}`;

// ==================== 铁路发票检测 ====================

const buildRailwayDetails = (data) => {
    const fromStation = pickFirstString(data.fromStation, data.departureStation, data.routeFrom, data.from);
    const toStation = pickFirstString(data.toStation, data.arrivalStation, data.routeTo, data.to);
    const trainNumber = pickFirstString(data.trainNumber, data.trainNo, data.tripNumber);
    const seatClass = pickFirstString(data.seatClass, data.seatType, data.seat);

    const route = fromStation && toStation ? `${fromStation}-${toStation}` : '';
    return [route, trainNumber, seatClass].filter(Boolean).join(' ');
};

const isRailwayLike = (data) => {
    const fields = [
        data.invoiceType,
        data.title,
        data.subCategory,
        data.category,
        data.details,
        data.trainNumber,
        data.seatClass,
    ]
        .map((value) => asTrimmedString(value).toLowerCase())
        .join(' ');

    return (
        fields.includes('铁路') ||
        fields.includes('火车') ||
        fields.includes('高铁') ||
        fields.includes('railway') ||
        fields.includes('train')
    );
};

// ==================== 数据标准化 ====================

const normalizeInvoiceData = (raw) => {
    const { amount, unitPrice, quantity, taxAmount, lineAmount } = resolveInvoiceAmounts(raw);
    const buyer = pickFirstString(raw.buyer, raw.targetName, raw.purchaserName, raw.companyName);
    const details = pickFirstString(raw.details, buildRailwayDetails(raw), raw.summary);

    let subCategory = pickFirstString(raw.subCategory);
    if (!subCategory && isRailwayLike(raw)) {
        subCategory = '高铁费';
    }

    let category = pickFirstString(raw.category);
    if (!category && subCategory === '高铁费') {
        category = '交通费';
    }

    // 发票号码提取 - 支持多种字段名
    const invoiceNumber = pickFirstString(
        raw.invoiceNumber,
        raw.invoiceNum,
        raw.invoice_number,
        raw.number,
        raw.InvoiceNum,
        raw.invoiceNo
    );

    // 发票代码提取 - 支持多种字段名
    const invoiceCode = pickFirstString(
        raw.invoiceCode,
        raw.invoice_code,
        raw.code,
        raw.InvoiceCode,
        raw.invoiceTypeCode
    );

    return {
        ...raw,
        amount: amount ?? raw.amount ?? null,
        date: pickFirstString(raw.date, raw.travelDate, raw.rideDate, raw.tripDate, raw.invoiceDate),
        invoiceNumber,
        invoiceCode,
        buyer,
        details,
        subCategory,
        category,
        unitPrice: unitPrice ?? null,
        lineAmount: lineAmount ?? raw.lineAmount ?? null,
        taxAmount: taxAmount ?? raw.taxAmount ?? null,
        unit: pickFirstString(raw.unit) || '项',
        quantity,
        targetName: pickFirstString(raw.targetName, buyer),
    };
};

const mergeInvoiceData = (primary, fallback) => {
    const merged = { ...fallback, ...primary };
    const keys = ['amount', 'date', 'buyer', 'details', 'subCategory', 'category', 'targetName', 'unitPrice', 'unit', 'quantity'];

    for (const key of keys) {
        const primaryValue = primary[key];
        const fallbackValue = fallback[key];
        const useFallback =
            primaryValue == null ||
            (typeof primaryValue === 'string' && !primaryValue.trim());
        if (useFallback && fallbackValue != null && (!(typeof fallbackValue === 'string') || fallbackValue.trim())) {
            merged[key] = fallbackValue;
        }
    }

    return merged;
};

const shouldRetryInvoiceExtraction = (data) => {
    const amount = parseAmountValue(data.amount);
    const date = asTrimmedString(data.date);
    const buyer = pickFirstString(data.buyer, data.targetName);
    const details = asTrimmedString(data.details);
    return amount == null || !date || !buyer || !details;
};

const shouldRetryWithRailwayPrompt = (data, filename) =>
    shouldRetryInvoiceExtraction(data) && (isRailwayLike(data) || looksRailwayUpload(filename));

const normalizePaymentData = (raw) => ({
    ...raw,
    amount: pickFirstAmount(raw.amount, raw.totalAmount, raw.paymentAmount) ?? raw.amount ?? null,
    date: pickFirstString(raw.date, raw.paymentDate, raw.transferDate),
    payee: pickFirstString(raw.payee, raw.targetName, raw.receiver, raw.merchant),
    type: pickFirstString(raw.type, raw.paymentType),
    targetName: pickFirstString(raw.targetName, raw.payee, raw.receiver, raw.merchant),
});

const summarizeImageOptimization = (items = []) => {
    const normalizedItems = items.filter(Boolean);
    const summary = normalizedItems.reduce((acc, item) => {
        acc.imageCount += 1;
        acc.originalBytes += Number(item.originalBytes) || 0;
        acc.optimizedBytes += Number(item.optimizedBytes) || 0;
        return acc;
    }, {
        imageCount: 0,
        originalBytes: 0,
        optimizedBytes: 0,
    });

    summary.savedBytes = Math.max(0, summary.originalBytes - summary.optimizedBytes);
    summary.savedRatio = summary.originalBytes > 0
        ? Math.round((summary.savedBytes / summary.originalBytes) * 10000) / 10000
        : 0;

    return summary;
};

const normalizeImageForVision = async (buffer, mimeType = JPEG_MIME_TYPE) => {
    try {
        const optimized = await sharp(buffer, { failOn: 'none' })
            .rotate()
            .resize({
                width: VISION_MAX_IMAGE_EDGE,
                height: VISION_MAX_IMAGE_EDGE,
                fit: 'inside',
                withoutEnlargement: true,
            })
            .jpeg({
                quality: VISION_JPEG_QUALITY,
                mozjpeg: true,
            })
            .toBuffer();

        return {
            buffer: optimized,
            mimeType: JPEG_MIME_TYPE,
            optimization: {
                originalBytes: buffer.length,
                optimizedBytes: optimized.length,
                savedBytes: Math.max(0, buffer.length - optimized.length),
                originalMimeType: mimeType || JPEG_MIME_TYPE,
                optimizedMimeType: JPEG_MIME_TYPE,
            },
        };
    } catch (error) {
        console.warn('[reimbursement] image optimization failed, using original upload:', error instanceof Error ? error.message : error);
        return {
            buffer,
            mimeType: mimeType || JPEG_MIME_TYPE,
            optimization: {
                originalBytes: buffer.length,
                optimizedBytes: buffer.length,
                savedBytes: 0,
                originalMimeType: mimeType || JPEG_MIME_TYPE,
                optimizedMimeType: mimeType || JPEG_MIME_TYPE,
            },
        };
    }
};

const toVisionImageInput = async (buffer, mimeType = JPEG_MIME_TYPE) => {
    const image = await normalizeImageForVision(buffer, mimeType);
    return {
        url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}`,
        optimization: image.optimization,
    };
};

const toVisionImageInputs = async (imageBuffers) =>
    Promise.all(imageBuffers.map((buffer) => toVisionImageInput(buffer, JPEG_MIME_TYPE)));

// ==================== LLM调用 ====================

const toNonNegativeInteger = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : undefined;
};

const normalizeUsage = (usage = {}) => {
    const promptTokens = toNonNegativeInteger(
        usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? usage.inputTokens
    );
    const completionTokens = toNonNegativeInteger(
        usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? usage.outputTokens
    );
    const totalTokens = toNonNegativeInteger(
        usage.total_tokens ?? usage.totalTokens ?? usage.total
    ) ?? (promptTokens != null && completionTokens != null ? promptTokens + completionTokens : undefined);

    return {
        ...(promptTokens != null ? { promptTokens } : {}),
        ...(completionTokens != null ? { completionTokens } : {}),
        ...(totalTokens != null ? { totalTokens } : {}),
    };
};

const sumUsage = (calls) => calls.reduce((acc, call) => {
    const usage = call?.usage || {};
    for (const key of ['promptTokens', 'completionTokens', 'totalTokens']) {
        if (usage[key] == null) continue;
        acc[key] = (acc[key] || 0) + Number(usage[key]);
    }
    return acc;
}, {});

const buildOcrMeta = (calls) => {
    const normalizedCalls = calls.filter(Boolean);
    const imageOptimization = summarizeImageOptimization(
        normalizedCalls.map((call) => call.imageOptimization).filter(Boolean)
    );
    return {
        modelCallCount: normalizedCalls.length,
        durationMs: normalizedCalls.reduce((sum, call) => sum + (Number(call.durationMs) || 0), 0),
        usage: sumUsage(normalizedCalls),
        ...(imageOptimization.imageCount > 0 ? { imageOptimization } : {}),
        calls: normalizedCalls,
    };
};

const createOcrError = (message, status = 502, extra = {}) => {
    const error = new Error(message);
    error.status = status;
    error.expose = true;
    return Object.assign(error, extra);
};

const parseJsonSnippet = (text, openChar, closeChar) => {
    const start = text.indexOf(openChar);
    const end = text.lastIndexOf(closeChar);

    if (start === -1 || end === -1 || end <= start) {
        return null;
    }

    return text.slice(start, end + 1);
};

const parseJsonOutput = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        try {
            const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (match?.[1]) return JSON.parse(match[1]);
        } catch (innerErr) {
            console.error('Inner JSON parse error:', innerErr);
        }

        for (const [openChar, closeChar] of [['{', '}'], ['[', ']']]) {
            const snippet = parseJsonSnippet(text, openChar, closeChar);
            if (!snippet) continue;

            try {
                return JSON.parse(snippet);
            } catch {
                // Continue trying other shapes before raising a user-facing OCR error.
            }
        }

        throw createOcrError('OCR 模型返回了无法解析的内容，请重试');
    }
};

const callVisionLLM = async (
    config,
    prompt,
    imageInputs,
    callType = 'vision',
    maxCompletionTokens = OCR_MAX_COMPLETION_TOKENS
) => {
    const startedAt = Date.now();
    const normalizedImageInputs = imageInputs.map((input) => (
        typeof input === 'string' ? { url: input, optimization: null } : input
    ));
    const contentPayload = [
        { type: 'text', text: `${prompt}\nPage count: ${normalizedImageInputs.length}. Images are ordered from page 1 to page ${normalizedImageInputs.length}.` }
    ];
    normalizedImageInputs.forEach((image, index) => {
        contentPayload.push({ type: 'text', text: `Page ${index + 1}` });
        contentPayload.push({ type: 'image_url', image_url: { url: image.url } });
    });
    const imageOptimization = summarizeImageOptimization(
        normalizedImageInputs.map((image) => image.optimization).filter(Boolean)
    );

    const payload = {
        model: config.modelName || 'qwen3.5-plus',
        messages: [
            {
                role: 'user',
                content: contentPayload,
            },
        ],
        temperature: 0.1,
        max_tokens: maxCompletionTokens,
    };

    const apiUrl = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    try {
        const response = await axios.post(apiUrl, payload, {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 600000,
            httpsAgent: createSafeOcrHttpsAgent(),
            proxy: false,
        });

        const durationMs = Date.now() - startedAt;
        const message = response.data?.choices?.[0]?.message;
        // 推理模型（如 Qwen3.6-27B、DeepSeek-R1）将思考过程放在 reasoning_content，
        // 而最终回答在 content。当 content 为空时，尝试从 reasoning_content 中提取 JSON。
        let text = message?.content || '';
        if (!text.trim() && message?.reasoning_content) {
            text = message.reasoning_content;
        }
        return {
            data: parseJsonOutput(text),
            meta: {
                callType,
                model: response.data?.model || config.modelName || 'qwen3.5-plus',
                imageCount: normalizedImageInputs.length,
                durationMs,
                usage: normalizeUsage(response.data?.usage),
                ...(imageOptimization.imageCount > 0 ? { imageOptimization } : {}),
            },
        };
    } catch (error) {
        if (error?.status && error?.expose) {
            throw error;
        }

        if (axios.isAxiosError(error)) {
            const upstreamStatus = error.response?.status;
            const upstreamMessage =
                error.response?.data?.error?.message ||
                error.response?.data?.message ||
                error.message;

            if (upstreamStatus === 429) {
                throw createOcrError('OCR 服务当前限流，请稍后重试', 429, {
                    upstreamStatus,
                });
            }

            if (upstreamStatus === 401 || upstreamStatus === 403) {
                throw createOcrError('OCR 模型鉴权失败，请检查 API Key 或服务地址配置', 502, {
                    upstreamStatus,
                });
            }

            if (error.code === 'ECONNABORTED') {
                throw createOcrError('OCR 服务响应超时，请稍后重试', 504, {
                    upstreamStatus,
                });
            }

            throw createOcrError(`OCR 服务调用失败: ${upstreamMessage}`, 502, {
                upstreamStatus,
            });
        }

        throw createOcrError(error instanceof Error ? error.message : 'OCR 识别失败');
    }
};

// ==================== 导出函数 ====================

/**
 * 处理发票OCR识别
 * @param {Object} params
 * @param {Buffer} params.fileBuffer - 文件Buffer
 * @param {string} params.mimeType - MIME类型
 * @param {Object} params.config - LLM配置 { baseUrl, apiKey, modelName, provider }
 * @returns {Promise<Object>}
 */
export async function processInvoice({ fileBuffer, mimeType, filename, config }) {
    config = { ...config, baseUrl: await assertSafeOcrBaseUrl(config?.baseUrl) };
    if (isPdfUpload({ mimeType, filename })) {
        const imageBuffers = await renderPdfToImageBuffers(fileBuffer);
        return processMultiPageInvoice({ imageBuffers, config, filename });
    }

    const imageInput = await toVisionImageInput(fileBuffer, mimeType);

    // 第一轮：通用发票Prompt
    const firstCall = await callVisionLLM(config, INVOICE_PROMPT_V2, [imageInput], 'invoice_general');
    const firstPass = normalizeInvoiceData(firstCall.data);
    const calls = [firstCall.meta];

    // 如果数据不完整，使用铁路专用Prompt重试
    if (shouldRetryWithRailwayPrompt(firstPass, filename)) {
        const secondCall = await callVisionLLM(
            config,
            RAILWAY_INVOICE_PROMPT,
            [imageInput],
            'invoice_railway_retry',
            RAILWAY_OCR_MAX_COMPLETION_TOKENS
        );
        const secondPass = normalizeInvoiceData(secondCall.data);
        calls.push(secondCall.meta);
        return { success: true, data: mergeInvoiceData(firstPass, secondPass), meta: buildOcrMeta(calls) };
    }

    return { success: true, data: firstPass, meta: buildOcrMeta(calls) };
}

/**
 * 处理付款凭证OCR识别
 * @param {Object} params
 * @param {Buffer} params.fileBuffer - 文件Buffer
 * @param {string} params.mimeType - MIME类型
 * @param {Object} params.config - LLM配置
 * @returns {Promise<Object>}
 */
export async function processPayment({ fileBuffer, mimeType, filename, config }) {
    config = { ...config, baseUrl: await assertSafeOcrBaseUrl(config?.baseUrl) };
    if (isPdfUpload({ mimeType, filename })) {
        const imageBuffers = await renderPdfToImageBuffers(fileBuffer);
        return processMultiPagePayment({ imageBuffers, config });
    }

    const imageInput = await toVisionImageInput(fileBuffer, mimeType);

    const call = await callVisionLLM(
        config,
        PAYMENT_PROMPT_V2,
        [imageInput],
        'payment',
        PAYMENT_OCR_MAX_COMPLETION_TOKENS
    );
    const data = normalizePaymentData(call.data);
    return { success: true, data, meta: buildOcrMeta([call.meta]) };
}

/**
 * 处理多页PDF发票
 * @param {Object} params
 * @param {Buffer[]} params.imageBuffers - PDF页面图片Buffer数组
 * @param {Object} params.config - LLM配置
 * @returns {Promise<Object>}
 */
export async function processMultiPageInvoice({ imageBuffers, config, filename }) {
    const imageInputs = await toVisionImageInputs(imageBuffers);

    const firstCall = await callVisionLLM(config, INVOICE_PROMPT_V2, imageInputs, 'invoice_general');
    const firstPass = normalizeInvoiceData(firstCall.data);
    const calls = [firstCall.meta];

    if (shouldRetryWithRailwayPrompt(firstPass, filename)) {
        const secondCall = await callVisionLLM(
            config,
            RAILWAY_INVOICE_PROMPT,
            imageInputs,
            'invoice_railway_retry',
            RAILWAY_OCR_MAX_COMPLETION_TOKENS
        );
        const secondPass = normalizeInvoiceData(secondCall.data);
        calls.push(secondCall.meta);
        return { success: true, data: mergeInvoiceData(firstPass, secondPass), meta: buildOcrMeta(calls) };
    }

    return { success: true, data: firstPass, meta: buildOcrMeta(calls) };
}

/**
 * 处理多页PDF付款凭证
 * @param {Object} params
 * @param {Buffer[]} params.imageBuffers - PDF页面图片Buffer数组
 * @param {Object} params.config - LLM配置
 * @returns {Promise<Object>}
 */
export async function processMultiPagePayment({ imageBuffers, config }) {
    const imageInputs = await toVisionImageInputs(imageBuffers);
    const call = await callVisionLLM(
        config,
        PAYMENT_PROMPT_V2,
        imageInputs,
        'payment',
        PAYMENT_OCR_MAX_COMPLETION_TOKENS
    );
    const data = normalizePaymentData(call.data);
    return { success: true, data, meta: buildOcrMeta([call.meta]) };
}

// ==================== 导出供 invoice.processor.js 使用 ====================

/**
 * 渲染 PDF 为图片 Buffers
 * @param {Buffer} fileBuffer - PDF 文件 Buffer
 * @returns {Promise<Buffer[]>} 图片 Buffer 数组
 */
export { renderPdfToImageBuffers };
