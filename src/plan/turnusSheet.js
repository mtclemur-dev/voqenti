import { DateTime } from 'luxon'
import { formatHundredths, parseFixedHoursValue, weekdayFromDate } from './planUtils.js'

const SKIP_NAME = /^(objekt|objekte|objektname|seite|woche|wochen|gesamt|gesamtmoptour|mop|moptour|materialtour|anderungen|anderung|vorbehalten)(\s+\w+)?$/i

export function parseGermanHours(raw, { allowBare = true } = {}) {
  const text = String(raw || '').trim().replace(/\s/g, '')
  if (!text) return 0
  const dotted = text.match(/^(\d{1,2})[,.](\d{1,3})$/)
  if (dotted) {
    const hours = parseFixedHoursValue(`${dotted[1]}.${dotted[2]}`)
    return hours > 16 ? 0 : hours
  }
  if (allowBare && /^\d{1,2}$/.test(text)) {
    const hours = parseFixedHoursValue(text)
    return hours > 0 && hours <= 16 ? hours : 0
  }
  return 0
}

export function isHourToken(text) {
  return parseGermanHours(text) > 0
}

export function isMarkToken(text) {
  return /^[xX×+]{1,3}$/.test(String(text || '').trim())
}

export function parseDateToken(text) {
  const match = String(text || '').trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (!match) return ''
  let year = Number(match[3])
  if (year < 100) year += 2000
  const dt = DateTime.fromObject(
    { year, month: Number(match[2]), day: Number(match[1]) },
    { zone: 'Europe/Berlin' },
  )
  return dt.isValid ? dt.toISODate() : ''
}

export function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function nameScore(left, right) {
  const a = normalizeName(left)
  const b = normalizeName(right)
  if (!a || !b) return 0
  if (a === b) return 100
  if (a.includes(b) || b.includes(a)) return 80
  const tokens = a.split(' ').filter(item => item.length > 2)
  const other = b.split(' ').filter(item => item.length > 2)
  if (!tokens.length || !other.length) return 0
  const hit = tokens.filter(token => other.some(item => item.includes(token) || token.includes(item))).length
  return Math.round((100 * hit) / Math.max(tokens.length, other.length))
}

export function matchSheetRow(rows, name) {
  let best = null
  let score = 0
  for (const row of rows || []) {
    const next = nameScore(name, row.name)
    if (next > score) {
      score = next
      best = row
    }
  }
  return score >= 45 ? best : null
}

export function prettySheetTitle(text) {
  const line = String(text || '').replace(/\s+/g, ' ').trim()
  if (!line) return 'Turnus'
  const mop = line.match(/mop[\s./-]*materialtour(?:\s+herr\s+[a-zäöü]+)?/i)
  if (mop) return mop[0].replace(/\s+/g, ' ').trim()
  if (/turnus|leistung/i.test(line)) return line.slice(0, 80)
  return line.slice(0, 80)
}

export function weekdaysFromRange(text) {
  const match = String(text || '').match(/woche\s+vom\s+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s*[–—-]\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i)
  if (!match) return []
  const start = DateTime.fromISO(parseDateToken(match[1]), { zone: 'Europe/Berlin' })
  const end = DateTime.fromISO(parseDateToken(match[2]), { zone: 'Europe/Berlin' })
  if (!start.isValid || !end.isValid) return []
  const days = []
  for (let day = start; day <= end; day = day.plus({ days: 1 })) days.push(day.weekday)
  return days
}

export function prettyTurnusBody(title, cell) {
  const head = prettySheetTitle(title)
  const note = String(cell?.note || '').trim()
  if (note && normalizeName(note) !== normalizeName(head)) return `${head}\n${note}`
  return head
}

function asWord(item) {
  return {
    text: String(item?.text || '').trim(),
    x: Number(item?.x ?? item?.bbox?.x0 ?? 0),
    y: Number(item?.y ?? item?.bbox?.y0 ?? 0),
    r: Number(item?.r ?? item?.bbox?.x1 ?? item?.x ?? 0),
    b: Number(item?.b ?? item?.bbox?.y1 ?? item?.y ?? 0),
  }
}

function joinDateFragments(words) {
  const joined = []
  for (let index = 0; index < words.length; index += 1) {
    const current = words[index]
    const next = words[index + 1]
    const glued = next ? `${current.text}${current.text.includes('.') ? '' : '.'}${next.text}` : ''
    if (next && !parseDateToken(current.text) && parseDateToken(glued)) {
      joined.push({
        ...current,
        text: glued,
        r: next.r,
      })
      index += 1
    } else {
      joined.push(current)
    }
  }
  return joined
}

export function wordsToRows(words) {
  const items = (words || []).map(asWord).filter(item => item.text).sort((a, b) => a.y - b.y || a.x - b.x)
  if (!items.length) return []
  const heights = items.map(item => Math.max(8, item.b - item.y)).sort((a, b) => a - b)
  const height = heights[Math.floor(heights.length / 2)] || 12
  const rows = []
  for (const word of items) {
    const mid = (word.y + word.b) / 2
    const last = rows[rows.length - 1]
    if (last && Math.abs(mid - last.mid) < height * 0.7) {
      last.words.push(word)
      last.mid = ((last.mid * (last.words.length - 1)) + mid) / last.words.length
    } else {
      rows.push({ mid, words: [word] })
    }
  }
  return rows.map(row => ({
    text: row.words.map(item => item.text).join(' '),
    words: joinDateFragments(row.words.sort((a, b) => a.x - b.x)),
  }))
}

function columnsFromRow(row) {
  const columns = []
  for (const word of row.words || []) {
    const date = parseDateToken(word.text)
    if (!date) continue
    const weekday = weekdayFromDate(date)
    if (!weekday) continue
    columns.push({ weekday, date, x: (word.x + word.r) / 2 })
  }
  return columns
}

