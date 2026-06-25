import { api } from '@/lib/api'

export interface School {
  id: number
  name: string
}

interface SchoolListResponse {
  statusCode: number
  count: number
  data: School[]
}

export async function getSchools(): Promise<School[]> {
  const { data } = await api.get<SchoolListResponse>('/schools')
  return data.data
}
