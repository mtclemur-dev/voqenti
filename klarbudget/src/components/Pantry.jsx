import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { productMatch, getOfferValidityStatus } from '../lib/shoppingHelpers'

// ============================================================
// Constante
// ============================================================

const CATEGORIES = [
  { key: 'Apă',              icon: '💧' },
  { key: 'Alimente de bază', icon: '🌾' },
  { key: 'Conserve',         icon: '🥫' },
  { key: 'Igienă',           icon: '🧼' },
  { key: 'Curățenie',        icon: '🧽' },
  { key: 'Copii',            icon: '🧸' },
  { key: 'Prim ajutor',      icon: '🩹' },
  { key: 'Energie / baterii',icon: '🔋' },
  { key: 'Altele',           icon: '📦' },
]

const UNITS = ['buc', 'pachete', 'kg', 'g', 'litri', 'sticle', 'doze', 'role', 'cutii']

const STORE_NAMES = ['Netto', 'Norma', 'Lidl', 'Aldi', 'Rewe', 'Kaufland', 'Edeka', 'dm', 'Rossmann', 'Globus', 'Penny', 'Mega Image']

const RECOMMENDED_PRODUCTS = [
  { name: 'Apă plată',              category: 'Apă',              unit: 'sticle', min_quantity: 6 },
  { name: 'Apă minerală',           category: 'Apă',              unit: 'sticle', min_quantity: 6 },
  { name: 'Orez',                   category: 'Alimente de bază', unit: 'kg',     min_quantity: 2 },
  { name: 'Paste',                  category: 'Alimente de bază', unit: 'pachete',min_quantity: 3 },
  { name: 'Făină',                  category: 'Alimente de bază', unit: 'kg',     min_quantity: 2 },
  { name: 'Zahăr',                  category: 'Alimente de bază', unit: 'kg',     min_quantity: 1 },
  { name: 'Sare',                   category: 'Alimente de bază', unit: 'pachete',min_quantity: 2 },
  { name: 'Ulei',                   category: 'Alimente de bază', unit: 'sticle', min_quantity: 2 },
  { name: 'Mălai',                  category: 'Alimente de bază', unit: 'kg',     min_quantity: 1 },
  { name: 'Fulgi de ovăz',          category: 'Alimente de bază', unit: 'pachete',min_quantity: 2 },
  { name: 'Lapte UHT',              category: 'Alimente de bază', unit: 'sticle', min_quantity: 4 },
  { name: 'Roșii la conservă',      category: 'Conserve',         unit: 'cutii',  min_quantity: 4 },
  { name: 'Fasole la conservă',     category: 'Conserve',         unit: 'cutii',  min_quantity: 3 },
  { name: 'Porumb',                 category: 'Conserve',         unit: 'cutii',  min_quantity: 2 },
  { name: 'Mazăre',                 category: 'Conserve',         unit: 'cutii',  min_quantity: 2 },
  { name: 'Ton',                    category: 'Conserve',         unit: 'cutii',  min_quantity: 4 },
  { name: 'Pește la conservă',      category: 'Conserve',         unit: 'cutii',  min_quantity: 2 },
  { name: 'Gem',                    category: 'Conserve',         unit: 'buc',    min_quantity: 2 },
  { name: 'Miere',                  category: 'Conserve',         unit: 'buc',    min_quantity: 1 },
  { name: 'Hârtie igienică',        category: 'Igienă',           unit: 'role',   min_quantity: 8 },
  { name: 'Săpun',                  category: 'Igienă',           unit: 'buc',    min_quantity: 3 },
  { name: 'Șampon',                 category: 'Igienă',           unit: 'buc',    min_quantity: 2 },
  { name: 'Pastă de dinți',         category: 'Igienă',           unit: 'buc',    min_quantity: 2 },
  { name: 'Șervețele umede',        category: 'Igienă',           unit: 'pachete',min_quantity: 3 },
  { name: 'Detergent rufe',         category: 'Curățenie',        unit: 'buc',    min_quantity: 1 },
  { name: 'Detergent vase',         category: 'Curățenie',        unit: 'buc',    min_quantity: 2 },
  { name: 'Capsule mașină vase',    category: 'Curățenie',        unit: 'pachete',min_quantity: 1 },
  { name: 'Soluție universală',     category: 'Curățenie',        unit: 'buc',    min_quantity: 1 },
  { name: 'Saci gunoi',             category: 'Curățenie',        unit: 'role',   min_quantity: 2 },
  { name: 'Hârtie bucătărie',       category: 'Curățenie',        unit: 'role',   min_quantity: 3 },
  { name: 'Plasturi',               category: 'Prim ajutor',      unit: 'cutii',  min_quantity: 2 },
  { name: 'Dezinfectant',           category: 'Prim ajutor',      unit: 'buc',    min_quantity: 1 },
  { name: 'Pansamente',             category: 'Prim ajutor',      unit: 'pachete',min_quantity: 2 },
  { name: 'Termometru',             category: 'Prim ajutor',      unit: 'buc',    min_quantity: 1 },
  { name: 'Paracetamol',            category: 'Prim ajutor',      unit: 'cutii',  min_quantity: 1 },
  { name: 'Ibuprofen',              category: 'Prim ajutor',      unit: 'cutii',  min_quantity: 1 },
  { name: 'Baterii AA',             category: 'Energie / baterii',unit: 'pachete',min_quantity: 2 },
  { name: 'Baterii AAA',            category: 'Energie / baterii',unit: 'pachete',min_quantity: 2 },
  { name: 'Lanternă',               category: 'Energie / baterii',unit: 'buc',    min_quantity: 1 },
  { name: 'Lumânări',               category: 'Energie / baterii',unit: 'buc',    min_quantity: 6 },
  { name: 'Chibrituri / brichetă',  category: 'Energie / baterii',unit: 'buc',    min_quantity: 2 },
]

