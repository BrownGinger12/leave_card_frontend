import { api } from '@/lib/api'

export interface LeaveApprovalPayload {
  leave_application_id: number
  approver_id: number
  level: number
  status: 'FOR APPROVAL' | 'APPROVED' | 'RETURNED' | 'DISAPPROVED'
  remarks?: string
}

export async function submitLeaveApproval(payload: LeaveApprovalPayload): Promise<void> {
  await api.post('/leave-approvals', payload)
}
