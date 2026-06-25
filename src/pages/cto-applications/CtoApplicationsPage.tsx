import React, { useState, useMemo, useEffect } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import {
  PlusCircle, ChevronLeft, ChevronRight, AlertCircle, Trash2, Plus,
  SlidersHorizontal, Search, X,
} from 'lucide-react'
import {
  getSpecialOrders, searchSpecialOrders, filterSpecialOrders, createSpecialOrder,
} from '@/services/special-order.service'
import {
  getServiceCreditApplications,
  getServiceCreditApplicationByNumber,
  getServiceCreditsBySpecialOrder,
  searchServiceCreditsBySpecialOrder,
  searchServiceCreditApplications,
  createServiceCreditApplication,
  type SearchServiceCreditParams,
} from '@/services/service-credit-application.service'
import { searchEmployees, getEmployee } from '@/services/employee.service'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/contexts/AuthContext'
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
import type { SpecialOrder, SpecialOrderListResponse } from '@/models/special-order.model'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function errMsg(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.data?.message) {
    return err.response.data.message
  }
  return 'An unexpected error occurred.'
}

// ─── Add Special Order Modal ──────────────────────────────────────────────────

const addSOSchema = z.object({
  special_order:    z.string().min(1, 'SO number is required'),
  activity_name:    z.string().min(1, 'Activity name is required'),
  reference:        z.string().optional(),
  date_of_activity: z.string().min(1, 'Date of activity is required'),
})
type AddSOValues = z.infer<typeof addSOSchema>