// ============================================================
// Helpers
// ============================================================

function getCategoryIcon(category) {
  const found = CATEGORIES.find((c) => c.key === category)
  return found ? found.icon : '📦'
}

function getItemStatus(item) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (item.expiry_date) {
    const expiry = new Date(item.expiry_date)
    expiry.setHours(0, 0, 0, 0)
    if (expiry < today) return 'expired'
    const in30 = new Date(today)
    in30.setDate(in30.getDate() + 30)
    if (expiry <= in30) return 'expiring_soon'
  }

  const qty = Number(item.quantity) || 0
  const minQty = Number(item.min_quantity) || 1

  if (qty < minQty) return 'below_min'
  if (minQty > 0 && qty < minQty * 1.2) return 'running_low'
  return 'ok'
}

const STATUS_CONFIG = {
  expired:      { label: 'Expirat',          color: '#b91c1c', bg: '#fef2f2', priority: 1 },
  expiring_soon:{ label: 'Expiră curând',    color: '#92400e', bg: '#fffbeb', priority: 2 },
  below_min:    { label: 'Sub minim',        color: '#c2410c', bg: '#fff7ed', priority: 3 },
  running_low:  { label: 'Se termină',       color: '#b45309', bg: '#fefce8', priority: 4 },
  ok:           { label: 'OK',               color: '#065f46', bg: '#f0fdfa', priority: 5 },
}

function statusPriority(item) {
  return STATUS_CONFIG[getItemStatus(item)]?.priority ?? 5
}

