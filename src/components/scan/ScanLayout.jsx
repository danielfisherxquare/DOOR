import { Outlet } from 'react-router-dom'

function ScanLayout({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #E2E8F0 0%, #F8FAFC 100%)',
      padding: '20px 16px 32px'
    }}>
      <div style={{
        maxWidth: 480,
        margin: '0 auto',
        display: 'grid',
        gap: 16
      }}>
        <div style={{
          background: '#0F172A',
          color: '#E2E8F0',
          borderRadius: 24,
          padding: '20px 18px'
        }}>
          <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 6 }}>Bib Tracking</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>号码布扫码工作台</div>
        </div>
        {children || <Outlet />}
      </div>
    </div>
  )
}

export default ScanLayout
