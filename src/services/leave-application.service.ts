import { api } from '@/lib/api'
import type {
  LeaveApplication,
  LeaveApplicationCreatePayload,
  LeaveApplicationListResponse,
  ApplicationsByYearResponse,
} from '@/models/leave-application.model'

interface EmployeeApplicationsResponse {
  statusCode: number
  count: number
  data: LeaveApplication[]
}

export async function getLeaveApplications(
  page = 1,
  limit = 10,
): Promise<LeaveApplicationListResponse> {
  const { data } = await api.get<LeaveApplicationListResponse>('/leave-applications', {
    params: { page, limit },
  })
  return data
}

export async function createLeaveApplication(
  payload: LeaveApplicationCreatePayload,
): Promise<LeaveApplication> {
  const { data } = await api.post<{ statusCode: number; message: string; data: LeaveApplication }>(
    '/leave-applications',
    payload,
  )
  return data.data
}

export async function getEmployeeApplications(employeeId: number): Promise<LeaveApplication[]> {
  const { data } = await api.get<EmployeeApplicationsResponse>(
    `/leave-applications/employee/${employeeId}`,
  )
  return data.data
}

export interface SearchLeaveApplicationsParams {
  year?: number
  date_from?: string
  date_to?: string
  status?: string
  leave_type_code?: string
  page?: number
  limit?: number
}

export async function searchLeaveApplications(
  params: SearchLeaveApplicationsParams,
): Promise<LeaveApplicationListResponse> {
  const { data } = await api.get<LeaveApplicationListResponse>(
    '/leave-applications/search',
    { params },
  )
  return data
}

export async function getLeaveApplicationByNumber(
  applicationNumber: string,
): Promise<LeaveApplication> {
  const { data } = await api.get<{ statusCode: number; data: LeaveApplication }>(
    `/leave-applications/number/${encodeURIComponent(applicationNumber)}`,
  )
  return data.data
}

export async function getCtoVscLeaveApplications(
  employeeId: number,
): Promise<LeaveApplication[]> {
  const { data } = await api.get<{ statusCode: number; count: number; data: LeaveApplication[] }>(
    `/leave-applications/cto-vsc/employee/${employeeId}`,
  )
  return data.data
}

export async function updateLeaveApplicationDates(
  id: number,
  dates: import('@/models/leave-application.model').LeaveDate[],
): Promise<LeaveApplication> {
  const { data } = await api.put<{ statusCode: number; message: string; data: LeaveApplication }>(
    `/leave-applications/${id}`,
    { dates },
  )
  return data.data
}

export async function deleteLeaveApplication(id: number): Promise<void> {
  await api.delete(`/leave-applications/${id}`)
}

export async function getAllLeaveApplications(params: {
  employee_id?: number
  year?: number
  page?: number
  limit?: number
}): Promise<LeaveApplicationListResponse> {
  const { data } = await api.get<LeaveApplicationListResponse>('/leave-applications/all', {
    params,
  })
  return data
}

export async function getEmployeeApplicationsByYear(
  employeeId: number,
  year: number,
): Promise<ApplicationsByYearResponse> {
  const { data } = await api.get<ApplicationsByYearResponse>(
    `/leave-applications/employee/${employeeId}/year/${year}`,
  )
  return data
}
