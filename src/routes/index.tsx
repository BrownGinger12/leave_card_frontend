import { createBrowserRouter } from 'react-router-dom'
import MainLayout from '../components/layout/MainLayout'
import DashboardPage from '../pages/dashboard/DashboardPage'
import EmployeesPage from '../pages/employees/EmployeesPage'
import EmployeeProfilePage from '../pages/employee-profile/EmployeeProfilePage'
import LeaveApplicationsPage from '../pages/leave-applications/LeaveApplicationsPage'
import LeaveApprovalsPage from '../pages/leave-approvals/LeaveApprovalsPage'
import LeaveBalancesPage from '../pages/leave-balances/LeaveBalancesPage'
import LeaveCreditsPage from '../pages/leave-credits/LeaveCreditsPage'
import CtoApplicationsPage from '../pages/cto-applications/CtoApplicationsPage'
import LedgerHistoryPage from '../pages/ledger-history/LedgerHistoryPage'
import SettingsPage from '../pages/settings/SettingsPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'employees', element: <EmployeesPage /> },
      { path: 'employees/:id', element: <EmployeeProfilePage /> },
      { path: 'leave-applications', element: <LeaveApplicationsPage /> },
      { path: 'leave-approvals', element: <LeaveApprovalsPage /> },
      { path: 'leave-balances', element: <LeaveBalancesPage /> },
      { path: 'leave-credits', element: <LeaveCreditsPage /> },
      { path: 'cto-applications', element: <CtoApplicationsPage /> },
      { path: 'ledger-history', element: <LedgerHistoryPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
