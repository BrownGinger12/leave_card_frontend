import { api } from '@/lib/api'
import type { LeaveType } from '@/models/leave-type.model'

export async function getLeaveTypes(): Promise<LeaveType[]> {
  const { data } = await api.get<{ statusCode: number; data: LeaveType[] }>('/leave-types')
  return data.data
}
