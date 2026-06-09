import { toNumber } from './finance'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export const storeNames = ['Netto', 'Norma', 'Lidl', 'Aldi', 'Rewe', 'Kaufland', 'Edeka', 'dm', 'Rossmann', 'Globus']

const offerSearchSynonyms = {
  lapte: ['milch', 'h-milch', 'frische milch', 'h milch'],
  cafea: ['kaffee', 'kaffeebohnen', 'instantkaffee'],
  unt: ['butter', 'weidebutter', 'weide butter'],
  carne: ['fleisch', 'hackfleisch', 'hähnchen', 'hahnchen', 'pute', 'schwein'],
  detergent: ['waschmittel', 'spülmittel', 'reiniger'],
}

export function normalizeSearchTerm(value = '') {
  return normalizeProduct(value)
}

export function findProductSynonym(value = '') {
  const normalized = normalizeSearchTerm(value)
  return Object.entries(offerSearchSynonyms).find(([key, variants]) =>
    normalizeSearchTerm(key).includes(normalized) || normalized.includes(normalizeSearchTerm(key)) ||
    variants.some((term) => normalizeSearchTerm(term).includes(normalized) || normalized.includes(normalizeSearchTerm(term)))
  )?.[0] || ''
}

export function productMatch(needle = '', haystack = '') {
  const a = findProductSynonym(needle) || normalizeSearchTerm(needle)
  const b = findProductSynonym(haystack) || normalizeSearchTerm(haystack)
  if (!a || !b) return { match: false, approx: false }
  if (a === b || b.includes(a) || a.includes(b)) return { match: true, approx: false }
  const tokensA = a.split(' ').filter((token) => token.length > 2)
  const tokensB = b.split(' ')
  const common = tokensA.filter((token) => tokensB.includes(token)).length
  return { match: common > 0, approx: common > 0 }
}

export function parseOfferText(text, meta = {}) {
  const detectedStore = meta.store_name || detectStore(text)
  const validity = detectValidity(text)
  return splitOfferLines(normalizePdfText(text))
    .map((line, index) => parseOfferLine(line, {
      store_name: detectedStore,
      valid_from: meta.valid_from || validity.valid_from,
      valid_until: meta.valid_until || validity.valid_until,
      source: meta.source || 'manual_text',
      source_page: meta.source_page || 1,
      source_file_name: meta.source_file_name || '',
      index,
    }))
    .filter(Boolean)
}

export function parseReceiptText(text = '') {
  return normalizePdfText(text)
    .split(/\r?\n/)
    .map((line) => parseReceiptLine(line.trim()))
    .filter(Boolean)
}

export function parseReceiptLine(line = '') {
  if (!line || /summe|total|gesamt|bar|karte|mwst|ust|datum|beleg|bon/i.test(line)) return null
  const priceMatch = line.match(/(\d+(?:[,.]\d{1,2})?)\s*(?:eur|€)?\s*$/i)
  if (!priceMatch) return null
  const totalPrice = Number(String(priceMatch[1]).replace(',', '.'))
  if (!totalPrice || Number.isNaN(totalPrice)) return null
  const beforePrice = line.slice(0, priceMatch.index).trim()
  if (!beforePrice || beforePrice.length < 2) return null
  const quantityMatch = beforePrice.match(/(\d+(?:[,.]\d+)?)\s*(kg|g|l|liter|ml|stk|stück|buc|x)\s*$/i)
  const quantity = quantityMatch ? Number(String(quantityMatch[1]).replace(',', '.')) : null
  const unit = quantityMatch ? normalizeUnit(quantityMatch[2]) : null
  const productName = (quantityMatch ? beforePrice.slice(0, quantityMatch.index) : beforePrice)
    .replace(/^\d+\s*x\s*/i, '')
    .trim()
  const unitInfo = quantity && unit ? offerUnitPrice(totalPrice, quantity, unit) : null
  return {
    product_name: productName,
    category: inferOfferCategory(productName),
    quantity,
    unit,
    unit_price: unitInfo?.price ?? null,
    total_price: totalPrice,
  }
}

