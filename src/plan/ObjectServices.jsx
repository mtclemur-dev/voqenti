import { useState } from 'react'
import { parseServices, suggestedServiceNames } from './objectServices'

export function ObjectServicesFields({ t, form, setForm }) {
  const [text, setText] = useState('')
  const services = parseServices(form.services)
  const taken = new Set(services.map(item => item.name.toLowerCase()))
  const suggestions = suggestedServiceNames().filter(name => !taken.has(name.toLowerCase()))

  const add = (raw) => {
    const name = String(raw || '').trim()
    if (!name || taken.has(name.toLowerCase())) return
    setForm(current => ({
      ...current,
      services: [...parseServices(current.services), { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name }],
    }))
    setText('')
  }

  return (
    <div className="sm:col-span-2 space-y-2">
      <p className="text-xs text-slate-400">{t('serviceLabel')}</p>
      <p className="text-[12px] leading-5 text-slate-500">{t('serviceHint')}</p>
      {services.length ? (
        <ul className="flex flex-wrap gap-2">
          {services.map(item => (
            <li key={item.id} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1.5 text-sm text-slate-100">
              <span>{item.name}</span>
              <button
                type="button"
                onClick={() => setForm(current => ({
                  ...current,
                  services: parseServices(current.services).filter(row => row.id !== item.id),
                }))}
                className="text-xs text-slate-400 underline"
              >
                {t('delete')}
              </button>
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
