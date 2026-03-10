import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || ''

function getAuthHeaders() {
    const token = localStorage.getItem('token')
    return { Authorization: `Bearer ${token}` }
}

/**
 * 上传 PDF 模板文件
 * @param {File} file
 * @returns {Promise<Object>} { templateId, sections, ... }
 */
export async function uploadPdfTemplate(file) {
    const formData = new FormData()
    formData.append('file', file)

    const res = await axios.post(`${API_BASE}/api/llm/upload-template`, formData, {
        headers: {
            ...getAuthHeaders(),
            'Content-Type': 'multipart/form-data',
        },
        timeout: 60_000,
    })
    return res.data
}

/**
 * SSE 流式生成报告数据
 * @param {number} year
 * @param {string} model
 * @param {string} templateId
 * @param {Function} onProgress
 * @returns {Promise<Object>}
 */
export async function generateMarathonData(year, model, templateId, onProgress) {
    const token = localStorage.getItem('token')

    return new Promise((resolve, reject) => {
        fetch(`${API_BASE}/api/llm/generate-marathon-data?stream=true`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Accept': 'text/event-stream',
            },
            body: JSON.stringify({ year, model, templateId }),
        })
            .then(async (response) => {
                if (!response.ok) {
                    const text = await response.text()
                    throw new Error(`请求失败 (${response.status}): ${text}`)
                }

                const reader = response.body.getReader()
                const decoder = new TextDecoder()
                let buffer = ''

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop()

                    let currentEvent = 'message'
                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            currentEvent = line.slice(7).trim()
                        } else if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6))
                                if (currentEvent === 'result') { resolve(data); return }
                                if (currentEvent === 'error') { reject(new Error(data.error || '生成失败')); return }
                                onProgress?.(currentEvent, data)
                            } catch { /* skip */ }
                        }
                    }
                }
                reject(new Error('SSE 流意外结束'))
            })
            .catch(reject)
    })
}

/**
 * 下载 Word 文件
 */
export async function downloadWordFile(fileName) {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}/api/llm/download/${encodeURIComponent(fileName)}`, {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('下载失败')
    const blob = await res.blob()

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
}

export default { uploadPdfTemplate, generateMarathonData, downloadWordFile }
