import { useState, useEffect, useRef, useMemo } from 'react'
import { useForm, Controller, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import {
  PlusCircle, Pencil, ChevronLeft, ChevronRight, Search, X, AlertCircle,
  SlidersHorizontal, Plus, CheckCircle, Calendar, ListChecks, Trash2,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { searchEmployees, getEmployee } from '@/services/employee.service'
import {
  getAllLeaveApplications,
  createLeaveApplication,
  updateLeaveApplicationDates,
  deleteLeaveApplication,
  searchLeaveApplications,
  getLeaveApplicationByNumber,
} from '@/services/leave-application.service'
import { getLeaveTypes } from '@/services/leave-type.service'
import { submitLeaveApproval } from '@/services/leave-approval.service'
import { getFullName } from '@/utils/employee'
import type { Employee } from '@/models/employee.model'
import type { LeaveApplication, LeaveApplicationListResponse, LeaveDate } from '@/models/leave-application.model'
import type { LeaveType } from '@/models/leave-type.model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  'FOR HRMO ACTION': 'bg-blue-100 text-blue-800',
  'FOR APPROVAL':    'bg-orange-100 text-orange-800',
  'APPROVED':        'bg-green-100 text-green-800',
  'RETURNED':        'bg-yellow-100 text-yellow-800',
  'DISAPPROVED':     'bg-red-100 text-red-800',
}

// Leave types excluded per employee type
const TEACHING_EXCLUDED     = new Set(['VL', 'SPL', 'FL', 'CTO'])
const NON_TEACHING_EXCLUDED = new Set(['VSC'])

const LIMIT = 10

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function errMsgs(err: unknown): string[] {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data
    if (Array.isArray(d?.errors) && d.errors.length) return d.errors as string[]
    if (d?.message) return [d.message as string]
  }
  if (err instanceof Error) return [err.message]
  return ['An unexpected error occurred.']
}

function fmtDuration(durationType: string, halfDayPeriod?: string | null) {
  if (durationType === 'HALF_DAY') return `Half Day${halfDayPeriod ? ` (${halfDayPeriod})` : ''}`
  return 'Full Day'
}

function groupLeaveDates(app: LeaveApplication) {
  if (!app.leave_dates?.length) return null
  const paid:   LeaveDate[] = []
  const unpaid: LeaveDate[] = []
  for (const d of app.leave_dates) {
    if (d.is_paid) paid.push(d)
    else unpaid.push(d)
  }
  return { paid, unpaid }
}

function fmtLeaveDate(d: LeaveDate): string {
  const [y, m, day] = d.leave_date.split('-').map(Number)
  const base = new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.duration_type === 'HALF_DAY' ? `${base} (${d.half_day_period})` : base
}