function nearestColumn(word, columns) {
  if (!columns.length) return null
  const center = (word.x + word.r) / 2
  const gap = columns.length > 1 ? Math.abs(columns[1].x - columns[0].x) : 90
  let best = null
  let distance = Infinity
  for (const column of columns) {
    const next = Math.abs(center - column.x)
    if (next < distance) {
      distance = next
      best = column
    }
  }
  return best && distance <= gap * 0.55 ? best : null
}

function usableName(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim()
  if (clean.length < 3) return ''
  if (SKIP_NAME.test(normalizeName(clean))) return ''
  if (parseDateToken(clean) || isHourToken(clean) || isMarkToken(clean)) return ''
  return clean
}

function cellFromToken(text, extra = {}) {
  if (isMarkToken(text)) return { mark: true }
  const hours = parseGermanHours(text, extra)
  if (hours) return { hours }
  return null
}

function parseFromWords(words) {
  const rows = wordsToRows(words)
  let title = ''
  let columns = []
  const found = []
  for (const row of rows) {
    if (!title && /mop|materialtour|turnus|leistung/i.test(row.text)) title = prettySheetTitle(row.text)
    const nextColumns = columnsFromRow(row)
    if (nextColumns.length >= 3) {
      columns = nextColumns
      continue
    }
    if (!columns.length) continue
    const firstX = columns[0].x
    const gap = columns.length > 1 ? Math.abs(columns[1].x - columns[0].x) : 90
    const name = usableName(row.words.filter(word => word.r < firstX - gap * 0.25).map(word => word.text).join(' '))
    if (!name) continue
    const days = {}
    for (const word of row.words) {
      const column = nearestColumn(word, columns)
      const cell = cellFromToken(word.text)
      if (!column || !cell) continue
      days[column.weekday] = { ...days[column.weekday], ...cell }
    }
    if (Object.keys(days).length) found.push({ name, days })
  }
  return { title, rows: found }
}

function parseFromText(text) {
  const lines = String(text || '').split(/\n+/).map(line => line.trim()).filter(Boolean)
  let title = ''
  let weekdays = []
  const found = []
  for (const line of lines) {
    if (!title && /mop|materialtour|turnus|leistung/i.test(line)) title = prettySheetTitle(line)
    const dates = [...line.matchAll(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/g)]
      .map(item => weekdayFromDate(parseDateToken(item[0])))
      .filter(Boolean)
    if (dates.length >= 3) {
      weekdays = dates
      continue
    }
    if (!weekdays.length) weekdays = weekdaysFromRange(text)
    const cleaned = line.replace(/\d+\s*x\s*in\s*\d+\s*woche(?:\s*\([^)]+\))?/gi, '').replace(/\bab\s+\d{1,2}:\d{2}\s*uhr\b/gi, '')
    const tokens = cleaned.split(/\s{2,}|\t+|\s*\|\s*/).map(item => item.trim()).filter(Boolean)
    const parts = tokens.length > 1 ? tokens : cleaned.split(/\s+/).map(item => item.trim()).filter(Boolean)
    const allowBare = !/woche|ungerade|gerade/i.test(line)
    const cells = []
    const nameParts = []
    for (const part of parts) {
      const cell = cellFromToken(part, { allowBare })
      if (cell) cells.push(cell)
      else nameParts.push(part)
    }
    const name = usableName(nameParts.join(' '))
    if (!name || !cells.length) continue
    const days = {}
    cells.forEach((cell, index) => {
      const weekday = weekdays[index] || (index + 1)
      if (weekday >= 1 && weekday <= 7) days[weekday] = { ...days[weekday], ...cell }
    })
    found.push({ name, days })
  }
  return { title, rows: found }
}

function mergeRows(groups) {
  const map = new Map()
  for (const row of groups.flatMap(group => group.rows || [])) {
    const key = normalizeName(row.name)
    if (!key) continue
    const prev = map.get(key) || { name: row.name, days: {} }
    for (const [day, cell] of Object.entries(row.days || {})) {
      prev.days[day] = { ...prev.days[day], ...cell }
    }
    if (row.name.length > prev.name.length) prev.name = row.name
    map.set(key, prev)
  }
  const title = groups.map(group => group.title).find(Boolean) || ''
  return { title, rows: [...map.values()] }
}

export function parseTurnusSheet({ text = '', words = [] } = {}) {
  return mergeRows([
    words.length ? parseFromWords(words) : { title: '', rows: [] },
    parseFromText(text),
  ])
}

export function applyTurnusSheet(form, sheet) {
  const current = form || {}
  const row = matchSheetRow(sheet?.rows, current.name)
    || (!String(current.name || '').trim() && sheet?.rows?.length === 1 ? sheet.rows[0] : null)
  const title = prettySheetTitle(sheet?.title)
  if (!row) {
    return {
      form: {
        ...current,
        leistung_text: String(current.leistung_text || '').trim() || title,
      },
      matched: false,
      row: null,
    }
  }
  const turnus = { ...(current.turnus || {}) }
  const hours = { ...(current.fixed_hours_by_day || {}) }
  for (const [day, cell] of Object.entries(row.days || {})) {
    if (cell.hours) hours[day] = formatHundredths(cell.hours)
    if (cell.mark || cell.hours || cell.note) turnus[day] = prettyTurnusBody(title, cell)
  }
  return {
    form: {
      ...current,
      name: String(current.name || '').trim() || row.name,
      leistung_text: String(current.leistung_text || '').trim() || title,
      turnus,
      fixed_hours_by_day: hours,
    },
    matched: true,
    row,
  }
}
