const BUILD = String(import.meta.env.VITE_APP_BUILD || '')
const SEEN_KEY = 'voqenti-seen-build'
const FRESH_PARAM = 'fresh'

export function stripFreshParam() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(FRESH_PARAM)) return
    url.searchParams.delete(FRESH_PARAM)
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', next || '/')
  } catch {
    /* ignore */
  }
}

export function reloadFresh() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set(FRESH_PARAM, String(Date.now()))
    window.location.replace(`${url.pathname}${url.search}${url.hash}`)
  } catch {
    window.location.href = `/?${FRESH_PARAM}=${Date.now()}`
  }
}

async function remoteBuild() {
  const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return ''
  const data = await res.json()
  return String(data?.build || '')
}

export async function watchAppVersion() {
  stripFreshParam()
  if (!BUILD) return
  const check = async () => {
    try {
      const remote = await remoteBuild()
      if (!remote || remote === BUILD) return
      if (sessionStorage.getItem(SEEN_KEY) === remote) return
      sessionStorage.setItem(SEEN_KEY, remote)
      reloadFresh()
    } catch {
      /* offline */
    }
  }
  await check()
  window.setInterval(check, 45 * 1000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}
