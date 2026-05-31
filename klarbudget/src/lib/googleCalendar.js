const GOOGLE_IDENTITY_SRC = 'https://accounts.google.com/gsi/client'
const CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList'
const CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars'

export const googleCalendarConfig = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '11967707869-bv4pp2o2akfp35vf6n9rdgf4fvg1apns.apps.googleusercontent.com',
  scope: import.meta.env.VITE_GOOGLE_CALENDAR_SCOPE || 'https://www.googleapis.com/auth/calendar.readonly',
}

export const hasGoogleCalendarConfig = Boolean(googleCalendarConfig.clientId)

export function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_IDENTITY_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', reject, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = GOOGLE_IDENTITY_SRC
    script.async = true
    script.defer = true
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export async function requestGoogleCalendarToken() {
  await loadGoogleIdentityScript()

  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: googleCalendarConfig.clientId,
      scope: googleCalendarConfig.scope,
      prompt: '',
      callback: (response) => {
        if (response.error) reject(new Error(response.error_description || response.error))
        else resolve(response.access_token)
      },
      error_callback: (error) => {
        reject(new Error(error?.message || error?.type || 'Google OAuth popup error'))
      },
    })

    tokenClient.requestAccessToken()
  })
}

export async function fetchGoogleCalendarEvents(accessToken, { timeMin, timeMax }) {
  const calendars = await fetchGoogleCalendars(accessToken)
  const visibleCalendars = calendars.length > 0 ? calendars : [{ id: 'primary', summary: 'Google Calendar', primary: true }]

  const eventLists = await Promise.all(visibleCalendars.map(async (calendar) => {
    try {
      return await fetchCalendarEvents(accessToken, calendar, { timeMin, timeMax })
    } catch {
      return []
    }
  }))

  return eventLists.flat().sort((a, b) => a.startDate - b.startDate)
}

async function fetchGoogleCalendars(accessToken) {
  const params = new URLSearchParams({
    minAccessRole: 'reader',
    showDeleted: 'false',
    showHidden: 'false',
    maxResults: '50',
  })

  const response = await fetch(`${CALENDAR_LIST_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) throw new Error(`Google Calendar list error ${response.status}`)
  const data = await response.json()
  return (data.items || [])
    .filter((calendar) => calendar.selected !== false)
    .map((calendar) => ({
      id: calendar.id,
      summary: calendar.summary || 'Google Calendar',
      primary: Boolean(calendar.primary),
    }))
}

async function fetchCalendarEvents(accessToken, calendar, { timeMin, timeMax }) {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: '100',
  })

  const calendarId = encodeURIComponent(calendar.id)
  const response = await fetch(`${CALENDAR_EVENTS_URL}/${calendarId}/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) throw new Error(`Google Calendar error ${response.status}`)
  const data = await response.json()
  return (data.items || []).map((event) => normalizeGoogleEvent(event, calendar))
}

function normalizeGoogleEvent(event, calendar) {
  const startValue = event.start?.dateTime || event.start?.date
  const endValue = event.end?.dateTime || event.end?.date
  const startDate = new Date(startValue)
  const endDate = endValue ? new Date(endValue) : null

  return {
    id: `${calendar.id}:${event.id}`,
    calendarId: calendar.id,
    calendarName: calendar.summary,
    source: 'google',
    title: event.summary || 'Google Calendar',
    description: event.description || '',
    location: event.location || '',
    startDate,
    endDate,
    allDay: Boolean(event.start?.date),
    category: classifyGoogleEvent(event.summary || ''),
  }
}

export function classifyGoogleEvent(title) {
  const clean = title.toLowerCase()
  if (/(tüv|tuv|auto|werkstatt|reifen)/i.test(clean)) return 'Mașină'
  if (/(steuer|finanzamt|tax)/i.test(clean)) return 'Taxe'
  if (/(arzt|termin|zahnarzt|medic|doctor)/i.test(clean)) return 'Sănătate'
  if (/(schule|kindergarten|hort|școal|scoal|grădini|gradini)/i.test(clean)) return 'Familie'
  if (/(haus|heizung|strom|gas|wasser|casă|casa|apă|apa)/i.test(clean)) return 'Casă'
  return 'Google Calendar'
}
