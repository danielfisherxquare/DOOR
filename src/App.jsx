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
import ScanProtectedRoute from './components/ScanProtectedRoute'
import ScanLayout from './components/scan/ScanLayout'
import ScanLogin from './views/scan/ScanLogin'
import ScanHome from './views/scan/ScanHome'
import ScanResult from './views/scan/ScanResult'
import useAuthStore from './stores/authStore'
import InterviewForm from './views/interview/InterviewForm'
import InterviewList from './views/interview/InterviewList'
import InterviewCompare from './views/interview/InterviewCompare'

function PortalLayout() {
  return (
    <>
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tool/:id" element={<ToolDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/interview" element={<InterviewForm />} />
          <Route path="/interview/records" element={<InterviewList />} />
          <Route path="/interview/compare" element={<InterviewCompare />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}

function App() {
  const bootstrapAuth = useAuthStore(state => state.bootstrapAuth)

  useEffect(() => {
    bootstrapAuth()
  }, [bootstrapAuth])

  return (
    <div className="app">
      <Routes>
        <Route path="/admin/*" element={
          <AdminProtectedRoute>
            <AdminLayout />
          </AdminProtectedRoute>
        } />

        <Route path="/scan/login" element={
          <ScanLayout>
            <ScanLogin />
          </ScanLayout>
        } />

        <Route path="/scan/*" element={
          <ScanProtectedRoute>
            <ScanLayout />
          </ScanProtectedRoute>
        }>
          <Route index element={<ScanHome />} />
          <Route path="result" element={<ScanResult />} />
        </Route>

        <Route path="*" element={<PortalLayout />} />
      </Routes>
    </div>
  )
}

export default App
