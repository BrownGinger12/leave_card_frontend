import { api } from '@/lib/api'
import type { LeaveTransaction } from '@/models/leave-transaction.model'

interface TransactionsResponse {
  statusCode: number
  count: number
  data: LeaveTransaction[]
}

export async function getEmployeeTransactions(employeeId: number): Promise<LeaveTransaction[]> {
  const { data } = await api.get<TransactionsResponse>(
    `/employees/${employeeId}/transactions`
  )
  return data.data
}
