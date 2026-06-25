import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleLogoutConfirm() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            DE
          </div>
          <div>
            <p className="text-xs text-muted-foreground leading-none">Department of Education</p>
            <p className="font-semibold text-sm leading-tight text-sidebar-foreground">
              Leave Management System
            </p>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-sidebar-foreground leading-tight">
                {user.first_name} {user.last_name}
              </p>
              <p className="text-xs text-muted-foreground leading-tight">{user.role}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setConfirmOpen(true)}
              title="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        )}
      </header>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign Out</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to sign out? You will need to log in again to access the system.
          </p>
          <DialogFooter showCloseButton>
            <Button variant="destructive" onClick={handleLogoutConfirm}>
              Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