function formatExpiry(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const EMPTY_FORM = {
  name: '',
  category: 'Alimente de bază',
  quantity: '',
  min_quantity: '1',
  unit: 'buc',
  expiry_date: '',
  preferred_store: '',
  notes: '',
  buy_on_offer: false,
  important_for_reserve: false,
  search_keywords: '',
  active: true,
}

// ============================================================
// Componentă principală
// ============================================================

export function Pantry({ dbUserId, activeOffers = [] }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [schemaError, setSchemaError] = useState(false)

  // UI state
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [purchaseItem, setPurchaseItem] = useState(null)
  const [purchaseQty, setPurchaseQty] = useState('')
  const [showRecommended, setShowRecommended] = useState(false)
  const [selectedRecommended, setSelectedRecommended] = useState([])
  const [notice, setNotice] = useState('')

  // ── Fetch ──────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    if (!dbUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('kb_pantry_items')
      .select('*')
      .eq('user_id', dbUserId)
      .eq('active', true)
      .order('created_at', { ascending: false })

    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        setSchemaError(true)
      }
      setLoading(false)
      return
    }
    setItems(data || [])
    setLoading(false)
  }, [dbUserId])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const showNotice = (msg) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 3000)
  }

  // ── CRUD ───────────────────────────────────────────────────

  const openAdd = () => {
    setEditingItem(null)
    setFormData(EMPTY_FORM)
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (item) => {
    setEditingItem(item)
    setFormData({
      name: item.name || '',
      category: item.category || 'Alimente de bază',
      quantity: String(item.quantity ?? ''),
      min_quantity: String(item.min_quantity ?? '1'),
      unit: item.unit || 'buc',
      expiry_date: item.expiry_date || '',
      preferred_store: item.preferred_store || '',
      notes: item.notes || '',
      buy_on_offer: Boolean(item.buy_on_offer),
      important_for_reserve: Boolean(item.important_for_reserve),
      search_keywords: item.search_keywords || '',
      active: item.active !== false,
    })
    setFormError('')
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      setFormError('Numele produsului este obligatoriu.')
      return
    }
    setSaving(true)
    const payload = {
      user_id: dbUserId,
      name: formData.name.trim(),
      category: formData.category,
      quantity: Number(formData.quantity) || 0,
      min_quantity: Number(formData.min_quantity) || 1,
      unit: formData.unit,
      expiry_date: formData.expiry_date || null,
      preferred_store: formData.preferred_store.trim() || null,
      notes: formData.notes.trim() || null,
      buy_on_offer: Boolean(formData.buy_on_offer),
      important_for_reserve: Boolean(formData.important_for_reserve),
      search_keywords: formData.search_keywords.trim() || null,
      active: Boolean(formData.active),
    }

    let error
    if (editingItem) {
      ;({ error } = await supabase
        .from('kb_pantry_items')
        .update(payload)
        .eq('id', editingItem.id)
        .eq('user_id', dbUserId))
    } else {
      ;({ error } = await supabase.from('kb_pantry_items').insert(payload))
    }

    setSaving(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setShowModal(false)
    showNotice(editingItem ? 'Produs actualizat!' : 'Produs adăugat!')
    fetchItems()
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Marchezi "${item.name}" ca inactiv?`)) return
    const { error } = await supabase
      .from('kb_pantry_items')
      .update({ active: false })
      .eq('id', item.id)
      .eq('user_id', dbUserId)
    if (error) { window.alert(error.message); return }
    showNotice('Produs marcat inactiv.')
    fetchItems()
  }

  const handleChangeQty = async (item, delta) => {
    const newQty = Math.max(0, Number(item.quantity) + delta)
    const { error } = await supabase
      .from('kb_pantry_items')
      .update({ quantity: newQty })
      .eq('id', item.id)
      .eq('user_id', dbUserId)
    if (error) { window.alert(error.message); return }
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, quantity: newQty } : i))
  }

  const openPurchase = (item) => {
    setPurchaseItem(item)
    setPurchaseQty('')
    setShowPurchaseModal(true)
  }

  const handlePurchase = async () => {
    const qty = Number(purchaseQty)
    if (!qty || qty <= 0) { window.alert('Scrie o cantitate validă.'); return }
    const newQty = Number(purchaseItem.quantity) + qty
    const { error } = await supabase
      .from('kb_pantry_items')
      .update({ quantity: newQty })
      .eq('id', purchaseItem.id)
      .eq('user_id', dbUserId)
    if (error) { window.alert(error.message); return }
    setShowPurchaseModal(false)
    showNotice(`+${qty} ${purchaseItem.unit} adăugat!`)
    fetchItems()
  }

  // ── Produse recomandate ────────────────────────────────────

  const toggleRecommended = (name) => {
    setSelectedRecommended((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  const handleAddRecommended = async () => {
    if (!selectedRecommended.length) return
    const existingNames = items.map((i) => i.name.toLowerCase())
    const toAdd = RECOMMENDED_PRODUCTS
      .filter((p) => selectedRecommended.includes(p.name))
      .filter((p) => !existingNames.includes(p.name.toLowerCase()))
      .map((p) => ({
        user_id: dbUserId,
        name: p.name,
        category: p.category,
        quantity: 0,
        min_quantity: p.min_quantity,
        unit: p.unit,
        buy_on_offer: false,
        active: true,
      }))
    if (!toAdd.length) { showNotice('Produsele selectate există deja.'); setShowRecommended(false); return }
    const { error } = await supabase.from('kb_pantry_items').insert(toAdd)
    if (error) { window.alert(error.message); return }
    setShowRecommended(false)
    setSelectedRecommended([])
    showNotice(`${toAdd.length} produse adăugate!`)
    fetchItems()
  }

  // ── Filtrare + statistici ──────────────────────────────────

  const filteredItems = useMemo(() => {
    let result = items

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.preferred_store || '').toLowerCase().includes(q)
      )
    }

    if (filterCategory !== 'all') {
      result = result.filter((i) => i.category === filterCategory)
    }

    if (filterStatus === 'below_min') {
      result = result.filter((i) => ['below_min', 'expired'].includes(getItemStatus(i)))
    } else if (filterStatus === 'expiring_soon') {
      result = result.filter((i) => ['expiring_soon', 'expired'].includes(getItemStatus(i)))
    } else if (filterStatus === 'buy_on_offer') {
      result = result.filter((i) => i.buy_on_offer)
    }

    // Sort: prioritate status (expirat → expiră curând → sub minim → se termină → ok)
    result = [...result].sort((a, b) => statusPriority(a) - statusPriority(b))

    return result
  }, [items, search, filterCategory, filterStatus])

  const stats = useMemo(() => ({
    total: items.length,
    belowMin: items.filter((i) => ['below_min', 'expired'].includes(getItemStatus(i))).length,
    expiringSoon: items.filter((i) => ['expiring_soon', 'expired'].includes(getItemStatus(i))).length,
    buyOnOffer: items.filter((i) => i.buy_on_offer).length,
  }), [items])

  // Compute active offers per pantry item (for badge display)
  const activeOffersByItemId = useMemo(() => {
    const map = {}
    if (!activeOffers || !activeOffers.length) return map
    items.forEach((item) => {
      const found = activeOffers.find((offer) => {
        if (getOfferValidityStatus(offer) !== 'active') return false
        return productMatch(item.name, offer.product_name, item.search_keywords || '').match
      })
      if (found) map[item.id] = found
    })
    return map
  }, [items, activeOffers])

  // ── Randare ────────────────────────────────────────────────

  if (schemaError) {
    return (
      <section className="section pantry-section">
        <div className="section-title">
          <h2>🏺 Debara / Rezervă</h2>
        </div>
        <div className="notice danger">
          <strong>Tabelul kb_pantry_items nu există încă.</strong>
          <span>Rulează scriptul <code>supabase/KB_MIGRATION_PANTRY.sql</code> în Supabase SQL Editor și reîncarcă pagina.</span>
        </div>
      </section>
    )
  }

  return (
    <div className="pantry-wrapper">
      {notice && <div className="pantry-toast">{notice}</div>}

      {/* Header */}
      <section className="section pantry-section">
        <div className="section-title">
          <div>
            <h2>🏺 Debara / Rezervă</h2>
            <p className="muted" style={{ fontSize: '0.88rem', marginTop: '0.2rem' }}>
              Produse importante pentru casă, zile negre și cumpărături inteligente.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={openAdd}>+ Adaugă produs</button>
            <button
              type="button"
              className="secondary"
              onClick={() => { setShowRecommended(true); setSelectedRecommended([]) }}
            >
              📋 Produse recomandate
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="pantry-summary-cards">
          <div className="pantry-summary-card pantry-card-total">
            <span className="pantry-summary-icon">📦</span>
            <strong>{stats.total}</strong>
            <span>Produse totale</span>
          </div>
          <div
            className={`pantry-summary-card pantry-card-below ${stats.belowMin > 0 ? 'pantry-alert' : ''}`}
            onClick={() => setFilterStatus(filterStatus === 'below_min' ? 'all' : 'below_min')}
            style={{ cursor: 'pointer' }}
          >
            <span className="pantry-summary-icon">⚠️</span>
            <strong style={{ color: stats.belowMin > 0 ? '#c2410c' : 'inherit' }}>{stats.belowMin}</strong>
            <span>Sub minim</span>
          </div>
          <div
            className={`pantry-summary-card pantry-card-expiring ${stats.expiringSoon > 0 ? 'pantry-alert' : ''}`}
            onClick={() => setFilterStatus(filterStatus === 'expiring_soon' ? 'all' : 'expiring_soon')}
            style={{ cursor: 'pointer' }}
          >
            <span className="pantry-summary-icon">⏳</span>
            <strong style={{ color: stats.expiringSoon > 0 ? '#92400e' : 'inherit' }}>{stats.expiringSoon}</strong>
            <span>Expiră curând</span>
          </div>
          <div
            className="pantry-summary-card pantry-card-offer"
            onClick={() => setFilterStatus(filterStatus === 'buy_on_offer' ? 'all' : 'buy_on_offer')}
            style={{ cursor: 'pointer' }}
          >
            <span className="pantry-summary-icon">🏷️</span>
            <strong>{stats.buyOnOffer}</strong>
            <span>Cumpără la ofertă</span>
          </div>
        </div>

        {/* Info oferte active azi */}
        <div className="notice" style={{ fontSize: '0.82rem', padding: '0.65rem 0.85rem' }}>
          🏷️ Bifeșază „Cumpără când este ofertă” pentru produsele pe care vrei să le urmărești.
          {activeOffers.length > 0 && (
            <span style={{ marginLeft: '0.5rem', color: '#065f46', fontWeight: 600 }}>
              {Object.keys(activeOffersByItemId).length > 0
                ? `· ${Object.keys(activeOffersByItemId).length} produs(e) cu ofertă activă azi 💡`
                : '· Niciun produs din Debară nu are ofertă activă azi.'}
            </span>
          )}
        </div>
      </section>

      {/* Filters */}
      <section className="section" style={{ padding: '0.75rem 1rem' }}>
        <div className="pantry-filters">
          <input
            type="search"
            placeholder="🔍 Caută produs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 180px' }}
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ flex: '0 1 auto' }}>
            <option value="all">📋 Toate</option>
            <option value="below_min">⚠️ Sub minim</option>
            <option value="expiring_soon">⏳ Expiră curând</option>
            <option value="buy_on_offer">🏷️ La ofertă</option>
          </select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ flex: '0 1 auto' }}>
            <option value="all">📂 Categorii</option>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.icon} {c.key}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Products grid */}
      {loading ? (
        <section className="section">
          <p className="muted" style={{ textAlign: 'center', padding: '2rem' }}>Se încarcă...</p>
        </section>
      ) : filteredItems.length === 0 ? (
        <section className="section">
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <p style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏺</p>
            <p className="muted">
              {items.length === 0
                ? 'Debara ta e goală. Adaugă primul produs sau alege din produsele recomandate.'
                : 'Niciun produs nu corespunde filtrelor selectate.'}
            </p>
          </div>
        </section>
      ) : (
        <div className="pantry-grid">
          {filteredItems.map((item) => (
            <PantryCard
              key={item.id}
              item={item}
              activeOffer={activeOffersByItemId[item.id] || null}
              onEdit={openEdit}
              onDelete={handleDelete}
              onChangeQty={handleChangeQty}
              onPurchase={openPurchase}
            />
          ))}
        </div>
      )}

      {/* Modal Add/Edit */}
      {showModal && (
        <div className="pantry-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pantry-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pantry-modal-header">
              <h2>{editingItem ? '✏️ Editează produs' : '➕ Adaugă produs'}</h2>
              <button type="button" className="ghost" onClick={() => setShowModal(false)} style={{ minHeight: '36px', padding: '0.3rem 0.6rem' }}>✕</button>
            </div>
            <form onSubmit={handleSave} className="pantry-form">
              <label>
                Nume produs *
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="ex: Orez, Hârtie igienică..."
                  autoFocus
                  required
                />
              </label>

              <div className="pantry-form-row">
                <label>
                  Categorie
                  <select value={formData.category} onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>{c.icon} {c.key}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Unitate
                  <select value={formData.unit} onChange={(e) => setFormData((p) => ({ ...p, unit: e.target.value }))}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
              </div>

              <div className="pantry-form-row">
                <label>
                  Cantitate actuală
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={formData.quantity}
                    onChange={(e) => setFormData((p) => ({ ...p, quantity: e.target.value }))}
                    placeholder="0"
                  />
                </label>
                <label>
                  Cantitate minimă dorită
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={formData.min_quantity}
                    onChange={(e) => setFormData((p) => ({ ...p, min_quantity: e.target.value }))}
                    placeholder="1"
                  />
                </label>
              </div>

              <label>
                Expiră la (opțional)
                <input
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData((p) => ({ ...p, expiry_date: e.target.value }))}
                />
              </label>

              <label>
                Magazin preferat (opțional)
                <select
                  value={formData.preferred_store}
                  onChange={(e) => setFormData((p) => ({ ...p, preferred_store: e.target.value }))}
                >
                  <option value="">— fără preferință —</option>
                  {STORE_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>

              <label>
                Notițe (opțional)
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Info suplimentare..."
                  rows={2}
                />
              </label>

              <div className="pantry-form-checks">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={formData.buy_on_offer}
                    onChange={(e) => setFormData((p) => ({ ...p, buy_on_offer: e.target.checked }))}
                  />
                  🏷️ Cumpără când este ofertă
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={formData.important_for_reserve}
                    onChange={(e) => setFormData((p) => ({ ...p, important_for_reserve: e.target.checked }))}
                  />
                  ⭐ Important pentru rezervă
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData((p) => ({ ...p, active: e.target.checked }))}
                  />
                  ✅ Activ
                </label>
              </div>

              <label>
                Cuvinte cheie (opțional, ex: cafea, Kaffee)
                <input
                  type="text"
                  value={formData.search_keywords}
                  onChange={(e) => setFormData((p) => ({ ...p, search_keywords: e.target.value }))}
                  placeholder="ex: cafea, Kaffee · lapte, Milch · detergent, Waschmittel"
                />
              </label>

              {formError && <div className="notice danger">{formError}</div>}

              <div className="form-actions" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '0.25rem' }}>
                <button type="submit" disabled={saving}>{saving ? 'Se salvează...' : 'Salvează'}</button>
                <button type="button" className="ghost" onClick={() => setShowModal(false)}>Anulează</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Marchează cumpărat */}
      {showPurchaseModal && purchaseItem && (
        <div className="pantry-modal-overlay" onClick={() => setShowPurchaseModal(false)}>
          <div className="pantry-modal pantry-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="pantry-modal-header">
              <h2>🛒 Cât ai cumpărat?</h2>
              <button type="button" className="ghost" onClick={() => setShowPurchaseModal(false)} style={{ minHeight: '36px', padding: '0.3rem 0.6rem' }}>✕</button>
            </div>
            <p className="muted" style={{ marginBottom: '0.75rem' }}>
              {purchaseItem.name} — acum: {purchaseItem.quantity} {purchaseItem.unit}
            </p>
            <label>
              Cantitate cumpărată ({purchaseItem.unit})
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={purchaseQty}
                onChange={(e) => setPurchaseQty(e.target.value)}
                autoFocus
                placeholder="ex: 2"
              />
            </label>
            <div className="form-actions" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '0.75rem' }}>
              <button type="button" onClick={handlePurchase}>✅ Confirmă</button>
              <button type="button" className="ghost" onClick={() => setShowPurchaseModal(false)}>Anulează</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal produse recomandate */}
      {showRecommended && (
        <div className="pantry-modal-overlay" onClick={() => setShowRecommended(false)}>
          <div className="pantry-modal pantry-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="pantry-modal-header">
              <h2>📋 Produse recomandate pentru rezervă</h2>
              <button type="button" className="ghost" onClick={() => setShowRecommended(false)} style={{ minHeight: '36px', padding: '0.3rem 0.6rem' }}>✕</button>
            </div>
            <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.88rem' }}>
              Selectează produsele pe care vrei să le adaugi. Cele care există deja vor fi ignorate.
            </p>
            <div className="pantry-recommended-list">
              {CATEGORIES.map((cat) => {
                const catItems = RECOMMENDED_PRODUCTS.filter((p) => p.category === cat.key)
                if (!catItems.length) return null
                return (
                  <div key={cat.key} className="pantry-recommended-category">
                    <div className="pantry-recommended-cat-title">
                      <span>{cat.icon}</span> {cat.key}
                    </div>
                    {catItems.map((p) => (
                      <label key={p.name} className="pantry-recommended-item checkbox">
                        <input
                          type="checkbox"
                          checked={selectedRecommended.includes(p.name)}
                          onChange={() => toggleRecommended(p.name)}
                        />
                        <span>{p.name}</span>
                        <small className="muted">{p.min_quantity} {p.unit} min.</small>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="form-actions" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '1rem' }}>
              <button type="button" onClick={handleAddRecommended} disabled={!selectedRecommended.length}>
                ➕ Adaugă {selectedRecommended.length > 0 ? `(${selectedRecommended.length})` : ''}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setSelectedRecommended(RECOMMENDED_PRODUCTS.map((p) => p.name))
                }}
              >
                Selectează toate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Card produs
// ============================================================

function PantryCard({ item, activeOffer = null, onEdit, onDelete, onChangeQty, onPurchase }) {
  const status = getItemStatus(item)
  const statusCfg = STATUS_CONFIG[status]
  const icon = getCategoryIcon(item.category)
  const qty = Number(item.quantity) || 0
  const minQty = Number(item.min_quantity) || 1
  const progressPct = minQty > 0 ? Math.min(100, Math.round((qty / (minQty * 1.5)) * 100)) : 100
  const expiryLabel = formatExpiry(item.expiry_date)
  const needsPulse = status === 'below_min' || status === 'expiring_soon' || status === 'expired'

  return (
    <article className="pantry-card pantry-card-animate">
      {/* Header card */}
      <div className="pantry-card-header">
        <span className="pantry-cat-icon">{icon}</span>
        <div className="pantry-card-title">
          <strong>{item.name}</strong>
          <span className="muted" style={{ fontSize: '0.8rem' }}>{item.category}</span>
        </div>
        <span
          className={`pantry-badge${needsPulse ? ' pantry-badge-pulse' : ''}`}
          style={{ background: statusCfg.bg, color: statusCfg.color }}
        >
          {statusCfg.label}
        </span>
      </div>

      {/* Cantitate + progress */}
      <div className="pantry-card-qty">
        <span>
          Ai: <strong>{qty}</strong> {item.unit}
          <span className="muted"> / min {minQty} {item.unit}</span>
        </span>
        <div className="pantry-progress-bar">
          <div
            className="pantry-progress-fill"
            style={{
              width: `${progressPct}%`,
              background: status === 'ok' ? '#0f766e'
                : status === 'running_low' ? '#ca8a04'
                : status === 'below_min' ? '#ea580c'
                : status === 'expiring_soon' ? '#d97706'
                : '#b91c1c',
            }}
          />
        </div>
      </div>

      {/* Meta */}
      <div className="pantry-card-meta">
        {expiryLabel && (
          <span className={status === 'expired' || status === 'expiring_soon' ? 'pantry-meta-warn' : 'muted'}>
            📅 Expiră: {expiryLabel}
          </span>
        )}
        {item.preferred_store && (
          <span className="muted">🏪 {item.preferred_store}</span>
        )}
        {item.buy_on_offer && (
          <span className="pantry-offer-badge">🏷️ Cumpără la ofertă</span>
        )}
        {item.important_for_reserve && (
          <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
            ⭐ Rezervă importantă
          </span>
        )}
        {activeOffer && (
          <span style={{ fontSize: '0.75rem', background: '#d1fae5', color: '#065f46', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            💡 Ofertă activă — {activeOffer.store_name} {activeOffer.price ? `${activeOffer.price.toFixed ? activeOffer.price.toFixed(2) : activeOffer.price}€` : ''}
          </span>
        )}
        {item.notes && (
          <span className="muted" style={{ fontSize: '0.78rem', fontStyle: 'italic' }}>📝 {item.notes}</span>
        )}
      </div>

      {/* Acțiuni */}
      <div className="pantry-card-actions">
        <button
          type="button"
          className="pantry-qty-btn"
          onClick={() => onChangeQty(item, -1)}
          disabled={qty <= 0}
          aria-label="Scade cu 1"
          title="−1"
        >
          −
        </button>
        <button
          type="button"
          className="pantry-qty-btn pantry-qty-plus"
          onClick={() => onChangeQty(item, 1)}
          aria-label="Crește cu 1"
          title="+1"
        >
          +
        </button>
        <button
          type="button"
          className="ghost pantry-action-btn"
          onClick={() => onPurchase(item)}
          title="Marchează cumpărat"
        >
          🛒
        </button>
        <button
          type="button"
          className="ghost pantry-action-btn"
          onClick={() => onEdit(item)}
          title="Editează"
        >
          ✏️
        </button>
        <button
          type="button"
          className="ghost pantry-action-btn"
          onClick={() => onDelete(item)}
          title="Marchează inactiv"
          style={{ color: '#b91c1c' }}
        >
          🗑️
        </button>
      </div>
    </article>
  )
}
