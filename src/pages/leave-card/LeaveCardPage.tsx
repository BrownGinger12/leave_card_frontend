import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { getFullName } from '@/utils/employee'
import { searchEmployees, getEmployee } from '@/services/employee.service'
import { getEmployeeApplicationsByYear } from '@/services/leave-application.service'
import { getEmployeeLeaveBalances } from '@/services/leave-balance.service'
import { getEmployeeMonthlyCreditsByYear } from '@/services/monthly-leave-credit.service'
import {
  getEmployeeCtoLeaveSummary,
  getEmployeeVscOldLeaveSummary,
  getEmployeeVscNewLeaveSummary,
  type CtoLeaveSummaryCredit,
  type CtoLeaveSummaryLeaveApp,
} from '@/services/service-credit-application.service'
import type { Employee } from '@/models/employee.model'
import type { LeaveApplication } from '@/models/leave-application.model'
import type { MonthlyLeaveCredit } from '@/models/monthly-leave-credit.model'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Types ────────────────────────────────────────────────────────────────────

type IncCol = 'vl' | 'sl' | 'wl' | 'spl' | 'fl' | 'solo' | 'mon' | 'others'

const COL_MAP: Record<string, IncCol> = {
  VL: 'vl', SL: 'sl', WL: 'wl', SPL: 'spl',
  FL: 'fl', SLPSP: 'solo', SLP: 'solo', MON: 'mon',
}

