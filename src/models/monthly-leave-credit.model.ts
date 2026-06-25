export interface MonthlyLeaveCredit {
  id: number
  leave_type_code: string
  year: number
  month: number
  amount: number
  transaction_number: string
  transaction_type: 'CREDIT' | 'DEBIT'
  balance_snapshot_after: number
  transaction_date: string
  ledger_remarks?: string
}

export interface MonthlyCreditsByYearResponse {
  statusCode: number
  employee: { id: number; first_name: string; last_name: string; employee_number: string }
  year: number
  count: number
  data: MonthlyLeaveCredit[]
}
