function newServiceId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function asList(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      return asList(JSON.parse(value))
    } catch {
      return []
    }
  }
  if (typeof value === 'object' && Array.isArray(value.items)) return value.items
  return []
}

function parseHoursAmount(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0
  const amount = Number(String(value).trim().replace(',', '.'))
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function parseStartMap(value) {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      return parseStartMap(JSON.parse(value))
    } catch {
      return {}
    }
  }
  const map = {}
  const rows = Array.isArray(value)
    ? value.map(item => [item?.weekday ?? item?.day, item?.start || item?.from])
    : Object.entries(value)
  for (const [key, raw] of rows) {
    const day = Number(key)
    const start = String(raw || '').trim().slice(0, 5)
    if (day < 1 || day > 7 || !/^\d{2}:\d{2}$/.test(start)) continue
    map[day] = start
  }
  return map
}

function parseHoursByDay(value) {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      return parseHoursByDay(JSON.parse(value))
    } catch {
      return {}
    }
  }
  const map = {}
  const rows = Array.isArray(value)
    ? value.map(item => [item?.weekday ?? item?.day, item?.hours])
    : Object.entries(value)
  for (const [key, hours] of rows) {
    const day = Number(key)
    if (day < 1 || day > 7) continue
    if (hours == null || hours === '') continue
    map[day] = String(hours)
  }
  return map
}

export function parseServices(value) {
  const seen = new Set()
  const list = []
  for (const item of asList(value)) {
    const name = String(item?.name || item?.label || item || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    list.push({
      id: String(item?.id || newServiceId()),
      name,
      hours: item?.hours != null && item.hours !== '' ? String(item.hours) : '',
      hours_by_day: parseHoursByDay(item?.hours_by_day || item?.days),
      start_by_day: parseStartMap(item?.start_by_day || item?.starts),
      locked: Boolean(item?.locked || item?.time_locked),
      start: String(item?.start || item?.from || '').trim(),
    })
  }
  return list
}

export function serializeServices(list) {
  return parseServices(list).map(item => {
    const hours = parseHoursAmount(item.hours)
    const hours_by_day = {}
    for (const [day, raw] of Object.entries(item.hours_by_day || {})) {
      const amount = parseHoursAmount(raw)
      if (amount) hours_by_day[Number(day)] = amount
    }
    const start_by_day = parseStartMap(item.start_by_day)
    return {
      id: item.id,
      name: item.name,
      ...(hours ? { hours } : {}),
      ...(Object.keys(hours_by_day).length ? { hours_by_day } : {}),
      ...(Object.keys(start_by_day).length ? { start_by_day } : {}),
      ...(item.locked ? { locked: true } : {}),
      ...(item.start ? { start: item.start } : {}),
    }
  })
}

export function suggestedServiceNames() {
  return [
    'Unterhaltsreinigung',
    'Glas- und Rahmenreinigung',
    'Sonderreinigung',
    'Grundreinigung',
    'Industriereinigung',
  ]
}

export function serviceOf(object, serviceId, fallbackName = '') {
  const list = parseServices(object?.services_json ?? object?.services)
  return list.find(item => item.id === serviceId)
    || list.find(item => item.name === fallbackName)
    || (fallbackName ? { id: serviceId || '', name: fallbackName } : null)
}

export function serviceLabel(job, object) {
  return serviceOf(object, job?.service_id, job?.service_name)?.name || String(job?.service_name || '').trim()
}

export function jobServiceKey(job) {
  return String(job?.service_id || job?.service_name || '').trim().toLowerCase()
}

export function serviceFilterKey(service) {
  return String(service?.id || service?.name || '').trim().toLowerCase()
}

export function serviceHasHours(service) {
  if (!service) return false
  if (parseHoursAmount(service.hours)) return true
  return Object.values(service.hours_by_day || {}).some(value => parseHoursAmount(value))
}

export function jobMatchesServiceKey(job, object, key) {
  const wanted = String(key || '').trim().toLowerCase()
  if (!wanted) return true
  if (String(job?.service_id || '').trim().toLowerCase() === wanted) return true
  const name = serviceLabel(job, object).trim().toLowerCase()
  if (name === wanted) return true
  const service = parseServices(object?.services_json ?? object?.services).find(item => (
    item.id === key
    || item.id.toLowerCase() === wanted
    || item.name.toLowerCase() === wanted
  ))
  if (!service) return false
  return String(job?.service_id || '') === service.id
    || name === service.name.toLowerCase()
}

export function collectServiceOptions(objects, jobs = []) {
  const seen = new Map()
  const add = (service, object) => {
    const name = String(service?.name || '').trim()
    if (!name) return
    const key = serviceFilterKey(service) || name.toLowerCase()
    const alias = name.toLowerCase()
    if (seen.has(key) || seen.has(alias)) return
    seen.set(key, { key, name, objectId: object?.id || '' })
    seen.set(alias, seen.get(key))
  }
  for (const object of objects || []) {
    for (const service of parseServices(object?.services_json ?? object?.services)) add(service, object)
  }
  for (const job of jobs || []) {
    const object = (objects || []).find(item => item.id === job.object_id)
    const name = serviceLabel(job, object)
    if (!name) continue
    add({ id: job.service_id || name.toLowerCase(), name }, object)
  }
  const unique = new Map()
  for (const item of seen.values()) {
    const nameKey = item.name.toLowerCase()
    if (!unique.has(nameKey)) unique.set(nameKey, item)
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export function nextServiceIdForObject(object, currentId) {
  const list = parseServices(object?.services_json ?? object?.services)
  if (!list.length) return ''
  if (currentId && list.some(item => item.id === currentId)) return currentId
  return list.length === 1 ? list[0].id : ''
}
