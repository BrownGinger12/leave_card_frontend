export type DurationType  = 'FULL_DAY' | 'HALF_DAY'
export type HalfDayPeriod = 'AM' | 'PM'

export interface LeaveDate {
  leave_date:       string
  duration_type:    DurationType
  half_day_period:  HalfDayPeriod | null
  is_paid:          boolean
}

export interface LedgerEntry {
  transaction_number:    string
  transaction_type:      'CREDIT' | 'DEBIT'
  amount:                number
  balance_snapshot_after: number
  leave_type_code:       string
  transaction_date?:     string
  remarks?:              string
}

export interface LeaveApplication {
  id:                       number
  application_number:       string
  employee_id:              number
  leave_type_id:            number
  leave_type_code?:         string
  leave_type_name?:         string
  date_filed:               string
  start_date:               string
  end_date:                 string
  total_days:               number
  reason?:                  string
  other_leave_description?: string
  status: 'FOR HRMO ACTION' | 'FOR APPROVAL' | 'APPROVED' | 'RETURNED' | 'DISAPPROVED'
  approved_by_username?:    string
  disapproval_reason?:      string
  status_updated_by?:       number | null
  with_pay?:                boolean | number
  created_at?:              string
  updated_at?:              string
  deduction?:               number
  balance_after?:           number
  vl_balance_after?:        number
  sl_balance_after?:        number
  leave_dates?:             LeaveDate[]
  ledger?:                  LedgerEntry[]
  employee?: {
    id:              number
    first_name:      string
    last_name:       string
    employee_number: string
  }
}

export interface LeaveApplicationCreatePayload {
  employee_id:              number
  leave_type_id:            number
  date_filed:               string
  reason:                   string
  other_leave_description?: string | null
  dates:                    LeaveDate[]
}

export interface LeaveApplicationListResponse {
  statusCode: number
  count:      number
  total:      number
  page:       number
  limit:      number
  data:       LeaveApplication[]
}

export interface ApplicationsByYearResponse {
  statusCode: number
  employee: { id: number; first_name: string; last_name: string; employee_number: string }
  year:  number
  count: number
  data:  LeaveApplication[]
}
