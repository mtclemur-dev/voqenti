import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import { supabase } from './supabaseClient'
import EmployeeHome from './plan/EmployeeHome'
import EmployeeHours from './plan/EmployeeHours'
import AdminPlanBoard from './plan/AdminPlanBoard'
import { assignmentRange, clockPlusMinutes, clockRange, clockRangeLabel, datesInRange, debounce, expandPlanDays, firstName, formatClock, formatObjectFixedSummary, formatUpdatedAt, formWithFixedTimes, isOfficePlanner, isOwnerWorker, isPlannerRole, jobDurationLabel, jobIsOwnerPrivate, leaveBalance, leaveBookingClash, marksFromJobs, minutesLabel, nextWeekday, objectFixedHoursLabel, objectFixedMinutes, objectFixedStart, objectHasFixedHours, objectHasGuide, objectPlanWeekdays, objectTimeLocked, overlappingWorkerDays, ownerWorkerIdSet, packWorkerSlots, parseFixedHoursByDay, parseFixedHoursValue, parseTurnus, PLANNER_INVITE_ROLE, rangesOverlap, rowWorkMinutes, serializeFixedHoursJson, serializeTurnus, skipPlanNotice, spanClockRange, vacationDaysInRange, weekdayLabel, withChainedAssignmentRows, withChainedBoardJobs, withChainedJobTimes, withFixedEnd, withObjectPlanRange, withSavedJob, workerDaySlots, WORK_WEEKDAYS } from './plan/planUtils'
import { ensureDayTravels } from './plan/travel'
import { groupsFromObject, serializeGroups } from './plan/objectRooms'
import { ObjectSheetFields } from './plan/ObjectGuide'
import { applyTurnusSheet } from './plan/turnusSheet'
import { isSpreadBlattObject, jobsStretchedBySheet, objectPayloadFromStrip, restoreMinutesForObject, stripSpreadBlatt } from './plan/clearBlattSpread'
import { readTurnusFile } from './plan/readTurnusFile'
import { LeavePeoplePanel } from './plan/LeaveBalance'
import FleetPanel from './plan/FleetPanel'
import OpenPostActions from './plan/OpenPostActions'
import { openPostAnswer, respondToOpenPost } from './plan/openPostRespond'
import { IconMore } from './plan/icons'
import { cancelJobReminders, cancelUnseenReminder } from './plan/jobReminders'
import { ADMIN_TABS, HISTORY_TABS, ROSTER_FILTERS, isoDateOr, oneOf, readUiMemory, stringOr, writeUiMemory } from './plan/uiMemory'
import TimeField, { ComputedEnd } from './plan/TimeField'

const emptyForm = () => {
  const today = DateTime.now().setZone('Europe/Berlin').toISODate()
  return {
    work_date: today,
    start_time: '',
    end_time: '',
    object_id: '',
    location_text: '',
    task_text: '',
    bring_text: '',
    remember_text: '',
    notes_text: '',
    worker_ids: [],
    until_date: today,
    weekdays: [...WORK_WEEKDAYS],
    applyTimeToAll: false,
    worker_hours: {},
  }
}

const emptyAbsence = () => ({
  worker_id: '',
  start_date: DateTime.now().setZone('Europe/Berlin').toISODate(),
  end_date: DateTime.now().setZone('Europe/Berlin').toISODate(),
  reason: 'sick',
  note: '',
})

const emptyObjectForm = () => ({
  name: '',
  address: '',
  manager: '',
  phone: '',
  fixed_hours: '',
  fixed_hours_by_day: {},
  time_locked: false,
  fixed_start: '',
  leistung_text: '',
  leistung_image_url: '',
  turnus: {},
  groups: [],
})

const emptyNeedForm = () => ({
  work_date: DateTime.now().setZone('Europe/Berlin').toISODate(),
  start_time: '',
  end_time: '',
  object_id: '',
  location_text: '',
  task_text: '',
  needed_count: 1,
  early_hours: 3,
})

function isMissingColumn(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return error?.code === 'PGRST204'
    || message.includes('planned_start')
    || message.includes('planned_end')
    || message.includes('hours_changed')
    || message.includes('crew_names')
    || message.includes('schema cache')
}

async function loadCrewNamesForJobs(jobIds) {
  if (!jobIds.length) return []
  const rpc = await supabase.rpc('list_job_crew_names', { p_job_ids: jobIds })
  return rpc.error ? [] : (rpc.data ?? [])
}

function attachCrewNames(rows, names) {
  const byJob = {}
  for (const item of names) {
    const jobId = item.job_id
    const name = String(item.worker_name || '').trim()
    if (!jobId || !name) continue
    ;(byJob[jobId] ??= []).push(name)
  }
  return rows.map(row => {
    const job = row.work_jobs
    if (!job) return row
    if (Array.isArray(job.crew_names) && job.crew_names.filter(Boolean).length) return row
    const list = byJob[job.id]
    if (!list?.length) return row
    return { ...row, work_jobs: { ...job, crew_names: [...new Set(list)] } }
  })
}

function attachCrewToJobs(jobs, names) {
  const byJob = {}
  for (const item of names) {
    const jobId = item.job_id
    const name = String(item.worker_name || '').trim()
    if (!jobId || !name) continue
    ;(byJob[jobId] ??= []).push(name)
  }
  return (jobs ?? []).map(job => {
    const extra = byJob[job.id] || []
    const current = Array.isArray(job.crew_names) ? job.crew_names.filter(Boolean) : []
    const merged = [...new Set([...current, ...extra])]
    return merged.length ? { ...job, crew_names: merged } : job
  })
}

function crewNamesFor(workerIds, list = []) {
  return workerIds
    .map(id => list.find(item => item.id === id)?.name)
    .filter(Boolean)
}

function restoreJobForm(saved) {
  const base = emptyForm()
  if (!saved || typeof saved !== 'object') return base
  const hours = {}
  if (saved.worker_hours && typeof saved.worker_hours === 'object') {
    for (const [id, range] of Object.entries(saved.worker_hours)) {
      if (!range || typeof range !== 'object') continue
      hours[id] = {
        start: String(range.start || '').slice(0, 5),
        end: String(range.end || '').slice(0, 5),
      }
    }
  }
  return {
    ...base,
    work_date: isoDateOr(saved.work_date, base.work_date),
    start_time: String(saved.start_time || '').slice(0, 5),
    end_time: String(saved.end_time || '').slice(0, 5),
    object_id: stringOr(saved.object_id),
    location_text: stringOr(saved.location_text),
    task_text: stringOr(saved.task_text),
    bring_text: stringOr(saved.bring_text),
    remember_text: stringOr(saved.remember_text),
    notes_text: stringOr(saved.notes_text),
    worker_ids: Array.isArray(saved.worker_ids) ? saved.worker_ids.filter(id => typeof id === 'string') : [],
    until_date: isoDateOr(saved.until_date, isoDateOr(saved.work_date, base.until_date)),
    weekdays: (() => {
      const days = Array.isArray(saved.weekdays)
        ? saved.weekdays.map(Number).filter(day => day >= 1 && day <= 7)
        : []
      return days.length ? [...new Set(days)].sort((a, b) => a - b) : [...WORK_WEEKDAYS]
    })(),
    applyTimeToAll: Boolean(saved.applyTimeToAll),
    worker_hours: hours,
  }
}

function jobPlaceLabel(job) {
  return job?.location_text || job?.object_name || ''
}

function workerHoursFromAssignees(job) {
  const hours = {}
  for (const row of job?.work_job_assignees ?? []) {
    if (!['assigned', 'approved'].includes(row.status) || !row.worker_id) continue
    hours[row.worker_id] = assignmentRange(row, job)
  }
  return hours
}

function isMissingTable(error) {
  const message = error?.message?.toLowerCase() ?? ''
  return error?.code === '42P01' || message.includes('does not exist') || message.includes('schema cache')
}

function formatJobWhen(job) {
  if (!job) return ''
  const date = formatDisplayDate(job.work_date)
  const start = String(job.start_time || '').slice(0, 5)
  const end = String(job.end_time || '').slice(0, 5)
  const time = [start, end].filter(item => /^\d{2}:\d{2}$/.test(item)).join(' – ')
  return time ? `${date} · ${time}` : date
}

