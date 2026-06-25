export type CalendarEventPeriod = 'FULL' | 'AM' | 'PM'

export interface CalendarEvent {
  id: number
  date: string
  name: string
  blocks_leave: 0 | 1
  period: CalendarEventPeriod
  created_by: number
  created_at: string
}

export interface CalendarEventCreatePayload {
  date: string
  name: string
  blocks_leave?: 0 | 1
  period?: CalendarEventPeriod
}

export interface CalendarEventUpdatePayload {
  name?: string
  blocks_leave?: 0 | 1
  period?: CalendarEventPeriod
}
