import { useEffect, useState } from 'react'
import { DateTime } from 'luxon'

export function firstName(fullName) {
  const text = String(fullName || '').trim()
  if (!text) return ''
  if (text.includes(',')) {
    const after = text.split(',')[1]?.trim()
    if (after) return after.split(/\s+/)[0]
  }
  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 1]
  return parts[0] || ''
}

export function workerInitials(name) {
  const text = String(name || '').replaceAll(',', ' ').trim()
  const parts = text.split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function greetingKey(now = DateTime.now().setZone('Europe/Berlin')) {
  const hour = now.hour
  if (hour >= 5 && hour < 12) return 'helloMorning'
  if (hour >= 12 && hour < 18) return 'helloAfternoon'
  return 'helloEvening'
}

export function useGreetingKey() {
  const [key, setKey] = useState(() => greetingKey())
  useEffect(() => {
    const tick = () => {
      const next = greetingKey()
      setKey(current => (current === next ? current : next))
    }
    tick()
    const id = setInterval(tick, 30 * 1000)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', tick)
    }
  }, [])
  return key
}

export function isoDate(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

export function formatDisplayDate(value) {
  const iso = isoDate(value)
  if (!iso) return ''
  const dt = DateTime.fromISO(iso, { zone: 'Europe/Berlin' })
  return dt.isValid ? dt.toFormat('dd.MM.yyyy') : iso
}

export function formatClock(value) {
  const text = String(value || '').slice(0, 5)
  return /^\d{2}:\d{2}$/.test(text) ? text : ''
}

export function clockMinutes(value) {
  const clock = formatClock(value)
  if (!clock) return null
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))
}

export function minutesToClock(value) {
  const wrapped = ((Number(value) % (24 * 60)) + (24 * 60)) % (24 * 60)
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

export function clockRange(start, end) {
  return { start: formatClock(start), end: formatClock(end) }
}

export function parseFixedHoursValue(value) {
  const hours = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(hours) || hours <= 0) return 0
  return Math.round(hours * 100) / 100
}

export function formatHundredths(hours) {
  const value = parseFixedHoursValue(hours)
  if (!value) return ''
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export function hundredthsToMinutes(hours) {
  const value = parseFixedHoursValue(hours)
  return value ? Math.round(value * 60) : 0
}

export function parseFixedHoursByDay(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) {
    const map = {}
    for (const [key, hours] of Object.entries(value)) {
      const day = Number(key)
      const amount = parseFixedHoursValue(hours)
      if (day >= 1 && day <= 7 && amount) map[day] = amount
    }
    return map
  }
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (Array.isArray(parsed)) {
      const map = {}
      for (const item of parsed) {
        const day = Number(item?.weekday)
        const amount = parseFixedHoursValue(item?.hours)
        if (day >= 1 && day <= 7 && amount) map[day] = amount
      }
      return map
    }
    return parseFixedHoursByDay(parsed && typeof parsed === 'object' ? parsed : {})
  } catch {
    return {}
  }
}

export function serializeFixedHoursByDay(map) {
  return TURNUS_DAYS
    .map(weekday => ({ weekday, hours: parseFixedHoursValue(map?.[weekday]) }))
    .filter(item => item.hours)
}

export function weekdayFromDate(date) {
  const iso = isoDate(date)
  const dt = iso ? DateTime.fromISO(iso, { zone: 'Europe/Berlin' }) : null
  return dt?.isValid ? dt.weekday : 0
}

export function objectFixedHours(object, date) {
  const weekday = weekdayFromDate(date)
  const byDay = parseFixedHoursByDay(object?.fixed_hours_json)
  if (weekday && byDay[weekday]) return byDay[weekday]
  return parseFixedHoursValue(object?.fixed_hours)
}

export function objectFixedMinutes(object, date) {
  return hundredthsToMinutes(objectFixedHours(object, date))
}

export function objectHasFixedHours(object) {
  return Boolean(parseFixedHoursValue(object?.fixed_hours) || serializeFixedHoursByDay(parseFixedHoursByDay(object?.fixed_hours_json)).length)
}

