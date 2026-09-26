const WORK_WEEKDAYS = [1, 2, 3, 4, 5]

function asText(value) {
  return String(value || '').trim()
}

function parseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function slugId(name, used) {
  const base = asText(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item'
  let id = base
  let index = 2
  while (used.has(id)) {
    id = `${base}-${index}`
    index += 1
  }
  used.add(id)
  return id
}

function cleanDays(value) {
  const days = [...new Set((Array.isArray(value) ? value : WORK_WEEKDAYS).map(Number).filter(day => day >= 1 && day <= 7))]
    .sort((a, b) => a - b)
  return days.length ? days : [...WORK_WEEKDAYS]
}

function cleanTasks(value) {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean)
  return asText(value).split(/[,;•\n]+/).map(asText).filter(Boolean)
}

export function parseRoomLine(line) {
  const text = asText(line)
  const match = text.match(/^(.+?)\s*\((.+)\)\s*$/)
  if (match) {
    return {
      name: asText(match[1]),
      tasks: cleanTasks(match[2]),
    }
  }
  return { name: text, tasks: [] }
}

export function roomLine(room) {
  const name = asText(room?.name)
  const tasks = cleanTasks(room?.tasks).join(', ')
  if (!name) return tasks
  return tasks ? `${name} (${tasks})` : name
}

const SECTION_NAME = /^(treppenhaus|\d+\.?\s*og(?:\s+\S+)*|eg|ug|kg|erdgeschoss|dachgeschoss|sozialbereich|.+\s+bereich|aussenanlagen|au(?:ss|ß)enanlagen)$/i

function looksLikeSection(line) {
  const text = asText(line)
  if (!text || text.includes('(') || text.length > 48) return false
  if (SECTION_NAME.test(text)) return true
  return text === text.toUpperCase() && /[A-ZÄÖÜ]/.test(text) && !/[.!?]$/.test(text)
}

export function groupsFromText(text) {
  const lines = asText(text).split(/\n+/).map(asText).filter(Boolean)
  const groups = []
  const used = new Set()
  let current = null
  const startGroup = (name) => {
    const group = {
      id: slugId(name, used),
      name: asText(name),
      order: groups.length + 1,
      rooms: [],
    }
    groups.push(group)
    current = group
    return group
  }
  for (const line of lines) {
    if (looksLikeSection(line)) {
      startGroup(line)
      continue
    }
    const parsed = parseRoomLine(line)
    if (!parsed.name) continue
    if (!current) startGroup('')
    current.rooms.push({
      id: slugId(parsed.name, used),
      name: parsed.name,
      days: [...WORK_WEEKDAYS],
      tasks: parsed.tasks,
      order: current.rooms.length + 1,
    })
  }
  return groups.filter(group => group.name || group.rooms.length)
}

function normalizeRoom(room, order, used) {
  const name = asText(room?.name)
  const tasks = cleanTasks(room?.tasks)
  if (!name && !tasks.length) return null
  return {
    id: asText(room?.id) || slugId(name || tasks[0], used),
    name,
    days: cleanDays(room?.days),
    tasks,
    order: Number.isFinite(Number(room?.order)) ? Number(room.order) : order,
  }
}

function normalizeGroup(group, order, used) {
  const name = asText(group?.name)
  const rooms = (Array.isArray(group?.rooms) ? group.rooms : [])
    .map((room, index) => normalizeRoom(room, index + 1, used))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((room, index) => ({ ...room, order: index + 1 }))
  if (!name && !rooms.length) return null
  return {
    id: asText(group?.id) || slugId(name || 'section', used),
    name,
    order: Number.isFinite(Number(group?.order)) ? Number(group.order) : order,
    rooms,
  }
}

export function parseGroups(value) {
  const raw = parseJson(value)
  const list = Array.isArray(raw) ? raw : raw?.groups
  if (!Array.isArray(list)) return []
  const used = new Set()
  return list
    .map((group, index) => normalizeGroup(group, index + 1, used))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((group, index) => ({ ...group, order: index + 1 }))
}

export function serializeGroups(groups) {
  return parseGroups({ groups }).map(group => ({
    id: group.id,
    name: group.name,
    order: group.order,
    rooms: group.rooms.map(room => ({
      id: room.id,
      name: room.name,
      days: room.days,
      tasks: room.tasks,
      order: room.order,
    })),
  }))
}

export function emptyGroup(order = 1) {
  return {
    id: `section-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    order,
    rooms: [],
  }
}

export function emptyRoom(order = 1) {
  return {
    id: `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    days: [...WORK_WEEKDAYS],
    tasks: [],
    order,
  }
}

export function groupsFromObject(object = {}, form = {}) {
  const stored = parseGroups(form.groups ?? object.guide_json)
  if (stored.length) return stored
  const fromTurnus = parseGroups(object.turnus_json)
  if (fromTurnus.length) return fromTurnus
  const turnus = form.turnus || {}
  const raw = parseJson(object.turnus_json)
  const parts = [
    form.leistung_text ?? object.leistung_text,
    ...WORK_WEEKDAYS.map(day => turnus[day]).filter(Boolean),
    ...WORK_WEEKDAYS.map(day => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.days?.[day] : null)).filter(Boolean),
  ]
  return groupsFromText(parts.filter(Boolean).join('\n'))
}

export function groupsForDay(groups, weekday) {
  const day = Number(weekday)
  return serializeGroups(groups)
    .map(group => ({
      ...group,
      rooms: group.rooms.filter(room => !day || room.days.includes(day)),
    }))
    .filter(group => group.rooms.length)
}

export function objectHasRooms(object, form) {
  return groupsFromObject(object, form).some(group => group.rooms.length || group.name)
}

export function formatHoursWithUnit(hours) {
  const raw = asText(hours).replace(',', '.')
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return ''
  return `${String(value).replace('.', ',')} h`
}
