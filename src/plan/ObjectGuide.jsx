import { useState } from 'react'
import { DateTime } from 'luxon'
import { isoDate, objectFixedHours, objectHasGuide, parseTurnus, turnusForDate, weekdayLabel, WORK_WEEKDAYS } from './planUtils'
import { emptyGroup, emptyRoom, formatHoursWithUnit, groupsForDay, groupsFromObject, roomLine } from './objectRooms'

function HundredthsField({ value, onChange, placeholder, className }) {
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

function planDayTitle(object, date, language) {
  const iso = isoDate(date) || DateTime.now().setZone('Europe/Berlin').toISODate()
  const weekday = DateTime.fromISO(iso, { zone: 'Europe/Berlin' }).weekday
  const dayName = weekdayLabel(weekday, language, 'cccc')
  const hours = formatHoursWithUnit(objectFixedHours(object, date))
  return hours ? `${dayName} · ${hours}` : dayName
}

function GuideGroups({ groups }) {
  if (!groups?.length) return null
  return (
    <div className="space-y-3">
      {groups.map(group => (
        <div key={group.id || group.name}>
          {group.name ? <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-slate-300">{group.name}</p> : null}
          <ul className={group.name ? 'mt-1 space-y-0.5' : 'space-y-0.5'}>
            {group.rooms.map(room => (
              <li key={room.id || room.name} className="text-[14px] leading-6 text-slate-100">
                {roomLine(room)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function GuideFields({ t, language, form, setForm }) {
  const groups = Array.isArray(form.groups) ? form.groups : []
  const setGroups = next => setForm(current => ({ ...current, groups: next }))
  const patchGroup = (groupId, patch) => setGroups(groups.map(group => (group.id === groupId ? { ...group, ...patch } : group)))
  const patchRoom = (groupId, roomId, patch) => setGroups(groups.map(group => (
    group.id === groupId
      ? { ...group, rooms: group.rooms.map(room => (room.id === roomId ? { ...room, ...patch } : room)) }
      : group
  )))
  return (
    <div className="space-y-4">
      {groups.map(group => (
        <div key={group.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={group.name}
              onChange={e => patchGroup(group.id, { name: e.target.value })}
              placeholder={t('objectSection')}
              className="w-full rounded-xl bg-slate-900 px-3 py-2 text-[12px] font-medium uppercase tracking-[0.16em] text-slate-100"
            />
            <button
              type="button"
              onClick={() => setGroups(groups.filter(item => item.id !== group.id))}
              className="shrink-0 text-xs text-slate-400 underline"
            >
              {t('delete')}
            </button>
          </div>
          <ul className="space-y-2">
            {group.rooms.map(room => (
              <li key={room.id} className="rounded-xl bg-slate-900/80 px-3 py-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-[11px] text-slate-400">
                    {t('objectRoom')}
                    <input
                      value={room.name}
                      onChange={e => patchRoom(group.id, room.id, { name: e.target.value })}
                      placeholder={t('objectRoomName')}
                      className="mt-1 w-full rounded-xl bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <label className="block text-[11px] text-slate-400">
                    {t('objectRoomTasks')}
                    <input
                      value={Array.isArray(room.tasks) ? room.tasks.join(', ') : String(room.tasks || '')}
                      onChange={e => patchRoom(group.id, room.id, { tasks: e.target.value })}
                      placeholder={t('objectRoomTasksHint')}
                      className="mt-1 w-full rounded-xl bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {WORK_WEEKDAYS.map(day => {
                    const on = room.days.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => patchRoom(group.id, room.id, {
                          days: on && room.days.length > 1 ? room.days.filter(item => item !== day) : [...new Set([...room.days, day])].sort((a, b) => a - b),
                        })}
                        className={`min-h-8 rounded-lg px-2 text-[11px] font-semibold ${on ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                      >
                        {weekdayLabel(day, language)}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => patchGroup(group.id, { rooms: group.rooms.filter(item => item.id !== room.id) })}
                    className="ml-auto text-[11px] text-slate-400 underline"
                  >
                    {t('delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => patchGroup(group.id, { rooms: [...group.rooms, emptyRoom(group.rooms.length + 1)] })}
            className="text-xs font-semibold text-cyan-200"
          >
            {t('objectAddRoom')}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setGroups([...groups, emptyGroup(groups.length + 1)])}
        className="text-xs font-semibold text-cyan-200"
      >
        {t('objectAddSection')}
      </button>
    </div>
  )
}

export function ObjectSheetFields({ t, language, form, setForm, onPickFile, busy = false, message = '' }) {
  const turnus = parseTurnus(form.turnus)
  const textDays = WORK_WEEKDAYS.filter(day => turnus[day])
  const preview = String(form.leistung_image_url || '')
  const imagePreview = preview && !/\.pdf(\?|$)/i.test(preview)
  const hasRooms = (form.groups || []).some(group => group.name || group.rooms?.length)
  return (
    <div className="sm:col-span-2 space-y-4 rounded-2xl bg-slate-950/50 px-4 py-4 ring-1 ring-white/10">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-300">{t('objectFixedDays')}</p>
        {t('objectFixedDaysHint') ? <p className="mt-2 text-[13px] leading-6 text-slate-200">{t('objectFixedDaysHint')}</p> : null}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {WORK_WEEKDAYS.map(day => (
            <label key={day} className="block text-[11px] text-slate-400">
              {weekdayLabel(day, language, 'cccc')}
              <HundredthsField
                value={form.fixed_hours_by_day?.[day] ?? ''}
                onChange={value => setForm(current => ({
                  ...current,
                  fixed_hours_by_day: { ...current.fixed_hours_by_day, [day]: value },
                }))}
                className="mt-1 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </label>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-3 rounded-xl bg-slate-900/80 px-3 py-3 text-sm text-slate-100">
          <input
            type="checkbox"
            checked={Boolean(form.time_locked)}
            onChange={e => setForm(current => ({ ...current, time_locked: e.target.checked }))}
            className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-500"
          />
          <span>
            <span className="block font-semibold text-white">{t('objectTimeRigid')}</span>
            {t('objectTimeRigidHint') ? <span className="mt-1 block text-[13px] leading-6 text-slate-300">{t('objectTimeRigidHint')}</span> : null}
          </span>
        </label>
      </div>
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
      {message ? <p className="mt-0 text-[13px] leading-6 text-cyan-100">{message}</p> : null}
      <GuideFields t={t} language={language} form={form} setForm={setForm} />
      {String(form.leistung_text || '').trim() && !hasRooms ? (
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
      {textDays.length && !hasRooms ? (
        <ul className="space-y-2">
          {textDays.map(day => (
            <li key={day} className="rounded-xl bg-slate-900/80 px-3 py-3">
              <p className="text-[12px] font-medium text-slate-300">{planDayTitle({ fixed_hours_json: form.fixed_hours_by_day, fixed_hours: form.fixed_hours }, DateTime.now().setZone('Europe/Berlin').set({ weekday: day }).toISODate(), language)}</p>
              <textarea
                value={turnus[day] || ''}
                onChange={e => setForm(current => ({
                  ...current,
                  turnus: { ...parseTurnus(current.turnus), [day]: e.target.value },
                }))}
                rows={2}
                className="mt-2 w-full rounded-xl bg-slate-950 px-3 py-2 text-sm leading-5 text-slate-100"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
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
  if (!objectHasGuide(object) && !groupsFromObject(object).length) return null
  const day = isoDate(date) || DateTime.now().setZone('Europe/Berlin').toISODate()
  const weekday = DateTime.fromISO(day, { zone: 'Europe/Berlin' }).weekday
  const groups = groupsForDay(groupsFromObject(object), weekday)
  const todayBody = turnusForDate(object, day)
  const turnus = parseTurnus(object.turnus_json)
  const otherDays = WORK_WEEKDAYS.filter(item => {
    if (item === weekday) return false
    const dayGroups = groupsForDay(groupsFromObject(object), item)
    if (dayGroups.length && groups.length) {
      const same = JSON.stringify(dayGroups.map(group => [group.name, group.rooms.map(room => roomLine(room))]))
        === JSON.stringify(groups.map(group => [group.name, group.rooms.map(room => roomLine(room))]))
      if (same) return false
    }
    return dayGroups.length || Boolean(turnus[item])
  })
  const title = planDayTitle(object, day, language)

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
        </span>
        <span className="shrink-0 text-[13px] text-slate-300">{open ? t('collapseDetails') : t('expandDetails')}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-5 border-t border-white/10 pt-4">
          {groups.length ? (
            <GuideGroups groups={groups} />
          ) : todayBody ? (
            <PrettyBody text={todayBody} />
          ) : null}
          {otherDays.map(item => {
            const iso = DateTime.fromISO(day, { zone: 'Europe/Berlin' }).set({ weekday: item }).toISODate()
            const dayGroups = groupsForDay(groupsFromObject(object), item)
            return (
              <div key={item}>
                <p className="text-[12px] font-medium text-slate-300">{planDayTitle(object, iso, language)}</p>
                <div className="mt-1">
                  {dayGroups.length ? <GuideGroups groups={dayGroups} /> : <PrettyBody text={turnus[item]} />}
                </div>
              </div>
            )
          })}
          {!groups.length && String(object.leistung_text || '').trim() ? (
            <div>
              <PrettyBody text={object.leistung_text} />
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
