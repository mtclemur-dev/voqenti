/** Canonical offer source ids (stored in notes meta; DB column uses legacy mapping). */

function normalizeProductName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
export const OFFER_SOURCE_OPTIONS = [
  { id: 'kaufda', label: 'KaufDA' },
  { id: 'marktguru', label: 'Marktguru' },
  { id: 'meinprospekt', label: 'MeinProspekt' },
  { id: 'manual', label: 'Manual' },
  { id: 'pdf', label: 'PDF' },
  { id: 'text', label: 'Text' },
  { id: 'open_prices', label: 'Open Prices' },
  { id: 'online', label: 'Online' },
  { id: 'unknown', label: 'Necunoscut' },
]

export const OFFER_SOURCE_FILTER_OPTIONS = [
  { id: 'all', label: 'Toate sursele' },
  { id: 'kaufda', label: 'KaufDA' },
  { id: 'manual', label: 'Manual' },
  { id: 'pdf_text', label: 'PDF / Text' },
  { id: 'marktguru', label: 'Marktguru' },
  { id: 'meinprospekt', label: 'MeinProspekt' },
  { id: 'open_prices', label: 'Open Prices' },
  { id: 'online', label: 'Online' },
]

export const SHOPPING_STORES = [
  'Netto', 'Norma', 'Lidl', 'Aldi', 'Rewe', 'Kaufland', 'Edeka', 'Penny',
  'dm', 'Rossmann', 'Globus', 'Amazon', 'eBay', 'Altele',
]

const META_PREFIX = '__KB_META__'
const META_SUFFIX = '__END_META__'

const DB_SOURCE_BY_OFFER_SOURCE = {
  kaufda: 'manual',
  marktguru: 'manual',
  meinprospekt: 'manual',
  manual: 'manual',
  pdf: 'pdf_upload',
  text: 'manual_text',
  open_prices: 'manual',
  online: 'manual',
  unknown: 'manual',
}

const OFFER_SOURCE_BY_DB = {
  manual_text: 'text',
  pdf_upload: 'pdf',
  manual: 'manual',
}

export function normalizeOfferSource(value = '') {
  const clean = String(value || '').trim().toLowerCase()
  if (OFFER_SOURCE_OPTIONS.some((item) => item.id === clean)) return clean
  if (clean === 'manual_text') return 'text'
  if (clean === 'pdf_upload') return 'pdf'
  return OFFER_SOURCE_BY_DB[clean] || 'unknown'
}

export function getOfferSourceLabel(sourceId = '') {
  const id = normalizeOfferSource(sourceId)
  return OFFER_SOURCE_OPTIONS.find((item) => item.id === id)?.label || 'Necunoscut'
}

export function toDbSourceColumn(offerSource = 'manual') {
  return DB_SOURCE_BY_OFFER_SOURCE[normalizeOfferSource(offerSource)] || 'manual'
}

export function encodeOfferNotes(meta = {}, userNotes = '') {
  const payload = {
    offer_source: normalizeOfferSource(meta.offer_source || 'manual'),
    source_url: meta.source_url || null,
    barcode: meta.barcode || null,
    open_food_facts_id: meta.open_food_facts_id || null,
  }
  const cleanNotes = stripOfferMeta(userNotes)
  if (!payload.source_url && !payload.barcode && !payload.open_food_facts_id && payload.offer_source === 'manual' && !cleanNotes) {
    return cleanNotes || null
  }
  return `${META_PREFIX}${JSON.stringify(payload)}${META_SUFFIX}${cleanNotes}`.trim() || null
}

export function decodeOfferNotes(notes = '') {
  const text = String(notes || '')
  if (!text.startsWith(META_PREFIX)) {
    return { offer_source: null, source_url: null, barcode: null, open_food_facts_id: null, userNotes: text }
  }
  const end = text.indexOf(META_SUFFIX)
  if (end === -1) {
    return { offer_source: null, source_url: null, barcode: null, open_food_facts_id: null, userNotes: text }
  }
  try {
    const parsed = JSON.parse(text.slice(META_PREFIX.length, end))
    return {
      offer_source: parsed.offer_source || null,
      source_url: parsed.source_url || null,
      barcode: parsed.barcode || null,
      open_food_facts_id: parsed.open_food_facts_id || null,
      userNotes: text.slice(end + META_SUFFIX.length).trim(),
    }
  } catch {
    return { offer_source: null, source_url: null, barcode: null, open_food_facts_id: null, userNotes: text }
  }
}

export function stripOfferMeta(notes = '') {
  const text = String(notes || '')
  if (!text.startsWith(META_PREFIX)) return text
  const end = text.indexOf(META_SUFFIX)
  if (end === -1) return text
  return text.slice(end + META_SUFFIX.length).trim()
}

export function hydrateOffer(offer = {}) {
  const meta = decodeOfferNotes(offer.notes)
  const offerSource = meta.offer_source || normalizeOfferSource(offer.source)
  const quantity = offer.quantity != null && offer.quantity !== '' ? Number(offer.quantity) : null
  const unit = offer.unit || null
  return {
    ...offer,
    offer_source: offerSource,
    source_url: meta.source_url,
    barcode: meta.barcode,
    open_food_facts_id: meta.open_food_facts_id,
    notes: meta.userNotes || (meta.offer_source ? '' : offer.notes),
    normalized_name: normalizeProductName(offer.product_name || ''),
    quantity_text: quantity && unit ? `${quantity} ${unit}` : (quantity ? String(quantity) : null),
    store: offer.store_name || offer.store || '',
  }
}

export function normalizeOffer(offer = {}) {
  const hydrated = hydrateOffer(offer)
  return {
    id: offer.id || null,
    source: hydrated.offer_source,
    store: hydrated.store_name || hydrated.store || '',
    product_name: hydrated.product_name || '',
    normalized_name: hydrated.normalized_name,
    price: offer.price,
    unit_price: offer.unit_price ?? null,
    quantity_text: hydrated.quantity_text,
    valid_from: offer.valid_from || null,
    valid_until: offer.valid_until || null,
    status: offer.status || 'confirmed',
    source_url: hydrated.source_url,
    raw_text: offer.raw_text || null,
    created_at: offer.created_at || null,
    updated_at: offer.updated_at || null,
  }
}

export function offerMatchesSourceFilter(offer, filterId = 'all') {
  const source = normalizeOfferSource(offer.offer_source || offer.source)
  if (filterId === 'all') return true
  if (filterId === 'pdf_text') return source === 'pdf' || source === 'text'
  return source === filterId
}

export function buildManualOfferPayload(form = {}) {
  const offerSource = normalizeOfferSource(form.offer_source || 'manual')
  return {
    store_name: form.store_name?.trim() || 'Altele',
    product_name: form.product_name?.trim() || '',
    brand: form.brand?.trim() || null,
    category: form.category || null,
    price: Number(form.price) || 0,
    quantity: form.quantity ? Number(form.quantity) : null,
    unit: form.unit?.trim() || null,
    unit_price: form.unit_price ? Number(form.unit_price) : null,
    valid_from: form.valid_from || null,
    valid_until: form.valid_until || null,
    source: toDbSourceColumn(offerSource),
    status: 'confirmed',
    confidence: 1,
    notes: encodeOfferNotes({
      offer_source: offerSource,
      source_url: form.source_url?.trim() || null,
      barcode: form.barcode?.trim() || null,
      open_food_facts_id: form.open_food_facts_id?.trim() || null,
    }, form.notes?.trim() || ''),
  }
}
