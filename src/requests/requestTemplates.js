export const materialRequestTemplates = [
  'Mopps',
  'Tücher',
  'Müllbeutel',
  'Toilettenpapier',
  'Papierhandtücher',
  'Seife',
  'Reinigungsmittel',
  'Handschuhe',
]

export const REQUEST_CATEGORIES = ['material', 'damage', 'safety', 'question', 'vehicle', 'other']
export const REQUEST_STATUSES = ['new', 'seen', 'in_progress', 'resolved', 'rejected']
export const OPEN_REQUEST_STATUSES = ['new', 'seen', 'in_progress']

export const NEED_CATEGORIES = ['tires', 'oil', 'inspection', 'repair', 'cleaning', 'documents', 'other']
export const NEED_STATUSES = ['open', 'in_progress', 'done']
export const NEED_PRIORITIES = ['normal', 'high']

export const REQUEST_COLUMNS = [
  'id',
  'object_id',
  'work_job_id',
  'vehicle_id',
  'worker_id',
  'category',
  'message',
  'quantity',
  'needed_by',
  'priority',
  'status',
  'office_reply',
  'replied_by_user_id',
  'replied_at',
  'resolved_by_user_id',
  'resolved_at',
  'created_at',
].join(', ')

export const VEHICLE_BASE_COLUMNS = 'id, plate, name, driver_id, home_address, tuv_last, tuv_next, notes, needs_json'
export const VEHICLE_EXTRA_COLUMNS = 'odometer, odometer_date, service_km, active'

export function isMissingTable(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === '42P01'
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('relation')
}

export function isMissingColumn(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('column') && (message.includes('does not exist') || message.includes('schema cache'))
}

export function emptyNeed() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category: 'other',
    description: '',
    priority: 'normal',
    due: '',
    km: '',
    status: 'open',
  }
}

export function parseNeeds(value) {
  const list = Array.isArray(value) ? value : []
  return list
    .map((item) => {
      const description = String(item?.description || item?.text || '').trim()
      if (!description) return null
      const status = NEED_STATUSES.includes(item?.status)
        ? item.status
        : (item?.done ? 'done' : 'open')
      return {
        id: String(item?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
        category: NEED_CATEGORIES.includes(item?.category) ? item.category : 'other',
        description,
        priority: NEED_PRIORITIES.includes(item?.priority) ? item.priority : 'normal',
        due: String(item?.due || '').slice(0, 10),
        km: item?.km === 0 || item?.km ? String(item.km) : '',
        status,
      }
    })
    .filter(Boolean)
}

export function serializeNeeds(list) {
  return parseNeeds(list).map(item => ({
    id: item.id,
    category: item.category,
    description: item.description,
    priority: item.priority,
    due: item.due || null,
    km: item.km ? Number(item.km) || null : null,
    status: item.status,
  }))
}

export function openNeeds(list) {
  return parseNeeds(list).filter(item => item.status !== 'done')
}

export function requestCategoryKey(category) {
  return ({
    material: 'requestCatMaterial',
    damage: 'requestCatDamage',
    safety: 'requestCatSafety',
    question: 'requestCatQuestion',
    vehicle: 'requestCatVehicle',
    other: 'requestCatOther',
  })[category] || 'requestCatOther'
}

export function requestStatusKey(status) {
  return ({
    new: 'requestStatusNew',
    seen: 'requestStatusSeen',
    in_progress: 'requestStatusProgress',
    resolved: 'requestStatusResolved',
    rejected: 'requestStatusRejected',
  })[status] || 'requestStatusNew'
}

export function needCategoryKey(category) {
  return ({
    tires: 'fleetNeedCatTires',
    oil: 'fleetNeedCatOil',
    inspection: 'fleetNeedCatInspection',
    repair: 'fleetNeedCatRepair',
    cleaning: 'fleetNeedCatCleaning',
    documents: 'fleetNeedCatDocuments',
    other: 'fleetNeedCatOther',
  })[category] || 'fleetNeedCatOther'
}

export function needStatusKey(status) {
  return ({
    open: 'fleetNeedOpen',
    in_progress: 'fleetNeedProgress',
    done: 'fleetNeedDone',
  })[status] || 'fleetNeedOpen'
}
