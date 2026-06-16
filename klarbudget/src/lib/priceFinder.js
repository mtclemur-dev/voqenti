/**
 * Price Finder — experimental helper for KlarBudget.
 *
 * Searches Open Prices (prices.openfoodfacts.org) for community price data
 * matching Pantry / Shopping-list items.
 *
 * Constraints:
 *  - Manual trigger only (never auto-runs)
 *  - Max MAX_PRODUCTS products per search run
 *  - Per-request AbortController timeout (FETCH_TIMEOUT_MS)
 *  - No aggressive scraping, no browser automation
 *  - Data stored only in component state / localStorage cache
 *  - Does NOT modify Supabase schema
 */

const OPEN_PRICES_API = 'https://prices.openfoodfacts.org/api/v1/prices'
const MAX_PRODUCTS = 8
const FETCH_TIMEOUT_MS = 8000
const RESULTS_PER_PRODUCT = 5

/** Days thresholds for recency labels */
const DAYS_STALE = 30
const DAYS_OLD = 60

// ─────────────────────────────────────────────────────────────────────────────
// Category / keyword mapping
// Each entry maps Romanian/German pantry keywords → OFacts category tag +
// a list of match-words we expect to appear in the product name/category for
// a "good" confidence score.
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_MAP = [
  {
    keywords: ['lapte uht', 'uht-milch', 'h-milch'],
    category: 'en:uht-milks',
    matchWords: ['uht', 'h-milch', 'haltbar'],
    label: 'Lapte UHT',
  },
  {
    keywords: ['lapte', 'vollmilch', 'drinking milk', 'frischmilch'],
    category: 'en:drinking-milks',
    matchWords: ['milch', 'milk', 'lait'],
    label: 'Lapte',
  },
  {
    keywords: ['unt', 'butter'],
    category: 'en:butters',
    matchWords: ['butter', 'beurre', 'burro'],
    label: 'Unt',
  },
  {
    keywords: ['ouă', 'oua', 'eier', 'eggs'],
    category: 'en:eggs',
    matchWords: ['ei', 'egg', 'eier', 'oua'],
    label: 'Ouă',
  },
  {
    keywords: ['zahăr', 'zahar', 'zucker', 'sugar'],
    category: 'en:sugars',
    matchWords: ['zucker', 'sugar', 'sucre'],
    label: 'Zahăr',
  },
  {
    keywords: ['orez', 'reis', 'rice'],
    category: 'en:rices',
    matchWords: ['reis', 'rice', 'riz', 'riso'],
    label: 'Orez',
  },
  {
    keywords: ['paste', 'nudeln', 'pasta', 'spaghetti', 'penne'],
    category: 'en:pastas',
    matchWords: ['nudel', 'pasta', 'penne', 'spaghetti', 'fusilli'],
    label: 'Paste',
  },
  {
    keywords: ['făină', 'faina', 'mehl', 'flour'],
    category: 'en:flours',
    matchWords: ['mehl', 'flour', 'farine', 'faina'],
    label: 'Făină',
  },
  {
    keywords: ['ulei', 'öl', 'oil', 'speiseöl', 'sonnenblume'],
    category: 'en:vegetable-oils',
    matchWords: ['öl', 'oil', 'huile', 'ulei'],
    label: 'Ulei',
  },
  {
    keywords: ['cafea', 'kaffee', 'coffee'],
    category: 'en:coffees',
    matchWords: ['kaffee', 'coffee', 'café', 'kaffeee'],
    label: 'Cafea',
  },
  {
    keywords: ['apă minerală', 'apa minerala', 'mineralwasser'],
    category: 'en:mineral-waters',
    matchWords: ['mineral', 'mineralwasser'],
    label: 'Apă minerală',
  },
  {
    keywords: ['apă plată', 'apa plata', 'stilles wasser', 'tafelwasser'],
    category: 'en:spring-waters',
    matchWords: ['wasser', 'water', 'quell'],
    label: 'Apă plată',
  },
  {
    keywords: ['apă', 'wasser', 'water'],
    category: 'en:waters',
    matchWords: ['wasser', 'water', 'eau'],
    label: 'Apă',
  },
  {
    keywords: ['miere', 'honig', 'honey'],
    category: 'en:honeys',
    matchWords: ['honig', 'honey', 'miel', 'miere'],
    label: 'Miere',
  },
  {
    keywords: ['ton', 'thunfisch', 'tuna'],
    category: 'en:tunas',
    matchWords: ['thun', 'tuna', 'ton '],
    label: 'Ton',
  },
  {
    keywords: ['sare', 'salz', 'salt', 'iod'],
    category: 'en:salts',
    matchWords: ['salz', 'salt', 'sel'],
    label: 'Sare',
  },
  {
    keywords: ['mălai', 'malai', 'polenta', 'maisgrieß'],
    category: 'en:corn-flours',
    matchWords: ['mais', 'corn', 'polenta', 'malai'],
    label: 'Mălai',
  },
  {
    keywords: ['iaurt', 'joghurt', 'yogurt'],
    category: 'en:yogurts',
    matchWords: ['joghurt', 'yogurt', 'yoghurt', 'iaurt'],
    label: 'Iaurt',
  },
  {
    keywords: ['brânză', 'branza', 'cașcaval', 'cascaval', 'käse', 'cheese'],
    category: 'en:cheeses',
    matchWords: ['käse', 'cheese', 'fromage', 'branza', 'cascaval'],
    label: 'Brânză / Cașcaval',
  },
  {
    keywords: ['pâine', 'paine', 'brot', 'bread'],
    category: 'en:breads',
    matchWords: ['brot', 'bread', 'pain', 'paine'],
    label: 'Pâine',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Normalization helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalize(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Find the category entry that best matches a pantry item name + keywords.
 * Returns the first matching entry or null.
 */
function findCategoryEntry(name = '', searchKeywords = '') {
  const text = normalize(name + ' ' + searchKeywords)
  // Prefer longest keyword match first (most specific)
  let best = null
  let bestLen = 0
  for (const entry of CATEGORY_MAP) {
    for (const kw of entry.keywords) {
      if (text.includes(normalize(kw)) && kw.length > bestLen) {
        best = entry
        bestLen = kw.length
      }
    }
  }
  return best
}

/**
 * Score an Open Prices result item against expected match words.
 * Returns 'buna' | 'posibila' | 'slaba'.
 */
function scoreApiItem(item, matchWords = []) {
  const productName = normalize(item.product?.product_name || '')
  const categories = normalize((item.product?.categories_tags || []).join(' '))
  const combined = productName + ' ' + categories
  const hits = matchWords.filter((w) => combined.includes(normalize(w)))
  if (hits.length >= 2) return 'buna'
  if (hits.length === 1) return 'posibila'
  return 'slaba'
}

// ─────────────────────────────────────────────────────────────────────────────
// Recency
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the best available date string from an Open Prices price item.
 * Uses `date` (actual observed date) → falls back to `created`.
 */
function bestDateStr(item) {
  return item.date || item.created || null
}

/**
 * Classifies price recency.
 * Returns 'fresh' | 'stale' | 'old' | 'unknown'.
 */
export function getPriceRecency(dateStr) {
  if (!dateStr) return 'unknown'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'unknown'
  const ageMs = Date.now() - d.getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  if (ageDays <= DAYS_STALE) return 'fresh'
  if (ageDays <= DAYS_OLD) return 'stale'
  return 'old'
}

export function recencyLabel(recency) {
  if (recency === 'fresh') return null
  if (recency === 'stale') return '⚠️ vechi'
  if (recency === 'old') return '🔴 foarte vechi'
  return '❓ dată necunoscută'
}

// ─────────────────────────────────────────────────────────────────────────────
// API fetch for one product
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches prices from Open Prices API for a single OFacts category tag.
 * Returns an array of raw price items (may be empty on error/timeout).
 */
async function fetchCategoryPrices(categoryTag) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const params = new URLSearchParams({
    categories_tags: categoryTag,
    currency: 'EUR',
    size: String(RESULTS_PER_PRODUCT),
    order_by: '-date',
  })
  try {
    const res = await fetch(`${OPEN_PRICES_API}?${params}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timer)
    if (!res.ok) return []
    const json = await res.json()
    return json.items || []
  } catch {
    clearTimeout(timer)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build result object
// ─────────────────────────────────────────────────────────────────────────────

function buildResult(pantryItem, apiItem, entry) {
  const dateStr = bestDateStr(apiItem)
  const recency = getPriceRecency(dateStr)
  const confidence = scoreApiItem(apiItem, entry.matchWords)
  const storeName =
    apiItem.location?.osm_brand ||
    apiItem.location?.osm_name ||
    null
  const country = apiItem.location?.osm_address_country_code || null
  const foundProductName = apiItem.product?.product_name || null

  return {
    _id: `${pantryItem.id}_${apiItem.id}`,
    pantryItemId: pantryItem.id,
    pantryItemName: pantryItem.name,
    categoryLabel: entry.label,
    foundProductName,
    price: apiItem.price,
    currency: apiItem.currency || 'EUR',
    store: storeName,
    country,
    priceDate: dateStr,
    recency,
    confidence,
    source: 'open_prices',
    openPricesId: apiItem.id,
    productCode: apiItem.product_code || apiItem.product?.code || null,
    imageUrl: apiItem.product?.image_url || null,
    ignored: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export: search for a list of pantry items
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Searches Open Prices for each pantry item that has a known category mapping.
 *
 * @param {Array} pantryItems - Full list of pantry items from Supabase.
 * @param {Object} [opts]
 * @param {number} [opts.maxProducts=MAX_PRODUCTS] - Cap on how many products to search.
 * @param {function} [opts.onProgress] - Optional callback(doneCount, totalCount).
 * @returns {Promise<{ results: Array, notMapped: string[], apiError: boolean }>}
 */
export async function searchPricesForPantry(pantryItems, opts = {}) {
  const maxProducts = opts.maxProducts ?? MAX_PRODUCTS
  const onProgress = opts.onProgress || (() => {})

  // Prioritise items: buy_on_offer | important_for_reserve | below min, then all
  const prioritised = [...pantryItems].sort((a, b) => {
    const scoreA = (a.buy_on_offer ? 4 : 0) + (a.important_for_reserve ? 2 : 0)
    const scoreB = (b.buy_on_offer ? 4 : 0) + (b.important_for_reserve ? 2 : 0)
    return scoreB - scoreA
  })

  const toSearch = []
  const notMapped = []
  for (const item of prioritised) {
    if (toSearch.length >= maxProducts) break
    const entry = findCategoryEntry(item.name, item.search_keywords || '')
    if (entry) {
      toSearch.push({ item, entry })
    } else {
      notMapped.push(item.name)
    }
  }

  const results = []
  let apiError = false
  let done = 0

  // Deduplicate category tags so we don't call the same endpoint twice
  const categoryCache = {}

  for (const { item, entry } of toSearch) {
    let rawItems = categoryCache[entry.category]
    if (!rawItems) {
      rawItems = await fetchCategoryPrices(entry.category)
      categoryCache[entry.category] = rawItems
      if (rawItems.length === 0) apiError = true
    }
    done++
    onProgress(done, toSearch.length)

    // Filter only 'slaba' confidence — show only buna/posibila
    for (const apiItem of rawItems) {
      const result = buildResult(item, apiItem, entry)
      if (result.confidence !== 'slaba') {
        results.push(result)
      }
    }
  }

  return { results, notMapped, apiError }
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage cache helpers (optional, 1h TTL)
// ─────────────────────────────────────────────────────────────────────────────

const LS_KEY = 'kb_price_finder_cache'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export function loadCachedResults() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.timestamp) return null
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function saveCachedResults(results, notMapped) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      timestamp: Date.now(),
      results,
      notMapped,
    }))
  } catch {
    // localStorage full or unavailable – silently skip
  }
}

export function clearPriceCache() {
  try { localStorage.removeItem(LS_KEY) } catch { /* noop */ }
}
