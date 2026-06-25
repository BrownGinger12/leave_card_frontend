import { api } from '@/lib/api'
import type {
  SpecialOrder,
  SpecialOrderCreatePayload,
  SpecialOrderListResponse,
} from '@/models/special-order.model'

export interface FilterSpecialOrdersParams {
  year?: number
  date_from?: string
  date_to?: string
  page?: number
  limit?: number
}

export async function getSpecialOrders(
  page = 1,
  limit = 5,
): Promise<SpecialOrderListResponse> {
  const { data } = await api.get<SpecialOrderListResponse>('/special-orders', {
    params: { page, limit },
  })
  return data
}

export async function searchSpecialOrders(
  q: string,
  page = 1,
  limit = 10,
): Promise<SpecialOrderListResponse> {
  const { data } = await api.get<SpecialOrderListResponse>('/special-orders/search', {
    params: { q, page, limit },
  })
  return data
}

export async function filterSpecialOrders(
  params: FilterSpecialOrdersParams,
): Promise<SpecialOrderListResponse> {
  const { data } = await api.get<SpecialOrderListResponse>('/special-orders/filter', {
    params,
  })
  return data
}

export async function createSpecialOrder(
  payload: SpecialOrderCreatePayload,
): Promise<SpecialOrder> {
  const { data } = await api.post<{ statusCode: number; message: string; data: SpecialOrder }>(
    '/special-orders',
    payload,
  )
  return data.data
}
