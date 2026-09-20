import { Component } from 'react'

const messages = {
  de: {
    title: 'Etwas ist schiefgelaufen',
    body: 'Die Seite ist nicht abgestürzt für immer. Bitte neu laden.',
    button: 'Neu laden',
  },
  ro: {
    title: 'Ceva s-a stricat',
    body: 'Nu e ecran mort. Reincarca pagina.',
    button: 'Reincarca',
  },
  ru: {
    title: 'Что-то сломалось',
    body: 'Это не навсегда. Обновите страницу.',
    button: 'Обновить',
  },
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    const lang = (this.props.language || navigator.language || 'de').slice(0, 2)
    const copy = messages[lang] || messages.de
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-16 text-slate-100">
        <div className="mx-auto max-w-md rounded-[1.75rem] border border-rose-400/30 bg-rose-500/10 p-6">
          <p className="text-lg font-black text-white">{copy.title}</p>
          <p className="mt-2 text-sm text-rose-50/90">{copy.body}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 w-full rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white"
          >
            {copy.button}
          </button>
        </div>
      </div>
    )
  }
}
