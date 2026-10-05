import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axiosInstance'
import { AuthContext, TOKEN_KEY } from './authContext'
import { dashboardPathForRole } from '../utils/roleNavigation'

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Prevent late session-restore responses from updating state after unmount.
    let active = true
    const controller = new AbortController()
    const storedToken = localStorage.getItem(TOKEN_KEY)

    async function restoreSession() {
      if (!storedToken) {
        if (active) setLoading(false)
        return
      }

      try {
        const response = await api.get('/auth/profile', { signal: controller.signal })
        if (active) setUser(response.data.user)
      } catch (error) {
        if (error.code === 'ERR_CANCELED') return
        localStorage.removeItem(TOKEN_KEY)
        if (active) {
          setUser(null)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    restoreSession()
    return () => {
      active = false
      controller.abort()
    }
  }, [])

  async function login(email, password) {
    const loginResponse = await api.post('/auth/login', { email, password })
    const nextToken = loginResponse.data.token
    localStorage.setItem(TOKEN_KEY, nextToken)

    try {
      const profileResponse = await api.get('/auth/profile')
      setUser(profileResponse.data.user)
      navigate(dashboardPathForRole(profileResponse.data.user.role), { replace: true })
    } catch (error) {
      localStorage.removeItem(TOKEN_KEY)
      setUser(null)
      throw error
    }
  }

  async function register(username, email, password, role, managerInviteCode) {
    return api.post('/auth/register', { username, email, password, role, managerInviteCode })
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
    navigate('/login', { replace: true })
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}