export function formatFixedHoursLabel(hours) {
  return formatHundredths(hours)
}

export function objectFixedHoursLabel(object, date) {
  return formatFixedHoursLabel(objectFixedHours(object, date))
}

export function formatObjectFixedSummary(object, language = 'de') {
  const map = parseFixedHoursByDay(object?.fixed_hours_json)
  const days = TURNUS_DAYS.filter(day => map[day])
  const fallback = parseFixedHoursValue(object?.fixed_hours)
  if (!days.length) return formatFixedHoursLabel(fallback)
  const same = days.every(day => map[day] === map[days[0]]) && (!fallback || fallback === map[days[0]]) && days.length === 7
  if (same) return formatFixedHoursLabel(map[days[0]])
  const parts = days.map(day => `${weekdayLabel(day, language)} ${formatFixedHoursLabel(map[day])}`)
  if (fallback && days.length < 7) parts.push(formatFixedHoursLabel(fallback))
  return parts.join(' · ')
}

export function clockPlusMinutes(start, minutes) {
  const from = clockMinutes(start)
  const add = Number(minutes)
  if (from == null || !Number.isFinite(add) || add <= 0) return ''
  return minutesToClock(from + add)
}

export function withFixedEnd(range, object, date) {
  const minutes = objectFixedMinutes(object, date)
  const start = formatClock(range?.start)
  if (!minutes) return clockRange(range?.start, range?.end)
  return { start, end: start ? clockPlusMinutes(start, minutes) : '' }
}

export function formWithFixedTimes(current, object) {
  const date = current?.work_date
  if (!objectFixedMinutes(object, date)) return current
  const job = withFixedEnd({ start: current.start_time, end: current.end_time }, object, date)
  const hours = {}
  for (const [id, range] of Object.entries(current.worker_hours || {})) {
    hours[id] = withFixedEnd(range, object, date)
  }
  return {
    ...current,
    start_time: job.start,
    end_time: job.end,
    worker_hours: hours,
  }
}

export function assignmentRange(row, job = row?.work_jobs) {
  return clockRange(row?.planned_start || job?.start_time, row?.planned_end || job?.end_time)
}

export function clockRangeLabel(range) {
  return [range?.start, range?.end].filter(Boolean).join(' – ')
}

export function rangesOverlap(left, right) {
  const leftStart = clockMinutes(left?.start)
  const leftEnd = clockMinutes(left?.end)
  const rightStart = clockMinutes(right?.start)
  const rightEnd = clockMinutes(right?.end)
  if (leftStart == null && leftEnd == null) return false
  if (rightStart == null && rightEnd == null) return false
  let fromA = leftStart ?? 0
  let toA = leftEnd ?? 24 * 60
  let fromB = rightStart ?? 0
  let toB = rightEnd ?? 24 * 60
  if (toA <= fromA) toA += 24 * 60
  if (toB <= fromB) toB += 24 * 60
  return fromA < toB && fromB < toA
}

export function spanClockRange(ranges, fallback = {}) {
  const starts = ranges.map(item => clockMinutes(item?.start)).filter(value => value != null)
  const ends = ranges.map(item => clockMinutes(item?.end)).filter(value => value != null)
  return {
    start: starts.length ? minutesToClock(Math.min(...starts)) : formatClock(fallback.start),
    end: ends.length ? minutesToClock(Math.max(...ends)) : formatClock(fallback.end),
  }
}

export function durationMinutes(date, start, end) {
  const day = isoDate(date)
  const fromClock = formatClock(start)
  const toClock = formatClock(end)
  if (!day || !fromClock || !toClock) return 0
  const from = DateTime.fromISO(`${day}T${fromClock}`, { zone: 'Europe/Berlin' })
  let to = DateTime.fromISO(`${day}T${toClock}`, { zone: 'Europe/Berlin' })
  if (!from.isValid || !to.isValid) return 0
  if (to <= from) to = to.plus({ days: 1 })
  return Math.max(0, Math.round(to.diff(from, 'minutes').minutes))
}