export function splitOfferLines(text = '') {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.reduce((result, line) => {
    if (!result.length) return [line]
    const previous = result[result.length - 1]
    if (/^[\d.,\s€eEur\-–]+$/i.test(line) || /^[\d.,]+$/i.test(line)) {
      result[result.length - 1] = `${previous} ${line}`
    } else if (/^(kg|g|l|liter|ml|buc|stk|stück|role|rollen|pachet|pack|sticlă|sticla|fl|cutie)/i.test(line)) {
      result[result.length - 1] = `${previous} ${line}`
    } else if (/\d$/.test(previous) && /^[\d.,]/.test(line)) {
      result[result.length - 1] = `${previous} ${line}`
    } else {
      result.push(line)
    }
    return result
  }, [])
}

export async function extractTextFromPdf(file) {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const pages = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      let lines = []
      let lastY = null
      content.items.forEach((item) => {
        const text = String(item.str || '')
        const y = item.transform?.[5] ? Math.round(item.transform[5]) : null
        if (lastY === null || y === null || Math.abs(y - lastY) > 5) {
          lines.push(text)
          lastY = y
        } else {
          lines[lines.length - 1] += ` ${text}`
        }
      })
      const pageText = normalizePdfText(lines.join('\n'))
      pages.push({ pageNumber, text: pageText })
    }

    const text = pages.map((page) => page.text).join('\n\n')
    const success = Boolean(text && text.length >= 500)
    const warning = success ? undefined : 'pdfTextInsufficient'
    return { success, pageCount: pdf.numPages, text, pages, warning }
  } catch {
    return {
      success: false,
      pageCount: 0,
      text: '',
      pages: [],
      warning: 'pdfExtractionFailed',
    }
  }
}

export function normalizePdfText(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\n(?=\s*[0-9]+[.,]?\d*\s*(€|eur)?)/gi, ' ')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function offerPreviewKey(item) {
  return `${normalizeProduct(item.store_name)}||${normalizeProduct(item.product_name)}||${toNumber(item.price)}||${item.valid_from || ''}||${item.valid_until || ''}`
}

export function mergePreviewRows(existing = [], incoming = []) {
  const seen = new Map()
  ;[...existing, ...incoming].forEach((item) => {
    const key = offerPreviewKey(item)
    if (!seen.has(key)) seen.set(key, item)
  })
  return [...seen.values()]
}

export function parseOfferLine(line, meta) {
  if (storeNames.some((store) => line.toLowerCase() === store.toLowerCase())) return null
  if (/\b(valid|gültig|valabil|gültig vom|von|vom|bis|pana|până)\b/i.test(line)) return null
  const priceMatch = line.match(/(\d+(?:[.,]\d{1,2})?)(?:\s*[-.–])?\s*(€|eur)?$/i) || line.match(/(\d+)\s*[., ]\s*(\d{2})\s*(€|eur)?/i)
  if (!priceMatch) return null

  let rawPrice = String(priceMatch[1]).replace(',', '.')
  if (/^\d+\.$/.test(rawPrice)) rawPrice = `${rawPrice}00`
  if (/^\d+\.\d$/.test(rawPrice)) rawPrice = `${rawPrice}0`
  const price = Number(rawPrice)
  if (Number.isNaN(price)) return null

  const beforePrice = line.slice(0, priceMatch.index).trim()
  const quantityMatch = beforePrice.match(/(\d+(?:[,.]\d+)?)\s*(kg|g|l|liter|ml|buc|stk|stück|role|rollen|pachet|pack|sticlă|sticla|fl|cutie)$/i)
  const quantity = quantityMatch ? Number(quantityMatch[1].replace(',', '.')) : null
  const unit = quantityMatch ? normalizeUnit(quantityMatch[2]) : ''

  let product = (quantityMatch ? beforePrice.slice(0, quantityMatch.index) : beforePrice).trim()
  if (!product) {
    product = line.replace(priceMatch[0], '').trim()
  }

  const unitInfo = quantity && unit ? offerUnitPrice(price, quantity, unit) : null
  const appPrice = /app|card|karte|plus/i.test(line)
  const confidence = product && price ? (quantity ? 0.86 : 0.72) : 0.45

  return {
    store_name: meta.store_name || '',
    product_name: product,
    brand: '',
    category: inferOfferCategory(product),
    price,
    old_price: null,
    discount_percent: null,
    quantity,
    unit,
    unit_price: unitInfo?.price ?? null,
    valid_from: meta.valid_from || null,
    valid_until: meta.valid_until || null,
    source: meta.source,
    source_file_name: meta.source_file_name,
    source_page: meta.source_page,
    app_price: appPrice,
    confidence,
    status: confidence >= 0.75 ? 'ok' : 'needs_review',
    notes: confidence >= 0.75 ? '' : 'Verifica manual',
  }
}

