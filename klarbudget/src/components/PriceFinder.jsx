/**
 * PriceFinder — experimental component for KlarBudget Debara.
 *
 * Searches Open Prices (prices.openfoodfacts.org) for community prices
 * matching items from the Pantry. Triggered manually by the user.
 *
 * Rules:
 *  - No auto-refresh / search-as-you-type.
 *  - Max MAX_PRODUCTS per run (enforced in priceFinder.js).
 *  - Results stored in component state + localStorage cache (1 h TTL).
 *  - "Adaugă în Merită acum" saves to kb_weekly_offers via Supabase.
 *  - Does NOT modify DB schema.
 */

import { useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import {
  searchPricesForPantry,
  recencyLabel,
  loadCachedResults,
  saveCachedResults,
  clearPriceCache,
} from '../lib/priceFinder'
import { encodeOfferNotes, toDbSourceColumn } from '../lib/offerSources'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString('ro-RO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch {
    return null
  }
}

function confidenceBadge(confidence) {
  if (confidence === 'buna') return { label: '✅ potrivire bună', color: '#065f46', bg: '#d1fae5' }
  return { label: '🔶 potrivire posibilă', color: '#92400e', bg: '#fef3c7' }
}

// ─────────────────────────────────────────────────────────────────────────────
// PriceFinder component
// ─────────────────────────────────────────────────────────────────────────────

