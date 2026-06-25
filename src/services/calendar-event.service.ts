import { api } from '@/lib/api'
import type {
  CalendarEvent,
  CalendarEventCreatePayload,
  CalendarEventUpdatePayload,
} from '@/models/calendar-event.model'

export async function getCalendarEvents(year?: number): Promise<CalendarEvent[]> {
  const { data } = await api.get('/calendar-events', {
    params: year ? { year } : undefined,
  })
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  return []
}

export async function createCalendarEvent(payload: CalendarEventCreatePayload): Promise<number> {
  const { data } = await api.post<{ statusCode: number; message: string; id: number }>(
    '/calendar-events',
    payload,
  )
  return data.id
}

export async function updateCalendarEvent(
  id: number,
  payload: CalendarEventUpdatePayload,
): Promise<void> {
  await api.put(`/calendar-events/${id}`, payload)
}

export async function deleteCalendarEvent(id: number): Promise<void> {
  await api.delete(`/calendar-events/${id}`)
}
