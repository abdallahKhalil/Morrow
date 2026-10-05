import { ArrowLeft, Aperture } from 'lucide-react'
import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f6f2] px-6 py-12">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#1e5144] text-white"><Aperture size={22} /></span>
        <p className="mt-8 font-mono text-xs text-[#7c8b82]">404 / NOT FOUND</p>
        <h1 className="mt-3 text-3xl font-extrabold text-[#172b28]">This page wandered off.</h1>
        <p className="mt-3 text-sm leading-6 text-[#718078]">The address may be out of date or the page may have moved.</p>
        <Link className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-md bg-[#1e5144] px-4 text-sm font-bold text-white transition hover:bg-[#163d35]" to="/">
          <ArrowLeft size={16} />Back to your space
        </Link>
      </div>
    </main>
  )
}

export default NotFound