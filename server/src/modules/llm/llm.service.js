/**
 * LLM Service — 马拉松赛事经济评估报告 AI 数据生成
 *
 * v4 工作流：
 *  1. 用户上传 PDF → parsePdfTemplate() 提取全文和章节结构
 *  2. 联网搜索目标年份真实数据（qwen-max）
 *  3. 基于 PDF 原文 + 搜索事实推算目标年份内容（用户选定模型）
 *  4. 程序化生成 Word 文档
 */

import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import {
    Document, Packer, Paragraph, TextRun,
    HeadingLevel, AlignmentType, Table, TableRow, TableCell,
    WidthType, BorderStyle,
} from 'docx';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1';
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const SEARCH_MODEL = 'qwen-max';
const TEMP_DIR = join(process.cwd(), 'uploads', 'llm-temp');

// 已知历史数据锚点
const HISTORICAL_ANCHORS = `
已知南宁马拉松历史数据（官方公开信息）：
- 2019年：第14届，参赛2.8万人，升级为WMM年龄组资格赛
- 2020年：受新冠疫情影响可能停办
- 2021年：计划3万人，受疫情影响不确定
- 2022年：受疫情影响不确定
- 2023年：第15届，参赛3万人，报名6.1万人
- 2024年：第16届，参赛3万人，报名8.03万人，中签率37.37%
- 2025年：第17届，参赛3.6万人
`.trim();

// ------------------------------------------------------------------
// PDF 解析
// ------------------------------------------------------------------

/**
 * 从 PDF Buffer 中提取全文和章节结构
 */
export async function parsePdfTemplate(buffer) {
    const data = await pdfParse(buffer);

    const fullText = data.text;
    const totalPages = data.numpages;

    // 按常见中文报告章节标题模式拆分
    const sectionPattern = /^[\s]*(第[一二三四五六七八九十百千]+[章节部分篇]|[一二三四五六七八九十]+[、.．]|[\d]+[、.．]\s*[^\n]{2,}|[（(]\s*[一二三四五六七八九十\d]+\s*[)）])/gm;

    const sections = [];
    let lastIndex = 0;
    let lastTitle = '封面与概述';
    let match;

    const text = fullText;
    const regex = new RegExp(sectionPattern.source, 'gm');

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            sections.push({
                title: lastTitle.trim(),
                content: text.substring(lastIndex, match.index).trim(),
            });
        }
        lastTitle = match[0];
        lastIndex = match.index + match[0].length;
    }

    // 最后一段
    if (lastIndex < text.length) {
        sections.push({
            title: lastTitle.trim(),
            content: text.substring(lastIndex).trim(),
        });
    }

    // 如果没拆出章节，就把全文当一个大块
    if (sections.length === 0) {
        sections.push({ title: '完整报告', content: fullText.trim() });
    }

    return {
        fullText,
        totalPages,
        totalChars: fullText.length,
        sections: sections.map((s, i) => ({
            index: i,
            title: s.title,
            contentPreview: s.content.substring(0, 200) + (s.content.length > 200 ? '...' : ''),
            contentLength: s.content.length,
            fullContent: s.content,
        })),
    };
}

// ------------------------------------------------------------------
// DashScope API 调用
// ------------------------------------------------------------------

async function callDashScope(model, messages, enableSearch = false) {
    if (!DASHSCOPE_API_KEY) {
        throw new Error('DASHSCOPE_API_KEY 未配置，请在 .env 文件中设置');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
        const body = { model, messages, temperature: 0.3 };
        if (enableSearch) {
            body.enable_search = true;
            body.search_options = { forced_search: true };
        }

        const res = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => 'unknown');
            throw new Error(`DashScope API ${res.status}: ${errText}`);
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('DashScope API 返回空内容');
        return content;
    } finally {
        clearTimeout(timeout);
    }
}

function extractJSON(raw) {
    try { return JSON.parse(raw); } catch { /* continue */ }
    const codeBlock = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlock) { try { return JSON.parse(codeBlock[1].trim()); } catch { /* continue */ } }
    const brace = raw.match(/\{[\s\S]*\}/);
    if (brace) { try { return JSON.parse(brace[0]); } catch { /* continue */ } }
    // 返回原始文本包装
    return { raw_text: raw, parse_failed: true };
}

// ------------------------------------------------------------------
// 三轮 LLM 调用
// ------------------------------------------------------------------

async function roundSearch(year, onProgress) {
    onProgress?.('正在联网搜索 ' + year + ' 年南宁马拉松真实数据...');

    const messages = [
        {
            role: 'system',
            content: '你是一位专业的体育赛事数据研究员。请搜索并整理指定年份南宁马拉松的公开信息。以JSON格式输出。',
        },
        {
            role: 'user',
            content: `请搜索 ${year} 年南宁马拉松的以下信息：
1. 该年度赛事是否举办？
2. 参赛总人数、报名人数、各项目设置
3. 当年南宁市GDP、居民消费水平
4. 当年中国马拉松行业发展状况
5. 赛事赞助商、媒体报道、社会影响

${HISTORICAL_ANCHORS}

以JSON格式输出，无法搜到的填null。`,
        },
    ];

    const raw = await callDashScope(SEARCH_MODEL, messages, true);
    onProgress?.('联网搜索完成');
    return extractJSON(raw);
}

