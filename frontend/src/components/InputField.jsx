import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

function InputField({ id, label, name, type = 'text', value, onChange, error, placeholder, autoComplete, icon: Icon }) {
  const [revealed, setRevealed] = useState(false)
  const [hovering, setHovering] = useState(false)
  const isPassword = type === 'password'
  const visible = revealed || hovering
  const inputType = isPassword && visible ? 'text' : type

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-[#273b35]" htmlFor={id}>{label}</label>
      <div className={`flex h-12 items-center gap-3 rounded-lg border bg-white px-3.5 transition focus-within:ring-2 focus-within:ring-[#1e5144]/15 ${error ? 'border-[#c75846] focus-within:border-[#c75846]' : 'border-[#dce4dd] focus-within:border-[#1e5144]'}`}>
        {Icon && <Icon aria-hidden="true" className="shrink-0 text-[#84918b]" size={17} />}
        <input
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-[#172b28] outline-none placeholder:text-[#9ba69f]"
          id={id}
          name={name}
          onChange={onChange}
          placeholder={placeholder}
          type={inputType}
          value={value}
        />
        {isPassword && (
          <button
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#718079] transition hover:bg-[#eef3ee] hover:text-[#172b28] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e5144]"
            onClick={() => setRevealed((shown) => !shown)}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            type="button"
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
      {error && <p className="text-xs font-medium text-[#b84f40]" id={`${id}-error`}>{error}</p>}
    </div>
  )
}

export default InputField