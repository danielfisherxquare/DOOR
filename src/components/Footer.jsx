function Footer() {
  const year = new Date().getFullYear()
  
  return (
    <footer className="footer">
      <p>© {year} DOOR Workspace · All rights reserved</p>
    </footer>
  )
}

export default Footer
