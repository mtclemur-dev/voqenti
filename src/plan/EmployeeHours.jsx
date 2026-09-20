import { useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import WeekBoard from './WeekBoard'
import {
  assignmentRange,
  berlinWeekDays,
  berlinWeekStart,
  clockRangeLabel,
  crewRowsFor,
  firstName,
  formatClock,
  formatDisplayDate,
  formatSeenAt,
  isAssignmentActive,
  isoDate,
  minutesLabel,
  rowWorkMinutes,
  shortPlace,
} from './planUtils'

const pickerStyle = { colorScheme: 'light', appearance: 'auto', WebkitAppearance: 'auto' }
const pickerClass = 'min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900'

function TimeField({ label, value, onChange }) {
  const text = String(value || '').slice(0, 5)
  const valid = /^\d{2}:\d{2}$/.test(text)
  const hour = valid ? text.slice(0, 2) : ''
  const minute = valid ? text.slice(3, 5) : ''
  const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
  const minutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))
  if (minute && !minutes.includes(minute)) minutes.push(minute)
  const commit = (nextHour, nextMinute) => {
    if (!nextHour) {
      onChange('')
      return
    }
    onChange(`${nextHour}:${nextMinute || '00'}`)
  }
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <select aria-label={label} value={hour} onChange={e => commit(e.target.value, minute)} className={pickerClass} style={pickerStyle}>
          <option value="">--</option>
          {hours.map(item => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select value={minute} onChange={e => commit(hour || '00', e.target.value)} className={pickerClass} style={pickerStyle} disabled={!hour && !minute}>
          {minutes.map(item => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </div>
    </label>
  )
}

export function HoursRow({ t, language, today, row, object, workerLabel, currentWorkerId, onSave, saving, compact = false }) {
  const job = row.work_jobs
  const date = isoDate(job?.work_date)
  const canEdit = Boolean(onSave && date && date <= today)
  const planned = assignmentRange(row, job)
  const [start, setStart] = useState(formatClock(row.actual_start || planned.start))
  const [end, setEnd] = useState(formatClock(row.actual_end || planned.end))
  useEffect(() => {
    setStart(formatClock(row.actual_start || planned.start))
    setEnd(formatClock(row.actual_end || planned.end))
  }, [planned.end, planned.start, row.actual_end, row.actual_start])
  const minutes = rowWorkMinutes({ ...row, actual_start: start, actual_end: end })
  const place = object?.name || job?.object_name || job?.location_text || t('planNoPlace')
  const dirty = start !== formatClock(row.actual_start || planned.start) || end !== formatClock(row.actual_end || planned.end) || !row.actual_start || !row.actual_end
  const changerName = row.hours_changed_by_name || ''
  const changerMine = Boolean(currentWorkerId && row.hours_changed_by === currentWorkerId)
  const changedLabel = row.hours_changed_at
    ? t('hoursChangedBy')
      .replace('{name}', changerMine ? t('planSelf') : (firstName(changerName) || changerName || t('planUnknownWorker')))
      .replace('{time}', formatSeenAt(row.hours_changed_at, language))
    : ''

  return (
    <article className={compact ? 'rounded-2xl border border-slate-800 bg-slate-950/50 p-3' : 'rounded-2xl border border-slate-800 bg-slate-900/80 p-4'}>
      {!compact && (
        <>
          <p className="text-xs text-slate-400">{formatDisplayDate(date, language)}</p>
          <h3 className="mt-1 text-lg font-bold text-white">{place}</h3>
          {shortPlace(job, object) && shortPlace(job, object) !== place && (
            <p className="mt-1 text-sm text-slate-300">{shortPlace(job, object)}</p>
          )}
        </>
      )}
      {workerLabel && (
        <p className="mt-2 text-sm font-semibold text-cyan-100">{t('hoursFor').replace('{name}', workerLabel)}</p>
      )}
      <p className="mt-2 text-sm text-cyan-100">{minutesLabel(minutes, t)}</p>
      {changedLabel && <p className="mt-1 text-xs text-slate-400">{changedLabel}</p>}
      {canEdit ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <TimeField label={t('planStart')} value={start} onChange={setStart} />
            <TimeField label={t('planEnd')} value={end} onChange={setEnd} />
          </div>
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={() => onSave(row, start, end)}
            className="mt-3 min-h-11 w-full rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white disabled:bg-slate-700"
          >
            {saving ? t('saving') : t('hoursSave')}
          </button>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-300">
          {t('hoursPlanned')}
          {': '}
          {clockRangeLabel(planned) || [formatClock(job?.start_time), formatClock(job?.end_time)].filter(Boolean).join(' – ') || '—'}
        </p>
      )}
    </article>
  )
}

export default function EmployeeHours({
  t,
  language,
  objects = [],
  workers = [],
  currentWorker,
  myPlan = [],
  loading = false,
  errorMessage = '',
  onRetry,
  onSaveHours,
  savingId = '',
  boardDate,
  onBoardDateChange,
}) {
  const today = DateTime.now().setZone('Europe/Berlin').toISODate()
  const selectedDate = boardDate || today
  const setBoardDate = (date) => onBoardDateChange?.(date)
  const objectById = (id) => objects.find(item => item.id === id)
  const active = useMemo(
    () => myPlan.filter(row => isAssignmentActive(row)),
    [myPlan],
  )
  const weekStart = berlinWeekStart(selectedDate)
  const weekDays = berlinWeekDays(weekStart)
  const weekRows = active.filter(row => weekDays.includes(isoDate(row.work_jobs?.work_date)))
  const dayRows = active.filter(row => isoDate(row.work_jobs?.work_date) === selectedDate)
  const month = DateTime.fromISO(selectedDate, { zone: 'Europe/Berlin' }).setLocale(language)
  const monthRows = active.filter((row) => {
    const date = DateTime.fromISO(isoDate(row.work_jobs?.work_date), { zone: 'Europe/Berlin' })
    return date.isValid && date.year === month.year && date.month === month.month
  })
  const weekMinutes = weekRows.reduce((sum, row) => sum + rowWorkMinutes(row), 0)
  const monthMinutes = monthRows.reduce((sum, row) => sum + rowWorkMinutes(row), 0)
  const monthDays = Object.entries(monthRows.reduce((map, row) => {
    const date = isoDate(row.work_jobs?.work_date)
    if (!date) return map
    map[date] = (map[date] || 0) + rowWorkMinutes(row)
    return map
  }, {})).sort(([left], [right]) => left.localeCompare(right))
  const shiftMonth = (delta) => {
    const next = DateTime.fromISO(selectedDate, { zone: 'Europe/Berlin' }).plus({ months: delta }).startOf('month')
    setBoardDate(next.toISODate())
  }
  const counts = weekRows.reduce((map, row) => {
    const date = isoDate(row.work_jobs?.work_date)
    if (!date) return map
    map[date] = (map[date] || 0) + 1
    return map
  }, {})

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-20 animate-pulse rounded-2xl bg-slate-800/80" />
        <div className="h-40 animate-pulse rounded-3xl bg-slate-800/80" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-200">{t('navHours')}</p>
        <h3 className="mt-1 text-xl font-black text-white">{t('hoursTitle')}</h3>
        {t('hoursHint') ? <p className="mt-2 text-sm text-slate-400">{t('hoursHint')}</p> : null}
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
          <p>{errorMessage}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="mt-2 min-h-11 text-sm font-semibold text-cyan-200 underline">
              {t('retry')}
            </button>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-cyan-500/10 px-4 py-3 ring-1 ring-cyan-400/20">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200">{t('hoursWeekTotal')}</p>
          <p className="mt-1 text-2xl font-black text-white">{minutesLabel(weekMinutes, t)}</p>
        </div>
        <div className="rounded-2xl bg-slate-800/80 px-4 py-3 ring-1 ring-white/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{t('hoursMonthTotal')}</p>
          <p className="mt-1 text-2xl font-black text-white">{minutesLabel(monthMinutes, t)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="min-h-11 rounded-xl bg-slate-800 px-3 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {t('hoursPrevMonth')}
          </button>
          <p className="text-center text-base font-bold capitalize text-white">{month.toFormat('LLLL yyyy')}</p>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="min-h-11 rounded-xl bg-slate-800 px-3 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {t('hoursNextMonth')}
          </button>
        </div>
        {monthDays.length === 0 ? (
          <p className="mt-3 text-center text-sm text-slate-400">{t('hoursMonthEmpty')}</p>
        ) : (
          <div className="mt-3 space-y-1">
            {monthDays.map(([date, minutes]) => (
              <button
                key={date}
                type="button"
                onClick={() => setBoardDate(date)}
                className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm ${date === selectedDate ? 'bg-cyan-500/15 text-white' : 'text-slate-200 hover:bg-slate-800'}`}
              >
                <span>{formatDisplayDate(date, language)}</span>
                <span className="font-semibold text-cyan-100">{minutesLabel(minutes, t)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <WeekBoard
        t={t}
        language={language}
        today={today}
        selectedDate={selectedDate}
        onSelectDate={setBoardDate}
        counts={counts}
      />

      {dayRows.length === 0 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 px-5 py-6 text-center text-sm text-slate-400">
          {t('hoursEmpty')}
        </div>
      ) : (
        <div className="space-y-3">
          {dayRows.flatMap(myRow => {
            const rows = crewRowsFor(myRow)
            const showNames = rows.length > 1
            return rows.map(row => {
              const name = workers.find(item => item.id === row.worker_id)?.name || ''
              const mine = row.worker_id === currentWorker?.id
              return (
                <HoursRow
                  key={row.id || `${myRow.id}-${row.worker_id}`}
                  t={t}
                  language={language}
                  today={today}
                  row={row}
                  object={objectById(row.work_jobs?.object_id)}
                  workerLabel={showNames ? (mine ? t('planSelf') : (firstName(name) || name || t('planUnknownWorker'))) : ''}
                  currentWorkerId={currentWorker?.id}
                  onSave={onSaveHours}
                  saving={savingId === row.id}
                />
              )
            })
          })}
        </div>
      )}
    </div>
  )
}
