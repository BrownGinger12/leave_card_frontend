import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getMe,
  getStoredToken,
  login as loginService,
  removeStoredToken,
  setStoredToken,
} from '@/services/auth.service'
import type { AuthUser, LoginPayload } from '@/models/auth.model'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (payload: LoginPayload) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restore session from stored token on mount
  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setIsLoading(false)
      return
    }
    getMe()
      .then(setUser)
      .catch(() => removeStoredToken())
      .finally(() => setIsLoading(false))
  }, [])

  async function login(payload: LoginPayload) {
    const response = await loginService(payload)
    setStoredToken(response.token)
    setUser(response.user)
  }

  function logout() {
    removeStoredToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
