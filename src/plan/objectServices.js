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
    })
  }
  return list
}

export function serializeServices(list) {
  return parseServices(list).map(item => ({ id: item.id, name: item.name }))
}

export function suggestedServiceNames() {
  return [
    'Unterhaltsreinigung',
    'Glas- und Rahmenreinigung',
    'Sonderreinigung',
    'Grundreinigung',
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

export function nextServiceIdForObject(object, currentId) {
  const list = parseServices(object?.services_json ?? object?.services)
  if (!list.length) return ''
  if (currentId && list.some(item => item.id === currentId)) return currentId
  return list.length === 1 ? list[0].id : ''
}
