function Footer() {
  const year = new Date().getFullYear()
  
  return (
    <footer className="footer">
      <p>© {year} Powered by Xquare · All rights reserved</p>
    </footer>
  )
}

export default Footer
