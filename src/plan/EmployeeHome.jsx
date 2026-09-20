import { useEffect, useMemo, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import { supabase } from '../supabaseClient'
import { IconAlert, IconBag, IconCheck, IconChevron, IconMap, IconNote, IconWork } from './icons'
import WeekBoard from './WeekBoard'
import { cancelJobReminders, currentNotifyPermission, requestNotifyPermission, scheduleJobReminders } from './jobReminders'
import { HoursRow } from './EmployeeHours'
import {
  assignmentRange,
  berlinWeekDays,
  berlinWeekStart,
  crewAssignees,
  dayStampKey,
  firstName,
  formatDisplayDate,
  formatSeenAt,
  formatUpdatedAt,
  isAssignmentActive,
  isAssignmentInactive,
  isJobCancelled,
  isJobPast,
  isoDate,
  jobDurationLabel,
  jobMapsHref,
  jobPhone,
  minutesLabel,
  rowWorkMinutes,
  shortPlace,
  sortPlanRows,
} from './planUtils'

const NOTICES_SEEN_KEY = 'voqenti-notices-seen-at'

function hasText(value) {
  return Boolean(String(value || '').trim())
}

function StatusBadge({ t, row, language, past = false }) {
  if (isJobCancelled(row.work_jobs)) {
    return (
      <p className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1 text-sm font-semibold text-rose-100">
        <IconAlert className="h-4 w-4" />
        {t('planCancelled')}
      </p>
    )
  }
  if (row.status === 'declined') {
    return (
      <p className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1 text-sm font-semibold text-rose-100">
        <IconAlert className="h-4 w-4" />
        {t('planDeclined')}
      </p>
    )
  }
  if (past) {
    return (
      <p className="inline-flex items-center gap-2 rounded-full bg-slate-700 px-3 py-1 text-sm font-semibold text-slate-200">
        <IconCheck className="h-4 w-4" />
        {t('planDone')}
      </p>
    )
  }
  if (row.seen_at) {
    return (
      <p className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-100">
        <IconCheck className="h-4 w-4" />
        {t('planOpenedAt').replace('{time}', formatSeenAt(row.seen_at, language))}
      </p>
    )
  }
  return (
    <p className="inline-flex items-center gap-2 rounded-full bg-slate-700 px-3 py-1 text-sm font-semibold text-slate-200">
      {t('planNotOpened')}
    </p>
  )
}

function InstructionBlock({ label, tone, icon: Icon, children }) {
  if (!hasText(children)) return null
  const tones = {
    cyan: 'border-cyan-400/25 bg-cyan-500/10',
    blue: 'border-sky-400/25 bg-sky-500/10',
    orange: 'border-orange-400/25 bg-orange-500/10',
    gray: 'border-slate-600/50 bg-slate-800/70',
  }
  const icons = {
    cyan: 'text-cyan-200',
    blue: 'text-sky-200',
    orange: 'text-orange-200',
    gray: 'text-slate-300',
  }
  return (
    <section className={`rounded-xl border px-3 py-2.5 ${tones[tone]}`}>
      <h3 className={`flex items-center gap-2 text-xs font-semibold ${icons[tone]}`}>
        {Icon && <Icon className="h-4 w-4" />}
        {label}
      </h3>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-100">{children}</p>
    </section>
  )
}

function AssignmentDetails({ t, job }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <InstructionBlock label={t('planTask')} tone="cyan" icon={IconWork}>{job.task_text}</InstructionBlock>
      <InstructionBlock label={t('planBring')} tone="blue" icon={IconBag}>{job.bring_text}</InstructionBlock>
      <InstructionBlock label={t('planRemember')} tone="orange" icon={IconAlert}>{job.remember_text}</InstructionBlock>
      <InstructionBlock label={t('planNotes')} tone="gray" icon={IconNote}>{job.notes_text}</InstructionBlock>
    </div>
  )
}

function workerLabel(workers, workerId) {
  const name = workers.find(item => item.id === workerId)?.name || ''
  return firstName(name) || name
}

