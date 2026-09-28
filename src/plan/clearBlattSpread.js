import {
  clockPlusMinutes,
  formatClock,
  hundredthsToMinutes,
  objectFixedStart,
  objectTimeLocked,
  parseFixedHoursByDay,
  parseFixedHoursValue,
  parseFixedStartByDay,
  parseTurnus,
  rangeDurationMinutes,
  serializeFixedHoursJson,
  serializeTurnus,
  weekdayFromDate,
} from './planUtils.js'
import { isBlattBody, isBlattImage } from './turnusSheet.js'

const SHEET_HOURS = 5
const SHEET_MINUTES = 300

function hourMap(object) {
  return { ...parseFixedHoursByDay(object?.fixed_hours_json) }
}

function stripAgentHours(hours) {
  const next = { ...hours }
  if (next[1] === SHEET_HOURS) delete next[1]
  const values = Object.values(next)
  if (values.length && values.every(hours => hours === SHEET_HOURS)) {
    return {}
  }
  return next
}

export function isSpreadBlattObject(object, objects = []) {
  const url = String(object?.leistung_image_url || '')
  if (isBlattImage(url)) {
    const same = objects.filter(item => item?.leistung_image_url === url).length
    if (same >= 2) return true
  }
  const turnus = parseTurnus(object?.turnus_json)
  const hasText = isBlattBody(object?.leistung_text) || Object.values(turnus).some(isBlattBody)
  if (!hasText) return false
  const same = objects.filter((item) => {
    const days = parseTurnus(item?.turnus_json)
    return isBlattBody(item?.leistung_text) || Object.values(days).some(isBlattBody)
  }).length
  return same >= 2
}

export function stripSpreadBlatt(object) {
  const turnus = parseTurnus(object?.turnus_json)
  const nextTurnus = {}
  for (const [day, body] of Object.entries(turnus)) {
    if (!isBlattBody(body)) nextTurnus[day] = body
  }
  const beforeHours = hourMap(object)
  const hours = stripAgentHours(beforeHours)
  const clearedDays = Object.keys(beforeHours)
    .map(Number)
    .filter(day => beforeHours[day] === SHEET_HOURS && hours[day] !== SHEET_HOURS)
  const next = {
    ...object,
    leistung_text: isBlattBody(object?.leistung_text) ? '' : (object?.leistung_text || ''),
    leistung_image_url: isBlattImage(object?.leistung_image_url) ? '' : (object?.leistung_image_url || ''),
    turnus_json: serializeTurnus(nextTurnus),
    fixed_hours_json: serializeFixedHoursJson(hours, {
      locked: objectTimeLocked(object),
      start: objectFixedStart(object),
      startByDay: parseFixedStartByDay(object?.fixed_hours_json),
    }),
  }
  const changed = (
    next.leistung_text !== (object?.leistung_text || '')
    || next.leistung_image_url !== (object?.leistung_image_url || '')
    || JSON.stringify(next.turnus_json) !== JSON.stringify(serializeTurnus(turnus))
    || clearedDays.length > 0
  )
  return { object: next, changed, clearedDays }
}

export function objectPayloadFromStrip(object) {
  return {
    leistung_text: object.leistung_text || null,
    leistung_image_url: object.leistung_image_url || null,
    turnus_json: object.turnus_json,
    fixed_hours_json: object.fixed_hours_json,
  }
}

function jobMinutes(job) {
  return rangeDurationMinutes({ start: job?.start_time, end: job?.end_time })
}

export function restoreMinutesForObject(object, jobs = []) {
  const fallback = hundredthsToMinutes(parseFixedHoursValue(object?.fixed_hours))
  if (fallback && fallback !== SHEET_MINUTES) return fallback
  const other = []
  for (const job of jobs) {
    if (job?.object_id !== object?.id) continue
    if (job?.status === 'cancelled' || job?.status === 'canceled') continue
    if (weekdayFromDate(job.work_date) === 1) continue
    const minutes = jobMinutes(job)
    if (minutes && minutes !== SHEET_MINUTES) other.push(minutes)
  }
  if (!other.length) return 0
  other.sort((left, right) => left - right)
  return other[Math.floor(other.length / 2)]
}

export function jobsStretchedBySheet(jobs, daysByObject, restoreByObject) {
  return (jobs || []).filter((job) => {
    const days = daysByObject.get(job?.object_id)
    if (!days?.length) return false
    if (job?.status === 'cancelled' || job?.status === 'canceled') return false
    if (!days.includes(weekdayFromDate(job.work_date))) return false
    if (jobMinutes(job) !== SHEET_MINUTES) return false
    return Boolean(restoreByObject.get(job.object_id))
  }).map((job) => {
    const start = formatClock(job.start_time)
    const minutes = restoreByObject.get(job.object_id)
    return {
      ...job,
      start_time: start || job.start_time,
      end_time: start && minutes ? clockPlusMinutes(start, minutes) : job.end_time,
    }
  })
}
