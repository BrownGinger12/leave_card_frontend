export interface SpecialOrder {
  id: number
  special_order: string
  activity_name: string
  reference?: string
  date_of_activity: string
  created_at?: string
}

export interface SpecialOrderCreatePayload {
  special_order: string
  activity_name: string
  reference?: string
  date_of_activity: string
}

export interface SpecialOrderListResponse {
  statusCode: number
  count: number
  total: number
  page: number
  limit: number
  data: SpecialOrder[]
}
