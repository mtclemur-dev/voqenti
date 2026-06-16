/**
 * SmartShopping — Cumpărături: 3 taburi funcționale.
 *
 * Tab 1 ⭐ Merită acum  — oferte active care se potrivesc cu Debara / lista ta
 * Tab 2 🏷️ Oferte       — adaugă / șterge oferte curente
 * Tab 3 🛒 Lista mea    — lista de cumpărături cu adăugare rapidă
 *
 * Eliminat (nu funcționa): import PDF, KaufDA demo, bonuri, magazine,
 *   istoric prețuri, surse, preview oferte, search / cele mai bune prețuri.
 */

import { useMemo, useState } from 'react'
import { formatMoney, isoDate, toNumber } from '../lib/finance'
import {
  productMatch,
  getOfferValidityStatus,
  normalizedUnitLabel,
  getOfferValidityStatusLabel,
} from '../lib/shoppingHelpers'
import {
  OFFER_SOURCE_OPTIONS,
  SHOPPING_STORES,
  buildManualOfferPayload,
  getOfferSourceLabel,
  hydrateOffer,
} from '../lib/offerSources'

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

function SmartShopping({
  currency,
  locale,
  offers = [],
  shoppingList = [],
  pantryItems = [],
  schemaReady,
  journalEntries = [],
  receiptItems = [],
  tab,
  onSaveItem,
  onDelete,
  onSaveManualOffer,
  onTabChange,
  // API-compat props intentionally not destructured (ignored)
}) {
  // Normalize old tab values → new 3-tab keys
  const activeTab = (() => {
    if (!tab || tab === 'smart' || tab === 'best' || tab === 'search') return 'smart'
    if (tab === 'offers' || tab === 'kaufda' || tab === 'storejournal') return 'offers'
    if (tab === 'list') return 'list'
    // Admin sub-tabs redirect to offers (add form)
    if (['import', 'manual', 'receipts', 'stores', 'history', 'sources', 'admin'].includes(tab)) return 'offers'
    return 'smart'
  })()

  // ── Compute active offers ───────────────────────────────────────────────
  const offersWithValidity = useMemo(
    () => offers.map((o) => {
      const h = hydrateOffer(o)
      return { ...h, validityStatus: getOfferValidityStatus(h) }
    }),
    [offers],
  )
  const activeOffers = useMemo(
    () => offersWithValidity.filter((o) => o.validityStatus === 'active'),
    [offersWithValidity],
  )

  // ── Compute recommendations ─────────────────────────────────────────────
  const recommendations = useMemo(() => {
    const list = []
    const seenKeys = new Set()

    // Compute product purchase frequency from journal
    const counts = {}
    const addCount = (name) => {
      if (!name) return
      const n = name.trim().toLowerCase()
      if (n.length < 3 || n === 'diverse' || n.includes('bon ')) return
      counts[n] = (counts[n] || 0) + 1
    }
    if (receiptItems) receiptItems.forEach(i => addCount(i.product_name))
    if (journalEntries) journalEntries.forEach(i => {
      if (i.product_name && i.product_name !== 'Bon cumparaturi') addCount(i.product_name)
    })

    const addRec = (offer, reason, priority, approx = false) => {
      const key = `${offer.product_name?.toLowerCase()}|${offer.store_name?.toLowerCase()}|${offer.price}`
      if (seenKeys.has(key)) return
      seenKeys.add(key)
      list.push({
        offer,
        product: offer.product_name,
        store: offer.store_name,
        price: offer.price,
        unit_price: offer.unit_price,
        unit: offer.unit,
        valid_until: offer.valid_until,
        reason,
        priority,
        approx,
        source: getOfferSourceLabel(offer.offer_source || offer.source),
      })
    }

    activeOffers.forEach((offer) => {
      // Priority 1 – below min in pantry
      const belowMin = pantryItems.find((item) => {
        const m = productMatch(item.name, offer.product_name, item.search_keywords || '')
        return m.match && (Number(item.quantity) || 0) < (Number(item.min_quantity) || 1)
      })
      if (belowMin) {
        addRec(offer, 'Sub minim în Debară', 1,
          productMatch(belowMin.name, offer.product_name, belowMin.search_keywords || '').approx)
        return
      }
      // Priority 2 – buy on offer in pantry
      const buyOnOffer = pantryItems.find((item) => {
        const m = productMatch(item.name, offer.product_name, item.search_keywords || '')
        return m.match && item.buy_on_offer
      })
      if (buyOnOffer) {
        addRec(offer, 'Cumpără când este ofertă', 2,
          productMatch(buyOnOffer.name, offer.product_name, buyOnOffer.search_keywords || '').approx)
        return
      }
      // Priority 3 – important for reserve in pantry
      const important = pantryItems.find((item) => {
        const m = productMatch(item.name, offer.product_name, item.search_keywords || '')
        return m.match && item.important_for_reserve
      })
      if (important) {
        addRec(offer, 'Important pentru rezervă', 3,
          productMatch(important.name, offer.product_name, important.search_keywords || '').approx)
        return
      }
      // Priority 4 – in shopping list
      const inList = shoppingList.find((item) =>
        productMatch(item.product_name, offer.product_name).match
      )
      if (inList) {
        addRec(offer, 'Este în Lista mea', 4,
          productMatch(inList.product_name, offer.product_name).approx)
        return
      }
      // Priority 5 – bought frequently
      const freq = Object.keys(counts).find(n =>
        counts[n] >= 2 && productMatch(n, offer.product_name).match
      )
      if (freq) {
        addRec(offer, 'Produs frecvent', 5, productMatch(freq, offer.product_name).approx)
      }
    })

    return list.sort((a, b) => a.priority - b.priority).slice(0, 20)
  }, [activeOffers, shoppingList, pantryItems, receiptItems, journalEntries])

  const belowMinCount = pantryItems.filter(
    i => (Number(i.quantity) || 0) < (Number(i.min_quantity) || 1)
  ).length

  return (
    <>
      {/* ── Header + tabbar ─────────────────────────────────────────── */}
      <section className="section">
        <div className="section-title">
          <div>
            <h2>🛒 Cumpărături</h2>
            <p className="muted">Oferte active, recomandări și lista familiei.</p>
          </div>
        </div>
        {!schemaReady && (
          <div className="notice danger">
            Tabelele pentru cumpărături nu există încă. Rulează migrarea Supabase.
          </div>
        )}
        <div className="tabbar inline-tabs">
          {[
            { key: 'smart',  label: '⭐ Merită acum' },
            { key: 'offers', label: '🏷️ Oferte' },
            { key: 'list',   label: '🛒 Lista mea' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={activeTab === key ? 'active' : ''}
              onClick={() => onTabChange(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Tab 1: Merită acum ────────────────────────────────────────── */}
      {activeTab === 'smart' && (
        <MeritaAcumTab
          recommendations={recommendations}
          activeOffers={activeOffers}
          belowMinCount={belowMinCount}
          currency={currency}
          locale={locale}
          onSaveItem={onSaveItem}
          onTabChange={onTabChange}
        />
      )}

      {/* ── Tab 2: Oferte ────────────────────────────────────────────── */}
      {activeTab === 'offers' && (
        <OfferManageTab
          offers={offersWithValidity}
          currency={currency}
          locale={locale}
          onSaveManualOffer={onSaveManualOffer}
          onDelete={(item) => onDelete('kb_weekly_offers', item)}
        />
      )}

      {/* ── Tab 3: Lista mea ─────────────────────────────────────────── */}
      {activeTab === 'list' && (
        <ShoppingListSimpleTab
          items={shoppingList}
          onSaveItem={onSaveItem}
          onDelete={(item) => onDelete('kb_shopping_list', item)}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1: Merită acum
// ─────────────────────────────────────────────────────────────────────────────

const REASON_COLORS = {
  'Sub minim în Debară':    { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  'Cumpără când este ofertă': { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  'Important pentru rezervă': { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  'Este în Lista mea':      { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  'Produs frecvent':        { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
}

function MeritaAcumTab({ recommendations, activeOffers, belowMinCount, currency, locale, onSaveItem, onTabChange }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return recommendations
    const q = search.toLowerCase()
    return recommendations.filter(r =>
      r.product.toLowerCase().includes(q) ||
      r.store.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q),
    )
  }, [recommendations, search])

  return (
    <section className="section">
      {/* Summary strip */}
      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <SummaryChip color="#065f46" bg="#d1fae5" icon="⭐" value={recommendations.length} label="recomandări" />
        <SummaryChip color="#c2410c" bg="#fff7ed" icon="⚠️" value={belowMinCount} label="sub minim" />
        <SummaryChip color="#1d4ed8" bg="#eff6ff" icon="🏷️" value={activeOffers.length} label="oferte active" />
      </div>

      {/* Empty state */}
      {activeOffers.length === 0 && (
        <div className="notice" style={{ background: '#fef3c7', borderColor: '#fbbf24', color: '#92400e', marginBottom: '1rem' }}>
          <strong>Nicio ofertă activă.</strong> Adaugă prima ofertă în tabul <strong>🏷️ Oferte</strong> pentru a primi recomandări.
          <br />
          <button
            type="button"
            className="secondary"
            style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}
            onClick={() => onTabChange('offers')}
          >
            🏷️ Adaugă ofertă →
          </button>
        </div>
      )}

      {/* Search */}
      {recommendations.length > 0 && (
        <input
          type="search"
          placeholder="🔍 Filtrează recomandări..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', marginBottom: '1rem', padding: '0.6rem 0.85rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.93rem', boxSizing: 'border-box' }}
        />
      )}

      {/* Recommendation cards */}
      {filtered.length === 0 && recommendations.length > 0 && (
        <p className="muted" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          Niciun rezultat pentru „{search}".
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '0.85rem' }}>
        {filtered.map((rec, idx) => {
          const rc = REASON_COLORS[rec.reason] || { bg: '#f9fafb', color: '#374151', border: '#e5e7eb' }
          return (
            <article
              key={`${rec.product}|${rec.store}|${idx}`}
              style={{
                background: '#fff',
                border: `1px solid ${rc.border}`,
                borderRadius: '12px',
                padding: '0.9rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              {/* Reason badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  fontSize: '0.73rem', fontWeight: 700, padding: '0.2rem 0.55rem',
                  borderRadius: '999px', background: rc.bg, color: rc.color, border: `1px solid ${rc.border}`,
                }}>
                  {rec.reason}
                </span>
                {rec.approx && (
                  <span style={{ fontSize: '0.68rem', color: '#9ca3af', background: '#f3f4f6', padding: '0.12rem 0.4rem', borderRadius: '4px' }}>
                    ~ potrivire
                  </span>
                )}
              </div>

              {/* Product name */}
              <strong style={{ fontSize: '1rem', color: '#111827', lineHeight: '1.3' }}>{rec.product}</strong>

              {/* Price + store */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.88rem', color: '#4b5563' }}>
                <span>🏪 {rec.store}</span>
                <span style={{ color: '#059669', fontWeight: 700, fontSize: '1.05rem' }}>
                  {formatMoney(rec.price, currency, locale)}
                  {rec.unit_price ? (
                    <small style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.76rem', marginLeft: '0.2rem' }}>
                      ({formatMoney(rec.unit_price, currency, locale)}/{normalizedUnitLabel(rec.unit)})
                    </small>
                  ) : null}
                </span>
              </div>

              {/* Source + expiry */}
              <div style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.2rem' }}>
                <span>Sursă: {rec.source}</span>
                {rec.valid_until && <span style={{ color: '#ef4444', fontWeight: 600 }}>⏳ până {rec.valid_until}</span>}
              </div>

              {/* Action */}
              <button
                type="button"
                style={{
                  marginTop: '0.3rem', padding: '0.4rem 0.75rem',
                  background: '#17463c', color: '#fff', border: 'none',
                  borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700,
                  cursor: 'pointer', width: '100%',
                }}
                onClick={() => onSaveItem({
                  product_name: rec.product,
                  preferred_store: rec.store,
                  category: 'mâncare',
                  priority: rec.priority <= 2 ? 'important' : 'normal',
                  notes: `Ofertă ${rec.store} — ${rec.price}€`,
                })}
              >
                🛒 Adaugă în Lista mea
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Oferte — adaugă / listează oferte
// ─────────────────────────────────────────────────────────────────────────────

function OfferManageTab({ offers, currency, locale, onSaveManualOffer, onDelete }) {
  const [showForm, setShowForm] = useState(false)
  const [showExpired, setShowExpired] = useState(false)

  const visible = useMemo(() => {
    const ranked = { active: 0, future: 1, unknown: 2, expired: 3 }
    return [...offers]
      .filter(o => showExpired || o.validityStatus !== 'expired')
      .sort((a, b) => (ranked[a.validityStatus] ?? 9) - (ranked[b.validityStatus] ?? 9)
        || String(a.store_name || '').localeCompare(String(b.store_name || ''), 'ro'))
  }, [offers, showExpired])

  const activeCount = offers.filter(o => o.validityStatus === 'active').length
  const expiredCount = offers.filter(o => o.validityStatus === 'expired').length

  return (
    <section className="section">
      {/* Header + controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>🏷️ Oferte curente</h3>
          <p className="muted" style={{ fontSize: '0.82rem', margin: '0.1rem 0 0' }}>
            {activeCount} active · {expiredCount} expirate
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="checkbox" style={{ fontSize: '0.82rem' }}>
            <input type="checkbox" checked={showExpired} onChange={e => setShowExpired(e.target.checked)} />
            Și expirate
          </label>
          <button
            type="button"
            onClick={() => setShowForm(f => !f)}
            style={{ fontSize: '0.88rem', padding: '0.4rem 0.85rem' }}
          >
            {showForm ? '✕ Anulează' : '➕ Adaugă ofertă'}
          </button>
        </div>
      </div>

      {/* Inline add form */}
      {showForm && (
        <QuickOfferForm
          currency={currency}
          locale={locale}
          onSave={async (payload) => {
            await onSaveManualOffer(payload)
            setShowForm(false)
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Offers list */}
      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#6b7280' }}>
          <p style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>🏷️</p>
          <p>Nicio ofertă salvată încă.</p>
          <button type="button" style={{ marginTop: '0.5rem', fontSize: '0.88rem' }} onClick={() => setShowForm(true)}>
            ➕ Adaugă prima ofertă
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {visible.map((offer) => (
            <OfferRow
              key={offer.id}
              offer={offer}
              currency={currency}
              locale={locale}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function OfferRow({ offer, currency, locale, onDelete }) {
  const { label, color, bg } = getOfferValidityStatusLabel(offer.validityStatus) || {}
  const source = getOfferSourceLabel(offer.offer_source || offer.source)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
      padding: '0.6rem 0.75rem', borderBottom: '1px solid #f3f4f6',
      fontSize: '0.88rem', opacity: offer.validityStatus === 'expired' ? 0.6 : 1,
    }}>
      <span style={{
        minWidth: '72px', fontSize: '0.72rem', fontWeight: 700, padding: '0.18rem 0.45rem',
        borderRadius: '6px', background: bg, color, textAlign: 'center', flexShrink: 0,
      }}>
        {label}
      </span>
      <strong style={{ flex: '1 1 140px', color: '#111827' }}>{offer.product_name}</strong>
      <span style={{ flex: '0 0 auto', color: '#059669', fontWeight: 700 }}>
        {formatMoney(offer.price, currency, locale)}
        {offer.unit_price ? (
          <small style={{ color: '#6b7280', fontWeight: 400, marginLeft: '0.2rem', fontSize: '0.76rem' }}>
            ({formatMoney(offer.unit_price, currency, locale)}/{normalizedUnitLabel(offer.unit)})
          </small>
        ) : null}
      </span>
      <span style={{ color: '#4b5563', flex: '0 1 80px' }}>🏪 {offer.store_name}</span>
      <span className="muted" style={{ fontSize: '0.76rem', flex: '0 1 130px' }}>
        {offer.valid_from && `${offer.valid_from}`}
        {offer.valid_until && ` – ${offer.valid_until}`}
        {source !== 'Necunoscut' && ` · ${source}`}
      </span>
      <button
        type="button"
        className="ghost"
        style={{ color: '#b91c1c', fontSize: '0.82rem', padding: '0.2rem 0.45rem', flexShrink: 0 }}
        onClick={() => onDelete(offer)}
        title="Șterge oferta"
      >
        🗑️
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick offer add form (inline, minimal)
// ─────────────────────────────────────────────────────────────────────────────

function QuickOfferForm({ currency, locale, onSave, onCancel }) {
  const [form, setForm] = useState(() => {
    const today = isoDate(new Date())
    const next = new Date(); next.setDate(next.getDate() + 7)
    return {
      offer_source: 'manual',
      store_name: '',
      product_name: '',
      price: '',
      quantity: '',
      unit: '',
      valid_from: today,
      valid_until: isoDate(next),
      notes: '',
    }
  })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.product_name.trim() || !form.store_name || !form.price) {
      setNotice('Completează magazinul, produsul și prețul.')
      return
    }
    setSaving(true)
    setNotice('')
    try {
      await onSave(buildManualOfferPayload(form))
    } catch (err) {
      setNotice(err?.message || 'Nu s-a putut salva oferta.')
      setSaving(false)
    }
  }

  return (
    <div style={{
      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px',
      padding: '1rem', marginBottom: '1rem',
    }}>
      <h4 style={{ margin: '0 0 0.75rem' }}>➕ Adaugă ofertă nouă</h4>
      {notice && <div className="notice" style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>{notice}</div>}
      <form onSubmit={submit}>
        <div className="form-grid">
          <label>
            Magazin *
            <select value={form.store_name} onChange={e => set('store_name', e.target.value)} required>
              <option value="">Alege magazin</option>
              {SHOPPING_STORES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>
            Produs *
            <input
              type="text"
              value={form.product_name}
              onChange={e => set('product_name', e.target.value)}
              placeholder="ex: Lapte 1L, Orez 5kg..."
              required
            />
          </label>
          <label>
            Preț (€) *
            <input type="number" min="0" step="0.01" value={form.price}
              onChange={e => set('price', e.target.value)} placeholder="0.00" required />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <label style={{ flex: 1 }}>
              Cantitate
              <input type="number" min="0" step="0.001" value={form.quantity}
                onChange={e => set('quantity', e.target.value)} placeholder="ex: 1" />
            </label>
            <label style={{ flex: 1 }}>
              Unitate
              <input type="text" value={form.unit}
                onChange={e => set('unit', e.target.value)} placeholder="L, kg, buc" />
            </label>
          </div>
          <label>
            Valabil de la
            <input type="date" value={form.valid_from} onChange={e => set('valid_from', e.target.value)} />
          </label>
          <label>
            Valabil până la
            <input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} />
          </label>
          <label>
            Sursă
            <select value={form.offer_source} onChange={e => set('offer_source', e.target.value)}>
              {OFFER_SOURCE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label>
            Notițe
            <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="opțional" />
          </label>
        </div>
        <div style={{ fontSize: '0.82rem', color: '#4b5563', margin: '0.4rem 0 0.75rem' }}>
          Preț: <strong>{form.price ? formatMoney(toNumber(form.price), currency, locale) : '—'}</strong>
          {form.quantity && form.unit ? ` · ${form.quantity} ${form.unit}` : ''}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={saving}>
            {saving ? 'Se salvează...' : '✅ Salvează oferta'}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>Anulează</button>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3: Lista mea
// ─────────────────────────────────────────────────────────────────────────────

const SHOPPING_CATEGORIES = [
  'mâncare', 'băuturi', 'igienă', 'curățenie', 'copii', 'îngrijire', 'altele',
]
const SHOPPING_PRIORITIES = [
  { key: 'important', label: '🔴 Important' },
  { key: 'normal', label: '🟡 Normal' },
  { key: 'low', label: '🟢 Opțional' },
]

function ShoppingListSimpleTab({ items, onSaveItem, onDelete }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ product_name: '', preferred_store: '', category: 'mâncare', priority: 'normal', notes: '' })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const unpurchased = items.filter(i => !i.purchased)
  const purchased = items.filter(i => i.purchased)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.product_name.trim()) { setNotice('Introdu numele produsului.'); return }
    setSaving(true)
    setNotice('')
    try {
      await onSaveItem({ ...form })
      setForm({ product_name: '', preferred_store: '', category: 'mâncare', priority: 'normal', notes: '' })
      setShowForm(false)
    } catch (err) {
      setNotice(err?.message || 'Nu s-a putut salva produsul.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="section">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>🛒 Lista mea de cumpărături</h3>
          <p className="muted" style={{ fontSize: '0.82rem', margin: '0.1rem 0 0' }}>
            {unpurchased.length} produse de cumpărat{purchased.length > 0 ? ` · ${purchased.length} cumpărate` : ''}
          </p>
        </div>
        <button type="button" onClick={() => setShowForm(f => !f)} style={{ fontSize: '0.88rem', padding: '0.4rem 0.85rem' }}>
          {showForm ? '✕ Anulează' : '➕ Adaugă produs'}
        </button>
      </div>

      {/* Inline add form */}
      {showForm && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
          <h4 style={{ margin: '0 0 0.75rem' }}>➕ Produs nou</h4>
          {notice && <div className="notice" style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>{notice}</div>}
          <form onSubmit={submit}>
            <div className="form-grid">
              <label>
                Produs *
                <input type="text" value={form.product_name} onChange={e => set('product_name', e.target.value)}
                  placeholder="ex: Lapte, Pâine, Detergent..." autoFocus required />
              </label>
              <label>
                Magazin preferat
                <select value={form.preferred_store} onChange={e => set('preferred_store', e.target.value)}>
                  <option value="">Oriunde</option>
                  {SHOPPING_STORES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>
                Categorie
                <select value={form.category} onChange={e => set('category', e.target.value)}>
                  {SHOPPING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>
                Prioritate
                <select value={form.priority} onChange={e => set('priority', e.target.value)}>
                  {SHOPPING_PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="submit" disabled={saving}>{saving ? 'Se salvează...' : '✅ Adaugă'}</button>
              <button type="button" className="secondary" onClick={() => setShowForm(false)}>Anulează</button>
            </div>
          </form>
        </div>
      )}

      {/* Items to buy */}
      {unpurchased.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
          <p style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>🛒</p>
          <p>Lista ta e goală.</p>
          <button type="button" style={{ marginTop: '0.5rem', fontSize: '0.88rem' }} onClick={() => setShowForm(true)}>
            ➕ Adaugă primul produs
          </button>
        </div>
      )}

      {unpurchased.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          {unpurchased.map(item => (
            <ShoppingItem key={item.id} item={item} onDelete={onDelete} onSaveItem={onSaveItem} />
          ))}
        </div>
      )}

      {/* Purchased */}
      {purchased.length > 0 && (
        <details style={{ marginTop: '0.75rem' }}>
          <summary className="muted" style={{ cursor: 'pointer', fontSize: '0.85rem', padding: '0.3rem 0' }}>
            ✅ Cumpărate ({purchased.length})
          </summary>
          <div style={{ marginTop: '0.35rem', opacity: 0.6 }}>
            {purchased.map(item => (
              <ShoppingItem key={item.id} item={item} onDelete={onDelete} onSaveItem={onSaveItem} />
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

function ShoppingItem({ item, onDelete, onSaveItem }) {
  const prioColors = { important: '#dc2626', normal: '#d97706', low: '#16a34a' }
  const prioColor = prioColors[item.priority] || '#6b7280'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
      padding: '0.55rem 0.75rem', borderBottom: '1px solid #f3f4f6', fontSize: '0.88rem',
      opacity: item.purchased ? 0.55 : 1,
    }}>
      <button
        type="button"
        title={item.purchased ? 'Marchează necumpărat' : 'Marchează cumpărat'}
        style={{
          width: '22px', height: '22px', border: `2px solid ${item.purchased ? '#16a34a' : '#d1d5db'}`,
          borderRadius: '50%', background: item.purchased ? '#16a34a' : 'transparent',
          cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '0.75rem',
        }}
        onClick={() => onSaveItem({ ...item, purchased: !item.purchased })}
      >
        {item.purchased ? '✓' : ''}
      </button>
      <span style={{
        flex: '1 1 140px', fontWeight: 600, color: '#111827',
        textDecoration: item.purchased ? 'line-through' : 'none',
      }}>
        {item.product_name}
      </span>
      <span className="muted" style={{ fontSize: '0.76rem' }}>
        {item.category && `${item.category}`}
        {item.preferred_store && ` · ${item.preferred_store}`}
      </span>
      <span style={{ fontSize: '0.72rem', color: prioColor, fontWeight: 700, flexShrink: 0 }}>
        ● {item.priority || 'normal'}
      </span>
      {item.notes && (
        <span className="muted" style={{ fontSize: '0.75rem', fontStyle: 'italic', flex: '1 0 100%' }}>
          📝 {item.notes}
        </span>
      )}
      <button
        type="button"
        className="ghost"
        style={{ color: '#b91c1c', fontSize: '0.82rem', padding: '0.2rem 0.4rem', flexShrink: 0 }}
        onClick={() => onDelete(item)}
        title="Șterge"
      >
        🗑️
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: summary chip
// ─────────────────────────────────────────────────────────────────────────────

function SummaryChip({ color, bg, icon, value, label }) {
  return (
    <div style={{
      background: bg, border: `1px solid ${color}33`, borderRadius: '10px',
      padding: '0.5rem 0.9rem', fontSize: '0.85rem', fontWeight: 600, color,
    }}>
      {icon} {value} {label}
    </div>
  )
}

export { SmartShopping }
