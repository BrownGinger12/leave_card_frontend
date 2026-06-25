export type ServiceCreditType = 'CTO' | 'VSC'

export interface ServiceCreditApplication {
  id: number
  application_number: string
  employee_id: number
  special_order_id: number
  special_order?: string
  activity_name?: string
  reference?: string
  date_of_activity?: string
  type: ServiceCreditType
  hours_rendered: number
  balance_earned: number
  valid_until?: string | null
  date_filed?: string
  date_of_upload?: string
  uploaded_by?: number | null
  participation_dates: string[]
  created_at?: string
  updated_at?: string
}

export interface ServiceCreditCreatePayload {
  employee_id: number
  special_order_id: number
  hours_rendered: number
  participation_dates: string[]
  date_filed?: string
  date_of_upload?: string
  uploaded_by?: number
}

export interface ServiceCreditListResponse {
  statusCode: number
  count: number
  total: number
  page: number
  limit: number
  data: ServiceCreditApplication[]
}
