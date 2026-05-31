export function Insights({ t, insights }) {
  return (
    <section className="section">
      <h2>{t('insights')}</h2>
      <div className={`status-banner ${insights.state === 'critical' ? 'riskNegative' : insights.state === 'attention' ? 'largePaymentsSoon' : 'onTrack'}`}>
        <strong>{t('monthState')}: {t(insights.state)}</strong>
        <span>{t('budgetRisk')}: {t(insights.risk)}</span>
      </div>
      <div className="insight-list">
        {insights.items.map((item) => (
          <article className={`insight ${item.level}`} key={`${item.title}-${item.text}`}>
            <strong>{item.title}</strong>
            <span>{item.text}</span>
            <small>{item.action}</small>
          </article>
        ))}
      </div>
      <div className="section">
        <h3>Plan recomandat</h3>
        <ol className="steps">
          {insights.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </div>
    </section>
  )
}
