export default function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-blue-700 text-white flex items-center px-6 shadow-md">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
          <span className="text-blue-700 font-bold text-xs">DepEd</span>
        </div>
        <div>
          <p className="text-xs text-blue-200 leading-none">Department of Education</p>
          <p className="font-semibold text-sm leading-tight">Leave Management System</p>
        </div>
      </div>
    </header>
  )
}
