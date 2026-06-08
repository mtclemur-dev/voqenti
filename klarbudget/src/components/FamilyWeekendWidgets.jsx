import { useEffect, useMemo, useState } from 'react'
import { formatMoney, isoDate, toNumber } from '../lib/finance'

const WEEKEND_STORAGE_KEY = 'klarbudget-family-weekend-ideas'
const TRASH_STORAGE_KEY = 'klarbudget-family-trash-schedule'

const weekendCategories = ['Familie', 'Casa', 'Copii', 'Relaxare', 'Cumparaturi', 'Bani']
const weekendStatuses = [
  ['idea', 'idee'],
  ['main', 'plan principal'],
  ['backup', 'rezerva'],
  ['done', 'finalizat'],
  ['cancelled', 'anulat'],
]

const trashTypes = [
  {
    id: 'yellow',
    label: 'Gelbe Tonne',
    hint: 'Folie, plastic, ambalaje',
    icon: '●',
    className: 'trash-yellow',
  },
  {
    id: 'blue',
    label: 'Blaue Tonne',
    hint: 'Hârtie și carton',
    icon: '●',
    className: 'trash-blue',
  },
  {
    id: 'black',
    label: 'Schwarze Tonne',
    hint: 'Resturi / Restmüll',
    icon: '●',
    className: 'trash-black',
  },
]

const trashFrequencies = [
  ['weekly', 'saptamanal'],
  ['biweekly', 'la 2 saptamani'],
  ['monthly', 'lunar'],
  ['manual', 'manual'],
]

