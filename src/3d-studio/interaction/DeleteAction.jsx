/**
 * Delete Action Manager
 * 全局删除动作 — 监听 Delete/Backspace 键删除选中节点
 */

import { useEffect } from 'react'
import { useScene } from '@pascal-app/core'
import useViewer from '../../../node_modules/@pascal-app/viewer/dist/store/use-viewer.js'
import useEditor from '../store/useEditor'

// 不可删除的结构节点类型
const PROTECTED_TYPES = ['site', 'building', 'level']

export default function DeleteAction() {
  useEffect(() => {
    const handleKeyDown = (event) => {
      // 忽略输入框中的删除
      if (
        event.target.tagName === 'INPUT' ||
        event.target.tagName === 'TEXTAREA' ||
        event.target.tagName === 'SELECT'
      ) {
        return
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') return

      const { selectedIds } = useViewer.getState().selection || {}
      if (!selectedIds || selectedIds.length === 0) return

      const nodes = useScene.getState().nodes
      const deleteNode = useScene.getState().deleteNode

      // 过滤掉受保护的节点类型
      const deletableIds = selectedIds.filter((id) => {
        const node = nodes[id]
        if (!node) return false
        return !PROTECTED_TYPES.includes(node.type)
      })

      if (deletableIds.length === 0) return

      event.preventDefault()

      // 逐个删除
      for (const id of deletableIds) {
        deleteNode(id)
      }

      // 清除选择
      useViewer.getState().setSelection({ selectedIds: [] })
      useViewer.getState().setHoveredId(null)
      useEditor.getState().setDirty(true)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return null
}
