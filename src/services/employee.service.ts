import { api } from '@/lib/api'
import type { Employee, EmployeeCreatePayload, EmployeeUpdatePayload } from '@/models/employee.model'

interface ListResponse<T> {
  statusCode: number
  count: number
  total: number
  page: number
  limit: number
  data: T[]
}

interface SingleResponse<T> {
  statusCode: number
  message?: string
  data: T
}

export async function getEmployee(id: number): Promise<Employee> {
  const { data } = await api.get<SingleResponse<Employee>>(`/employees/${id}`)
  return data.data
}

export async function getEmployees(): Promise<Employee[]> {
  const { data } = await api.get<ListResponse<Employee>>('/employees', {
    params: { limit: 1000 },
  })
  return data.data
}

export async function createEmployee(payload: EmployeeCreatePayload): Promise<Employee> {
  const { data } = await api.post<SingleResponse<Employee>>('/employees', payload)
  return data.data
}

export async function updateEmployee(id: number, payload: EmployeeUpdatePayload): Promise<Employee> {
  const { data } = await api.put<SingleResponse<Employee>>(`/employees/${id}`, payload)
  return data.data
}

export async function searchEmployees(query: string): Promise<Employee[]> {
  const { data } = await api.get<{ statusCode: number; count: number; data: Employee[] }>(
    '/employees/search',
    { params: { query, limit: 10 } }
  )
  return data.data
}

export async function deleteEmployee(id: number): Promise<void> {
  await api.delete(`/employees/${id}`)
}

export async function uploadEmployeePhoto(id: number, file: File): Promise<Employee> {
  const formData = new FormData()
  formData.append('photo', file)
  const { data } = await api.post<SingleResponse<Employee>>(
    `/employees/${id}/photo`,
    formData
  )
  return data.data
}
