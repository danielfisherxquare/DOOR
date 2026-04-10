import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import useEditor from '../store/useEditor'
import useModelingDocument from '../store/useModelingDocument'
import { rotateSolidInDocument } from '../model/editorDocument'

export default function RotateTool() {
  const selectedGeometry = useEditor((state) => state.selectedGeometry)
  const setDirty = useEditor((state) => state.setDirty)
  const document = useModelingDocument((state) => state.document)
  const replaceDocument = useModelingDocument((state) => state.replaceDocument)
  const commitDocument = useModelingDocument((state) => state.commitDocument)
  const gl = useThree((state) => state.gl)
  const dragRef = useRef(null)

  useEffect(() => {
    const canvas = gl?.domElement
    if (!canvas) return undefined

    const resolveSolidId = () => {
      if (!selectedGeometry) return null
      if (selectedGeometry.kind === 'object' && selectedGeometry.meta?.entityType === 'solid') return selectedGeometry.entityId
      return selectedGeometry.meta?.solidId || null
    }

    const handleMouseDown = (event) => {
      if (event.button !== 0) return
      const solidId = resolveSolidId()
      if (!solidId) return
      dragRef.current = {
        originDocument: document,
        startClientX: event.clientX,
        solidId,
      }
    }

    const handleMouseMove = (event) => {
      if (!dragRef.current) return
      const angleDelta = (event.clientX - dragRef.current.startClientX) * 0.01
      replaceDocument(rotateSolidInDocument(dragRef.current.originDocument, dragRef.current.solidId, angleDelta), { recordHistory: false })
    }

    const handleMouseUp = () => {
      if (!dragRef.current) return
      commitDocument(useModelingDocument.getState().document, dragRef.current.originDocument, '旋转')
      dragRef.current = null
      setDirty(true)
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [commitDocument, document, gl, replaceDocument, selectedGeometry, setDirty])

  return null
}
