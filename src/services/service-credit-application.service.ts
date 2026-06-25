import { api } from '@/lib/api'
import type {
  ServiceCreditApplication,
  ServiceCreditCreatePayload,
  ServiceCreditListResponse,
} from '@/models/service-credit-application.model'

interface SingleResponse<T> {
  statusCode: number
  data: T
}

export interface SearchServiceCreditParams {
  type?: 'CTO' | 'VSC'
  year?: number
  date_from?: string
  date_to?: string
  special_order_id?: number
  page?: number
  limit?: number
}

export async function getServiceCreditApplications(
  page = 1,
  limit = 10,
): Promise<ServiceCreditListResponse> {
  const { data } = await api.get<ServiceCreditListResponse>('/service-credit-applications', {
    params: { page, limit },
  })
  return data
}

export interface ServiceCreditBySOResponse {
  statusCode: number
  special_order: { id: number; special_order: string; activity_name: string }
  count: number
  total: number
  page: number
  limit: number
  data: ServiceCreditApplication[]
}

export async function getServiceCreditsBySpecialOrder(
  specialOrderId: number,
  page = 1,
  limit = 10,
): Promise<ServiceCreditBySOResponse> {
  const { data } = await api.get<ServiceCreditBySOResponse>(
    `/service-credit-applications/special-order/${specialOrderId}`,
    { params: { page, limit } },
  )
  return data
}

export async function searchServiceCreditsBySpecialOrder(
  specialOrderId: number,
  q: string,
  page = 1,
  limit = 10,
): Promise<ServiceCreditBySOResponse> {
  const { data } = await api.get<ServiceCreditBySOResponse>(
    `/service-credit-applications/special-order/${specialOrderId}/search`,
    { params: { q, page, limit } },
  )
  return data
}

export async function getServiceCreditApplicationByNumber(
  appNumber: string,
): Promise<ServiceCreditApplication> {
  const { data } = await api.get<SingleResponse<ServiceCreditApplication>>(
    `/service-credit-applications/number/${appNumber}`,
  )
  return data.data
}

export async function searchServiceCreditApplications(
  params: SearchServiceCreditParams,
): Promise<ServiceCreditListResponse> {
  const { data } = await api.get<ServiceCreditListResponse>(
    '/service-credit-applications/search',
    { params },
  )
  return data
}

export async function getServiceCreditApplication(id: number): Promise<ServiceCreditApplication> {
  const { data } = await api.get<SingleResponse<ServiceCreditApplication>>(
    `/service-credit-applications/${id}`,
  )
  return data.data
}

export async function getEmployeeServiceCreditApplications(
  employeeId: number,
  page = 1,
  limit = 10,
): Promise<ServiceCreditListResponse> {
  const { data } = await api.get<ServiceCreditListResponse>(
    `/service-credit-applications/employee/${employeeId}`,
    { params: { page, limit } },
  )
  return data
}

export interface CtoLeaveSummaryLeaveApp {
  id: number
  application_number: string
  employee_id: number
  leave_type_id: number
  date_filed: string
  start_date: string
  end_date: string
  total_days: number
  deduction?: number
  balance_after?: number
  reason?: string
  other_leave_description?: string | null
  status: string
  with_pay: number
  status_updated_by?: number | null
  created_at: string
  leave_type_code: string
  leave_type_name: string
  username?: string | null
  remarks?: string | null
  date_of_action?: string | null
  approver_name?: string | null
}

export interface CtoLeaveSummaryCredit {
  credit_balance_id: number
  service_credit_application_id: number
  credit_application_number: string
  original_balance: number
  remaining_balance: number
  valid_until: string | null
  special_order_number: string
  activity_name: string
  date_of_activity: string
  hours_rendered: number
  balance_earned: number
  date_filed: string
  date_of_upload?: string | null
  uploaded_by?: number | null
  uploaded_by_name?: string | null
  type: 'CTO' | 'VSC'
  participation_dates?: string[]
  credit_created_at?: string
  leave_applications: CtoLeaveSummaryLeaveApp[]
}

export interface CtoLeaveSummaryResponse {
  statusCode: number
  employee: { id: number; first_name: string; last_name: string; employee_number: string }
  count: number
  data: CtoLeaveSummaryCredit[]
}

export async function getEmployeeCtoLeaveSummary(
  employeeId: number,
): Promise<CtoLeaveSummaryResponse> {
  const { data } = await api.get<CtoLeaveSummaryResponse>(
    `/service-credit-applications/employee/${employeeId}/cto-leave-summary`,
  )
  return data
}

export async function getEmployeeVscOldLeaveSummary(
  employeeId: number,
): Promise<CtoLeaveSummaryResponse> {
  const { data } = await api.get<CtoLeaveSummaryResponse>(
    `/service-credit-applications/employee/${employeeId}/vsc-old-leave-summary`,
  )
  return data
}

export async function getEmployeeVscNewLeaveSummary(
  employeeId: number,
): Promise<CtoLeaveSummaryResponse> {
  const { data } = await api.get<CtoLeaveSummaryResponse>(
    `/service-credit-applications/employee/${employeeId}/vsc-new-leave-summary`,
  )
  return data
}

export async function createServiceCreditApplication(
  payload: ServiceCreditCreatePayload,
): Promise<ServiceCreditApplication> {
  const { data } = await api.post<SingleResponse<ServiceCreditApplication>>(
    '/service-credit-applications',
    payload,
  )
  return data.data
}
