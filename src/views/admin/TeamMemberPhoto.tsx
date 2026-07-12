import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'
import {
  createTeamMemberPhotoIdentity,
  createTeamMemberPhotoUrlState,
  getVisibleTeamMemberPhotoSrc,
} from './teamMemberPhotoUrlState.js'

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
  const photoIdentity = createTeamMemberPhotoIdentity({ teamMemberId, orgId, token })
  const [photo, setPhoto] = useState({ identity: '', src: '' })
  const photoUrlStateRef = useRef<ReturnType<typeof createTeamMemberPhotoUrlState> | null>(null)
  if (!photoUrlStateRef.current) {
    photoUrlStateRef.current = createTeamMemberPhotoUrlState({
      createObjectUrl: (blob) => URL.createObjectURL(blob),
      revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    })
  }

  useEffect(() => {
    const photoUrlState = photoUrlStateRef.current
    if (!photoUrlState) return undefined
    const requestGeneration = photoUrlState.beginRequest()
    setPhoto({ identity: photoIdentity, src: '' })

    const load = async () => {
      if (!teamMemberId || !hasPhoto || !token) return
      try {
        const blob = await adminApi.getTeamMemberPhoto(teamMemberId, orgId, token)
        const objectUrl = photoUrlState.resolveRequest(requestGeneration, blob)
        if (objectUrl) setPhoto({ identity: photoIdentity, src: objectUrl })
      } catch {
        return
      }
    }

    void load()
    return () => photoUrlState.dispose()
  }, [teamMemberId, hasPhoto, orgId, photoIdentity, token])

  const src = getVisibleTeamMemberPhotoSrc(photo, photoIdentity)
  if (!hasPhoto || !src) return placeholder
  return <img src={src} alt={alt} style={style} />
}