function storedCrewNames(job) {
  if (Array.isArray(job?.crew_names)) return job.crew_names.filter(Boolean)
  const text = String(job?.crew_names || '').trim()
  return text ? text.split(',').map(item => item.trim()).filter(Boolean) : []
}

function CrewLine({ t, job, workers = [], currentWorkerId }) {
  const mine = workers.find(item => item.id === currentWorkerId)?.name || ''
  const mineFirst = firstName(mine)
  const names = []
  const add = (name) => {
    const label = String(name || '').trim()
    if (!label) return
    if (label === mine || (mineFirst && firstName(label) === mineFirst)) return
    if (names.some(item => item === label || firstName(item) === firstName(label))) return
    names.push(label)
  }
  storedCrewNames(job).forEach(add)
  crewAssignees(job)
    .filter(row => row.worker_id && row.worker_id !== currentWorkerId)
    .forEach(row => add(workerLabel(workers, row.worker_id)))
  if (!names.length) return null
  return (
    <span className="mt-1 block text-sm font-semibold text-cyan-100">
      {t('planWithCrew').replace('{names}', names.join(', '))}
    </span>
  )
}

function NoticesCard({ t, onOpen }) {
  const [latest, setLatest] = useState(null)
  const [isNew, setIsNew] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase
        .from('company_notices')
        .select('id, title, created_at')
        .eq('board', 'hiring')
        .order('created_at', { ascending: false })
        .limit(1)
      if (cancelled || error) return
      const item = data?.[0] ?? null
      setLatest(item)
      if (!item?.created_at) {
        setIsNew(false)
        return
      }
      const seen = localStorage.getItem(NOTICES_SEEN_KEY) || ''
      setIsNew(item.created_at > seen)
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (!latest) return null
  return (
    <button
      type="button"
      onClick={() => {
        localStorage.setItem(NOTICES_SEEN_KEY, latest.created_at)
        setIsNew(false)
        onOpen()
      }}
      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
    >
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-400">{t('notices')}</span>
        <span className="mt-0.5 block truncate text-sm text-white">{latest.title}</span>
      </span>
      {isNew && <span className="shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-slate-950">{t('newBadge')}</span>}
    </button>
  )
}

