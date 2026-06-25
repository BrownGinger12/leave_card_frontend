import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'

import {
  getCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from '@/services/calendar-event.service'
import type { CalendarEvent, CalendarEventPeriod } from '@/models/calendar-event.model'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ─── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PERIOD_LABELS: Record<CalendarEventPeriod, string> = {
  FULL: 'Full Day',
  AM: 'AM Half',
  PM: 'PM Half',
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// API returns RFC 2822 e.g. "Wed, 10 Jun 2026 00:00:00 GMT"
// Parse and reformat using UTC methods to avoid timezone shifts
function normalizeDate(raw: string): string {
  const d = new Date(raw)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? error.message
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred.'
}

function buildCalendarGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay()
  const days: { date: Date; isCurrentMonth: boolean }[] = []

  for (let i = startDow - 1; i >= 0; i--)
    days.push({ date: new Date(year, month, -i), isCurrentMonth: false })

  for (let d = 1; d <= lastDay.getDate(); d++)
    days.push({ date: new Date(year, month, d), isCurrentMonth: true })

  const remaining = (7 - (days.length % 7)) % 7
  for (let d = 1; d <= remaining; d++)
    days.push({ date: new Date(year, month + 1, d), isCurrentMonth: false })

  return days
}

// ─── Form schema ───────────────────────────────────────────────────────────────

const eventSchema = z.object({
  name: z.string().min(1, 'Event name is required'),
  period: z.enum(['FULL', 'AM', 'PM']),
})
type EventFormValues = z.infer<typeof eventSchema>

// ─── EventModal ────────────────────────────────────────────────────────────────

function EventModal({
  open,
  onOpenChange,
  date,
  event,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
  saveError,
  deleteError,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  date: string
  event: CalendarEvent | null
  onSave: (v: EventFormValues) => void
  onDelete: () => void
  isSaving: boolean
  isDeleting: boolean
  saveError: string | null
  deleteError: string | null
}) {
  const isEdit = !!event

  const { register, handleSubmit, control, formState: { errors } } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    values: {
      name: event?.name ?? '',
      period: (event?.period ?? 'FULL') as 'FULL' | 'AM' | 'PM',
    },
  })

  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Holiday' : 'Add Holiday'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-4">
          {/* Date */}
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</p>
            <p className="text-sm font-semibold">{displayDate}</p>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cal-name">
              Holiday Name <span className="text-destructive">*</span>
            </Label>
            <Input id="cal-name" {...register('name')} placeholder="e.g. New Year's Day" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {/* Period */}
          <div className="flex flex-col gap-1.5">
            <Label>Period <span className="text-destructive">*</span></Label>
            <Controller
              name="period"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="FULL">Full Day</SelectItem>
                    <SelectItem value="AM">AM Half (Morning)</SelectItem>
                    <SelectItem value="PM">PM Half (Afternoon)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.period && <p className="text-xs text-destructive">{errors.period.message}</p>}
          </div>

          {/* Error alert */}
          {(saveError || deleteError) && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{saveError ?? deleteError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2">
            <div>
              {isEdit && (
                <Button type="button" variant="destructive" onClick={onDelete} disabled={isDeleting || isSaving}>
                  {isDeleting && <Loader2 className="size-4 animate-spin" />}
                  Delete
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSaving || isDeleting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSaving || isDeleting}>
                {isSaving && <Loader2 className="size-4 animate-spin" />}
                {isEdit ? 'Save Changes' : 'Add Holiday'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = new Date()
  const [year, setYear]             = useState(today.getFullYear())
  const [month, setMonth]           = useState(today.getMonth())
  const [modalOpen, setModalOpen]   = useState(false)
  const [modalDate, setModalDate]   = useState('')
  const [modalEvent, setModalEvent] = useState<CalendarEvent | null>(null)

  const qc = useQueryClient()

  const { data: events = [], isLoading, isError: queryError } = useQuery({
    queryKey: ['calendar-events', year],
    queryFn: () => getCalendarEvents(year),
  })

  const eventMap = useMemo(() => {
    const m = new Map<string, CalendarEvent>()
    for (const e of events) m.set(normalizeDate(e.date), e)
    return m
  }, [events])

  const calDays = useMemo(() => buildCalendarGrid(year, month), [year, month])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['calendar-events', year] })

  const createM = useMutation({
    mutationFn: createCalendarEvent,
    onSuccess: () => { setModalOpen(false); invalidate() },
  })
  const updateM = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateCalendarEvent>[1] }) =>
      updateCalendarEvent(id, payload),
    onSuccess: () => { setModalOpen(false); invalidate() },
  })
  const deleteM = useMutation({
    mutationFn: deleteCalendarEvent,
    onSuccess: () => { setModalOpen(false); invalidate() },
  })

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  function handleDayClick(date: Date, isCurrent: boolean) {
    if (!isCurrent) return
    createM.reset(); updateM.reset(); deleteM.reset()
    const ds = toDateStr(date)
    setModalDate(ds)
    setModalEvent(eventMap.get(ds) ?? null)
    setModalOpen(true)
  }

  function handleSave(v: EventFormValues) {
    const payload = { name: v.name, period: v.period, blocks_leave: 1 as const }
    if (modalEvent) updateM.mutate({ id: modalEvent.id, payload })
    else createM.mutate({ date: modalDate, ...payload })
  }

  function handleDelete() {
    if (modalEvent) deleteM.mutate(modalEvent.id)
  }

  const todayStr   = toDateStr(today)
  const isSaving   = createM.isPending || updateM.isPending
  const isDeleting = deleteM.isPending
  const saveError  = (createM.isError || updateM.isError)
    ? getErrorMessage(createM.error ?? updateM.error)
    : null
  const deleteError = deleteM.isError ? getErrorMessage(deleteM.error) : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Calendar of Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage public holidays. Click any date to add or edit a holiday.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {/* Navigation */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <button type="button" onClick={prevMonth} className="rounded-md p-1.5 hover:bg-muted transition-colors" aria-label="Previous month">
            <ChevronLeft className="size-5 text-muted-foreground" />
          </button>

          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold tracking-tight text-foreground">{MONTHS[month]}</h2>
            <div className="flex items-center gap-0.5 rounded-md border border-border px-1.5 py-0.5">
              <button type="button" onClick={() => setYear(y => y - 1)} className="rounded p-0.5 hover:bg-muted transition-colors" aria-label="Previous year">
                <ChevronLeft className="size-3.5 text-muted-foreground" />
              </button>
              <span className="min-w-12 text-center text-sm font-semibold tabular-nums">{year}</span>
              <button type="button" onClick={() => setYear(y => y + 1)} className="rounded p-0.5 hover:bg-muted transition-colors" aria-label="Next year">
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          <button type="button" onClick={nextMonth} className="rounded-md p-1.5 hover:bg-muted transition-colors" aria-label="Next month">
            <ChevronRight className="size-5 text-muted-foreground" />
          </button>
        </div>

        {/* Grid body */}
        {isLoading ? (
          <div className="flex h-130 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : queryError ? (
          <div className="flex h-130 flex-col items-center justify-center gap-3 text-center">
            <AlertCircle className="size-8 text-destructive/60" />
            <div>
              <p className="font-medium text-foreground">Failed to load calendar</p>
              <p className="mt-1 text-sm text-muted-foreground">Check your connection and try refreshing.</p>
            </div>
          </div>
        ) : (
          <div className="p-4">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-2">
              {WEEKDAYS.map(d => (
                <div key={d} className="py-1 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {calDays.map(({ date, isCurrentMonth }, idx) => {
                const ds    = toDateStr(date)
                const event = eventMap.get(ds)
                const period = event?.period ?? 'FULL'
                const isToday = ds === todayStr

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleDayClick(date, isCurrentMonth)}
                    disabled={!isCurrentMonth}
                    className={cn(
                      'group relative min-h-22 rounded-lg border p-2 text-left transition-all',
                      !isCurrentMonth && 'cursor-default border-transparent opacity-20',
                      isCurrentMonth && !event && 'cursor-pointer border-border hover:border-primary/40 hover:bg-muted/40',
                      isCurrentMonth && event && period === 'FULL' && 'cursor-pointer border-red-200 bg-red-50 hover:opacity-80',
                      isCurrentMonth && event && period === 'AM'   && 'cursor-pointer border-orange-200 bg-orange-50 hover:opacity-80',
                      isCurrentMonth && event && period === 'PM'   && 'cursor-pointer border-amber-200 bg-amber-50 hover:opacity-80',
                      isToday && !event && 'border-primary/60 bg-primary/5',
                      isToday && event  && 'ring-1 ring-primary ring-offset-1',
                    )}
                  >
                    {/* Day number */}
                    <span
                      className={cn(
                        'inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold',
                        isToday && 'bg-primary text-primary-foreground',
                        !isToday && isCurrentMonth && 'text-foreground',
                        !isCurrentMonth && 'text-muted-foreground',
                      )}
                    >
                      {date.getDate()}
                    </span>

                    {/* Event badges */}
                    {event && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        <span
                          title={event.name}
                          className={cn(
                            'block truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight',
                            period === 'FULL' && 'bg-red-100 text-red-900',
                            period === 'AM'   && 'bg-orange-100 text-orange-900',
                            period === 'PM'   && 'bg-amber-100 text-amber-900',
                          )}
                        >
                          {event.name}
                        </span>
                        <span
                          className={cn(
                            'block rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                            period === 'FULL' && 'bg-red-200 text-red-900',
                            period === 'AM'   && 'bg-orange-200 text-orange-900',
                            period === 'PM'   && 'bg-amber-200 text-amber-900',
                          )}
                        >
                          {PERIOD_LABELS[period]}
                        </span>
                      </div>
                    )}

                    {/* Hover hint */}
                    {isCurrentMonth && !event && (
                      <span className="absolute right-2 bottom-1.5 text-lg leading-none text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100">
                        +
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-4 py-3">
          <span className="text-xs font-medium text-muted-foreground">Legend:</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm bg-red-200" />
            <span className="text-xs text-muted-foreground">Full Day Holiday</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm bg-orange-200" />
            <span className="text-xs text-muted-foreground">AM Half Holiday</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm bg-amber-200" />
            <span className="text-xs text-muted-foreground">PM Half Holiday</span>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalDate && (
        <EventModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          date={modalDate}
          event={modalEvent}
          onSave={handleSave}
          onDelete={handleDelete}
          isSaving={isSaving}
          isDeleting={isDeleting}
          saveError={saveError}
          deleteError={deleteError}
        />
      )}
    </div>
  )
}
