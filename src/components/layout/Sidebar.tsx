import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  FileText,
  Award,
  CreditCard,
  CalendarDays,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems: { label: string; path: string; icon: LucideIcon }[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Employees', path: '/employees', icon: Users },
  { label: 'Leave Applications', path: '/leave-applications', icon: FileText },
  { label: 'Service Credit Applications', path: '/service-credit-applications', icon: Award },
  { label: 'Leave Card', path: '/leave-card', icon: CreditCard },
  { label: 'Calendar of Events', path: '/calendar-events', icon: CalendarDays },
  { label: 'Settings', path: '/settings', icon: Settings },
]

export default function Sidebar() {
  return (
    <aside className="fixed top-16 left-0 bottom-0 w-64 bg-sidebar border-r border-sidebar-border overflow-y-auto">
      <nav className="flex flex-col gap-1 p-3">
        {navItems.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
