import { useMemo, useState } from 'react'
import { EntityList } from './EntityList'
import { formatMoney, isoDate, toNumber } from '../lib/finance'
import {
  storeNames,
  productMatch,
  parseOfferText,
  parseReceiptText,
  detectStore,
  mergePreviewRows,
  extractTextFromPdf,
  offerPreviewKey,
  getOfferValidityStatus,
  offerValidityText,
  offerCompareValue,
  normalizedUnitLabel,
  normalizeProduct,
  buildShoppingHistory,
  bestShoppingMatches,
  buildStoreRecommendations,
  getOfferValidityStatusLabel,
} from '../lib/shoppingHelpers'
import {
  OFFER_SOURCE_FILTER_OPTIONS,
  OFFER_SOURCE_OPTIONS,
  SHOPPING_STORES,
  buildManualOfferPayload,
  getOfferSourceLabel,
  hydrateOffer,
  offerMatchesSourceFilter,
} from '../lib/offerSources'

function SmartShopping({
  currency,
  journalEntries,
  language,
  locale,
  offerPreview,
  offers,
  receiptItems = [],
  receipts = [],
  schemaReady,
  shoppingList,
  stores,
  sources,
  pantryItems = [],
  tab,
  t,
  onConfirmPreview,
  onDelete,
  onPreviewChange,
  onSaveItem,
  onSaveReceipt,
  onSaveStore,
  onTabChange,
  getProductRecommendations,
  calculateOptimalRoute,
  priceNotifications,
  user,
  getPriceAnalytics,
  onImportOffer,
  onSaveManualOffer,
}) {
  const normalizedTab = tab === 'kaufda' || tab === 'storejournal' ? 'offers' : tab
  const [showExpiredOffers, setShowExpiredOffers] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const offersWithValidity = useMemo(
    () => offers.map((offer) => {
      const hydrated = hydrateOffer(offer)
      return { ...hydrated, validityStatus: getOfferValidityStatus(hydrated) }
    }),
    [offers],
  )
  const activeOffers = useMemo(
    () => offersWithValidity.filter((offer) => offer.validityStatus === 'active'),
    [offersWithValidity],
  )
  const visibleSavedOffers = showExpiredOffers
    ? offersWithValidity
    : activeOffers
  const bestPrices = bestShoppingMatches(shoppingList, activeOffers, journalEntries)
  const storeRecommendations = buildStoreRecommendations(bestPrices, stores)
  const priceHistory = buildShoppingHistory(journalEntries)

  const recommendations = useMemo(() => {
    const list = []
    const seenKeys = new Set()

    // 1. Compute product frequencies from history
    const counts = {}
    const addCount = (name) => {
      if (!name) return
      const n = name.trim().toLowerCase()
      if (n.length < 3 || n.includes('bon ') || n === 'bon' || n.includes('cumparaturi') || n === 'diverse') return
      counts[n] = (counts[n] || 0) + 1
    }

    if (receiptItems) receiptItems.forEach(item => addCount(item.product_name))
    if (priceHistory) priceHistory.forEach(item => addCount(item.product))
    if (journalEntries) {
      journalEntries.forEach(item => {
        if (item.product_name && item.product_name !== 'Bon cumparaturi') {
          addCount(item.product_name)
        }
      })
    }

    // Helper to add a recommendation
    const addRec = (offer, pantryMatch, reason, priority, approx = false) => {
      const offerKey = `${offer.product_name.toLowerCase()}|${offer.store_name.toLowerCase()}|${offer.price}`
      if (seenKeys.has(offerKey)) return
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
        offer_source: offer.offer_source || offer.source,
      })
      seenKeys.add(offerKey)
    }

    // 2. Map active offers to match list/pantry/frequent (in priority order)
    activeOffers.forEach((offer) => {
      // A. Pantry: sub minim (priority 1)
      const pantrySubMin = pantryItems.find((item) => {
        const m = productMatch(item.name, offer.product_name, item.search_keywords || '')
        return m.match && (Number(item.quantity) || 0) < (Number(item.min_quantity) || 1)
      })
      if (pantrySubMin) {
        const approx = productMatch(pantrySubMin.name, offer.product_name, pantrySubMin.search_keywords || '').approx
        addRec(offer, pantrySubMin, 'Sub minim în Debară', 1, approx)
        return
      }

      // B. Pantry: cumpără când e ofertă (priority 2)
      const pantryBuyOnOffer = pantryItems.find((item) => {
        const m = productMatch(item.name, offer.product_name, item.search_keywords || '')
        return m.match && item.buy_on_offer
      })
      if (pantryBuyOnOffer) {
        const approx = productMatch(pantryBuyOnOffer.name, offer.product_name, pantryBuyOnOffer.search_keywords || '').approx
        addRec(offer, pantryBuyOnOffer, 'Cumpără când este ofertă', 2, approx)
        return
      }

      // C. Pantry: important pentru rezervă (priority 3)
      const pantryImportant = pantryItems.find((item) => {
        const m = productMatch(item.name, offer.product_name, item.search_keywords || '')
        return m.match && item.important_for_reserve
      })
      if (pantryImportant) {
        const approx = productMatch(pantryImportant.name, offer.product_name, pantryImportant.search_keywords || '').approx
        addRec(offer, pantryImportant, 'Important pentru rezervă', 3, approx)
        return
      }

      // D. Shopping List match (priority 4)
      const listMatch = shoppingList.find((item) => productMatch(item.product_name, offer.product_name).match)
      if (listMatch) {
        addRec(offer, null, 'Este în Lista mea', 4, productMatch(listMatch.product_name, offer.product_name).approx)
        return
      }

      // E. Frequent product match (priority 5)
      const frequentMatch = Object.keys(counts).find(n => counts[n] >= 2 && productMatch(n, offer.product_name).match)
      if (frequentMatch) {
        addRec(offer, null, 'Produs frecvent', 5, productMatch(frequentMatch, offer.product_name).approx)
      }
    })

    // Sort by priority, then limit to 15
    return list.sort((a, b) => a.priority - b.priority).slice(0, 15)
  }, [activeOffers, shoppingList, pantryItems, receiptItems, priceHistory, journalEntries])


  const filteredRecs = useMemo(() => {
    if (!searchQuery.trim()) return recommendations
    const q = searchQuery.toLowerCase()
    return recommendations.filter((item) =>
      item.product.toLowerCase().includes(q) ||
      item.store.toLowerCase().includes(q) ||
      item.reason.toLowerCase().includes(q)
    )
  }, [recommendations, searchQuery])

  const searchableOffers = useMemo(() => {
    const combined = [...offerPreview, ...activeOffers]
    const seen = new Map()
    combined.forEach((item) => {
      const key = offerPreviewKey(item)
      if (!seen.has(key)) seen.set(key, item)
    })
    return [...seen.values()]
  }, [offerPreview, activeOffers])

  // ── Navigare nouă: 4 taburi principale ────────────────────────
  const SHOPPING_ADMIN_TABS = ['receipts', 'import', 'offers', 'stores', 'history', 'sources']
  const activeMainShoppingTab =
    SHOPPING_ADMIN_TABS.includes(normalizedTab) ? 'admin' :
    (normalizedTab === 'best' || normalizedTab === 'search') ? 'smart' :
    normalizedTab

  return (
    <>
      <section className="section">
        <div className="section-title">
          <div>
            <h2>{t('shopping')}</h2>
            <p className="muted">Lista familiei, oferte active și cumpărături inteligente.</p>
          </div>
        </div>
        {!schemaReady && <div className="notice danger">{t('shoppingMigrationMissing')}</div>}
        <div className="tabbar inline-tabs" style={{ flexWrap: 'wrap' }}>
          {[
            { key: 'list',  label: '🛒 Lista mea' },
            { key: 'offers', label: '🏷️ Oferte' },
            { key: 'smart', label: '⭐ Merită acum' },
            { key: 'admin', label: '⚙️ Import / Admin' },
          ].map(({ key, label }) => (
            <button
              type="button"
              key={key}
              className={activeMainShoppingTab === key ? 'active' : ''}
              onClick={() => onTabChange(key === 'admin' ? 'import' : key)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Tab 1: Lista mea */}
      {tab === 'list' && <ShoppingListTab currency={currency} language={language} items={shoppingList} t={t} getRecommendations={getProductRecommendations} getRoute={calculateOptimalRoute} notifications={priceNotifications} user={user} onDelete={(item) => onDelete('kb_shopping_list', item)} onSave={onSaveItem} />}

      {(normalizedTab === 'offers' || tab === 'kaufda' || tab === 'storejournal') && (
        <OffersTab
          offers={offersWithValidity}
          currency={currency}
          locale={locale}
          t={t}
          shoppingList={shoppingList}
          onImportOffer={onImportOffer}
        />
      )}

      {(normalizedTab === 'smart' || tab === 'best' || tab === 'search') && (
        <>
          <section className="section">
            <div className="section-title">
              <div>
                <h2>⭐ Merită cumpărat acum</h2>
                <p className="muted">Recomandări pe baza listei, Debării și ofertelor active.</p>
              </div>
            </div>

            {/* Sumar rapid */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
              <div style={{ background: '#f0fdfa', border: '1px solid #b2f0e8', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: '#065f46' }}>
                💡 {recommendations.length} recomandări active
              </div>
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: '#c2410c' }}>
                ⚠️ {pantryItems.filter(i => (Number(i.quantity)||0) < (Number(i.min_quantity)||1)).length} sub minim
              </div>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: '#1d4ed8' }}>
                🏷️ {activeOffers.length} oferte active azi
              </div>
            </div>

            {activeOffers.length === 0 && (
              <div className="notice" style={{ marginBottom: '1rem', background: '#fef3c7', borderColor: '#fbbf24', color: '#92400e' }}>
                ⚠️ Nicio ofertă activă azi. Adaugă oferte din Import / Ofertă manuală sau feed KaufDA.
              </div>
            )}
            {pantryItems.length === 0 && (
              <div className="notice" style={{ marginBottom: '1rem' }}>
                💡 Adaugă produse în Debară pentru recomandări mai bune.
              </div>
            )}

            <div className="search-box-container" style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                Caută produs
              </label>
              <input
                type="search"
                className="full-width-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Scrie numele unui produs (de ex. Lapte, Apă, Orez...)"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <div className="section-title" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
              <h3>📋 Recomandări active</h3>
            </div>

            {filteredRecs.length === 0 ? (
              <div className="notice" style={{ padding: '2rem', textAlign: 'center', background: '#f9fafb', borderRadius: '12px', color: '#6b7280' }}>
                {searchQuery.trim() ? (
                  <>🔍 Nu s-au găsit recomandări potrivite pentru „<strong>{searchQuery}</strong>”.</>
                ) : (
                  <>💡 Nu există recomandări momentan. Adaugă produse în Debara, Lista mea sau încarcă oferte active.</>
                )}
              </div>
            ) : (
              <div className="recommendations-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem'
              }}>
                {filteredRecs.map((rec, index) => {
                  const hasValidUntil = !!rec.valid_until
                  const reasonColors = {
                    'Sub minim în Debară': { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
                    'Cumpără când este ofertă': { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
                    'Important pentru rezervă': { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
                    'Este în Lista mea': { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
                    'Produs frecvent': { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
                  }
                  const rc = reasonColors[rec.reason] || { bg: '#f9fafb', color: '#374151', border: '#e5e7eb' }
                  return (
                    <article className="recommendation-card" key={`${rec.product}-${rec.store}-${index}`} style={{
                      background: '#ffffff',
                      border: `1px solid ${rc.border}`,
                      borderRadius: '12px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <span className="badge" style={{
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '20px',
                            background: rc.bg,
                            color: rc.color,
                            border: `1px solid ${rc.border}`
                          }}>
                            {rec.reason}
                          </span>
                          {rec.approx && (
                            <span style={{ fontSize: '0.7rem', color: '#9ca3af', background: '#f3f4f6', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>potrivire aproximativă</span>
                          )}
                        </div>
                        <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1.05rem', fontWeight: '700', color: '#111827' }}>
                          {rec.product}
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.88rem', color: '#4b5563' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#9ca3af' }}>🏷️ Sursă:</span>
                            <strong style={{ color: '#1f2937' }}>{rec.source}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#9ca3af' }}>🏪 Magazin:</span>
                            <strong style={{ color: '#1f2937' }}>{rec.store}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ color: '#9ca3af' }}>💰 Preț:</span>
                            <span style={{ color: '#059669', fontWeight: '700', fontSize: '1.05rem' }}>
                              {formatMoney(rec.price, currency, locale)}
                              {rec.unit_price ? (
                                <small style={{ fontWeight: 'normal', color: '#6b7280', fontSize: '0.78rem', marginLeft: '0.25rem' }}>
                                  ({formatMoney(rec.unit_price, currency, locale)}/{normalizedUnitLabel(rec.unit)})
                                </small>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      </div>
                      {hasValidUntil && (
                        <div style={{
                          marginTop: '0.75rem',
                          paddingTop: '0.5rem',
                          borderTop: '1px dashed #e5e7eb',
                          fontSize: '0.78rem',
                          color: '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontWeight: '600'
                        }}>
                          <span>⏳ Valabil până la:</span>
                          <span>{rec.valid_until}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        style={{
                          marginTop: '0.75rem',
                          padding: '0.45rem 0.85rem',
                          background: '#17463c',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          width: '100%'
                        }}
                        onClick={() => onSaveItem({
                          product_name: rec.product,
                          preferred_store: rec.store,
                          category: 'mâncare',
                          priority: rec.priority <= 2 ? 'important' : 'normal',
                          notes: `Ofertă ${rec.store} — ${rec.price}€ (${rec.reason})`,
                        })}
                      >
                        🛒 Adaugă în Lista mea
                      </button>
                    </article>
                  )
                })}
              </div>
            )}

            {/* Secțiune collapsible pentru funcții vechi */}
            <details style={{
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              marginTop: '2rem'
            }}>
              <summary style={{
                cursor: 'pointer',
                fontWeight: '600',
                color: '#4b5563',
                fontSize: '0.9rem',
                outline: 'none',
                userSelect: 'none'
              }}>
                ⚙️ Funcții vechi / experimental (Caută preț / Cele mai bune prețuri)
              </summary>
              <div style={{ marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                <SearchOffersTab activeOffers={searchableOffers} allOffers={offersWithValidity} currency={currency} locale={locale} t={t} />
                {bestPrices.length > 0 && <BestPricesTab bestPrices={bestPrices} offers={activeOffers} allOffers={offersWithValidity} currency={currency} locale={locale} t={t} />}
              </div>
            </details>
          </section>
        </>
      )}

      {/* Tab 4: Import / Administrare (unifică: receipts, import, offers, stores, history, sources) */}
      {(normalizedTab === 'admin' || SHOPPING_ADMIN_TABS.includes(tab)) && (
        <>
          <section className="section">
            <div className="section-title">
              <div>
                <h2>⚙️ Import / Administrare</h2>
                <p className="muted">Instrumente tehnice pentru importul de oferte şi gestionarea surselor.</p>
              </div>
            </div>
            <div className="notice" style={{ fontSize: '0.85rem' }}>
              ⚠️ Importul PDF este experimental. Dacă prospectul nu este citit corect, foloseşte import text manual.
            </div>
            <div className="tabbar inline-tabs" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
              {[
                { key: 'import',   label: '📥 Import prospecte' },
                { key: 'manual',   label: '✏️ Ofertă manuală' },
                { key: 'offers',   label: '📋 Oferte extrase' },
                { key: 'receipts', label: '🧾 Bonuri / CEC-uri' },
                { key: 'stores',   label: '🏦 Magazine' },
                { key: 'history',  label: '📊 Istoric prețuri' },
                { key: 'sources',  label: '🔗 Surse' },
              ].map(({ key, label }) => (
                <button
                  type="button"
                  key={key}
                  className={tab === key || (tab === 'admin' && key === 'import') ? 'active' : 'secondary'}
                  onClick={() => onTabChange(key)}
                  style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', minHeight: 'auto', borderRadius: '8px' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
          {(tab === 'import' || tab === 'admin') && <OfferImportTab preview={offerPreview} t={t} onPreviewChange={onPreviewChange} onSaveSource={onSaveStore} onConfirmPreview={onConfirmPreview} onTabChange={onTabChange} />}
          {tab === 'manual' && (
            <ManualOfferForm
              currency={currency}
              locale={locale}
              onSave={onSaveManualOffer}
            />
          )}
          {tab === 'offers' && (
            <OfferPreviewTab
              currency={currency}
              language={language}
              locale={locale}
              preview={offerPreview}
              savedOffers={visibleSavedOffers}
              t={t}
              showExpiredOffers={showExpiredOffers}
              onConfirmPreview={onConfirmPreview}
              onDeleteOffer={(item) => onDelete('kb_weekly_offers', item)}
              onPreviewChange={onPreviewChange}
              onToggleExpiredOffers={setShowExpiredOffers}
            />
          )}
          {tab === 'receipts' && <ReceiptsTab currency={currency} locale={locale} receiptItems={receiptItems} receipts={receipts} onSaveReceipt={onSaveReceipt} />}
          {tab === 'stores' && <StoreRecommendationsTab currency={currency} locale={locale} recommendations={storeRecommendations} stores={stores} t={t} onSaveStore={onSaveStore} />}
          {tab === 'history' && <ShoppingHistoryTab currency={currency} history={priceHistory} locale={locale} analytics={getPriceAnalytics()} t={t} />}
          {tab === 'sources' && <OfferSourcesTab sources={sources} t={t} onDelete={(item) => onDelete('kb_offer_sources', item)} onSave={onSaveStore} />}
        </>
      )}
    </>
  )
}

function ReceiptsTab({ currency, locale, receiptItems, receipts, onSaveReceipt }) {
  const [text, setText] = useState('')
  const [storeName, setStoreName] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(isoDate(new Date()))
  const [preview, setPreview] = useState([])
  const [createJournalEntry, setCreateJournalEntry] = useState(true)
  const total = preview.reduce((sum, item) => sum + toNumber(item.total_price), 0)

  const buildPreview = () => {
    const rows = parseReceiptText(text)
    setPreview(rows)
  }

  const save = async () => {
    await onSaveReceipt({
      receipt: {
        store_name: storeName || detectStore(text) || 'Magazin',
        purchase_date: purchaseDate,
        source: 'manual_text',
        raw_text: text,
      },
      items: preview,
      createJournalEntry,
    })
    setText('')
    setPreview([])
  }

  const itemsByReceipt = useMemo(() => {
    const map = new Map()
    receiptItems.forEach((item) => {
      if (!map.has(item.receipt_id)) map.set(item.receipt_id, [])
      map.get(item.receipt_id).push(item)
    })
    return map
  }, [receiptItems])

  return (
    <section className="section">
      <div className="section-title">
        <div>
          <h2>Bonuri / CEC-uri</h2>
          <p className="muted">Lipeste textul bonului, verifica produsele si salveaza. OCR din poza poate fi adaugat ulterior.</p>
        </div>
      </div>
      <div className="form-grid">
        <label>Magazin<input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Netto, Lidl, Rewe..." /></label>
        <label>Data<input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} /></label>
      </div>
      <label>
        Text bon
        <textarea rows={8} value={text} onChange={(event) => setText(event.target.value)} placeholder={'Lapte 1L 0,99\nPaine 1,49\nUlei masline 5L 38,99'} />
      </label>
      <div className="button-row">
        <button type="button" onClick={buildPreview}>Extrage produse</button>
        <label className="checkbox">
          <input type="checkbox" checked={createJournalEntry} onChange={(event) => setCreateJournalEntry(event.target.checked)} />
          Adauga totalul si in Jurnal
        </label>
      </div>

      {preview.length > 0 && (
        <div className="section compact-section">
          <div className="section-title">
            <h3>Preview produse</h3>
            <button type="button" onClick={save}>Confirma si salveaza ({formatMoney(total, currency, locale)})</button>
          </div>
          <div className="list">
            {preview.map((item, index) => (
              <article className="list-item" key={`${item.product_name}-${index}`}>
                <div>
                  <strong>{item.product_name}</strong>
                  <span>{item.quantity ? `${item.quantity} ${item.unit || ''}` : item.category}</span>
                </div>
                <div className="list-value">
                  <b>{formatMoney(item.total_price, currency, locale)}</b>
                  {item.unit_price ? <span>{formatMoney(item.unit_price, currency, locale)}/{item.unit}</span> : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      <div className="section compact-section">
        <h3>Bonuri salvate</h3>
        <div className="list">
          {receipts.length === 0 ? <div className="empty">Nu exista bonuri salvate.</div> : receipts.map((receipt) => (
            <article className="list-item" key={receipt.id}>
              <div>
                <strong>{receipt.store_name}</strong>
                <span>{receipt.purchase_date} - {(itemsByReceipt.get(receipt.id) || []).length} produse</span>
              </div>
              <div className="list-value">
                <b>{formatMoney(receipt.total_amount, currency, locale)}</b>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function OfferImportTab({ preview, t, onPreviewChange, onConfirmPreview, onTabChange }) {
  const [text, setText] = useState('')
  const [meta, setMeta] = useState({ store_name: '', valid_from: '', valid_until: '', region: '' })
  const [pdfFiles, setPdfFiles] = useState([])
  const [extracting, setExtracting] = useState(false)
  const [localNotice, setLocalNotice] = useState('')
  const [extractedText, setExtractedText] = useState('')
  const [autoImport, setAutoImport] = useState(true)

  const updatePdfFile = (fileName, patch) => setPdfFiles((current) => current.map((item) => item.file_name === fileName ? { ...item, ...patch } : item))

  const handleExtractPreview = async () => {
    setLocalNotice('')
    setExtractedText('')
    let rows = []
    if (pdfFiles.length) {
      setExtracting(true)
      for (const file of pdfFiles) {
        updatePdfFile(file.file_name, { status: 'extracting', warning: '', pageCount: 0, rowCount: 0 })
        const result = await extractTextFromPdf(file.file)
        const detectedStoreName = meta.store_name || file.store_name || detectStore(result.text)
        const fileMeta = {
          ...meta,
          store_name: detectedStoreName,
          source: 'pdf_upload',
          source_file_name: file.file_name,
        }

        if (!result.success) {
          updatePdfFile(file.file_name, {
            status: 'insufficientText',
            warning: result.warning ? t(result.warning) : t('pdfTextInsufficient'),
            pageCount: result.pageCount,
            rowCount: 0,
          })
          if (result.text) setExtractedText(result.text.slice(0, 1000))
          continue
        }

        let fileRows = result.pages.flatMap((page) =>
          parseOfferText(page.text, { ...fileMeta, source_page: page.pageNumber }),
        )
        if (!fileRows.length) {
          fileRows = parseOfferText(result.text, { ...fileMeta, source_page: 1 })
        }
        const uniqueRows = mergePreviewRows([], fileRows)
        if (!uniqueRows.length) {
          updatePdfFile(file.file_name, {
            status: 'insufficientText',
            warning: t('noPreviewRows'),
            pageCount: result.pageCount,
            rowCount: 0,
          })
          setExtractedText(result.text.slice(0, 1000))
          continue
        }

        updatePdfFile(file.file_name, {
          status: 'previewGenerated',
          warning: '',
          pageCount: result.pageCount,
          rowCount: uniqueRows.length,
        })
        rows = rows.concat(uniqueRows)
      }
      setExtracting(false)
    }

    if (text.trim()) {
      rows = rows.concat(parseOfferText(text, { ...meta, source: 'manual_text', source_file_name: '', source_page: 1 }))
    }

    if (!rows.length) {
      if (pdfFiles.length) {
        setLocalNotice(t('pdfExtractionNotSupported'))
      } else {
        setLocalNotice(t('noPreviewRows'))
      }
      return
    }

    const merged = mergePreviewRows(preview, rows)
    onPreviewChange(merged)
    if (autoImport) {
      await onConfirmPreview('safe', merged)
      onTabChange('offers')
      return
    }
    onTabChange('offers')
  }

  return (
    <section className="section">
      <h2>{t('importLeaflets')}</h2>
      <div className="notice">{t('noAutoScraping')}</div>
      <div className="form-grid">
        <label>{t('pdfFiles')}<input type="file" accept="application/pdf" multiple onChange={(event) => {
          const files = [...event.target.files]
          setPdfFiles(files.map((file) => ({
            file,
            file_name: file.name,
            size: file.size,
            store_name: detectStore(file.name) || meta.store_name || '',
            status: 'uploaded',
            pageCount: 0,
            rowCount: 0,
            warning: '',
          })))
        }} /></label>
        <label>{t('store')}<select value={meta.store_name} onChange={(event) => setMeta({ ...meta, store_name: event.target.value })}><option value="">{t('detectStore')}</option>{storeNames.map((store) => <option key={store} value={store}>{store}</option>)}</select></label>
        <Input label={t('validFrom')} type="date" value={meta.valid_from} onChange={(value) => setMeta({ ...meta, valid_from: value })} />
        <Input label={t('validUntil')} type="date" value={meta.valid_until} onChange={(value) => setMeta({ ...meta, valid_until: value })} />
      </div>
      {pdfFiles.length > 0 && (
        <div className="list">
          {pdfFiles.map((file) => (
            <article className="list-item" key={file.file_name}>
              <div>
                <strong>{file.file_name}</strong>
                <span>{t('store')}: {file.store_name || t('detectStore')} - {(file.size / 1024 / 1024).toFixed(2)} MB</span>
                <span>{t(`pdfStatus_${file.status}`)}</span>
                {file.pageCount > 0 && <span>{file.pageCount} {t('pages')}</span>}
                {file.rowCount > 0 && <span>{file.rowCount} {t('previewRows')}</span>}
                {file.warning && <span className="notice danger">{file.warning}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
      {localNotice && <div className="notice danger">{localNotice}</div>}
      {extractedText && (
        <details className="notice">
          <summary>{t('extractedText')}</summary>
          <pre>{extractedText}</pre>
        </details>
      )}
      <label>{t('manualTextImport')}<textarea rows="8" value={text} onChange={(event) => setText(event.target.value)} placeholder="Netto&#10;Lapte 1L 0,99 €&#10;Cafea 500g 4,99 €" /></label>
      <label className="checkbox"><input type="checkbox" checked={autoImport} onChange={(event) => setAutoImport(event.target.checked)} />{t('autoImportSafeRows')}</label>
      <div className="form-actions">
        <button type="button" onClick={handleExtractPreview} disabled={extracting}>{extracting ? t('pdfExtracting') : t('processPdfFiles')}</button>
      </div>
    </section>
  )
}

function ExtractedProductsTab({ currency, locale, preview, savedOffers, t, onConfirmPreview, onPreviewChange }) {
  const safeCount = preview.filter((item) => item.status === 'ok' && toNumber(item.confidence) >= 0.75).length

  return (
    <section className="section">
      <div className="section-title">
        <div>
          <h2>{t('extractedProducts')}</h2>
          <p className="muted">{t('offerPreview')}</p>
        </div>
        <div className="button-pair">
          {safeCount > 0 && <button type="button" onClick={() => onConfirmPreview('safe')}>{t('confirmSafeRows')}</button>}
          <button type="button" className="secondary" onClick={() => onPreviewChange(preview.filter((item) => item.status !== 'needs_review'))}>{t('ignoreUnsafeRows')}</button>
        </div>
      </div>
      {!preview.length ? (
        <div className="notice">{t('noExtractedProducts')}</div>
      ) : (
        <>
          <div className="notice">{preview.length} {t('previewRows')} · {safeCount} {t('ok')}</div>
          <OfferRows rows={preview} currency={currency} locale={locale} t={t} editable onChange={onPreviewChange} />
        </>
      )}
      {savedOffers && savedOffers.length > 0 && (
        <div className="notice success">{t('savedOffers')}: {savedOffers.length}</div>
      )}
    </section>
  )
}

function SearchOffersTab({ activeOffers, allOffers, currency, locale, t }) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const results = trimmed
    ? activeOffers
      .map((offer) => ({ offer, ...productMatch(query, offer.product_name) }))
      .filter((item) => item.match)
      .sort((a, b) => {
        const diff = offerCompareValue(a.offer) - offerCompareValue(b.offer)
        if (diff !== 0) return diff
        return toNumber(b.offer.confidence) - toNumber(a.offer.confidence)
      })
    : []
  const expiredResults = trimmed
    ? allOffers
      .filter((offer) => offer.validityStatus === 'expired')
      .map((offer) => ({ offer, ...productMatch(query, offer.product_name) }))
      .filter((item) => item.match)
    : []

  const best = results[0]?.offer || null
  const recommendation = best
    ? t('bestPriceRecommendation')
        .replace('{query}', trimmed)
        .replace('{store}', best.store_name)
        .replace('{price}', `${formatMoney(best.unit_price || best.price, currency, locale)}${best.unit_price ? `/${normalizedUnitLabel(best.unit)}` : ''}`)
    : ''

  return (
    <section className="section">
      <div className="section-title">
        <h2>{t('shopping_search')}</h2>
      </div>
      <div className="form-grid">
        <label>{t('searchOffersLabel')}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchOffersPlaceholder')} /></label>
      </div>
      {!trimmed && <div className="notice">{t('searchOffersPlaceholder')}</div>}
      {trimmed && results.length === 0 && <div className="notice">{t('noSearchResults')}</div>}
      {trimmed && results.length === 0 && expiredResults.length > 0 && <div className="notice">{t('onlyExpiredOffersForProduct')}</div>}
      {best && (
        <article className="list-item highlighted">
          <div>
            <strong>{t('bestMatch')}</strong>
            <span>{best.store_name} — {best.product_name}</span>
            <span>{formatMoney(best.price, currency, locale)}{best.unit_price ? ` · ${formatMoney(best.unit_price, currency, locale)}/${normalizedUnitLabel(best.unit)}` : ''}</span>
            <span>{recommendation}</span>
          </div>
        </article>
      )}
      {results.length > 1 && (
        <div className="list">
          {results.slice(1).map((item, index) => (
            <article className="list-item" key={`${item.offer.store_name}-${item.offer.product_name}-${index}`}>
              <div>
                <strong>{item.offer.store_name} — {item.offer.product_name}</strong>
                <span>{formatMoney(item.offer.price, currency, locale)}{item.offer.unit_price ? ` · ${formatMoney(item.offer.unit_price, currency, locale)}/${normalizedUnitLabel(item.offer.unit)}` : ''}</span>
                <span>{item.offer.valid_until ? `${t('validUntil')}: ${item.offer.valid_until}` : ''}</span>
                <div className="badge-row">
                  {item.approx && <span className="badge danger">{t('approxMatch')}</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function OfferRows({ rows, currency, editable = false, locale, t, onChange }) {
  if (!rows.length) return <div className="empty">{t('noData')}</div>
  return (
    <div className="offer-table">
      {rows.map((row, index) => (
        <article className="list-item" key={`${row.store_name}-${row.product_name}-${index}`}>
          <div>
            <strong>{row.store_name || t('detectStore')} · {row.product_name}</strong>
            <span>{row.brand || '-'} · {row.quantity || ''}{row.unit || ''} · {formatMoney(row.price, currency, locale)} · {row.unit_price ? `${formatMoney(row.unit_price, currency, locale)}/${normalizedUnitLabel(row.unit)}` : '-'}</span>
            <span>{row.source_file_name ? `${row.source_file_name} · ` : ''}{row.source_page ? `${t('page')} ${row.source_page}` : ''}</span>
            <div className="badge-row">
              <span className={`badge ${row.status === 'needs_review' ? 'danger' : ''}`}>{row.status === 'needs_review' ? t('needsReview') : t('ok')}</span>
              {row.app_price && <span className="badge">{t('appPrice')}</span>}
              {toNumber(row.confidence) < 0.75 && <span className="badge danger">{t('approxMatch')}</span>}
            </div>
          </div>
          {editable && (
            <div className="list-value">
              <button type="button" className="ghost" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>{t('delete')}</button>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

function BestPricesTab({ bestPrices, offers, allOffers, currency, locale, t }) {
  const [query, setQuery] = useState('')

  const searchResults = query.trim()
    ? offers
      .map((offer) => ({ offer, ...productMatch(query, offer.product_name) }))
      .filter((item) => item.match)
      .sort((a, b) => offerCompareValue(a.offer) - offerCompareValue(b.offer))
    : []
  const expiredResults = query.trim()
    ? allOffers
      .filter((offer) => offer.validityStatus === 'expired')
      .map((offer) => ({ offer, ...productMatch(query, offer.product_name) }))
      .filter((item) => item.match)
    : []

  const bestMatch = searchResults[0]?.offer || null

  return (
    <section className="section">
      <h2>{t('bestPrices')}</h2>
      <div className="form-grid">
        <label>{t('searchOffersLabel')}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchOffersPlaceholder')} /></label>
      </div>

      {query.trim() ? (
        <>
          {searchResults.length === 0 ? (
            <div className="notice">
              {t('noSearchResults')}
              {expiredResults.length > 0 ? <span className="block-note">{t('onlyExpiredOffersForProduct')}</span> : null}
            </div>
          ) : (
            <>
              <article className="list-item highlighted">
                <div>
                  <strong>{t('bestMatch')}</strong>
                  <span>{bestMatch.store_name}: {formatMoney(bestMatch.price, currency, locale)}{bestMatch.unit_price ? ` · ${formatMoney(bestMatch.unit_price, currency, locale)}/${normalizedUnitLabel(bestMatch.unit)}` : ''}</span>
                  <span>{bestMatch.valid_until ? `${t('validUntil')}: ${bestMatch.valid_until}` : ''}</span>
                  {bestMatch.app_price && <span className="badge">{t('appPrice')}</span>}
                </div>
              </article>
              <div className="list">
                {searchResults.slice(1).map((item, index) => (
                  <article className="list-item" key={`${item.offer.id || index}-${item.offer.product_name}-${item.offer.store_name}`}>
                    <div>
                      <strong>{item.offer.store_name}: {item.offer.product_name}</strong>
                      <span>{formatMoney(item.offer.price, currency, locale)}{item.offer.unit_price ? ` · ${formatMoney(item.offer.unit_price, currency, locale)}/${normalizedUnitLabel(item.offer.unit)}` : ''}</span>
                      <span>{item.offer.valid_until ? `${t('validUntil')}: ${item.offer.valid_until}` : ''}</span>
                      <div className="badge-row">
                        {item.offer.app_price && <span className="badge">{t('appPrice')}</span>}
                        {item.approx && <span className="badge danger">{t('approxMatch')}</span>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="list">
          {bestPrices.length === 0 ? <div className="empty">{t('noData')}</div> : bestPrices.map((item) => (
            <article className="list-item" key={item.product_name}>
              <div>
                <strong>{item.product_name}</strong>
                {item.best ? (
                  <>
                    <span>{item.best.store_name}: {formatMoney(item.best.price, currency, locale)}{item.best.unit_price ? ` · ${formatMoney(item.best.unit_price, currency, locale)}/${normalizedUnitLabel(item.best.unit)}` : ''}</span>
                    <span>{t('lastPaid')}: {item.history?.last ? `${item.history.last.store || '-'} · ${formatMoney(item.history.last.value, currency, locale)}` : t('noHistory')}</span>
                    <div className="badge-row">
                      <span className="badge">{item.saving > 0 ? t('goodOffer') : t('notGoodOffer')}</span>
                      {item.isBestObserved && <span className="badge">{t('bestObservedPrice')}</span>}
                      {item.approx && <span className="badge danger">{t('approxMatch')}</span>}
                    </div>
                  </>
                ) : <span>{t('noOfferFound')}</span>}
              </div>
              <div className="list-value">
                <b>{item.best ? formatMoney(Math.max(0, item.saving), currency, locale) : '-'}</b>
                <span>{item.best ? t('estimatedSaving') : ''}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function StoreRecommendationsTab({ currency, locale, recommendations, stores, t, onSaveStore }) {
  const [form, setForm] = useState({ name: '', address: '', distance_km: '', fuel_cost_estimate: '', on_regular_route: false, notes: '' })
  return (
    <>
      <section className="section">
        <h2>{t('storeRecommendations')}</h2>
        <div className="list">
          {recommendations.length === 0 ? <div className="empty">{t('noData')}</div> : recommendations.map((item) => (
            <article className="list-item" key={item.store}>
              <div>
                <strong>{item.store}</strong>
                <span>{item.matches} {t('matchedProducts')} · {item.bestCount} {t('bestPriceProducts')} · {t('estimatedSaving')}: {formatMoney(item.saving, currency, locale)}</span>
                <span>{item.netSaving !== null ? `${t('netSaving')}: ${formatMoney(item.netSaving, currency, locale)}` : t('noDistanceSet')}</span>
              </div>
              <div className="list-value"><span className={`badge ${item.recommendation === 'no' ? 'danger' : ''}`}>{t(item.recommendation)}</span></div>
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <h2>{t('storeSettings')}</h2>
        <form className="form-grid" onSubmit={(event) => {
          event.preventDefault()
          onSaveStore(form)
          setForm({ name: '', address: '', distance_km: '', fuel_cost_estimate: '', on_regular_route: false, notes: '' })
        }}>
          <label>{t('store')}<select value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}><option value="">{t('store')}</option>{storeNames.map((store) => <option key={store} value={store}>{store}</option>)}</select></label>
          <Input label={t('address')} value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
          <Input label={t('distanceKm')} type="number" value={form.distance_km} onChange={(value) => setForm({ ...form, distance_km: value })} />
          <Input label={t('fuelCostPerKm')} type="number" value={form.fuel_cost_estimate} onChange={(value) => setForm({ ...form, fuel_cost_estimate: value })} />
          <label className="checkbox"><input type="checkbox" checked={form.on_regular_route} onChange={(event) => setForm({ ...form, on_regular_route: event.target.checked })} />{t('onRegularRoute')}</label>
          <Input label={t('notes')} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
          <div className="form-actions"><button type="submit">{t('save')}</button></div>
        </form>
        <div className="mini-stats">
          {stores.map((store) => <span key={store.id}>{store.name}: <strong>{store.distance_km || '-'} km</strong></span>)}
        </div>
      </section>
    </>
  )
}

function ShoppingHistoryTab({ currency, history, locale, analytics, t }) {
  const analyticsArray = Object.entries(analytics || {}).map(([key, value]) => {
    const [product, store] = key.split('|')
    return { product, store, ...value }
  })

  return (
    <section className="section">
      <h2>{t('priceHistory')}</h2>
      
      {analyticsArray.length > 0 && (
        <>
          <div className="section">
            <h3>📊 {t('priceAnalytics')}</h3>
            <div className="list">
              {analyticsArray.map((item, idx) => (
                <article className="list-item" key={`${item.product}-${item.store}-${idx}`}>
                  <div>
                    <strong>{item.product} @ {item.store}</strong>
                    <span>
                      {t('current')}: {formatMoney(item.current, currency, locale)} | 
                      {t('average')}: {formatMoney(item.avg, currency, locale)} |
                      {t('trend')}: <span style={{color: item.trend > 0 ? '#d9534f' : '#5cb85c'}}>{item.trend > 0 ? '📈' : '📉'} {item.trend}%</span>
                    </span>
                    <span>{t('observations')}: {item.records}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </>
      )}
      
      <div className="section">
        <h3>📝 {t('priceHistory')}</h3>
        <div className="list">
          {history.length === 0 ? <div className="empty">{t('noData')}</div> : history.map((item) => (
            <article className="list-item" key={item.product}>
              <div>
                <strong>{item.product}</strong>
                <span>{t('lastObservedPrice')}: {formatMoney(item.last.value, currency, locale)} · {t('lowestObservedPrice')}: {formatMoney(item.min.value, currency, locale)} · {t('highestObservedPrice')}: {formatMoney(item.max.value, currency, locale)}</span>
                <span>{item.last.store || t('noStore')} · {item.unit ? `${t('unitComparison')}: ${item.unit}` : t('totalPriceComparison')}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function OfferSourcesTab({ sources, t, onDelete, onSave }) {
  const [form, setForm] = useState({ store_name: '', source_url: '', active: false, import_mode: 'manual_pdf', status: 'manual', notes: '' })
  return (
    <>
      <section className="section">
        <h2>{t('offerSources')}</h2>
        <div className="notice">{t('onlineImportFuture')}</div>
        <div className="notice" style={{ fontSize: '0.85rem' }}>
          Open Prices va putea fi folosit mai târziu pentru prețuri comunitare și produse cu cod de bare. Fără apel API în acest moment.
        </div>
        <form className="form-grid" onSubmit={(event) => {
          event.preventDefault()
          onSave(form)
          setForm({ store_name: '', source_url: '', active: false, import_mode: 'manual_pdf', status: 'manual', notes: '' })
        }}>
          <label>{t('store')}<select value={form.store_name} onChange={(event) => setForm({ ...form, store_name: event.target.value })}><option value="">{t('store')}</option>{storeNames.map((store) => <option key={store} value={store}>{store}</option>)}</select></label>
          <Input label="URL" value={form.source_url} onChange={(value) => setForm({ ...form, source_url: value })} />
          <label>{t('importMode')}<select value={form.import_mode} onChange={(event) => setForm({ ...form, import_mode: event.target.value, active: event.target.value === 'auto_future' ? false : form.active })}><option value="manual_pdf">manual_pdf</option><option value="manual_text">manual_text</option><option value="link_experimental">link_experimental</option><option value="auto_future" disabled>auto_future</option></select></label>
          <label className="checkbox"><input type="checkbox" checked={form.active} disabled={form.import_mode === 'auto_future'} onChange={(event) => setForm({ ...form, active: event.target.checked })} />{t('active')}</label>
          <Input label={t('notes')} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
          <div className="form-actions"><button type="submit">{t('save')}</button></div>
        </form>
      </section>
      <EntityList
        title={t('offerSources')}
        items={sources.map((item) => ({ ...item, name: item.store_name, amount: 0 }))}
        currency="EUR"
        language="ro"
        emptyText={t('noData')}
        renderMeta={(item) => `${item.import_mode} - ${item.active ? t('active') : t('inactive')} - ${item.status || '-'}`}
        onEdit={() => {}}
        onDelete={onDelete}
      />
    </>
  )
}

const kaufdaMockOffers = [
  // Milch (Lapte)
  {
    product_name: 'Milch proaspata 3.5% (Frische Milch)',
    store_name: 'Norma',
    brand: 'Landfein',
    category: 'mâncare',
    price: 0.89,
    old_price: 1.19,
    discount_percent: 25,
    quantity: 1,
    unit: 'L',
    unit_price: 0.89,
    app_price: false,
  },
  {
    product_name: 'H-Milch UHT 1.5% grasime',
    store_name: 'Aldi',
    brand: 'Milsani',
    category: 'mâncare',
    price: 0.99,
    old_price: 1.15,
    discount_percent: 14,
    quantity: 1,
    unit: 'L',
    unit_price: 0.99,
    app_price: false,
  },
  {
    product_name: 'Milch Bio organica 3.5%',
    store_name: 'Lidl',
    brand: 'Milbona',
    category: 'mâncare',
    price: 1.15,
    old_price: 1.45,
    discount_percent: 20,
    quantity: 1,
    unit: 'L',
    unit_price: 1.15,
    app_price: false,
  },
  {
    product_name: 'H-Milch 3.5% grasime',
    store_name: 'Netto',
    brand: 'Gutes Land',
    category: 'mâncare',
    price: 0.95,
    old_price: 1.09,
    discount_percent: 12,
    quantity: 1,
    unit: 'L',
    unit_price: 0.95,
    app_price: true,
  },
  {
    product_name: 'Milch proaspata 3.5% Landliebe',
    store_name: 'Kaufland',
    brand: 'Landliebe',
    category: 'mâncare',
    price: 1.29,
    old_price: 1.69,
    discount_percent: 23,
    quantity: 1,
    unit: 'L',
    unit_price: 1.29,
    app_price: false,
  },
  {
    product_name: 'Milch organica proaspata Demeter',
    store_name: 'Rewe',
    brand: 'Rewe Bio',
    category: 'mâncare',
    price: 1.49,
    old_price: 1.89,
    discount_percent: 21,
    quantity: 1,
    unit: 'L',
    unit_price: 1.49,
    app_price: false,
  },
  // Kaffee (Cafea)
  {
    product_name: 'Cafea boabe Jacobs Barista Edition',
    store_name: 'Aldi',
    brand: 'Jacobs',
    category: 'mâncare',
    price: 8.88,
    old_price: 13.99,
    discount_percent: 36,
    quantity: 1000,
    unit: 'g',
    unit_price: 8.88,
    app_price: false,
  },
  {
    product_name: 'Cafea macinata Jacobs Kronung',
    store_name: 'Kaufland',
    brand: 'Jacobs',
    category: 'mâncare',
    price: 4.49,
    old_price: 6.99,
    discount_percent: 35,
    quantity: 500,
    unit: 'g',
    unit_price: 8.98,
    app_price: false,
  },
  {
    product_name: 'Cafea boabe Crema d\'Oro',
    store_name: 'Rewe',
    brand: 'Dallmayr',
    category: 'mâncare',
    price: 9.99,
    old_price: 14.99,
    discount_percent: 33,
    quantity: 1000,
    unit: 'g',
    unit_price: 9.99,
    app_price: false,
  },
  {
    product_name: 'Cafea macinata Tchibo Feine Milde',
    store_name: 'Lidl',
    brand: 'Tchibo',
    category: 'mâncare',
    price: 4.99,
    old_price: 6.99,
    discount_percent: 28,
    quantity: 500,
    unit: 'g',
    unit_price: 9.98,
    app_price: true,
  },
  {
    product_name: 'Cafea macinata Lavazza Crema e Gusto',
    store_name: 'Edeka',
    brand: 'Lavazza',
    category: 'mâncare',
    price: 3.49,
    old_price: 4.99,
    discount_percent: 30,
    quantity: 250,
    unit: 'g',
    unit_price: 13.96,
    app_price: false,
  },
  {
    product_name: 'Cafea macinata Dallmayr Prodomo',
    store_name: 'Norma',
    brand: 'Dallmayr',
    category: 'mâncare',
    price: 5.29,
    old_price: 7.49,
    discount_percent: 29,
    quantity: 500,
    unit: 'g',
    unit_price: 10.58,
    app_price: false,
  },
  // Butter (Unt)
  {
    product_name: 'Unt de masa Meggle Butter',
    store_name: 'Rewe',
    brand: 'Meggle',
    category: 'mâncare',
    price: 1.49,
    old_price: 2.59,
    discount_percent: 42,
    quantity: 250,
    unit: 'g',
    unit_price: 5.96,
    app_price: false,
  },
  {
    product_name: 'Unt ecologic Kerrygold',
    store_name: 'Aldi',
    brand: 'Kerrygold',
    category: 'mâncare',
    price: 1.69,
    old_price: 2.79,
    discount_percent: 39,
    quantity: 250,
    unit: 'g',
    unit_price: 6.76,
    app_price: false,
  },
  {
    product_name: 'Unt premium Landliebe Butter',
    store_name: 'Lidl',
    brand: 'Landliebe',
    category: 'mâncare',
    price: 1.39,
    old_price: 2.49,
    discount_percent: 44,
    quantity: 250,
    unit: 'g',
    unit_price: 5.56,
    app_price: true,
  },
  {
    product_name: 'Unt marca proprie Norma Butter',
    store_name: 'Norma',
    brand: 'Landfein',
    category: 'mâncare',
    price: 1.25,
    old_price: 1.89,
    discount_percent: 33,
    quantity: 250,
    unit: 'g',
    unit_price: 5.00,
    app_price: false,
  },
  // Kartoffeln (Cartofi)
  {
    product_name: 'Cartofi BIO (Speisekartoffeln)',
    store_name: 'Norma',
    brand: 'Bio Sonne',
    category: 'mâncare',
    price: 1.99,
    old_price: 2.79,
    discount_percent: 28,
    quantity: 2.5,
    unit: 'kg',
    unit_price: 0.80,
    app_price: false,
  },
  {
    product_name: 'Cartofi timpurii (Frühkartoffeln)',
    store_name: 'Aldi',
    brand: 'Gartenkrone',
    category: 'mâncare',
    price: 2.49,
    old_price: 3.49,
    discount_percent: 28,
    quantity: 2.5,
    unit: 'kg',
    unit_price: 1.00,
    app_price: false,
  },
  {
    product_name: 'Cartofi rosii (Rote Kartoffeln)',
    store_name: 'Lidl',
    brand: 'Landjunker',
    category: 'mâncare',
    price: 2.99,
    old_price: 3.99,
    discount_percent: 25,
    quantity: 5,
    unit: 'kg',
    unit_price: 0.60,
    app_price: false,
  },
  // Zwiebeln (Ceapă)
  {
    product_name: 'Ceapa galbena (Speisezwiebeln)',
    store_name: 'Netto',
    brand: 'Gartenfrisch',
    category: 'mâncare',
    price: 1.19,
    old_price: 1.59,
    discount_percent: 25,
    quantity: 2,
    unit: 'kg',
    unit_price: 0.60,
    app_price: false,
  },
  {
    product_name: 'Ceapa rosie BIO (Rote Zwiebeln)',
    store_name: 'Edeka',
    brand: 'Edeka Bio',
    category: 'mâncare',
    price: 0.99,
    old_price: 1.39,
    discount_percent: 28,
    quantity: 500,
    unit: 'g',
    unit_price: 1.98,
    app_price: false,
  },
  {
    product_name: 'Ceapa verde (Frühlingszwiebeln)',
    store_name: 'Lidl',
    brand: 'Lidl Fresh',
    category: 'mâncare',
    price: 0.49,
    old_price: 0.79,
    discount_percent: 37,
    quantity: 1,
    unit: 'leg',
    unit_price: 0.49,
    app_price: true,
  },
  // Tomaten (Roșii)
  {
    product_name: 'Rosii Cherry (Cherrytomaten)',
    store_name: 'Rewe',
    brand: 'Rewe Beste Wahl',
    category: 'mâncare',
    price: 1.29,
    old_price: 1.89,
    discount_percent: 31,
    quantity: 500,
    unit: 'g',
    unit_price: 2.58,
    app_price: false,
  },
  {
    product_name: 'Rosii pe ciorchine (Strauchtomaten)',
    store_name: 'Kaufland',
    brand: 'K-Classic',
    category: 'mâncare',
    price: 1.79,
    old_price: 2.49,
    discount_percent: 28,
    quantity: 1000,
    unit: 'g',
    unit_price: 1.79,
    app_price: false,
  },
  // Obst (Banane & Äpfel)
  {
    product_name: 'Banane ecologice BIO',
    store_name: 'Aldi',
    brand: 'Fairtrade Bio',
    category: 'mâncare',
    price: 1.69,
    old_price: 2.19,
    discount_percent: 22,
    quantity: 1,
    unit: 'kg',
    unit_price: 1.69,
    app_price: false,
  },
  {
    product_name: 'Mere rosii Jonagold (Äpfel)',
    store_name: 'Netto',
    brand: 'Heimatliebe',
    category: 'mâncare',
    price: 1.99,
    old_price: 2.99,
    discount_percent: 33,
    quantity: 2,
    unit: 'kg',
    unit_price: 1.00,
    app_price: false,
  },
  // Sonnenblumenöl (Ulei)
  {
    product_name: 'Ulei de floarea soarelui (Sonnenblumenöl)',
    store_name: 'Lidl',
    brand: 'Vita D\'or',
    category: 'mâncare',
    price: 1.39,
    old_price: 1.79,
    discount_percent: 22,
    quantity: 1,
    unit: 'L',
    unit_price: 1.39,
    app_price: false,
  },
  // Eier & Brot (Ouă & Pâine)
  {
    product_name: 'Oua proaspete BIO Clasa A (10 buc)',
    store_name: 'Lidl',
    brand: 'Landjunker',
    category: 'mâncare',
    price: 2.49,
    old_price: 2.99,
    discount_percent: 16,
    quantity: 10,
    unit: 'buc',
    unit_price: 0.25,
    app_price: false,
  },
  {
    product_name: 'Oua proaspete crescute la sol (10 buc)',
    store_name: 'Norma',
    brand: 'Landfein',
    category: 'mâncare',
    price: 1.69,
    old_price: 1.99,
    discount_percent: 15,
    quantity: 10,
    unit: 'buc',
    unit_price: 0.17,
    app_price: false,
  },
  {
    product_name: 'Paine toast Butter Toastbrot',
    store_name: 'Aldi',
    brand: 'Goldähren',
    category: 'mâncare',
    price: 0.99,
    old_price: 1.29,
    discount_percent: 23,
    quantity: 500,
    unit: 'g',
    unit_price: 1.98,
    app_price: false,
  },
  {
    product_name: 'Paine traditionala germana Krustenbrot',
    store_name: 'Netto',
    brand: 'Bäcker Krone',
    category: 'mâncare',
    price: 1.49,
    old_price: 1.99,
    discount_percent: 25,
    quantity: 1000,
    unit: 'g',
    unit_price: 1.49,
    app_price: false,
  }
]

function KaufdaFeedTab({ t, shoppingList = [], onImportOffer }) {
  const [search, setSearch] = useState('')
  const [storeFilter, setStoreFilter] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  const offersWithDates = useMemo(() => {
    const now = new Date()
    const currentDay = now.getDay()
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay
    
    const monday = new Date(now)
    monday.setDate(now.getDate() + distanceToMonday)
    
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    
    const formatDate = (d) => {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    const validity = {
      valid_from: formatDate(monday),
      valid_until: formatDate(sunday)
    }

    return kaufdaMockOffers.map(offer => ({
      ...offer,
      valid_from: validity.valid_from,
      valid_until: validity.valid_until
    }))
  }, [])

  // Highlight calculations
  const cheapestMilk = useMemo(() => {
    const milks = offersWithDates.filter(o => o.product_name.toLowerCase().includes('milch') || o.product_name.toLowerCase().includes('lapte'))
    if (!milks.length) return null
    return milks.reduce((min, o) => o.price < min.price ? o : min, milks[0])
  }, [offersWithDates])

  const cheapestCoffee = useMemo(() => {
    const coffees = offersWithDates.filter(o => o.product_name.toLowerCase().includes('kaffee') || o.product_name.toLowerCase().includes('cafea'))
    if (!coffees.length) return null
    return coffees.reduce((min, o) => {
      const oUnitVal = o.unit_price || o.price
      const minUnitVal = min.unit_price || min.price
      return oUnitVal < minUnitVal ? o : min
    }, coffees[0])
  }, [offersWithDates])

  // React filter
  const filteredOffers = useMemo(() => {
    return offersWithDates.filter(offer => {
      const query = search.trim().toLowerCase()
      const matchesSearch = !query ||
        offer.product_name.toLowerCase().includes(query) ||
        offer.brand.toLowerCase().includes(query) ||
        offer.store_name.toLowerCase().includes(query)
      
      const matchesStore = !storeFilter || offer.store_name.toLowerCase() === storeFilter.toLowerCase()
      
      let matchesCat = true
      const isMilk = offer.product_name.toLowerCase().includes('milch') || offer.product_name.toLowerCase().includes('lapte')
      const isCoffee = offer.product_name.toLowerCase().includes('kaffee') || offer.product_name.toLowerCase().includes('cafea')
      const isButter = offer.product_name.toLowerCase().includes('butter') || offer.product_name.toLowerCase().includes('unt')
      const isVeg = /zwiebel|kartoffel|ceapa|ceapă|cartof|tomate/i.test(offer.product_name)
      const isFruit = /banan|apfel|mere|obst/i.test(offer.product_name)

      if (selectedCategory === 'milk') {
        matchesCat = isMilk
      } else if (selectedCategory === 'coffee') {
        matchesCat = isCoffee
      } else if (selectedCategory === 'butter') {
        matchesCat = isButter
      } else if (selectedCategory === 'veg') {
        matchesCat = isVeg
      } else if (selectedCategory === 'fruit') {
        matchesCat = isFruit
      } else if (selectedCategory === 'other') {
        matchesCat = !isMilk && !isCoffee && !isButter && !isVeg && !isFruit
      }
      
      return matchesSearch && matchesStore && matchesCat
    })
  }, [offersWithDates, search, storeFilter, selectedCategory])

  const categories = [
    { key: 'all', label: t('kaufdaAllOffers') },
    { key: 'milk', label: t('kaufdaMilkOnly') },
    { key: 'coffee', label: t('kaufdaCoffeeOnly') },
    { key: 'butter', label: t('kaufdaButterOnly') },
    { key: 'veg', label: t('kaufdaVegOnly') },
    { key: 'fruit', label: t('kaufdaFruitOnly') },
    { key: 'other', label: t('kaufdaOthersOnly') }
  ]

  return (
    <>
      <section className="section">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <h2 style={{ fontSize: '1.25rem', color: '#17463c' }}>{t('kaufdaFeedTitle')}</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>{t('kaufdaFeedSubtitle')}</p>
        </div>

        {/* Dynamic highlights dashboard */}
        <div className="metric-grid" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
          {cheapestMilk && (
            <div className="metric-card positive" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid rgba(23, 70, 60, 0.15)', boxShadow: '0 4px 12px rgba(23, 70, 60, 0.05)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', right: '-10px', top: '-10px', fontSize: '4.5rem', opacity: 0.08, pointerEvents: 'none' }}>🥛</div>
              <div>
                <span style={{ textTransform: 'uppercase', fontSize: '0.74rem', fontWeight: '900', letterSpacing: '0.04em', color: '#17463c' }}>
                  {t('kaufdaCheapestMilkHighlight')}
                </span>
                <h3 style={{ margin: '0.3rem 0 0.1rem 0', color: '#17463c', fontWeight: '800', fontSize: '1.05rem', lineHeight: '1.25' }}>
                  {cheapestMilk.product_name}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#63746e' }}>
                  {cheapestMilk.brand} · {cheapestMilk.quantity}{cheapestMilk.unit}
                </span>
              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <strong style={{ fontSize: '1.45rem', color: '#17463c', fontWeight: '900' }}>{cheapestMilk.price.toFixed(2)}€</strong>
                {cheapestMilk.old_price && (
                  <span style={{ textDecoration: 'line-through', fontSize: '0.82rem', color: '#a7352a', opacity: 0.8 }}>
                    {cheapestMilk.old_price.toFixed(2)}€
                  </span>
                )}
                <span className="badge" style={{ backgroundColor: '#17463c', color: '#fff', fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '4px' }}>
                  {cheapestMilk.store_name}
                </span>
              </div>
            </div>
          )}

          {cheapestCoffee && (
            <div className="metric-card positive" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid rgba(23, 70, 60, 0.15)', boxShadow: '0 4px 12px rgba(23, 70, 60, 0.05)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', right: '-10px', top: '-10px', fontSize: '4.5rem', opacity: 0.08, pointerEvents: 'none' }}>☕</div>
              <div>
                <span style={{ textTransform: 'uppercase', fontSize: '0.74rem', fontWeight: '900', letterSpacing: '0.04em', color: '#17463c' }}>
                  {t('kaufdaCheapestCoffeeHighlight')}
                </span>
                <h3 style={{ margin: '0.3rem 0 0.1rem 0', color: '#17463c', fontWeight: '800', fontSize: '1.05rem', lineHeight: '1.25' }}>
                  {cheapestCoffee.product_name}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#63746e' }}>
                  {cheapestCoffee.brand} · {cheapestCoffee.quantity}{cheapestCoffee.unit} ({cheapestCoffee.unit_price.toFixed(2)}€/kg)
                </span>
              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <strong style={{ fontSize: '1.45rem', color: '#17463c', fontWeight: '900' }}>{cheapestCoffee.price.toFixed(2)}€</strong>
                {cheapestCoffee.old_price && (
                  <span style={{ textDecoration: 'line-through', fontSize: '0.82rem', color: '#a7352a', opacity: 0.8 }}>
                    {cheapestCoffee.old_price.toFixed(2)}€
                  </span>
                )}
                <span className="badge" style={{ backgroundColor: '#17463c', color: '#fff', fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '4px' }}>
                  {cheapestCoffee.store_name}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Category Chips and Filters Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', borderTop: '1px solid var(--line)', paddingTop: '1rem', marginTop: '0.5rem' }}>
          {/* Brand Filter Chips */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <button
                key={cat.key}
                type="button"
                className={selectedCategory === cat.key ? 'active' : 'secondary'}
                onClick={() => setSelectedCategory(cat.key)}
                style={{
                  borderRadius: '20px',
                  padding: '0.35rem 0.9rem',
                  fontSize: '0.82rem',
                  minHeight: 'auto',
                  transition: 'all 0.2s ease',
                  backgroundColor: selectedCategory === cat.key ? '#17463c' : '#e8eee4',
                  color: selectedCategory === cat.key ? '#fff' : '#17463c',
                  border: 'none',
                  boxShadow: selectedCategory === cat.key ? '0 3px 8px rgba(23, 70, 60, 0.2)' : 'none'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search bar and Supermarket filter dropdown */}
          <div className="filters" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.65rem' }}>
            <input 
              type="text" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder={t('kaufdaSearchPlaceholder')}
              style={{
                borderRadius: '8px',
                border: '1px solid #cdd8d2',
                padding: '0.65rem 0.75rem',
                fontSize: '0.9rem'
              }}
            />
            <select 
              value={storeFilter} 
              onChange={(e) => setStoreFilter(e.target.value)}
              aria-label={t('kaufdaFilterStore')}
              style={{
                borderRadius: '8px',
                border: '1px solid #cdd8d2',
                padding: '0.65rem 0.75rem',
                fontSize: '0.9rem'
              }}
            >
              <option value="">{t('all')}</option>
              {['Aldi', 'Lidl', 'Netto', 'Norma', 'Rewe', 'Kaufland', 'Edeka'].map(store => (
                <option key={store} value={store}>{store}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Offers Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1.1rem',
          marginTop: '0.5rem'
        }}>
          {filteredOffers.length === 0 ? (
            <div className="empty" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2.5rem' }}>
              {t('kaufdaNoOffersMatched')}
            </div>
          ) : (
            filteredOffers.map((offer, idx) => {
              const isAlreadyImported = shoppingList.some(saved => 
                !saved.purchased &&
                (normalizeProduct(saved.product_name).includes(normalizeProduct(offer.product_name)) ||
                 normalizeProduct(offer.product_name).includes(normalizeProduct(saved.product_name))) &&
                String(saved.preferred_store).toLowerCase() === String(offer.store_name).toLowerCase()
              )

              const storeColors = {
                lidl: { bg: '#e5effb', border: '#2861a8', badgeBg: '#0050aa', text: '#fff' },
                aldi: { bg: '#e8eff5', border: '#002f6c', badgeBg: '#002f6c', text: '#fff' },
                netto: { bg: '#fffce8', border: '#ffcc00', badgeBg: '#d30000', text: '#fff' },
                norma: { bg: '#fff3e8', border: '#e67e22', badgeBg: '#d35400', text: '#fff' },
                rewe: { bg: '#fdebeb', border: '#cc0022', badgeBg: '#cc0022', text: '#fff' },
                kaufland: { bg: '#fff2f2', border: '#e30613', badgeBg: '#e30613', text: '#fff' },
                edeka: { bg: '#eef6ea', border: '#339933', badgeBg: '#00529f', text: '#fff' }
              }

              const defaultColors = { bg: '#fcfcfc', border: '#dde4da', badgeBg: '#63746e', text: '#fff' }
              const colors = storeColors[offer.store_name.toLowerCase()] || defaultColors

              return (
                <article 
                  key={idx}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'stretch',
                    backgroundColor: '#ffffff',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '12px',
                    padding: '1.2rem',
                    position: 'relative',
                    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.02)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    cursor: 'default'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)'
                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.02)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                    <span style={{ 
                      backgroundColor: colors.badgeBg, 
                      color: colors.text, 
                      fontWeight: '900', 
                      fontSize: '0.78rem', 
                      padding: '0.25rem 0.6rem', 
                      borderRadius: '5px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}>
                      {offer.store_name}
                    </span>
                    {offer.discount_percent && (
                      <span className="badge danger" style={{ fontSize: '0.82rem', fontWeight: '800' }}>
                        -{offer.discount_percent}%
                      </span>
                    )}
                  </div>

                  <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '800', color: '#15231f', lineHeight: '1.3' }}>
                      {offer.product_name}
                    </h4>
                    <span style={{ fontSize: '0.82rem', color: '#63746e' }}>
                      Brand: <strong>{offer.brand || '-'}</strong>
                    </span>
                    <span style={{ fontSize: '0.82rem', color: '#63746e' }}>
                      {t('kaufdaUnitLabel')}: <strong>{offer.quantity} {offer.unit}</strong> 
                      {offer.unit_price && ` (${offer.unit_price.toFixed(2)}€/${normalizedUnitLabel(offer.unit)})`}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: '#93a49e', marginTop: '0.2rem' }}>
                      {t('kaufdaValidUntil')}: {offer.valid_until}
                    </span>
                    
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.4rem', marginBottom: '0.6rem' }}>
                      {offer.app_price && (
                        <span className="badge" style={{ backgroundColor: '#fff0c8', color: '#735214', border: '1px solid #ffe299', fontSize: '0.72rem', padding: '0.15rem 0.4rem' }}>
                          📱 {t('kaufdaAppPrice')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ 
                    borderTop: '1px solid #f2f2f2', 
                    paddingTop: '0.75rem', 
                    marginTop: '0.4rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {offer.old_price && (
                        <span style={{ textDecoration: 'line-through', fontSize: '0.74rem', color: '#a7352a', opacity: 0.85 }}>
                          {offer.old_price.toFixed(2)}€
                        </span>
                      )}
                      <strong style={{ fontSize: '1.35rem', color: '#17463c', fontWeight: '900' }}>{offer.price.toFixed(2)}€</strong>
                    </div>
                    
                    <button 
                      type="button" 
                      disabled={isAlreadyImported}
                      className={isAlreadyImported ? 'secondary' : ''}
                      onClick={() => onImportOffer(offer)}
                      style={{
                        padding: '0.45rem 0.75rem',
                        minHeight: 'auto',
                        fontSize: '0.82rem',
                        borderRadius: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        backgroundColor: isAlreadyImported ? '#e3efe8' : '#17463c',
                        color: isAlreadyImported ? '#17463c' : '#fff',
                        cursor: isAlreadyImported ? 'default' : 'pointer'
                      }}
                    >
                      {isAlreadyImported ? '✓ ' + t('kaufdaImportedStatus') : t('kaufdaAddToMyOffers')}
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </section>
    </>
  )
}

function Input({ label, value, onChange, type = 'text', ...props }) {
  return <label>{label}<input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} {...props} /></label>
}
function ShoppingListTab({ currency, items, language, t, getRecommendations, getRoute, notifications, onDelete, onSave }) {
  const [form, setForm] = useState({ product_name: '', category: 'mâncare', desired_quantity: '', unit: '', priority: 'normal', preferred_store: '', notes: '' })
  const route = getRoute && items.length ? getRoute(items.filter(i => !i.purchased)) : null
  
  return (
    <>
      <section className="section">
        <h2>{t('myShoppingList')}</h2>
        
        {route && route.stores.length > 0 && (
          <div className="card info">
            <strong>🛍️ {t('recommendedRoute')}:</strong> {route.stores.join(' → ')} | 
            Distanță: {route.totalDistance.toFixed(1)}km | Estimare economie: ~{route.savings}€
          </div>
        )}
        
        <form className="form-grid" onSubmit={(event) => {
          event.preventDefault()
          onSave(form)
          setForm({ product_name: '', category: 'mâncare', desired_quantity: '', unit: '', priority: 'normal', preferred_store: '', notes: '' })
        }}>
          <Input label={t('productName')} value={form.product_name} onChange={(value) => setForm({ ...form, product_name: value })} required />
          <Input label={t('category')} value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
          <Input label={t('quantity')} type="number" value={form.desired_quantity} onChange={(value) => setForm({ ...form, desired_quantity: value })} />
          <Input label={t('unit')} value={form.unit} onChange={(value) => setForm({ ...form, unit: value })} />
          <label>{t('priority')}<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="normal">{t('normal')}</option><option value="important">{t('important')}</option><option value="offer_only">{t('offerOnly')}</option></select></label>
          <label>{t('preferredStore')}<select value={form.preferred_store} onChange={(event) => setForm({ ...form, preferred_store: event.target.value })}><option value="">{t('all')}</option>{storeNames.map((store) => <option key={store} value={store}>{store}</option>)}</select></label>
          <Input label={t('notes')} value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
          <div className="form-actions"><button type="submit">{t('add')}</button></div>
        </form>
      </section>
      
      {notifications && notifications.length > 0 && (
        <div className="card success">
          <strong>🔔 {notifications.length} notificări cu prețuri reduse!</strong>
          <ul>
            {notifications.slice(0, 5).map(n => (
              <li key={n.id}>{n.product_name} la {n.store_name}: <strong>{n.new_price}€</strong> (-{n.price_reduction_percent}%)</li>
            ))}
          </ul>
        </div>
      )}
      
      <EntityList
        title={t('myShoppingList')}
        items={items.map((item) => {
          const recs = getRecommendations ? getRecommendations(item) : []
          const cheapest = recs[0]
          return {
            ...item,
            name: item.product_name,
            amount: 0,
            recommendation: cheapest ? `${cheapest.store_name}: ${cheapest.price}€` : null,
          }
        })}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => `${item.category || '-'} - ${t(item.priority || 'normal')}${item.preferred_store ? ` - ${item.preferred_store}` : ''} ${item.recommendation ? `| 💰 ${item.recommendation}` : ''}`}
        onEdit={() => {}}
        onDelete={onDelete}
        renderActions={(item) => item.purchased ? <span className="badge">{t('paid')}</span> : null}
      />
    </>
  )
}

function OfferPreviewTab({ currency, language, locale, preview, savedOffers, t, showExpiredOffers, onConfirmPreview, onDeleteOffer, onPreviewChange, onToggleExpiredOffers }) {
  return (
    <>
      <section className="section">
        <div className="section-title">
          <h2>{t('offerPreview')}</h2>
          <div className="button-pair">
            <button type="button" onClick={() => onConfirmPreview('safe')}>{t('confirmSafeRows')}</button>
            <button type="button" className="secondary" onClick={() => onPreviewChange(preview.filter((item) => item.status !== 'needs_review'))}>{t('ignoreUnsafeRows')}</button>
          </div>
        </div>
        {!preview.length && <div className="notice">{t('noPreviewRows')}</div>}
        <OfferRows rows={preview} currency={currency} locale={locale} t={t} editable onChange={onPreviewChange} />
      </section>
      <EntityList
        title={t('savedOffers')}
        items={savedOffers.map((item) => ({ ...item, name: `${item.product_name} · ${item.store_name}`, amount: item.price }))}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        renderMeta={(item) => `${item.quantity || ''}${item.unit || ''} - ${offerValidityText(item, t, locale)} - ${item.status}${item.app_price ? ` - ${t('appPrice')}` : ''}`}
        onEdit={() => {}}
        onDelete={onDeleteOffer}
        renderActions={(item) => (
          <div className="badge-row">
            <span className={`badge ${item.validityStatus === 'expired' ? 'danger' : item.validityStatus === 'unknown' ? 'muted-badge' : ''}`}>
              {t(`offerStatus_${item.validityStatus || getOfferValidityStatus(item)}`)}
            </span>
          </div>
        )}
      />
      <section className="section compact-section">
        <label className="checkbox">
          <input type="checkbox" checked={showExpiredOffers} onChange={(event) => onToggleExpiredOffers(event.target.checked)} />
          {t('showExpiredOffers')}
        </label>
      </section>
    </>
  )
}

export { SmartShopping }

function ManualOfferForm({ currency, locale, onSave }) {
  const [form, setForm] = useState(() => {
    const today = isoDate(new Date())
    const next = new Date()
    next.setDate(next.getDate() + 7)
    return {
      offer_source: 'manual',
      store_name: '',
      product_name: '',
      price: '',
      quantity: '',
      unit: '',
      valid_from: today,
      valid_until: isoDate(next),
      source_url: '',
      barcode: '',
      notes: '',
    }
  })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (!form.product_name.trim() || !form.store_name.trim() || !form.price) {
      setNotice('Completează magazinul, produsul și prețul.')
      return
    }
    setSaving(true)
    setNotice('')
    try {
      await onSave(buildManualOfferPayload(form))
      setForm((current) => ({
        ...current,
        product_name: '',
        price: '',
        quantity: '',
        unit: '',
        source_url: '',
        barcode: '',
        notes: '',
      }))
      setNotice('Oferta manuală a fost salvată.')
    } catch (error) {
      setNotice(error?.message || 'Nu s-a putut salva oferta.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="section">
      <div className="section-title">
        <div>
          <h2>✏️ Ofertă manuală</h2>
          <p className="muted">Adaugă o ofertă din orice sursă — KaufDA, Marktguru, MeinProspekt, manual, Open Prices (etichetă).</p>
        </div>
      </div>
      {notice && <div className="notice">{notice}</div>}
      <form className="form-grid" onSubmit={submit}>
        <label>Sursă ofertă
          <select value={form.offer_source} onChange={(event) => setForm({ ...form, offer_source: event.target.value })}>
            {OFFER_SOURCE_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Magazin
          <select value={form.store_name} onChange={(event) => setForm({ ...form, store_name: event.target.value })} required>
            <option value="">Alege magazin</option>
            {SHOPPING_STORES.map((store) => <option key={store} value={store}>{store}</option>)}
          </select>
        </label>
        <Input label="Produs" value={form.product_name} onChange={(value) => setForm({ ...form, product_name: value })} required />
        <Input label="Preț (EUR)" type="number" min="0" step="0.01" value={form.price} onChange={(value) => setForm({ ...form, price: value })} required />
        <Input label="Cantitate" type="number" min="0" step="0.001" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
        <Input label="Unitate" value={form.unit} onChange={(value) => setForm({ ...form, unit: value })} placeholder="L, kg, buc..." />
        <label>Valabil de la<input type="date" value={form.valid_from} onChange={(event) => setForm({ ...form, valid_from: event.target.value })} /></label>
        <label>Valabil până la<input type="date" value={form.valid_until} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} /></label>
        <Input label="Link sursă (opțional)" value={form.source_url} onChange={(value) => setForm({ ...form, source_url: value })} />
        <Input label="Cod de bare / EAN (opțional)" value={form.barcode} onChange={(value) => setForm({ ...form, barcode: value })} />
        <Input label="Notițe (opțional)" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        {(form.offer_source === 'open_prices' || form.offer_source === 'online') && (
          <div className="notice" style={{ gridColumn: '1 / -1', fontSize: '0.85rem' }}>
            {form.offer_source === 'open_prices'
              ? 'Open Prices va putea fi folosit mai târziu pentru prețuri comunitare și produse cu cod de bare.'
              : 'Verificarea online de prețuri va fi disponibilă mai târziu. Acum se salvează doar ca referință manuală.'}
          </div>
        )}
        <div className="form-actions">
          <button type="submit" disabled={saving}>{saving ? 'Se salvează...' : 'Salvează oferta'}</button>
        </div>
      </form>
      <p className="muted" style={{ fontSize: '0.82rem', marginTop: '0.5rem' }}>
        Preț estimativ salvat: {form.price ? formatMoney(Number(form.price) || 0, currency, locale) : '—'}
      </p>
    </section>
  )
}

function OffersTab({ offers = [], currency, locale, t, shoppingList = [], onImportOffer }) {
  const [sourceFilter, setSourceFilter] = useState('all')
  const [showExpired, setShowExpired] = useState(false)
  const [viewMode, setViewMode] = useState('journal')

  const filteredOffers = useMemo(() => {
    return offers
      .filter((offer) => offerMatchesSourceFilter(offer, sourceFilter))
      .filter((offer) => showExpired || offer.validityStatus !== 'expired')
  }, [offers, sourceFilter, showExpired])

  const sortedOffers = useMemo(() => {
    const rank = { active: 0, future: 1, unknown: 2, expired: 3 }
    return [...filteredOffers].sort((a, b) => {
      const diff = (rank[a.validityStatus] ?? 9) - (rank[b.validityStatus] ?? 9)
      if (diff !== 0) return diff
      return String(a.store_name || '').localeCompare(String(b.store_name || ''), 'ro')
    })
  }, [filteredOffers])

  const showKaufdaFeed = sourceFilter === 'all' || sourceFilter === 'kaufda'

  return (
    <>
      <section className="section compact-section">
        <div className="section-title">
          <div>
            <h2>🏷️ Oferte</h2>
            <p className="muted">Oferte active din toate sursele — jurnal pe magazine și feed KaufDA (demo).</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {OFFER_SOURCE_FILTER_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={sourceFilter === item.id ? 'active' : 'secondary'}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem', minHeight: 'auto', borderRadius: '999px' }}
              onClick={() => setSourceFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <div className="tabbar inline-tabs" style={{ flexWrap: 'wrap' }}>
            <button type="button" className={viewMode === 'journal' ? 'active' : 'secondary'} onClick={() => setViewMode('journal')}>📓 Jurnal oferte</button>
            {showKaufdaFeed && (
              <button type="button" className={viewMode === 'kaufda' ? 'active' : 'secondary'} onClick={() => setViewMode('kaufda')}>KaufDA (demo)</button>
            )}
          </div>
          <label className="checkbox" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={showExpired} onChange={(event) => setShowExpired(event.target.checked)} />
            Arată și expirate
          </label>
        </div>
      </section>

      {viewMode === 'journal' && (
        <StoreJournalTab offers={sortedOffers} currency={currency} locale={locale} showExpired={showExpired} />
      )}
      {viewMode === 'kaufda' && showKaufdaFeed && (
        <KaufdaFeedTab shoppingList={shoppingList} t={t} onImportOffer={onImportOffer} />
      )}
    </>
  )
}

// ============================================================
// Tab: Jurnal oferte
// ============================================================

function StoreJournalTab({ offers = [], currency, locale, showExpired = false }) {

  const allOffers = useMemo(
    () => offers.map((o) => ({ ...o, _status: o.validityStatus || getOfferValidityStatus(o) })),
    [offers],
  )

  const visibleOffers = useMemo(() => {
    const activeFirst = [...allOffers].sort((a, b) => {
      if (a._status === 'expired' && b._status !== 'expired') return 1
      if (b._status === 'expired' && a._status !== 'expired') return -1
      return 0
    })
    return activeFirst
  }, [allOffers])
  const byStore = useMemo(() => {
    const groups = {}
    visibleOffers.forEach((offer) => {
      const store = (offer.store_name || 'Necunoscut').trim()
      if (!groups[store]) groups[store] = []
      groups[store].push(offer)
    })
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], 'ro'))
  }, [visibleOffers])
  const activeCount = allOffers.filter((o) => o._status === 'active').length
  const expiredCount = allOffers.filter((o) => o._status === 'expired').length
  const futureCount = allOffers.filter((o) => o._status === 'future').length

  const statusStyle = (status) => {
    const sl = getOfferValidityStatusLabel(status)
    return { background: sl.bg, color: sl.color, fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '5px', fontWeight: 700 }
  }

  const storeColors = {
    lidl: '#2861a8', aldi: '#002f6c', netto: '#d30000', norma: '#d35400',
    rewe: '#cc0022', kaufland: '#e30613', edeka: '#339933'
  }

  return (
    <section className="section">
      <div className="section-title">
        <div>
          <h2>📓 Jurnal oferte</h2>
          <p className="muted">Oferte grupate pe magazine — sursă, preț și valabilitate.</p>
        </div>
      </div>

      {/* Sumar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ background: '#d1fae5', color: '#065f46', borderRadius: '8px', padding: '0.5rem 0.85rem', fontSize: '0.85rem', fontWeight: 700 }}>
          ✅ {activeCount} oferte active
        </div>
        <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', padding: '0.5rem 0.85rem', fontSize: '0.85rem', fontWeight: 700 }}>
          ❌ {expiredCount} expirate
        </div>
        <div style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: '8px', padding: '0.5rem 0.85rem', fontSize: '0.85rem', fontWeight: 700 }}>
          🔜 {futureCount} viitoare
        </div>
        {!showExpired && expiredCount > 0 && (
          <div style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: '8px', padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}>
            {expiredCount} expirate ascunse
          </div>
        )}
      </div>

      {byStore.length === 0 ? (
        <div className="notice" style={{ textAlign: 'center', padding: '2.5rem' }}>
          📋 Nicio ofertă de afișat. Importă prospecte sau adaugă oferte manual.
        </div>
      ) : (
        byStore.map(([store, storeOffers]) => {
          const storeColor = storeColors[store.toLowerCase()] || '#63746e'
          const storeActive = storeOffers.filter(o => o._status === 'active').length
          return (
            <div key={store} style={{ marginBottom: '1.5rem' }}>
              {/* Store header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                borderLeft: `4px solid ${storeColor}`,
                paddingLeft: '0.75rem', marginBottom: '0.75rem'
              }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: storeColor }}>{store}</h3>
                <span style={{ fontSize: '0.78rem', background: '#d1fae5', color: '#065f46', borderRadius: '5px', padding: '0.1rem 0.4rem', fontWeight: 700 }}>
                  {storeActive} active
                </span>
                <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{storeOffers.length} total</span>
              </div>

              {/* Offers table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', fontWeight: 700, color: '#374151' }}>Produs</th>
                      <th style={{ textAlign: 'right', padding: '0.4rem 0.6rem', fontWeight: 700, color: '#374151' }}>Preț</th>
                      <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', fontWeight: 700, color: '#374151' }}>Cantitate</th>
                      <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', fontWeight: 700, color: '#374151' }}>Valabil până la</th>
                      <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', fontWeight: 700, color: '#374151' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', fontWeight: 700, color: '#9ca3af' }}>Sursă</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeOffers.map((offer, idx) => {
                      const sl = getOfferValidityStatusLabel(offer._status)
                      return (
                        <tr key={idx} style={{
                          borderBottom: '1px solid #f3f4f6',
                          background: offer._status === 'expired' ? '#fafafa' : offer._status === 'active' ? '#f0fdf4' : '#fff'
                        }}>
                          <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600 }}>
                            {offer.product_name}
                            {offer.brand && <small style={{ color: '#9ca3af', marginLeft: '0.35rem' }}>{offer.brand}</small>}
                          </td>
                          <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                            {offer.price != null ? formatMoney(toNumber(offer.price), currency, locale) : '–'}
                            {offer.old_price && (
                              <small style={{ textDecoration: 'line-through', color: '#ef4444', marginLeft: '0.3rem' }}>
                                {typeof offer.old_price.toFixed === 'function' ? offer.old_price.toFixed(2) : offer.old_price}€
                              </small>
                            )}
                          </td>
                          <td style={{ padding: '0.45rem 0.6rem', color: '#6b7280' }}>
                            {offer.quantity ? `${offer.quantity} ${offer.unit || ''}` : '–'}
                          </td>
                          <td style={{ padding: '0.45rem 0.6rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                            {offer.valid_until || '–'}
                          </td>
                          <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                            <span style={statusStyle(offer._status)}>{sl.label}</span>
                          </td>
                          <td style={{ padding: '0.45rem 0.6rem', color: '#9ca3af', fontSize: '0.75rem' }}>
                            {getOfferSourceLabel(offer.offer_source || offer.source)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}
    </section>
  )
}
