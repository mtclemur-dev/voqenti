import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import { supabase } from '../supabaseClient'
import { IconAlert, IconBag, IconCheck, IconChevron, IconMap, IconNote, IconWork } from './icons'
import WeekBoard from './WeekBoard'
import { cancelJobReminders, currentNotifyPermission, requestNotifyPermission, scheduleJobReminders } from './jobReminders'
import { HoursRow } from './EmployeeHours'
import SelfWorkForm from './SelfWorkForm'
import OpenPostActions from './OpenPostActions'
import { ObjectGuidePanel } from './ObjectGuide'
import { openPostAnswer } from './openPostRespond'
import {
  assignmentRange,
  withChainedAssignmentRows,
  berlinWeekDays,
  berlinWeekStart,
  crewAssignees,
  dayStampKey,
  fillText,
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
  selfLogMinutes,
  shortPlace,
  sortPlanRows,
  workerDayTravel,
} from './planUtils'
import { ensureDayTravels, formatKm, travelLegLabelKey } from './travel'

const NOTICES_SEEN_KEY = 'voqenti-notices-seen-at'

function hasText(value) {
  return Boolean(String(value || '').trim())
}

function jobsFromPlan(rows) {
  const map = new Map()
  for (const row of rows || []) {
    const job = row.work_jobs
    if (!job?.id) continue
    if (!map.has(job.id)) map.set(job.id, { ...job, work_job_assignees: [] })
    map.get(job.id).work_job_assignees.push(row)
  }
  return [...map.values()]
}

function TravelLeg({ t, leg }) {
  if (!leg?.minutes && !leg?.meters) return null
  return (
    <div className="flex items-center gap-3 px-2 py-1 text-[11px] font-semibold tracking-wide text-slate-400">
      <span className="h-px flex-1 bg-white/10" />
      <span className="tabular-nums text-cyan-100/90">
        {fillText(t(travelLegLabelKey(leg)), { minutes: String(leg.minutes || 0) })}
        {leg.meters ? ` · ${formatKm(leg.meters)} km` : ''}
      </span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  )
}

function TravelDayCard({ t, trip }) {
  if (!trip?.minutes && !trip?.meters) return null
  return (
    <div className="rounded-2xl bg-slate-950/70 px-4 py-3 ring-1 ring-white/10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{t('travelTitle')}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-white">
        {fillText(t('travelDay'), { km: formatKm(trip.meters) || '0', time: minutesLabel(trip.minutes, t) })}
      </p>
      {t('travelHint') ? <p className="mt-1 text-xs text-slate-400">{t('travelHint')}</p> : null}
    </div>
  )
}

