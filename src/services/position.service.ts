import { api } from '@/lib/api'

export interface Position {
  id: number
  name: string
}

interface PositionListResponse {
  statusCode: number
  count: number
  data: Position[]
}

export async function getPositions(
  type: 'TEACHING' | 'NON_TEACHING',
): Promise<Position[]> {
  const { data } = await api.get<PositionListResponse>('/positions', {
    params: { type },
  })
  return data.data
}
