import { useEffect, useState } from 'react'
import { DateTime } from 'luxon'
import { formatHundredths, isoDate, objectFixedHoursLabel, objectHasGuide, parseFixedHoursValue, parseTurnus, TURNUS_DAYS, turnusForDate, weekdayLabel } from './planUtils'

function HundredthsField({ value, onChange, placeholder, className }) {
  const [text, setText] = useState(() => (value === '' || value == null ? '' : formatHundredths(value)))
  useEffect(() => {
    setText(value === '' || value == null ? '' : formatHundredths(value))
  }, [value])
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={e => {
        setText(e.target.value)
        onChange(e.target.value)
      }}
      onBlur={() => {
        const next = parseFixedHoursValue(text) ? formatHundredths(text) : ''
        setText(next)
        onChange(next)
      }}
      placeholder={placeholder}
      className={className}
    />
  )
}

export function ObjectSheetFields({ t, language, form, setForm, onPickFile, busy = false, message = '' }) {
  const turnus = parseTurnus(form.turnus)
  const days = TURNUS_DAYS.filter(day => turnus[day] || form.fixed_hours_by_day?.[day] != null)
  const unused = TURNUS_DAYS.filter(day => !days.includes(day))
  const preview = String(form.leistung_image_url || '')
  const imagePreview = preview && !/\.pdf(\?|$)/i.test(preview)
  return (
    <div className="sm:col-span-2 space-y-4 rounded-2xl bg-slate-950/50 px-4 py-4 ring-1 ring-white/10">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-300">{t('objectGuideTitle')}</p>
        {t('objectSheetHint') ? <p className="mt-2 text-[13px] leading-6 text-slate-200">{t('objectSheetHint')}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-slate-800 px-3 text-sm text-slate-100">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
            className="sr-only"
            disabled={busy}
            onChange={event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) onPickFile?.(file)
            }}
          />
          {busy ? t('objectSheetReading') : t('objectSheetPick')}
        </label>
        {preview ? (
          <button
            type="button"
            onClick={() => setForm(current => ({ ...current, leistung_image_url: '' }))}
            className="min-h-11 text-sm text-slate-300 underline"
          >
            {t('delete')}
          </button>
        ) : null}
      </div>
      {imagePreview ? (
        <img src={preview} alt="" className="max-h-40 rounded-xl object-cover" />
      ) : null}
      {message ? <p className="text-[13px] leading-6 text-cyan-100">{message}</p> : null}
      {String(form.leistung_text || '').trim() ? (
        <label className="block text-xs text-slate-300">
          {t('objectGuideText')}
          <textarea
            value={form.leistung_text}
            onChange={e => setForm(current => ({ ...current, leistung_text: e.target.value }))}
            rows={2}
            className="mt-1.5 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm leading-6 text-slate-100"
          />
        </label>
      ) : null}
      {form.fixed_hours ? (
        <label className="block text-xs text-slate-300">
          {t('objectFixedHours')}
          <HundredthsField
            value={form.fixed_hours}
            onChange={value => setForm(current => ({ ...current, fixed_hours: value }))}
            className="mt-1.5 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </label>
      ) : null}
      {days.length ? (
        <ul className="space-y-2">
          {days.map(day => (
            <li key={day} className="rounded-xl bg-slate-900/80 px-3 py-3">
              <p className="text-[12px] font-medium text-slate-300">{weekdayLabel(day, language, 'cccc')}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[7rem_1fr]">
                <HundredthsField
                  value={form.fixed_hours_by_day?.[day] ?? ''}
                  onChange={value => setForm(current => ({
                    ...current,
                    fixed_hours_by_day: { ...current.fixed_hours_by_day, [day]: value },
                  }))}
                  placeholder={t('objectFixedHours')}
                  className="w-full rounded-xl bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
                <textarea
                  value={turnus[day] || ''}
                  onChange={e => setForm(current => ({
                    ...current,
                    turnus: { ...parseTurnus(current.turnus), [day]: e.target.value },
                  }))}
                  rows={2}
                  className="w-full rounded-xl bg-slate-950 px-3 py-2 text-sm leading-5 text-slate-100"
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {(days.length || preview) && unused.length ? (
        <label className="block text-xs text-slate-400">
          {t('objectSheetAddDay')}
          <select
            value=""
            onChange={e => {
              const day = Number(e.target.value)
              if (!day) return
              setForm(current => ({
                ...current,
                turnus: { ...parseTurnus(current.turnus), [day]: current.turnus?.[day] || '' },
                fixed_hours_by_day: { ...current.fixed_hours_by_day, [day]: current.fixed_hours_by_day?.[day] || '' },
              }))
            }}
            className="mt-1.5 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm text-slate-100"
          >
            <option value="">{t('objectSheetAddDayPick')}</option>
            {unused.map(day => (
              <option key={day} value={day}>{weekdayLabel(day, language, 'cccc')}</option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  )
}

function previewLine(text) {
  const line = String(text || '').trim().split('\n').map(item => item.trim()).find(Boolean) || ''
  return line.replace(/^[-•]\s*/, '').replace(/^\d+[.)]\s*/, '')
}

function PrettyBody({ text }) {
  const blocks = String(text || '').trim().split(/\n{2,}/).map(item => item.trim()).filter(Boolean)
  if (!blocks.length) return null
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
        const listed = lines.length > 1 && lines.every(line => /^[-•\d.)]/.test(line))
        if (listed) {
          return (
            <ul key={index} className="space-y-1.5 pl-1">
              {lines.map((line, lineIndex) => (
                <li key={`${index}-${lineIndex}`} className="text-[14px] leading-6 text-slate-100">
                  {line.replace(/^[-•]\s*/, '').replace(/^\d+[.)]\s*/, '')}
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={index} className="whitespace-pre-wrap text-[14px] leading-6 text-slate-100">
            {block}
          </p>
        )
      })}
    </div>
  )
}

export function ObjectGuidePanel({ t, language, object, date, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!objectHasGuide(object)) return null
  const day = isoDate(date) || DateTime.now().setZone('Europe/Berlin').toISODate()
  const todayBody = turnusForDate(object, day)
  const weekday = DateTime.fromISO(day, { zone: 'Europe/Berlin' }).weekday
  const turnus = parseTurnus(object.turnus_json)
  const days = TURNUS_DAYS.filter(item => turnus[item] && item !== weekday)
  const title = previewLine(todayBody) || t('objectGuideOpen')

  return (
    <section className="rounded-2xl border border-white/15 bg-slate-800/50 px-4 py-4">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.28em] text-slate-300">{t('objectGuideTitle')}</span>
          <span className="mt-1 block text-[15px] font-medium text-white">{title}</span>
          {todayBody ? (
            <span className="mt-1 block text-[12px] text-cyan-100">
              {t('objectGuideToday')}
              {' · '}
              {weekdayLabel(weekday, language, 'cccc')}
              {objectFixedHoursLabel(object, day) ? ` · ${objectFixedHoursLabel(object, day)}` : ''}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[13px] text-slate-300">{open ? t('collapseDetails') : t('expandDetails')}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-5 border-t border-white/10 pt-4">
          {todayBody && (
            <div className="rounded-xl bg-cyan-500/10 px-3 py-3 ring-1 ring-cyan-300/20">
              <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-100">
                {t('objectGuideToday')}
                {' · '}
                {weekdayLabel(weekday, language, 'cccc')}
              </p>
              <div className="mt-2">
                <PrettyBody text={todayBody} />
              </div>
            </div>
          )}
          {days.length > 0 && (
            <ul className="space-y-2">
              {days.map(item => (
                <li key={item} className={`rounded-xl px-3 py-2.5 ${item === weekday ? 'bg-cyan-500/10 ring-1 ring-cyan-300/25' : 'bg-slate-950/40'}`}>
                  <p className="text-[12px] font-medium text-slate-300">{weekdayLabel(item, language, 'cccc')}</p>
                  <div className="mt-1">
                    <PrettyBody text={turnus[item]} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {String(object.leistung_text || '').trim() ? (
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">{t('objectGuideText')}</p>
              <div className="mt-2">
                <PrettyBody text={object.leistung_text} />
              </div>
            </div>
          ) : null}
          {object.leistung_image_url ? (
            <img src={object.leistung_image_url} alt="" className="max-h-64 w-full rounded-xl bg-slate-950/50 object-contain" />
          ) : null}
        </div>
      )}
    </section>
  )
}
