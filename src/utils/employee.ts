import type { Employee } from '@/models/employee.model'

export function getFullName(employee: Employee): string {
  const middle = employee.middle_name ? ` ${employee.middle_name} ` : ' '
  return `${employee.first_name}${middle}${employee.last_name}`
}
