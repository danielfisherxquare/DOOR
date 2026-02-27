function Footer() {
  const year = new Date().getFullYear()
  
  return (
    <footer className="footer">
      <p>© {year} 工具门户 Tools Portal · All rights reserved</p>
    </footer>
  )
}

export default Footer