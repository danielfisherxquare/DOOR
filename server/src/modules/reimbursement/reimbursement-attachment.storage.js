import fs from 'node:fs'
import path from 'node:path'

function replacementError(message) {
  const error = new Error(message)
  error.status = 409
  error.expose = true
  return error
}

export async function replaceAttachmentFile({
  attachment,
  file,
  updateRecord,
  fileSystem = fs.promises,
  now = Date.now,
}) {
  if (!attachment?.original_path) {
    throw replacementError('附件原文件路径不存在，无法原位替换')
  }

  const originalName = path.basename(file.originalname || 'attachment')
  const fileName = `${now()}_${originalName}`
  const originalPath = path.join(path.dirname(attachment.original_path), fileName)
  await fileSystem.writeFile(originalPath, file.buffer)

  try {
    const updated = await updateRecord({
      fileName,
      originalName,
      originalPath,
      fileSize: file.size ?? file.buffer?.length ?? null,
      mimeType: file.mimetype || null,
    })
    if (!updated) throw replacementError('附件不存在')
  } catch (error) {
    await fileSystem.unlink(originalPath).catch(() => {})
    throw error
  }

  await fileSystem.unlink(attachment.original_path).catch((error) => {
    console.error('删除旧文件失败:', error)
  })
  return { fileName, originalName, originalPath }
}
