import './ContextBar.css'

export default function ContextBar({ children }) {
  return (
    <div className="context-bar">
      <div className="context-bar__label">上下文</div>
      <div className="context-bar__controls">
        {children}
      </div>
    </div>
  )
}
