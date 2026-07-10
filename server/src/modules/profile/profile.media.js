import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

function safeUserId(userId) {
  return String(userId).replace(/[^A-Za-z0-9_-]/g, '_')
}

export function createProfileMediaStore({
  uploadDir = process.env.UPLOAD_DIR || './uploads',
  filesystem = fs,
  imageProcessor = sharp,
  now = Date.now,
} = {}) {
  async function save({ userId, buffer, kind }) {
    const credential = kind === 'credential'
    const folder = credential ? 'credentials' : 'avatars'
    const directory = path.join(uploadDir, folder)
    await filesystem.mkdir(directory, { recursive: true })
    const suffix = credential ? '-credential' : ''
    const filename = `${safeUserId(userId)}${suffix}-${now()}.webp`
    const filepath = path.join(directory, filename)
    const image = imageProcessor(buffer)
      .resize(credential ? 400 : 200, credential ? 560 : 200, { fit: 'cover' })
      .webp({ quality: credential ? 90 : 85 })
    await image.toFile(filepath)
    return `/uploads/${folder}/${filename}`
  }

  return {
    saveAvatar: (userId, buffer) => save({ userId, buffer, kind: 'avatar' }),
    saveCredentialPhoto: (userId, buffer) => save({ userId, buffer, kind: 'credential' }),
  }
}

export const profileMediaStore = createProfileMediaStore()
