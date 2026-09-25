import { useEffect, useMemo, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import WeekBoard from './WeekBoard'
import TimeField from './TimeField'
import {
  assignmentRange,
  berlinWeekDays,
  berlinWeekStart,
  clockPlusMinutes,
  clockRangeLabel,
  firstName,
  formatClock,
  formatDisplayDate,
  formatFixedHoursLabel,
  formatSeenAt,
  isAssignmentActive,
  isoDate,
  isJobPast,
  minutesLabel,
  objectFixedMinutes,
  rowWorkMinutes,
  selfLogMinutes,
  shortPlace,
} from './planUtils'
import { ComputedEnd } from './TimeField'
import { MyLeaveCard } from './LeaveBalance'

export function HoursRow({ t, language, today, row, object, workerLabel, currentWorkerId, onSave, onConfirm, saving, compact = false, lockFixedTimes = true }) {
  const job = row.work_jobs
  const date = isoDate(job?.work_date)
  const fixedMinutes = objectFixedMinutes(object)
  const locked = Boolean(fixedMinutes && lockFixedTimes)
  const canEdit = Boolean(onSave && date && date <= today && !locked)
  const planned = assignmentRange(row, job)
  const [start, setStart] = useState(formatClock(row.actual_start || planned.start))
  const [end, setEnd] = useState(formatClock(row.actual_end || planned.end))
  useEffect(() => {
    setStart(formatClock(row.actual_start || planned.start))
    setEnd(formatClock(row.actual_end || planned.end))
  }, [planned.end, planned.start, row.actual_end, row.actual_start])
  const setStartTime = (value) => {
    setStart(value)
    if (fixedMinutes) setEnd(clockPlusMinutes(value, fixedMinutes))
  }
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
  const cardRef = useRef(null)
  const rowRef = useRef(row)
  useEffect(() => {
    rowRef.current = row
  }, [row])
  const now = DateTime.now().setZone('Europe/Berlin')
  const canMark = Boolean(onConfirm && isAssignmentActive(row) && !isJobPast({ ...job, start_time: planned.start || job?.start_time, end_time: planned.end || job?.end_time }, now) && !row.seen_at)
  useEffect(() => {
    if (!canMark) return undefined
    const node = cardRef.current
    const mark = () => onConfirm(rowRef.current)
    if (!node || typeof IntersectionObserver === 'undefined') {
      mark()
      return undefined
    }
    let timer
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) {
        clearTimeout(timer)
        return
      }
      timer = setTimeout(mark, 500)
    }, { threshold: 0.35 })
    observer.observe(node)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [canMark, onConfirm, row.id, row.seen_at])

  return (
    <article ref={cardRef} className={compact ? 'rounded-2xl border border-slate-800 bg-slate-950/50 p-3' : 'rounded-2xl border border-slate-800 bg-slate-900/80 p-4'}>
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
          <div className="mt-3 grid grid-cols-1 gap-3">
            <TimeField label={t('planStart')} value={start} onChange={setStartTime} />
            {fixedMinutes ? (
              <ComputedEnd
                label={t('planEnd')}
                time={end}
                note={t('objectFixedEnd').replace('{hours}', formatFixedHoursLabel(object.fixed_hours))}
              />
            ) : (
              <TimeField label={t('planEnd')} value={end} onChange={setEnd} />
            )}
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
        <>
          <p className="mt-2 text-sm text-slate-300">
            {t('hoursPlanned')}
            {': '}
            {clockRangeLabel(planned) || [formatClock(job?.start_time), formatClock(job?.end_time)].filter(Boolean).join(' – ') || '—'}
          </p>
          {locked ? <p className="mt-1 text-[12px] text-slate-400">{t('objectFixedLocked')}</p> : null}
        </>
      )}
    </article>
  )
}

export default function EmployeeHours({
  t,
  language,
  objects = [],
  currentWorker,
  myPlan = [],
  selfLogs = [],
  loading = false,
  errorMessage = '',
  onRetry,
  onSaveHours,
  onConfirm,
  savingId = '',
  boardDate,
  onBoardDateChange,
  lockFixedTimes = true,
  absences = [],
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
    + selfLogs.filter(item => weekDays.includes(isoDate(item.work_date))).reduce((sum, item) => sum + selfLogMinutes(item), 0)
  const monthMinutes = monthRows.reduce((sum, row) => sum + rowWorkMinutes(row), 0)
    + selfLogs.filter((item) => {
      const date = DateTime.fromISO(isoDate(item.work_date), { zone: 'Europe/Berlin' })
      return date.isValid && date.year === month.year && date.month === month.month
    }).reduce((sum, item) => sum + selfLogMinutes(item), 0)
  const monthMap = monthRows.reduce((map, row) => {
    const date = isoDate(row.work_jobs?.work_date)
    if (!date) return map
    map[date] = (map[date] || 0) + rowWorkMinutes(row)
    return map
  }, {})
  for (const item of selfLogs) {
    const date = isoDate(item.work_date)
    const dt = DateTime.fromISO(date, { zone: 'Europe/Berlin' })
    if (!date || !dt.isValid || dt.year !== month.year || dt.month !== month.month) continue
    monthMap[date] = (monthMap[date] || 0) + selfLogMinutes(item)
  }
  const monthDays = Object.entries(monthMap).sort(([left], [right]) => left.localeCompare(right))
  const presenceDays = monthDays.length
  const shiftMonth = (delta) => {
    const next = DateTime.fromISO(selectedDate, { zone: 'Europe/Berlin' }).plus({ months: delta }).startOf('month')
    setBoardDate(next.toISODate())
  }
  const counts = weekDays.reduce((map, date) => {
    const jobs = weekRows.filter(row => isoDate(row.work_jobs?.work_date) === date).length
    const own = selfLogs.filter(item => isoDate(item.work_date) === date).length
    const total = jobs + own
    if (total) map[date] = total
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

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl bg-cyan-500/10 px-4 py-3 ring-1 ring-cyan-400/20">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200">{t('hoursWeekTotal')}</p>
          <p className="mt-1 text-2xl font-black text-white">{minutesLabel(weekMinutes, t)}</p>
        </div>
        <div className="rounded-2xl bg-slate-800/80 px-4 py-3 ring-1 ring-white/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{t('hoursMonthTotal')}</p>
          <p className="mt-1 text-2xl font-black text-white">{minutesLabel(monthMinutes, t)}</p>
        </div>
        <div className="rounded-2xl bg-slate-800/80 px-4 py-3 ring-1 ring-white/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{t('hoursPresence')}</p>
          <p className="mt-1 text-2xl font-black text-white">{t('hoursPresenceCount').replace('{days}', String(presenceDays))}</p>
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

      {dayRows.length > 0 ? (
        <div className="space-y-3">
          {dayRows.map(row => (
            <HoursRow
              key={row.id}
              t={t}
              language={language}
              today={today}
              row={row}
              object={objectById(row.work_jobs?.object_id)}
              workerLabel=""
              currentWorkerId={currentWorker?.id}
              onSave={onSaveHours}
              onConfirm={onConfirm}
              saving={savingId === row.id}
              lockFixedTimes={lockFixedTimes}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-6 text-center text-sm text-slate-400">
          {t('planDayEmpty')}
        </p>
      )}

      <MyLeaveCard
        t={t}
        language={language}
        year={DateTime.now().setZone('Europe/Berlin').year}
        worker={currentWorker}
        absences={absences}
      />
    </div>
  )
}