function jobMapsHref(job, objects) {
  if (!job) return null
  const object = objects.find(item => item.id === job.object_id)
  const query = object?.address || job.location_text || job.object_name
  if (!query) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function isActiveAssignedJob(job) {
  return job && job.kind !== 'open_post' && job.status !== 'cancelled' && job.status !== 'canceled'
}

function jobPlaceKey(job) {
  if (job?.object_id) return `id:${job.object_id}`
  const text = String(job?.location_text || job?.object_name || '').trim().toLowerCase()
  return text ? `txt:${text}` : ''
}

function assignedWorkerIds(job) {
  return (job?.work_job_assignees ?? [])
    .filter(row => ['assigned', 'approved'].includes(row.status) || !row.status)
    .map(row => row.worker_id)
    .filter(Boolean)
}

function sameWorkerSet(left, right) {
  if (!left.size || !right.size) return false
  let shared = 0
  for (const id of left) {
    if (right.has(id)) shared += 1
  }
  return shared === left.size || shared === right.size
}

function daysBetween(left, right) {
  const start = DateTime.fromISO(left, { zone: 'Europe/Berlin' }).startOf('day')
  const end = DateTime.fromISO(right, { zone: 'Europe/Berlin' }).startOf('day')
  if (!start.isValid || !end.isValid) return Infinity
  return Math.abs(start.diff(end, 'days').days)
}

function clusterDates(dates, center, maxGap = 1) {
  if (!center) return new Set()
  const included = new Set([center])
  let changed = true
  while (changed) {
    changed = false
    for (const date of dates) {
      if (!date || included.has(date)) continue
      for (const have of included) {
        if (daysBetween(date, have) <= maxGap + 1) {
          included.add(date)
          changed = true
          break
        }
      }
    }
  }
  return included
}

function relatedSeriesJobs(jobs, job, today) {
  if (!job) return []
  const place = jobPlaceKey(job)
  if (!place) return []
  const workers = new Set(assignedWorkerIds(job))
  if (!workers.size) return []
  const matches = jobs.filter(other => {
    if (other.id === job.id || !isActiveAssignedJob(other)) return false
    const date = isoDate(other.work_date)
    if (!date || date < today) return false
    if (jobPlaceKey(other) !== place) return false
    return sameWorkerSet(workers, new Set(assignedWorkerIds(other)))
  })
  const center = isoDate(job.work_date)
  const dates = new Set(matches.map(item => isoDate(item.work_date)).filter(Boolean))
  if (center) dates.add(center)
  const cluster = clusterDates(dates, center)
  return matches
    .filter(other => cluster.has(isoDate(other.work_date)))
    .sort((a, b) => isoDate(a.work_date).localeCompare(isoDate(b.work_date)))
}

function berlinYearStart(year) {
  return DateTime.fromObject({ year, month: 1, day: 1 }, { zone: 'Europe/Berlin' }).toISODate()
}

function extraCountsByWorker(jobs, year) {
  const start = berlinYearStart(year)
  const end = berlinYearStart(year + 1)
  const counts = new Map()
  for (const job of jobs) {
    if (job.kind !== 'open_post' || job.status === 'cancelled') continue
    if (!job.work_date || job.work_date < start || job.work_date >= end) continue
    for (const row of job.work_job_assignees ?? []) {
      if (!['assigned', 'approved'].includes(row.status)) continue
      counts.set(row.worker_id, (counts.get(row.worker_id) || 0) + 1)
    }
  }
  return counts
}

function extraThreshold(counts) {
  const helpers = [...counts.values()].filter(value => value > 0).sort((a, b) => b - a)
  if (!helpers.length) return null
  return helpers[Math.ceil(helpers.length / 2) - 1]
}

function extraEntriesByWorker(jobs, year) {
  const start = berlinYearStart(year)
  const end = berlinYearStart(year + 1)
  const groups = new Map()
  for (const job of jobs) {
    if (job.kind !== 'open_post' || job.status === 'cancelled') continue
    if (!job.work_date || job.work_date < start || job.work_date >= end) continue
    for (const row of job.work_job_assignees ?? []) {
      if (!['assigned', 'approved'].includes(row.status)) continue
      const list = groups.get(row.worker_id) ?? []
      list.push(job)
      groups.set(row.worker_id, list)
    }
  }
  return groups
}

function isoDate(value) {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return DateTime.fromJSDate(value, { zone: 'Europe/Berlin' }).toISODate() || ''
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

function plusDays(value, days) {
  const date = isoDate(value)
  const base = date
    ? DateTime.fromISO(date, { zone: 'Europe/Berlin' })
    : DateTime.now().setZone('Europe/Berlin')
  return base.plus({ days }).toISODate()
}

function absenceOnDate(absences, workerId, date) {
  if (!workerId || !date) return null
  return absences.find(item => {
    const start = isoDate(item.start_date)
    const end = isoDate(item.end_date)
    return item.worker_id === workerId && start && end && start <= date && end >= date
  }) ?? null
}

function formatDisplayDate(value) {
  const iso = isoDate(value)
  if (!iso) return ''
  const dt = DateTime.fromISO(iso, { zone: 'Europe/Berlin' })
  return dt.isValid ? dt.toFormat('dd.MM.yyyy') : iso
}

const pickerStyle = { colorScheme: 'light', appearance: 'auto', WebkitAppearance: 'auto' }
const pickerClass = 'min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900'

function DateField({
  label,
  value,
  onChange,
  min,
  max,
  className = 'block text-xs text-slate-400',
  inputClassName = pickerClass,
  inputStyle = pickerStyle,
}) {
  return (
    <label className={className}>
      {label}
      <input
        type="date"
        value={isoDate(value)}
        min={isoDate(min) || undefined}
        max={isoDate(max) || undefined}
        onChange={e => onChange(isoDate(e.target.value))}
        className={`${inputClassName} mt-1`}
        style={inputStyle}
      />
    </label>
  )
}

function dayStamp(date, today, t) {
  const tomorrow = DateTime.fromISO(today, { zone: 'Europe/Berlin' }).plus({ days: 1 }).toISODate()
  if (date === today) return t('planToday')
  if (date === tomorrow) return t('planTomorrow')
  return null
}

function JobCard({ job, t, mapsHref, badge, children, objectAddress, language = 'de', embedded = false }) {
  const place = job.location_text || job.object_name || t('planNoPlace')
  const stamp = badge
  const dateLabel = formatDisplayDate(job.work_date)
  const people = job.work_job_assignees ?? []
  const activePeople = people.filter(row => ['assigned', 'approved'].includes(row.status))
  const focused = activePeople.length === 1 ? assignmentRange(activePeople[0], job) : clockRange(job.start_time, job.end_time)
  const start = focused.start || formatClock(job.start_time)
  const end = focused.end || formatClock(job.end_time)
  const time = [start, end].filter(Boolean).join(' – ')
  const duration = jobDurationLabel({ ...job, start_time: start, end_time: end }, t)
  const declinedPeople = people.filter(row => row.status === 'declined')
  const needed = Math.max(Number(job.needed_count) || 0, activePeople.length, 1)
  const filled = activePeople.length
  const confirmed = activePeople.filter(row => row.seen_at).length
  const unseen = activePeople.filter(row => !row.seen_at).length
  const coverOk = filled >= needed
  return (
    <div className={embedded ? 'px-1 pt-1' : 'rounded-2xl border border-white/10 bg-slate-900/80 p-4'}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {stamp && (
              <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-100">
                {stamp}
              </span>
            )}
            <p className="text-sm font-semibold text-slate-200">{dateLabel}{time ? ` · ${time}` : ''}{duration ? ` · ${duration}` : ''}</p>
          </div>
          <h3 className="mt-1 text-lg font-bold text-white">{place}</h3>
          {objectAddress && objectAddress !== place && (
            <p className="mt-0.5 text-sm text-slate-400">{objectAddress}</p>
          )}
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-cyan-200 underline decoration-cyan-200/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              {t('planMaps')}
            </a>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold text-white">
        {t('planSlotsFilled').replace('{filled}', String(filled)).replace('{needed}', String(needed))}
        {' · '}
        <span className={coverOk ? 'text-emerald-200' : 'text-amber-200'}>
          {coverOk ? t('planCoverOk') : t('planCoverShort')}
        </span>
      </p>
      <p className="mt-1 text-xs text-slate-300">
        {t('planSeenDone')}: {confirmed}
        {' · '}
        {t('planUnseen')}: {unseen}
        {' · '}
        {t('planDeclined')}: {declinedPeople.length}
      </p>
      {job.task_text && (
        <div className="mt-3 border-l-2 border-cyan-400/70 pl-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-200">{t('planTask')}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{job.task_text}</p>
        </div>
      )}
      {job.bring_text && (
        <div className="mt-3 border-l-2 border-sky-400/70 pl-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-sky-200">{t('planBring')}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{job.bring_text}</p>
        </div>
      )}
      {job.remember_text && (
        <div className="mt-3 border-l-2 border-orange-400/70 pl-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-orange-200">{t('planRemember')}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{job.remember_text}</p>
        </div>
      )}
      {job.notes_text && (
        <div className="mt-3 border-l-2 border-slate-400/70 pl-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-300">{t('planNotes')}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{job.notes_text}</p>
        </div>
      )}
      {job.updated_at && (
        <p className="mt-3 text-xs text-slate-400">{t('lastUpdated')}: {formatUpdatedAt(job.updated_at, language)}</p>
      )}
      {children}
    </div>
  )
}

export default function WorkPlan({
  t,
  language = 'de',
  view,
  isAdmin,
  hideOwnerPlan = false,
  canGrantPlanner = false,
  workers,
  objects,
  currentWorker,
  onOpenNotices,
  onOpenHours,
  onReloadWorkers,
  onReloadObjects,
  onHelpAvailable,
}) {
  const today = DateTime.now().setZone('Europe/Berlin').toISODate()
  const [form, setForm] = useState(() => restoreJobForm(readUiMemory().form))
  const [needForm, setNeedForm] = useState(emptyNeedForm)
  const [editingId, setEditingId] = useState(() => stringOr(readUiMemory().editingId, null) || null)
  const [editingNeedId, setEditingNeedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [jobs, setJobs] = useState([])
  const [myRows, setMyRows] = useState([])
  const [openJobs, setOpenJobs] = useState([])
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [workerSearch, setWorkerSearch] = useState('')
  const [historyObjectId, setHistoryObjectId] = useState(() => stringOr(readUiMemory().historyObjectId))
  const [historyWorkerId, setHistoryWorkerId] = useState(() => stringOr(readUiMemory().historyWorkerId))
  const [historySearch, setHistorySearch] = useState(() => stringOr(readUiMemory().historySearch))
  const [historyFrom, setHistoryFrom] = useState(() => isoDateOr(readUiMemory().historyFrom, DateTime.now().setZone('Europe/Berlin').minus({ days: 60 }).toISODate()))
  const [historyTo, setHistoryTo] = useState(() => isoDateOr(readUiMemory().historyTo, today))
  const [historyTab, setHistoryTab] = useState(() => oneOf(readUiMemory().historyTab, HISTORY_TABS, 'worked'))
  const [extraYear, setExtraYear] = useState(() => {
    const year = Number(readUiMemory().extraYear)
    return Number.isFinite(year) ? year : DateTime.now().setZone('Europe/Berlin').year
  })
  const [copyingId, setCopyingId] = useState('')
  const [duplicating, setDuplicating] = useState(() => Boolean(readUiMemory().duplicating))
  const [duplicatingNeed, setDuplicatingNeed] = useState(false)
  const [absences, setAbsences] = useState([])
  const [selfLogs, setSelfLogs] = useState([])
  const [savingSelf, setSavingSelf] = useState(false)
  const [absenceForm, setAbsenceForm] = useState(emptyAbsence)
  const [inviteName, setInviteName] = useState('')
  const [invitePrivileged, setInvitePrivileged] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteCopied, setInviteCopied] = useState('')
  const [editingAbsenceId, setEditingAbsenceId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirmingId, setConfirmingId] = useState('')
  const [boardDate, setBoardDate] = useState(() => isoDateOr(readUiMemory().boardDate, today))
  const [homeDate, setHomeDate] = useState(() => isoDateOr(readUiMemory().homeDate, today))
  const [hoursDate, setHoursDate] = useState(() => isoDateOr(readUiMemory().hoursDate, today))
  const [boardOpenId, setBoardOpenId] = useState(() => stringOr(readUiMemory().boardOpenId))
  const [adminTab, setAdminTab] = useState(() => oneOf(readUiMemory().adminTab, ADMIN_TABS, 'board'))
  const [jobFormOpen, setJobFormOpen] = useState(() => Boolean(readUiMemory().jobFormOpen))
  const [rosterFilter, setRosterFilter] = useState(() => oneOf(readUiMemory().rosterFilter, ROSTER_FILTERS, ''))
  const [rosterSearch, setRosterSearch] = useState('')
  const [focusWorkerId, setFocusWorkerId] = useState(() => stringOr(readUiMemory().focusWorkerId))
  const [travelTick, setTravelTick] = useState(0)
  const [jobMenuId, setJobMenuId] = useState('')
  const [shortcutBusy, setShortcutBusy] = useState(false)
  const [objectForm, setObjectForm] = useState(emptyObjectForm)
  const [editingObjectId, setEditingObjectId] = useState(null)
  const [objectPhotoBusy, setObjectPhotoBusy] = useState(false)
  const [objectSheetMessage, setObjectSheetMessage] = useState('')
  const firstLoad = useRef(true)

  useEffect(() => {
    writeUiMemory({
      boardDate,
      homeDate,
      hoursDate,
      boardOpenId,
      adminTab,
      jobFormOpen,
      editingId,
      duplicating,
      form,
      historyObjectId,
      historyWorkerId,
      historySearch,
      historyFrom,
      historyTo,
      historyTab,
      extraYear,
      rosterFilter,
      focusWorkerId,
    })
  }, [adminTab, boardDate, boardOpenId, duplicating, editingId, extraYear, focusWorkerId, form, historyFrom, historyObjectId, historySearch, historyTab, historyTo, historyWorkerId, homeDate, hoursDate, jobFormOpen, rosterFilter])

  const workerId = currentWorker?.id
  const loadData = useCallback(async (mode = 'live') => {
    setErrorMessage('')
    if (firstLoad.current) setLoading(true)
    const historyFromDate = DateTime.now().setZone('Europe/Berlin').minus({ years: 2 }).startOf('year').toISODate()
    const liveFromDate = isAdmin
      ? historyFromDate
      : DateTime.now().setZone('Europe/Berlin').minus({ days: 7 }).toISODate()
    const liveToDate = DateTime.now().setZone('Europe/Berlin').plus({ days: 90 }).toISODate()
    const upcomingFromDate = DateTime.now().setZone('Europe/Berlin').minus({ days: 1 }).toISODate()
    const yearStart = DateTime.now().setZone('Europe/Berlin').startOf('year').toISODate()
    const todayDate = DateTime.now().setZone('Europe/Berlin').toISODate()
    const fromDate = mode === 'history' ? historyFromDate : liveFromDate

    const loadAbsences = async () => {
      const { data, error } = await supabase
        .from('work_absences')
        .select('*')
        .gte('end_date', yearStart)
        .order('start_date', { ascending: true })
      if (error && !isMissingTable(error)) setErrorMessage(error.message)
      setAbsences(error ? [] : (data ?? []))
    }

    const loadSelfLogs = async () => {
      if (!workerId) {
        setSelfLogs([])
        return
      }
      const { data, error } = await supabase
        .from('work_self_logs')
        .select('*')
        .eq('worker_id', workerId)
        .gte('work_date', yearStart)
        .order('work_date', { ascending: false })
        .order('start_time', { ascending: true })
      if (error && !isMissingTable(error)) setErrorMessage(error.message)
      setSelfLogs(error ? [] : (data ?? []))
    }

    const finish = () => {
      firstLoad.current = false
      setLoading(false)
    }

    if (isAdmin) {
      let query = supabase
        .from('work_jobs')
        .select('*, work_job_assignees(*)')
        .gte('work_date', fromDate)
        .neq('status', 'cancelled')
      if (mode !== 'history') query = query.lte('work_date', liveToDate)
      const { data, error } = await query
        .order('work_date', { ascending: true })
        .order('start_time', { ascending: true })

      if (error) {
        if (isMissingTable(error)) setSetupNeeded(true)
        setErrorMessage(error.message)
        setJobs([])
        finish()
        return
      }
      setSetupNeeded(false)
      setJobs(data ?? [])
      await Promise.all([loadAbsences(), loadSelfLogs()])
      finish()
      return
    }

    if (!workerId) {
      setMyRows([])
      setOpenJobs([])
      setSelfLogs([])
      await loadAbsences()
      finish()
      return
    }

    const [{ data: assigneeData, error: assigneeError }, { data: openData, error: openError }] = await Promise.all([
      supabase
        .from('work_job_assignees')
        .select('*, work_jobs!inner(*)')
        .eq('worker_id', workerId)
        .in('status', ['assigned', 'approved', 'pending', 'declined', 'thinking'])
        .neq('work_jobs.status', 'cancelled')
        .gte('work_jobs.work_date', yearStart),
      supabase
        .from('work_jobs')
        .select('*')
        .eq('kind', 'open_post')
        .eq('status', 'active')
        .gte('work_date', upcomingFromDate)
        .order('work_date', { ascending: true }),
    ])

    const firstError = assigneeError || openError
    if (firstError) {
      if (isMissingTable(firstError)) setSetupNeeded(true)
      setErrorMessage(firstError.message)
      setMyRows([])
      setOpenJobs([])
      finish()
      return
    }

    setSetupNeeded(false)
    const mine = (assigneeData ?? []).filter(row => row.work_jobs && row.work_jobs.status !== 'cancelled' && row.work_jobs.status !== 'canceled')
    const jobIds = [...new Set(mine.map(row => row.work_jobs?.id || row.job_id).filter(Boolean))]
    const names = await loadCrewNamesForJobs(jobIds)
    setMyRows(attachCrewNames(mine, names))
    const openIds = [...new Set((openData ?? []).map(job => job.id).filter(Boolean))]
    const openNames = await loadCrewNamesForJobs(openIds)
    setOpenJobs(attachCrewToJobs(openData ?? [], openNames))
    await Promise.all([loadAbsences(), loadSelfLogs()])
    finish()
  }, [isAdmin, workerId])

  const livePlanOpen = view === 'plan' || view === 'openPosts' || view === 'hours' || view === 'mine'
  const historyOpen = view === 'history'

  useEffect(() => {
    if (!livePlanOpen && !historyOpen) return undefined
    const mode = historyOpen ? 'history' : 'live'
    loadData(mode)
    const refresh = debounce(() => loadData(mode), 500)
    const channel = supabase
      .channel(historyOpen ? 'work-plan-history' : 'work-plan-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_jobs' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_job_assignees' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_absences' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_self_logs' }, refresh)
      .subscribe()
    return () => {
      refresh.cancel()
      supabase.removeChannel(channel)
    }
  }, [historyOpen, livePlanOpen, loadData])

  const setField = (key, value) => setForm(current => {
    const next = { ...current, [key]: value }
    if (key !== 'start_time' && key !== 'work_date') return next
    return formWithFixedTimes(next, objects.find(item => item.id === next.object_id))
  })
  const toggleWeekday = (day) => {
    setForm(current => {
      const selected = current.weekdays.includes(day)
      const next = selected
        ? current.weekdays.filter(item => item !== day)
        : [...current.weekdays, day].sort((a, b) => a - b)
      return { ...current, weekdays: next.length ? next : [day] }
    })
  }
  const setNeedField = (key, value) => setNeedForm(current => {
    const next = { ...current, [key]: value }
    if (key !== 'start_time' && key !== 'work_date') return next
    const object = objects.find(item => item.id === next.object_id)
    const timed = withFixedEnd({ start: next.start_time, end: next.end_time }, object, next.work_date)
    return { ...next, start_time: timed.start, end_time: timed.end }
  })

  const selectedObject = objects.find(item => item.id === form.object_id)
  const selectedNeedObject = objects.find(item => item.id === needForm.object_id)

  const myPlan = useMemo(() => {
    const rows = isAdmin && currentWorker?.id
      ? jobs
        .flatMap(job => (job.work_job_assignees ?? [])
          .filter(row => row.worker_id === currentWorker.id && ['assigned', 'approved', 'declined'].includes(row.status))
          .map(row => ({ ...row, job_id: job.id, work_jobs: job })))
      : myRows.filter(row => ['assigned', 'approved', 'declined'].includes(row.status))
    return withChainedAssignmentRows(rows, objects)
      .sort((a, b) => `${isoDate(a.work_jobs?.work_date)}${assignmentRange(a).start || ''}`.localeCompare(`${isoDate(b.work_jobs?.work_date)}${assignmentRange(b).start || ''}`))
  }, [currentWorker, isAdmin, jobs, myRows, objects])

  const myPending = useMemo(() => {
    const rows = isAdmin && currentWorker?.id
      ? jobs.flatMap(job => (job.work_job_assignees ?? [])
        .filter(row => row.worker_id === currentWorker.id)
        .map(row => ({ ...row, job_id: job.id, work_jobs: job })))
      : myRows
    return rows.filter(row => row.status === 'pending' && row.work_jobs && isoDate(row.work_jobs.work_date) >= today)
  }, [currentWorker, isAdmin, jobs, myRows, today])

  const visibleOpenJobs = useMemo(() => {
    const mineApproved = new Set(
      myRows.filter(row => ['assigned', 'approved'].includes(row.status)).map(row => row.job_id),
    )
    return openJobs.filter(job => !mineApproved.has(job.id) && job.filled_count < job.needed_count)
  }, [myRows, openJobs])

  useEffect(() => {
    if (isAdmin) return
    onHelpAvailable?.(visibleOpenJobs.length > 0)
  }, [isAdmin, onHelpAvailable, visibleOpenJobs.length])

  const pendingApprovals = useMemo(() => (
    jobs.flatMap(job => (job.work_job_assignees ?? [])
      .filter(row => row.status === 'pending')
      .map(row => ({ ...row, job })))
      .filter(row => row.job.work_date >= today)
  ), [jobs, today])

  const workerName = (workerId) => workers.find(item => item.id === workerId)?.name ?? t('planUnknownWorker')
  const activeWorkers = workers.filter(worker => worker.active !== false && !isOfficePlanner(worker))
  const inviteWorkers = workers.filter(worker => worker.active !== false)
  const officeSelf = isOfficePlanner(currentWorker)
  const ownerIds = useMemo(() => ownerWorkerIdSet(workers), [workers])
  const officeIds = useMemo(() => new Set(workers.filter(isOfficePlanner).map(worker => worker.id).filter(Boolean)), [workers])
  const busyElsewhere = (date, exceptJobId) => {
    const day = isoDate(date)
    const busy = new Set()
    if (!day) return busy
    for (const job of jobs) {
      if (exceptJobId && job.id === exceptJobId) continue
      if (isoDate(job.work_date) !== day) continue
      if (job.status === 'cancelled' || job.status === 'canceled') continue
      if (hideOwnerPlan && jobIsOwnerPrivate(job, ownerIds)) continue
      for (const row of job.work_job_assignees ?? []) {
        if (officeIds.has(row.worker_id)) continue
        if (['assigned', 'approved'].includes(row.status)) busy.add(row.worker_id)
      }
    }
    return busy
  }
  const otherAssignmentForWorker = (workerId, date, exceptJobId) => {
    const day = isoDate(date)
    if (!workerId || !day) return null
    for (const job of jobs) {
      if (exceptJobId && job.id === exceptJobId) continue
      if (isoDate(job.work_date) !== day) continue
      if (job.status === 'cancelled' || job.status === 'canceled') continue
      if (hideOwnerPlan && jobIsOwnerPrivate(job, ownerIds)) continue
      for (const row of job.work_job_assignees ?? []) {
        if (row.worker_id !== workerId) continue
        if (!['assigned', 'approved'].includes(row.status)) continue
        return { job, range: assignmentRange(row, job) }
      }
    }
    return null
  }
  const overlapJobForWorker = (workerId, date, range, exceptJobId) => {
    const day = isoDate(date)
    if (!workerId || !day) return null
    for (const job of jobs) {
      if (exceptJobId && job.id === exceptJobId) continue
      if (isoDate(job.work_date) !== day) continue
      if (job.status === 'cancelled' || job.status === 'canceled') continue
      if (hideOwnerPlan && jobIsOwnerPrivate(job, ownerIds)) continue
      for (const row of job.work_job_assignees ?? []) {
        if (row.worker_id !== workerId) continue
        if (!['assigned', 'approved'].includes(row.status)) continue
        const existing = assignmentRange(row, job)
        if (rangesOverlap(range, existing)) return { job, range: existing }
      }
    }
    return null
  }
  const formRangeFor = (workerId, current = form) => (
    current.worker_hours?.[workerId] || clockRange(current.start_time, current.end_time)
  )
  const queueWorkersOnDay = async (workerIds, date, preferJobId, list = jobs, options = {}) => {
    const day = isoDate(date)
    const pending = [...new Set((workerIds || []).filter(Boolean))]
    if (!day || !pending.length) return list
    let snapshot = list
    await ensureDayTravels(snapshot.filter(job => isoDate(job.work_date) === day), objects)
    const now = new Date().toISOString()
    const notices = []
    const packed = new Set()
    for (let round = 0; round < 8 && pending.length; round += 1) {
      const workerId = pending.shift()
      if (packed.has(workerId)) continue
      packed.add(workerId)
      const moved = packWorkerSlots(workerDaySlots(snapshot, workerId, day, { preferJobId, objects }))
      for (const slot of moved) {
        const job = snapshot.find(item => item.id === slot.jobId)
        if (!job) continue
        const assignees = (job.work_job_assignees ?? []).filter(row => ['assigned', 'approved'].includes(row.status) || !row.status)
        const moveJob = assignees.length <= 1 || assignees.every(row => {
          const range = assignmentRange(row, job)
          return range.start === slot.previous.start && range.end === slot.previous.end
        })
        const timePatch = {
          planned_start: slot.range.start || null,
          planned_end: slot.range.end || null,
          updated_at: now,
        }
        let { error } = slot.rowId
          ? await supabase.from('work_job_assignees').update(timePatch).eq('id', slot.rowId)
          : await supabase.from('work_job_assignees').update(timePatch).eq('job_id', slot.jobId).eq('worker_id', workerId)
        if (error && isMissingColumn(error)) break
        if (error) {
          alert(`${t('planSaveError')} ${error.message}`)
          return
        }
        const alsoMove = moveJob
          ? assignees.filter(row => row.id !== slot.rowId && row.worker_id !== workerId)
          : []
        for (const row of alsoMove) {
          if (row.id) await supabase.from('work_job_assignees').update(timePatch).eq('id', row.id)
          if (row.worker_id && !pending.includes(row.worker_id)) pending.push(row.worker_id)
        }
        if (moveJob) {
          const jobPatch = {
            start_time: slot.range.start || null,
            end_time: slot.range.end || null,
            updated_at: now,
          }
          const jobResult = await supabase.from('work_jobs').update(jobPatch).eq('id', slot.jobId)
          if (jobResult.error && !isMissingColumn(jobResult.error)) {
            alert(`${t('planSaveError')} ${jobResult.error.message}`)
            return
          }
        } else {
          const nextRanges = assignees.map(row => (
            row.worker_id === workerId || row.id === slot.rowId
              ? slot.range
              : assignmentRange(row, job)
          ))
          const spanned = spanClockRange(nextRanges, slot.range)
          await supabase.from('work_jobs').update({
            start_time: spanned.start || job.start_time,
            end_time: spanned.end || job.end_time,
            updated_at: now,
          }).eq('id', slot.jobId)
        }
        snapshot = withSavedJob(snapshot, {
          ...job,
          start_time: moveJob ? slot.range.start : job.start_time,
          end_time: moveJob ? slot.range.end : job.end_time,
          work_job_assignees: assignees.map(row => (
            row.worker_id === workerId || row.id === slot.rowId || alsoMove.some(item => item.id === row.id)
              ? { ...row, planned_start: slot.range.start, planned_end: slot.range.end }
              : row
          )),
        })
        if (!options.silent && !skipPlanNotice(workers.find(item => item.id === workerId))) {
          notices.push({
            audience: 'worker',
            worker_id: workerId,
            title: 'notifyPlanUpdated',
            body: [formatDisplayDate(job.work_date), jobPlaceLabel(job), clockRangeLabel(slot.range)].filter(Boolean).join(' · '),
            kind: 'plan',
            job_id: job.id,
          })
        }
      }
    }
    if (notices.length) await supabase.from('work_notifications').insert(notices)
    return snapshot
  }
  const queueRef = useRef(queueWorkersOnDay)
  queueRef.current = queueWorkersOnDay
  const packingRef = useRef(false)
  useEffect(() => {
    if (!isAdmin || packingRef.current || !jobs.length) return undefined
    const pairs = overlappingWorkerDays(jobs, objects, { from: today })
    if (!pairs.length) return undefined
    let cancelled = false
    packingRef.current = true
    ;(async () => {
      let snapshot = jobs
      for (const pair of pairs) {
        if (cancelled) break
        snapshot = await queueRef.current([pair.workerId], pair.date, null, snapshot, { silent: true }) || snapshot
      }
      if (!cancelled && snapshot !== jobs) setJobs(snapshot)
      packingRef.current = false
    })()
    return () => {
      cancelled = true
      packingRef.current = false
    }
  }, [isAdmin, jobs, objects, today])
  const blattCleanRef = useRef(false)
  useEffect(() => {
    if (!isAdmin || blattCleanRef.current || packingRef.current || !objects.length) return undefined
    const targets = objects.filter(item => isSpreadBlattObject(item, objects))
    if (!targets.length) return undefined
    blattCleanRef.current = true
    let cancelled = false
    ;(async () => {
      const now = new Date().toISOString()
      const daysByObject = new Map()
      const restoreByObject = new Map()
      const nextById = new Map()
      for (const item of targets) {
        const { object: next, changed, clearedDays } = stripSpreadBlatt(item)
        if (!changed) continue
        const result = await supabase.from('objects').update(objectPayloadFromStrip(next)).eq('id', item.id)
        if (cancelled) return
        if (result.error) {
          blattCleanRef.current = false
          return
        }
        nextById.set(item.id, next)
        if (clearedDays?.length) {
          daysByObject.set(item.id, clearedDays)
          const minutes = restoreMinutesForObject(next, jobs)
          if (minutes) restoreByObject.set(item.id, minutes)
        }
      }
      if (!nextById.size || cancelled) return
      const stretched = jobsStretchedBySheet(jobs, daysByObject, restoreByObject)
      let snapshot = jobs
      for (const job of stretched) {
        await supabase.from('work_jobs').update({
          start_time: job.start_time || null,
          end_time: job.end_time || null,
          updated_at: now,
        }).eq('id', job.id)
        await supabase.from('work_job_assignees').update({
          planned_start: job.start_time || null,
          planned_end: job.end_time || null,
          updated_at: now,
        }).eq('job_id', job.id)
        snapshot = withSavedJob(snapshot, {
          ...job,
          work_job_assignees: (job.work_job_assignees ?? []).map(row => ({
            ...row,
            planned_start: job.start_time,
            planned_end: job.end_time,
          })),
        })
      }
      const packDays = [...new Set(stretched.map(job => isoDate(job.work_date)).filter(day => day && day >= today))]
      for (const day of packDays) {
        if (cancelled) return
        const workerIds = [...new Set(
          snapshot
            .filter(job => isoDate(job.work_date) === day)
            .flatMap(job => (job.work_job_assignees ?? []).map(row => row.worker_id).filter(Boolean)),
        )]
        if (workerIds.length) {
          snapshot = await queueRef.current(workerIds, day, null, snapshot, { silent: true }) || snapshot
        }
      }
      if (cancelled) return
      if (editingObjectId && nextById.has(editingObjectId)) {
        const next = nextById.get(editingObjectId)
        setObjectForm(current => ({
          ...current,
          leistung_text: next.leistung_text || '',
          leistung_image_url: next.leistung_image_url || '',
          turnus: parseTurnus(next.turnus_json),
          fixed_hours_by_day: Object.fromEntries(
            Object.entries(parseFixedHoursByDay(next.fixed_hours_json)).map(([day, hours]) => [Number(day), String(hours)]),
          ),
        }))
      }
      if (snapshot !== jobs) setJobs(snapshot)
      onReloadObjects?.()
    })()
    return () => {
      cancelled = true
    }
  }, [editingObjectId, isAdmin, jobs, objects, onReloadObjects, today])
  const mapsHref = (job) => jobMapsHref(job, objects)

  const handleNeedObjectChange = (objectId) => {
    const object = objects.find(item => item.id === objectId)
    setNeedForm(current => {
      const next = {
        ...current,
        object_id: objectId,
        location_text: object
          ? `${object.name}${object.address ? ` - ${object.address}` : ''}`
          : current.location_text,
      }
      const timed = withFixedEnd({ start: next.start_time, end: next.end_time }, object, next.work_date)
      return { ...next, start_time: timed.start, end_time: timed.end }
    })
  }

  const listedOpenJobs = isAdmin
    ? jobs.filter(job => job.kind === 'open_post' && job.work_date >= today)
    : visibleOpenJobs

  const currentYear = DateTime.now().setZone('Europe/Berlin').year
  const liveExtraCounts = useMemo(() => extraCountsByWorker(jobs, currentYear), [currentYear, jobs])
  const liveThreshold = extraThreshold(liveExtraCounts)
  const earlyNames = activeWorkers
    .filter(worker => liveThreshold != null && (liveExtraCounts.get(worker.id) || 0) >= liveThreshold)
    .map(worker => worker.name)

  const handleObjectChange = (objectId) => {
    const object = objects.find(item => item.id === objectId)
    setForm(current => {
      const next = {
        ...current,
        object_id: objectId,
        location_text: object
          ? `${object.name}${object.address ? ` - ${object.address}` : ''}`
          : current.location_text,
      }
      return formWithFixedTimes(editingId ? next : withObjectPlanRange(next, object, { force: true }), object)
    })
  }

  const plannedJobs = useMemo(() => {
    const rows = jobs.filter(job => job.status !== 'cancelled' && job.status !== 'canceled')
    return hideOwnerPlan ? rows.filter(job => !jobIsOwnerPrivate(job, ownerIds)) : rows
  }, [hideOwnerPlan, jobs, ownerIds])
  const boardMarks = useMemo(() => marksFromJobs(plannedJobs), [plannedJobs])
  const liveBoardDate = boardDate || today
  const boardJobs = useMemo(
    () => plannedJobs.filter(job => isoDate(job.work_date) === liveBoardDate),
    [plannedJobs, liveBoardDate],
  )
  const displayBoardJobs = useMemo(
    () => (
      focusWorkerId
        ? withChainedJobTimes(boardJobs, focusWorkerId, liveBoardDate, objects)
        : withChainedBoardJobs(boardJobs, liveBoardDate, objects)
    ),
    [boardJobs, focusWorkerId, liveBoardDate, objects, travelTick],
  )
  useEffect(() => {
    if (!boardJobs.length) return undefined
    let cancelled = false
    ensureDayTravels(boardJobs, objects).then(() => {
      if (!cancelled) setTravelTick(current => current + 1)
    })
    return () => { cancelled = true }
  }, [boardJobs, objects])
  const seriesJobs = useMemo(
    () => relatedSeriesJobs(jobs, jobs.find(job => job.id === editingId), today),
    [editingId, jobs, today],
  )
  const formWorkdays = useMemo(
    () => expandPlanDays(form, selectedObject, { create: !editingId && !duplicating }),
    [duplicating, editingId, form, selectedObject],
  )

  const historyEntries = useMemo(() => {
    const search = historySearch.trim().toLowerCase()
    const rows = []
    for (const job of jobs) {
      if (job.work_date < historyFrom || job.work_date > historyTo) continue
      if (historyObjectId) {
        const selected = objects.find(item => item.id === historyObjectId)
        const matchId = job.object_id === historyObjectId
        const matchName = selected && (
          job.object_name === selected.name
          || (job.location_text || '').toLowerCase().includes(selected.name.toLowerCase())
        )
        if (!matchId && !matchName) continue
      }
      const assignees = (job.work_job_assignees ?? []).filter(row => ['assigned', 'approved'].includes(row.status))
      for (const row of assignees) {
        if (historyWorkerId && row.worker_id !== historyWorkerId) continue
        if (officeIds.has(row.worker_id)) continue
        if (hideOwnerPlan && ownerIds.has(row.worker_id)) continue
        const name = workerName(row.worker_id)
        if (search && !name.toLowerCase().includes(search)) continue
        rows.push({
          key: `${job.id}-${row.worker_id}`,
          job,
          row,
          workerId: row.worker_id,
          workerName: name,
        })
      }
    }
    return rows.sort((a, b) => `${b.job.work_date}${b.job.start_time || ''}`.localeCompare(`${a.job.work_date}${a.job.start_time || ''}`))
  }, [hideOwnerPlan, historyFrom, historyObjectId, historySearch, historyTo, historyWorkerId, jobs, objects, officeIds, ownerIds, workerName])

  const historyByPerson = useMemo(() => {
    const groups = new Map()
    for (const row of historyEntries) {
      const list = groups.get(row.workerId) ?? []
      list.push(row)
      groups.set(row.workerId, list)
    }
    return [...groups.entries()].map(([workerId, entries]) => {
      let minutes = 0
      let counted = false
      for (const item of entries) {
        const value = rowWorkMinutes({ ...item.row, work_jobs: item.job })
        if (!value) continue
        minutes += value
        counted = true
      }
      return {
        workerId,
        workerName: entries[0]?.workerName ?? workerName(workerId),
        entries,
        minutes: counted ? minutes : null,
        places: [...new Set(entries.map(item => item.job.location_text || item.job.object_name).filter(Boolean))],
      }
    }).sort((a, b) => a.workerName.localeCompare(b.workerName))
  }, [historyEntries, workerName])

  const historyJobs = useMemo(() => {
    const groups = new Map()
    for (const row of historyEntries) {
      const current = groups.get(row.job.id) ?? { job: row.job, people: [] }
      const planned = assignmentRange(row.row, row.job)
      const range = clockRange(
        row.row?.actual_start || planned.start,
        row.row?.actual_end || planned.end,
      )
      const minutes = rowWorkMinutes({ ...row.row, work_jobs: row.job })
      current.people.push({
        workerId: row.workerId,
        workerName: row.workerName,
        minutes: minutes || null,
        range: clockRangeLabel(range),
        changed: Boolean(row.row?.actual_start || row.row?.actual_end),
      })
      groups.set(row.job.id, current)
    }
    return [...groups.values()].sort((a, b) => (
      `${b.job.work_date}${b.job.start_time || ''}`.localeCompare(`${a.job.work_date}${a.job.start_time || ''}`)
    ))
  }, [historyEntries])

  const historyAbsent = useMemo(() => {
    const search = historySearch.trim().toLowerCase()
    const present = new Set(historyByPerson.map(group => group.workerId))
    return activeWorkers.filter(worker => {
      if (hideOwnerPlan && ownerIds.has(worker.id)) return false
      if (historyWorkerId && worker.id !== historyWorkerId) return false
      if (search && !(worker.name || '').toLowerCase().includes(search)) return false
      return !present.has(worker.id)
    })
  }, [activeWorkers, hideOwnerPlan, historyByPerson, historySearch, historyWorkerId, ownerIds])

  const extraRanking = useMemo(() => {
    const counts = extraCountsByWorker(jobs, extraYear)
    const entries = extraEntriesByWorker(jobs, extraYear)
    const threshold = extraThreshold(counts)
    const search = historySearch.trim().toLowerCase()
    return activeWorkers
      .map(worker => ({
        worker,
        count: counts.get(worker.id) || 0,
        jobs: [...(entries.get(worker.id) ?? [])].sort((a, b) => `${b.work_date}${b.start_time || ''}`.localeCompare(`${a.work_date}${a.start_time || ''}`)),
        early: threshold != null && (counts.get(worker.id) || 0) >= threshold,
      }))
      .filter(row => {
        if (hideOwnerPlan && ownerIds.has(row.worker.id)) return false
        if (historyWorkerId && row.worker.id !== historyWorkerId) return false
        if (search && !(row.worker.name || '').toLowerCase().includes(search)) return false
        return true
      })
      .sort((a, b) => b.count - a.count || (a.worker.name || '').localeCompare(b.worker.name || ''))
  }, [activeWorkers, extraYear, hideOwnerPlan, historySearch, historyWorkerId, jobs, ownerIds])

  const resetForm = () => {
    setEditingId(null)
    setDuplicating(false)
    setJobFormOpen(false)
    setForm(emptyForm())
  }

  const resetNeedForm = () => {
    setEditingNeedId(null)
    setDuplicatingNeed(false)
    setNeedForm(emptyNeedForm())
  }

  const formFromJob = (job, workDate) => formWithFixedTimes({
    work_date: workDate,
    start_time: String(job.start_time || '').slice(0, 5),
    end_time: String(job.end_time || '').slice(0, 5),
    object_id: job.object_id ?? '',
    location_text: job.location_text || job.object_name || '',
    task_text: job.task_text ?? '',
    bring_text: job.bring_text ?? '',
    remember_text: job.remember_text ?? '',
    notes_text: job.notes_text ?? '',
    worker_ids: (job.work_job_assignees ?? [])
      .filter(row => ['assigned', 'approved'].includes(row.status))
      .map(row => row.worker_id)
      .filter(id => !absenceOnDate(absences, id, workDate) && !officeIds.has(id)),
    until_date: workDate,
    weekdays: [...WORK_WEEKDAYS],
    applyTimeToAll: false,
    worker_hours: workerHoursFromAssignees({ ...job, work_job_assignees: (job.work_job_assignees ?? []).filter(row => ['assigned', 'approved'].includes(row.status) && !absenceOnDate(absences, row.worker_id, workDate)) }),
  }, objects.find(item => item.id === job.object_id))

  const startEdit = (job) => {
    setDuplicating(false)
    setEditingId(job.id)
    const date = isoDate(job.work_date)
    setForm(formFromJob(job, date))
    if (date) setBoardDate(date)
    setAdminTab('board')
    setJobFormOpen(true)
    document.getElementById('plan-job-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const startDuplicate = (job) => {
    setEditingId(null)
    setDuplicating(true)
    const date = nextWeekday(job.work_date)
    setForm(formFromJob(job, date))
    if (date) setBoardDate(date)
    setAdminTab('board')
    setJobFormOpen(true)
    document.getElementById('plan-job-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const startEditNeed = (job) => {
    setDuplicatingNeed(false)
    setEditingNeedId(job.id)
    setNeedForm((() => {
      const object = objects.find(item => item.id === job.object_id)
      const timed = withFixedEnd({ start: job.start_time, end: job.end_time }, object, job.work_date)
      return {
        work_date: isoDate(job.work_date),
        start_time: timed.start,
        end_time: timed.end,
        object_id: job.object_id ?? '',
        location_text: job.location_text || job.object_name || '',
        task_text: job.task_text ?? '',
        needed_count: job.needed_count ?? 1,
        early_hours: 3,
      }
    })())
    document.getElementById('plan-need-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const startDuplicateNeed = (job) => {
    setEditingNeedId(null)
    setDuplicatingNeed(true)
    setNeedForm((() => {
      const object = objects.find(item => item.id === job.object_id)
      const timed = withFixedEnd({ start: job.start_time, end: job.end_time }, object, plusDays(job.work_date, 2))
      return {
        work_date: plusDays(job.work_date, 2),
        start_time: timed.start,
        end_time: timed.end,
        object_id: job.object_id ?? '',
        location_text: job.location_text || job.object_name || '',
        task_text: job.task_text ?? '',
        needed_count: job.needed_count ?? 1,
        early_hours: 3,
      }
    })())
    document.getElementById('plan-need-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!isAdmin) return
    if (!form.work_date) return alert(t('planDateRequired'))
    const planDays = expandPlanDays(form, selectedObject, { create: !editingId && !duplicating })
    if (!planDays.length) return alert(t('planNoWorkdays'))
    if (planDays.length > 60) return alert(t('planRangeTooLong'))
    const firstDate = editingId ? form.work_date : planDays[0]
    const extraDates = planDays.filter(day => day !== firstDate)
    if (!form.location_text.trim() && !form.object_id) return alert(t('planPlaceRequired'))
    if (form.worker_ids.length === 0) return alert(t('planWorkersRequired'))
    const blocked = form.worker_ids.filter(id => absenceOnDate(absences, id, firstDate))
    if (blocked.length) {
      return alert(`${t('absenceBlocked')}: ${blocked.map(workerName).join(', ')}`)
    }
    const timedForm = formWithFixedTimes({ ...form, work_date: firstDate }, selectedObject)

    setSaving(true)
    const hoursList = timedForm.worker_ids.map(id => formRangeFor(id, timedForm))
    const spanned = spanClockRange(hoursList, { start: timedForm.start_time, end: timedForm.end_time })
    const payload = {
      work_date: firstDate,
      start_time: spanned.start || timedForm.start_time || null,
      end_time: spanned.end || timedForm.end_time || null,
      object_id: form.object_id || null,
      object_name: selectedObject?.name || form.location_text.trim() || null,
      location_text: form.location_text.trim() || selectedObject?.name || null,
      task_text: form.task_text.trim() || null,
      bring_text: form.bring_text.trim() || null,
      remember_text: form.remember_text.trim() || null,
      notes_text: form.notes_text.trim() || null,
      kind: jobs.find(item => item.id === editingId)?.kind === 'open_post' ? 'open_post' : 'assigned',
      needed_count: Math.max(
        1,
        form.worker_ids.length,
        jobs.find(item => item.id === editingId)?.kind === 'open_post' ? Number(jobs.find(item => item.id === editingId)?.needed_count) || 1 : 1,
      ),
      status: 'active',
      updated_at: new Date().toISOString(),
      crew_names: crewNamesFor(form.worker_ids, workers),
    }

    let result = editingId
      ? await supabase.from('work_jobs').update(payload).eq('id', editingId).select().single()
      : await supabase.from('work_jobs').insert([payload]).select().single()
    if (result.error && isMissingColumn(result.error)) {
      const basic = { ...payload }
      delete basic.crew_names
      result = editingId
        ? await supabase.from('work_jobs').update(basic).eq('id', editingId).select().single()
        : await supabase.from('work_jobs').insert([basic]).select().single()
    }

    if (result.error) {
      setSaving(false)
      alert(`${t('planSaveError')} ${result.error.message}`)
      return
    }

    const jobId = result.data.id
    const { data: existing } = await supabase
      .from('work_job_assignees')
      .select('id, worker_id, status')
      .eq('job_id', jobId)

    const keep = new Set(form.worker_ids)
    const toDelete = (existing ?? []).filter(row => !keep.has(row.worker_id))
    const existingIds = new Set((existing ?? []).map(row => row.worker_id))
    const toRestore = (existing ?? []).filter(row => keep.has(row.worker_id) && !['assigned', 'approved'].includes(row.status))
    const toAdd = form.worker_ids.filter(id => !existingIds.has(id))

    if (toDelete.length) {
      await supabase.from('work_job_assignees').delete().in('id', toDelete.map(row => row.id))
      await supabase.from('work_notifications').delete().eq('job_id', jobId).in('worker_id', toDelete.map(row => row.worker_id))
    }
    if (toRestore.length) {
      await supabase
        .from('work_job_assignees')
        .update({ status: 'assigned', decline_reason: null, seen_at: null, updated_at: new Date().toISOString() })
        .in('id', toRestore.map(row => row.id))
    }
    if (toAdd.length) {
      const withTimes = toAdd.map(worker_id => {
        const range = formRangeFor(worker_id, timedForm)
        return {
          job_id: jobId,
          worker_id,
          status: 'assigned',
          planned_start: range.start || null,
          planned_end: range.end || null,
        }
      })
      let { error } = await supabase.from('work_job_assignees').insert(withTimes)
      if (error && isMissingColumn(error)) {
        alert(t('planTimesSetup'))
        const fallback = await supabase.from('work_job_assignees').insert(
          toAdd.map(worker_id => ({ job_id: jobId, worker_id, status: 'assigned' })),
        )
        error = fallback.error
      }
      if (error) {
        setSaving(false)
        alert(`${t('planSaveError')} ${error.message}`)
        return
      }
    }

    let timesMissing = false
    for (const worker_id of form.worker_ids) {
      const range = formRangeFor(worker_id, timedForm)
      const { error: timeError } = await supabase
        .from('work_job_assignees')
        .update({
          planned_start: range.start || null,
          planned_end: range.end || null,
          updated_at: payload.updated_at,
        })
        .eq('job_id', jobId)
        .eq('worker_id', worker_id)
      if (timeError && isMissingColumn(timeError)) {
        timesMissing = true
        break
      }
      if (timeError) {
        setSaving(false)
        alert(`${t('planSaveError')} ${timeError.message}`)
        return
      }
    }
    if (timesMissing && toAdd.length === 0) alert(t('planTimesSetup'))

    const { data: savedRows } = await supabase
      .from('work_job_assignees')
      .select('id, worker_id, status, planned_start, planned_end')
      .eq('job_id', jobId)
    const savedJob = {
      ...result.data,
      work_date: firstDate,
      start_time: payload.start_time,
      end_time: payload.end_time,
      work_job_assignees: savedRows ?? form.worker_ids.map(worker_id => {
        const range = formRangeFor(worker_id, timedForm)
        return {
          worker_id,
          status: 'assigned',
          planned_start: range.start || null,
          planned_end: range.end || null,
        }
      }),
    }
    await queueWorkersOnDay(form.worker_ids, firstDate, jobId, withSavedJob(jobs, savedJob))

    if (editingId) {
      await supabase
        .from('work_job_assignees')
        .update({ seen_at: null, updated_at: new Date().toISOString() })
        .eq('job_id', jobId)
        .in('worker_id', form.worker_ids)
      const noticeIds = form.worker_ids.filter(id => !skipPlanNotice(workers.find(item => item.id === id)))
      if (noticeIds.length) {
        await supabase.from('work_notifications').insert(
          noticeIds.map(worker_id => ({
            audience: 'worker',
            worker_id,
            title: 'notifyPlanUpdated',
            body: [formatDisplayDate(payload.work_date), payload.location_text].filter(Boolean).join(' · '),
            kind: 'plan',
            job_id: jobId,
          })),
        )
      }
    }

    if (editingId && form.applyTimeToAll) {
      const series = relatedSeriesJobs(jobs, jobs.find(job => job.id === editingId), today)
      if (series.length) {
        let seriesError = null
        for (const job of series) {
          const timed = withFixedEnd({ start: payload.start_time, end: payload.end_time }, selectedObject, job.work_date)
          const result = await supabase
            .from('work_jobs')
            .update({
              start_time: timed.start || payload.start_time,
              end_time: timed.end || payload.end_time,
              updated_at: payload.updated_at,
            })
            .eq('id', job.id)
          if (result.error) {
            seriesError = result.error
            break
          }
        }
        if (seriesError) {
          setSaving(false)
          alert(`${t('planSaveError')} ${seriesError.message}`)
          return
        }
        const notes = series.flatMap(job => assignedWorkerIds(job)
          .filter(id => !skipPlanNotice(workers.find(item => item.id === id)))
          .map(worker_id => ({
            audience: 'worker',
            worker_id,
            title: 'notifyPlanUpdated',
            body: [formatDisplayDate(job.work_date), job.location_text || payload.location_text].filter(Boolean).join(' · '),
            kind: 'plan',
            job_id: job.id,
          })))
        if (notes.length) await supabase.from('work_notifications').insert(notes)
      }
    }
    if (extraDates.length) {
      await copyJobToDates(
        {
          ...result.data,
          work_job_assignees: form.worker_ids.map(worker_id => {
            const range = formRangeFor(worker_id, timedForm)
            return {
              worker_id,
              status: 'assigned',
              planned_start: range.start || null,
              planned_end: range.end || null,
            }
          }),
        },
        extraDates,
      )
    }

    setSaving(false)
    resetForm()
    loadData(view === 'history' ? 'history' : 'live')
  }

  const handleSaveNeed = async (event) => {
    event.preventDefault()
    if (!isAdmin) return
    if (!needForm.work_date) return alert(t('planDateRequired'))
    if (!needForm.location_text.trim() && !needForm.object_id) return alert(t('planPlaceRequired'))

    setSaving(true)
    const now = DateTime.now().setZone('Europe/Berlin')
    const hours = Number(needForm.early_hours) || 0
    const threshold = extraThreshold(extraCountsByWorker(jobs, now.year))
    const payload = {
      work_date: needForm.work_date,
      start_time: needForm.start_time || null,
      end_time: (objectFixedMinutes(selectedNeedObject, needForm.work_date)
        ? clockPlusMinutes(needForm.start_time, objectFixedMinutes(selectedNeedObject, needForm.work_date))
        : needForm.end_time) || null,
      object_id: needForm.object_id || null,
      object_name: selectedNeedObject?.name || needForm.location_text.trim() || null,
      location_text: needForm.location_text.trim() || selectedNeedObject?.name || null,
      task_text: needForm.task_text.trim() || null,
      kind: 'open_post',
      needed_count: Math.max(1, Number(needForm.needed_count) || 1),
      status: 'active',
      updated_at: now.toISO(),
    }
    if (!editingNeedId) {
      const hasEarly = hours > 0 && threshold != null
      payload.released_at = now.toISO()
      payload.public_at = hasEarly ? now.plus({ hours }).toISO() : now.toISO()
      payload.early_min_count = hasEarly ? threshold : 0
    }

    let result = editingNeedId
      ? await supabase.from('work_jobs').update(payload).eq('id', editingNeedId).select().single()
      : await supabase.from('work_jobs').insert([payload]).select().single()
    if (result.error && /released_at|public_at|early_min_count|schema cache/i.test(result.error.message)) {
      const basic = { ...payload }
      delete basic.released_at
      delete basic.public_at
      delete basic.early_min_count
      result = editingNeedId
        ? await supabase.from('work_jobs').update(basic).eq('id', editingNeedId).select().single()
        : await supabase.from('work_jobs').insert([basic]).select().single()
    }

    setSaving(false)
    if (result.error) {
      alert(`${t('planSaveError')} ${result.error.message}`)
      return
    }
    resetNeedForm()
    if (!editingNeedId && result.data?.id) {
      const { data: already } = await supabase
        .from('work_notifications')
        .select('id')
        .eq('job_id', result.data.id)
        .eq('kind', 'open_post')
        .limit(1)
      if (!already?.length) {
        const body = [formatDisplayDate(result.data.work_date), result.data.location_text || result.data.object_name].filter(Boolean).join(' · ')
        const notes = activeWorkers
          .filter(worker => worker.id && !isOwnerWorker(worker))
          .map(worker => ({
            audience: 'worker',
            worker_id: worker.id,
            title: 'notifyOpenPost',
            body,
            kind: 'open_post',
            job_id: result.data.id,
          }))
        if (notes.length) await supabase.from('work_notifications').insert(notes)
      }
    }
    loadData(view === 'history' ? 'history' : 'live')
  }

  const myOpenRow = (job) => (
    (job?.work_job_assignees ?? []).find(row => row.worker_id === currentWorker?.id)
    || myRows.find(row => row.job_id === job?.id)
    || null
  )
  const helpAsks = (isAdmin ? jobs : openJobs)
    .filter(job => (
      job.kind === 'open_post'
      && job.status === 'active'
      && isoDate(job.work_date) >= today
      && !['assigned', 'approved', 'declined'].includes(myOpenRow(job)?.status)
    ))
    .map(job => ({ ...job, my_status: myOpenRow(job)?.status || '' }))

  const openGoingNames = (job) => {
    const names = []
    const add = (raw) => {
      const full = String(raw || '').trim()
      if (!full) return
      const mine = currentWorker?.name || ''
      const label = mine && (full === mine || firstName(full) === firstName(mine))
        ? t('planSelf')
        : (firstName(full) || full)
      if (!label || names.includes(label)) return
      names.push(label)
    }
    const stored = Array.isArray(job?.crew_names)
      ? job.crew_names
      : String(job?.crew_names || '').split(',')
    stored.forEach(add)
    for (const row of job?.work_job_assignees ?? []) {
      if (!['assigned', 'approved', 'pending'].includes(row.status)) continue
      add(workerName(row.worker_id))
    }
    if (['assigned', 'approved', 'pending'].includes(myOpenRow(job)?.status)) add(currentWorker?.name)
    return names
  }

  const handleHelpRespond = async (job, choice) => {
    if (!currentWorker?.id || officeSelf) {
      alert(t('planWorkerMissing'))
      return
    }
    if (choice === 'go') {
      if (absenceOnDate(absences, currentWorker.id, job.work_date)) {
        alert(t('absenceBlockedApply'))
        return
      }
      const already = (isAdmin ? myPlan : myRows).some(row =>
        ['assigned', 'approved'].includes(row.status) && isoDate(row.work_jobs?.work_date) === isoDate(job.work_date),
      )
      if (already && !window.confirm(t('planAlreadyBooked'))) return
    }
    const { error } = await respondToOpenPost({
      jobId: job.id,
      workerId: currentWorker.id,
      choice,
      startTime: job.start_time,
      endTime: job.end_time,
    })
    if (error) {
      alert(`${t('planApplyError')} ${error.message}`)
      return
    }
    if (choice === 'go') {
      const nextNames = [...new Set([
        ...(Array.isArray(job.crew_names) ? job.crew_names : []),
        currentWorker.name,
      ].filter(Boolean))]
      if (nextNames.length) {
        await supabase.from('work_jobs').update({ crew_names: nextNames, updated_at: new Date().toISOString() }).eq('id', job.id)
      }
      if (isAdmin) {
        const joined = {
          ...job,
          work_job_assignees: [
            ...(job.work_job_assignees ?? []).filter(row => row.worker_id !== currentWorker.id),
            {
              worker_id: currentWorker.id,
              status: 'assigned',
              planned_start: job.start_time || null,
              planned_end: job.end_time || null,
            },
          ],
        }
        await queueWorkersOnDay([currentWorker.id], job.work_date, job.id, withSavedJob(jobs, joined))
      }
    }
    loadData(view === 'history' ? 'history' : 'live')
  }

  const handleApply = (job) => handleHelpRespond(job, 'go')

  const handleDecision = async (assigneeId, status) => {
    if (status === 'approved') {
      const row = pendingApprovals.find(item => item.id === assigneeId)
      if (row && absenceOnDate(absences, row.worker_id, row.job.work_date)) {
        alert(t('absenceBlocked'))
        return
      }
    }
    const { error } = await supabase
      .from('work_job_assignees')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', assigneeId)
    if (error) {
      alert(`${t('planSaveError')} ${error.message}`)
      return
    }
    if (status === 'approved' && isAdmin) {
      const row = pendingApprovals.find(item => item.id === assigneeId)
      if (row?.worker_id && row.job) {
        const joined = {
          ...row.job,
          work_job_assignees: [
            ...(row.job.work_job_assignees ?? []).filter(item => item.id !== assigneeId && item.worker_id !== row.worker_id),
            { ...row, status: 'approved' },
          ],
        }
        await queueWorkersOnDay([row.worker_id], row.job.work_date, row.job.id, withSavedJob(jobs, joined))
      }
    }
    loadData(view === 'history' ? 'history' : 'live')
  }

  const copyJobToDates = async (job, dates) => {
    const sourceRows = (job.work_job_assignees ?? [])
      .filter(row => ['assigned', 'approved'].includes(row.status) || !row.status)
      .filter(row => row.worker_id)
    if (!dates.length || !sourceRows.length) return
    for (const work_date of dates) {
      const day = isoDate(work_date)
      if (!day) continue
      const object = objects.find(item => item.id === job.object_id)
      const dayJob = withFixedEnd({ start: job.start_time, end: job.end_time }, object, day)
      const available = sourceRows.filter(row => !absenceOnDate(absences, row.worker_id, day))
      if (!available.length) continue
      const copyPayload = {
        work_date: day,
        start_time: dayJob.start || job.start_time || null,
        end_time: dayJob.end || job.end_time || null,
        object_id: job.object_id || null,
        object_name: job.object_name || null,
        location_text: job.location_text || null,
        task_text: job.task_text || null,
        bring_text: job.bring_text || null,
        remember_text: job.remember_text || null,
        notes_text: job.notes_text || null,
        kind: 'assigned',
        needed_count: Math.max(1, available.length),
        status: 'active',
        updated_at: new Date().toISOString(),
        crew_names: crewNamesFor(available.map(row => row.worker_id), workers),
      }
      let { data, error } = await supabase.from('work_jobs').insert([copyPayload]).select().single()
      if (error && isMissingColumn(error)) {
        const basic = { ...copyPayload }
        delete basic.crew_names
        const fallback = await supabase.from('work_jobs').insert([basic]).select().single()
        data = fallback.data
        error = fallback.error
      }
      if (error) {
        alert(`${t('planSaveError')} ${error.message}`)
        return
      }
      const withTimes = available.map(row => {
        const range = withFixedEnd(assignmentRange(row, job), object, day)
        return {
          job_id: data.id,
          worker_id: row.worker_id,
          status: 'assigned',
          planned_start: range.start || null,
          planned_end: range.end || null,
        }
      })
      let { error: assignError } = await supabase.from('work_job_assignees').insert(withTimes)
      if (assignError && isMissingColumn(assignError)) {
        const fallback = await supabase.from('work_job_assignees').insert(
          available.map(row => ({ job_id: data.id, worker_id: row.worker_id, status: 'assigned' })),
        )
        assignError = fallback.error
      }
      if (assignError) {
        alert(`${t('planSaveError')} ${assignError.message}`)
        return
      }
      const created = {
        ...data,
        work_date: day,
        start_time: copyPayload.start_time,
        end_time: copyPayload.end_time,
        work_job_assignees: withTimes.map(row => ({
          ...row,
          status: 'assigned',
        })),
      }
      await queueWorkersOnDay(available.map(row => row.worker_id), day, data.id, withSavedJob(jobs, created))
    }
  }

  const handleAddNextDay = async (job) => {
    const nextDate = nextWeekday(job.work_date)
    if (!nextDate) return
    setCopyingId(job.id)
    await copyJobToDates(job, [nextDate])
    setCopyingId('')
    loadData(view === 'history' ? 'history' : 'live')
  }

  const handleSeen = useCallback(async (row) => {
    if (!row?.id || row.seen_at) return
    setConfirmingId(row.id)
    const seenAt = new Date().toISOString()
    const { error } = await supabase
      .from('work_job_assignees')
      .update({ seen_at: seenAt, updated_at: seenAt })
      .eq('id', row.id)
    if (error) {
      setConfirmingId('')
      alert(`${t('planSaveError')} ${error.message}`)
      return
    }
    setMyRows(current => current.map(item => item.id === row.id ? { ...item, seen_at: seenAt } : item))
    setJobs(current => current.map(job => ({
      ...job,
      work_job_assignees: (job.work_job_assignees ?? []).map(item => item.id === row.id ? { ...item, seen_at: seenAt } : item),
    })))
    const jobId = row.work_jobs?.id || row.job_id
    if (jobId && row.worker_id) {
      await supabase
        .from('work_notifications')
        .update({ read_at: seenAt })
        .eq('job_id', jobId)
        .eq('worker_id', row.worker_id)
        .is('read_at', null)
      await cancelJobReminders(jobId)
    }
    await cancelUnseenReminder(row.id)
    setConfirmingId('')
  }, [t])

  const handleSaveHours = async (row, start, end) => {
    if (officeSelf) return
    if (hideOwnerPlan && ownerIds.has(row.worker_id)) return
    if (!isAdmin && currentWorker?.id && row.worker_id && row.worker_id !== currentWorker.id) return
    const jobObject = objects.find(item => item.id === row.work_jobs?.object_id)
    const fixedMinutes = objectFixedMinutes(jobObject, row.work_jobs?.work_date)
    if (fixedMinutes && !isAdmin) {
      alert(t('objectFixedLocked'))
      return
    }
    const nextEnd = fixedMinutes ? clockPlusMinutes(start, fixedMinutes) : end
    setConfirmingId(row.id)
    const payload = {
      actual_start: start || null,
      actual_end: nextEnd || null,
      updated_at: new Date().toISOString(),
      hours_changed_by: currentWorker?.id || null,
      hours_changed_by_name: currentWorker?.name || null,
      hours_changed_at: new Date().toISOString(),
    }
    let { error } = await supabase
      .from('work_job_assignees')
      .update(payload)
      .eq('id', row.id)
    if (error && isMissingColumn(error)) {
      const fallback = await supabase
        .from('work_job_assignees')
        .update({
          actual_start: start || null,
          actual_end: nextEnd || null,
          updated_at: payload.updated_at,
        })
        .eq('id', row.id)
      error = fallback.error
    }
    setConfirmingId('')
    if (error) {
      alert(`${t('planSaveError')} ${error.message}`)
      return
    }
    loadData(view === 'history' ? 'history' : 'live')
  }

  const handleSaveSelfLog = async (payload) => {
    if (!currentWorker?.id || officeSelf) {
      alert(t('planWorkerMissing'))
      return false
    }
    setSavingSelf(true)
    const { error } = await supabase.from('work_self_logs').insert([{
      worker_id: currentWorker.id,
      work_date: payload.work_date,
      object_id: payload.object_id || null,
      place_text: payload.place_text || null,
      task_text: payload.task_text || null,
      start_time: payload.start_time || null,
      end_time: payload.end_time || null,
      updated_at: new Date().toISOString(),
    }])
    setSavingSelf(false)
    if (error) {
      alert(`${t(isMissingTable(error) ? 'selfWorkSetup' : 'planSaveError')} ${isMissingTable(error) ? '' : error.message}`.trim())
      return false
    }
    loadData(view === 'history' ? 'history' : 'live')
    return true
  }

  const handleDeleteSelfLog = async (item) => {
    if (!item?.id) return
    if (!confirm(t('selfWorkDeleteConfirm'))) return
    const { error } = await supabase.from('work_self_logs').delete().eq('id', item.id)
    if (error) {
      alert(`${t('planSaveError')} ${error.message}`)
      return
    }
    loadData(view === 'history' ? 'history' : 'live')
  }

  const handleCancelJob = async (job) => {
    if (!confirm(t('planCancelConfirm'))) return
    const { error } = await supabase
      .from('work_jobs')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', job.id)
    if (error) {
      alert(`${t('planSaveError')} ${error.message}`)
      return
    }
    await supabase.from('work_notifications').delete().eq('job_id', job.id)
    if (editingId === job.id) resetForm()
    if (editingNeedId === job.id) resetNeedForm()
    loadData(view === 'history' ? 'history' : 'live')
  }

  const toggleWorker = (workerId) => {
    const selected = form.worker_ids.includes(workerId)
    if (!selected && absenceOnDate(absences, workerId, form.work_date)) {
      alert(t('absenceBlocked'))
      return
    }
    setForm(current => {
      const has = current.worker_ids.includes(workerId)
      if (has) {
        const nextHours = { ...current.worker_hours }
        delete nextHours[workerId]
        return {
          ...current,
          worker_ids: current.worker_ids.filter(id => id !== workerId),
          worker_hours: nextHours,
        }
      }
      const inherited = clockRange(current.start_time, current.end_time)
      return {
        ...current,
        worker_ids: [...current.worker_ids, workerId],
        worker_hours: {
          ...current.worker_hours,
          [workerId]: inherited,
        },
      }
    })
  }

  const setWorkerHour = (workerId, key, value) => {
    setForm(current => {
      const object = objects.find(item => item.id === current.object_id)
      const base = current.worker_hours[workerId] || clockRange(current.start_time, current.end_time)
      if (objectFixedMinutes(object, current.work_date) && key === 'end') return current
      const range = objectFixedMinutes(object, current.work_date)
        ? withFixedEnd({ ...base, [key]: value }, object, current.work_date)
        : { ...base, [key]: value }
      const nextHours = {
        ...current.worker_hours,
        [workerId]: range,
      }
      const spanned = spanClockRange(
        current.worker_ids.map(id => (id === workerId ? range : nextHours[id] || clockRange(current.start_time, current.end_time))),
        range,
      )
      return {
        ...current,
        start_time: spanned.start || current.start_time,
        end_time: spanned.end || current.end_time,
        worker_hours: nextHours,
      }
    })
  }

  const declineJobsForAbsence = async (workerId, start, end, reasonLabel) => {
    const rows = isAdmin
      ? jobs.flatMap(job => (job.work_job_assignees ?? []).map(row => ({ ...row, job })))
      : myRows.map(row => ({ ...row, job: row.work_jobs }))
    const overlapping = rows.filter(row =>
      row.worker_id === workerId
      && ['assigned', 'approved', 'pending'].includes(row.status)
      && row.job
      && row.job.work_date >= start
      && row.job.work_date <= end
    )
    for (const row of overlapping) {
      await supabase
        .from('work_job_assignees')
        .update({
          status: 'declined',
          decline_reason: reasonLabel,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    }
  }

  const handleSaveAbsence = async (event) => {
    event.preventDefault()
    if (!isAdmin) return
    const workerId = absenceForm.worker_id
    if (hideOwnerPlan && ownerIds.has(workerId)) return
    if (!workerId) return alert(t('planWorkerMissing'))
    const reason = absenceForm.reason === 'vacation' ? 'vacation' : 'sick'
    const reasonLabel = reason === 'vacation' ? t('absenceVacation') : t('absenceSick')
    const startDate = isoDate(absenceForm.start_date)
    const endDate = isoDate(absenceForm.end_date)
    if (!startDate || !endDate) return
    if (endDate < startDate) return alert(t('absenceDateOrder'))
    if (reason === 'vacation') {
      const year = DateTime.fromISO(startDate, { zone: 'Europe/Berlin' }).year
      const worker = workers.find(item => item.id === workerId)
      const balance = leaveBalance(worker, absences, year, editingAbsenceId || '')
      const days = vacationDaysInRange(startDate, endDate, year)
      if (days > balance.left) {
        return alert(t('leaveOverLimit').replace('{days}', String(balance.left)).replace('{year}', String(year)))
      }
      const clash = leaveBookingClash(absences, startDate, endDate, workerId, editingAbsenceId || '')
      if (clash.others.length) {
        const names = clash.others
          .map(id => firstName(workers.find(item => item.id === id)?.name) || t('planUnknownWorker'))
          .join(', ')
        if (!window.confirm(t('leaveOverlapConfirm').replace('{names}', names))) return
      }
    }
    const payload = {
      worker_id: workerId,
      start_date: startDate,
      end_date: endDate,
      reason,
      note: absenceForm.note.trim() || null,
    }
    const result = editingAbsenceId
      ? await supabase.from('work_absences').update(payload).eq('id', editingAbsenceId)
      : await supabase.from('work_absences').insert([payload]).select('id').single()
    if (result.error) {
      alert(isMissingTable(result.error) ? t('absenceSetupBody') : `${t('planSaveError')} ${result.error.message}`)
      return
    }
    await declineJobsForAbsence(workerId, startDate, endDate, reasonLabel)
    if (!editingAbsenceId) setAbsenceForm(emptyAbsence())
    loadData(view === 'history' ? 'history' : 'live')
  }

  const handleDeleteAbsence = async (item) => {
    if (!isAdmin) return
    if (!window.confirm(t('absenceDeleteConfirm'))) return
    const { error } = await supabase.from('work_absences').delete().eq('id', item.id)
    if (error) {
      alert(`${t('planSaveError')} ${error.message}`)
      return
    }
    if (editingAbsenceId === item.id) {
      setEditingAbsenceId(null)
      setAbsenceForm(emptyAbsence())
    }
    loadData(view === 'history' ? 'history' : 'live')
  }

  const handleSaveVacationLimit = async (worker, days) => {
    if (!isAdmin || !worker?.id) return
    const { error } = await supabase.from('workers').update({ vacation_days: days }).eq('id', worker.id)
    if (error) {
      alert(isMissingColumn(error) || /vacation_days/i.test(error.message || '') ? t('leaveSetup') : `${t('planSaveError')} ${error.message}`)
      return
    }
    await onReloadWorkers?.()
  }

  const startEditAbsence = (item) => {
    setAdminTab('people')
    setEditingAbsenceId(item.id)
    setAbsenceForm({
      worker_id: item.worker_id,
      start_date: isoDate(item.start_date),
      end_date: isoDate(item.end_date),
      reason: item.reason === 'vacation' ? 'vacation' : 'sick',
      note: item.note ?? '',
    })
  }

  const resetObjectForm = () => {
    setEditingObjectId(null)
    setObjectForm(emptyObjectForm())
    setObjectSheetMessage('')
  }

  const startEditObject = (item) => {
    setAdminTab('places')
    setEditingObjectId(item.id)
    setObjectSheetMessage('')
    setObjectForm({
      name: item.name ?? '',
      address: item.address ?? '',
      manager: item.manager ?? '',
      phone: item.phone ?? '',
      fixed_hours: item.fixed_hours != null && Number(item.fixed_hours) > 0 ? String(item.fixed_hours) : '',
      fixed_hours_by_day: Object.fromEntries(
        Object.entries(parseFixedHoursByDay(item.fixed_hours_json)).map(([day, hours]) => [Number(day), String(hours)]),
      ),
      time_locked: objectTimeLocked(item),
      fixed_start: objectFixedStart(item),
      leistung_text: item.leistung_text ?? '',
      leistung_image_url: item.leistung_image_url ?? '',
      turnus: parseTurnus(item.turnus_json),
      groups: groupsFromObject(item),
    })
    requestAnimationFrame(() => {
      const node = document.getElementById('plan-object-form')
      node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      node?.querySelector('input')?.focus({ preventScroll: true })
    })
  }

  const applyObjectFixedHours = async (object) => {
    if (!object?.id || !objectHasFixedHours(object)) return 0
    const { data: jobs, error } = await supabase
      .from('work_jobs')
      .select('id, work_date, start_time, end_time')
      .eq('object_id', object.id)
      .neq('status', 'cancelled')
    if (error || !jobs?.length) return 0
    const now = new Date().toISOString()
    const { data: rows } = await supabase
      .from('work_job_assignees')
      .select('id, job_id, planned_start, planned_end, actual_start, actual_end')
      .in('job_id', jobs.map(job => job.id))
    const byJob = new Map()
    for (const row of rows || []) {
      const list = byJob.get(row.job_id) || []
      list.push(row)
      byJob.set(row.job_id, list)
    }
    let touched = 0
    for (const job of jobs) {
      if (!objectFixedMinutes(object, job.work_date)) continue
      const jobTimed = withFixedEnd({ start: job.start_time, end: job.end_time }, object, job.work_date)
      if (
        jobTimed.start
        && (
          formatClock(job.start_time) !== formatClock(jobTimed.start)
          || (jobTimed.end && formatClock(job.end_time) !== jobTimed.end)
        )
      ) {
        await supabase.from('work_jobs').update({
          start_time: jobTimed.start || job.start_time,
          end_time: jobTimed.end || job.end_time,
          updated_at: now,
        }).eq('id', job.id)
        touched += 1
      }
      for (const row of byJob.get(job.id) || []) {
        const planned = withFixedEnd({
          start: row.planned_start || jobTimed.start || job.start_time,
          end: row.planned_end,
        }, object, job.work_date)
        const patch = {
          planned_start: planned.start || null,
          planned_end: planned.end || null,
          updated_at: now,
        }
        if (formatClock(row.actual_start)) {
          const actual = withFixedEnd({ start: row.actual_start, end: row.actual_end }, object, job.work_date)
          patch.actual_start = actual.start || null
          patch.actual_end = actual.end || null
        }
        if (
          formatClock(row.planned_start) === formatClock(patch.planned_start)
          && formatClock(row.planned_end) === formatClock(patch.planned_end)
          && (!patch.actual_end || formatClock(row.actual_end) === formatClock(patch.actual_end))
        ) continue
        await supabase.from('work_job_assignees').update(patch).eq('id', row.id)
        touched += 1
      }
    }
    const { data: logs } = await supabase
      .from('work_self_logs')
      .select('id, work_date, start_time, end_time')
      .eq('object_id', object.id)
    for (const log of logs || []) {
      if (!objectFixedMinutes(object, log.work_date) || !formatClock(log.start_time)) continue
      const timed = withFixedEnd({ start: log.start_time, end: log.end_time }, object, log.work_date)
      if (!timed.end || formatClock(log.end_time) === timed.end) continue
      await supabase.from('work_self_logs').update({ end_time: timed.end, updated_at: now }).eq('id', log.id)
      touched += 1
    }
    return touched
  }

  const handleSaveObject = async (event) => {
    event.preventDefault()
    const name = objectForm.name.trim()
    if (!name) return alert(t('objectNameMissing'))
    const payload = {
      name,
      address: objectForm.address.trim() || null,
      manager: objectForm.manager.trim() || null,
      phone: objectForm.phone.trim() || null,
      fixed_hours: parseFixedHoursValue(objectForm.fixed_hours) || null,
      fixed_hours_json: serializeFixedHoursJson(objectForm.fixed_hours_by_day, { locked: objectForm.time_locked, start: objectForm.fixed_start }),
      leistung_text: objectForm.leistung_text.trim() || null,
      leistung_image_url: objectForm.leistung_image_url.trim() || null,
      turnus_json: serializeTurnus(objectForm.turnus),
      guide_json: serializeGroups(objectForm.groups),
    }
    let result = editingObjectId
      ? await supabase.from('objects').update(payload).eq('id', editingObjectId)
      : await supabase.from('objects').insert([payload]).select('id').single()
    if (result.error && /guide_json|schema cache|column/i.test(result.error.message || '')) {
      const fallback = {
        ...payload,
        turnus_json: {
          groups: payload.guide_json,
          days: payload.turnus_json,
        },
      }
      delete fallback.guide_json
      result = editingObjectId
        ? await supabase.from('objects').update(fallback).eq('id', editingObjectId)
        : await supabase.from('objects').insert([fallback]).select('id').single()
    }
    if (result.error && /leistung_text|leistung_image_url|turnus_json|guide_json|schema cache|column/i.test(result.error.message || '')) {
      alert(t('objectGuideSetup'))
      return
    }
    if (result.error && /fixed_hours_json|fixed_hours|schema cache|column/i.test(result.error.message || '')) {
      alert(t('objectFixedSetup'))
      return
    }
    if (result.error) {
      alert(`${t('planSaveError')} ${result.error.message}`)
      return
    }
    const objectId = editingObjectId || result.data?.id
    if (objectId) await applyObjectFixedHours({ id: objectId, ...payload })
    resetObjectForm()
    onReloadObjects?.()
    loadData(view === 'history' ? 'history' : 'live')
  }

  const handleObjectSheet = async (file) => {
    if (!file) return
    setObjectPhotoBusy(true)
    setObjectSheetMessage('')
    let sheet
    try {
      sheet = await readTurnusFile(file)
    } catch (error) {
      setObjectPhotoBusy(false)
      alert(`${t('objectSheetReadError')} ${error.message || ''}`)
      return
    }
    const uploadBlob = sheet.previewBlob || file
    const ext = uploadBlob.type === 'application/pdf' ? 'pdf' : 'jpg'
    const safeName = String(file.name || `blatt.${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `object-guides/${editingObjectId || 'new'}/${Date.now()}-${safeName}`
    const { error } = await supabase.storage.from('report-images').upload(path, uploadBlob, {
      contentType: uploadBlob.type || file.type || 'image/jpeg',
      upsert: false,
    })
    if (error) {
      setObjectPhotoBusy(false)
      alert(`${t('imageUploadError')} ${error.message}`)
      return
    }
    const { data } = supabase.storage.from('report-images').getPublicUrl(path)
    const imageUrl = data?.publicUrl || ''
    let matchedName = ''
    let matchedDays = 0
    setObjectForm(current => {
      const next = applyTurnusSheet({ ...current, leistung_image_url: imageUrl || current.leistung_image_url }, sheet)
      matchedName = next.row?.name || current.name
      matchedDays = Object.keys(next.row?.days || {}).length
      return next.form
    })
    if (!sheet.rows?.length) setObjectSheetMessage(t('objectSheetEmpty'))
    else if (!matchedDays) setObjectSheetMessage(t('objectSheetNoRow'))
    else setObjectSheetMessage(t('objectSheetApplied').replace('{name}', matchedName || t('objectName')).replace('{days}', String(matchedDays)))
    setObjectPhotoBusy(false)
  }

  const handleDeleteObject = async (item) => {
    if (!confirm(t('objectDeleteConfirm'))) return
    const { error } = await supabase.from('objects').delete().eq('id', item.id)
    if (error) {
      alert(`${t('planSaveError')} ${error.message}`)
      return
    }
    if (editingObjectId === item.id) resetObjectForm()
    onReloadObjects?.()
  }

  const inviteUrl = (token) => `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(token)}`

  const copyInvite = async (token, copiedKey) => {
    const url = inviteUrl(token)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt(t('inviteCopy'), url)
    }
    setInviteCopied(copiedKey || token)
    window.setTimeout(() => setInviteCopied(current => (current === (copiedKey || token) ? '' : current)), 2500)
  }

  const openInviteWhatsApp = (token, name) => {
    const url = inviteUrl(token)
    const text = t('inviteWhatsAppText').replace('{name}', name || '').replace('{url}', url)
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  const handleCreateInvite = async (event) => {
    event.preventDefault()
    const name = inviteName.trim()
    if (!name) return alert(t('inviteNameMissing'))
    setInviteBusy(true)
    const { data, error } = await supabase.rpc('create_worker_invite', { p_name: name })
    if (!error && invitePrivileged && canGrantPlanner) {
      const { data: created } = await supabase
        .from('workers')
        .select('id, name, email, role')
        .ilike('name', name)
      const target = (created ?? []).find(item => String(item.name || '').trim().toLowerCase() === name.toLowerCase())
      if (target?.id) {
        await supabase.from('workers').update({ role: PLANNER_INVITE_ROLE }).eq('id', target.id)
      }
    }
    setInviteBusy(false)
    if (error) {
      alert(`${t('planSaveError')} ${error.message}`)
      return
    }
    setInviteName('')
    setInvitePrivileged(false)
    onReloadWorkers?.()
    if (data) {
      const token = String(data)
      await copyInvite(token, 'new')
      openInviteWhatsApp(token, name)
    }
  }

  const handleRefreshInvite = async (workerId) => {
    setInviteBusy(true)
    const { data, error } = await supabase.rpc('refresh_worker_invite', { p_worker_id: workerId })
    setInviteBusy(false)
    if (error) {
      alert(`${t('planSaveError')} ${error.message}`)
      return
    }
    if (data) await copyInvite(String(data), workerId)
  }

  const handleWhatsAppInvite = async (worker) => {
    setInviteBusy(true)
    const { data, error } = await supabase.rpc('refresh_worker_invite', { p_worker_id: worker.id })
    setInviteBusy(false)
    if (error) {
      alert(`${t('planSaveError')} ${error.message}`)
      return
    }
    if (data) openInviteWhatsApp(String(data), worker.name)
  }

  const busyOnBoardDate = busyElsewhere(liveBoardDate, null)
  const dayRoster = useMemo(() => {
    const working = []
    const free = []
    const off = []
    for (const worker of activeWorkers) {
      const absence = absenceOnDate(absences, worker.id, liveBoardDate)
      if (absence) {
        off.push({
          id: worker.id,
          name: worker.name,
          label: absence.reason === 'vacation' ? t('absenceVacation') : t('absenceSick'),
          start: isoDate(absence.start_date),
          end: isoDate(absence.end_date),
        })
        continue
      }
      if (busyOnBoardDate.has(worker.id)) {
        const places = boardJobs
          .filter(job => (job.work_job_assignees ?? []).some(row => row.worker_id === worker.id && ['assigned', 'approved'].includes(row.status)))
          .map(job => job.location_text || job.object_name)
          .filter(Boolean)
        working.push({
          id: worker.id,
          name: worker.name,
          label: [...new Set(places)].join(', '),
        })
        continue
      }
      free.push({ id: worker.id, name: worker.name })
    }
    return { working, free, off }
  }, [absences, activeWorkers, liveBoardDate, boardJobs, busyOnBoardDate, t])

  const shortcutJobsFor = (workerId) => boardJobs
    .filter(job => job?.status !== 'cancelled' && job?.status !== 'canceled' && job?.kind !== 'open_post')
    .map((job) => {
      const row = (job.work_job_assignees ?? []).find(item => item.worker_id === workerId)
      const assigned = Boolean(row && ['assigned', 'approved'].includes(row.status))
      const range = clockRange(job.start_time, job.end_time)
      const hit = !assigned && overlapJobForWorker(workerId, job.work_date, range, job.id)
      return {
        id: job.id,
        place: job.location_text || job.object_name || t('planNoPlace'),
        start: formatClock(job.start_time),
        end: formatClock(job.end_time),
        assigned,
        overlap: Boolean(hit),
        declined: row?.status === 'declined',
      }
    })
    .filter(item => !item.assigned)

  const handleWorkerMessage = async (workerId, text) => {
    const body = String(text || '').trim()
    if (!body) {
      alert(t('workerMessageRequired'))
      return false
    }
    setShortcutBusy(true)
    const { error } = await supabase.from('work_notifications').insert({
      audience: 'worker',
      worker_id: workerId,
      title: 'notifyMessage',
      body,
      kind: 'message',
    })
    setShortcutBusy(false)
    if (error) {
      alert(`${t('planSaveError')} ${error.message}`)
      return false
    }
    return true
  }

  const handleAddWorkerToJobs = async (workerId, jobIds) => {
    if (!workerId || !jobIds?.length) return false
    if (absenceOnDate(absences, workerId, liveBoardDate)) {
      alert(t('absenceBlocked'))
      return false
    }
    setShortcutBusy(true)
    for (const jobId of jobIds) {
      const job = boardJobs.find(item => item.id === jobId)
      if (!job) continue
      const range = clockRange(job.start_time, job.end_time)
      const existing = (job.work_job_assignees ?? []).find(row => row.worker_id === workerId)
      if (existing && ['assigned', 'approved'].includes(existing.status)) continue
      let error
      if (existing) {
        const updated = await supabase
          .from('work_job_assignees')
          .update({
            status: 'assigned',
            decline_reason: null,
            seen_at: null,
            planned_start: range.start || null,
            planned_end: range.end || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        error = updated.error
        if (error && isMissingColumn(error)) {
          const fallback = await supabase
            .from('work_job_assignees')
            .update({ status: 'assigned', decline_reason: null, seen_at: null, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
          error = fallback.error
        }
      } else {
        const inserted = await supabase.from('work_job_assignees').insert({
          job_id: job.id,
          worker_id: workerId,
          status: 'assigned',
          planned_start: range.start || null,
          planned_end: range.end || null,
        })
        error = inserted.error
        if (error && isMissingColumn(error)) {
          const fallback = await supabase.from('work_job_assignees').insert({
            job_id: job.id,
            worker_id: workerId,
            status: 'assigned',
          })
          error = fallback.error
        }
      }
      if (error) {
        setShortcutBusy(false)
        alert(`${t('planSaveError')} ${error.message}`)
        return false
      }
    }
    const snapshot = jobs.map(job => {
      if (!jobIds.includes(job.id)) return job
      const range = clockRange(job.start_time, job.end_time)
      const others = (job.work_job_assignees ?? []).filter(row => row.worker_id !== workerId)
      return {
        ...job,
        work_job_assignees: [
          ...others,
          {
            worker_id: workerId,
            status: 'assigned',
            planned_start: range.start || null,
            planned_end: range.end || null,
          },
        ],
      }
    })
    await queueWorkersOnDay([workerId], liveBoardDate, jobIds[0], snapshot)
    setShortcutBusy(false)
    loadData(view === 'history' ? 'history' : 'live')
    return true
  }

  const startJobWithWorker = (workerId) => {
    if (absenceOnDate(absences, workerId, liveBoardDate)) {
      alert(t('absenceBlocked'))
      return
    }
    setFocusWorkerId(workerId)
    setEditingId(null)
    setDuplicating(false)
    setForm({
      ...emptyForm(),
      work_date: liveBoardDate,
      until_date: liveBoardDate,
      worker_ids: [workerId],
      worker_hours: { [workerId]: clockRange('', '') },
    })
    setJobFormOpen(true)
    setAdminTab('board')
    requestAnimationFrame(() => document.getElementById('plan-job-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const filteredWorkers = activeWorkers
    .filter(worker => (worker.name || '').toLowerCase().includes(workerSearch.trim().toLowerCase()))
    .slice()
    .sort((a, b) => {
      const rank = (worker) => {
        if (absenceOnDate(absences, worker.id, form.work_date)) return 2
        if (overlapJobForWorker(worker.id, form.work_date, formRangeFor(worker.id), editingId)) return 1
        return 0
      }
      return rank(a) - rank(b) || (a.name || '').localeCompare(b.name || '')
    })
  const setupExtra = t('planSetupExtra')
  const pendingInvites = inviteWorkers.filter(worker => !String(worker.email || '').trim())

  const renderAdminJob = (job) => {
    const people = job.work_job_assignees ?? []
    const activePeople = people.filter(row => ['assigned', 'approved'].includes(row.status))
    const declinedPeople = people.filter(row => row.status === 'declined')
    const past = isoDate(job.work_date) < today
    const object = objects.find(item => item.id === job.object_id)
    const menuOpen = jobMenuId === job.id
    return (
      <JobCard
        key={job.id}
        job={job}
        t={t}
        language={language}
        embedded
        mapsHref={mapsHref(job)}
        badge={dayStamp(job.work_date, today, t) || (past ? t('planDone') : null)}
        objectAddress={object?.address || ''}
      >
        <div className="mt-3 space-y-1 text-sm text-slate-300">
          {activePeople.map(row => (
            <p key={row.id}>
              {workerName(row.worker_id)}
              {clockRangeLabel(assignmentRange(row, job)) ? ` · ${clockRangeLabel(assignmentRange(row, job))}` : ''}
              {' · '}
              {past ? t('planDone') : (row.seen_at ? t('planOpenedAt').replace('{time}', formatUpdatedAt(row.seen_at, language) || t('planSeenDone')) : t('planUnseen'))}
            </p>
          ))}
          {declinedPeople.map(row => (
            <p key={row.id} className="text-rose-200">
              {workerName(row.worker_id)} · {t('planDeclined')}
              {row.decline_reason ? `: ${row.decline_reason}` : ''}
            </p>
          ))}
          {activePeople.length === 0 && declinedPeople.length === 0 && (
            <p className="text-slate-400">{t('workers')}: -</p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => startEdit(job)} className="min-h-11 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            {t('edit')}
          </button>
          <button type="button" onClick={() => startDuplicate(job)} className="min-h-11 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            {t('planCopy')}
          </button>
          <div className="relative z-30">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t('planMoreActions')}
              onClick={() => setJobMenuId(menuOpen ? '' : job.id)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-800 text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <IconMore />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute bottom-full right-0 z-40 mb-1 min-w-44 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-xl">
                <button
                  type="button"
                  role="menuitem"
                  disabled={copyingId === job.id}
                  onClick={() => { setJobMenuId(''); handleAddNextDay(job) }}
                  className="block min-h-11 w-full rounded-lg px-3 text-left text-sm text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {t('planAddNextDay')}
                </button>
                {!past && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setJobMenuId(''); handleCancelJob(job) }}
                    className="block min-h-11 w-full rounded-lg px-3 text-left text-sm text-rose-200 hover:bg-rose-500/10"
                  >
                    {t('planCancel')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </JobCard>
    )
  }

  if (setupNeeded) {
    return (
      <div className="rounded-[1.75rem] border border-amber-300/30 bg-amber-400/10 p-6 text-amber-50">
        <p className="text-sm font-semibold">{t('planSetupTitle')}</p>
        <p className="mt-2 text-sm text-amber-100/90">{t('planSetupBody')}</p>
        <p className="mt-2 text-sm text-amber-100/90">{setupExtra}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {errorMessage && (isAdmin || view !== 'plan') && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      )}

      {view === 'plan' && isAdmin && (
        <div className="mb-1 flex flex-wrap gap-1 border-b border-white/10 pb-2" role="tablist" aria-label={t('adminPlanMenu')}>
          {[
            { id: 'board', label: t('adminNavPlan') },
            { id: 'people', label: t('adminTabPeople') },
            { id: 'places', label: t('adminTabPlaces') },
            { id: 'fleet', label: t('adminTabFleet') },
            { id: 'invite', label: t('adminTabInvites') },
          ].map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={adminTab === item.id}
              onClick={() => setAdminTab(item.id)}
              className={`min-h-11 rounded-lg px-2.5 text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                adminTab === item.id
                  ? 'bg-white/10 text-white ring-1 ring-cyan-300/40'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {view === 'plan' && isAdmin && adminTab === 'people' && (
        <LeavePeoplePanel
          t={t}
          language={language}
          year={DateTime.now().setZone('Europe/Berlin').year}
          workers={activeWorkers.filter(worker => !hideOwnerPlan || !ownerIds.has(worker.id))}
          absences={absences
            .filter(item => !(hideOwnerPlan && ownerIds.has(item.worker_id)))
            .slice()
            .sort((left, right) => {
              const leftSoon = isoDate(left.end_date) >= today ? 0 : 1
              const rightSoon = isoDate(right.end_date) >= today ? 0 : 1
              return leftSoon - rightSoon || isoDate(right.start_date).localeCompare(isoDate(left.start_date))
            })}
          form={absenceForm}
          setForm={setAbsenceForm}
          editingId={editingAbsenceId}
          onSubmit={handleSaveAbsence}
          onEdit={startEditAbsence}
          onDelete={handleDeleteAbsence}
          onCancelEdit={() => { setEditingAbsenceId(null); setAbsenceForm(emptyAbsence()) }}
          onSaveLimit={handleSaveVacationLimit}
          DateField={DateField}
          jobs={plannedJobs}
        />
      )}

      {view === 'plan' && isAdmin && adminTab === 'fleet' && (
        <FleetPanel
          t={t}
          workers={activeWorkers.filter(worker => !hideOwnerPlan || !ownerIds.has(worker.id))}
          jobs={plannedJobs}
          today={today}
        />
      )}

      {view === 'plan' && isAdmin && adminTab === 'places' && (
        <form id="plan-object-form" onSubmit={handleSaveObject} className="rounded-[1.75rem] bg-slate-900/85 p-5 ring-1 ring-slate-700">
          <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-200">{t('adminTabPlaces')}</p>
          {editingObjectId ? <p className="mt-1 text-sm font-semibold text-white">{objectForm.name || t('edit')}</p> : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              {t('objectName')}
              <input
                value={objectForm.name}
                onChange={e => setObjectForm(current => ({ ...current, name: e.target.value }))}
                className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-400">
              {t('objectAddress')}
              <input
                value={objectForm.address}
                onChange={e => setObjectForm(current => ({ ...current, address: e.target.value }))}
                className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-400">
              {t('responsible')}
              <input
                value={objectForm.manager}
                onChange={e => setObjectForm(current => ({ ...current, manager: e.target.value }))}
                className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-400">
              {t('objectPhone')}
              <input
                value={objectForm.phone}
                onChange={e => setObjectForm(current => ({ ...current, phone: e.target.value }))}
                className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <ObjectSheetFields
              t={t}
              language={language}
              form={objectForm}
              setForm={setObjectForm}
              onPickFile={handleObjectSheet}
              busy={objectPhotoBusy}
              message={objectSheetMessage}
            />
          </div>
          <button type="submit" className="mt-3 w-full rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white">
            {t('objectSave')}
          </button>
          {editingObjectId && (
            <button type="button" onClick={resetObjectForm} className="mt-2 w-full rounded-xl bg-slate-800 px-4 py-3 font-semibold text-white">
              {t('cancel')}
            </button>
          )}
          {objects.length === 0 ? (
            <p className="mt-3 text-center text-sm text-slate-400">{t('objectEmpty')}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {objects.map(item => (
                <div key={item.id} className={`flex items-start justify-between gap-2 rounded-xl px-3 py-2 ${editingObjectId === item.id ? 'bg-cyan-500/10 ring-1 ring-cyan-300/30' : 'bg-slate-950/50'}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    {item.address ? <p className="text-xs text-slate-400">{item.address}</p> : null}
                    {objectHasFixedHours(item) ? (
                      <p className="mt-0.5 text-xs text-cyan-200/80">
                        {t('objectFixedBadge').replace('{hours}', formatObjectFixedSummary(item, language))}
                        {objectTimeLocked(item) ? ` · ${t('objectTimeRigidBadge')}` : ''}
                      </p>
                    ) : objectTimeLocked(item) ? (
                      <p className="mt-0.5 text-xs text-cyan-200/80">{t('objectTimeRigidBadge')}</p>
                    ) : null}
                    {objectHasGuide(item) ? <p className="mt-0.5 text-xs text-slate-300">{t('objectGuideTitle')}</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => startEditObject(item)} className="text-xs font-semibold text-cyan-200">{t('edit')}</button>
                    <button type="button" onClick={() => handleDeleteObject(item)} className="text-xs font-semibold text-rose-200">{t('delete')}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      {view === 'plan' && isAdmin && adminTab === 'invite' && (
        <form onSubmit={handleCreateInvite} className="rounded-[1.75rem] border border-cyan-300/20 bg-cyan-500/10 p-5">
          <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-200">{t('inviteTitle')}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
              placeholder={t('inviteName')}
              className="w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <button type="submit" disabled={inviteBusy} className="shrink-0 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {inviteBusy ? '...' : t('inviteWhatsApp')}
            </button>
          </div>
          {canGrantPlanner && (
            <label className="mt-3 flex items-start gap-2 rounded-xl bg-slate-950/70 px-3 py-3 text-sm text-slate-100">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={invitePrivileged}
                onChange={e => setInvitePrivileged(e.target.checked)}
              />
              <span>
                <span className="font-semibold">{t('invitePrivileged')}</span>
                {t('invitePrivilegedHint') ? <span className="mt-1 block text-xs text-slate-400">{t('invitePrivilegedHint')}</span> : null}
              </span>
            </label>
          )}
          {inviteCopied === 'new' && (
            <p className="mt-2 text-xs text-cyan-100">{t('inviteCopied')}</p>
          )}
          {pendingInvites.length > 0 && (
            <div className="mt-3 space-y-2">
              {pendingInvites.map(worker => (
                <div key={worker.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-950/50 px-3 py-2">
                  <p className="text-sm text-white">
                    {worker.name} · {t('invitePending')}
                    {isPlannerRole(worker.role) ? ` · ${t('invitePlannerBadge')}` : ''}
                  </p>
                  <div className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      disabled={inviteBusy}
                      onClick={() => handleWhatsAppInvite(worker)}
                      className="text-xs font-semibold text-emerald-200 disabled:opacity-50"
                    >
                      {t('inviteWhatsApp')}
                    </button>
                    <button
                      type="button"
                      disabled={inviteBusy}
                      onClick={() => handleRefreshInvite(worker.id)}
                      className="text-xs font-semibold text-cyan-200 disabled:opacity-50"
                    >
                      {inviteCopied === worker.id ? t('inviteCopied') : t('inviteCopy')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      {view === 'plan' && isAdmin && adminTab === 'board' && (
        <AdminPlanBoard
          t={t}
          language={language}
          today={today}
          liveBoardDate={liveBoardDate}
          boardJobs={displayBoardJobs}
          boardMarks={boardMarks}
          dayRoster={dayRoster}
          rosterFilter={rosterFilter}
          onRosterFilter={setRosterFilter}
          rosterSearch={rosterSearch}
          onRosterSearch={setRosterSearch}
          focusWorkerId={focusWorkerId}
          onFocusWorker={setFocusWorkerId}
          boardOpenId={boardOpenId}
          onToggleJob={(id) => setBoardOpenId(current => current === id ? '' : id)}
          onSelectDate={(date) => {
            setBoardDate(date)
            setBoardOpenId('')
            setForm(current => {
              const object = objects.find(item => item.id === current.object_id)
              const next = {
                ...current,
                work_date: date,
                until_date: !current.until_date || current.until_date < date ? date : current.until_date,
              }
              if (editingId || duplicating) return formWithFixedTimes(next, object)
              return formWithFixedTimes(withObjectPlanRange({ ...current, work_date: date, until_date: date }, object), object)
            })
          }}
          hideOwnerHours={hideOwnerPlan}
          ownerIds={ownerIds}
          skipWorkerIds={officeIds}
          selfLogs={selfLogs}
          currentWorkerId={currentWorker?.id || ''}
          onNewJob={() => {
            setEditingId(null)
            setDuplicating(false)
            setForm({ ...emptyForm(), work_date: liveBoardDate, until_date: liveBoardDate })
            setJobFormOpen(true)
          }}
          objects={objects}
          workerName={workerName}
          renderJob={renderAdminJob}
          jobFormOpen={Boolean(jobFormOpen || editingId || duplicating)}
          shortcutJobsFor={shortcutJobsFor}
          onWorkerMessage={handleWorkerMessage}
          onAddWorkerToJobs={handleAddWorkerToJobs}
          onStartJobWithWorker={startJobWithWorker}
          shortcutBusy={shortcutBusy}
        >
      {(jobFormOpen || editingId || duplicating) && (
        <form id="plan-job-form" onSubmit={handleSave} className="rounded-[1.75rem] bg-slate-900/85 p-5 ring-1 ring-slate-700">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-200">{t('planWrite')}</p>
              <h3 className="mt-1 text-lg font-bold text-white">{editingId ? t('planUpdate') : duplicating ? t('planCopy') : t('planCreate')}</h3>
              {duplicating && t('planDuplicateHint') ? (
                <p className="mt-1 text-xs text-slate-400">{t('planDuplicateHint')}</p>
              ) : null}
            </div>
            <button type="button" onClick={resetForm} className="rounded-md bg-slate-800 px-3 py-2 text-xs text-slate-200">
              {t('cancel')}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DateField
              label={t('planDateFrom')}
              value={form.work_date}
              max={form.until_date}
              onChange={value => {
                setForm(current => {
                  const object = objects.find(item => item.id === current.object_id)
                  const next = {
                    ...current,
                    work_date: value,
                    until_date: !current.until_date || current.until_date < value ? value : current.until_date,
                  }
                  if (editingId || duplicating) return formWithFixedTimes(next, object)
                  return formWithFixedTimes(withObjectPlanRange({ ...current, work_date: value, until_date: value }, object), object)
                })
                if (value) setBoardDate(value)
              }}
            />
            <DateField
              label={t('planDateUntil')}
              value={form.until_date || form.work_date}
              min={form.work_date}
              onChange={value => setField('until_date', !value || value < form.work_date ? form.work_date : value)}
            />
          </div>
          <div className="mt-3">
            <p className="text-xs text-slate-400">{t('planWeekdays')}</p>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map(day => {
                const on = form.weekdays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    className={`min-h-11 rounded-xl text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${on ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                  >
                    {weekdayLabel(day, language)}
                  </button>
                )
              })}
            </div>
          </div>
          {formWorkdays.length > 1 && (
            <p className="mt-2 text-xs text-cyan-100">
              {t(objectPlanWeekdays(selectedObject).length > 1 && !editingId && !duplicating ? 'planObjectWeekHint' : 'planWorkdaysHint').replace('{count}', String(formWorkdays.length))}
            </p>
          )}
          <label className="mt-3 block text-xs text-slate-400">
            {t('object')}
            <select
              value={form.object_id}
              onChange={e => handleObjectChange(e.target.value)}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">{t('objectSelect')}</option>
              {objects.map(object => (
                <option key={object.id} value={object.id}>
                  {object.name}{object.address ? ` - ${object.address}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-xs text-slate-400">
            {t('planPlace')}
            <input
              value={form.location_text}
              onChange={e => setField('location_text', e.target.value)}
              placeholder={t('planPlacePlaceholder')}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>

          <label className="mt-3 block text-xs text-slate-400">
            {t('planTask')}
            <textarea
              value={form.task_text}
              onChange={e => setField('task_text', e.target.value)}
              rows={3}
              placeholder={t('planTaskPlaceholder')}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="mt-3 block text-xs text-slate-400">
            {t('planBring')}
            <textarea
              value={form.bring_text}
              onChange={e => setField('bring_text', e.target.value)}
              rows={2}
              placeholder={t('planBringPlaceholder')}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="mt-3 block text-xs text-slate-400">
            {t('planRemember')}
            <textarea
              value={form.remember_text}
              onChange={e => setField('remember_text', e.target.value)}
              rows={2}
              placeholder={t('planRememberPlaceholder')}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="mt-3 block text-xs text-slate-400">
            {t('planNotes')}
            <textarea
              value={form.notes_text}
              onChange={e => setField('notes_text', e.target.value)}
              rows={2}
              placeholder={t('planNotesPlaceholder')}
              className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>

          <div className="mt-3 rounded-xl bg-slate-950/70 p-3">
              <p className="text-xs text-slate-400">{t('selectWorkers')} ({form.worker_ids.length})</p>
              <input
                value={workerSearch}
                onChange={e => setWorkerSearch(e.target.value)}
                placeholder={t('workerSearch')}
                className="mt-2 w-full rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-100"
              />
              <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                {filteredWorkers.map(worker => {
                  const off = absenceOnDate(absences, worker.id, form.work_date)
                  const selected = form.worker_ids.includes(worker.id)
                  const hit = overlapJobForWorker(worker.id, form.work_date, formRangeFor(worker.id), editingId)
                  const other = hit || otherAssignmentForWorker(worker.id, form.work_date, editingId)
                  const otherDetail = other
                    ? [clockRangeLabel(other.range), jobPlaceLabel(other.job) || t('planNoPlace')].filter(Boolean).join(' · ')
                    : ''
                  const label = off
                    ? (off.reason === 'vacation' ? t('absenceVacation') : t('absenceSick'))
                    : (hit
                      ? t('planBusyAt')
                        .replace('{time}', clockRangeLabel(hit.range) || t('planBusy'))
                        .replace('{place}', jobPlaceLabel(hit.job) || t('planNoPlace'))
                      : other
                        ? t('planAlsoAt').replace('{detail}', otherDetail)
                        : t('planFree'))
                  return (
                  <label key={worker.id} className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-100 hover:bg-slate-800 ${off ? 'opacity-60' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleWorker(worker.id)}
                      disabled={Boolean(off)}
                    />
                    <span>{worker.name}{currentWorker?.id === worker.id ? ` · ${t('planSelf')}` : ''}</span>
                    <span className={`ml-auto max-w-[58%] text-right text-[10px] uppercase tracking-wide ${off ? 'text-rose-200' : hit ? 'text-amber-200' : other ? 'text-cyan-200' : 'text-emerald-300'}`}>
                      {label}
                    </span>
                  </label>
                  )
                })}
              </div>
              {t('planPrivacyHint') && <p className="mt-2 text-[11px] text-slate-500">{t('planPrivacyHint')}</p>}
            </div>

          {form.worker_ids.length > 0 ? (
            <div className="mt-3 space-y-3 rounded-xl bg-slate-950/70 p-3">
              <p className="text-xs text-slate-400">{t('planWorkerHours')}</p>
              {form.worker_ids.map(workerId => {
                const hours = formRangeFor(workerId)
                const hit = overlapJobForWorker(workerId, form.work_date, hours, editingId)
                return (
                  <div key={workerId} className="rounded-lg bg-slate-900/80 p-3">
                    <p className="text-sm font-semibold text-white">{workerName(workerId)}</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <TimeField
                        label={t('planStart')}
                        value={hours.start}
                        onChange={value => setWorkerHour(workerId, 'start', value)}
                      />
                      {objectFixedMinutes(selectedObject, form.work_date) ? (
                        <ComputedEnd
                          label={t('planEnd')}
                          time={hours.end}
                          note={t('objectFixedEnd').replace('{hours}', objectFixedHoursLabel(selectedObject, form.work_date))}
                        />
                      ) : (
                        <TimeField
                          label={t('planEnd')}
                          value={hours.end}
                          onChange={value => setWorkerHour(workerId, 'end', value)}
                        />
                      )}
                    </div>
                    {hit && (
                      <p className="mt-2 text-xs text-amber-200">
                        {t('planOverlapQueued')
                          .replace('{place}', jobPlaceLabel(hit.job) || t('planNoPlace'))
                          .replace('{time}', hours.end || clockRangeLabel(hours) || t('planBusy'))}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <TimeField
                label={t('planStart')}
                value={form.start_time}
                onChange={value => setField('start_time', value)}
              />
              {objectFixedMinutes(selectedObject, form.work_date) ? (
                <ComputedEnd
                  label={t('planEnd')}
                  time={form.end_time}
                  note={t('objectFixedEnd').replace('{hours}', objectFixedHoursLabel(selectedObject, form.work_date))}
                />
              ) : (
                <TimeField
                  label={t('planEnd')}
                  value={form.end_time}
                  onChange={value => setField('end_time', value)}
                />
              )}
            </div>
          )}
          {editingId && seriesJobs.length > 0 && (
            <label className="mt-3 flex items-start gap-2 rounded-xl bg-slate-950/70 px-3 py-3 text-sm text-slate-100">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.applyTimeToAll}
                onChange={e => setField('applyTimeToAll', e.target.checked)}
              />
              <span>
                {t('planApplyTimeAll').replace('{dates}', seriesJobs.map(job => formatDisplayDate(job.work_date).slice(0, 5)).join(', '))}
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-4 w-full rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white disabled:bg-slate-700"
          >
            {saving ? '...' : (editingId ? t('planUpdate') : t('planCreate'))}
          </button>
        </form>
      )}
        </AdminPlanBoard>
      )}

      {!isAdmin && (
        <div className={view === 'plan' ? '' : 'hidden'} aria-hidden={view !== 'plan'}>
          <EmployeeHome
            t={t}
            language={language}
            currentWorker={currentWorker}
            workers={workers}
            objects={objects}
            myPlan={myPlan}
            myPending={myPending}
            loading={loading}
            errorMessage={errorMessage}
            onRetry={loadData}
            onConfirm={handleSeen}
            onSaveHours={handleSaveHours}
            onOpenNotices={() => onOpenNotices?.()}
            onOpenHours={() => onOpenHours?.()}
            confirmingId={confirmingId}
            boardDate={homeDate}
            onBoardDateChange={setHomeDate}
            helpAsks={helpAsks}
            onHelpRespond={handleHelpRespond}
            lockFixedTimes
          />
        </div>
      )}

      {isAdmin && !officeSelf && (
        <div className={view === 'mine' ? '' : 'hidden'} aria-hidden={view !== 'mine'}>
          <EmployeeHome
            t={t}
            language={language}
            currentWorker={currentWorker}
            workers={workers}
            objects={objects}
            myPlan={myPlan}
            selfLogs={selfLogs}
            myPending={myPending}
            loading={loading}
            errorMessage={errorMessage}
            onRetry={loadData}
            onConfirm={handleSeen}
            onSaveHours={handleSaveHours}
            onSaveSelfLog={handleSaveSelfLog}
            onDeleteSelfLog={handleDeleteSelfLog}
            onOpenNotices={() => onOpenNotices?.()}
            onOpenHours={() => onOpenHours?.()}
            confirmingId={confirmingId}
            savingSelf={savingSelf}
            boardDate={homeDate}
            onBoardDateChange={setHomeDate}
            allowPastHours
            lockFixedTimes={false}
          />
        </div>
      )}

      <div className={view === 'hours' && !officeSelf ? '' : 'hidden'} aria-hidden={view !== 'hours' || officeSelf}>
        <EmployeeHours
          t={t}
          language={language}
          objects={objects}
          currentWorker={currentWorker}
          myPlan={myPlan}
          selfLogs={isAdmin ? selfLogs : []}
          loading={loading}
          errorMessage={errorMessage}
          onRetry={loadData}
          onSaveHours={handleSaveHours}
          onConfirm={handleSeen}
          savingId={confirmingId}
          boardDate={hoursDate}
          onBoardDateChange={setHoursDate}
          lockFixedTimes={!isAdmin}
          absences={absences}
        />
      </div>

      {view === 'openPosts' && (
        <>
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-amber-200">{t('openPosts')}</p>
            <h3 className="mt-1 text-xl font-black text-white">{t('openPostsTitle')}</h3>
            {t('openPostsHint') && <p className="mt-2 text-sm text-slate-400">{t('openPostsHint')}</p>}
          </div>

          {isAdmin && (
            <form id="plan-need-form" onSubmit={handleSaveNeed} className="rounded-[1.75rem] border border-amber-300/25 bg-amber-400/10 p-5">
              <p className="text-sm font-semibold text-white">{editingNeedId ? t('needUpdate') : duplicatingNeed ? t('planCopy') : t('needCreate')}</p>
              {duplicatingNeed && t('planDuplicateHint') ? (
                <p className="mt-1 text-xs text-amber-100/80">{t('planDuplicateHint')}</p>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <DateField
                  label={t('planDate')}
                  className="block text-xs text-amber-100/80"
                  value={needForm.work_date}
                  onChange={value => setNeedField('work_date', value)}
                />
                <label className="text-xs text-amber-100/80">
                  {t('planNeeded')}
                  <input type="number" min="1" value={needForm.needed_count} onChange={e => setNeedField('needed_count', e.target.value)} className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                </label>
                <TimeField
                  label={t('planStart')}
                  className="block text-xs text-amber-100/80"
                  value={needForm.start_time}
                  onChange={value => setNeedField('start_time', value)}
                />
                {objectFixedMinutes(selectedNeedObject, needForm.work_date) ? (
                  <ComputedEnd
                    label={t('planEnd')}
                    className="block text-xs text-amber-100/80"
                    time={needForm.end_time}
                    note={t('objectFixedEnd').replace('{hours}', objectFixedHoursLabel(selectedNeedObject, needForm.work_date))}
                  />
                ) : (
                  <TimeField
                    label={t('planEnd')}
                    className="block text-xs text-amber-100/80"
                    value={needForm.end_time}
                    onChange={value => setNeedField('end_time', value)}
                  />
                )}
              </div>
              <label className="mt-3 block text-xs text-amber-100/80">
                {t('object')}
                <select value={needForm.object_id} onChange={e => handleNeedObjectChange(e.target.value)} className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100">
                  <option value="">{t('objectSelect')}</option>
                  {objects.map(object => (
                    <option key={object.id} value={object.id}>{object.name}{object.address ? ` - ${object.address}` : ''}</option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-xs text-amber-100/80">
                {t('planPlace')}
                <input value={needForm.location_text} onChange={e => setNeedField('location_text', e.target.value)} placeholder={t('needPlacePlaceholder')} className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="mt-3 block text-xs text-amber-100/80">
                {t('needText')}
                <textarea value={needForm.task_text} onChange={e => setNeedField('task_text', e.target.value)} rows={4} placeholder={t('needTextPlaceholder')} className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              </label>
              {!editingNeedId && (
                <label className="mt-3 block text-xs text-amber-100/80">
                  {t('extraEarlyHours')}
                  <select value={needForm.early_hours} onChange={e => setNeedField('early_hours', Number(e.target.value))} className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100">
                    <option value={0}>0</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={6}>6</option>
                    <option value={12}>12</option>
                  </select>
                  {t('extraEarlyHoursHelp') && <span className="mt-1 block text-[11px] text-amber-100/70">{t('extraEarlyHoursHelp')}</span>}
                  {Number(needForm.early_hours) > 0 && (
                    <span className="mt-1 block text-[11px] text-amber-50">
                      {liveThreshold == null
                        ? t('extraEarlyNoneYet')
                        : `${t('extraEarlyNow')}: ${earlyNames.join(', ') || '—'}`}
                    </span>
                  )}
                </label>
              )}
              <button type="submit" disabled={saving} className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 font-semibold text-slate-950 disabled:bg-slate-700 disabled:text-slate-200">
                {saving ? '...' : (editingNeedId ? t('needUpdate') : t('needCreate'))}
              </button>
              {(editingNeedId || duplicatingNeed) && (
                <button type="button" onClick={resetNeedForm} className="mt-2 w-full rounded-xl bg-slate-800 px-4 py-3 font-semibold text-slate-100">
                  {t('cancel')}
                </button>
              )}
            </form>
          )}

          {isAdmin && pendingApprovals.length > 0 && (
            <div className="rounded-[1.75rem] border border-amber-300/30 bg-slate-950/70 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-200">{t('planApprovals')}</p>
              <div className="mt-3 space-y-3">
                {pendingApprovals.map(row => (
                  <div key={row.id} className="rounded-2xl bg-slate-900 p-3">
                    <p className="font-semibold text-white">{workerName(row.worker_id)}</p>
                    <p className="text-xs text-slate-300">{formatJobWhen(row.job)} · {row.job.location_text || row.job.object_name}</p>
                    {busyElsewhere(row.job.work_date, row.job.id).has(row.worker_id) && (
                      <p className="mt-1 text-xs font-semibold text-amber-200">{t('planBusyWarning')}</p>
                    )}
                    {absenceOnDate(absences, row.worker_id, row.job.work_date) && (
                      <p className="mt-1 text-xs font-semibold text-rose-200">{t('absenceBlocked')}</p>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => handleDecision(row.id, 'approved')} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
                        {t('planApprove')}
                      </button>
                      <button type="button" onClick={() => handleDecision(row.id, 'rejected')} className="rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold text-white">
                        {t('planReject')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {listedOpenJobs.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-center text-slate-400">
              {t('openPostsEmpty')}
            </div>
          ) : listedOpenJobs.map(job => {
            const mine = myOpenRow(job)
            const going = openGoingNames(job)
            const remaining = Math.max(0, (job.needed_count ?? 1) - (job.filled_count ?? 0))
            const publicAt = job.public_at ? DateTime.fromISO(job.public_at).setZone('Europe/Berlin') : null
            const earlyWindow = publicAt?.isValid && publicAt > DateTime.now().setZone('Europe/Berlin')
            return (
              <article key={job.id} className="rounded-3xl border border-amber-300/25 bg-amber-400/10 p-5 shadow-lg shadow-amber-950/20">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-200">{t('needBadge')}</p>
                  <span className="rounded-full bg-slate-950/60 px-2 py-1 text-[10px] font-semibold text-amber-100">
                    {remaining} {t('needLeft')}
                  </span>
                </div>
                {earlyWindow && (
                  <p className="mt-2 text-xs font-semibold text-amber-100">
                    {isAdmin
                      ? `${t('extraPublicAt')}: ${publicAt.toFormat('dd.MM.yyyy, HH:mm')}`
                      : t('extraEarlyBadge')}
                  </p>
                )}
                <h3 className="mt-2 text-xl font-black text-white">{job.location_text || job.object_name || t('planNoPlace')}</h3>
                <p className="mt-1 text-sm font-semibold text-amber-100">{formatJobWhen(job)}</p>
                {mapsHref(job) && (
                  <a href={mapsHref(job)} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-semibold text-amber-100 underline">
                    {t('planMaps')}
                  </a>
                )}
                {job.task_text && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-amber-50">{job.task_text}</p>}
                {going.length > 0 && (
                  <p className="mt-3 text-sm font-semibold text-emerald-100">
                    {t('openPostGoing').replace('{names}', going.join(', '))}
                  </p>
                )}
                {isAdmin && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => startEditNeed(job)} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white">{t('edit')}</button>
                    <button type="button" onClick={() => startDuplicateNeed(job)} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white">{t('planCopy')}</button>
                    <button type="button" onClick={() => handleCancelJob(job)} className="col-span-2 rounded-md bg-rose-500/20 px-3 py-2 text-sm font-semibold text-rose-100">{t('planCancel')}</button>
                  </div>
                )}
                {absenceOnDate(absences, currentWorker?.id, job.work_date) && !['assigned', 'approved', 'pending'].includes(mine?.status) ? (
                  <div className="mt-3 rounded-md bg-rose-500/20 px-3 py-2 text-center text-sm font-semibold text-rose-100">{t('absenceBlockedApply')}</div>
                ) : currentWorker?.id && !officeSelf ? (
                  <div className="mt-3">
                    <OpenPostActions
                      t={t}
                      answer={openPostAnswer(mine)}
                      busy={confirmingId === job.id}
                      onChoose={(choice) => handleHelpRespond(job, choice)}
                    />
                  </div>
                ) : null}
              </article>
            )
          })}
        </>
      )}

      {view === 'history' && isAdmin && (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-200">{t('history')}</p>
            <h3 className="mt-1 text-xl font-black text-white">{t('historyTitle')}</h3>
            {t('historyHint') && <p className="mt-2 text-sm text-slate-400">{t('historyHint')}</p>}
          </div>
          <input
            value={historySearch}
            onChange={e => {
              setHistorySearch(e.target.value)
              setHistoryWorkerId('')
            }}
            placeholder={t('historySearchPerson')}
            className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm text-slate-100 ring-1 ring-cyan-300/20"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField
              label={t('historyFrom')}
              value={historyFrom}
              onChange={setHistoryFrom}
            />
            <DateField
              label={t('historyTo')}
              value={historyTo}
              onChange={setHistoryTo}
            />
            <label className="text-xs text-slate-400">
              {t('object')}
              <select value={historyObjectId} onChange={e => setHistoryObjectId(e.target.value)} className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="">{t('historyAllObjects')}</option>
                {objects.map(object => (
                  <option key={object.id} value={object.id}>{object.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              {t('workers')}
              <select value={historyWorkerId} onChange={e => { setHistoryWorkerId(e.target.value); setHistorySearch('') }} className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="">{t('historyAllWorkers')}</option>
                {activeWorkers.filter(worker => !hideOwnerPlan || !ownerIds.has(worker.id)).map(worker => (
                  <option key={worker.id} value={worker.id}>{worker.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHistoryTab('worked')}
              className={`rounded-md px-3 py-2 text-sm ${historyTab === 'worked' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}
            >
              {t('historyWorked')}
            </button>
            <button
              type="button"
              onClick={() => setHistoryTab('absent')}
              className={`rounded-md px-3 py-2 text-sm ${historyTab === 'absent' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}
            >
              {t('historyDidNotWork')}
            </button>
            <button
              type="button"
              onClick={() => setHistoryTab('extras')}
              className={`rounded-md px-3 py-2 text-sm ${historyTab === 'extras' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}
            >
              {t('extraYear')}
            </button>
          </div>
          {historyTab === 'extras' && (
            <label className="block text-xs text-slate-400">
              {t('extraYear')}
              <select value={extraYear} onChange={e => setExtraYear(Number(e.target.value))} className="mt-1 w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-100">
                {[currentYear, currentYear - 1, currentYear - 2].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
          )}
          {historyTab === 'extras' ? (
            <div className="space-y-3">
              {t('extraHint') && <p className="text-sm text-slate-400">{t('extraHint')}</p>}
              {extraRanking.length === 0 ? (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-center text-slate-400">{t('extraEmpty')}</div>
              ) : extraRanking.map((row, index) => (
                <article key={row.worker.id} className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-200">{index + 1}</p>
                      <h3 className="mt-1 text-xl font-black text-white">{row.worker.name}</h3>
                    </div>
                    <p className="text-sm font-semibold text-cyan-100">{row.count} {t('extraCount')}</p>
                  </div>
                  {row.early && <p className="mt-2 text-xs text-emerald-200">{t('extraEarly')}</p>}
                  {row.jobs.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {row.jobs.map(job => (
                        <p key={job.id} className="text-sm text-slate-300">
                          {formatJobWhen(job)} · {job.location_text || job.object_name || t('planNoPlace')}
                        </p>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : historyTab === 'absent' ? (
            <div className="space-y-3">
              {t('historyDidNotWorkHint') && <p className="text-sm text-slate-400">{t('historyDidNotWorkHint')}</p>}
              {historyAbsent.length === 0 ? (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-center text-slate-400">{t('historyDidNotWorkEmpty')}</div>
              ) : historyAbsent.map(worker => (
                <article key={worker.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                  <p className="text-lg font-bold text-white">{worker.name}</p>
                  <p className="text-xs text-slate-400">{t('historyAbsent')}</p>
                </article>
              ))}
            </div>
          ) : historyJobs.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-center text-slate-400">{t('historyEmpty')}</div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-200">{t('historyHoursCaption')}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {historyByPerson.map(group => (
                    <div key={group.workerId} className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-cyan-300/20 bg-slate-900/80 px-4 py-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-white">{group.workerName}</p>
                      <p className="shrink-0 text-sm font-bold tabular-nums text-cyan-100">
                        {group.minutes != null ? minutesLabel(group.minutes, t) : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              {historyJobs.map(row => (
                <article key={row.job.id} className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">{formatJobWhen(row.job)}</p>
                  <h3 className="mt-1 text-xl font-black text-white">{row.job.location_text || row.job.object_name || t('planNoPlace')}</h3>
                  <div className="mt-2 space-y-1">
                    {row.people.length === 0 ? (
                      <p className="text-sm text-slate-200">{t('workers')}</p>
                    ) : row.people.map(person => (
                      <p key={person.workerId} className="text-sm text-slate-200">
                        {person.workerName}
                        {person.range ? ` · ${person.range}` : ''}
                        {person.minutes != null ? (
                          <span className={person.changed ? 'font-semibold text-cyan-100' : ''}>
                            {` · ${minutesLabel(person.minutes, t)}`}
                          </span>
                        ) : null}
                      </p>
                    ))}
                  </div>
                  {row.job.task_text && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{row.job.task_text}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