export function minutesLabel(minutes, t) {
  const value = Math.max(0, Number(minutes) || 0)
  const hours = Math.floor(value / 60)
  const rest = value % 60
  if (hours && rest) return t('durationHoursMinutes').replace('{hours}', String(hours)).replace('{minutes}', String(rest))
  if (hours) return t('durationHours').replace('{hours}', String(hours))
  return t('durationMinutes').replace('{minutes}', String(rest))
}

export function jobDurationLabel(job, t) {
  const minutes = durationMinutes(job?.work_date, job?.start_time, job?.end_time)
  return minutes ? minutesLabel(minutes, t) : null
}

export function jobTone(job) {
  if (job?.status === 'cancelled' || job?.status === 'canceled') return 'idle'
  const people = job?.work_job_assignees ?? []
  const active = people.filter(row => ['assigned', 'approved'].includes(row.status))
  const declined = people.some(row => row.status === 'declined')
  const needed = Math.max(Number(job?.needed_count) || 0, active.length, 1)
  if (declined) return 'problem'
  if (!active.length || active.length < needed) return 'attention'
  if (active.some(row => !row.seen_at)) return 'attention'
  if (active.length && active.every(row => row.seen_at)) return 'confirmed'
  return 'open'
}

export function marksFromJobs(jobs) {
  const marks = {}
  for (const job of jobs || []) {
    const date = isoDate(job.work_date)
    if (!date) continue
    const current = marks[date] || { jobs: false, attention: false, problem: false }
    current.jobs = true
    const cancelled = job.status === 'cancelled' || job.status === 'canceled'
    const tone = jobTone(job)
    if (cancelled || tone === 'problem') current.problem = true
    else if (tone === 'attention') current.attention = true
    marks[date] = current
  }
  return marks
}

export function rowWorkMinutes(row) {
  const job = row?.work_jobs
  const planned = assignmentRange(row, job)
  return durationMinutes(
    job?.work_date,
    row?.actual_start || planned.start || job?.start_time,
    row?.actual_end || planned.end || job?.end_time,
  )
}

export function selfLogMinutes(log) {
  return durationMinutes(log?.work_date, log?.start_time, log?.end_time)
}

export function crewAssignees(job, statuses = ['assigned', 'approved']) {
  return (job?.work_job_assignees ?? []).filter(row => statuses.includes(row.status))
}

export const OWNER_EMAIL = 'mtclemur@gmail.com'
export const PLANNER_ROLES = ['admin', 'vorarbeiter']
export const PLANNER_INVITE_ROLE = 'admin'

export function isPlannerRole(role) {
  return PLANNER_ROLES.includes(String(role || '').toLowerCase())
}

export function isOwnerWorker(worker) {
  if (!worker) return false
  if (String(worker.email || '').toLowerCase() === OWNER_EMAIL) return true
  return String(worker.name || '').toLowerCase().includes('plamadeala victor')
}

export function isOfficePlanner(worker) {
  if (!worker || isOwnerWorker(worker)) return false
  return String(worker.role || '').toLowerCase() === PLANNER_INVITE_ROLE
}

export function skipPlanNotice(worker) {
  return isOwnerWorker(worker) || isOfficePlanner(worker)
}

export function ownerWorkerIdSet(workers = []) {
  return new Set(workers.filter(isOwnerWorker).map(worker => worker.id).filter(Boolean))
}

export function jobIsOwnerPrivate(job, ownerIds) {
  if (!ownerIds?.size) return false
  const people = crewAssignees(job)
  if (!people.length) return false
  return people.every(row => ownerIds.has(row.worker_id))
}

export function formatSeenAt(value, language = 'de') {
  if (!value) return ''
  const dt = DateTime.fromISO(value, { zone: 'Europe/Berlin' }).setLocale(language)
  if (!dt.isValid) return ''
  const today = DateTime.now().setZone('Europe/Berlin')
  return dt.hasSame(today, 'day') ? dt.toFormat('HH:mm') : dt.toFormat('dd.LL, HH:mm')
}