export function normalizeOfferPayload(item) {
  return {
    store_name: item.store_name || 'Unbekannt',
    product_name: item.product_name,
    brand: item.brand || null,
    category: item.category || null,
    price: toNumber(item.price),
    old_price: item.old_price ? toNumber(item.old_price) : null,
    discount_percent: item.discount_percent ? toNumber(item.discount_percent) : null,
    quantity: item.quantity ? toNumber(item.quantity) : null,
    unit: item.unit || null,
    unit_price: item.unit_price ? toNumber(item.unit_price) : null,
    valid_from: item.valid_from || null,
    valid_until: item.valid_until || null,
    source: item.source || 'manual_text',
    source_file_name: item.source_file_name || null,
    source_page: item.source_page ? Number(item.source_page) : null,
    app_price: Boolean(item.app_price),
    confidence: toNumber(item.confidence) || 0.7,
    status: item.status || 'confirmed',
    notes: item.notes || null,
  }
}

export function detectStore(text = '') {
  const lower = String(text).toLowerCase()
  return storeNames.find((store) => lower.includes(store.toLowerCase())) || ''
}

export function detectValidity(text = '') {
  const normalized = String(text).replace(/\s+/g, ' ')
  const match = normalized.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*(?:-|–|bis|to|pana la|până la|pana)\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/i)
  if (!match) return {}

  const parseYear = (value) => {
    if (!value) return new Date().getFullYear()
    const year = Number(value)
    return year < 100 ? 2000 + year : year
  }

  const fromYear = parseYear(match[3])
  const untilYear = parseYear(match[6])
  const valid_from = `${fromYear}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`
  const valid_until = `${untilYear}-${String(match[5]).padStart(2, '0')}-${String(match[4]).padStart(2, '0')}`
  return { valid_from, valid_until }
}

export function normalizeUnit(unit = '') {
  const clean = String(unit).toLowerCase()
  if (['l', 'liter'].includes(clean)) return 'L'
  if (clean === 'ml') return 'ml'
  if (clean === 'kg') return 'kg'
  if (clean === 'g') return 'g'
  if (/stk|stück/.test(clean)) return 'buc'
  if (/rollen/.test(clean)) return 'role'
  return unit
}

export function normalizedUnitLabel(unit = '') {
  if (unit === 'g') return 'kg'
  if (unit === 'ml') return 'L'
  return unit || 'unit'
}

export function offerUnitPrice(price, quantity, unit) {
  if (!price || !quantity || !unit) return null
  if (unit === 'g') return { price: price / (quantity / 1000), unit: 'kg' }
  if (unit === 'ml') return { price: price / (quantity / 1000), unit: 'L' }
  return { price: price / quantity, unit }
}

export function inferOfferCategory(product = '') {
  const text = product.toLowerCase()
  if (/milch|lapte|kaffee|cafea|butter|unt|brot|paine|pâine|ou|eier|carne|fleisch|fruct|obst|legume|gemüse/.test(text)) return 'mâncare'
  if (/detergent|wasch|hartie|hârtie|papier|dm|rossmann/.test(text)) return 'casă / reparații'
  return 'altele'
}