async function roundAnalyze(year, pdfFullText, searchResults, userModel, onProgress) {
    onProgress?.('正在基于 PDF 原文结构推算 ' + year + ' 年报告内容...');

    const model = userModel || SEARCH_MODEL;
    const searchContext = typeof searchResults === 'string' ? searchResults : JSON.stringify(searchResults, null, 2);

    // 截取 PDF 前 12000 字符作为上下文（避免超出 token 限制）
    const pdfContext = pdfFullText.length > 12000
        ? pdfFullText.substring(0, 12000) + '\n\n... （报告后续内容已截断，共' + pdfFullText.length + '字）'
        : pdfFullText;

    const messages = [
        {
            role: 'system',
            content: `你是一位资深的城市马拉松赛事经济评估专家。
你的任务：参照一份已有的评估报告的原文结构和格式，为指定年份生成相同结构的完整报告内容。
要求：
- 严格还原原始报告的章节结构、措辞风格和排版逻辑
- 数据必须有理有据，引用搜索到的真实数据
- 无法确定的数据基于趋势合理推算，并标注"（推算）"
- 输出JSON数组，每个元素是一个章节 { "title", "content" }
- content 应该是完整的报告段落文本，不是数据点`,
        },
        {
            role: 'user',
            content: `# 目标年份
${year}年

# 搜索到的 ${year} 年真实数据
${searchContext}

# 参照报告原文（2025年）
${pdfContext}

# 要求
请按照上述参照报告的章节结构，为 ${year} 年生成完整的评估报告内容。
输出一个JSON数组，每个元素格式：
[
  { "title": "章节标题", "content": "该章节的完整段落文本..." },
  ...
]
注意：content 应该是可以直接放入 Word 文档的完整段落，而不是数据摘要。`,
        },
    ];

    const raw = await callDashScope(model, messages, false);
    onProgress?.('报告内容生成完成');

    const parsed = extractJSON(raw);
    // 确保返回数组
    if (Array.isArray(parsed)) return parsed;
    if (parsed.sections && Array.isArray(parsed.sections)) return parsed.sections;
    if (parsed.raw_text) return [{ title: '完整报告', content: parsed.raw_text }];
    return [{ title: '生成结果', content: JSON.stringify(parsed, null, 2) }];
}

// ------------------------------------------------------------------
// Word 文档生成
// ------------------------------------------------------------------

/**
 * 根据章节数组生成 .docx 文件并保存到临时目录
 * @returns {{ filePath: string, fileName: string }}
 */
export async function generateWordDoc(year, sections) {
    await mkdir(TEMP_DIR, { recursive: true });

    const children = [];

    // 封面标题
    children.push(
        new Paragraph({
            children: [new TextRun({ text: ' ', size: 28 })],
            spacing: { after: 600 },
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: `${year}年南宁马拉松`,
                    bold: true,
                    size: 52,
                    font: '微软雅黑',
                }),
            ],
            spacing: { after: 200 },
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: '赛事经济评估报告',
                    bold: true,
                    size: 44,
                    font: '微软雅黑',
                }),
            ],
            spacing: { after: 200 },
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: '（基于AI深度研究与数据推算生成）',
                    size: 24,
                    color: '666666',
                    font: '微软雅黑',
                }),
            ],
            spacing: { after: 800 },
        }),
    );

    // 逐章节添加
    for (const section of sections) {
        // 章节标题
        children.push(
            new Paragraph({
                text: section.title,
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 },
            }),
        );

        // 章节内容 — 按段落拆分
        const paragraphs = (section.content || '').split(/\n\n|\n/).filter(p => p.trim());
        for (const para of paragraphs) {
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: para.trim(),
                            size: 24,
                            font: '宋体',
                        }),
                    ],
                    spacing: { after: 120 },
                    indent: { firstLine: 480 }, // 首行缩进2字符
                }),
            );
        }
    }

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
                },
            },
            children,
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    const fileName = `${year}年南宁马拉松赛事评估报告_AI生成_${Date.now()}.docx`;
    const filePath = join(TEMP_DIR, fileName);
    await writeFile(filePath, buffer);

    return { filePath, fileName };
}

// ------------------------------------------------------------------
// 完整生成流程
// ------------------------------------------------------------------

/**
 * @param {number} year
 * @param {string} model
 * @param {string} pdfFullText - 已上传 PDF 的全文
 * @param {Function} onProgress
 */
export async function generateMarathonData(year, model, pdfFullText, onProgress = () => { }) {
    // 第一轮：联网搜索
    const searchResults = await roundSearch(year, onProgress);
    onProgress?.('search_complete', searchResults);

    // 第二轮：基于 PDF 结构推算
    let sections;
    let retries = 0;
    while (retries < 2) {
        try {
            sections = await roundAnalyze(year, pdfFullText, searchResults, model, onProgress);
            break;
        } catch (err) {
            retries++;
            if (retries >= 2) throw new Error(`报告生成失败（已重试${retries}次）: ${err.message}`);
            onProgress?.(`生成出现问题，正在重试 (${retries}/2)...`);
        }
    }
    onProgress?.('analysis_complete', { sectionCount: sections.length });

    // 生成 Word 文档
    onProgress?.('正在生成 Word 文档...');
    const { filePath, fileName } = await generateWordDoc(year, sections);
    onProgress?.('word_complete', { fileName });

    return {
        year,
        model_used: model,
        search_model_used: SEARCH_MODEL,
        search_results: searchResults,
        sections,
        word_file: { fileName, filePath },
        generated_at: new Date().toISOString(),
    };
}

/**
 * 清理超过 1 小时的临时文件
 */
export async function cleanupTempFiles() {
    try {
        const { readdir, stat } = await import('fs/promises');
        const files = await readdir(TEMP_DIR);
        const now = Date.now();
        for (const f of files) {
            const fp = join(TEMP_DIR, f);
            const st = await stat(fp);
            if (now - st.mtimeMs > 3600_000) {
                await unlink(fp).catch(() => { });
            }
        }
    } catch { /* ignore if dir doesn't exist */ }
}
