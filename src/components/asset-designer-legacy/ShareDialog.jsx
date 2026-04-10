/**
 * ShareDialog — 分享对话框
 * 生成分享链接和嵌入代码
 */
import { useState, useCallback } from 'react'
import useAssetDesignerStore from '../../stores/assetDesignerStore'
import { generateShareLink, copyToClipboard, saveToLocal } from '../../utils/shareUtils'

export default function ShareDialog({ onClose }) {
  const { draftScene } = useAssetDesignerStore()
  const [shareData, setShareData] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [expiresIn, setExpiresIn] = useState('7d')
  const [copied, setCopied] = useState(null)

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    try {
      const data = await generateShareLink(draftScene, { expiresIn })

      // 如果是本地模拟，保存到 localStorage
      if (data.isLocal) {
        saveToLocal(data.id, draftScene)
      }

      setShareData(data)
    } catch (error) {
      console.error('生成分享链接失败:', error)
      alert('生成分享链接失败: ' + error.message)
    } finally {
      setIsGenerating(false)
    }
  }, [draftScene, expiresIn])

  const handleCopy = useCallback(async (text, type) => {
    const success = await copyToClipboard(text)
    if (success) {
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    }
  }, [])

  return (
    <div className="share-dialog">
      <div className="share-dialog__overlay" onClick={onClose} />
      <div className="share-dialog__content">
        <div className="share-dialog__header">
          <h3>分享场景</h3>
          <button className="share-dialog__close" onClick={onClose}>×</button>
        </div>

        {!shareData ? (
          <div className="share-dialog__form">
            <div className="share-dialog__field">
              <label>有效期</label>
              <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}>
                <option value="1d">1 天</option>
                <option value="7d">7 天</option>
                <option value="30d">30 天</option>
                <option value="never">永久</option>
              </select>
            </div>

            <button
              className="share-dialog__button"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? '生成中...' : '生成分享链接'}
            </button>
          </div>
        ) : (
          <div className="share-dialog__result">
            <div className="share-dialog__field">
              <label>分享链接</label>
              <div className="share-dialog__copy-row">
                <input type="text" value={shareData.shortUrl} readOnly />
                <button
                  className={`share-dialog__copy-btn ${copied === 'url' ? 'copied' : ''}`}
                  onClick={() => handleCopy(shareData.shortUrl, 'url')}
                >
                  {copied === 'url' ? '已复制' : '复制'}
                </button>
              </div>
            </div>

            <div className="share-dialog__field">
              <label>嵌入代码</label>
              <div className="share-dialog__copy-row">
                <textarea value={shareData.embedCode} readOnly rows={3} />
                <button
                  className={`share-dialog__copy-btn ${copied === 'embed' ? 'copied' : ''}`}
                  onClick={() => handleCopy(shareData.embedCode, 'embed')}
                >
                  {copied === 'embed' ? '已复制' : '复制'}
                </button>
              </div>
            </div>

            <div className="share-dialog__info">
              {shareData.expiresAt && (
                <p>过期时间: {new Date(shareData.expiresAt).toLocaleString()}</p>
              )}
              {shareData.isLocal && (
                <p className="share-dialog__local-note">此链接仅在本地浏览器有效</p>
              )}
            </div>

            <button
              className="share-dialog__button share-dialog__button--secondary"
              onClick={() => setShareData(null)}
            >
              重新生成
            </button>
          </div>
        )}
      </div>
    </div>
  )
}