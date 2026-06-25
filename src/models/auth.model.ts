export interface AuthUser {
  id: number
  employee_id: number
  username: string
  role: string
  first_name: string
  last_name: string
  employee_number: string
}

export interface LoginPayload {
  username: string
  password: string
}

export interface LoginResponse {
  statusCode: number
  message: string
  token: string
  user: AuthUser
}
