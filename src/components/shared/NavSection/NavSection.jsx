import './NavSection.css'

export default function NavSection({ children }) {
  return (
    <section className="nav-section">
      {children}
    </section>
  )
}