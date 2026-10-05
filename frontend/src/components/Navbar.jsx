import { useState } from 'react'
import { Aperture, ArrowRight, LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { dashboardPathForRole } from '../utils/roleNavigation'

function Navbar() {
  const { user, logout } = useAuth()
  const [confirming, setConfirming] = useState(false)

  return (
    <header className="border-b border-[#dce4dd] bg-[#f8faf7]">
      <div className="mx-auto flex min-h-[76px] max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link aria-label="Morrow home" className="inline-flex items-center gap-2.5" to={dashboardPathForRole(user?.role)}>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#1e5144] text-white"><Aperture size={19} strokeWidth={1.8} /></span>
          <span className="text-[17px] font-extrabold text-[#172b28]">morrow</span>
        </Link>
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          <span className="hidden max-w-48 truncate text-sm text-[#68766f] sm:block">{user?.email}</span>
          {confirming ? (
            <div className="flex items-center gap-2" role="group" aria-label="Confirm sign out">
              <button className="rounded-md px-3 py-2 text-sm font-semibold text-[#68766f] hover:bg-[#edf2ed]" onClick={() => setConfirming(false)} type="button">Keep me in</button>
              <button className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#a84638] px-3.5 text-sm font-bold text-white transition hover:bg-[#8f382d]" onClick={logout} type="button">Sign out <ArrowRight size={15} /></button>
            </div>
          ) : (
            <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#d6dfd8] bg-white px-3.5 text-sm font-semibold text-[#354941] transition hover:border-[#b9c9bd] hover:bg-[#f5f8f5]" onClick={() => setConfirming(true)} type="button">
              <LogOut aria-hidden="true" size={16} /><span>Log out</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

export default Navbar