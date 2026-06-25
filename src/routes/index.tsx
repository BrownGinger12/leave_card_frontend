import { createBrowserRouter, Navigate } from 'react-router-dom'
import MainLayout from '../components/layout/MainLayout'
import ProtectedRoute from '../components/common/ProtectedRoute'
import LoginPage from '../pages/login/LoginPage'
import DashboardPage from '../pages/dashboard/DashboardPage'
import EmployeesPage from '../pages/employees/EmployeesPage'
import EmployeeProfilePage from '../pages/employee-profile/EmployeeProfilePage'
import LeaveApplicationsPage from '../pages/leave-applications/LeaveApplicationsPage'
import LeaveApprovalsPage from '../pages/leave-approvals/LeaveApprovalsPage'
import LeaveBalancesPage from '../pages/leave-balances/LeaveBalancesPage'
import LeaveCreditsPage from '../pages/leave-credits/LeaveCreditsPage'
import ServiceCreditApplicationsPage from '../pages/cto-applications/CtoApplicationsPage'
import LedgerHistoryPage from '../pages/ledger-history/LedgerHistoryPage'
import LeaveCardPage from '../pages/leave-card/LeaveCardPage'
import CalendarPage from '../pages/calendar/CalendarPage'
import SettingsPage from '../pages/settings/SettingsPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
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
          { path: 'service-credit-applications', element: <ServiceCreditApplicationsPage /> },
          { path: 'ledger-history', element: <LedgerHistoryPage /> },
          { path: 'leave-card', element: <LeaveCardPage /> },
          { path: 'calendar-events', element: <CalendarPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