export function PriceFinder({ pantryItems = [], dbUserId }) {
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [results, setResults] = useState([])
  const [notMapped, setNotMapped] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [notice, setNotice] = useState('')
  const [ignored, setIgnored] = useState(new Set())
  const [addedToMerita, setAddedToMerita] = useState(new Set())

  const showNotice = (msg) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 4000)
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  const runSearch = useCallback(async () => {
    if (pantryItems.length === 0) {
      showNotice('Nu există produse în Debara pentru a căuta prețuri.')
      return
    }
    setStatus('loading')
    setProgress({ done: 0, total: 0 })
    setResults([])
    setNotMapped([])
    clearPriceCache()

    const { results: found, notMapped: nm, apiError } = await searchPricesForPantry(
      pantryItems,
      {
        onProgress: (done, total) => setProgress({ done, total }),
      },
    )

    setResults(found)
    setNotMapped(nm)
    saveCachedResults(found, nm)

    if (found.length === 0 && apiError) {
      setStatus('error')
    } else {
      setStatus('done')
    }
  }, [pantryItems])

  const loadCache = useCallback(() => {
    const cached = loadCachedResults()
    if (!cached) {
      showNotice('Niciun rezultat în cache. Apasă „Caută prețuri" pentru o căutare nouă.')
      return
    }
    setResults(cached.results || [])
    setNotMapped(cached.notMapped || [])
    setStatus('done')
    showNotice('Rezultate încărcate din cache (mai puțin de 1 oră).')
  }, [])

  // ── Add to Merită Acum ───────────────────────────────────────────────────────

  const addToMeritaAcum = useCallback(async (result) => {
    if (!dbUserId) {
      showNotice('Trebuie să fii autentificat pentru a salva.')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const validUntil = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

    const payload = {
      user_id: dbUserId,
      product_name: result.pantryItemName,
      store_name: result.store || 'Open Prices',
      price: result.price,
      currency: result.currency || 'EUR',
      valid_from: result.priceDate ? result.priceDate.slice(0, 10) : today,
      valid_until: validUntil,
      source: toDbSourceColumn('open_prices'),
      status: 'confirmed',
      confidence: result.confidence === 'buna' ? 0.8 : 0.5,
      notes: encodeOfferNotes(
        {
          offer_source: 'open_prices',
          source_url: result.productCode
            ? `https://world.openfoodfacts.org/product/${result.productCode}`
            : null,
          barcode: result.productCode || null,
          open_food_facts_id: result.openPricesId ? String(result.openPricesId) : null,
        },
        result.foundProductName
          ? `Open Prices: "${result.foundProductName}" — Preț comunitar, verifică în magazin.`
          : 'Preț comunitar din Open Prices, verifică în magazin.',
      ),
    }

    const { error } = await supabase.from('kb_weekly_offers').insert([payload])
    if (error) {
      showNotice('Nu am putut salva oferta. Încearcă din nou.')
    } else {
      setAddedToMerita((prev) => new Set(prev).add(result._id))
      showNotice(`✅ "${result.pantryItemName}" adăugat în Merită acum.`)
    }
  }, [dbUserId])

  // ── Render ───────────────────────────────────────────────────────────────────

  const visibleResults = results.filter((r) => !ignored.has(r._id))

  return (
    <section className="section pf-section" style={{ marginTop: '1rem' }}>
      {/* Header */}
      <div className="section-title" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>🔍 Price Finder — experimental</h3>
          <p className="muted" style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
            Caută prețuri recente din surse publice / comunitare pentru produsele din Debara.
            Prețurile trebuie verificate în magazin.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="secondary"
            onClick={runSearch}
            disabled={status === 'loading'}
            style={{ fontSize: '0.9rem' }}
          >
            {status === 'loading' ? '⏳ Se caută...' : '🔍 Caută prețuri pentru Debara'}
          </button>
          {status === 'idle' && loadCachedResults() && (
            <button type="button" className="ghost" onClick={loadCache} style={{ fontSize: '0.82rem' }}>
              ♻️ Cache
            </button>
          )}
        </div>
      </div>

      {/* Experimental notice */}
      <div className="notice" style={{ fontSize: '0.82rem', padding: '0.5rem 0.85rem', marginBottom: '0.5rem' }}>
        ⚠️ <strong>Căutarea este experimentală.</strong> Prețurile vin din surse comunitare (Open Prices / Open Food Facts)
        și pot fi vechi sau inexacte. Verifică întotdeauna în magazin.
      </div>

      {/* Progress */}
      {status === 'loading' && (
        <div className="notice" style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem' }}>
          ⏳ Căutare în curs…
          {progress.total > 0 && ` (${progress.done} / ${progress.total} produse)`}
        </div>
      )}

      {/* API error */}
      {status === 'error' && (
        <div className="notice danger" style={{ fontSize: '0.85rem' }}>
          Nu am putut căuta prețuri acum. API-ul Open Prices nu a răspuns. Încearcă mai târziu.
        </div>
      )}

      {/* Toast */}
      {notice && (
        <div className="pantry-toast" style={{ position: 'relative', top: 0, marginBottom: '0.5rem' }}>
          {notice}
        </div>
      )}

      {/* Results */}
      {status === 'done' && (
        <>
          {visibleResults.length === 0 ? (
            <div style={{ padding: '1.5rem 0.5rem', textAlign: 'center' }}>
              <p className="muted">
                Nu am găsit prețuri utile momentan pentru produsele selectate.
                {results.length > 0 && ignored.size > 0 && ' (Toate rezultatele au fost ignorate.)'}
              </p>
            </div>
          ) : (
            <>
              <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                {visibleResults.length} rezultat(e) găsit(e) · Sursă: Open Prices (prices.openfoodfacts.org)
              </p>
              <div className="pf-results-list">
                {visibleResults.map((r) => {
                  const badge = confidenceBadge(r.confidence)
                  const staleness = recencyLabel(r.recency)
                  const dateFormatted = formatDate(r.priceDate)
                  const alreadyAdded = addedToMerita.has(r._id)
                  return (
                    <div key={r._id} className="pf-result-card">
                      {/* Product names */}
                      <div className="pf-result-header">
                        <span className="pf-item-name">{r.pantryItemName}</span>
                        {r.foundProductName && r.foundProductName !== r.pantryItemName && (
                          <span className="pf-found-name muted">→ {r.foundProductName}</span>
                        )}
                      </div>

                      {/* Price + store */}
                      <div className="pf-result-meta">
                        <span className="pf-price">
                          {r.price != null ? `${r.price.toFixed(2)} ${r.currency}` : '— €'}
                        </span>
                        {r.store && (
                          <span className="pf-store muted">
                            🏪 {r.store}{r.country && r.country !== 'DE' ? ` (${r.country})` : ''}
                          </span>
                        )}
                      </div>

                      {/* Badges */}
                      <div className="pf-result-badges">
                        <span
                          className="pf-badge"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                        {staleness && (
                          <span className="pf-badge pf-badge-stale">
                            {staleness}
                          </span>
                        )}
                        {dateFormatted && (
                          <span className="pf-badge pf-badge-date">
                            📅 {dateFormatted}
                          </span>
                        )}
                        <span className="pf-badge pf-badge-community">
                          Preț comunitar · verifică în magazin
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="pf-result-actions">
                        {alreadyAdded ? (
                          <span className="muted" style={{ fontSize: '0.82rem' }}>✅ Adăugat în Merită acum</span>
                        ) : (
                          <button
                            type="button"
                            className="secondary"
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                            onClick={() => addToMeritaAcum(r)}
                          >
                            ⭐ Adaugă în Merită acum
                          </button>
                        )}
                        <button
                          type="button"
                          className="ghost"
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', color: '#6b7280' }}
                          onClick={() => setIgnored((prev) => new Set(prev).add(r._id))}
                        >
                          Ignoră
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Not mapped info */}
          {notMapped.length > 0 && (
            <details className="pf-not-mapped" style={{ marginTop: '0.75rem' }}>
              <summary className="muted" style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                {notMapped.length} produs(e) fără mapare Open Prices (click pentru detalii)
              </summary>
              <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.3rem' }}>
                {notMapped.join(', ')} — Nu am găsit suficiente date în Open Prices pentru aceste produse.
              </p>
            </details>
          )}
        </>
      )}
    </section>
  )
}
