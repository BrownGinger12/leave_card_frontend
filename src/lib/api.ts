import axios from 'axios'
import { getStoredToken } from '@/lib/token'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

api.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const base = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '')
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}
