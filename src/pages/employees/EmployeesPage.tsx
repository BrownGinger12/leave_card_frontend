import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Search } from 'lucide-react'
import { useEmployees } from '@/hooks/useEmployees'
import { getFullName } from '@/utils/employee'
import type { Employee } from '@/models/employee.model'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Pagination from '@/components/common/Pagination'
import EmployeeModal from '@/components/modals/EmployeeModal'

type EmployeeTypeFilter = 'ALL' | 'TEACHING' | 'NON_TEACHING'
type SortDirection = 'asc' | 'desc'

const PAGE_SIZE = 10

export default function EmployeesPage() {
  const { data: employees, isLoading, isError, refetch } = useEmployees()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<EmployeeTypeFilter>('ALL')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | undefined>()

  const filtered = useMemo(() => {
    if (!employees) return []
    const term = search.trim().toLowerCase()
    return employees.filter((emp) => {
      const matchesType = typeFilter === 'ALL' || emp.employee_type === typeFilter
      const matchesSearch =
        term === '' ||
        getFullName(emp).toLowerCase().includes(term) ||
        emp.employee_number.toLowerCase().includes(term) ||
        emp.leave_card_number.toLowerCase().includes(term) ||
        emp.email.toLowerCase().includes(term)
      return matchesType && matchesSearch
    })
  }, [employees, search, typeFilter])

  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      const result = getFullName(a).localeCompare(getFullName(b))
      return sortDirection === 'asc' ? result : -result
    })
    return list
  }, [filtered, sortDirection])

  const totalPages = Math.max(Math.ceil(sorted.length / PAGE_SIZE), 1)
  const currentPage = Math.min(page, totalPages)
  const paginated = sorted.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  function openAdd() {
    setSelectedEmployee(undefined)
    setModalOpen(true)
  }

  function openEdit(emp: Employee) {
    setSelectedEmployee(emp)
    setModalOpen(true)
  }

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function updateTypeFilter(value: EmployeeTypeFilter) {
    setTypeFilter(value)
    setPage(1)
  }

  function toggleSort() {
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employees</h1>
          <p className="text-muted-foreground mt-1">Manage employee records.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="size-4" />
          Add Employee
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, employee no., leave card no., or email"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select
          value={typeFilter}
          onValueChange={(value) => updateTypeFilter(value as EmployeeTypeFilter)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Employee Types</SelectItem>
            <SelectItem value="TEACHING">Teaching</SelectItem>
            <SelectItem value="NON_TEACHING">Non-Teaching</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Leave Card Number</TableHead>
              <TableHead>Employee Number</TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={toggleSort}
                  className="flex items-center gap-1 font-medium hover:text-foreground"
                >
                  Full Name
                  {sortDirection === 'asc' ? (
                    <ArrowUp className="size-3.5" />
                  ) : (
                    <ArrowDown className="size-3.5" />
                  )}
                </button>
              </TableHead>
              <TableHead>Employee Type</TableHead>
              <TableHead>Employment Status</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && isError && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <p className="text-destructive">Failed to load employees.</p>
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="mt-2 text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Try again
                  </button>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && paginated.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-32 text-center text-muted-foreground"
                >
                  No employees found.
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              !isError &&
              paginated.map((emp) => (
                <TableRow
                  key={emp.id}
                  className="cursor-pointer"
                  onClick={() => openEdit(emp)}
                >
                  <TableCell>{emp.leave_card_number}</TableCell>
                  <TableCell>{emp.employee_number}</TableCell>
                  <TableCell>{getFullName(emp)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        emp.employee_type === 'TEACHING' ? 'default' : 'secondary'
                      }
                    >
                      {emp.employee_type === 'TEACHING' ? 'Teaching' : 'Non-Teaching'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {emp.employment_status.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell>{emp.email}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {!isLoading && !isError && (
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            totalItems={sorted.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </div>

      <EmployeeModal
        key={selectedEmployee ? `edit-${selectedEmployee.id}` : 'new-employee'}
        open={modalOpen}
        onOpenChange={setModalOpen}
        employee={selectedEmployee}
      />
    </div>
  )
}
