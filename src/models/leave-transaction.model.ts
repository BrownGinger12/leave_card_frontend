export interface LeaveTransaction {
  id: number
  transaction_number: string
  leave_type: string
  transaction_type: 'CREDIT' | 'DEBIT'
  amount: number
  balance_snapshot_after: number
  transaction_date: string
  remarks?: string
}