function useMarkSeenWhenVisible(row, onConfirm, enabled) {
  const nodeRef = useRef(null)
  const rowRef = useRef(row)
  useEffect(() => {
    rowRef.current = row
  }, [row])
  useEffect(() => {
    if (!enabled || !onConfirm || row.seen_at) return undefined
    const node = nodeRef.current
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
  }, [enabled, onConfirm, row.id, row.seen_at])
  return nodeRef
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
  lockFixedTimes = true,
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
  const cardRef = useMarkSeenWhenVisible(row, onConfirm, canAct && !busy)

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

      <div className="mt-4">
        <ObjectGuidePanel t={t} language={language} object={object} date={job.work_date} />
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
            onConfirm={onConfirm}
            saving={confirmingId === row.id}
            compact
            lockFixedTimes={lockFixedTimes}
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
  lockFixedTimes = true,
}) {
  const [open, setOpen] = useState(false)
  const job = row.work_jobs
  const range = assignmentRange(row, job)
  const timedJob = { ...job, start_time: range.start || job.start_time, end_time: range.end || job.end_time }
  const start = range.start
  const place = object?.name || job.object_name || t('planNoPlace')
  const detailsLabel = open ? t('collapseDetails') : t('expandDetails')
  const canMark = isAssignmentActive(row) && !isJobPast(timedJob, now)
  const cardRef = useMarkSeenWhenVisible(row, onConfirm, canMark)

  return (
    <article ref={cardRef} className={`rounded-2xl border p-3 ${alert ? 'border-rose-400/25 bg-rose-500/10' : 'border-slate-800 bg-slate-900/70'}`}>
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
              lockFixedTimes={lockFixedTimes}
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
  selfLogs = [],
  myPending = [],
  loading = false,
  errorMessage = '',
  onRetry,
  onConfirm,
  onSaveHours,
  onSaveSelfLog,
  onDeleteSelfLog,
  onOpenNotices,
  onOpenHours,
  confirmingId = '',
  savingSelf = false,
  boardDate,
  onBoardDateChange,
  allowPastHours = false,
  helpAsks = [],
  onHelpRespond,
  lockFixedTimes = true,
}) {
  const [now] = useState(() => DateTime.now().setZone('Europe/Berlin'))
  const today = now.toISODate()
  const selectedDate = boardDate || today
  const setBoardDate = (date) => onBoardDateChange?.(date)
  const [notifyPerm, setNotifyPerm] = useState(null)
  const [travelTick, setTravelTick] = useState(0)
  const scheduledRef = useRef(new Set())
  const objectById = (id) => objects.find(item => item.id === id)
  useEffect(() => {
    let cancelled = false
    currentNotifyPermission().then(value => {
      if (!cancelled) setNotifyPerm(value)
    })
    return () => { cancelled = true }
  }, [])
  const sorted = useMemo(
    () => withChainedAssignmentRows(
      [...myPlan].filter(row => !isJobCancelled(row.work_jobs) && (allowPastHours || isoDate(row.work_jobs?.work_date) >= today)),
      objects,
    ).sort(sortPlanRows),
    [allowPastHours, myPlan, objects, today],
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
  for (const item of selfLogs) {
    const date = isoDate(item.work_date)
    if (!date || (!allowPastHours && date < today)) continue
    boardCounts[date] = (boardCounts[date] || 0) + 1
  }
  const liveDate = allowPastHours ? selectedDate : (selectedDate < today ? today : selectedDate)
  const hoursDate = allowPastHours ? liveDate : today
  const todayRows = sorted.filter(row => isoDate(row.work_jobs?.work_date) === today)
  const otherDayRows = liveDate === today ? [] : sorted.filter(row => isoDate(row.work_jobs?.work_date) === liveDate)
  const travelJobs = useMemo(
    () => jobsFromPlan(sorted.filter(row => isoDate(row.work_jobs?.work_date) === liveDate)),
    [liveDate, sorted],
  )
  useEffect(() => {
    if (!travelJobs.length) return undefined
    let cancelled = false
    ensureDayTravels(travelJobs, objects).then(() => {
      if (!cancelled) setTravelTick(current => current + 1)
    })
    return () => { cancelled = true }
  }, [objects, travelJobs])
  const dayTrip = useMemo(
    () => (currentWorker?.id
      ? workerDayTravel(travelJobs, currentWorker.id, liveDate, objects)
      : null),
    [currentWorker?.id, liveDate, objects, travelJobs, travelTick],
  )
  const weekDays = berlinWeekDays(berlinWeekStart(today))
  const weekMinutes = myPlan
    .filter(row => isAssignmentActive(row) && weekDays.includes(isoDate(row.work_jobs?.work_date)))
    .reduce((sum, row) => sum + rowWorkMinutes(row), 0)
    + selfLogs.filter(item => weekDays.includes(isoDate(item.work_date))).reduce((sum, item) => sum + selfLogMinutes(item), 0)
  const monthStart = now.startOf('month').toISODate()
  const monthEnd = now.endOf('month').toISODate()
  const presenceDays = new Set()
  for (const row of myPlan) {
    const date = isoDate(row.work_jobs?.work_date)
    if (!isAssignmentActive(row) || !date || date < monthStart || date > monthEnd || date > today) continue
    presenceDays.add(date)
  }
  for (const item of selfLogs) {
    const date = isoDate(item.work_date)
    if (!date || date < monthStart || date > monthEnd || date > today) continue
    presenceDays.add(date)
  }

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

      {helpAsks.length > 0 && onHelpRespond && (
        <section className="space-y-3" aria-label={t('notifyOpenPost')}>
          {helpAsks.map(job => (
            <article key={job.id} className="rounded-3xl border border-amber-300/30 bg-amber-400/12 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-200">{t('notifyOpenPost')}</p>
              <h3 className="mt-2 text-lg font-black text-white">{job.location_text || job.object_name || t('planNoPlace')}</h3>
              <p className="mt-1 text-sm font-semibold text-amber-100">
                {formatDisplayDate(job.work_date, language)}
                {assignmentRange({ work_jobs: job }, job).start ? ` · ${assignmentRange({ work_jobs: job }, job).start}` : ''}
                {assignmentRange({ work_jobs: job }, job).end ? ` – ${assignmentRange({ work_jobs: job }, job).end}` : ''}
              </p>
              {job.task_text ? <p className="mt-2 whitespace-pre-wrap text-sm text-amber-50">{job.task_text}</p> : null}
              <div className="mt-3">
                <OpenPostActions
                  t={t}
                  answer={openPostAnswer({ status: job.my_status })}
                  busy={confirmingId === job.id}
                  onChoose={(choice) => onHelpRespond(job, choice)}
                />
              </div>
            </article>
          ))}
        </section>
      )}

      <section aria-label={t('planToday')} className="space-y-3">
        <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-cyan-200">{t('planToday')}</h2>
        {todayRows.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 px-5 py-6 text-center text-sm text-slate-400">
            {t('planDayEmpty')}
          </div>
        ) : (
          <>
            {liveDate === today ? <TravelDayCard t={t} trip={dayTrip} /> : null}
            {todayRows.map(row => (
              <Fragment key={row.id}>
                {liveDate === today ? <TravelLeg t={t} leg={(dayTrip?.legs || []).find(item => item.toJobId === row.work_jobs?.id)} /> : null}
                {isAssignmentActive(row) ? (
                  <NextAssignmentCard
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
                    lockFixedTimes={lockFixedTimes}
                  />
                ) : (
                  <ExpandableAssignment
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
                    lockFixedTimes={lockFixedTimes}
                  />
                )}
              </Fragment>
            ))}
            {liveDate === today ? <TravelLeg t={t} leg={(dayTrip?.legs || []).find(item => item.kind === 'back')} /> : null}
          </>
        )}
      </section>

      {onSaveSelfLog && (
        <SelfWorkForm
          t={t}
          language={language}
          today={today}
          date={hoursDate}
          objects={objects}
          logs={selfLogs}
          onSave={onSaveSelfLog}
          onDelete={onDeleteSelfLog}
          saving={savingSelf}
        />
      )}

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

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onOpenHours}
          disabled={!onOpenHours}
          className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-80"
        >
          <span className="text-sm font-semibold text-cyan-50">{t('hoursWeekTotal')}</span>
          <span className="text-lg font-black text-white">{minutesLabel(weekMinutes, t)}</span>
        </button>
        <div className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
          <span className="text-sm font-semibold text-slate-300">{t('hoursPresence')}</span>
          <span className="text-lg font-black text-white">{t('hoursPresenceCount').replace('{days}', String(presenceDays.size))}</span>
        </div>
      </div>

      <NoticesCard t={t} onOpen={onOpenNotices} />

      <WeekBoard
        t={t}
        language={language}
        today={today}
        selectedDate={liveDate}
        onSelectDate={(date) => {
          if (!allowPastHours && date < today) return
          setBoardDate(date)
        }}
        counts={boardCounts}
        hidePast={!allowPastHours}
      />

      {liveDate !== today && (
        otherDayRows.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 px-5 py-6 text-center text-sm text-slate-400">
            {t('planDayEmpty')}
          </div>
        ) : (
          <div className="space-y-3">
            <TravelDayCard t={t} trip={dayTrip} />
            {otherDayRows.map(row => (
              <Fragment key={row.id}>
                <TravelLeg t={t} leg={(dayTrip?.legs || []).find(item => item.toJobId === row.work_jobs?.id)} />
                <ExpandableAssignment
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
                  lockFixedTimes={lockFixedTimes}
                />
              </Fragment>
            ))}
            <TravelLeg t={t} leg={(dayTrip?.legs || []).find(item => item.kind === 'back')} />
          </div>
        )
      )}
    </div>
  )
}
