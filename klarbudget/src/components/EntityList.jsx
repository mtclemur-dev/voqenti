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
              {(item.amount !== undefined && item.amount !== null) ? (
                <b>{formatMoney(item.amount, currency, locale)}</b>
              ) : (item.remaining_balance !== undefined || item.current_balance !== undefined) ? (
                <b>{formatMoney(item.remaining_balance ?? item.current_balance, currency, locale)}</b>
              ) : null}
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
