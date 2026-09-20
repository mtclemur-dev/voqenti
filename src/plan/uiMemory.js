const KEY = 'voqenti-ui'
export const APP_VIEWS = ['plan', 'mine', 'hours', 'openPosts', 'notices', 'guides', 'history', 'pontaj', 'reports', 'times', 'materials']
export const ADMIN_TABS = ['board', 'people', 'places', 'invite']
export const HISTORY_TABS = ['worked', 'absent', 'extras']
export const ROSTER_FILTERS = ['free', 'working', 'off']

export function readUiMemory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writeUiMemory(patch) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readUiMemory(), ...patch }))
  } catch {
    /* ignore */
  }
}

export function isoDateOr(value, fallback) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback
}

export function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

export function stringOr(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}
