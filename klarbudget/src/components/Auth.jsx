export function Auth({ t, email, password, setEmail, setPassword, onSignIn, onSignUp, error, disabled }) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div>
          <p className="eyebrow">KlarBudget</p>
          <h1>{t('tagline')}</h1>
          <p className="muted">{t('authHint')}</p>
        </div>
        <label>
          {t('email')}
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
        </label>
        <label>
          {t('password')}
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
        </label>
        {error && <div className="notice danger">{error}</div>}
        <div className="button-row">
          <button type="button" onClick={onSignIn} disabled={disabled}>{t('signIn')}</button>
          <button type="button" className="secondary" onClick={onSignUp} disabled={disabled}>{t('signUp')}</button>
        </div>
      </section>
    </main>
  )
}
