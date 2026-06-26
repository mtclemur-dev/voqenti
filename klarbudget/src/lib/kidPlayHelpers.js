/** Helpers for the playful kid-facing UI (no DB changes). */

export const KID_THEMES = {
  veronica: {
    className: 'kid-theme-veronica',
    emoji: '🌸',
    tagline: 'Super eroină a casei!',
  },
  robert: {
    className: 'kid-theme-robert',
    emoji: '🚀',
    tagline: 'Exploratorul galactic!',
  },
  default: {
    className: 'kid-theme-default',
    emoji: '⭐',
    tagline: 'Ești grozav!',
  },
}

const LEVEL_TITLES = ['Începător', 'Ajutor', 'Superstar', 'Campion', 'Legenda', 'Master']

export function getKidTheme(memberName = '') {
  const n = String(memberName).trim().toLowerCase()
  if (n.includes('veronica')) return KID_THEMES.veronica
  if (n.includes('robert')) return KID_THEMES.robert
  return KID_THEMES.default
}

export function getKidGreeting(memberName = '') {
  const hour = new Date().getHours()
  const hi = hour < 12 ? 'Bună dimineața' : hour < 18 ? 'Salut' : 'Bună seara'
  const first = String(memberName || 'tu').split(' ')[0]
  return `${hi}, ${first}!`
}

export function computeTotalEarned(transactions = [], walletId) {
  return transactions
    .filter((tx) => tx.wallet_id === walletId && Number(tx.amount) > 0)
    .reduce((sum, tx) => sum + Number(tx.amount), 0)
}

export function computeKidLevel(totalEarned = 0) {
  const safe = Math.max(0, totalEarned)
  const level = Math.floor(safe / 50) + 1
  const title = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)]
  const inLevel = safe % 50
  const progress = level > LEVEL_TITLES.length ? 100 : (inLevel / 50) * 100
  const coinsToNext = 50 - inLevel
  return { level, title, progress, coinsToNext: inLevel === 0 && safe > 0 ? 50 : coinsToNext }
}

export function computeStreak(transactions = [], walletId) {
  const daySet = new Set(
    transactions
      .filter((tx) => tx.wallet_id === walletId && Number(tx.amount) > 0)
      .map((tx) => String(tx.created_at || '').slice(0, 10))
      .filter(Boolean),
  )
  if (daySet.size === 0) return 0

  let streak = 0
  const cursor = new Date()
  cursor.setHours(12, 0, 0, 0)

  for (let i = 0; i < 60; i++) {
    const key = cursor.toISOString().slice(0, 10)
    if (daySet.has(key)) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
      continue
    }
    if (i === 0) {
      cursor.setDate(cursor.getDate() - 1)
      continue
    }
    break
  }
  return streak
}

export function getClosestReward(rewards = [], balance = 0) {
  const available = rewards.filter((r) => r.is_available !== false)
  if (!available.length) return null

  const sorted = [...available].sort((a, b) => Number(a.cost || 0) - Number(b.cost || 0))
  const next = sorted.find((r) => Number(r.cost || 0) > balance) || sorted[sorted.length - 1]
  const cost = Number(next.cost || 0)
  const pct = cost > 0 ? Math.min(100, Math.round((balance / cost) * 100)) : 100
  return {
    reward: next,
    canAfford: balance >= cost,
    pct,
    missing: Math.max(0, cost - balance),
  }
}

export function countOpenMissions(tasks = [], walletId, requests = []) {
  return tasks.filter(
    (task) => !requests.some(
      (r) => r.task_id === task.id && r.child_id === walletId && r.status === 'pending',
    ),
  ).length
}
