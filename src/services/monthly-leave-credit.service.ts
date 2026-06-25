import { api } from '@/lib/api'
import type { MonthlyCreditsByYearResponse } from '@/models/monthly-leave-credit.model'

export async function getEmployeeMonthlyCreditsByYear(
  employeeId: number,
  year: number,
): Promise<MonthlyCreditsByYearResponse> {
  const { data } = await api.get<MonthlyCreditsByYearResponse>(
    `/monthly-leave-credits/employee/${employeeId}/year/${year}`
  )
  return data
}