export function formatUpdatedAt(value, language = 'de') {
  if (!value) return ''
  const dt = DateTime.fromISO(value, { zone: 'Europe/Berlin' }).setLocale(language)
  return dt.isValid ? dt.toFormat('dd.LL.yyyy, HH:mm') : ''
}

export function jobMapsHref(job, object) {
  const query = object?.address || job?.location_text || job?.object_name || object?.name
  if (!query) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`
}

export function jobPhone(object) {
  const phone = String(object?.phone || '').trim()
  return phone || null
}

export function dayStampKey(date, today) {
  const tomorrow = DateTime.fromISO(today, { zone: 'Europe/Berlin' }).plus({ days: 1 }).toISODate()
  if (date === today) return 'planToday'
  if (date === tomorrow) return 'planTomorrow'
  return null
}

export function nextShiftText(job, today, t, language, startClock) {
  if (!job) return t('nextShiftNone')
  const time = formatClock(startClock || job.start_time)
  const stamp = dayStampKey(job.work_date, today)
  if (stamp === 'planToday' && time) return t('nextShiftToday').replace('{time}', time)
  if (stamp === 'planToday') return t('nextShiftTodayNoTime')
  if (stamp === 'planTomorrow' && time) return t('nextShiftTomorrow').replace('{time}', time)
  if (stamp === 'planTomorrow') return t('nextShiftTomorrowNoTime')
  const date = formatDisplayDate(job.work_date, language)
  if (time) return t('nextShiftLater').replace('{date}', date).replace('{time}', time)
  return t('nextShiftDateOnly').replace('{date}', date)
}

export function sortPlanRows(a, b) {
  const left = `${isoDate(a?.work_jobs?.work_date)}${assignmentRange(a).start || formatClock(a?.work_jobs?.start_time)}`
  const right = `${isoDate(b?.work_jobs?.work_date)}${assignmentRange(b).start || formatClock(b?.work_jobs?.start_time)}`
  return left.localeCompare(right)
}

export function isJobCancelled(job) {
  const status = job?.status
  return status === 'cancelled' || status === 'canceled'
}

export function isAssignmentInactive(row) {
  return row?.status === 'declined' || isJobCancelled(row?.work_jobs)
}

export function isAssignmentActive(row) {
  return ['assigned', 'approved'].includes(row?.status) && !isJobCancelled(row?.work_jobs)
}

export function isJobPast(job, now) {
  const date = isoDate(job?.work_date)
  if (!date || !now) return false
  const today = now.toISODate()
  if (date < today) return true
  if (date > today) return false
  const end = formatClock(job?.end_time)
  if (!end) return false
  let to = DateTime.fromISO(`${date}T${end}`, { zone: 'Europe/Berlin' })
  if (!to.isValid) return false
  const start = formatClock(job?.start_time)
  if (start) {
    const from = DateTime.fromISO(`${date}T${start}`, { zone: 'Europe/Berlin' })
    if (from.isValid && to <= from) to = to.plus({ days: 1 })
  }
  return now >= to
}

export function pickNextActiveRow(rows, today) {
  return (rows || [])
    .filter(row => isAssignmentActive(row) && isoDate(row.work_jobs?.work_date) >= today)
    .sort(sortPlanRows)[0] || null
}

export function shortPlace(job, object) {
  const address = object?.address || job?.location_text || ''
  const city = address.split(',').map(part => part.trim()).filter(Boolean).slice(-2).join(', ')
  return city || object?.name || job?.object_name || job?.location_text || ''
}

export function fillText(template, values) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value ?? ''), template)
}

export function berlinWeekStart(value) {
  const iso = isoDate(value) || DateTime.now().setZone('Europe/Berlin').toISODate()
  const dt = DateTime.fromISO(iso, { zone: 'Europe/Berlin' })
  if (!dt.isValid) return iso
  return dt.minus({ days: dt.weekday - 1 }).toISODate()
}

export function berlinWeekDays(weekStart) {
  const start = DateTime.fromISO(berlinWeekStart(weekStart), { zone: 'Europe/Berlin' })
  return Array.from({ length: 7 }, (_, index) => start.plus({ days: index }).toISODate())
}

export function shiftIso(value, days) {
  const iso = isoDate(value) || DateTime.now().setZone('Europe/Berlin').toISODate()
  return DateTime.fromISO(iso, { zone: 'Europe/Berlin' }).plus({ days }).toISODate()
}

export function weekdayShort(value, language = 'de') {
  const iso = isoDate(value)
  if (!iso) return ''
  const dt = DateTime.fromISO(iso, { zone: 'Europe/Berlin' }).setLocale(language)
  return dt.isValid ? dt.toFormat('ccc') : ''
}

export function monthTitle(value, language = 'de') {
  const iso = isoDate(value)
  if (!iso) return ''
  const dt = DateTime.fromISO(iso, { zone: 'Europe/Berlin' }).setLocale(language)
  return dt.isValid ? dt.toFormat('LLLL yyyy') : ''
}

export function longWeekdayDate(value, language = 'de') {
  const iso = isoDate(value)
  if (!iso) return ''
  const dt = DateTime.fromISO(iso, { zone: 'Europe/Berlin' }).setLocale(language)
  return dt.isValid ? dt.toFormat('cccc, dd.LL.yyyy') : iso
}

export function isWeekend(value) {
  const iso = isoDate(value)
  if (!iso) return false
  const dt = DateTime.fromISO(iso, { zone: 'Europe/Berlin' })
  return dt.isValid && dt.weekday >= 6
}

export const WORK_WEEKDAYS = [1, 2, 3, 4, 5]
export const TURNUS_DAYS = [1, 2, 3, 4, 5, 6, 7]

export function parseTurnus(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) {
    const map = {}
    for (const [key, body] of Object.entries(value)) {
      const day = Number(key)
      if (day >= 1 && day <= 7 && String(body || '').trim()) map[day] = String(body).trim()
    }
    return map
  }
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (Array.isArray(parsed)) {
      const map = {}
      for (const item of parsed) {
        const day = Number(item?.weekday)
        const body = String(item?.body || '').trim()
        if (day >= 1 && day <= 7 && body) map[day] = body
      }
      return map
    }
    return parseTurnus(parsed && typeof parsed === 'object' ? parsed : {})
  } catch {
    return {}
  }
}

export function serializeTurnus(map) {
  return TURNUS_DAYS
    .map(weekday => ({ weekday, body: String(map?.[weekday] || '').trim() }))
    .filter(item => item.body)
}

export function objectHasGuide(object) {
  return Boolean(
    String(object?.leistung_text || '').trim()
    || object?.leistung_image_url
    || serializeTurnus(parseTurnus(object?.turnus_json)).length
  )
}

export function turnusForDate(object, date) {
  const iso = isoDate(date)
  const dt = iso ? DateTime.fromISO(iso, { zone: 'Europe/Berlin' }) : DateTime.now().setZone('Europe/Berlin')
  if (!dt.isValid) return ''
  return String(parseTurnus(object?.turnus_json)[dt.weekday] || '').trim()
}

export function weekdayLabel(weekday, language = 'de', format = 'ccc') {
  const dt = DateTime.fromObject({ weekday }, { zone: 'Europe/Berlin' }).setLocale(language)
  return dt.isValid ? dt.toFormat(format) : ''
}

export function datesInRange(from, until, weekdays = WORK_WEEKDAYS, { keepSingleIfEmpty = true } = {}) {
  const start = isoDate(from)
  if (!start) return []
  const endRaw = isoDate(until) || start
  const first = DateTime.fromISO(start, { zone: 'Europe/Berlin' })
  const last = DateTime.fromISO(endRaw < start ? start : endRaw, { zone: 'Europe/Berlin' })
  if (!first.isValid || !last.isValid) return []
  const allowed = new Set((weekdays || []).map(Number).filter(day => day >= 1 && day <= 7))
  const dates = []
  for (let day = first; day <= last; day = day.plus({ days: 1 })) {
    if (allowed.has(day.weekday)) dates.push(day.toISODate())
  }
  if (!dates.length && keepSingleIfEmpty && start === last.toISODate()) return [start]
  return dates
}

export function workdaysInRange(from, until, options = {}) {
  return datesInRange(from, until, WORK_WEEKDAYS, {
    keepSingleIfEmpty: options.keepSingleWeekend !== false,
  })
}

export const DEFAULT_VACATION_DAYS = 24

export function vacationLimit(worker) {
  const value = Number(worker?.vacation_days)
  if (Number.isFinite(value) && value > 0) return Math.min(365, Math.round(value))
  return DEFAULT_VACATION_DAYS
}

export function clipRangeToYear(start, end, year) {
  const yearStart = DateTime.fromObject({ year }, { zone: 'Europe/Berlin' }).startOf('year')
  const yearEnd = yearStart.endOf('year')
  const from = DateTime.fromISO(isoDate(start), { zone: 'Europe/Berlin' }).startOf('day')
  const to = DateTime.fromISO(isoDate(end), { zone: 'Europe/Berlin' }).startOf('day')
  if (!from.isValid || !to.isValid || to < from) return null
  const clippedStart = from < yearStart ? yearStart : from
  const clippedEnd = to > yearEnd ? yearEnd : to
  if (clippedEnd < clippedStart) return null
  return { start: clippedStart.toISODate(), end: clippedEnd.toISODate() }
}

export function vacationDaysInRange(start, end, year) {
  const clipped = clipRangeToYear(start, end, year)
  if (!clipped) return 0
  return workdaysInRange(clipped.start, clipped.end, { keepSingleWeekend: false }).length
}

export function vacationDaysUsed(absences, workerId, year, exceptId = '') {
  if (!workerId) return 0
  let used = 0
  for (const item of absences || []) {
    if (item.worker_id !== workerId || item.reason !== 'vacation') continue
    if (exceptId && item.id === exceptId) continue
    used += vacationDaysInRange(item.start_date, item.end_date, year)
  }
  return used
}

export function leaveBalance(worker, absences, year, exceptId = '') {
  const limit = vacationLimit(worker)
  const used = vacationDaysUsed(absences, worker?.id, year, exceptId)
  const left = Math.max(0, limit - used)
  return { limit, used, left, over: used > limit }
}

export function leaveRangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  const a0 = isoDate(leftStart)
  const a1 = isoDate(leftEnd)
  const b0 = isoDate(rightStart)
  const b1 = isoDate(rightEnd)
  return Boolean(a0 && a1 && b0 && b1 && a0 <= b1 && b0 <= a1)
}

export function vacationOffByDay(absences, options = {}) {
  const from = isoDate(options.from)
  const to = isoDate(options.to)
  const exceptId = options.exceptId || ''
  const exceptWorkerId = options.exceptWorkerId || ''
  const byDay = new Map()
  for (const item of absences || []) {
    if (item.reason !== 'vacation' || !item.worker_id) continue
    if (exceptId && item.id === exceptId) continue
    if (exceptWorkerId && item.worker_id === exceptWorkerId) continue
    const start = isoDate(item.start_date)
    const end = isoDate(item.end_date)
    if (!start || !end || end < start) continue
    const clipStart = from && start < from ? from : start
    const clipEnd = to && end > to ? to : end
    if (clipEnd < clipStart) continue
    for (const day of workdaysInRange(clipStart, clipEnd, { keepSingleWeekend: false })) {
      if (!byDay.has(day)) byDay.set(day, new Set())
      byDay.get(day).add(item.worker_id)
    }
  }
  return byDay
}

export function leaveOverlapPeriods(absences, options = {}) {
  const minPeople = options.minPeople || 2
  const from = isoDate(options.from) || DateTime.now().setZone('Europe/Berlin').toISODate()
  const to = isoDate(options.to) || DateTime.fromISO(from, { zone: 'Europe/Berlin' }).plus({ months: 14 }).toISODate()
  const byDay = vacationOffByDay(absences, { ...options, from, to })
  const days = [...byDay.keys()].filter(day => byDay.get(day).size >= minPeople).sort()
  const periods = []
  for (const day of days) {
    const people = byDay.get(day)
    const last = periods.at(-1)
    if (last && day === nextWeekday(last.end)) {
      last.end = day
      last.days.push(day)
      last.peak = Math.max(last.peak, people.size)
      for (const id of people) last.workerIds.add(id)
      continue
    }
    periods.push({
      start: day,
      end: day,
      days: [day],
      workerIds: new Set(people),
      peak: people.size,
    })
  }
  return periods.map(period => ({
    start: period.start,
    end: period.end,
    days: period.days,
    workerIds: [...period.workerIds],
    peak: period.peak,
    people: period.workerIds.size,
  }))
}

export function leaveBookingClash(absences, start, end, workerId = '', exceptId = '') {
  const days = workdaysInRange(start, end, { keepSingleWeekend: false })
  const byDay = vacationOffByDay(absences, {
    from: isoDate(start),
    to: isoDate(end),
    exceptId,
    exceptWorkerId: workerId,
  })
  const others = new Set()
  const clashDays = []
  let peakOthers = 0
  for (const day of days) {
    const set = byDay.get(day)
    if (!set?.size) continue
    clashDays.push(day)
    peakOthers = Math.max(peakOthers, set.size)
    for (const id of set) others.add(id)
  }
  return {
    others: [...others],
    clashDays,
    peak: others.size ? peakOthers + (workerId ? 1 : 0) : 0,
    peakOthers,
    days: days.length,
  }
}

export function leaveJobsHit(jobs, workerIds, days) {
  const daySet = new Set(days || [])
  const idSet = new Set(workerIds || [])
  if (!daySet.size || !idSet.size) return []
  const rows = []
  for (const job of jobs || []) {
    const date = isoDate(job.work_date)
    if (!date || !daySet.has(date)) continue
    const status = String(job.status || '').toLowerCase()
    if (status === 'cancelled' || status === 'canceled') continue
    const lost = (job.work_job_assignees || []).filter(row => (
      ['assigned', 'approved'].includes(row.status) && idSet.has(row.worker_id)
    ))
    if (!lost.length) continue
    rows.push({
      id: job.id,
      date,
      place: job.location_text || job.object_name || '',
      lostIds: lost.map(row => row.worker_id),
    })
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

export function leavePersonRangesInWindow(absences, workerIds, start, end) {
  const rows = []
  for (const id of workerIds || []) {
    const hits = (absences || []).filter(item => (
      item.worker_id === id
      && item.reason === 'vacation'
      && leaveRangesOverlap(item.start_date, item.end_date, start, end)
    ))
    if (!hits.length) continue
    const from = hits.map(item => isoDate(item.start_date)).filter(Boolean).sort()[0]
    const to = hits.map(item => isoDate(item.end_date)).filter(Boolean).sort().at(-1)
    if (!from || !to) continue
    rows.push({ id, start: from, end: to })
  }
  return rows
}

export function leaveOverlapCount(item, absences = []) {
  if (!item || item.reason !== 'vacation') return 0
  const others = new Set()
  for (const other of absences) {
    if (!other || other.id === item.id || other.reason !== 'vacation') continue
    if (!other.worker_id || other.worker_id === item.worker_id) continue
    if (leaveRangesOverlap(item.start_date, item.end_date, other.start_date, other.end_date)) {
      others.add(other.worker_id)
    }
  }
  return others.size
}

export function nextWeekday(value) {
  const start = isoDate(value)
  let day = (start
    ? DateTime.fromISO(start, { zone: 'Europe/Berlin' })
    : DateTime.now().setZone('Europe/Berlin')).plus({ days: 1 })
  while (day.isValid && day.weekday >= 6) day = day.plus({ days: 1 })
  return day.toISODate() || ''
}

export function dayNumber(value) {
  const iso = isoDate(value)
  if (!iso) return ''
  const dt = DateTime.fromISO(iso, { zone: 'Europe/Berlin' })
  return dt.isValid ? dt.toFormat('d') : ''
}

export function debounce(fn, wait = 400) {
  let timer = 0
  const wrapped = (...args) => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), wait)
  }
  wrapped.cancel = () => window.clearTimeout(timer)
  return wrapped
}
