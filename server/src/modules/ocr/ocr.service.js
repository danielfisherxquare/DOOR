import axios from 'axios';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * Constructs an Axios instance pointing to the specified LLM API.
 */
function createLlmClient(baseUrl, apiKey) {
    return axios.create({
        baseURL: baseUrl,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        timeout: 60000 // ML models might take some time
    });
}

/**
 * Extracts pure text from a standard text-based PDF buffer.
 */
async function parsePdfText(fileBuffer) {
    try {
        const data = await pdfParse(fileBuffer);
        return data.text;
    } catch (error) {
        console.warn('PDF parsing failed:', error);
        return null;
    }
}

/**
 * Common method to call the LLM API using OpenAI Chat Completion Format.
 * Supports passing either text or a base64 image URL to a Vision model.
 */
async function askVlm(client, prompt, fileBuffer, mimeType, isPdf, modelName) {
    let content = [];

    content.push({ type: 'text', text: prompt });

    if (isPdf) {
        const extractedText = await parsePdfText(fileBuffer);
        if (extractedText && extractedText.trim().length > 0) {
            content.push({ type: 'text', text: `===== PDF TEXT CONTENT =====\n${extractedText}\n========================` });
        } else {
            throw new Error('Could not extract text from the PDF. If it is a scanned image PDF, please convert it to PNG/JPG before uploading, or use an API that supports raw PDF uploads.');
        }
    } else if (fileBuffer) {
        const base64Str = fileBuffer.toString('base64');
        const imageUrl = `data:${mimeType};base64,${base64Str}`;
        content.push({
            type: 'image_url',
            image_url: { url: imageUrl }
        });
    }

    const payload = {
        model: modelName || 'qwen-vl-plus',
        messages: [
            {
                role: "user",
                content: content
            }
        ],
        temperature: 0.1
    };

    const response = await client.post('/chat/completions', payload);
    const resultText = response.data?.choices?.[0]?.message?.content || "";

    return parseJsonOutput(resultText);
}

/**
 * Safely parses the output from LLM, stripping markdown markdown code blocks if present.
 */
function parseJsonOutput(text) {
    try {
        // Try direct parse
        return JSON.parse(text);
    } catch (e) {
        // Often LLMs wrap JSON in ```json ... ```
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match && match[1]) {
            try {
                return JSON.parse(match[1]);
            } catch (e2) {
                throw new Error("Failed to parse the structured JSON from LLM: " + text);
            }
        }
        throw new Error("Failed to extract valid JSON from LLM response: " + text);
    }
}

export async function extractFromInvoice({ fileBuffer, mimeType, filename, provider, baseUrl, apiKey, modelName }) {
    const prompt = `你是一个专业的财务发票识别助手。请识别提供的发票内容，并严格只输出一个 JSON 格式的对象。不要包含任何其他说明文字。
需要提取的字段如下，若没有对应字段请填 null：
{
  "amount": null, // 金额(数字，优先取价税合计小写，不带人民币符号)
  "date": null,   // 开票日期(字符串，格式 YYYY-MM-DD，若只有月日请补全今年，优先取票面明显的完整日期)
  "issuer": null, // 开票方公司全称/销售方名称(字符串)
  "category": null, // 智能推断的报销类别(如"交通费"、"住宿费"、"餐饮费"、"办公用品"、"通讯费"等)
  "details": null // 报销明细说明/商品名称(尽量简短)
}

请仔细识别，只输出纯粹的 JSON 格式数据。`;

    const client = createLlmClient(baseUrl, apiKey);
    const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');

    return askVlm(client, prompt, fileBuffer, mimeType, isPdf, modelName);
}

export async function extractFromPayment({ fileBuffer, mimeType, filename, provider, baseUrl, apiKey, modelName }) {
    const prompt = `你是一个专业的财务核对助手。请识别这份支付记录流水截图，并严格只输出一个 JSON 格式的对象。不要包含任何其他说明文字。
需要提取的字段如下，若没有对应字段请填 null：
{
  "amount": null, // 支付金额(数字，不带减号和货币符号，绝对值)
  "date": null,   // 支付时间(优先取带有年份的完整如 YYYY-MM-DD HH:mm，只有时间则补全当天，格式 YYYY-MM-DD)
  "payee": null,  // 交易对象/收款方名称
  "type": null    // 支付方式(如微信、支付宝、银行卡)
}

请仔细识别，只输出纯粹的 JSON 格式数据。`;

    const client = createLlmClient(baseUrl, apiKey);
    const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');

    return askVlm(client, prompt, fileBuffer, mimeType, isPdf, modelName);
}
