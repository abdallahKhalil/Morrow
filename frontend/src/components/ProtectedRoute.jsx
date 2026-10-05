import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { dashboardPathForRole } from '../utils/roleNavigation'

function ProtectedRoute({ requiredRole }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f6f2]" role="status">
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#d5e0d8] border-t-[#1e5144]" />
        <span className="sr-only">Restoring your session</span>
      </main>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={dashboardPathForRole(user.role)} replace />
  }
  return <Outlet />
}

export default ProtectedRoute