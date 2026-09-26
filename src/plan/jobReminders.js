import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

function reminderId(key) {
  let hash = 0
  for (const char of String(key)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return 200000 + (hash % 700000000)
}

function jobKeys(jobId) {
  const id = String(jobId || '')
  return [`job-${id}`, `job-${id}-soon`, `job-${id}-morning`, id]
}

function morningOf(workDate) {
  const match = String(workDate || '').match(/^(\d{4}-\d{2}-\d{2})/)
  if (!match) return null
  const morning = new Date(`${match[1]}T07:00:00`)
  return Number.isNaN(morning.getTime()) ? null : morning
}

export async function currentNotifyPermission() {
  if (Capacitor.isNativePlatform()) {
    const permission = await LocalNotifications.checkPermissions()
    return permission.display
  }
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export async function requestNotifyPermission() {
  if (Capacitor.isNativePlatform()) {
    const permission = await LocalNotifications.requestPermissions()
    return permission.display
  }
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.requestPermission()
}

export async function showJobNotice(title, body, tag) {
  if (navigator.vibrate) navigator.vibrate([120, 60, 120])
  if (Capacitor.isNativePlatform()) {
    const permission = await LocalNotifications.checkPermissions()
    if (permission.display !== 'granted') return
    await LocalNotifications.schedule({
      notifications: [{
        id: reminderId(`now-${tag}`),
        title,
        body,
        schedule: { at: new Date(Date.now() + 400) },
      }],
    })
    return
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, { body, tag: String(tag) })
  }
}

export async function scheduleUnseenReminder({ key, title, body, at }) {
  if (!Capacitor.isNativePlatform() || !at || at.getTime() <= Date.now() + 60000) return
  const permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') return
  await LocalNotifications.schedule({
    notifications: [{
      id: reminderId(key),
      title,
      body,
      schedule: { at },
    }],
  })
}

export async function cancelUnseenReminder(key) {
  if (!Capacitor.isNativePlatform()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: reminderId(key) }] })
  } catch {
    /* ignore */
  }
}

export async function scheduleJobReminders({ jobId, title, body, workDate }) {
  if (!jobId) return
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const morning = morningOf(workDate)
  await scheduleUnseenReminder({ key: `job-${jobId}-soon`, title, body, at: soon })
  if (morning && Math.abs(morning.getTime() - soon.getTime()) > 30 * 60 * 1000) {
    await scheduleUnseenReminder({ key: `job-${jobId}-morning`, title, body, at: morning })
  }
}

export async function cancelJobReminders(jobId) {
  if (!jobId) return
  await Promise.all(jobKeys(jobId).map(key => cancelUnseenReminder(key)))
}

export function reminderTime(workDate) {
  const now = Date.now()
  const twoHours = new Date(now + 2 * 60 * 60 * 1000)
  const morning = morningOf(workDate)
  if (!morning || morning.getTime() <= now) return twoHours
  return morning.getTime() < twoHours.getTime() ? morning : twoHours
}
