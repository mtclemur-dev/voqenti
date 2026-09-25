const memory = new Map()
const GEO_KEY = 'voqenti-geo-v1'
const ROUTE_KEY = 'voqenti-route-v1'

function readStore(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota */
  }
}

function normalizePlace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function cacheGet(map, storeKey, key) {
  if (!key) return null
  if (map.has(key)) return map.get(key)
  const stored = readStore(storeKey)[key]
  if (stored) map.set(key, stored)
  return stored || null
}

function cacheSet(map, storeKey, key, value) {
  map.set(key, value)
  writeStore(storeKey, { ...readStore(storeKey), [key]: value })
}

function haversineMeters(from, to) {
  const toRad = value => value * Math.PI / 180
  const earth = 6371000
  const dLat = toRad(to.lat - from.lat)
  const dLon = toRad(to.lon - from.lon)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * earth * Math.asin(Math.min(1, Math.sqrt(a))))
}

function estimateDrive(meters) {
  if (!meters) return { minutes: 0, meters: 0 }
  const city = 32 * 1000 / 60
  return { minutes: Math.max(1, Math.round(meters / city)), meters }
}

async function geocode(address) {
  const place = normalizePlace(address)
  if (!place) return null
  const cached = cacheGet(memory, GEO_KEY, place)
  if (cached) return cached
  const query = /deutschland|germany|thüringen|thueringen|\bde\b/i.test(place) ? place : `${place}, Deutschland`
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lang=de`
  const response = await fetch(url)
  if (!response.ok) return null
  const data = await response.json()
  const coords = data?.features?.[0]?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const point = { lon: Number(coords[0]), lat: Number(coords[1]) }
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null
  cacheSet(memory, GEO_KEY, place, point)
  return point
}

async function routeDrive(from, to) {
  const key = `${from.lon},${from.lat}|${to.lon},${to.lat}`
  const cached = cacheGet(memory, ROUTE_KEY, key)
  if (cached) return cached
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`
    const response = await fetch(url)
    if (response.ok) {
      const data = await response.json()
      const route = data?.routes?.[0]
      if (route) {
        const trip = {
          minutes: Math.max(1, Math.round(Number(route.duration) / 60)),
          meters: Math.max(0, Math.round(Number(route.distance) || 0)),
        }
        cacheSet(memory, ROUTE_KEY, key, trip)
        return trip
      }
    }
  } catch {
    /* use estimate */
  }
  const trip = estimateDrive(haversineMeters(from, to))
  cacheSet(memory, ROUTE_KEY, key, trip)
  return trip
}

export function travelKey(from, to) {
  const left = normalizePlace(from)
  const right = normalizePlace(to)
  if (!left || !right || left === right) return ''
  return `${left} → ${right}`
}

export function travelBetweenSync(from, to) {
  const key = travelKey(from, to)
  if (!key) return { minutes: 0, meters: 0 }
  const fromPoint = cacheGet(memory, GEO_KEY, normalizePlace(from))
  const toPoint = cacheGet(memory, GEO_KEY, normalizePlace(to))
  if (!fromPoint || !toPoint) return { minutes: 0, meters: 0 }
  const route = cacheGet(memory, ROUTE_KEY, `${fromPoint.lon},${fromPoint.lat}|${toPoint.lon},${toPoint.lat}`)
  return route || { minutes: 0, meters: 0 }
}

export function travelMinutesSync(from, to) {
  return travelBetweenSync(from, to).minutes || 0
}

export async function ensureTravel(from, to) {
  const key = travelKey(from, to)
  if (!key) return { minutes: 0, meters: 0 }
  const known = travelBetweenSync(from, to)
  if (known.minutes || known.meters) return known
  const [fromPoint, toPoint] = await Promise.all([geocode(from), geocode(to)])
  if (!fromPoint || !toPoint) return { minutes: 0, meters: 0 }
  return routeDrive(fromPoint, toPoint)
}

export async function ensureTravels(places) {
  const list = [...new Set((places || []).map(normalizePlace).filter(Boolean))]
  for (let index = 0; index < list.length; index += 1) {
    if (!cacheGet(memory, GEO_KEY, list[index])) {
      await geocode(list[index])
      if (index < list.length - 1) await new Promise(resolve => setTimeout(resolve, 220))
    }
  }
  const trips = []
  const allPairs = list.length <= 16
  for (let left = 0; left < list.length; left += 1) {
    for (let right = 0; right < list.length; right += 1) {
      if (left === right) continue
      if (!allPairs && Math.abs(left - right) !== 1) continue
      trips.push(ensureTravel(list[left], list[right]))
    }
  }
  await Promise.all(trips)
}

export async function ensureDayTravels(jobs, objects = []) {
  const byId = new Map((objects || []).filter(item => item?.id).map(item => [item.id, item]))
  const places = []
  for (const job of jobs || []) {
    const address = jobPlaceAddress(job, byId.get(job.object_id))
    if (address) places.push(address)
  }
  await ensureTravels(places)
}

export function formatKm(meters) {
  const km = Math.max(0, Number(meters) || 0) / 1000
  if (!km) return ''
  return km >= 10 ? String(Math.round(km)) : km.toFixed(1).replace('.', ',')
}

export function jobPlaceAddress(job, object) {
  return normalizePlace(object?.address || job?.location_text || job?.object_name || '')
}
