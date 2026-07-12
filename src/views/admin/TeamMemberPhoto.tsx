import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'

export interface TeamMemberPhotoProps {
  teamMemberId: string | number
  hasPhoto: boolean
  orgId?: string
  alt: string
  style?: CSSProperties
  placeholder: ReactNode
}

export function revokePreviewUrl(url: string) {
  if (url) URL.revokeObjectURL(url)
}

export function validatePortraitPhotoFile(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const ratio = image.width / image.height
      URL.revokeObjectURL(previewUrl)
      if (image.height <= image.width) {
        reject(new Error('照片必须是 2:3 竖幅'))
        return
      }
      if (Math.abs(ratio - 2 / 3) > 0.015) {
        reject(new Error('照片比例必须为 2:3 竖幅'))
        return
      }
      resolve()
    }
    image.onerror = () => {
      URL.revokeObjectURL(previewUrl)
      reject(new Error('无法读取照片，请重新选择'))
    }
    image.src = previewUrl
  })
}

export default function TeamMemberPhoto({
  teamMemberId,
  hasPhoto,
  orgId,
  alt,
  style,
  placeholder,
}: TeamMemberPhotoProps) {
  const token = useAuthStore((state: { token?: string }) => state.token)
  const [src, setSrc] = useState('')

  useEffect(() => {
    let active = true
    let objectUrl = ''

    const load = async () => {
      if (!teamMemberId || !hasPhoto || !token) {
        setSrc('')
        return
      }
      try {
        const blob = await adminApi.getTeamMemberPhoto(teamMemberId, orgId, token)
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      } catch {
        if (active) setSrc('')
      }
    }

    void load()
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [teamMemberId, hasPhoto, orgId, token])

  if (!hasPhoto || !src) return placeholder
  return <img src={src} alt={alt} style={style} />
}
