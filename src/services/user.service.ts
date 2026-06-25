import { api } from '@/lib/api'
import type { User } from '@/models/user.model'

interface UsersResponse {
  statusCode: number
  data: User[]
}

export async function getUsers(): Promise<User[]> {
  const { data } = await api.get<UsersResponse>('/users')
  return data.data
}