function NextAssignmentCard({
  t,
  language,
  today,
  now,
  row,
  object,
  workers = [],
  currentWorkerId,
  onConfirm,
  onSaveHours,
  confirmingId = '',
  confirming = false,
  embedded = false,
}) {
  const job = row.work_jobs
  const range = assignmentRange(row, job)
  const timedJob = { ...job, start_time: range.start || job.start_time, end_time: range.end || job.end_time }
  const inactive = isAssignmentInactive(row)
  const past = isJobPast(timedJob, now)
  const canAct = !inactive && !past
  const stamp = dayStampKey(job.work_date, today)
  const start = range.start
  const end = range.end
  const duration = jobDurationLabel(timedJob, t)
  const mapsHref = jobMapsHref(job, object)
  const phone = jobPhone(object)
  const place = object?.name || job.object_name || t('planNoPlace')
  const address = object?.address || job.location_text
  const timeLabel = [start, end].filter(Boolean).join(' – ')
  const busy = confirming || confirmingId === row.id
  const cardRef = useRef(null)
  const rowRef = useRef(row)

  useEffect(() => {
    rowRef.current = row
  }, [row])

  useEffect(() => {
    if (!canAct || row.seen_at || busy) return undefined
    const node = cardRef.current
    const mark = () => onConfirm?.(rowRef.current)
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
      timer = setTimeout(mark, 800)
    }, { threshold: 0.55 })
    observer.observe(node)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [busy, canAct, onConfirm, row.id, row.seen_at])

  return (
    <article ref={cardRef} className={embedded ? '' : 'rounded-3xl border border-slate-800 bg-slate-900/90 p-4 md:p-5'}>
      <div className="grid gap-3 md:grid-cols-2 md:items-start md:gap-x-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {stamp && (
              <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-sm font-semibold text-cyan-100">{t(stamp)}</span>
            )}
            <StatusBadge t={t} row={row} language={language} past={past} />
          </div>
          <p className="text-sm text-slate-300">{formatDisplayDate(job.work_date, language)}</p>
          {timeLabel && (
            <p className="text-xl font-bold tracking-tight text-white md:text-2xl">{timeLabel}</p>
          )}
          {duration && (
            <p className="text-sm font-semibold text-cyan-100">{duration}</p>
          )}
        </div>
        <div className="space-y-2">
          <h2 className="break-words text-xl font-bold text-white md:text-2xl">{place}</h2>
          {address && <p className="break-words text-sm leading-5 text-slate-200">{address}</p>}
          <CrewLine t={t} job={job} workers={workers} currentWorkerId={currentWorkerId} />
          {(object?.manager || phone) && (
            <p className="text-sm text-slate-300">
              {object?.manager && <span>{t('responsible')}: {object.manager}</span>}
              {object?.manager && phone ? ' · ' : null}
              {phone && (
                <a href={`tel:${phone}`} className="font-semibold text-cyan-100 underline-offset-2 hover:underline">
                  {phone}
                </a>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <AssignmentDetails t={t} job={job} />
      </div>

      {onSaveHours && (
        <div className="mt-4">
          <HoursRow
            t={t}
            language={language}
            today={today}
            row={row}
            object={object}
            workerLabel=""
            currentWorkerId={currentWorkerId}
            onSave={onSaveHours}
            saving={confirmingId === row.id}
            compact
          />
        </div>
      )}

      {job.updated_at && (
        <p className="mt-3 text-xs text-slate-500">{t('lastUpdated')}: {formatUpdatedAt(job.updated_at, language)}</p>
      )}

      {canAct && mapsHref && (
        <div className="mt-4 grid gap-2">
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
          >
            <IconMap />
            {t('openNavigation')}
          </a>
        </div>
      )}

      {inactive && row.decline_reason && (
        <p className="mt-3 text-sm text-rose-100">{row.decline_reason}</p>
      )}
    </article>
  )
}

function ExpandableAssignment({
  t,
  language,
  today,
  now,
  row,
  object,
  workers = [],
  currentWorkerId,
  onConfirm,
  onSaveHours,
  confirmingId = '',
  confirming = false,
  alert = false,
}) {
  const [open, setOpen] = useState(false)
  const job = row.work_jobs
  const range = assignmentRange(row, job)
  const timedJob = { ...job, start_time: range.start || job.start_time, end_time: range.end || job.end_time }
  const start = range.start
  const place = object?.name || job.object_name || t('planNoPlace')
  const detailsLabel = open ? t('collapseDetails') : t('expandDetails')

  return (
    <article className={`rounded-2xl border p-3 ${alert ? 'border-rose-400/25 bg-rose-500/10' : 'border-slate-800 bg-slate-900/70'}`}>
      <button
        type="button"
        onClick={() => setOpen(current => {
          const next = !current
          if (next && !row.seen_at && isAssignmentActive(row) && !isJobPast(timedJob, now)) onConfirm?.(row)
          return next
        })}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-slate-400">
            {formatDisplayDate(job.work_date, language)}
            {start ? ` · ${start}` : ''}
          </span>
          <span className="mt-1 block truncate text-base font-semibold text-white">{place}</span>
          <span className="mt-1 block truncate text-sm text-slate-300">{shortPlace(job, object)}</span>
          <CrewLine t={t} job={job} workers={workers} currentWorkerId={currentWorkerId} />
        </span>
        <StatusBadge t={t} row={row} language={language} past={isJobPast(timedJob, now)} />
        <span className="sr-only">{detailsLabel}</span>
        <IconChevron className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-3 border-t border-slate-800 pt-3">
          {alert ? (
            <div className="space-y-3">
              <AssignmentDetails t={t} job={job} />
              {row.decline_reason && <p className="text-sm text-rose-100">{row.decline_reason}</p>}
            </div>
          ) : (
            <NextAssignmentCard
              t={t}
              language={language}
              today={today}
              now={now}
              row={row}
              object={object}
              workers={workers}
              currentWorkerId={currentWorkerId}
              onConfirm={onConfirm}
              onSaveHours={onSaveHours}
              confirmingId={confirmingId}
              confirming={confirming}
              embedded
            />
          )}
        </div>
      )}
    </article>
  )
}

