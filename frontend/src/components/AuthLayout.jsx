import { Aperture } from 'lucide-react'
import { Link } from 'react-router-dom'

function AuthLayout({ eyebrow, title, subtitle, children, footer }) {
  return (
    <main className="min-h-screen bg-[#f3f6f2] lg:grid lg:grid-cols-[minmax(360px,0.92fr)_1.08fr]">
      <aside className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#173e35] px-10 py-9 text-white lg:flex xl:px-14">
        <div aria-hidden="true" className="auth-pattern absolute inset-0 opacity-70" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10"><Aperture size={21} strokeWidth={1.7} /></span>
          <span className="text-lg font-extrabold">morrow</span>
        </div>
        <div className="relative z-10 max-w-lg pb-5">
          <p className="font-mono text-xs text-[#aac9b7]">WELCOM TO MORROW</p>
          <h2 className="mt-7 max-w-md text-4xl font-semibold leading-[1.12] text-white xl:text-3xl">Where Strategy Meets Execution, and Targets Meet Success.</h2>
          <div className="mt-10 flex items-center gap-3 border-t border-white/20 pt-5">
            <span className="h-2 w-2 rounded-full bg-[#ec9a75]" />
            <p className="text-sm text-[#c5d7ca]">A considered place for you.</p>
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between font-mono text-[10px] text-[#aac0b1]">
          <span>PRIVATE BY DESIGN</span><span>EST. 2026</span>
        </div>
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full border border-white/10" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-12 -right-8 h-48 w-48 rounded-full border border-white/10" />
      </aside>

      <section className="flex min-h-screen flex-col justify-center px-5 py-8 sm:px-10 lg:px-12 xl:px-20">
        <div className="mx-auto w-full max-w-[440px] rise-in">
          <Link aria-label="Morrow home" className="mb-12 inline-flex items-center gap-2.5 lg:hidden" to="/">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#1e5144] text-white"><Aperture size={19} /></span>
            <span className="text-[17px] font-extrabold text-[#172b28]">morrow</span>
          </Link>
          <div className="mb-8">
            <p className="mb-3 font-mono text-[11px] text-[#7d8982]">{eyebrow}</p>
            <h1 className="text-[32px] font-extrabold leading-tight text-[#172b28] sm:text-[36px]">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-[#718078]">{subtitle}</p>
          </div>
          {children}
          <div className="mt-8 border-t border-[#dce4dd] pt-5 text-sm text-[#6f7c75]">{footer}</div>
        </div>
      </section>
    </main>
  )
}

export default AuthLayout