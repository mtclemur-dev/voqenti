export function Auth({
  t,
  buildLabel,
  email,
  password,
  setEmail,
  setPassword,
  accountRole,
  setAccountRole,
  childName,
  setChildName,
  onSignIn,
  onSignUp,
  error,
  disabled,
}) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div>
          <p className="eyebrow">KlarBudget</p>
          {buildLabel && <p className="build-label">{buildLabel}</p>}
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
        <label>
          Tip cont
          <select value={accountRole} onChange={(event) => setAccountRole(event.target.value)}>
            <option value="parent">Parinte</option>
            <option value="child">Copil</option>
          </select>
        </label>
        {accountRole === 'child' && (
          <label>
            Numele copilului
            <input value={childName} onChange={(event) => setChildName(event.target.value)} type="text" autoComplete="name" />
          </label>
        )}
        {error && <div className="notice danger">{error}</div>}
        <div className="button-row">
          <button type="button" onClick={onSignIn} disabled={disabled}>{t('signIn')}</button>
          <button type="button" className="secondary" onClick={onSignUp} disabled={disabled}>{t('signUp')}</button>
        </div>
      </section>
    </main>
  )
}