export function normalizeProduct(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function offerCompareValue(offer) {
  return toNumber(offer.unit_price) || toNumber(offer.price)
}

export function offerDayValue(value) {
  if (!value) return null
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    return Number(`${match[1]}${match[2]}${match[3]}`)
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Number(`${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`)
}

export function getOfferValidityStatus(offer, today = new Date()) {
  const todayValue = offerDayValue(today)
  const validUntil = offerDayValue(offer.valid_until || offer.end_date)
  if (!validUntil) return 'unknown'
  if (todayValue > validUntil) return 'expired'
  const validFrom = offerDayValue(offer.valid_from || offer.start_date)
  if (validFrom && todayValue < validFrom) return 'unknown'
  return 'active'
}

export function formatOfferDate(value, locale = 'ro-RO') {
  if (!value) return '-'
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    return `${match[3]}.${match[2]}.${match[1]}`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(locale).format(date)
}

export function offerValidityText(offer, t, locale) {
  if (offer.valid_until || offer.end_date) {
    return `${t('validUntil')}: ${formatOfferDate(offer.valid_until || offer.end_date, locale)}`
  }
  return t('offerValidityUnknown')
}

function normalizedUnitPrice(item) {
  const amount = toNumber(item.amount)
  const quantity = toNumber(item.quantity)
  const unit = String(item.unit || '').trim().toLowerCase()
  if (!item.product_name || !amount || !quantity || !unit) return null
  if (unit === 'g') return { price: amount / (quantity / 1000), unit: 'kg' }
  if (unit === 'ml') return { price: amount / (quantity / 1000), unit: 'L' }
  return { price: toNumber(item.unit_price) || amount / quantity, unit }
}

export function buildShoppingHistory(journalEntries = []) {
  const rows = journalEntries
    .filter((item) => item.product_name && toNumber(item.amount) > 0)
    .map((item) => {
      const unitInfo = normalizedUnitPrice(item)
      return {
        product: item.product_name,
        value: unitInfo?.price ?? toNumber(item.amount),
        unit: unitInfo?.unit,
        store: item.store,
        date: item.entry_date,
      }
    })
  const byProduct = new Map()
  rows.forEach((row) => {
    const key = normalizeProduct(row.product)
    if (!byProduct.has(key)) byProduct.set(key, [])
    byProduct.get(key).push(row)
  })
  return [...byProduct.entries()].map(([key, items]) => {
    const sorted = [...items].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    return {
      key,
      product: sorted[sorted.length - 1].product,
      unit: sorted[sorted.length - 1].unit,
      last: sorted[sorted.length - 1],
      min: sorted.reduce((min, item) => item.value < min.value ? item : min, sorted[0]),
      max: sorted.reduce((max, item) => item.value > max.value ? item : max, sorted[0]),
    }
  })
}

export function bestShoppingMatches(shoppingList = [], offers = [], journalEntries = []) {
  const history = buildShoppingHistory(journalEntries)
  return shoppingList.map((item) => {
    const matches = offers
      .map((offer) => ({ offer, ...productMatch(item.product_name, offer.product_name) }))
      .filter((row) => row.match)
      .sort((a, b) => offerCompareValue(a.offer) - offerCompareValue(b.offer))
    const best = matches[0]?.offer || null
    const hist = history.find((row) => productMatch(item.product_name, row.product).match)
    const bestValue = best ? offerCompareValue(best) : 0
    const lastValue = hist?.last?.value || 0
    const minValue = hist?.min?.value || 0
    return {
      product_name: item.product_name,
      best,
      history: hist,
      saving: best && lastValue ? lastValue - bestValue : 0,
      isBestObserved: Boolean(best && minValue && bestValue < minValue),
      approx: Boolean(matches[0]?.approx),
    }
  })
}

export function buildStoreRecommendations(bestPrices = [], stores = []) {
  const byStore = new Map()
  bestPrices.filter((item) => item.best).forEach((item) => {
    const store = item.best.store_name
    if (!byStore.has(store)) byStore.set(store, { store, matches: 0, bestCount: 0, saving: 0, total: 0 })
    const row = byStore.get(store)
    row.matches += 1
    row.bestCount += 1
    row.saving += Math.max(0, item.saving)
    row.total += toNumber(item.best.price)
  })
  return [...byStore.values()].map((row) => {
    const storeSettings = stores.find((store) => store.name === row.store)
    const travelCost = storeSettings?.distance_km && storeSettings?.fuel_cost_estimate
      ? toNumber(storeSettings.distance_km) * 2 * toNumber(storeSettings.fuel_cost_estimate)
      : null
    const netSaving = travelCost === null ? null : row.saving - travelCost
    const recommendation = netSaving !== null
      ? (netSaving >= 2 ? 'worthIt' : storeSettings?.on_regular_route ? 'routeOnly' : 'noExtraTrip')
      : row.saving >= 2 ? 'worthIt' : 'routeOnly'
    return { ...row, netSaving, recommendation }
  }).sort((a, b) => b.saving - a.saving)
}