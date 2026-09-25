import { useState } from 'react'
import { clockPlusMinutes, formatClock, formatDisplayDate, isoDate, minutesLabel, objectFixedHoursLabel, objectFixedMinutes, selfLogMinutes } from './planUtils'
import TimeField, { ComputedEnd } from './TimeField'

const fieldClass = 'mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white'

export default function SelfWorkForm({
  t,
  language,
  today,
  date,
  objects = [],
  logs = [],
  onSave,
  onDelete,
  saving = false,
}) {
  const day = isoDate(date) || today
  const canEdit = Boolean(day && day <= today)
  const [objectId, setObjectId] = useState('')
  const [place, setPlace] = useState('')
  const [task, setTask] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const dayLogs = logs.filter(item => isoDate(item.work_date) === day)
  const selected = objects.find(item => item.id === objectId)
  const fixedMinutes = objectFixedMinutes(selected, day)
  const setStartTime = (value) => {
    setStart(value)
    if (fixedMinutes) setEnd(clockPlusMinutes(value, fixedMinutes))
  }
  const submit = async (event) => {
    event.preventDefault()
    if (!canEdit || saving) return
    const object = objects.find(item => item.id === objectId)
    const placeText = place.trim() || object?.name || ''
    if (!placeText) return alert(t('planPlaceRequired'))
    if (!formatClock(start) || !formatClock(end)) return alert(t('selfWorkTimeRequired'))
    if (!task.trim()) return alert(t('selfWorkTaskRequired'))
    const ok = await onSave?.({
      work_date: day,
      object_id: objectId || null,
      place_text: placeText,
      task_text: task.trim(),
      start_time: formatClock(start),
      end_time: formatClock(end),
    })
    if (ok !== false) {
      setTask('')
      setStart('')
      setEnd('')
    }
  }

  return (
    <section className="space-y-3 rounded-3xl border border-cyan-400/20 bg-slate-900/90 p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-200">{t('selfWorkTitle')}</h2>
        <p className="mt-1 text-sm text-slate-400">{t('selfWorkHint')}</p>
      </div>

      {dayLogs.length > 0 && (
        <ul className="space-y-2">
          {dayLogs.map(item => {
            const minutes = selfLogMinutes(item)
            const time = [formatClock(item.start_time), formatClock(item.end_time)].filter(Boolean).join(' – ')
            return (
              <li key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-3">
                <p className="text-sm font-semibold text-white">{item.place_text || t('planNoPlace')}</p>
                {item.task_text && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{item.task_text}</p>}
                <p className="mt-1 text-sm text-cyan-100">
                  {time}
                  {minutes ? ` · ${minutesLabel(minutes, t)}` : ''}
                </p>
                {canEdit && onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    className="mt-2 min-h-11 text-sm font-semibold text-rose-200 underline"
                  >
                    {t('selfWorkDelete')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canEdit ? (
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs text-slate-400">
            {t('planPlace')}
            <select
              value={objectId}
              onChange={e => {
                const id = e.target.value
                setObjectId(id)
                const object = objects.find(item => item.id === id)
                if (object?.name && !place.trim()) setPlace(object.name)
                const minutes = objectFixedMinutes(object, day)
                if (minutes && start) setEnd(clockPlusMinutes(start, minutes))
              }}
              className={fieldClass}
            >
              <option value="">{t('selfWorkPlaceFree')}</option>
              {objects.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-400">
            {t('selfWorkPlace')}
            <input
              value={place}
              onChange={e => setPlace(e.target.value)}
              placeholder={t('planPlacePlaceholder')}
              className={fieldClass}
            />
          </label>
          <label className="block text-xs text-slate-400">
            {t('selfWorkTask')}
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder={t('planTaskPlaceholder')}
              rows={3}
              className={`${fieldClass} py-2`}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TimeField label={t('planStart')} value={start} onChange={setStartTime} />
            {fixedMinutes ? (
              <ComputedEnd
                label={t('planEnd')}
                time={end}
                note={t('objectFixedEnd').replace('{hours}', objectFixedHoursLabel(selected, day))}
              />
            ) : (
              <TimeField label={t('planEnd')} value={end} onChange={setEnd} />
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="min-h-12 w-full rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white disabled:bg-slate-700"
          >
            {saving ? t('saving') : t('selfWorkAdd')}
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-400">
          {t('selfWorkFuture')}
          {day ? ` · ${formatDisplayDate(day, language)}` : ''}
        </p>
      )}
    </section>
  )
}