export default function EmployeeHome({
  t,
  language = 'de',
  currentWorker,
  workers = [],
  objects = [],
  myPlan = [],
  myPending = [],
  absences = [],
  loading = false,
  errorMessage = '',
  onRetry,
  onConfirm,
  onSaveHours,
  onOpenNotices,
  onOpenHours,
  confirmingId = '',
  boardDate,
  onBoardDateChange,
}) {
  const [now] = useState(() => DateTime.now().setZone('Europe/Berlin'))
  const today = now.toISODate()
  const selectedDate = boardDate || today
  const setBoardDate = (date) => onBoardDateChange?.(date)
  const [notifyPerm, setNotifyPerm] = useState(null)
  const scheduledRef = useRef(new Set())
  const objectById = (id) => objects.find(item => item.id === id)
  useEffect(() => {
    let cancelled = false
    currentNotifyPermission().then(value => {
      if (!cancelled) setNotifyPerm(value)
    })
    return () => { cancelled = true }
  }, [])
  const upcomingAbsences = absences.filter(item => isoDate(item.end_date) >= today && item.worker_id === currentWorker?.id)
  const sorted = useMemo(
    () => [...myPlan].filter(row => !isJobCancelled(row.work_jobs) && isoDate(row.work_jobs?.work_date) >= today).sort(sortPlanRows),
    [myPlan, today],
  )
  useEffect(() => {
    if (notifyPerm !== 'granted') return undefined
    for (const row of sorted) {
      const jobId = row.work_jobs?.id
      if (!jobId || !isAssignmentActive(row)) continue
      if (row.seen_at) {
        if (scheduledRef.current.has(jobId)) {
          scheduledRef.current.delete(jobId)
          cancelJobReminders(jobId)
        }
        continue
      }
      if (scheduledRef.current.has(jobId)) continue
      scheduledRef.current.add(jobId)
      const place = objects.find(item => item.id === row.work_jobs.object_id)?.name || row.work_jobs.object_name || row.work_jobs.location_text || t('planNoPlace')
      const start = assignmentRange(row).start
      scheduleJobReminders({
        jobId,
        title: t('notifyReminder'),
        body: `${formatDisplayDate(row.work_jobs.work_date, language)}${start ? ` · ${start}` : ''} · ${place}`,
        workDate: row.work_jobs.work_date,
      })
    }
    return undefined
  }, [language, notifyPerm, objects, sorted, t])
  const boardCounts = sorted.reduce((counts, row) => {
    const date = isoDate(row.work_jobs?.work_date)
    if (!date) return counts
    counts[date] = (counts[date] || 0) + 1
    return counts
  }, {})
  const liveDate = selectedDate < today ? today : selectedDate
  const todayRows = sorted.filter(row => isoDate(row.work_jobs?.work_date) === today)
  const otherDayRows = liveDate === today ? [] : sorted.filter(row => isoDate(row.work_jobs?.work_date) === liveDate)
  const weekDays = berlinWeekDays(berlinWeekStart(today))
  const weekMinutes = myPlan
    .filter(row => isAssignmentActive(row) && weekDays.includes(isoDate(row.work_jobs?.work_date)))
    .reduce((sum, row) => sum + rowWorkMinutes(row), 0)

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <div className="h-16 animate-pulse rounded-2xl bg-slate-800/80" />
        <div className="h-40 animate-pulse rounded-3xl bg-slate-800/80" />
        <div className="h-20 animate-pulse rounded-2xl bg-slate-800/70" />
        <span className="sr-only">{t('loading')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
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

      <section aria-label={t('planToday')} className="space-y-3">
        <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-cyan-200">{t('planToday')}</h2>
        {todayRows.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 px-5 py-6 text-center text-sm text-slate-400">
            {t('planDayEmpty')}
          </div>
        ) : (
          todayRows.map(row => (
            isAssignmentActive(row) ? (
              <NextAssignmentCard
                key={row.id}
                t={t}
                language={language}
                today={today}
                now={now}
                row={row}
                object={objectById(row.work_jobs?.object_id)}
                workers={workers}
                currentWorkerId={currentWorker?.id}
                onConfirm={onConfirm}
                onSaveHours={onSaveHours}
                confirmingId={confirmingId}
              />
            ) : (
              <ExpandableAssignment
                key={row.id}
                t={t}
                language={language}
                today={today}
                now={now}
                row={row}
                object={objectById(row.work_jobs?.object_id)}
                workers={workers}
                currentWorkerId={currentWorker?.id}
                onConfirm={onConfirm}
                onSaveHours={onSaveHours}
                confirmingId={confirmingId}
                alert={isAssignmentInactive(row)}
              />
            )
          ))
        )}
      </section>

      {myPending.length > 0 && (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3">
          <p className="text-sm font-semibold text-amber-50">{t('planWaiting')}</p>
          {myPending.map(row => (
            <p key={row.id} className="mt-1 text-sm text-amber-100">
              {formatDisplayDate(row.work_jobs?.work_date, language)}
              {assignmentRange(row).start ? ` · ${assignmentRange(row).start}` : ''}
              {' · '}
              {row.work_jobs?.object_name || row.work_jobs?.location_text || t('planNoPlace')}
            </p>
          ))}
        </div>
      )}

      {upcomingAbsences.length > 0 && (
        <aside className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-rose-50">
            <IconAlert className="h-4 w-4" />
            {t('absenceOfficeMarked')}
          </p>
          {upcomingAbsences.map(item => (
            <p key={item.id} className="mt-1 text-sm text-rose-100">
              {item.reason === 'vacation' ? t('absenceVacation') : t('absenceSick')}
              {' · '}
              {isoDate(item.start_date) ? formatDisplayDate(item.start_date) : ''} – {isoDate(item.end_date) ? formatDisplayDate(item.end_date) : ''}
            </p>
          ))}
        </aside>
      )}

      {notifyPerm && notifyPerm !== 'granted' && notifyPerm !== 'unsupported' && sorted.some(row => isAssignmentActive(row) && !row.seen_at) && (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3">
          <p className="text-sm text-amber-50">{t('notifyEnableHint')}</p>
          <button
            type="button"
            onClick={async () => {
              const next = await requestNotifyPermission()
              setNotifyPerm(next)
            }}
            className="mt-2 min-h-11 rounded-xl bg-amber-300 px-4 text-sm font-semibold text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {t('enableNotifications')}
          </button>
        </div>
      )}

      {onOpenHours && (
        <button
          type="button"
          onClick={onOpenHours}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <span className="text-sm font-semibold text-cyan-50">{t('hoursWeekTotal')}</span>
          <span className="text-lg font-black text-white">{minutesLabel(weekMinutes, t)}</span>
        </button>
      )}

      <NoticesCard t={t} onOpen={onOpenNotices} />

      <WeekBoard
        t={t}
        language={language}
        today={today}
        selectedDate={liveDate}
        onSelectDate={(date) => {
          if (date < today) return
          setBoardDate(date)
        }}
        counts={boardCounts}
        hidePast
      />

      {liveDate !== today && (
        otherDayRows.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 px-5 py-6 text-center text-sm text-slate-400">
            {t('planDayEmpty')}
          </div>
        ) : (
          <div className="space-y-3">
            {otherDayRows.map(row => (
              <ExpandableAssignment
                key={row.id}
                t={t}
                language={language}
                today={today}
                now={now}
                row={row}
                object={objectById(row.work_jobs?.object_id)}
                workers={workers}
                currentWorkerId={currentWorker?.id}
                onConfirm={onConfirm}
                onSaveHours={onSaveHours}
                confirmingId={confirmingId}
                alert={isAssignmentInactive(row)}
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}