function toCol(code?: string): IncCol {
  if (!code) return 'others'
  return COL_MAP[code.toUpperCase()] ?? 'others'
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

function fmtNum(n?: number | string | null) {
  if (n == null || n === '') return ''
  const v = Number(n)
  if (isNaN(v)) return ''
  return v % 1 === 0 ? String(v) : v.toFixed(3)
}

function fmtSalary(n?: number) {
  if (!n) return '—'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
}

function toMonthKey(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  // Fast path: standard ISO format YYYY-MM-...
  const iso = dateStr.match(/^(\d{4})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`
  // Fallback: let the Date constructor parse it, use UTC to avoid day-shift
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

// Leaves are grouped under the PRECEDING month's credit period
// e.g. July leaves appear under June, February leaves under January
function toPrecedingMonthKey(dateStr: string | null | undefined): string | null {
  const mk = toMonthKey(dateStr)
  if (!mk) return null
  const [y, m] = mk.split('-').map(Number)
  const prev = new Date(y, m - 2, 1) // m-1 for 0-index, then -1 for previous month
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

function fmtPeriod(mk: string) {
  const [y, m] = mk.split('-').map(Number)
  const last = new Date(y, m, 0)
  return last.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()
}

// ─── Status ───────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  'FOR HRMO ACTION': 'bg-amber-100 text-amber-800',
  'FOR APPROVAL':    'bg-blue-100 text-blue-800',
  'APPROVED':        'bg-green-100 text-green-800',
  'RETURNED':        'bg-orange-100 text-orange-800',
  'DISAPPROVED':     'bg-red-100 text-red-800',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || '—'}</p>
    </div>
  )
}

function Th({ children, rowSpan, colSpan, className = '' }: {
  children: React.ReactNode; rowSpan?: number; colSpan?: number; className?: string
}) {
  return (
    <th rowSpan={rowSpan} colSpan={colSpan}
      className={`border border-border bg-muted px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap ${className}`}>
      {children}
    </th>
  )
}

function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={`border border-border px-3 py-2 text-sm text-foreground ${className}`}>
      {children ?? ''}
    </td>
  )
}

// 26 columns total (Period + DateFiled + DatesWithPay + DatesWithoutPay + DateIncurred + Type + 2 credits + 9 incurred + Remarks + 3 balance + AppNo + Status + Reason + Username + DateOfAction)
const TOTAL_COLS = 26

function EmptyTds({ count }: { count: number }) {
  return <>{Array.from({ length: count }).map((_, i) => <Td key={i} />)}</>
}

function YearPicker({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => onChange(year - 1)}
        className="rounded p-1 hover:bg-muted transition-colors">
        <ChevronLeft className="size-4 text-muted-foreground" />
      </button>
      <span className="w-12 text-center text-sm font-semibold tabular-nums">{year}</span>
      <button type="button" onClick={() => onChange(year + 1)}
        disabled={year >= new Date().getFullYear()}
        className="rounded p-1 hover:bg-muted transition-colors disabled:opacity-40">
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>
    </div>
  )
}

// ─── Credit summary helpers ───────────────────────────────────────────────────

type CocRow     = { kind: 'coc'; data: CtoLeaveSummaryCredit;   runningBalance: number }
type CtoLeafRow = { kind: 'cto'; data: CtoLeaveSummaryLeaveApp; runningBalance: number }
type CreditRow  = CocRow | CtoLeafRow

function buildCreditRows(data: CtoLeaveSummaryCredit[]): CreditRow[] {
  const rows: CreditRow[] = []
  for (const credit of data) {
    rows.push({ kind: 'coc', data: credit, runningBalance: Number(credit.remaining_balance ?? 0) })
    for (const leaf of credit.leave_applications) {
      rows.push({ kind: 'cto', data: leaf, runningBalance: Number(leaf.balance_after ?? 0) })
    }
  }
  return rows
}

function CreditSummaryTable({
  rows,
  creditLabel,
  leaveLabel,
  showValidUntil = true,
}: {
  rows: CreditRow[]
  creditLabel: string
  leaveLabel: string
  showValidUntil?: boolean
}) {
  const cocCols = showValidUntil ? 9 : 8
  const totalCols = cocCols + 1 + 9 // credit + balance + leave
  return (
    <div className="overflow-x-auto">
      <table className="min-w-max border-collapse">
        <thead>
          <tr>
            <Th colSpan={cocCols} className="bg-blue-50 text-blue-900">{creditLabel}</Th>
            <Th className="bg-gray-100 text-gray-800 min-w-24">BALANCE</Th>
            <Th colSpan={9} className="bg-green-50 text-green-900">{leaveLabel}</Th>
          </tr>
          <tr>
            <Th className="min-w-36">Special Order No.</Th>
            <Th className="min-w-32">Date of Activity</Th>
            <Th className="min-w-40">Activity</Th>
            <Th className="min-w-44">Inclusive Date/s of Activity with Approved VSC</Th>
            {showValidUntil && <Th className="min-w-28">Valid Until</Th>}
            <Th className="min-w-28">Hours Served / Earned</Th>
            <Th className="min-w-28">No. of Day(s) Earned</Th>
            <Th className="min-w-36">Uploaded By</Th>
            <Th className="min-w-28">Date of Upload</Th>
            <Th className="bg-gray-100 min-w-24">Balance</Th>
            <Th className="min-w-28">Date Filed</Th>
            <Th className="min-w-28">Date of Leave</Th>
            <Th className="min-w-32">No. of Days (Used COCs)</Th>
            <Th className="min-w-40">Remarks</Th>
            <Th className="min-w-36">Control No.</Th>
            <Th className="min-w-28">Status Update</Th>
            <Th className="min-w-52">Reason/S: If Returned or Disapproved</Th>
            <Th className="min-w-32">Username</Th>
            <Th className="min-w-28">Date of Action</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={totalCols} className="border border-border px-4 py-10 text-center text-sm text-muted-foreground">
                No records found.
              </td>
            </tr>
          )}
          {rows.map((row, idx) => {
            if (row.kind === 'coc') {
              const c = row.data
              return (
                <tr key={`coc-${c.credit_balance_id}-${idx}`} className="bg-blue-50/20 hover:bg-blue-50/50 transition-colors">
                  <Td className="font-mono text-xs font-semibold">{c.special_order_number ?? '—'}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(c.date_of_activity)}</Td>
                  <Td>{c.activity_name ?? '—'}</Td>
                  <Td>
                    {c.participation_dates?.length
                      ? c.participation_dates.map((d, i) => (
                          <span key={i} className="block whitespace-nowrap text-xs">{fmtDate(d)}</span>
                        ))
                      : '—'}
                  </Td>
                  {showValidUntil && <Td className="whitespace-nowrap">{c.valid_until ? fmtDate(c.valid_until) : '—'}</Td>}
                  <Td className="text-center font-semibold text-green-700">{fmtNum(c.hours_rendered)}</Td>
                  <Td className="text-center font-bold text-green-800">{fmtNum(c.balance_earned)}</Td>
                  <Td className="text-muted-foreground">{c.uploaded_by_name ?? '—'}</Td>
                  <Td className="whitespace-nowrap">{c.date_of_upload ? fmtDate(c.date_of_upload) : '—'}</Td>
                  <Td className="text-center font-bold bg-gray-50 text-blue-900">{fmtNum(row.runningBalance)}</Td>
                  <EmptyTds count={9} />
                </tr>
              )
            }
            const l = row.data
            return (
              <tr key={`leaf-${l.id}-${idx}`} className="hover:bg-green-50/20 transition-colors">
                <EmptyTds count={cocCols} />
                <Td className="text-center font-bold bg-gray-50 text-green-900">{fmtNum(l.balance_after)}</Td>
                <Td className="whitespace-nowrap">{fmtDate(l.date_filed)}</Td>
                <Td className="whitespace-nowrap">{fmtDate(l.start_date)}</Td>
                <Td className="text-center font-semibold text-red-700">{fmtNum(l.total_days)}</Td>
                <Td className="text-muted-foreground">{l.remarks ?? '—'}</Td>
                <Td className="font-mono text-xs whitespace-nowrap">{l.application_number}</Td>
                <Td>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[l.status] ?? ''}`}>
                    {l.status}
                  </span>
                </Td>
                <Td className="text-destructive">{l.other_leave_description ?? '—'}</Td>
                <Td className="text-muted-foreground">{l.approver_name ?? l.username ?? '—'}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">{l.date_of_action ? fmtDate(l.date_of_action) : '—'}</Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeaveCardPage() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState<Employee | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [tableView, setTableView] = useState<'leave' | 'cto' | 'vsc-old' | 'vsc-new'>('leave')
  const [hideExpiredCto, setHideExpiredCto] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const { data: suggestions = [] } = useQuery({
    queryKey: ['employee-search', debouncedQuery],
    queryFn: () => searchEmployees(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2,
  })

  function handleSelect(emp: Employee) {
    setSelected(emp)
    setQuery(getFullName(emp))
    setIsOpen(false)
    setTableView(emp.employee_type === 'TEACHING' ? 'vsc-old' : 'leave')
  }

  function handleClear() {
    setSelected(null)
    setQuery('')
    setDebouncedQuery('')
  }

  // ── Data ────────────────────────────────────────────────────────────────────

  const isTeaching = selected?.employee_type === 'TEACHING'

  const { data: yearData, isLoading: appsLoading, isError: appsError } = useQuery({
    queryKey: ['employee-applications-year', selected?.id, year],
    queryFn: () => getEmployeeApplicationsByYear(selected!.id, year),
    enabled: !!selected && !isTeaching && tableView === 'leave',
  })

  const { data: creditsData, isLoading: creditsLoading } = useQuery({
    queryKey: ['employee-monthly-credits-year', selected?.id, year],
    queryFn: () => getEmployeeMonthlyCreditsByYear(selected!.id, year),
    enabled: !!selected && !isTeaching && tableView === 'leave',
  })

  const { data: balances = [], isLoading: balancesLoading } = useQuery({
    queryKey: ['employee-leave-balances', selected?.id],
    queryFn: () => getEmployeeLeaveBalances(selected!.id),
    enabled: !!selected && !isTeaching,
  })

  const { data: ctoSummaryData, isLoading: ctoSummaryLoading, isError: ctoSummaryError } = useQuery({
    queryKey: ['cto-leave-summary', selected?.id],
    queryFn: () => getEmployeeCtoLeaveSummary(selected!.id),
    enabled: !!selected && tableView === 'cto',
  })

  const { data: vscOldData, isLoading: vscOldLoading, isError: vscOldError } = useQuery({
    queryKey: ['vsc-old-leave-summary', selected?.id],
    queryFn: () => getEmployeeVscOldLeaveSummary(selected!.id),
    enabled: !!selected && isTeaching && tableView === 'vsc-old',
  })

  const { data: vscNewData, isLoading: vscNewLoading, isError: vscNewError } = useQuery({
    queryKey: ['vsc-new-leave-summary', selected?.id],
    queryFn: () => getEmployeeVscNewLeaveSummary(selected!.id),
    enabled: !!selected && isTeaching && tableView === 'vsc-new',
  })

  const filteredCtoData = useMemo(() => {
    const data = ctoSummaryData?.data ?? []
    if (!hideExpiredCto) return data
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return data.filter(c => !c.valid_until || new Date(c.valid_until) >= now)
  }, [ctoSummaryData, hideExpiredCto])

  const ctoRows    = useMemo(() => buildCreditRows(filteredCtoData), [filteredCtoData])
  const vscOldRows = useMemo(() => buildCreditRows(vscOldData?.data ?? []), [vscOldData])
  const vscNewRows = useMemo(() => buildCreditRows(vscNewData?.data ?? []), [vscNewData])

  const applications: LeaveApplication[] = (yearData?.data ?? []).filter(
    app => app.leave_type_code !== 'CTO' && app.leave_type_code !== 'VSC',
  )
  const credits: MonthlyLeaveCredit[] = creditsData?.data ?? []

  // Collect unique status_updated_by IDs to resolve names via GET /employees/:id
  const statusUpdatedByIds = useMemo(() => {
    const ids = new Set<number>()
    for (const app of applications) {
      if (app.status_updated_by) ids.add(app.status_updated_by)
    }
    return [...ids]
  }, [applications])

  const employeeResults = useQueries({
    queries: statusUpdatedByIds.map(id => ({
      queryKey: ['employee', id],
      queryFn: () => getEmployee(id),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const userMap = useMemo(() => {
    const map = new Map<number, string>()
    statusUpdatedByIds.forEach((id, idx) => {
      const emp = employeeResults[idx]?.data
      if (emp) map.set(id, `${emp.first_name} ${emp.last_name}`)
    })
    return map
  }, [statusUpdatedByIds, employeeResults])

  const isLoading = appsLoading || creditsLoading || balancesLoading

  // ── Build grouped months ────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, { credits: MonthlyLeaveCredit[]; apps: LeaveApplication[] }>()

    const ensure = (mk: string) => {
      if (!map.has(mk)) map.set(mk, { credits: [], apps: [] })
      return map.get(mk)!
    }

    for (const credit of credits) {
      const mk = `${credit.year}-${String(credit.month).padStart(2, '0')}`
      ensure(mk).credits.push(credit)
    }

    for (const app of applications) {
      const mk = toPrecedingMonthKey(app.start_date)
      if (mk !== null) ensure(mk).apps.push(app)
    }

    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [applications, credits])

  const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
    PERMANENT: 'default', TEMPORARY: 'secondary', CASUAL: 'secondary', CONTRACT_OF_SERVICE: 'outline',
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Leave Card</h1>
        <p className="text-muted-foreground mt-1">Search an employee to view their leave card.</p>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 max-w-sm" ref={containerRef}>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search employee"
            value={query}
            onChange={e => { setQuery(e.target.value); setIsOpen(true); if (!e.target.value) setSelected(null) }}
            onFocus={() => debouncedQuery.length >= 2 && setIsOpen(true)}
            className="pl-8 pr-8"
          />
          {query && (
            <button type="button" onClick={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <X className="size-4" />
            </button>
          )}
          {isOpen && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-md border border-border bg-popover shadow-md overflow-hidden">
              {suggestions.map(emp => (
                <button key={emp.id} type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleSelect(emp)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors">
                  <span className="font-medium">{getFullName(emp)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{emp.employee_number}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!selected && (
        <div className="flex flex-col items-center justify-center h-64 rounded-lg border border-dashed border-border text-muted-foreground">
          <Search className="size-10 mb-3 opacity-25" />
          <p className="text-sm">Search and select an employee to view their leave card.</p>
        </div>
      )}

      {selected && (
        <>
          {/* ── Employee card ──────────────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-start justify-between border-b border-border px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {selected.division ?? 'Schools Division'}
                </p>
                <h2 className="mt-1 text-lg font-bold text-foreground">{getFullName(selected)}</h2>
                <p className="text-sm text-muted-foreground">{selected.email}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Leave Card No.</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-foreground">{selected.leave_card_number}</p>
              </div>
            </div>

            <div className="px-6 py-4 border-b border-border">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personal Information</p>
              <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                <Field label="Surname" value={selected.last_name} />
                <Field label="Given Name" value={selected.first_name} />
                <Field label="Middle Name" value={selected.middle_name} />
              </div>
            </div>

            <div className="px-6 py-4 border-b border-border">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employment Details</p>
              <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                <Field label="Employee Number" value={selected.employee_number} />
                <Field label="Status" value={
                  <Badge variant={statusVariant[selected.employment_status] ?? 'outline'} className="mt-0.5">
                    {selected.employment_status.replace(/_/g, ' ')}
                  </Badge>
                } />
                <Field label="Employee Type" value={
                  <Badge variant={selected.employee_type === 'TEACHING' ? 'default' : 'secondary'} className="mt-0.5">
                    {selected.employee_type === 'TEACHING' ? 'Teaching' : 'Non-Teaching'}
                  </Badge>
                } />
                <Field label="Position" value={selected.position} />
                <Field label="Division / Unit / School" value={selected.division} />
                <Field label="Salary" value={fmtSalary(selected.salary)} />
              </div>
            </div>

            <div className="px-6 py-4 border-b border-border">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appointment</p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Field label="Original Appointment" value={selected.original_appointment
                  ? new Date(selected.original_appointment).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : undefined} />
                <Field label="Latest Appointment" value={selected.latest_appointment
                  ? new Date(selected.latest_appointment).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : undefined} />
              </div>
            </div>

            <div className="px-6 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Field label="Email Address" value={selected.email} />
                <Field label="Phone Number" value={selected.contact_number} />
              </div>
            </div>
          </div>

          {/* ── Ledger / CTO table ────────────────────────────────────────── */}
          <div className="mt-4 rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              {/* Tab switch */}
              <div className="flex items-center gap-1 rounded-md bg-muted p-1">
                {isTeaching ? (
                  <>
                    <button type="button" onClick={() => setTableView('vsc-old')}
                      className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${tableView === 'vsc-old' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      VSC Below 9/31/24
                    </button>
                    <button type="button" onClick={() => setTableView('vsc-new')}
                      className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${tableView === 'vsc-new' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      VSC Above 10/1/24
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setTableView('leave')}
                      className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${tableView === 'leave' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      Leave Ledger
                    </button>
                    <button type="button" onClick={() => setTableView('cto')}
                      className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${tableView === 'cto' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      CTO / VSC Credits
                    </button>
                  </>
                )}
              </div>
              {tableView === 'leave' && <YearPicker year={year} onChange={setYear} />}
              {tableView === 'cto' && (
                <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideExpiredCto}
                    onChange={e => setHideExpiredCto(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  Hide expired
                </label>
              )}
            </div>

            {tableView === 'vsc-old' && (
              <div>
                {vscOldError && (
                  <p className="px-4 py-3 text-sm text-destructive">Failed to load VSC (old period) data.</p>
                )}
                {vscOldLoading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : (
                  <CreditSummaryTable
                    rows={vscOldRows}
                    creditLabel="VACATION SERVICE CREDITS (VSC) — BEFORE OCTOBER 1, 2024"
                    leaveLabel="VSC LEAVE APPLICATIONS"
                    showValidUntil={false}
                  />
                )}
              </div>
            )}

            {tableView === 'vsc-new' && (
              <div>
                {vscNewError && (
                  <p className="px-4 py-3 text-sm text-destructive">Failed to load VSC (new period) data.</p>
                )}
                {vscNewLoading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : (
                  <CreditSummaryTable
                    rows={vscNewRows}
                    creditLabel="VACATION SERVICE CREDITS (VSC) — OCTOBER 1, 2024 ONWARDS"
                    leaveLabel="VSC LEAVE APPLICATIONS"
                    showValidUntil={false}
                  />
                )}
              </div>
            )}

            {tableView === 'leave' && !isTeaching && <div className="overflow-x-auto">
              {appsError && (
                <p className="px-4 py-3 text-sm text-destructive">
                  Failed to load leave applications for {year}. Check the browser console for details.
                </p>
              )}
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (
                <table className="min-w-max border-collapse">
                  <thead>
                    <tr>
                      <Th rowSpan={2} className="sticky left-0 z-10 min-w-44 text-left">Period</Th>
                      <Th colSpan={2}>Leave Credits Earned</Th>
                      <Th rowSpan={2}>Date Filed</Th>
                      <Th rowSpan={2} className="min-w-36">Date Leave Incurred w/ Pay</Th>
                      <Th rowSpan={2} className="min-w-36">Date Leave Incurred w/o Pay</Th>
                      <Th rowSpan={2}>Date Incurred</Th>
                      <Th rowSpan={2} className="min-w-36">Type of Leave</Th>
                      <Th colSpan={9}>Leave Incurred</Th>
                      <Th rowSpan={2}>Remarks</Th>
                      <Th colSpan={3}>Balance</Th>
                      <Th rowSpan={2} className="min-w-32">Application No.</Th>
                      <Th rowSpan={2} className="min-w-28">Status</Th>
                      <Th rowSpan={2} className="min-w-40">Reason if Returned / Disapproved</Th>
                      <Th rowSpan={2}>Username</Th>
                      <Th rowSpan={2}>Date of Action</Th>
                    </tr>
                    <tr>
                      {/* Credits */}
                      <Th>VL</Th>
                      <Th>SL</Th>
                      {/* Incurred */}
                      <Th>VL</Th>
                      <Th>SL</Th>
                      <Th>WL</Th>
                      <Th>SPL</Th>
                      <Th>FL</Th>
                      <Th>Solo Parent</Th>
                      <Th>Monetization</Th>
                      <Th>Others</Th>
                      <Th>Total</Th>
                      {/* Balance */}
                      <Th>VL</Th>
                      <Th>SL</Th>
                      <Th>Total</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {/* Balance Forwarded */}
                    <tr className="bg-muted/40">
                      <Td className="sticky left-0 z-10 bg-muted/60 font-bold">Balance Forwarded</Td>
                      <EmptyTds count={TOTAL_COLS - 1} />
                    </tr>

                    {grouped.length === 0 && (
                      <tr>
                        <td colSpan={TOTAL_COLS} className="border border-border px-4 py-10 text-center text-sm text-muted-foreground">
                          No data for {year}.
                        </td>
                      </tr>
                    )}

                    {grouped.map(([mk, { credits: monthCredits, apps }]) => {
                      const vlCredit = monthCredits.find(c => c.leave_type_code.toUpperCase() === 'VL')
                      const slCredit = monthCredits.find(c => c.leave_type_code.toUpperCase() === 'SL')
                      const vlSnap = vlCredit ? Number(vlCredit.balance_snapshot_after) : null
                      const slSnap = slCredit ? Number(slCredit.balance_snapshot_after) : null

                      return (
                        <>
                          {/* Month period header — credits earned shown inline */}
                          <tr key={`period-${mk}`} className="bg-muted/30">
                            <Td className="sticky left-0 z-10 bg-muted/50 font-bold whitespace-nowrap">
                              {fmtPeriod(mk)}
                            </Td>
                            {/* Credits earned */}
                            <Td className="text-center font-semibold text-green-700">{fmtNum(vlCredit?.amount)}</Td>
                            <Td className="text-center font-semibold text-green-700">{fmtNum(slCredit?.amount)}</Td>
                            <EmptyTds count={5} />
                            {/* Leave incurred — blank on period row */}
                            <EmptyTds count={9} />
                            {/* Remarks */}
                            <Td />
                            {/* Balance after credits */}
                            <Td className="text-center font-semibold">{fmtNum(vlSnap)}</Td>
                            <Td className="text-center font-semibold">{fmtNum(slSnap)}</Td>
                            <Td className="text-center font-bold">
                              {vlSnap != null && slSnap != null ? fmtNum(vlSnap + slSnap) : ''}
                            </Td>
                            <EmptyTds count={5} />
                          </tr>

                          {/* Application rows */}
                          {apps.map(app => {
                            const col         = toCol(app.leave_type_code)
                            const isMaternity = app.leave_type_name?.toLowerCase().includes('maternity') ?? false
                            const deducted    = isMaternity
                              ? (app.status !== 'RETURNED' && app.status !== 'DISAPPROVED')
                              : (app.deduction ?? 0) !== 0
                            const days        = deducted
                              ? isMaternity && app.start_date && app.end_date
                                ? Math.round((new Date(app.end_date + 'T12:00:00').getTime() - new Date(app.start_date + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)) + 1
                                : Math.abs(app.deduction ?? 0)
                              : undefined
                            const vlBal       = app.vl_balance_after ?? null
                            const slBal       = app.sl_balance_after ?? null

                            return (
                              <tr key={`app-${app.id}`} className="hover:bg-muted/10 transition-colors">
                                <Td className="sticky left-0 z-10 bg-card" />
                                {/* Credits — blank for application rows */}
                                <Td /><Td />
                                <Td className="whitespace-nowrap">{fmtDate(app.date_filed)}</Td>
                                <Td>
                                  {isMaternity
                                    ? <span className="whitespace-nowrap text-xs">{fmtDate(app.start_date)} – {fmtDate(app.end_date)}</span>
                                    : app.leave_dates?.filter(d => d.is_paid).map((d, i) => (
                                        <span key={i} className="block whitespace-nowrap text-xs">{fmtDate(d.leave_date)}</span>
                                      ))}
                                </Td>
                                <Td>
                                  {!isMaternity && app.leave_dates?.filter(d => !d.is_paid).map((d, i) => (
                                    <span key={i} className="block whitespace-nowrap text-xs">{fmtDate(d.leave_date)}</span>
                                  ))}
                                </Td>
                                <Td className="whitespace-nowrap">{fmtDate(app.start_date)}</Td>
                                <Td className="whitespace-nowrap">{app.leave_type_name ?? app.leave_type_code}</Td>
                                {/* Incurred — only in the column matching this leave type */}
                                <Td className="text-center">{col === 'vl'     ? fmtNum(days) : ''}</Td>
                                <Td className="text-center">{col === 'sl'     ? fmtNum(days) : ''}</Td>
                                <Td className="text-center">{col === 'wl'     ? fmtNum(days) : ''}</Td>
                                <Td className="text-center">{col === 'spl'    ? fmtNum(days) : ''}</Td>
                                <Td className="text-center">{col === 'fl'     ? fmtNum(days) : ''}</Td>
                                <Td className="text-center">{col === 'solo'   ? fmtNum(days) : ''}</Td>
                                <Td className="text-center">{col === 'mon'    ? fmtNum(days) : ''}</Td>
                                <Td className="text-center">{col === 'others' ? fmtNum(days) : ''}</Td>
                                <Td className="text-center font-semibold">{fmtNum(days)}</Td>
                                {/* Remarks */}
                                <Td className="text-muted-foreground">{app.other_leave_description}</Td>
                                {/* Running balance — VL and SL tracked across all rows; total = VL + SL */}
                                <Td className="text-center font-semibold">{vlBal != null ? fmtNum(vlBal) : ''}</Td>
                                <Td className="text-center font-semibold">{slBal != null ? fmtNum(slBal) : ''}</Td>
                                <Td className="text-center font-bold">
                                  {vlBal != null && slBal != null ? fmtNum(vlBal + slBal) : (vlBal ?? slBal) != null ? fmtNum((vlBal ?? slBal)!) : ''}
                                </Td>
                                {/* Application info */}
                                <Td className="font-mono text-xs whitespace-nowrap">{app.application_number}</Td>
                                <Td>
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[app.status] ?? ''}`}>
                                    {app.status}
                                  </span>
                                </Td>
                                <Td className="text-destructive">{app.disapproval_reason}</Td>
                                <Td className="text-muted-foreground">
                                  {app.status_updated_by ? (userMap.get(app.status_updated_by) ?? '') : ''}
                                </Td>
                                <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(app.updated_at)}</Td>
                              </tr>
                            )
                          })}
                        </>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="border-t-2 border-blue-300">
                      <td className="sticky left-0 z-10 border border-border bg-blue-200 px-3 py-2 text-sm font-bold whitespace-nowrap text-blue-900">
                        Balance
                      </td>
                      {/* CredVL, CredSL, DateFiled, DatesWithPay, DatesWithoutPay, DateIncurred, Type, IncVL, IncSL */}
                      <EmptyTds count={9} />
                      {/* WL */}
                      <td className="border border-border bg-blue-100 px-3 py-2 text-center text-sm font-bold text-blue-900">
                        {fmtNum(balances.find(b => b.code === 'WL')?.balance)}
                      </td>
                      {/* SPL */}
                      <td className="border border-border bg-blue-100 px-3 py-2 text-center text-sm font-bold text-blue-900">
                        {fmtNum(balances.find(b => b.code === 'SPL')?.balance)}
                      </td>
                      {/* FL */}
                      <td className="border border-border bg-blue-100 px-3 py-2 text-center text-sm font-bold text-blue-900">
                        {fmtNum(balances.find(b => b.code === 'FL')?.balance)}
                      </td>
                      {/* Solo, Mon, Others, IncTotal, Remarks, BalVL, BalSL, BalTotal, AppNo, Status, Reason, Username, DateOfAction */}
                      <EmptyTds count={13} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>}

            {tableView === 'cto' && (
              <div>
                {ctoSummaryError && (
                  <p className="px-4 py-3 text-sm text-destructive">Failed to load CTO / VSC summary.</p>
                )}
                {ctoSummaryLoading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : (
                  <CreditSummaryTable
                    rows={ctoRows}
                    creditLabel="COMPENSATORY OVERTIME CREDITS (COC)"
                    leaveLabel="COMPENSATORY TIME-OFF (CTO)"
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
