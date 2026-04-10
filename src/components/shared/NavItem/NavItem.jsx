import { Link } from 'react-router-dom'
import './NavItem.css'

export default function NavItem({ item, href, active, collapsed }) {
  if (collapsed) {
    return (
      <Link
        to={href}
        className={`nav-item nav-item--collapsed ${active ? 'nav-item--active' : ''}`}
        title={item.label}
      >
        <span className="nav-item__badge">{item.shortLabel}</span>
      </Link>
    )
  }

  return (
    <Link to={href} className={`nav-item ${active ? 'nav-item--active' : ''}`}>
      <span className="nav-item__badge">{item.shortLabel}</span>
      <span className="nav-item__title">{item.label}</span>
    </Link>
  )
}