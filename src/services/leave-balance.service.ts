import { api } from '@/lib/api'
import type { LeaveBalance } from '@/models/leave-balance.model'

export async function getEmployeeLeaveBalances(employeeId: number): Promise<LeaveBalance[]> {
  const { data } = await api.get<{ statusCode: number; data: LeaveBalance[] }>(
    `/employees/${employeeId}/leave-balances`
  )
  return data.data
}
