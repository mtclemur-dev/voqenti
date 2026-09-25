import { useState } from 'react'
import { DateTime } from 'luxon'
import { isoDate, objectHasGuide, parseTurnus, TURNUS_DAYS, turnusForDate, weekdayLabel } from './planUtils'

export function ObjectFixedHoursFields({ t, language, form, setForm }) {
  return (
    <div className="sm:col-span-2 space-y-3 rounded-2xl bg-slate-950/40 px-4 py-4 ring-1 ring-white/10">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-300">{t('objectFixedDays')}</p>
        {t('objectFixedDaysHint') ? <p className="mt-2 text-[13px] leading-6 text-slate-200">{t('objectFixedDaysHint')}</p> : null}
      </div>
      <label className="block text-xs text-slate-300">
        {t('objectFixedHours')}
        <input
          type="number"
          min="0"
          max="24"
          step="0.5"
          value={form.fixed_hours}
          onChange={e => setForm(current => ({ ...current, fixed_hours: e.target.value }))}
          placeholder="6"
          className="mt-1.5 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        {t('objectFixedHint') ? <span className="mt-1.5 block text-[12px] leading-5 text-slate-400">{t('objectFixedHint')}</span> : null}
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TURNUS_DAYS.map(day => (
          <label key={day} className="block text-[11px] text-slate-400">
            {weekdayLabel(day, language, 'cccc')}
            <input
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={form.fixed_hours_by_day?.[day] ?? ''}
              onChange={e => setForm(current => ({
                ...current,
                fixed_hours_by_day: { ...current.fixed_hours_by_day, [day]: e.target.value },
              }))}
              placeholder={form.fixed_hours || '—'}
              className="mt-1 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </label>
        ))}
      </div>
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

export function ObjectGuideFields({ t, language, form, setForm, onPickPhoto, photoBusy = false }) {
  const turnus = parseTurnus(form.turnus)
  return (
    <div className="sm:col-span-2 space-y-4 rounded-2xl bg-slate-950/50 px-4 py-4 ring-1 ring-white/10">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-300">{t('objectGuideTitle')}</p>
        {t('objectGuideHint') ? <p className="mt-2 text-[13px] leading-6 text-slate-200">{t('objectGuideHint')}</p> : null}
      </div>
      <label className="block text-xs text-slate-300">
        {t('objectGuideText')}
        <textarea
          value={form.leistung_text}
          onChange={e => setForm(current => ({ ...current, leistung_text: e.target.value }))}
          rows={5}
          placeholder={t('objectGuideTextPlaceholder')}
          className="mt-1.5 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm leading-6 text-slate-100"
        />
      </label>
      <div>
        <p className="text-xs text-slate-300">{t('objectGuidePhoto')}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-slate-800 px-3 text-sm text-slate-100">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={photoBusy}
              onChange={event => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) onPickPhoto?.(file)
              }}
            />
            {photoBusy ? t('saving') : t('objectGuidePhotoPick')}
          </label>
          {form.leistung_image_url ? (
            <button
              type="button"
              onClick={() => setForm(current => ({ ...current, leistung_image_url: '' }))}
              className="min-h-11 text-sm text-slate-300 underline"
            >
              {t('delete')}
            </button>
          ) : null}
        </div>
        {form.leistung_image_url ? (
          <img src={form.leistung_image_url} alt="" className="mt-3 max-h-40 rounded-xl object-cover" />
        ) : null}
        {t('objectGuidePhotoHint') ? <p className="mt-2 text-[12px] leading-5 text-slate-400">{t('objectGuidePhotoHint')}</p> : null}
      </div>
      <div>
        <p className="text-xs text-slate-300">{t('objectGuideTurnus')}</p>
        {t('objectGuideTurnusHint') ? <p className="mt-1 text-[12px] leading-5 text-slate-400">{t('objectGuideTurnusHint')}</p> : null}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {TURNUS_DAYS.map(day => (
            <label key={day} className="block text-[11px] text-slate-400">
              {weekdayLabel(day, language, 'cccc')}
              <textarea
                value={turnus[day] || ''}
                onChange={e => setForm(current => ({
                  ...current,
                  turnus: { ...parseTurnus(current.turnus), [day]: e.target.value },
                }))}
                rows={2}
                placeholder={t('objectGuideTurnusPlaceholder')}
                className="mt-1 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm leading-5 text-slate-100"
              />
            </label>
          ))}
        </div>
      </div>
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
