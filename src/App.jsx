import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './views/Home'
import Login from './views/Login'
import ForgotPassword from './views/ForgotPassword'
import ResetPassword from './views/ResetPassword'
import ToolDetail from './views/ToolDetail'
import AdminProtectedRoute from './components/AdminProtectedRoute'
import AdminLayout from './components/admin/AdminLayout'
import useAuthStore from './stores/authStore'

function App() {
  const bootstrapAuth = useAuthStore(state => state.bootstrapAuth)

  useEffect(() => {
    bootstrapAuth()
  }, [bootstrapAuth])

  return (
    <div className="app">
      <Routes>
        {/* 管理后台 — 独立 layout，不含 Navbar/Footer */}
        <Route path="/admin/*" element={
          <AdminProtectedRoute>
            <AdminLayout />
          </AdminProtectedRoute>
        } />

        {/* 门户区 — 含 Navbar/Footer */}
        <Route path="*" element={
          <>
            <Navbar />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/tool/:id" element={<ToolDetail />} />
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password/:token" element={<ResetPassword />} />
              </Routes>
            </main>
            <Footer />
          </>
        } />
      </Routes>
    </div>
  )
}

export default App