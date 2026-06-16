import { NavLink } from 'react-router-dom'

const navItems = [
  { label: 'Dashboard', path: '/' },
  { label: 'Employees', path: '/employees' },
  { label: 'Leave Applications', path: '/leave-applications' },
  { label: 'Leave Approvals', path: '/leave-approvals' },
  { label: 'Leave Balances', path: '/leave-balances' },
  { label: 'Leave Credits', path: '/leave-credits' },
  { label: 'CTO Applications', path: '/cto-applications' },
  { label: 'Ledger History', path: '/ledger-history' },
  { label: 'Settings', path: '/settings' },
]

export default function Sidebar() {
  return (
    <aside className="fixed top-16 left-0 bottom-0 w-56 bg-white border-r border-gray-200 overflow-y-auto">
      <nav className="py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `block px-5 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
