import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Register from './pages/Register'
import { dashboardPathForRole } from './utils/roleNavigation'

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f6f2]" role="status">
      <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#d5e0d8] border-t-[#1e5144]" />
      <span className="sr-only">Restoring your session</span>
    </main>
  )
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return user ? <Navigate to={dashboardPathForRole(user.role)} replace /> : children
}

function HomeRoute() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return <Navigate to={user ? dashboardPathForRole(user.role) : '/login'} replace />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/profile" element={<Navigate to="/" replace />} />
      </Route>
      <Route element={<ProtectedRoute requiredRole="sales_agent" />}>
        <Route path="/agent/dashboard" element={<Dashboard />} />
      </Route>
      <Route element={<ProtectedRoute requiredRole="manager" />}>
        <Route path="/manager/dashboard" element={<Dashboard />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
