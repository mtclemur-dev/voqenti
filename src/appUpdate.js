const BUILD = String(import.meta.env.VITE_APP_BUILD || '')
const SEEN_KEY = 'voqenti-seen-build'
const ENTRY = '/app'

export function appHref() {
  return `${ENTRY}?t=${Date.now()}`
}

export function stripFreshParam() {
  try {
    if (!window.location.pathname.startsWith(ENTRY)) return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('t')) return
    url.searchParams.delete('t')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    /* ignore */
  }
}

export function reloadFresh() {
  window.location.replace(appHref())
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