interface AddSOModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function AddSOModal({ open, onClose, onSuccess }: AddSOModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<AddSOValues>({
      resolver: zodResolver(addSOSchema),
      defaultValues: { special_order: '', activity_name: '', reference: '', date_of_activity: '' },
    })

  function handleClose() {
    reset()
    setSubmitError(null)
    onClose()
  }

  async function onSubmit(values: AddSOValues) {
    setSubmitError(null)
    try {
      await createSpecialOrder({
        special_order:    values.special_order,
        activity_name:    values.activity_name,
        date_of_activity: values.date_of_activity,
        reference:        values.reference || undefined,
      })
      onSuccess()
      handleClose()
    } catch (err) {
      setSubmitError(errMsg(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Special Order</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>SO Number <span className="text-destructive">*</span></Label>
            <Input
              {...register('special_order')}
              placeholder="e.g. SO-2026-001"
              className={errors.special_order ? 'border-destructive' : ''}
            />
            {errors.special_order && (
              <p className="text-xs text-destructive">{errors.special_order.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Activity Name <span className="text-destructive">*</span></Label>
            <Input
              {...register('activity_name')}
              placeholder="e.g. Regional Year-End Assessment"
              className={errors.activity_name ? 'border-destructive' : ''}
            />
            {errors.activity_name && (
              <p className="text-xs text-destructive">{errors.activity_name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Date of Activity <span className="text-destructive">*</span></Label>
            <Input
              type="date"
              {...register('date_of_activity')}
              className={errors.date_of_activity ? 'border-destructive' : ''}
            />
            {errors.date_of_activity && (
              <p className="text-xs text-destructive">{errors.date_of_activity.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input {...register('reference')} placeholder="e.g. REF-2026-001 (optional)" />
          </div>

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
              {isSubmitting ? 'Saving...' : 'Add Special Order'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Service Credit Modal ─────────────────────────────────────────────────

const addSCSchema = z.object({
  employee_id:        z.number({ required_error: 'Employee is required' }).int().positive('Employee is required'),
  special_order_id:   z.number({ required_error: 'Special order is required' }).int().positive('Special order is required'),
  hours_rendered:     z.coerce.number().positive('Hours must be greater than 0'),
  participation_dates: z.array(z.object({ date: z.string().min(1, 'Date is required') })).min(1, 'At least one participation date is required'),
  date_filed:         z.string().optional(),
})
type AddSCValues = z.infer<typeof addSCSchema>

interface AddSCModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  specialOrders: SpecialOrder[]
}

function AddSCModal({ open, onClose, onSuccess, specialOrders }: AddSCModalProps) {
  const { user } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [empSearch, setEmpSearch] = useState('')
  const [empResults, setEmpResults] = useState<{ id: number; name: string }[]>([])
  const [empName, setEmpName] = useState('')
  const [searching, setSearching] = useState(false)

  const {
    register, handleSubmit, reset, setValue, control,
    formState: { errors, isSubmitting },
  } = useForm<AddSCValues>({
    resolver: zodResolver(addSCSchema),
    defaultValues: {
      participation_dates: [{ date: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'participation_dates' })

  async function handleEmpSearch(q: string) {
    setEmpSearch(q)
    setEmpName(q)
    if (q.length < 2) { setEmpResults([]); return }
    setSearching(true)
    try {
      const results = await searchEmployees(q)
      setEmpResults(results.map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}` })))
    } finally {
      setSearching(false)
    }
  }

  function selectEmp(id: number, name: string) {
    setValue('employee_id', id, { shouldValidate: true })
    setEmpName(name)
    setEmpSearch(name)
    setEmpResults([])
  }

  function handleClose() {
    reset()
    setSubmitError(null)
    setEmpSearch('')
    setEmpName('')
    setEmpResults([])
    onClose()
  }

  async function onSubmit(values: AddSCValues) {
    setSubmitError(null)
    try {
      await createServiceCreditApplication({
        employee_id:        values.employee_id,
        special_order_id:   values.special_order_id,
        hours_rendered:     values.hours_rendered,
        participation_dates: values.participation_dates.map(p => p.date),
        date_filed:         values.date_filed || undefined,
        uploaded_by:        user?.employee_id,
      })
      onSuccess()
      handleClose()
    } catch (err) {
      setSubmitError(errMsg(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add VSC / CTO Application</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Employee */}
          <div className="space-y-1.5">
            <Label>Employee <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Input
                value={empSearch}
                onChange={e => handleEmpSearch(e.target.value)}
                placeholder="Search by name..."
                className={errors.employee_id ? 'border-destructive' : ''}
                autoComplete="off"
              />
              {searching && (
                <p className="absolute left-0 top-full mt-1 text-xs text-muted-foreground">Searching...</p>
              )}
              {empResults.length > 0 && (
                <ul className="absolute z-50 left-0 top-full mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                  {empResults.map(e => (
                    <li
                      key={e.id}
                      className="cursor-pointer px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                      onMouseDown={() => selectEmp(e.id, e.name)}
                    >
                      {e.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {errors.employee_id && (
              <p className="text-xs text-destructive">{errors.employee_id.message}</p>
            )}
            {empName && !empResults.length && (
              <p className="text-xs text-muted-foreground">Selected: {empName}</p>
            )}
          </div>

          {/* Special Order */}
          <div className="space-y-1.5">
            <Label>Special Order <span className="text-destructive">*</span></Label>
            <Controller
              control={control}
              name="special_order_id"
              render={({ field }) => (
                <Select
                  value={field.value ? String(field.value) : ''}
                  onValueChange={v => field.onChange(Number(v))}
                >
                  <SelectTrigger className={errors.special_order_id ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select special order..." />
                  </SelectTrigger>
                  <SelectContent>
                    {specialOrders.length === 0 && (
                      <SelectItem value="_none" disabled>No special orders available</SelectItem>
                    )}
                    {specialOrders.map(so => (
                      <SelectItem key={so.id} value={String(so.id)}>
                        {so.special_order} — {so.activity_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.special_order_id && (
              <p className="text-xs text-destructive">{errors.special_order_id.message}</p>
            )}
          </div>

          {/* Hours Rendered */}
          <div className="space-y-1.5">
            <Label>Hours Rendered <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              {...register('hours_rendered')}
              placeholder="e.g. 16"
              className={errors.hours_rendered ? 'border-destructive' : ''}
            />
            {errors.hours_rendered && (
              <p className="text-xs text-destructive">{errors.hours_rendered.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Balance earned = hours ÷ 8 × 1.5 (computed by server)
            </p>
          </div>

          {/* Participation Dates */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Participation Dates <span className="text-destructive">*</span></Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ date: '' })}
              >
                <Plus className="size-3.5" />
                Add Date
              </Button>
            </div>
            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Input
                    type="date"
                    {...register(`participation_dates.${idx}.date`)}
                    className={errors.participation_dates?.[idx]?.date ? 'border-destructive flex-1' : 'flex-1'}
                  />
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(idx)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {errors.participation_dates?.root && (
              <p className="text-xs text-destructive">{errors.participation_dates.root.message}</p>
            )}
            {errors.participation_dates && !errors.participation_dates.root && typeof errors.participation_dates.message === 'string' && (
              <p className="text-xs text-destructive">{errors.participation_dates.message}</p>
            )}
          </div>

          {/* Date Filed */}
          <div className="space-y-1.5">
            <Label>Date Filed</Label>
            <Input type="date" {...register('date_filed')} />
          </div>

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
              {isSubmitting ? 'Submitting...' : 'Submit Application'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Special Order Detail Modal ───────────────────────────────────────────────

const LIMIT_SO_DETAIL = 10

interface SODetailModalProps {
  specialOrderId: number | null
  onClose: () => void
}

function SODetailModal({ specialOrderId, onClose }: SODetailModalProps) {
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch     = useDebounce(search, 350)

  const isSearching = !!debouncedSearch.trim()

  // Reset page when search changes
  useEffect(() => { setPage(1) }, [debouncedSearch])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sc-by-so', specialOrderId, page, debouncedSearch],
    queryFn: () => isSearching
      ? searchServiceCreditsBySpecialOrder(specialOrderId!, debouncedSearch.trim(), page, LIMIT_SO_DETAIL)
      : getServiceCreditsBySpecialOrder(specialOrderId!, page, LIMIT_SO_DETAIL),
    enabled: specialOrderId !== null,
  })

  const applications = data?.data ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT_SO_DETAIL))

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

  function handleClose() {
    setPage(1)
    setSearch('')
    onClose()
  }

  return (
    <Dialog open={specialOrderId !== null} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="w-[90vw] max-w-[90vw] sm:max-w-300 h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {data?.special_order
              ? `${data.special_order.special_order} — ${data.special_order.activity_name}`
              : 'Service Credit Applications'}
          </DialogTitle>
          {total > 0 && (
            <p className="text-sm text-muted-foreground">{total} application{total !== 1 ? 's' : ''} linked to this special order</p>
          )}
        </DialogHeader>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by app number, employee name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-7 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {isError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              Failed to load applications for this special order.
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    {['App No.', 'Employee', 'Type', 'Inclusive Dates', 'Hours / Balance', 'Date Filed', 'Valid Until'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {applications.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        No applications linked to this special order.
                      </td>
                    </tr>
                  )}
                  {applications.map(app => (
                    <tr key={app.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5 font-mono text-xs font-medium whitespace-nowrap">
                        {app.application_number}
                      </td>
                      <td className="px-3 py-2.5">
                        {employeeMap.get(app.employee_id) ?? `Employee #${app.employee_id}`}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[app.type] ?? 'bg-muted text-muted-foreground'}`}>
                          {app.type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {app.participation_dates?.length
                          ? app.participation_dates.map(d => (
                              <span key={d} className="block whitespace-nowrap text-xs">{fmtDate(d)}</span>
                            ))
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span>{app.hours_rendered}h</span>
                        <span className="mx-1 text-muted-foreground">/</span>
                        <span className="font-medium">{app.balance_earned} days</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(app.date_filed)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {app.type === 'CTO' ? fmtDate(app.valid_until) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              {total > 0
                ? `${(page - 1) * LIMIT_SO_DETAIL + 1}–${Math.min(page * LIMIT_SO_DETAIL, total)} of ${total}`
                : 'No results'}
            </p>
            <div className="flex items-center gap-1">
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
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const LIMIT_SO = 5
const LIMIT_SC = 10

const CUR_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: CUR_YEAR - 2019 }, (_, i) => String(CUR_YEAR - i))

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-xs font-medium text-muted-foreground">{children}</p>
}

interface SOFilterDraft {
  keyword: string
  year: string
  dateFrom: string
  dateTo: string
}

const SO_FILTER_INIT: SOFilterDraft = { keyword: '', year: '', dateFrom: '', dateTo: '' }

interface SCFilterDraft {
  appNumber: string
  type: string
  year: string
  dateFrom: string
  dateTo: string
}

const SC_FILTER_INIT: SCFilterDraft = { appNumber: '', type: '', year: '', dateFrom: '', dateTo: '' }

const TYPE_STYLE: Record<string, string> = {
  CTO: 'bg-blue-100 text-blue-700',
  VSC: 'bg-purple-100 text-purple-700',
}

export default function ServiceCreditApplicationsPage() {
  const queryClient = useQueryClient()
  const [soPage, setSOPage]   = useState(1)
  const [scPage, setSCPage]   = useState(1)
  const [addSOOpen, setAddSOOpen]   = useState(false)
  const [addSCOpen, setAddSCOpen]   = useState(false)
  const [selectedSOId, setSelectedSOId] = useState<number | null>(null)

  // SO filter state
  const [soDraft,   setSODraft]   = useState<SOFilterDraft>(SO_FILTER_INIT)
  const [soApplied, setSOApplied] = useState<SOFilterDraft>(SO_FILTER_INIT)

  const soIsKeyword     = !!soApplied.keyword.trim()
  const soHasDateFilter = !!(soApplied.year || soApplied.dateFrom || soApplied.dateTo)
  const soIsFiltered    = soIsKeyword || soHasDateFilter

  function applySOFilters() { setSOApplied(soDraft); setSOPage(1) }
  function clearSOFilters() { setSODraft(SO_FILTER_INIT); setSOApplied(SO_FILTER_INIT); setSOPage(1) }

  // SC filter state
  const [scDraft,   setSCDraft]   = useState<SCFilterDraft>(SC_FILTER_INIT)
  const [scApplied, setSCApplied] = useState<SCFilterDraft>(SC_FILTER_INIT)

  const isExactLookup = !!scApplied.appNumber.trim()
  const hasOtherFilter = !!(scApplied.type || scApplied.year || scApplied.dateFrom || scApplied.dateTo)

  function applyFilters() { setSCApplied(scDraft); setSCPage(1) }
  function clearFilters() { setSCDraft(SC_FILTER_INIT); setSCApplied(SC_FILTER_INIT); setSCPage(1) }

  // Special Orders query — smart routing
  const soQuery = useQuery({
    queryKey: ['special-orders', soPage, soApplied],
    queryFn: (): Promise<SpecialOrderListResponse> => {
      const kw = soApplied.keyword.trim()
      if (kw) return searchSpecialOrders(kw, soPage, LIMIT_SO)
      if (soHasDateFilter) {
        return filterSpecialOrders({
          year:      soApplied.year     ? Number(soApplied.year) : undefined,
          date_from: soApplied.dateFrom || undefined,
          date_to:   soApplied.dateTo   || undefined,
          page: soPage,
          limit: LIMIT_SO,
        })
      }
      return getSpecialOrders(soPage, LIMIT_SO)
    },
  })

  // All special orders for modal select (flat list, high limit)
  const allSOQuery = useQuery({
    queryKey: ['special-orders-all'],
    queryFn: () => getSpecialOrders(1, 1000),
    staleTime: 5 * 60 * 1000,
  })

  const orders     = soQuery.data?.data ?? []
  const soTotal    = soQuery.data?.total ?? 0
  const soTotalPages = Math.max(1, Math.ceil(soTotal / LIMIT_SO))

  // Service Credit Applications query — smart routing
  const scQuery = useQuery({
    queryKey: ['service-credit-applications', scPage, scApplied],
    queryFn: async (): Promise<import('@/models/service-credit-application.model').ServiceCreditListResponse> => {
      const num = scApplied.appNumber.trim()
      if (num) {
        try {
          const app = await getServiceCreditApplicationByNumber(num)
          return { statusCode: 200, count: 1, total: 1, page: 1, limit: LIMIT_SC, data: [app] }
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 404) {
            return { statusCode: 200, count: 0, total: 0, page: 1, limit: LIMIT_SC, data: [] }
          }
          throw err
        }
      }
      if (hasOtherFilter) {
        const params: SearchServiceCreditParams = { page: scPage, limit: LIMIT_SC }
        if (scApplied.type === 'CTO' || scApplied.type === 'VSC') params.type = scApplied.type
        if (scApplied.year)     params.year      = Number(scApplied.year)
        if (scApplied.dateFrom) params.date_from = scApplied.dateFrom
        if (scApplied.dateTo)   params.date_to   = scApplied.dateTo
        return searchServiceCreditApplications(params)
      }
      return getServiceCreditApplications(scPage, LIMIT_SC)
    },
  })

  const applications = scQuery.data?.data ?? []
  const scTotal      = scQuery.data?.total ?? 0
  const scTotalPages = Math.max(1, Math.ceil(scTotal / LIMIT_SC))

  // Resolve employee names
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

  function invalidateSO() {
    queryClient.invalidateQueries({ queryKey: ['special-orders'] })
    queryClient.invalidateQueries({ queryKey: ['special-orders-all'] })
  }

  function invalidateSC() {
    queryClient.invalidateQueries({ queryKey: ['service-credit-applications'] })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Service Credit Applications</h1>
        <p className="mt-1 text-muted-foreground">Submit and manage CTO and VSC service credit applications.</p>
      </div>

      {/* ── Special Orders ── */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Special Orders</h2>

        {/* SO Filter Panel */}
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <SlidersHorizontal className="size-3.5" />
            Search &amp; Filter
          </div>

          <div className="mt-3 flex flex-wrap gap-3">
            <div className="min-w-52 flex-1">
              <FilterLabel>Keyword</FilterLabel>
              <div className="relative">
                <Input
                  placeholder="SO number or activity name..."
                  value={soDraft.keyword}
                  onChange={e => setSODraft(d => ({ ...d, keyword: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && applySOFilters()}
                  className="pr-7 text-sm"
                />
                {soDraft.keyword && (
                  <button
                    type="button"
                    onClick={() => setSODraft(d => ({ ...d, keyword: '' }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="w-28">
              <FilterLabel>Year</FilterLabel>
              <Select value={soDraft.year} onValueChange={v => setSODraft(d => ({ ...d, year: v }))}>
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

            <div className="w-36">
              <FilterLabel>Date From</FilterLabel>
              <Input
                type="date"
                value={soDraft.dateFrom}
                onChange={e => setSODraft(d => ({ ...d, dateFrom: e.target.value }))}
              />
            </div>

            <div className="w-36">
              <FilterLabel>Date To</FilterLabel>
              <Input
                type="date"
                value={soDraft.dateTo}
                onChange={e => setSODraft(d => ({ ...d, dateTo: e.target.value }))}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {soIsFiltered && !soQuery.isLoading && (
                soTotal > 0
                  ? `${soTotal} result${soTotal === 1 ? '' : 's'} found`
                  : 'No results'
              )}
            </p>
            <div className="flex items-center gap-2">
              {soIsFiltered && (
                <Button variant="ghost" size="sm" onClick={clearSOFilters}>
                  <X className="size-3.5" />
                  Clear
                </Button>
              )}
              <Button size="sm" onClick={applySOFilters}>
                <Search className="size-3.5" />
                Search
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Records</p>
            {soTotal > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">{soTotal} record{soTotal !== 1 ? 's' : ''}</p>
            )}
          </div>
          <Button size="sm" onClick={() => setAddSOOpen(true)}>
            <PlusCircle className="size-4" />
            Add Special Order
          </Button>
        </div>

        {soQuery.isError && (
          <p className="px-4 py-3 text-sm text-destructive">Failed to load special orders.</p>
        )}

        {soQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: LIMIT_SO }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted">
                  {['SO Number', 'Activity Name', 'Reference', 'Date of Activity'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No special orders yet.
                    </td>
                  </tr>
                )}
                {orders.map(so => (
                  <tr
                    key={so.id}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setSelectedSOId(so.id)}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-primary underline-offset-2 hover:underline">
                      {so.special_order}
                    </td>
                    <td className="px-4 py-2.5 text-sm">{so.activity_name}</td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">{so.reference ?? '—'}</td>
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap">{fmtDate(so.date_of_activity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            {soTotal > 0
              ? `${(soPage - 1) * LIMIT_SO + 1}–${Math.min(soPage * LIMIT_SO, soTotal)} of ${soTotal}`
              : 'No results'}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={soPage <= 1} onClick={() => setSOPage(p => p - 1)}>
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <span className="px-2 text-xs text-muted-foreground">{soPage} / {soTotalPages}</span>
            <Button variant="outline" size="sm" disabled={soPage >= soTotalPages} onClick={() => setSOPage(p => p + 1)}>
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        </div>
      </div>

      {/* ── Service Credit Applications ── */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Service Credit Applications</h2>

      {/* SC Filter Panel */}
      <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <SlidersHorizontal className="size-3.5" />
          Search &amp; Filter
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          {/* App Number */}
          <div className="min-w-52 flex-1">
            <FilterLabel>Application Number</FilterLabel>
            <div className="relative">
              <Input
                placeholder="e.g. SC-A1B2C3D4"
                value={scDraft.appNumber}
                onChange={e => setSCDraft(d => ({ ...d, appNumber: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                className="pr-7 font-mono text-sm"
              />
              {scDraft.appNumber && (
                <button
                  type="button"
                  onClick={() => setSCDraft(d => ({ ...d, appNumber: '' }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Type */}
          <div className="w-36">
            <FilterLabel>Type</FilterLabel>
            <Select value={scDraft.type} onValueChange={v => setSCDraft(d => ({ ...d, type: v }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CTO">CTO</SelectItem>
                <SelectItem value="VSC">VSC</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Year */}
          <div className="w-28">
            <FilterLabel>Year</FilterLabel>
            <Select value={scDraft.year} onValueChange={v => setSCDraft(d => ({ ...d, year: v }))}>
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

          {/* Date From */}
          <div className="w-36">
            <FilterLabel>Date From</FilterLabel>
            <Input
              type="date"
              value={scDraft.dateFrom}
              onChange={e => setSCDraft(d => ({ ...d, dateFrom: e.target.value }))}
            />
          </div>

          {/* Date To */}
          <div className="w-36">
            <FilterLabel>Date To</FilterLabel>
            <Input
              type="date"
              value={scDraft.dateTo}
              onChange={e => setSCDraft(d => ({ ...d, dateTo: e.target.value }))}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {(scApplied.appNumber || scApplied.type || scApplied.year || scApplied.dateFrom || scApplied.dateTo) && !scQuery.isLoading && (
              scTotal > 0
                ? `${scTotal} result${scTotal === 1 ? '' : 's'} found`
                : 'No results'
            )}
          </p>
          <div className="flex items-center gap-2">
            {(scApplied.appNumber || scApplied.type || scApplied.year || scApplied.dateFrom || scApplied.dateTo) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="size-3.5" />
                Clear
              </Button>
            )}
            <Button size="sm" onClick={applyFilters}>
              <Search className="size-3.5" />
              Search
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Records</p>
            {scTotal > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">{scTotal} record{scTotal !== 1 ? 's' : ''}</p>
            )}
          </div>
          <Button size="sm" onClick={() => setAddSCOpen(true)}>
            <PlusCircle className="size-4" />
            Add New VSC / CTO
          </Button>
        </div>

        {scQuery.isError && (
          <p className="px-4 py-3 text-sm text-destructive">Failed to load service credit applications.</p>
        )}

        {scQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted">
                  {['App No.', 'Employee', 'Type', 'Special Order', 'Inclusive Dates', 'Hours / Balance', 'Date Filed', 'Valid Until'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {applications.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No service credit applications yet.
                    </td>
                  </tr>
                )}
                {applications.map(app => (
                  <tr key={app.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium whitespace-nowrap">
                      {app.application_number}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {employeeMap.get(app.employee_id) ?? `Employee #${app.employee_id}`}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[app.type] ?? 'bg-muted text-muted-foreground'}`}>
                        {app.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {app.special_order ?? '—'}
                      {app.activity_name && (
                        <span className="block text-xs text-muted-foreground">{app.activity_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {app.participation_dates?.length
                        ? app.participation_dates.map(d => (
                            <span key={d} className="block whitespace-nowrap text-xs">{fmtDate(d)}</span>
                          ))
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                      <span>{app.hours_rendered}h</span>
                      <span className="mx-1 text-muted-foreground">/</span>
                      <span className="font-medium">{app.balance_earned} days</span>
                    </td>
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap">{fmtDate(app.date_filed)}</td>
                    <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                      {app.type === 'CTO' ? fmtDate(app.valid_until) : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isExactLookup && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
              {scTotal > 0
                ? `${(scPage - 1) * LIMIT_SC + 1}–${Math.min(scPage * LIMIT_SC, scTotal)} of ${scTotal}`
                : 'No results'}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={scPage <= 1} onClick={() => setSCPage(p => p - 1)}>
                <ChevronLeft className="size-4" />
                Prev
              </Button>
              <span className="px-2 text-xs text-muted-foreground">{scPage} / {scTotalPages}</span>
              <Button variant="outline" size="sm" disabled={scPage >= scTotalPages} onClick={() => setSCPage(p => p + 1)}>
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
      </div>

      <AddSOModal
        open={addSOOpen}
        onClose={() => setAddSOOpen(false)}
        onSuccess={() => { invalidateSO(); setSOPage(1) }}
      />

      <SODetailModal
        specialOrderId={selectedSOId}
        onClose={() => setSelectedSOId(null)}
      />

      <AddSCModal
        open={addSCOpen}
        onClose={() => setAddSCOpen(false)}
        onSuccess={() => { invalidateSC(); setSCPage(1) }}
        specialOrders={allSOQuery.data?.data ?? []}
      />
    </div>
  )
}
