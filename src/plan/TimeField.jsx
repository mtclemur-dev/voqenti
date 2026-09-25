const pickerStyle = { colorScheme: 'light' }

function ClockSelect({ label, value, options, onChange, disabled = false, blank = false }) {
  return (
    <span className="relative block min-w-[5.75rem] flex-1">
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className="min-h-11 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 pr-8 text-center text-lg font-semibold tabular-nums text-slate-900 disabled:opacity-50"
        style={pickerStyle}
      >
        {blank ? <option value="">--</option> : null}
        {options.map(item => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-500">▾</span>
    </span>
  )
}

export default function TimeField({ label, value, onChange, className = 'block text-xs text-slate-400' }) {
  const text = String(value || '').slice(0, 5)
  const valid = /^\d{2}:\d{2}$/.test(text)
  const hour = valid ? text.slice(0, 2) : ''
  const minute = valid ? text.slice(3, 5) : ''
  const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
  const minutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))
  if (minute && !minutes.includes(minute)) minutes.push(minute)
  minutes.sort()

  const commit = (nextHour, nextMinute) => {
    if (!nextHour) {
      onChange('')
      return
    }
    onChange(`${nextHour}:${nextMinute || '00'}`)
  }

  return (
    <label className={className}>
      {label}
      <div className="mt-1 flex gap-2">
        <ClockSelect label={label} value={hour} options={hours} blank onChange={next => commit(next, minute)} />
        <ClockSelect
          label={label}
          value={minute}
          options={minutes}
          disabled={!hour && !minute}
          onChange={next => commit(hour || '00', next)}
        />
      </div>
    </label>
  )
}
