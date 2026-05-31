import { formatMoney } from '../lib/finance'

export function EntityList({ title, items, currency, language, emptyText, editText = 'Editeaza', deleteText = 'Sterge', renderMeta, renderActions, onEdit, onDelete }) {
  const locale = language === 'de' ? 'de-DE' : 'ro-RO'
  return (
    <section className="section">
      <h2>{title}</h2>
      <div className="list">
        {items.length === 0 ? (
          <div className="empty">{emptyText}</div>
        ) : items.map((item) => (
          <article className="list-item" key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <span>{renderMeta(item)}</span>
            </div>
            <div className="list-value">
              <b>{formatMoney(item.amount ?? item.remaining_balance, currency, locale)}</b>
              <div className="row-actions">
                {renderActions?.(item)}
                <button type="button" className="ghost" onClick={() => onEdit(item)}>{editText}</button>
                <button type="button" className="ghost danger-text" onClick={() => onDelete(item)}>{deleteText}</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
