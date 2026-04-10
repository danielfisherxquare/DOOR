/**
 * MapShortcutsModal.tsx
 * 地图编辑器快捷键帮助面板
 */

import React from 'react';
import './MapShortcutsModal.css';

interface MapShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  key: string;
  action: string;
  shortcut: string;
  category: string;
}

const SHORTCUTS: ShortcutItem[] = [
  // 编辑操作
  { key: 'undo', action: '撤销', shortcut: 'Ctrl/Cmd + Z', category: '编辑' },
  { key: 'redo', action: '重做', shortcut: 'Ctrl/Cmd + Shift + Z', category: '编辑' },
  { key: 'copy', action: '复制选中图形', shortcut: 'Ctrl/Cmd + C', category: '编辑' },
  { key: 'paste', action: '粘贴图形', shortcut: 'Ctrl/Cmd + V', category: '编辑' },
  { key: 'delete', action: '删除选中图形', shortcut: 'Delete / Backspace', category: '编辑' },

  // 文件操作
  { key: 'save', action: '保存地图数据', shortcut: 'Ctrl/Cmd + S', category: '文件' },

  // 视图控制
  { key: 'zoom-in', action: '放大', shortcut: '+ / =', category: '视图' },
  { key: 'zoom-out', action: '缩小', shortcut: '-', category: '视图' },
  { key: 'fit', action: '适应全部图形', shortcut: '双击图层', category: '视图' },

  // 绘制工具
  { key: 'draw-marker', action: '放置点位', shortcut: '1', category: '绘制' },
  { key: 'draw-label', action: '放置标签', shortcut: '2', category: '绘制' },
  { key: 'draw-polyline', action: '绘制折线', shortcut: '3', category: '绘制' },
  { key: 'draw-polygon', action: '绘制多边形', shortcut: '4', category: '绘制' },
  { key: 'draw-rectangle', action: '绘制矩形', shortcut: '5', category: '绘制' },
  { key: 'draw-circle', action: '绘制圆形', shortcut: '6', category: '绘制' },
  { key: 'edit-mode', action: '切换节点编辑', shortcut: 'E', category: '绘制' },

  // 帮助
  { key: 'help', action: '显示快捷键帮助', shortcut: 'Ctrl/Cmd + /', category: '帮助' },
];

const CATEGORIES = ['编辑', '文件', '视图', '绘制', '帮助'];

export default function MapShortcutsModal({ open, onClose }: MapShortcutsModalProps) {
  if (!open) return null;

  return (
    <div className="shortcuts-modal-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <h3>⌨️ 快捷键帮助</h3>
          <button className="shortcuts-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="shortcuts-modal-content">
          {CATEGORIES.map((category) => (
            <div key={category} className="shortcuts-category">
              <h4 className="category-title">{category}</h4>
              <div className="shortcuts-list">
                {SHORTCUTS.filter((s) => s.category === category).map((shortcut) => (
                  <div key={shortcut.key} className="shortcut-item">
                    <span className="shortcut-action">{shortcut.action}</span>
                    <div className="shortcut-keys">
                      {shortcut.shortcut.split(' + ').map((key, i, arr) => (
                        <React.Fragment key={i}>
                          <kbd className="shortcut-key">{key.trim()}</kbd>
                          {i < arr.length - 1 && <span className="shortcut-plus">+</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shortcuts-modal-footer">
          <p>按 <kbd>Esc</kbd> 或点击外部关闭</p>
        </div>
      </div>
    </div>
  );
}