function readJson(key, fallback) {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function defaultTrashRows() {
  return trashTypes.map((type) => ({
    id: type.id,
    type: type.id,
    nextDate: '',
    frequency: 'manual',
    active: true,
    completedAt: '',
  }))
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

function addMonths(dateValue, months) {
  const date = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  date.setMonth(date.getMonth() + months)
  return isoDate(date)
}

function daysUntil(dateValue) {
  if (!dateValue) return null
  const today = new Date(`${isoDate(new Date())}T12:00:00`)
  const target = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(target.getTime())) return null
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function relativeTrashDate(dateValue) {
  const diff = daysUntil(dateValue)
  if (diff === null) return 'Data nesetata'
  if (diff < 0) return `Intarziat cu ${Math.abs(diff)} zile`
  if (diff === 0) return 'Azi'
  if (diff === 1) return 'Maine'
  return `Peste ${diff} zile`
}

function trashMeta(row) {
  return trashTypes.find((type) => type.id === row.type) || trashTypes[0]
}

function nextDateForFrequency(dateValue, frequency) {
  if (frequency === 'weekly') return addDays(dateValue, 7)
  if (frequency === 'biweekly') return addDays(dateValue, 14)
  if (frequency === 'monthly') return addMonths(dateValue, 1)
  return ''
}

function newWeekendIdea() {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
    title: '',
    description: '',
    category: 'Familie',
    estimatedCost: '',
    duration: '',
    proposedBy: 'Victor',
    status: 'idea',
  }
}

export function FamilyWeekendWidgets({ currency = 'EUR', language = 'ro' }) {
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'
  const [ideas, setIdeas] = useState(() => readJson(WEEKEND_STORAGE_KEY, []))
  const [trashRows, setTrashRows] = useState(() => readJson(TRASH_STORAGE_KEY, defaultTrashRows()))
  const [form, setForm] = useState(() => newWeekendIdea())
  const [showForm, setShowForm] = useState(false)
  const [showIdeas, setShowIdeas] = useState(false)
  const [showTrashSettings, setShowTrashSettings] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => writeJson(WEEKEND_STORAGE_KEY, ideas), [ideas])
  useEffect(() => writeJson(TRASH_STORAGE_KEY, trashRows), [trashRows])

  const mainPlan = ideas.find((idea) => idea.status === 'main')
  const backupPlan = ideas.find((idea) => idea.status === 'backup')
  const visibleIdeas = ideas.filter((idea) => idea.status !== 'cancelled')
  const upcomingTrash = useMemo(() => (
    trashRows
      .filter((row) => row.active && row.nextDate)
      .map((row) => ({ ...row, diff: daysUntil(row.nextDate), meta: trashMeta(row) }))
      .filter((row) => row.diff !== null)
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 2)
  ), [trashRows])

  const saveIdea = (event) => {
    event.preventDefault()
    if (!form.title.trim()) return
    setIdeas((current) => {
      const exists = current.some((item) => item.id === form.id)
      const normalized = { ...form, title: form.title.trim() }
      return exists ? current.map((item) => (item.id === form.id ? normalized : item)) : [normalized, ...current]
    })
    setForm(newWeekendIdea())
    setShowForm(false)
    setShowIdeas(true)
  }

  const updateIdeaStatus = (idea, status) => {
    setIdeas((current) => current.map((item) => {
      if (status === 'main' && item.status === 'main') return { ...item, status: 'idea' }
      if (status === 'backup' && item.status === 'backup') return { ...item, status: 'idea' }
      return item.id === idea.id ? { ...item, status } : item
    }))
  }

  const deleteIdea = (idea) => {
    setIdeas((current) => current.filter((item) => item.id !== idea.id))
  }

  const updateTrashRow = (id, patch) => {
    setTrashRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const markTrashDone = (row) => {
    const nextDate = nextDateForFrequency(row.nextDate || isoDate(new Date()), row.frequency)
    updateTrashRow(row.id, {
      completedAt: isoDate(new Date()),
      nextDate: nextDate || row.nextDate,
    })
    setMessage(nextDate ? `Am notat. Următoarea dată: ${relativeTrashDate(nextDate)}.` : 'Setează următoarea dată manual.')
    window.setTimeout(() => setMessage(''), 3500)
  }

  return (
    <div className="family-weekend-widgets">
      <section className="section family-weekend-card">
        <div className="section-title">
          <div>
            <h2>Plan de weekend</h2>
            <p className="muted">Idei simple pentru familie, casa si copii.</p>
          </div>
          <div className="button-pair">
            <button type="button" onClick={() => setShowForm((current) => !current)}>
              {showForm ? 'Închide' : '+ Adaugă idee'}
            </button>
            <button type="button" className="secondary" onClick={() => setShowIdeas((current) => !current)}>
              {showIdeas ? 'Închide ideile' : 'Vezi toate ideile'}
            </button>
          </div>
        </div>

        {!mainPlan && !backupPlan && (
          <div className="notice">Nu ati ales inca un plan pentru weekend. Adaugă o idee.</div>
        )}

        <div className="weekend-summary-grid">
          <WeekendPlanCard title="Plan principal pentru weekend" idea={mainPlan} currency={currency} locale={locale} />
          <WeekendPlanCard title="Plan rezerva" idea={backupPlan} currency={currency} locale={locale} />
        </div>

        {showForm && (
          <form className="weekend-form" onSubmit={saveIdea}>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex: Plimbare cu copiii" />
            <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Descriere scurta optionala" />
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {weekendCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <input type="number" min="0" step="0.01" value={form.estimatedCost} onChange={(event) => setForm({ ...form, estimatedCost: event.target.value })} placeholder="Cost estimat" />
            <input value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} placeholder="Durata estimata" />
            <select value={form.proposedBy} onChange={(event) => setForm({ ...form, proposedBy: event.target.value })}>
              <option>Victor</option>
              <option>Doina</option>
            </select>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {weekendStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="submit">{ideas.some((item) => item.id === form.id) ? 'Salveaza ideea' : 'Adaugă idee'}</button>
          </form>
        )}

        {showIdeas && (
          <div className="weekend-ideas-list">
            {visibleIdeas.length === 0 ? <div className="empty">Nu exista idei salvate.</div> : visibleIdeas.map((idea) => (
              <article key={idea.id} className="weekend-idea-row">
                <div>
                  <strong>{idea.title}</strong>
                  <span>{idea.category} - {idea.proposedBy} - {idea.duration || 'durata nesetata'}</span>
                  {idea.description && <small>{idea.description}</small>}
                </div>
                <div className="weekend-actions">
                  <span className="badge">{weekendStatuses.find(([value]) => value === idea.status)?.[1]}</span>
                  <button type="button" className="secondary" onClick={() => updateIdeaStatus(idea, 'main')}>Plan principal</button>
                  <button type="button" className="secondary" onClick={() => updateIdeaStatus(idea, 'backup')}>Rezerva</button>
                  <button type="button" className="secondary" onClick={() => updateIdeaStatus(idea, 'done')}>Finalizat</button>
                  <button type="button" className="ghost" onClick={() => {
                    setForm(idea)
                    setShowForm(true)
                  }}>Editează</button>
                  <button type="button" className="ghost danger-text" onClick={() => deleteIdea(idea)}>Sterge</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section trash-home-card">
        <div className="section-title">
          <div>
            <h2>Gunoi</h2>
            <p className="muted">Gelbe, Blaue si Schwarze Tonne.</p>
          </div>
          <button type="button" className="secondary" onClick={() => setShowTrashSettings((current) => !current)}>
            {showTrashSettings ? 'Închide setări' : 'Setează date'}
          </button>
        </div>

        {message && <div className="notice success">{message}</div>}

        <div className="trash-upcoming-grid">
          {upcomingTrash.length === 0 ? (
            <div className="notice">Setează următoarea dată manual.</div>
          ) : upcomingTrash.map((row) => (
            <article key={row.id} className={`trash-next-card ${row.meta.className} ${row.diff <= 1 ? 'urgent' : ''}`}>
              <div className="trash-icon" aria-hidden="true">{row.meta.icon}</div>
              <div className="trash-copy">
                <span className="trash-date">{relativeTrashDate(row.nextDate)}</span>
                <strong className="trash-title">{row.meta.label}</strong>
                <span className="trash-description">{row.meta.hint}</span>
                <small>Următoarea ridicare: {row.nextDate}</small>
              </div>
              <button type="button" onClick={() => markTrashDone(row)}>Am scos gunoiul</button>
            </article>
          ))}
        </div>

        {showTrashSettings && (
          <div className="trash-settings-grid">
            {trashRows.map((row) => {
              const meta = trashMeta(row)
              return (
                <article key={row.id} className={`trash-settings-card ${meta.className}`}>
                  <strong>{meta.icon} {meta.label}</strong>
                  <label>Data urmatoarei ridicari
                    <input type="date" value={row.nextDate} onChange={(event) => updateTrashRow(row.id, { nextDate: event.target.value })} />
                  </label>
                  <label>Frecventa
                    <select value={row.frequency} onChange={(event) => updateTrashRow(row.id, { frequency: event.target.value })}>
                      {trashFrequencies.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" checked={row.active} onChange={(event) => updateTrashRow(row.id, { active: event.target.checked })} />
                    Activ
                  </label>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function WeekendPlanCard({ title, idea, currency, locale }) {
  return (
    <article className={`weekend-plan-card ${idea ? '' : 'empty-plan'}`}>
      <span>{title}</span>
      {idea ? (
        <>
          <strong>{idea.title}</strong>
          <small>{idea.proposedBy} - {idea.category}</small>
          <small>{idea.estimatedCost ? formatMoney(toNumber(idea.estimatedCost), currency, locale) : 'Cost nesetat'} - {idea.duration || 'durata nesetata'}</small>
        </>
      ) : (
        <strong>Nesetat</strong>
      )}
    </article>
  )
}
