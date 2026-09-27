import { useCallback, useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { supabase } from '../supabaseClient'
import { fillText, firstName, isoDate, minutesLabel } from './planUtils'
import { DEPOT_ADDRESS, ensureTravel, formatKm, travelBetweenSync } from './travel'
import FleetVehicleDialog from './FleetVehicleDialog'
import {
  VEHICLE_BASE_COLUMNS,
  VEHICLE_EXTRA_COLUMNS,
  isMissingColumn,
  isMissingTable,
  openNeeds,
  parseNeeds,
  serializeNeeds,
} from '../requests/requestTemplates'

const TUV_WARN_DAYS = 30
const SERVICE_WARN_KM = 1500

function emptyVehicle() {
  return {
    plate: '',
    name: '',
    driver_id: '',
    home_address: '',
    tuv_next: '',
    notes: '',
    odometer: '',
    odometer_date: '',
    service_km: '',
    active: true,
    needs: [],
  }
}

function workDaysFor(jobs, workerId, from, to) {
  const days = new Set()
  if (!workerId) return days
  for (const job of jobs || []) {
    const day = isoDate(job.work_date)
    if (!day || day < from || day > to) continue
    if (job.status === 'cancelled' || job.status === 'canceled') continue
    const assigned = (job.work_job_assignees ?? []).some(row => (
      row.worker_id === workerId && (!row.status || ['assigned', 'approved'].includes(row.status))
    ))
    if (assigned) days.add(day)
  }
  return days
}

function tuvInfo(next, today) {
  const due = isoDate(next)
  if (!due) return { kind: 'none', days: null }
  const left = DateTime.fromISO(due, { zone: 'Europe/Berlin' }).diff(
    DateTime.fromISO(today, { zone: 'Europe/Berlin' }),
    'days',
  ).days
  const days = Math.round(left)
  if (days < 0) return { kind: 'over', days }
  if (days <= TUV_WARN_DAYS) return { kind: 'soon', days }
  return { kind: 'ok', days }
}

function serviceInfo(item) {
  const now = Number(item.odometer)
  const due = Number(item.service_km)
  if (!Number.isFinite(now) || !Number.isFinite(due) || due <= 0) return { kind: 'none', left: null }
  const left = due - now
  if (left <= 0) return { kind: 'over', left }
  if (left <= SERVICE_WARN_KM) return { kind: 'soon', left }
  return { kind: 'ok', left }
}

function roundTrip(home) {
  const out = travelBetweenSync(home, DEPOT_ADDRESS)
  const back = travelBetweenSync(DEPOT_ADDRESS, home)
  return {
    minutes: (out.minutes || 0) + (back.minutes || 0),
    meters: (out.meters || 0) + (back.meters || 0),
  }
}

export default function FleetPanel({ t, language = 'de', workers = [], jobs = [], today }) {
  const [vehicles, setVehicles] = useState([])
  const [form, setForm] = useState(emptyVehicle)
  const [editingId, setEditingId] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [extrasReady, setExtrasReady] = useState(true)
  const [travelTick, setTravelTick] = useState(0)
  const monthStart = DateTime.fromISO(today, { zone: 'Europe/Berlin' }).startOf('month').toISODate()
  const monthEnd = DateTime.fromISO(today, { zone: 'Europe/Berlin' }).endOf('month').toISODate()

  const load = useCallback(async () => {
    setLoading(true)
    const full = `${VEHICLE_BASE_COLUMNS}, ${VEHICLE_EXTRA_COLUMNS}`
    let { data, error } = await supabase.from('vehicles').select(full).order('plate')
    if (error && (isMissingColumn(error) || /odometer|service_km|active/i.test(error.message || ''))) {
      setExtrasReady(false)
      const fallback = await supabase.from('vehicles').select(VEHICLE_BASE_COLUMNS).order('plate')
      data = fallback.data
      error = fallback.error
    } else if (!error) {
      setExtrasReady(true)
    }
    setLoading(false)
    if (error) {
      if (isMissingTable(error)) {
        setMessage(t('fleetSetup'))
        return
      }
      setMessage(error.message)
      return
    }
    setMessage('')
    setVehicles((data || []).map(item => ({
      ...item,
      active: item.active !== false,
      needs: parseNeeds(item.needs_json),
    })))
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const homes = [...new Set(
      vehicles
        .filter(item => item.driver_id && String(item.home_address || '').trim())
        .map(item => String(item.home_address).trim()),
    )]
    if (!homes.length) return undefined
    let cancelled = false
    Promise.all(homes.flatMap(home => [ensureTravel(home, DEPOT_ADDRESS), ensureTravel(DEPOT_ADDRESS, home)]))
      .then(() => {
        if (!cancelled) setTravelTick(current => current + 1)
      })
    return () => { cancelled = true }
  }, [vehicles])

  const people = useMemo(
    () => [...workers].filter(item => item?.id && item.active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [workers],
  )
  const nameOf = useCallback((id) => people.find(item => item.id === id)?.name || '', [people])

  const rows = useMemo(() => vehicles.map((item) => {
    void travelTick
    const days = item.driver_id ? workDaysFor(jobs, item.driver_id, monthStart, monthEnd) : new Set()
    const trip = item.driver_id && item.home_address ? roundTrip(item.home_address) : { minutes: 0, meters: 0 }
    const todayOn = Boolean(item.driver_id && days.has(today))
    const open = openNeeds(item.needs)
    const tuv = tuvInfo(item.tuv_next, today)
    const service = serviceInfo(item)
    const repair = open.some(need => need.category === 'repair' || need.priority === 'high')
    return {
      ...item,
      driverName: firstName(nameOf(item.driver_id)) || nameOf(item.driver_id),
      tuv,
      service,
      openCount: open.length,
      repair,
      dayCount: days.size,
      todayTrip: todayOn ? trip : { minutes: 0, meters: 0 },
      monthTrip: {
        minutes: trip.minutes * days.size,
        meters: trip.meters * days.size,
      },
    }
  }), [jobs, monthEnd, monthStart, nameOf, today, travelTick, vehicles])

  const alerts = rows.filter(item => item.tuv.kind === 'over' || item.tuv.kind === 'soon')

  const startCreate = () => {
    setEditingId('')
    setForm(emptyVehicle())
    setDialogOpen(true)
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    setForm({
      plate: item.plate || '',
      name: item.name || '',
      driver_id: item.driver_id || '',
      home_address: item.home_address || '',
      tuv_next: isoDate(item.tuv_next),
      notes: item.notes || '',
      odometer: item.odometer ?? '',
      odometer_date: isoDate(item.odometer_date),
      service_km: item.service_km ?? '',
      active: item.active !== false,
      needs: parseNeeds(item.needs),
    })
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingId('')
    setForm(emptyVehicle())
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!form.plate.trim()) return
    setBusy(true)
    const payload = {
      plate: form.plate.trim(),
      name: form.name.trim() || null,
      driver_id: form.driver_id || null,
      home_address: form.home_address.trim() || null,
      tuv_next: form.tuv_next || null,
      notes: form.notes.trim() || null,
      needs_json: serializeNeeds(form.needs),
      updated_at: new Date().toISOString(),
    }
    if (extrasReady) {
      payload.odometer = form.odometer === '' ? null : Number(form.odometer)
      payload.odometer_date = form.odometer_date || null
      payload.service_km = form.service_km === '' ? null : Number(form.service_km)
      payload.active = Boolean(form.active)
    }
    const result = editingId
      ? await supabase.from('vehicles').update(payload).eq('id', editingId)
      : await supabase.from('vehicles').insert(payload)
    setBusy(false)
    if (result.error) {
      if (isMissingTable(result.error)) {
        setMessage(t('fleetSetup'))
        return
      }
      if (isMissingColumn(result.error)) {
        setExtrasReady(false)
        setMessage(t('fleetExtrasSetup'))
        return
      }
      setMessage(result.error.message)
      return
    }
    closeDialog()
    await load()
  }

  const handleDelete = async (item) => {
    if (!item?.id) return
    if (!window.confirm(t('delete'))) return
    const { error } = await supabase.from('vehicles').delete().eq('id', item.id)
    if (error) {
      setMessage(error.message)
      return
    }
    if (editingId === item.id) closeDialog()
    await load()
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] bg-slate-900/85 p-5 ring-1 ring-slate-700">
        <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-200">{t('adminTabFleet')}</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">{t('fleetTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">{t('fleetHint')}</p>
          </div>
          <button
            type="button"
            onClick={startCreate}
            className="min-h-11 rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
          >
            {t('fleetAdd')}
          </button>
        </div>
        {message ? <p className="mt-3 text-sm text-amber-100" role="status">{message}</p> : null}

        {alerts.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">{t('fleetAlertTitle')}</p>
            <ul className="mt-2 space-y-1 text-sm text-amber-50">
              {alerts.map(item => (
                <li key={item.id}>
                  {item.plate}
                  {item.name ? ` · ${item.name}` : ''}
                  {' · '}
                  {item.tuv.kind === 'over'
                    ? t('fleetTuvOver')
                    : fillText(t('fleetTuvSoon'), { days: String(item.tuv.days) })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {loading ? (
        <p className="px-1 text-sm text-slate-400" aria-live="polite">{t('loading')}</p>
      ) : !rows.length ? (
        <p className="px-1 text-sm text-slate-400">{t('fleetEmpty')}</p>
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80">
          {rows.map(item => (
            <li key={item.id}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <p className="text-sm font-semibold text-white">{item.plate}</p>
                  {item.name ? <p className="text-sm text-slate-300">{item.name}</p> : null}
                  <p className="mt-0.5 text-sm text-slate-300">
                    {t('fleetDriver')}: {item.driverName || t('fleetNoDriver')}
                  </p>
                  <p className={`text-sm ${
                    item.tuv.kind === 'over' ? 'text-rose-100' : item.tuv.kind === 'soon' ? 'text-amber-100' : 'text-slate-400'
                  }`}>
                    {item.tuv.kind === 'over'
                      ? t('fleetTuvOver')
                      : item.tuv.kind === 'soon' || item.tuv.kind === 'ok'
                        ? fillText(t('fleetTuvInDays'), { days: String(item.tuv.days) })
                        : t('fleetTuvNone')}
                  </p>
                  {item.openCount > 0 ? (
                    <p className="text-sm text-amber-100">
                      {fillText(t('fleetOpenNeeds'), { count: String(item.openCount) })}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.active === false && <StatusChip label={t('fleetStatusOff')} tone="rose" />}
                    {item.active !== false && <StatusChip label={t('fleetStatusActive')} tone="cyan" />}
                    {!item.driver_id && <StatusChip label={t('fleetNoDriver')} tone="amber" />}
                    {item.tuv.kind === 'soon' || item.tuv.kind === 'over' ? <StatusChip label={t('fleetStatusTuv')} tone="amber" /> : null}
                    {item.service.kind === 'soon' || item.service.kind === 'over' ? <StatusChip label={t('fleetStatusService')} tone="amber" /> : null}
                    {item.repair && <StatusChip label={t('fleetStatusRepair')} tone="rose" />}
                    {!item.home_address && <StatusChip label={t('fleetNoHome')} tone="slate" />}
                  </div>
                  {item.driver_id && item.home_address && item.monthTrip.meters ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {t('fleetMonth')}: {fillText(t('fleetKm'), { km: formatKm(item.monthTrip.meters) || '0' })}
                      {item.monthTrip.minutes ? ` · ${minutesLabel(item.monthTrip.minutes, t)}` : ''}
                    </p>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  className="min-h-11 px-2 text-sm text-slate-400 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  {t('delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FleetVehicleDialog
        t={t}
        language={language}
        open={dialogOpen}
        onClose={closeDialog}
        form={form}
        setForm={setForm}
        editingId={editingId}
        people={people}
        busy={busy}
        onSave={handleSave}
        extrasReady={extrasReady}
      />
    </div>
  )
}

function StatusChip({ label, tone }) {
  const tones = {
    cyan: 'bg-cyan-500/15 text-cyan-100',
    amber: 'bg-amber-400/15 text-amber-100',
    rose: 'bg-rose-400/15 text-rose-100',
    slate: 'bg-slate-800 text-slate-300',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone] || tones.slate}`}>
      {label}
    </span>
  )
}
