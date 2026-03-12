import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './stores/authStore'
import InterviewForm from './views/interview/InterviewForm'
import InterviewList from './views/interview/InterviewList'
import InterviewCompare from './views/interview/InterviewCompare'

function App() {
  const bootstrapAuth = useAuthStore(state => state.bootstrapAuth)

  useEffect(() => {
    bootstrapAuth()
  }, [bootstrapAuth])

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Navigate to="/interview" replace />} />
        <Route path="/interview" element={<InterviewForm />} />
        <Route path="/interview/records" element={<InterviewList />} />
        <Route path="/interview/compare" element={<InterviewCompare />} />
        <Route path="*" element={<Navigate to="/interview" replace />} />
      </Routes>
    </div>
  )
}

export default App
