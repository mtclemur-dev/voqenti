import { useState } from 'react'
import { parseServices, serviceHasHours, suggestedServiceNames } from './objectServices'
import { weekdayLabel, WORK_WEEKDAYS } from './planUtils'

function HoursField({ value, onChange, placeholder, className }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  )
}

export function ObjectServicesFields({ t, language = 'de', form, setForm }) {
  const [text, setText] = useState('')
  const services = parseServices(form.services)
  const taken = new Set(services.map(item => item.name.toLowerCase()))
  const suggestions = suggestedServiceNames().filter(name => !taken.has(name.toLowerCase()))

  const add = (raw) => {
    const name = String(raw || '').trim()
    if (!name || taken.has(name.toLowerCase())) return
    setForm(current => ({
      ...current,
      services: [...parseServices(current.services), {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        hours: '',
        hours_by_day: {},
      }],
    }))
    setText('')
  }

  const patch = (id, next) => setForm(current => ({
    ...current,
    services: parseServices(current.services).map(row => (row.id === id ? { ...row, ...next } : row)),
  }))

  return (
    <div className="sm:col-span-2 space-y-2">
      <p className="text-xs text-slate-400">{t('serviceLabel')}</p>
      <p className="text-[12px] leading-5 text-slate-500">{t('serviceHint')}</p>
      {services.length ? (
        <ul className="space-y-2">
          {services.map(item => (
            <li key={item.id} className="rounded-2xl bg-slate-950 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold text-white">{item.name}</p>
                <button
                  type="button"
                  onClick={() => setForm(current => ({
                    ...current,
                    services: parseServices(current.services).filter(row => row.id !== item.id),
                  }))}
                  className="shrink-0 text-xs text-slate-400 underline"
                >
                  {t('delete')}
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">{t('serviceHoursHint')}</p>
              <label className="mt-2 block text-[11px] text-slate-400">
                {t('serviceDailyHours')}
                <HoursField
                  value={item.hours}
                  onChange={value => patch(item.id, { hours: value })}
                  placeholder="4"
                  className="mt-1 w-full max-w-[8rem] rounded-xl bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {WORK_WEEKDAYS.map(day => (
                  <label key={day} className="block text-[11px] text-slate-400">
                    {weekdayLabel(day, language, 'cccc')}
                    <HoursField
                      value={item.hours_by_day?.[day] ?? ''}
                      onChange={value => patch(item.id, {
                        hours_by_day: { ...item.hours_by_day, [day]: value },
                      })}
                      placeholder={item.hours || ''}
                      className="mt-1 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                ))}
              </div>
              {serviceHasHours(item) ? (
                <p className="mt-2 text-[11px] text-cyan-200/80">{t('objectFixedBadge').replace('{hours}', item.name)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{t('serviceEmpty')}</p>
      )}
      {suggestions.length ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => add(name)}
              className="min-h-11 rounded-full bg-slate-800 px-3 text-sm text-slate-100"
            >
              + {name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(text)
            }
          }}
          placeholder={t('servicePlaceholder')}
          className="min-h-11 w-full rounded-md bg-slate-950 px-3 text-sm text-slate-100"
        />
        <button
          type="button"
          onClick={() => add(text)}
          className="shrink-0 rounded-xl bg-slate-800 px-3 text-sm text-white"
        >
          {t('serviceAdd')}
        </button>
      </div>
    </div>
  )
}

export function JobServiceField({ t, object, value, onChange, className = 'mt-3 block text-xs text-slate-400' }) {
  const services = parseServices(object?.services_json ?? object?.services)
  if (!services.length) return null
  return (
    <label className={className}>
      {t('serviceLabel')}
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
      >
        <option value="">{t('serviceSelect')}</option>
        {services.map(item => (
          <option key={item.id} value={item.id}>{item.name}</option>
        ))}
      </select>
    </label>
  )
}