function LeaveDateList({ dates, colorClass }: { dates: LeaveDate[]; colorClass: string }) {
  if (!dates.length) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <div className="flex flex-col gap-0.5">
      {dates.map((d, i) => (
        <span key={i} className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${colorClass}`}>
          {fmtLeaveDate(d)}
        </span>
      ))}
    </div>
  )
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const leaveDateSchema = z.object({
  leave_date:      z.string().min(1, 'Date is required'),
  duration_type:   z.enum(['FULL_DAY', 'HALF_DAY']),
  half_day_period: z.enum(['AM', 'PM']).nullable().optional(),
  is_paid:         z.boolean(),
})

const datesArraySchema = z.array(leaveDateSchema)
  .min(1, 'Add at least one leave date')
  .superRefine((dates, ctx) => {
    dates.forEach((d, i) => {
      if (d.duration_type === 'HALF_DAY' && !d.half_day_period) {
        ctx.addIssue({
          code: 'custom' as const,
          message: 'Period (AM/PM) is required',
          path: [i, 'half_day_period'],
        })
      }
    })
    const seen = new Set<string>()
    dates.forEach((d, i) => {
      const key = `${d.leave_date}|${d.duration_type}|${d.half_day_period ?? ''}`
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom' as const,
          message: 'Duplicate date and period',
          path: [i, 'leave_date'],
        })
      }
      seen.add(key)
    })
  })

const applyLeaveSchema = z.object({
  employee_id:             z.number().int().min(1, 'Select an employee'),
  leave_type_id:           z.number().int().min(1, 'Select a leave type'),
  date_filed:              z.string().min(1, 'Date filed is required'),
  reason:                  z.string().min(1, 'Reason is required'),
  other_leave_description: z.string().optional(),
  dates: datesArraySchema,
})

const editDatesSchema = z.object({ dates: datesArraySchema })

const updateStatusSchema = z.object({
  status:  z.enum(['FOR HRMO ACTION', 'FOR APPROVAL', 'APPROVED', 'RETURNED', 'DISAPPROVED']),
  remarks: z.string().optional(),
})

type ApplyLeaveValues   = z.infer<typeof applyLeaveSchema>
type EditDatesValues    = z.infer<typeof editDatesSchema>
type UpdateStatusValues = z.infer<typeof updateStatusSchema>

// ─── Shared components ────────────────────────────────────────────────────────

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function SubmitErrors({ messages }: { messages: string[] }) {
  if (!messages.length) return null
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <AlertCircle className="size-4 shrink-0" />
        Unable to submit leave application:
      </div>
      <ul className="ml-6 list-disc space-y-0.5">
        {messages.map((m, i) => <li key={i}>{m}</li>)}
      </ul>
    </div>
  )
}

// ─── Apply Leave Modal ────────────────────────────────────────────────────────

interface ApplyLeaveModalProps {
  open: boolean
  leaveTypes: LeaveType[]
  onClose: () => void
  onSuccess: () => void
}

function ApplyLeaveModal({ open, leaveTypes, onClose, onSuccess }: ApplyLeaveModalProps) {
  const today = new Date().toISOString().split('T')[0]

  const [empQuery, setEmpQuery]             = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [dropdownOpen, setDropdownOpen]     = useState(false)
  const [selectedEmp, setSelectedEmp]       = useState<Employee | null>(null)
  const [selectedLt, setSelectedLt]         = useState<LeaveType | null>(null)
  const [submitErrors, setSubmitErrors]     = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(empQuery), 300)
    return () => clearTimeout(t)
  }, [empQuery])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const { data: suggestions = [] } = useQuery({
    queryKey: ['emp-search', debouncedQuery],
    queryFn: () => searchEmployees(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  })

  const filteredLeaveTypes = useMemo(() => {
    if (!selectedEmp) return leaveTypes
    return leaveTypes.filter(lt => {
      if (selectedEmp.employee_type === 'TEACHING') {
        return !TEACHING_EXCLUDED.has(lt.code)
      }
      if (selectedEmp.employee_type === 'NON_TEACHING') {
        return !NON_TEACHING_EXCLUDED.has(lt.code) && !lt.name.toLowerCase().includes('personal')
      }
      return true
    })
  }, [selectedEmp, leaveTypes])

  const [maternityStart, setMaternityStart]         = useState('')
  const [maternityDays, setMaternityDays]           = useState('')
  const [maternityError, setMaternityError]         = useState<string | null>(null)
  const [isMaternitySubmitting, setIsMaternitySubmitting] = useState(false)

  const maternityEnd = useMemo(() => {
    const days = parseInt(maternityDays)
    if (!maternityStart || !days || days < 1) return ''
    const d = new Date(maternityStart + 'T12:00:00')
    d.setDate(d.getDate() + days - 1)
    return d.toISOString().split('T')[0]
  }, [maternityStart, maternityDays])

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ApplyLeaveValues>({
    resolver: zodResolver(applyLeaveSchema),
    defaultValues: {
      employee_id:             0,
      leave_type_id:           0,
      date_filed:              today,
      reason:                  '',
      other_leave_description: '',
      dates:                   [],
    },
  })

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'dates' })
  const watchedDates = watch('dates') ?? []

  const totalDays = useMemo(
    () => watchedDates.reduce((s, d) => s + (d.duration_type === 'FULL_DAY' ? 1 : 0.5), 0),
    [watchedDates],
  )

  const [rangeFrom, setRangeFrom]       = useState('')
  const [rangeTo, setRangeTo]           = useState('')
  const [skipWeekends, setSkipWeekends] = useState(false)

  function handleRangeFromChange(v: string) {
    setRangeFrom(v)
    if (!rangeTo || rangeTo < v) setRangeTo(v)
  }

  function addDateRange() {
    if (!rangeFrom || !rangeTo) return
    const existing = new Set(watchedDates.map(d => d.leave_date))
    const cur = new Date(rangeFrom + 'T12:00:00')
    const end = new Date(rangeTo   + 'T12:00:00')
    while (cur <= end) {
      const day = cur.getDay()
      if (!skipWeekends || (day !== 0 && day !== 6)) {
        const ds = cur.toISOString().split('T')[0]
        if (!existing.has(ds))
          append({ leave_date: ds, duration_type: 'FULL_DAY', half_day_period: null, is_paid: true })
      }
      cur.setDate(cur.getDate() + 1)
    }
  }

  function handleRemoveDate(i: number) {
    const removed  = watchedDates[i]?.leave_date
    const sorted   = watchedDates.map(d => d.leave_date).filter(Boolean).sort()
    remove(i)
    if (!removed || sorted.length <= 1) { setRangeFrom(''); setRangeTo(''); return }
    if (removed === sorted[0])                         setRangeFrom(sorted[1])
    else if (removed === sorted[sorted.length - 1])    setRangeTo(sorted[sorted.length - 2])
    // middle removal — do nothing to range inputs
  }

  function handleEmpSelect(emp: Employee) {
    setEmpQuery(getFullName(emp))
    setDropdownOpen(false)
    setValue('employee_id', emp.id, { shouldValidate: true })
    setSelectedEmp(emp)
    // Reset leave type when employee changes so excluded types can't remain selected
    setValue('leave_type_id', 0, { shouldValidate: false })
    setSelectedLt(null)
  }

  function handleEmpClear() {
    setEmpQuery('')
    setValue('employee_id', 0, { shouldValidate: false })
    setSelectedEmp(null)
    setValue('leave_type_id', 0, { shouldValidate: false })
    setSelectedLt(null)
  }

  function handleClose() {
    reset({
      employee_id: 0, leave_type_id: 0, date_filed: today,
      reason: '', other_leave_description: '', dates: [],
    })
    setSelectedLt(null)
    setSelectedEmp(null)
    setEmpQuery('')
    setSubmitErrors([])
    setRangeFrom('')
    setRangeTo('')
    setSkipWeekends(false)
    setMaternityStart('')
    setMaternityDays('')
    setMaternityError(null)
    onClose()
  }

  async function onSubmit(values: ApplyLeaveValues) {
    setSubmitErrors([])
    try {
      await createLeaveApplication({
        employee_id:              values.employee_id,
        leave_type_id:            values.leave_type_id,
        date_filed:               values.date_filed,
        reason:                   values.reason,
        other_leave_description:  values.other_leave_description || null,
        dates: values.dates.map(d => ({
          leave_date:      d.leave_date,
          duration_type:   d.duration_type,
          half_day_period: d.duration_type === 'HALF_DAY' ? (d.half_day_period ?? null) : null,
          is_paid:         d.is_paid,
        })),
      })
      onSuccess()
      handleClose()
    } catch (err) {
      setSubmitErrors(errMsgs(err))
    }
  }

  async function handleMaternitySubmit(e: React.FormEvent) {
    e.preventDefault()
    setMaternityError(null)
    setSubmitErrors([])
    const vals = getValues()
    if (!maternityStart) { setMaternityError('Start date is required'); return }
    const days = parseInt(maternityDays)
    if (!days || days < 1) { setMaternityError('Total days must be at least 1'); return }
    const dates: import('@/models/leave-application.model').LeaveDate[] = [
      { leave_date: maternityStart, duration_type: 'FULL_DAY', half_day_period: null, is_paid: true },
      ...(maternityEnd && maternityEnd !== maternityStart
        ? [{ leave_date: maternityEnd, duration_type: 'FULL_DAY' as const, half_day_period: null, is_paid: true }]
        : []),
    ]
    setIsMaternitySubmitting(true)
    try {
      await createLeaveApplication({
        employee_id:             vals.employee_id,
        leave_type_id:           vals.leave_type_id,
        date_filed:              vals.date_filed,
        reason:                  vals.reason,
        other_leave_description: vals.other_leave_description || null,
        dates,
      })
      onSuccess()
      handleClose()
    } catch (err) {
      setSubmitErrors(errMsgs(err))
    } finally {
      setIsMaternitySubmitting(false)
    }
  }

  const isOL          = selectedLt?.code === 'OL'
  const isMaternity   = selectedLt?.name.toLowerCase().includes('maternity') ?? false
  const isWellness    = selectedLt?.name.toLowerCase().includes('wellness') ?? false
  const datesRootErr  = (errors.dates as any)?.message as string | undefined

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-4xl flex h-[90vh] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Apply Leave</DialogTitle>
        </DialogHeader>

        <form onSubmit={isMaternity ? handleMaternitySubmit : handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto py-1 pr-1">

          {/* Employee search */}
          <Field label="Employee" required error={errors.employee_id?.message}>
            <div className="relative" ref={containerRef}>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search employee by name or number..."
                value={empQuery}
                onChange={e => {
                  setEmpQuery(e.target.value)
                  setDropdownOpen(true)
                  if (!e.target.value) handleEmpClear()
                }}
                onFocus={() => debouncedQuery.length >= 2 && setDropdownOpen(true)}
                className={`pl-8 pr-8 ${errors.employee_id ? 'border-destructive' : ''}`}
              />
              {empQuery && (
                <button type="button" onClick={handleEmpClear}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
              {dropdownOpen && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                  {suggestions.map(emp => (
                    <button key={emp.id} type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleEmpSelect(emp)}
                      className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent">
                      <span className="font-medium">{getFullName(emp)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{emp.employee_number}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {/* Leave Type */}
          <Field label="Leave Type" required error={errors.leave_type_id?.message}>
            <Controller
              control={control}
              name="leave_type_id"
              render={({ field }) => (
                <Select
                  disabled={!selectedEmp}
                  value={field.value > 0 ? field.value.toString() : ''}
                  onValueChange={v => {
                    const lt = filteredLeaveTypes.find(t => t.id === Number(v)) ?? null
                    setSelectedLt(lt)
                    field.onChange(Number(v))
                    if (lt?.name.toLowerCase().includes('wellness')) {
                      watchedDates.forEach((d, i) => {
                        if (d.duration_type === 'HALF_DAY') {
                          setValue(`dates.${i}.duration_type`, 'FULL_DAY')
                          setValue(`dates.${i}.half_day_period`, null)
                        }
                      })
                    }
                  }}
                >
                  <SelectTrigger className={`w-full ${errors.leave_type_id ? 'border-destructive' : ''}`}>
                    <SelectValue placeholder={selectedEmp ? 'Select leave type' : 'Select an employee first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredLeaveTypes.map(lt => (
                      <SelectItem key={lt.id} value={lt.id.toString()}>
                        {lt.code} — {lt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {/* Date Filed */}
          <Field label="Date Filed" required error={errors.date_filed?.message}>
            <Input type="date" {...register('date_filed')}
              className={`w-48 ${errors.date_filed ? 'border-destructive' : ''}`} />
          </Field>

          {/* Leave Dates — maternity uses start+days; all others use the date table */}
          {isMaternity ? (
            <div className="space-y-3">
              <Label>Leave Dates<span className="ml-0.5 text-destructive">*</span></Label>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Start Date <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={maternityStart}
                    onChange={e => { setMaternityStart(e.target.value); setMaternityError(null) }}
                    className="w-40"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Total Days <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    min={1}
                    value={maternityDays}
                    onChange={e => { setMaternityDays(e.target.value); setMaternityError(null) }}
                    className="w-28"
                    placeholder="e.g. 105"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">End Date (computed)</Label>
                  <Input type="date" value={maternityEnd} readOnly className="w-40 bg-muted cursor-default" />
                </div>
              </div>
              {maternityError && <p className="text-xs text-destructive">{maternityError}</p>}
            </div>
          ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Leave Dates
                <span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ leave_date: '', duration_type: 'FULL_DAY', half_day_period: null, is_paid: true })}
              >
                <Plus className="size-3.5" />
                Add Single Date
              </Button>
            </div>

            {/* Range picker */}
            <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">From</p>
                <Input
                  type="date"
                  value={rangeFrom}
                  onChange={e => handleRangeFromChange(e.target.value)}
                  className="w-36"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">To</p>
                <Input
                  type="date"
                  value={rangeTo}
                  min={rangeFrom}
                  onChange={e => setRangeTo(e.target.value)}
                  className="w-36"
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!rangeFrom || !rangeTo}
                onClick={addDateRange}
              >
                Add Range
              </Button>
              {(rangeFrom || rangeTo) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setRangeFrom(''); setRangeTo(''); replace([]) }}
                >
                  <X className="size-3.5" />
                  Clear
                </Button>
              )}
              <label className="ml-auto flex items-center gap-2 text-sm select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipWeekends}
                  onChange={e => setSkipWeekends(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Skip weekends
              </label>
            </div>

            {fields.length === 0 ? (
              <div className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                Use the range picker above or &ldquo;Add Single Date&rdquo; to add leave dates.
              </div>
            ) : (
              <div className="overflow-auto rounded-md border max-h-88">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b bg-muted">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Leave Date</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Duration</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Half Day Period</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Paid</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fields.map((field, i) => {
                      const isHalfDay = watchedDates[i]?.duration_type === 'HALF_DAY'
                      return (
                        <tr key={field.id}>
                          <td className="px-3 py-2">
                            <Input
                              type="date"
                              {...register(`dates.${i}.leave_date`)}
                              className={`w-36 ${errors.dates?.[i]?.leave_date ? 'border-destructive' : ''}`}
                            />
                            {errors.dates?.[i]?.leave_date && (
                              <p className="mt-0.5 text-xs text-destructive">{errors.dates[i].leave_date?.message}</p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Controller
                              name={`dates.${i}.duration_type`}
                              control={control}
                              render={({ field: f }) => (
                                <Select
                                  value={f.value}
                                  onValueChange={v => {
                                    f.onChange(v)
                                    if (v === 'FULL_DAY') setValue(`dates.${i}.half_day_period`, null)
                                  }}
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="FULL_DAY">Full Day</SelectItem>
                                    {!isWellness && <SelectItem value="HALF_DAY">Half Day</SelectItem>}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </td>
                          <td className="px-3 py-2">
                            {isHalfDay ? (
                              <>
                                <Controller
                                  name={`dates.${i}.half_day_period`}
                                  control={control}
                                  render={({ field: f }) => (
                                    <Select
                                      value={f.value ?? ''}
                                      onValueChange={v => f.onChange(v as 'AM' | 'PM')}
                                    >
                                      <SelectTrigger className={`w-24 ${errors.dates?.[i]?.half_day_period ? 'border-destructive' : ''}`}>
                                        <SelectValue placeholder="AM/PM" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="AM">AM</SelectItem>
                                        <SelectItem value="PM">PM</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                                {errors.dates?.[i]?.half_day_period && (
                                  <p className="mt-0.5 text-xs text-destructive">{errors.dates[i].half_day_period?.message}</p>
                                )}
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Controller
                              name={`dates.${i}.is_paid`}
                              control={control}
                              render={({ field: f }) => (
                                <input
                                  type="checkbox"
                                  checked={f.value}
                                  onChange={e => f.onChange(e.target.checked)}
                                  className="size-4 accent-primary"
                                />
                              )}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => handleRemoveDate(i)}
                              className="text-xs font-medium text-destructive hover:text-destructive/70"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {datesRootErr && (
              <p className="text-xs text-destructive">{datesRootErr}</p>
            )}

            {fields.length > 0 && (
              <div className="flex justify-end">
                <p className="text-sm font-medium">
                  Total Leave Days:{' '}
                  <span className="text-primary">{totalDays.toFixed(1)}</span>
                </p>
              </div>
            )}
          </div>
          )} {/* end !isMaternity dates section */}

          {/* Reason */}
          <Field label="Reason" required error={errors.reason?.message}>
            <textarea
              {...register('reason')}
              rows={3}
              placeholder="State the reason for this leave"
              className={`w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${errors.reason ? 'border-destructive' : 'border-input'}`}
            />
          </Field>

          {/* Other leave description — only for OL */}
          {isOL && (
            <Field label="Other Leave Description" required error={errors.other_leave_description?.message}>
              <Input {...register('other_leave_description')} placeholder="Describe the leave" />
            </Field>
          )}

          <SubmitErrors messages={submitErrors} />
          </div>

          <DialogFooter className="shrink-0 border-t border-border pt-4">
            <Button type="button" variant="outline" disabled={isSubmitting || isMaternitySubmitting} onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isMaternitySubmitting}>
              {(isSubmitting || isMaternitySubmitting) ? 'Submitting...' : 'Submit Application'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Dates Modal ─────────────────────────────────────────────────────────

interface EditDatesModalProps {
  open: boolean
  application: LeaveApplication | null
  onClose: () => void
  onSuccess: () => void
}

function EditDatesModal({ open, application, onClose, onSuccess }: EditDatesModalProps) {
  const [submitErrors, setSubmitErrors]         = useState<string[]>([])
  const [maternityStart, setMaternityStart]     = useState('')
  const [maternityDays, setMaternityDays]       = useState('')
  const [maternityError, setMaternityError]     = useState<string | null>(null)
  const [isMaternitySubmitting, setIsMaternitySubmitting] = useState(false)

  const isMaternity = application?.leave_type_name?.toLowerCase().includes('maternity') ?? false

  const maternityEnd = useMemo(() => {
    const days = parseInt(maternityDays)
    if (!maternityStart || !days || days < 1) return ''
    const d = new Date(maternityStart + 'T12:00:00')
    d.setDate(d.getDate() + days - 1)
    return d.toISOString().split('T')[0]
  }, [maternityStart, maternityDays])

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditDatesValues>({
    resolver: zodResolver(editDatesSchema),
    defaultValues: { dates: [] },
  })

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'dates' })
  const watchedDates = watch('dates') ?? []

  const totalDays = useMemo(
    () => watchedDates.reduce((s, d) => s + (d.duration_type === 'FULL_DAY' ? 1 : 0.5), 0),
    [watchedDates],
  )

  const [rangeFrom, setRangeFrom]       = useState('')
  const [rangeTo, setRangeTo]           = useState('')
  const [skipWeekends, setSkipWeekends] = useState(false)

  function handleRangeFromChange(v: string) {
    setRangeFrom(v)
    if (!rangeTo || rangeTo < v) setRangeTo(v)
  }

  function addDateRange() {
    if (!rangeFrom || !rangeTo) return
    const existing = new Set(watchedDates.map(d => d.leave_date))
    const cur = new Date(rangeFrom + 'T12:00:00')
    const end = new Date(rangeTo   + 'T12:00:00')
    while (cur <= end) {
      const day = cur.getDay()
      if (!skipWeekends || (day !== 0 && day !== 6)) {
        const ds = cur.toISOString().split('T')[0]
        if (!existing.has(ds))
          append({ leave_date: ds, duration_type: 'FULL_DAY', half_day_period: null, is_paid: true })
      }
      cur.setDate(cur.getDate() + 1)
    }
  }

  function handleRemoveDate(i: number) {
    const removed = watchedDates[i]?.leave_date
    const sorted  = watchedDates.map(d => d.leave_date).filter(Boolean).sort()
    remove(i)
    if (!removed || sorted.length <= 1) { setRangeFrom(''); setRangeTo(''); return }
    if (removed === sorted[0])                         setRangeFrom(sorted[1])
    else if (removed === sorted[sorted.length - 1])    setRangeTo(sorted[sorted.length - 2])
  }

  useEffect(() => {
    if (!open) return
    if (isMaternity) {
      reset({ dates: [] })
      setMaternityStart(application?.start_date ?? '')
      if (application?.start_date && application?.end_date) {
        const s = new Date(application.start_date + 'T12:00:00')
        const e = new Date(application.end_date   + 'T12:00:00')
        const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
        setMaternityDays(String(diff))
      } else if (application?.total_days) {
        setMaternityDays(String(application.total_days))
      }
    } else if (application?.leave_dates?.length) {
      reset({
        dates: application.leave_dates.map(d => ({
          leave_date:      d.leave_date,
          duration_type:   d.duration_type,
          half_day_period: d.half_day_period ?? null,
          is_paid:         !!d.is_paid,
        })),
      })
      const sorted = application.leave_dates.map(d => d.leave_date).filter(Boolean).sort()
      setRangeFrom(sorted[0] ?? '')
      setRangeTo(sorted[sorted.length - 1] ?? '')
    } else {
      reset({ dates: [] })
      setRangeFrom('')
      setRangeTo('')
    }
  }, [open, application, reset, isMaternity])

  function handleClose() {
    reset({ dates: [] })
    setSubmitErrors([])
    setRangeFrom('')
    setRangeTo('')
    setSkipWeekends(false)
    setMaternityStart('')
    setMaternityDays('')
    setMaternityError(null)
    onClose()
  }

  async function handleMaternitySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!application) return
    setMaternityError(null)
    setSubmitErrors([])
    if (!maternityStart) { setMaternityError('Start date is required'); return }
    const days = parseInt(maternityDays)
    if (!days || days < 1) { setMaternityError('Total days must be at least 1'); return }
    const dates: import('@/models/leave-application.model').LeaveDate[] = [
      { leave_date: maternityStart, duration_type: 'FULL_DAY', half_day_period: null, is_paid: true },
      ...(maternityEnd && maternityEnd !== maternityStart
        ? [{ leave_date: maternityEnd, duration_type: 'FULL_DAY' as const, half_day_period: null, is_paid: true }]
        : []),
    ]
    setIsMaternitySubmitting(true)
    try {
      await updateLeaveApplicationDates(application.id, dates)
      onSuccess()
      handleClose()
    } catch (err) {
      setSubmitErrors(errMsgs(err))
    } finally {
      setIsMaternitySubmitting(false)
    }
  }

  async function onSubmit(values: EditDatesValues) {
    if (!application) return
    setSubmitErrors([])
    try {
      await updateLeaveApplicationDates(
        application.id,
        values.dates.map(d => ({
          leave_date:      d.leave_date,
          duration_type:   d.duration_type,
          half_day_period: d.duration_type === 'HALF_DAY' ? (d.half_day_period ?? null) : null,
          is_paid:         d.is_paid,
        })),
      )
      onSuccess()
      handleClose()
    } catch (err) {
      setSubmitErrors(errMsgs(err))
    }
  }

  if (!application) return null

  const isWellness   = application.leave_type_name?.toLowerCase().includes('wellness') ?? false
  const datesRootErr = (errors.dates as any)?.message as string | undefined

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-4xl flex h-[90vh] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Edit Leave Dates — {application.application_number}</DialogTitle>
        </DialogHeader>

        <form onSubmit={isMaternity ? handleMaternitySubmit : handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto py-1 pr-1">
          {isMaternity ? (
            <div className="space-y-3">
              <Label>Leave Dates<span className="ml-0.5 text-destructive">*</span></Label>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Start Date <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={maternityStart}
                    onChange={e => { setMaternityStart(e.target.value); setMaternityError(null) }}
                    className="w-40"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Total Days <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    min={1}
                    value={maternityDays}
                    onChange={e => { setMaternityDays(e.target.value); setMaternityError(null) }}
                    className="w-28"
                    placeholder="e.g. 105"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">End Date (computed)</Label>
                  <Input type="date" value={maternityEnd} readOnly className="w-40 bg-muted cursor-default" />
                </div>
              </div>
              {maternityError && <p className="text-xs text-destructive">{maternityError}</p>}
              {submitErrors.length > 0 && <SubmitErrors messages={submitErrors} />}
            </div>
          ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Leave Dates
                <span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ leave_date: '', duration_type: 'FULL_DAY', half_day_period: null, is_paid: true })}
              >
                <Plus className="size-3.5" />
                Add Single Date
              </Button>
            </div>

            {/* Range picker */}
            <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">From</p>
                <Input
                  type="date"
                  value={rangeFrom}
                  onChange={e => handleRangeFromChange(e.target.value)}
                  className="w-36"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">To</p>
                <Input
                  type="date"
                  value={rangeTo}
                  min={rangeFrom}
                  onChange={e => setRangeTo(e.target.value)}
                  className="w-36"
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!rangeFrom || !rangeTo}
                onClick={addDateRange}
              >
                Add Range
              </Button>
              {(rangeFrom || rangeTo) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setRangeFrom(''); setRangeTo(''); replace([]) }}
                >
                  <X className="size-3.5" />
                  Clear
                </Button>
              )}
              <label className="ml-auto flex items-center gap-2 text-sm select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipWeekends}
                  onChange={e => setSkipWeekends(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Skip weekends
              </label>
            </div>

            {fields.length === 0 ? (
              <div className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                Use the range picker above or &ldquo;Add Single Date&rdquo; to add leave dates.
              </div>
            ) : (
              <div className="overflow-auto rounded-md border max-h-88">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b bg-muted">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Leave Date</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Duration</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Half Day Period</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Paid</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fields.map((field, i) => {
                      const isHalfDay = watchedDates[i]?.duration_type === 'HALF_DAY'
                      return (
                        <tr key={field.id}>
                          <td className="px-3 py-2">
                            <Input
                              type="date"
                              {...register(`dates.${i}.leave_date`)}
                              className={`w-36 ${errors.dates?.[i]?.leave_date ? 'border-destructive' : ''}`}
                            />
                            {errors.dates?.[i]?.leave_date && (
                              <p className="mt-0.5 text-xs text-destructive">{errors.dates[i].leave_date?.message}</p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Controller
                              name={`dates.${i}.duration_type`}
                              control={control}
                              render={({ field: f }) => (
                                <Select
                                  value={f.value}
                                  onValueChange={v => {
                                    f.onChange(v)
                                    if (v === 'FULL_DAY') setValue(`dates.${i}.half_day_period`, null)
                                  }}
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="FULL_DAY">Full Day</SelectItem>
                                    {!isWellness && <SelectItem value="HALF_DAY">Half Day</SelectItem>}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </td>
                          <td className="px-3 py-2">
                            {isHalfDay ? (
                              <>
                                <Controller
                                  name={`dates.${i}.half_day_period`}
                                  control={control}
                                  render={({ field: f }) => (
                                    <Select
                                      value={f.value ?? ''}
                                      onValueChange={v => f.onChange(v as 'AM' | 'PM')}
                                    >
                                      <SelectTrigger className={`w-24 ${errors.dates?.[i]?.half_day_period ? 'border-destructive' : ''}`}>
                                        <SelectValue placeholder="AM/PM" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="AM">AM</SelectItem>
                                        <SelectItem value="PM">PM</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                                {errors.dates?.[i]?.half_day_period && (
                                  <p className="mt-0.5 text-xs text-destructive">{errors.dates[i].half_day_period?.message}</p>
                                )}
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Controller
                              name={`dates.${i}.is_paid`}
                              control={control}
                              render={({ field: f }) => (
                                <input
                                  type="checkbox"
                                  checked={f.value}
                                  onChange={e => f.onChange(e.target.checked)}
                                  className="size-4 accent-primary"
                                />
                              )}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => handleRemoveDate(i)}
                              className="text-xs font-medium text-destructive hover:text-destructive/70"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {datesRootErr && (
              <p className="text-xs text-destructive">{datesRootErr}</p>
            )}

            {fields.length > 0 && (
              <div className="flex justify-end">
                <p className="text-sm font-medium">
                  Total Leave Days:{' '}
                  <span className="text-primary">{totalDays.toFixed(1)}</span>
                </p>
              </div>
            )}
          </div>
          )} {/* end ternary */}

          {!isMaternity && <SubmitErrors messages={submitErrors} />}
          </div>

          <DialogFooter className="shrink-0 border-t border-border pt-4">
            <Button type="button" variant="outline" disabled={isSubmitting || isMaternitySubmitting} onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isMaternitySubmitting}>
              {(isSubmitting || isMaternitySubmitting) ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Update Status Modal ──────────────────────────────────────────────────────

interface UpdateStatusModalProps {
  open: boolean
  application: LeaveApplication | null
  approverId: number
  onClose: () => void
  onSuccess: () => void
}

function UpdateStatusModal({ open, application, approverId, onClose, onSuccess }: UpdateStatusModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { handleSubmit, control, reset, formState: { errors, isSubmitting } } =
    useForm<UpdateStatusValues>({
      resolver: zodResolver(updateStatusSchema),
      defaultValues: { status: undefined, remarks: '' },
    })

  function handleClose() {
    reset()
    setSubmitError(null)
    onClose()
  }

  async function onSubmit(values: UpdateStatusValues) {
    if (!application) return
    setSubmitError(null)
    try {
      await submitLeaveApproval({
        leave_application_id: application.id,
        approver_id: approverId,
        level: 1,
        status: values.status,
        remarks: values.remarks || undefined,
      })
      onSuccess()
      handleClose()
    } catch (err) {
      const msgs = errMsgs(err)
      setSubmitError(msgs[0] ?? 'An unexpected error occurred.')
    }
  }

  if (!application) return null

  const empName = application.employee
    ? `${application.employee.first_name} ${application.employee.last_name}`
    : `Employee #${application.employee_id}`

  const hasLeaveDates = (application.leave_dates?.length ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className={hasLeaveDates ? 'max-w-xl' : 'max-w-lg'}>
        <DialogHeader>
          <DialogTitle>Update Application Status</DialogTitle>
        </DialogHeader>

        {/* Application summary */}
        <div className="space-y-2 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
          <InfoRow label="Application No." value={
            <span className="font-mono font-semibold">{application.application_number}</span>
          } />
          <InfoRow label="Employee" value={empName} />
          <InfoRow label="Leave Type" value={application.leave_type_name ?? application.leave_type_code ?? '—'} />
          <InfoRow label="Period" value={`${fmtDate(application.start_date)} – ${fmtDate(application.end_date)}`} />
          <InfoRow label="Days" value={String(application.total_days)} />
          <InfoRow label="Current Status" value={
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[application.status] ?? ''}`}>
              {application.status}
            </span>
          } />

          {hasLeaveDates && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Leave Dates</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-1.5 text-left font-medium text-muted-foreground">Date</th>
                    <th className="pb-1.5 text-left font-medium text-muted-foreground">Duration</th>
                    <th className="pb-1.5 text-left font-medium text-muted-foreground">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {application.leave_dates!.map((ld, i) => (
                    <tr key={i}>
                      <td className="py-1">{ld.leave_date}</td>
                      <td className="py-1">{fmtDuration(ld.duration_type, ld.half_day_period)}</td>
                      <td className="py-1">{ld.is_paid ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* New status */}
          <Field label="New Status" required error={errors.status?.message}>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger className={`w-full ${errors.status ? 'border-destructive' : ''}`}>
                    <SelectValue placeholder="Select new status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FOR HRMO ACTION">FOR HRMO ACTION</SelectItem>
                    <SelectItem value="FOR APPROVAL">FOR APPROVAL</SelectItem>
                    <SelectItem value="APPROVED">APPROVED</SelectItem>
                    <SelectItem value="RETURNED">RETURNED</SelectItem>
                    <SelectItem value="DISAPPROVED">DISAPPROVED</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {/* Remarks */}
          <Field label="Remarks" error={errors.remarks?.message}>
            <Controller
              control={control}
              name="remarks"
              render={({ field }) => (
                <textarea
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  rows={3}
                  placeholder="Optional remarks..."
                  className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              )}
            />
          </Field>

          {submitError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  application: LeaveApplication | null
  onClose: () => void
  onSuccess: () => void
}

function DeleteConfirmModal({ application, onClose, onSuccess }: DeleteConfirmModalProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleDelete() {
    if (!application) return
    setIsDeleting(true)
    setError(null)
    try {
      await deleteLeaveApplication(application.id)
      onSuccess()
      onClose()
    } catch (err) {
      setError(errMsgs(err)[0] ?? 'Failed to delete application.')
    } finally {
      setIsDeleting(false)
    }
  }

  const needsReversal = application
    ? ['FOR HRMO ACTION', 'FOR APPROVAL', 'APPROVED'].includes(application.status)
    : false

  return (
    <Dialog open={!!application} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="size-5" />
            Delete Leave Application
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete application{' '}
            <span className="font-mono font-semibold text-foreground">
              {application?.application_number}
            </span>
            ? This action cannot be undone.
          </p>

          {needsReversal && (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
              <strong>Note:</strong> This application is currently{' '}
              <strong>{application?.status}</strong>. Deleting it will reverse any balance deductions.
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Filter state ─────────────────────────────────────────────────────────────

interface FilterDraft {
  appNumber:     string
  year:          string
  status:        string
  leaveTypeCode: string
  dateFrom:      string
  dateTo:        string
}

const EMPTY_FILTER: FilterDraft = {
  appNumber: '', year: '', status: '', leaveTypeCode: '', dateFrom: '', dateTo: '',
}

const CUR_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: CUR_YEAR - 2019 }, (_, i) => String(CUR_YEAR - i))

function isDraftEmpty(f: FilterDraft) {
  return !f.appNumber && !f.year && !f.status && !f.leaveTypeCode && !f.dateFrom && !f.dateTo
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-xs font-medium text-muted-foreground">{children}</p>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeaveApplicationsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [page, setPage]                   = useState(1)
  const [applyOpen, setApplyOpen]         = useState(false)
  const [editApp, setEditApp]             = useState<LeaveApplication | null>(null)
  const [editDatesApp, setEditDatesApp]   = useState<LeaveApplication | null>(null)
  const [deleteApp, setDeleteApp]         = useState<LeaveApplication | null>(null)
  const [draft, setDraft]                 = useState<FilterDraft>(EMPTY_FILTER)
  const [applied, setApplied]             = useState<FilterDraft>(EMPTY_FILTER)
  const [successBanner, setSuccessBanner] = useState(false)
  const [selectedIds, setSelectedIds]     = useState<Map<number, string>>(new Map())
  const [bulkStatus, setBulkStatus]       = useState('')
  const [isBulkApplying, setIsBulkApplying] = useState(false)
  const [bulkError, setBulkError]         = useState<string | null>(null)
  const [bulkSkipped, setBulkSkipped]     = useState(0)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const isFiltered     = !isDraftEmpty(applied)
  const isAppNumSearch = !!applied.appNumber.trim()

  function set<K extends keyof FilterDraft>(key: K) {
    return (value: string) => setDraft(prev => ({ ...prev, [key]: value }))
  }

  function handleSearch() {
    setApplied({ ...draft })
    setPage(1)
    setSelectedIds(new Map())
  }

  function handleClear() {
    setDraft(EMPTY_FILTER)
    setApplied(EMPTY_FILTER)
    setPage(1)
    setSelectedIds(new Map())
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leave-applications', page, applied],
    queryFn: async (): Promise<LeaveApplicationListResponse> => {
      const num = applied.appNumber.trim()
      if (num) {
        try {
          const app = await getLeaveApplicationByNumber(num)
          return { statusCode: 200, count: 1, total: 1, page: 1, limit: LIMIT, data: [app] }
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 404) {
            return { statusCode: 200, count: 0, total: 0, page: 1, limit: LIMIT, data: [] }
          }
          throw err
        }
      }

      const hasOtherFilter = !!(applied.year || applied.status || applied.leaveTypeCode || applied.dateFrom || applied.dateTo)
      if (hasOtherFilter) {
        return searchLeaveApplications({
          year:            applied.year          ? Number(applied.year) : undefined,
          status:          applied.status        || undefined,
          leave_type_code: applied.leaveTypeCode || undefined,
          date_from:       applied.dateFrom      || undefined,
          date_to:         applied.dateTo        || undefined,
          page,
          limit: LIMIT,
        })
      }

      return getAllLeaveApplications({ page, limit: LIMIT })
    },
  })

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave-types'],
    queryFn: getLeaveTypes,
    staleTime: 10 * 60 * 1000,
  })

  const applications = data?.data ?? []
  const total        = data?.total ?? 0
  const totalPages   = Math.max(1, Math.ceil(total / LIMIT))

  const employeeIds = useMemo(
    () => [...new Set(applications.map(a => a.employee_id))],
    [applications],
  )

  const employeeResults = useQueries({
    queries: employeeIds.map(id => ({
      queryKey: ['employee', id],
      queryFn: () => getEmployee(id),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const employeeMap = useMemo(() => {
    const map = new Map<number, string>()
    employeeIds.forEach((id, idx) => {
      const emp = employeeResults[idx]?.data
      if (emp) map.set(id, `${emp.first_name} ${emp.last_name}`)
    })
    return map
  }, [employeeIds, employeeResults])

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['leave-applications'] })
  }

  // ── Bulk selection ────────────────────────────────────────────────────────────

  const pageIds          = applications.map(a => a.id)
  const selectedOnPage   = pageIds.filter(id => selectedIds.has(id))
  const allPageSelected  = pageIds.length > 0 && selectedOnPage.length === pageIds.length
  const somePageSelected = selectedOnPage.length > 0 && !allPageSelected

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = somePageSelected
  }, [somePageSelected])

  function toggleRow(app: LeaveApplication) {
    setSelectedIds(prev => {
      const next = new Map(prev)
      next.has(app.id) ? next.delete(app.id) : next.set(app.id, app.status)
      return next
    })
  }

  function togglePage() {
    setSelectedIds(prev => {
      const next = new Map(prev)
      if (allPageSelected) applications.forEach(a => next.delete(a.id))
      else applications.forEach(a => next.set(a.id, a.status))
      return next
    })
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return
    setBulkError(null)
    setBulkSkipped(0)
    setIsBulkApplying(true)

    // Skip applications already at the target status
    const toUpdate = [...selectedIds.entries()].filter(([, s]) => s !== bulkStatus)
    const skipped  = selectedIds.size - toUpdate.length

    if (toUpdate.length === 0) {
      setBulkSkipped(skipped)
      setIsBulkApplying(false)
      return
    }

    try {
      await Promise.all(
        toUpdate.map(([id]) =>
          submitLeaveApproval({
            leave_application_id: id,
            approver_id: user?.id ?? 0,
            level: 1,
            status: bulkStatus as UpdateStatusValues['status'],
            remarks: undefined,
          })
        )
      )
      setSelectedIds(new Map())
      setBulkStatus('')
      setBulkSkipped(skipped)
      invalidate()
    } catch (err) {
      setBulkError(errMsgs(err)[0] ?? 'An error occurred.')
    } finally {
      setIsBulkApplying(false)
    }
  }

  function handleApplySuccess() {
    invalidate()
    setPage(1)
    setSuccessBanner(true)
    setTimeout(() => setSuccessBanner(false), 5000)
  }

  const emptyMessage = isAppNumSearch
    ? `No application found for "${applied.appNumber}".`
    : isFiltered
    ? 'No applications match the selected filters.'
    : 'No leave applications found.'

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leave Applications</h1>
          <p className="mt-1 text-muted-foreground">Submit and monitor employee leave applications.</p>
        </div>
        <Button onClick={() => setApplyOpen(true)}>
          <PlusCircle className="size-4" />
          Apply Leave
        </Button>
      </div>

      {/* Success banner */}
      {successBanner && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle className="size-4 shrink-0" />
          Leave application submitted successfully.
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <SlidersHorizontal className="size-3.5" />
          Search &amp; Filter
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          {/* Application number */}
          <div className="min-w-52 flex-1">
            <FilterLabel>Application Number</FilterLabel>
            <div className="relative">
              <Input
                placeholder="e.g. LA-A1B2C3D4"
                value={draft.appNumber}
                onChange={e => set('appNumber')(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="pr-7 font-mono text-sm"
              />
              {draft.appNumber && (
                <button type="button" onClick={() => set('appNumber')('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Year */}
          <div className="w-28">
            <FilterLabel>Year</FilterLabel>
            <Select value={draft.year} onValueChange={set('year')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="w-44">
            <FilterLabel>Status</FilterLabel>
            <Select value={draft.status} onValueChange={set('status')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FOR HRMO ACTION">FOR HRMO ACTION</SelectItem>
                <SelectItem value="FOR APPROVAL">FOR APPROVAL</SelectItem>
                <SelectItem value="APPROVED">APPROVED</SelectItem>
                <SelectItem value="RETURNED">RETURNED</SelectItem>
                <SelectItem value="DISAPPROVED">DISAPPROVED</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Leave Type */}
          <div className="w-36">
            <FilterLabel>Leave Type</FilterLabel>
            <Select value={draft.leaveTypeCode} onValueChange={set('leaveTypeCode')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map(lt => (
                  <SelectItem key={lt.id} value={lt.code}>{lt.code} — {lt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date From */}
          <div className="w-36">
            <FilterLabel>Date From</FilterLabel>
            <Input
              type="date"
              value={draft.dateFrom}
              onChange={e => set('dateFrom')(e.target.value)}
            />
          </div>

          {/* Date To */}
          <div className="w-36">
            <FilterLabel>Date To</FilterLabel>
            <Input
              type="date"
              value={draft.dateTo}
              onChange={e => set('dateTo')(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {isFiltered && !isLoading && (
              total > 0
                ? `${total} result${total === 1 ? '' : 's'} found`
                : 'No results'
            )}
          </p>
          <div className="flex items-center gap-2">
            {isFiltered && (
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <X className="size-3.5" />
                Clear
              </Button>
            )}
            <Button size="sm" onClick={handleSearch}>
              <Search className="size-3.5" />
              Search
            </Button>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {isError && (
          <p className="px-4 py-3 text-sm text-destructive">Failed to load leave applications.</p>
        )}

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="w-10 px-4 py-3">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={togglePage}
                      className="size-4 accent-primary"
                    />
                  </th>
                  {['Application No.', 'Employee', 'Leave Type', 'Date Filed', 'Period', 'Days', 'Dates w/ Pay', 'Dates w/o Pay', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {applications.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      {emptyMessage}
                    </td>
                  </tr>
                )}
                {applications.map(app => {
                  const empName      = employeeMap.get(app.employee_id) ?? `Employee #${app.employee_id}`
                  const grouped      = groupLeaveDates(app)
                  const canEditDates = true
                  const isSelected   = selectedIds.has(app.id)
                  return (
                    <tr key={app.id} className={`transition-colors hover:bg-muted/30 ${isSelected ? 'bg-primary/5' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(app)}
                          className="size-4 accent-primary"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{app.application_number}</td>
                      <td className="px-4 py-3 text-sm">{empName}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {app.leave_type_name ?? app.leave_type_code ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">{fmtDate(app.date_filed)}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {fmtDate(app.start_date)} – {fmtDate(app.end_date)}
                      </td>
                      <td className="px-4 py-3 text-sm">{app.total_days}</td>
                      <td className="px-4 py-3">
                        {grouped
                          ? <LeaveDateList dates={grouped.paid} colorClass="bg-green-50 text-green-800" />
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {grouped
                          ? <LeaveDateList dates={grouped.unpaid} colorClass="bg-orange-50 text-orange-800" />
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[app.status] ?? 'bg-muted text-muted-foreground'}`}>
                          {app.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {canEditDates && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditDatesApp(app)}
                              title="Edit leave dates"
                            >
                              <Calendar className="size-3.5" />
                              Dates
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditApp(app)}
                            title="Update status"
                          >
                            <Pencil className="size-3.5" />
                            Status
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteApp(app)}
                            title="Delete application"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination — hidden for app-number exact lookup */}
        {!isAppNumSearch && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {total > 0
                ? `Showing ${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, total)} of ${total}`
                : 'No results'}
            </p>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="size-4" />
                Prev
              </Button>
              <span className="px-2 text-xs text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-68 right-6 z-40 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-xl">
          <ListChecks className="size-4 text-primary shrink-0" />
          <span className="text-sm font-semibold">{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={() => { setSelectedIds(new Map()); setBulkStatus(''); setBulkError(null) }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {bulkError && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="size-3.5" /> {bulkError}
              </span>
            )}
            {!bulkError && bulkSkipped > 0 && (
              <span className="text-xs text-muted-foreground">
                {bulkSkipped} already at that status — skipped
              </span>
            )}
            <Select value={bulkStatus} onValueChange={v => { setBulkStatus(v); setBulkError(null) }}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Set status for selected..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FOR HRMO ACTION">FOR HRMO ACTION</SelectItem>
                <SelectItem value="FOR APPROVAL">FOR APPROVAL</SelectItem>
                <SelectItem value="APPROVED">APPROVED</SelectItem>
                <SelectItem value="RETURNED">RETURNED</SelectItem>
                <SelectItem value="DISAPPROVED">DISAPPROVED</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!bulkStatus || isBulkApplying}
              onClick={applyBulkStatus}
            >
              {isBulkApplying ? 'Applying...' : 'Apply'}
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      <ApplyLeaveModal
        open={applyOpen}
        leaveTypes={leaveTypes}
        onClose={() => setApplyOpen(false)}
        onSuccess={handleApplySuccess}
      />
      <EditDatesModal
        open={!!editDatesApp}
        application={editDatesApp}
        onClose={() => setEditDatesApp(null)}
        onSuccess={invalidate}
      />
      <UpdateStatusModal
        open={!!editApp}
        application={editApp}
        approverId={user?.id ?? 0}
        onClose={() => setEditApp(null)}
        onSuccess={invalidate}
      />
      <DeleteConfirmModal
        application={deleteApp}
        onClose={() => setDeleteApp(null)}
        onSuccess={invalidate}
      />
    </div>
  )
}
