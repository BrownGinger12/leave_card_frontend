import { api } from '@/lib/api'
import type { AuthUser, LoginPayload, LoginResponse } from '@/models/auth.model'
import { getStoredToken, setStoredToken, removeStoredToken } from '@/lib/token'

export { getStoredToken, setStoredToken, removeStoredToken }

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', payload)
  return data
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get<{ statusCode: number; data: AuthUser }>('/auth/me')
  return data.data
}
