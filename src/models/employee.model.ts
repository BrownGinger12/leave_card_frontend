export interface Employee {
  id: number
  leave_card_number: string
  employee_number: string
  first_name: string
  middle_name?: string
  last_name: string
  email: string
  employee_type: 'TEACHING' | 'NON_TEACHING'
  employment_status: 'PERMANENT' | 'TEMPORARY' | 'CASUAL' | 'CONTRACT_OF_SERVICE'
  school_id: number
  division?: string
  position?: string
  salary?: number
  contact_number?: string
  original_appointment?: string
  latest_appointment?: string
  is_active?: boolean
  photo?: string
  created_at?: string
  updated_at?: string
}

export interface EmployeeCreatePayload {
  employee_number: string
  first_name: string
  last_name: string
  middle_name?: string
  email: string
  employee_type: 'TEACHING' | 'NON_TEACHING'
  employment_status: 'PERMANENT' | 'TEMPORARY' | 'CASUAL' | 'CONTRACT_OF_SERVICE'
  school_id: number
  leave_card_number?: string
  division?: string
  position?: string
  salary?: number
  contact_number?: string
  original_appointment?: string
  latest_appointment?: string
  is_active?: boolean
}

export interface EmployeeUpdatePayload {
  first_name?: string
  last_name?: string
  middle_name?: string
  email?: string
  employee_type?: 'TEACHING' | 'NON_TEACHING'
  employment_status?: 'PERMANENT' | 'TEMPORARY' | 'CASUAL' | 'CONTRACT_OF_SERVICE'
  school_id?: number
  division?: string
  position?: string
  salary?: number
  contact_number?: string
  original_appointment?: string
  latest_appointment?: string
  is_active?: boolean
}
