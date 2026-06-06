import { useCallback, useEffect, useMemo, useState } from 'react'
import { Auth } from './components/Auth'
import { Dashboard } from './components/Dashboard'
import { AccountForm, DebtForm, ExpenseForm, IncomeForm, JournalEntryForm, WorkAbsenceForm } from './components/Forms'
import { EntityList } from './components/EntityList'
import { DebtPlan } from './components/DebtPlan'
import { PaymentCalendar } from './components/PaymentCalendar'
import { Insights } from './components/Insights'
import { AIActionPanel } from './components/AIActionPanel'
import { FamilyTokenEconomy } from './components/FamilyTokenEconomy'
import { categories, debtCategories, dictionary, languages, makeTranslator } from './i18n'
import { calculateSummary, debtRemainingTotal, expenseKind, formatMoney, isoDate, toNumber, variableBudgetStats } from './lib/finance'
import { buildInsights } from './lib/insights'
import { hasSupabaseConfig, supabase } from './supabaseClient'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

const defaultSettings = {
  monthly_extra_debt_payment: 0,
  debt_method: 'snowball',
  large_payment_threshold: 300,
  include_mortgage_in_plan: false,
  minimum_reserve: 200,
  include_overdraft_in_debt_plan: false,
}

// const navItems = ['dashboard', 'journal', 'shopping', 'workAbsence', 'accounts', 'incomes', 'expenses', 'debts', 'calendar', 'insights', 'aiActions', 'kids']

const storeNames = ['Netto', 'Norma', 'Lidl', 'Aldi', 'Rewe', 'Kaufland', 'Edeka', 'dm', 'Rossmann', 'Globus']
const BUILD_LABEL = 'KlarBudget build 2026-06-06 20:40 stable-inputs'

function App() {
  const [language, setLanguage] = useState(localStorage.getItem('klarbudget-language') || 'ro')
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accountRole, setAccountRole] = useState('parent')
  const [childName, setChildName] = useState('')
  const [profileAccountRole, setProfileAccountRole] = useState('parent')
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('dashboard')
  const [incomes, setIncomes] = useState([])
  const [expenses, setExpenses] = useState([])
  const [debts, setDebts] = useState([])
  const [accounts, setAccounts] = useState([])
  const [accountSnapshots, setAccountSnapshots] = useState([])
  const [paymentStatuses, setPaymentStatuses] = useState([])
  const [journalEntries, setJournalEntries] = useState([])
  const [dailyClosures, setDailyClosures] = useState([])
  const [journalSchemaReady, setJournalSchemaReady] = useState(true)
  const [workAbsences, setWorkAbsences] = useState([])
  const [workAbsenceSchemaReady, setWorkAbsenceSchemaReady] = useState(true)
  const [shoppingList, setShoppingList] = useState([])
  const [weeklyOffers, setWeeklyOffers] = useState([])
  const [stores, setStores] = useState([])
  const [offerSources, setOfferSources] = useState([])
  const [shoppingSchemaReady, setShoppingSchemaReady] = useState(true)
  const [settings, setSettings] = useState(defaultSettings)
  const [settingsDraft, setSettingsDraft] = useState(defaultSettings)
  const [currency, setCurrency] = useState('EUR')
  const [editing, setEditing] = useState({ incomes: null, expenses: null, debts: null, accounts: null, journal: null, workAbsence: null })
  const [formOpen, setFormOpen] = useState({ incomes: false, expenses: false, debts: false, accounts: false, journal: true, workAbsence: false })
  const [notice, setNotice] = useState('')
  const [expenseFilters, setExpenseFilters] = useState({ search: '', category: 'all', type: 'all', sort: 'date' })
  const [debtSort, setDebtSort] = useState('priority')
  const [shoppingTab, setShoppingTab] = useState('import')
  const [offerPreview, setOfferPreview] = useState([])
  // eslint-disable-next-line no-unused-vars
  const [priceHistory, setPriceHistory] = useState([])
  const [receipts, setReceipts] = useState([])
  const [receiptItems, setReceiptItems] = useState([])

  const t = useMemo(() => makeTranslator(language), [language])

  useEffect(() => {
    localStorage.setItem('klarbudget-language', language)
  }, [language])

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const [profileRes, incomesRes, expensesRes, debtsRes, paymentsRes, settingsRes, accountsRes, snapshotsRes, journalRes, closuresRes, workAbsencesRes, shoppingListRes, offersRes, storesRes, sourcesRes, priceHistoryRes, receiptsRes, receiptItemsRes] = await Promise.all([
      supabase.from('kb_profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('kb_incomes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('kb_expenses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('kb_debts').select('*').eq('user_id', user.id).order('priority', { ascending: true }),
      supabase.from('kb_payment_status').select('*').eq('user_id', user.id).order('due_date', { ascending: true }),
      supabase.from('kb_settings').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('kb_accounts').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('kb_account_snapshots').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: false }),
      supabase.from('kb_daily_entries').select('*').eq('user_id', user.id).order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('kb_daily_closures').select('*').eq('user_id', user.id).order('closure_date', { ascending: false }),
      supabase.from('kb_work_absences').select('*').eq('user_id', user.id).order('work_date', { ascending: false }).order('start_time', { ascending: false }),
      supabase.from('kb_shopping_list').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('kb_weekly_offers').select('*').eq('user_id', user.id).eq('status', 'confirmed').order('valid_until', { ascending: false }),
      supabase.from('kb_stores').select('*').eq('user_id', user.id).order('name', { ascending: true }),
      supabase.from('kb_offer_sources').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('kb_price_history').select('*').eq('user_id', user.id).order('recorded_at', { ascending: false }),
      supabase.from('kb_receipts').select('*').eq('user_id', user.id).order('purchase_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('kb_receipt_items').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])

    const metadataRole = user.user_metadata?.account_role === 'child' ? 'child' : 'parent'
    if (!profileRes.data) {
      const baseProfile = { id: user.id, preferred_language: language, currency: 'EUR' }
      const { error } = await supabase.from('kb_profiles').insert({ ...baseProfile, account_role: metadataRole })
      if (error && /account_role/i.test(error.message || '')) {
        await supabase.from('kb_profiles').insert(baseProfile)
      }
      setProfileAccountRole(metadataRole)
    } else {
      setCurrency(profileRes.data.currency || 'EUR')
      setLanguage(profileRes.data.preferred_language || language)
      setProfileAccountRole(profileRes.data.account_role || metadataRole)
    }

    if (!settingsRes.data) {
      const { data } = await supabase
        .from('kb_settings')
        .insert({
          user_id: user.id,
          monthly_extra_debt_payment: defaultSettings.monthly_extra_debt_payment,
          debt_method: defaultSettings.debt_method,
          large_payment_threshold: defaultSettings.large_payment_threshold,
          include_mortgage_in_plan: defaultSettings.include_mortgage_in_plan,
        })
        .select('*')
        .single()
      const nextSettings = { ...defaultSettings, ...(data || {}) }
      setSettings(nextSettings)
      setSettingsDraft(nextSettings)
    } else {
      const nextSettings = { ...defaultSettings, ...settingsRes.data }
      setSettings(nextSettings)
      setSettingsDraft(nextSettings)
    }

    setIncomes(incomesRes.data || [])
    setExpenses(expensesRes.data || [])
    setDebts(debtsRes.data || [])
    setPaymentStatuses(paymentsRes.data || [])
    setAccounts(accountsRes.data || [])
    setAccountSnapshots(snapshotsRes.data || [])
    setJournalEntries(journalRes.data || [])
    setDailyClosures(closuresRes.data || [])
    setJournalSchemaReady(!journalRes.error && !closuresRes.error)
    setWorkAbsences(workAbsencesRes.data || [])
    setWorkAbsenceSchemaReady(!workAbsencesRes.error)
    setShoppingList(shoppingListRes.data || [])
    setWeeklyOffers(offersRes.data || [])
    setStores(storesRes.data || [])
    setOfferSources(sourcesRes.data || [])
    setPriceHistory(priceHistoryRes.data || [])
    setReceipts(receiptsRes.data || [])
    setReceiptItems(receiptItemsRes.data || [])
    setShoppingSchemaReady(!shoppingListRes.error && !offersRes.error && !storesRes.error && !sourcesRes.error && !receiptsRes.error && !receiptItemsRes.error)
    setLoading(false)
  }, [language, user])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Automatic shopping refresh is disabled. It was reloading the app while typing in forms.

  const summary = useMemo(
    () => calculateSummary({ incomes, expenses, debts, settings, paymentStatuses, accounts, accountSnapshots, journalEntries }),
    [incomes, expenses, debts, settings, paymentStatuses, accounts, accountSnapshots, journalEntries],
  )

  const insights = useMemo(
    () => buildInsights({ summary, incomes, expenses, debts, settings, paymentStatuses, t, language, currency }),
    [summary, incomes, expenses, debts, settings, paymentStatuses, t, language, currency],
  )

  const signIn = async () => {
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
  }

  const signUp = async () => {
    setAuthError('')
    const cleanChildName = childName.trim()
    if (accountRole === 'child' && !cleanChildName) {
      setAuthError('Scrie numele copilului pentru contul de copil.')
      return
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          account_role: accountRole,
          child_name: accountRole === 'child' ? cleanChildName : null,
        },
      },
    })
    if (error) setAuthError(error.message)
  }

  const saveRow = async (table, payload, currentItem = null) => {
    const prepared = preparePayload(payload)
    const query = currentItem
      ? supabase.from(table).update(prepared).eq('id', currentItem.id).eq('user_id', user.id)
      : supabase.from(table).insert({ ...prepared, user_id: user.id })
    const { error } = await query
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setEditing({ incomes: null, expenses: null, debts: null, accounts: null })
    setFormOpen({ incomes: false, expenses: false, debts: false, accounts: false })
    setNotice(t('savedSuccess'))
    loadData()
  }

  const deleteRow = async (table, row) => {
    if (!window.confirm(t('deleteConfirm'))) return
    const { error } = await supabase.from(table).delete().eq('id', row.id).eq('user_id', user.id)
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
    }
    else {
      setEditing({ incomes: null, expenses: null, debts: null, accounts: null })
      setNotice(t('deletedSuccess'))
      loadData()
    }
  }

  const saveAccount = async (payload, currentItem = null) => {
    const prepared = preparePayload(cleanAccountPayload(payload))
    const query = currentItem
      ? supabase.from('kb_accounts').update(prepared).eq('id', currentItem.id).eq('user_id', user.id)
      : supabase.from('kb_accounts').insert({ ...prepared, user_id: user.id }).select('*').single()
    const { data, error } = await query
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }

    const accountId = currentItem?.id || data?.id
    if (accountId) {
      await supabase.from('kb_account_snapshots').insert({
        user_id: user.id,
        account_id: accountId,
        balance: prepared.current_balance,
      })
    }

    setEditing((current) => ({ ...current, accounts: null }))
    setFormOpen((current) => ({ ...current, accounts: false }))
    setNotice(t('savedSuccess'))
    loadData()
  }

  const saveJournalEntry = async (payload, currentItem = null) => {
    const targetDate = payload.entry_date || isoDate(new Date())
    const closed = dailyClosures.some((item) => item.closure_date === targetDate)
    if (!currentItem && closed) {
      setNotice(t('journalDayClosedBlocked'))
      return
    }
    const prepared = preparePayload({
      ...payload,
      product_name: payload.product_name || inferProductName(payload.description),
    })
    let query = currentItem
      ? supabase.from('kb_daily_entries').update(prepared).eq('id', currentItem.id).eq('user_id', user.id)
      : supabase.from('kb_daily_entries').insert({ ...prepared, user_id: user.id })
    let { error } = await query
    if (error && /entry_mode|unit_price/i.test(error.message || '')) {
      const fallback = { ...prepared }
      delete fallback.entry_mode
      delete fallback.unit_price
      query = currentItem
        ? supabase.from('kb_daily_entries').update(fallback).eq('id', currentItem.id).eq('user_id', user.id)
        : supabase.from('kb_daily_entries').insert({ ...fallback, user_id: user.id })
      ;({ error } = await query)
    }
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setEditing((current) => ({ ...current, journal: null }))
    setNotice(t('savedSuccess'))
    loadData()
  }

  const closeJournalDay = async (date) => {
    const closed = dailyClosures.find((item) => item.closure_date === date)
    if (closed) {
      if (!window.confirm(t('reopenDayConfirm'))) return
      const { error } = await supabase.from('kb_daily_closures').delete().eq('id', closed.id).eq('user_id', user.id)
      if (error) {
        setNotice(t('saveError'))
        window.alert(error.message)
        return
      }
      setNotice(t('dayReopened'))
      loadData()
      return
    }
    const entries = journalEntries.filter((item) => item.entry_date === date)
    const total = entries.reduce((sum, item) => sum + toNumber(item.amount), 0)
    const { error } = await supabase.from('kb_daily_closures').upsert({
      user_id: user.id,
      closure_date: date,
      total_amount: total,
      entry_count: entries.length,
    }, { onConflict: 'user_id,closure_date' })
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('dayClosed'))
    loadData()
  }

  const deleteJournalEntry = async (item) => {
    const closed = dailyClosures.some((closure) => closure.closure_date === item.entry_date)
    if (closed && !window.confirm(t('deleteClosedDayConfirm'))) return
    if (!window.confirm(t('journalDeleteConfirm'))) return
    const { error } = await supabase.from('kb_daily_entries').delete().eq('id', item.id).eq('user_id', user.id)
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setEditing((current) => ({ ...current, journal: null }))
    setNotice(t('deletedSuccess'))
    loadData()
  }

  const saveWorkAbsence = async (payload, currentItem = null) => {
    const prepared = normalizeWorkAbsencePayload(payload)
    const query = currentItem
      ? supabase.from('kb_work_absences').update(prepared).eq('id', currentItem.id).eq('user_id', user.id)
      : supabase.from('kb_work_absences').insert({ ...prepared, user_id: user.id })
    const { error } = await query
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setEditing((current) => ({ ...current, workAbsence: null }))
    setFormOpen((current) => ({ ...current, workAbsence: false }))
    setNotice(t('savedSuccess'))
    loadData()
  }

  const saveShoppingItem = async (payload) => {
    const prepared = preparePayload(payload)
    const insertData = {
      ...prepared,
      priority: prepared.priority || 'normal',
      user_id: user.id,
    }
    const { error } = await supabase.from('kb_shopping_list').insert(insertData)
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('savedSuccess'))
    loadData()
  }

  const saveReceipt = async ({ receipt, items, createJournalEntry }) => {
    if (!items.length) {
      setNotice('Nu am gasit produse de salvat.')
      return
    }

    const total = items.reduce((sum, item) => sum + toNumber(item.total_price), 0)
    const { data: savedReceipt, error: receiptError } = await supabase
      .from('kb_receipts')
      .insert({
        user_id: user.id,
        store_name: receipt.store_name || 'Magazin',
        purchase_date: receipt.purchase_date || isoDate(new Date()),
        total_amount: total,
        source: receipt.source || 'manual_text',
        raw_text: receipt.raw_text || null,
        notes: receipt.notes || null,
      })
      .select('*')
      .single()

    if (receiptError) {
      setNotice(t('saveError'))
      window.alert(receiptError.message)
      return
    }

    const rows = items.map((item) => ({
      user_id: user.id,
      receipt_id: savedReceipt.id,
      product_name: item.product_name,
      category: item.category || inferOfferCategory(item.product_name),
      quantity: item.quantity || null,
      unit: item.unit || null,
      unit_price: item.unit_price || null,
      total_price: toNumber(item.total_price),
      notes: item.notes || null,
    }))

    const { error: itemError } = await supabase.from('kb_receipt_items').insert(rows)
    if (itemError) {
      setNotice(t('saveError'))
      window.alert(itemError.message)
      return
    }

    await supabase.from('kb_price_history').insert(rows.map((item) => ({
      user_id: user.id,
      product_name: item.product_name,
      store_name: savedReceipt.store_name,
      price: item.total_price,
      unit_price: item.unit_price,
      quantity: item.quantity,
      unit: item.unit,
      recorded_at: savedReceipt.purchase_date,
    })))

    if (createJournalEntry) {
      await saveJournalEntry({
        entry_date: savedReceipt.purchase_date,
        description: `Bon ${savedReceipt.store_name}`,
        amount: total,
        category: 'mancare',
        store: savedReceipt.store_name,
        product_name: 'Bon cumparaturi',
        entry_mode: 'detailed',
      })
    } else {
      loadData()
    }

    setNotice(`Bon salvat: ${total.toFixed(2)} ${currency}.`)
  }

  const saveStore = async (payload) => {
    const prepared = preparePayload(payload)
    if (prepared.import_mode === 'auto_future') prepared.active = false
    const table = 'source_url' in prepared || 'import_mode' in prepared ? 'kb_offer_sources' : 'kb_stores'
    const { error } = await supabase.from(table).insert({ ...prepared, user_id: user.id })
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('savedSuccess'))
    loadData()
  }

  const confirmOfferPreview = async (mode = 'safe', previewRows = null) => {
    const sourceRows = previewRows || offerPreview
    const rows = sourceRows
      .filter((item) => mode === 'all' ? item.status !== 'ignored' : item.status === 'ok' && toNumber(item.confidence) >= 0.75)
      .map((item) => normalizeOfferPayload({ ...item, status: 'confirmed' }))
      .filter((item) => !weeklyOffers.some((offer) =>
        normalizeProduct(offer.product_name) === normalizeProduct(item.product_name) &&
        String(offer.store_name).toLowerCase() === String(item.store_name).toLowerCase() &&
        toNumber(offer.price) === toNumber(item.price) &&
        String(offer.valid_until || '') === String(item.valid_until || ''),
      ))
    if (!rows.length) return
    const { error } = await supabase.from('kb_weekly_offers').insert(rows.map((row) => ({ ...row, user_id: user.id })))
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('offersImported'))
    loadData()
  }

  const startWorkAbsence = async () => {
    if (!workAbsenceSchemaReady) return
    const active = workAbsences.find((item) => item.is_active)
    if (active) return
    const now = new Date()
    const { error } = await supabase.from('kb_work_absences').insert({
      user_id: user.id,
      work_date: isoDate(now),
      start_time: timeValue(now),
      break_minutes: 0,
      entry_source: 'automatic',
      is_active: true,
      confirmed: false,
    })
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('workAbsenceStarted'))
    loadData()
  }

  const stopWorkAbsence = async (active) => {
    if (!active) return
    const now = new Date()
    const payload = normalizeWorkAbsencePayload({
      ...active,
      end_time: timeValue(now),
      entry_source: 'automatic',
      is_active: false,
      confirmed: window.confirm(t('workConfirmOnStop')),
    })
    const { error } = await supabase
      .from('kb_work_absences')
      .update(payload)
      .eq('id', active.id)
      .eq('user_id', user.id)
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('workAbsenceStopped'))
    loadData()
  }

  const setExpensePaymentStatus = async (expense, status) => {
    const dueDate = expense.due_date_iso ?? expense.due_date
    if (!dueDate) return
    const payload = {
      user_id: user.id,
      expense_id: expense.id,
      name: expense.name,
      amount: toNumber(expense.amount),
      due_date: dueDate,
      status,
      paid_date: status === 'paid' ? isoDate(new Date()) : null,
    }
    const { error } = await supabase
      .from('kb_payment_status')
      .upsert(payload, { onConflict: 'user_id,expense_id,due_date' })
    if (error) {
      setNotice(t('saveError'))
      window.alert(error.message)
      return
    }
    setNotice(t('paymentSaved'))
    loadData()
  }

  const updateSettings = async (changes) => {
    const next = { ...settings, ...changes }
    setSettings(next)
    const { error } = await supabase
      .from('kb_settings')
      .upsert({ ...next, user_id: user.id }, { onConflict: 'user_id' })
    if (error) window.alert(error.message)
  }

  const saveFinancialSettings = async () => {
    await updateSettings({
      minimum_reserve: Number(settingsDraft.minimum_reserve || 0),
      include_overdraft_in_debt_plan: Boolean(settingsDraft.include_overdraft_in_debt_plan),
    })
    setNotice(t('savedSuccess'))
  }

  const changeLanguage = async (nextLanguage) => {
    setLanguage(nextLanguage)
    if (user) {
      await supabase.from('kb_profiles').upsert({
        id: user.id,
        preferred_language: nextLanguage,
        currency,
      })
    }
  }

  const locale = language === 'de' ? 'de-DE' : 'ro-RO'
  const filteredExpenses = expenses
    .filter((item) => expenseFilters.search ? item.name.toLowerCase().includes(expenseFilters.search.toLowerCase()) : true)
    .filter((item) => expenseFilters.category === 'all' ? true : item.category === expenseFilters.category)
    .filter((item) => {
      if (expenseFilters.type === 'all') return true
      return expenseKind(item) === expenseFilters.type
    })
    .sort((a, b) => {
      if (expenseFilters.sort === 'amount') return toNumber(b.amount) - toNumber(a.amount)
      if (expenseFilters.sort === 'category') return String(a.category).localeCompare(String(b.category), language)
      if (expenseFilters.sort === 'name') return String(a.name).localeCompare(String(b.name), language)
      return String(a.due_date || '').localeCompare(String(b.due_date || ''))
    })
  const sortedDebts = [...debts].sort((a, b) => {
    if (debtSort === 'balance') return toNumber(a.remaining_balance) - toNumber(b.remaining_balance)
    if (debtSort === 'interest') return toNumber(b.interest_rate) - toNumber(a.interest_rate)
    if (debtSort === 'payment') return toNumber(b.monthly_payment) - toNumber(a.monthly_payment)
    if (debtSort === 'end') return String(a.estimated_end_date || '').localeCompare(String(b.estimated_end_date || ''))
    return toNumber(a.priority) - toNumber(b.priority)
  })

  if (loading) {
    return <div className="loading">KlarBudget</div>
  }

  if (!hasSupabaseConfig) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <p className="eyebrow">KlarBudget</p>
          <p className="build-label">{BUILD_LABEL}</p>
          <h1>{dictionary[language].tagline}</h1>
          <div className="notice danger">{dictionary[language].missingEnv}</div>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <Auth
        t={t}
        buildLabel={BUILD_LABEL}
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        accountRole={accountRole}
        setAccountRole={setAccountRole}
        childName={childName}
        setChildName={setChildName}
        onSignIn={signIn}
        onSignUp={signUp}
        error={authError}
      />
    )
  }

  const isChildAccount = profileAccountRole === 'child' || user.user_metadata?.account_role === 'child'

  if (isChildAccount) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">{t('appName')}</p>
            <p className="build-label">{BUILD_LABEL}</p>
            <h1>{t('kids')}</h1>
            <p className="muted">Cont copil: acces doar la recompense.</p>
          </div>
          <div className="top-actions">
            <select value={language} onChange={(event) => changeLanguage(event.target.value)} aria-label="Language">
              {languages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
            <button type="button" className="secondary" onClick={() => supabase.auth.signOut()}>{t('signOut')}</button>
          </div>
        </header>
        <nav className="tabbar" aria-label="KlarBudget child navigation">
          <button type="button" className="active">{t('kids')}</button>
        </nav>
        <main className="content">
          {notice && <div className="toast">{notice}</div>}
          <FamilyTokenEconomy user={user} childOnly />
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{t('appName')}</p>
          <p className="build-label">{BUILD_LABEL}</p>
          <h1>{t('tagline')}</h1>
        </div>
        <div className="top-actions">
          <select value={language} onChange={(event) => changeLanguage(event.target.value)} aria-label="Language">
            {languages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
          <button type="button" className="secondary" onClick={() => supabase.auth.signOut()}>{t('signOut')}</button>
        </div>
      </header>

      <nav className="tabbar" aria-label="KlarBudget navigation" style={{ position: 'static', borderBottom: 0 }}>
        <button
          type="button"
          className={['dashboard', 'insights', 'aiActions'].includes(view) ? 'active' : ''}
          onClick={() => setView('dashboard')}
        >
          📂 {t('navGroup_general')}
        </button>
        <button
          type="button"
          className={['incomes', 'expenses', 'debts', 'accounts'].includes(view) ? 'active' : ''}
          onClick={() => setView('incomes')}
        >
          💰 {t('navGroup_budget')}
        </button>
        <button
          type="button"
          className={['journal', 'shopping', 'workAbsence', 'calendar'].includes(view) ? 'active' : ''}
          onClick={() => setView('journal')}
        >
          📋 {t('navGroup_activity')}
        </button>
      </nav>

      <nav className="tabbar sub-tabbar" aria-label="KlarBudget sub-navigation">
        {['dashboard', 'insights', 'aiActions'].includes(view) &&
          ['dashboard', 'insights', 'aiActions'].map((item) => (
            <button type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>
              {t(item)}
            </button>
          ))
        }
        {['incomes', 'expenses', 'debts', 'accounts'].includes(view) &&
          ['incomes', 'expenses', 'debts', 'accounts'].map((item) => (
            <button type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>
              {t(item)}
            </button>
          ))
        }
        {['journal', 'shopping', 'workAbsence', 'calendar'].includes(view) &&
          ['journal', 'shopping', 'workAbsence', 'calendar'].map((item) => (
            <button type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>
              {t(item)}
            </button>
          ))
        }
      </nav>

      <main className="content">
        {notice && <div className="toast">{notice}</div>}
        {view === 'dashboard' && (
          <Dashboard
            t={t}
            language={language}
            currency={currency}
            summary={summary}
            onNavigate={(nextView) => setView(nextView)}
          />
        )}
        {view === 'journal' && (
          <DailyJournal
            currency={currency}
            dailyClosures={dailyClosures}
            dailyBudget={summary.dailyBudget}
            entries={journalEntries}
            language={language}
            locale={locale}
            t={t}
            editing={editing.journal}
            formOpen={formOpen.journal}
            schemaReady={journalSchemaReady}
            onCloseDay={closeJournalDay}
            onDelete={deleteJournalEntry}
            onEdit={(item) => {
              setEditing((current) => ({ ...current, journal: item }))
              setFormOpen((current) => ({ ...current, journal: true }))
            }}
            onRepeat={(item) => {
              setEditing((current) => ({ ...current, journal: { ...item, id: null, entry_date: isoDate(new Date()), entry_mode: item.entry_mode || 'quick' } }))
              setFormOpen((current) => ({ ...current, journal: true }))
            }}
            onSubmit={(payload) => saveJournalEntry(payload, editing.journal?.id ? editing.journal : null)}
            onCancel={() => setEditing((current) => ({ ...current, journal: null }))}
            onToggleForm={() => setFormOpen((current) => ({ ...current, journal: !current.journal }))}
          />
        )}
        {view === 'shopping' && (
          <SmartShopping
            currency={currency}
            journalEntries={journalEntries}
            language={language}
            locale={locale}
            offerPreview={offerPreview}
            offers={weeklyOffers}
            receiptItems={receiptItems}
            receipts={receipts}
            schemaReady={shoppingSchemaReady}
            shoppingList={shoppingList}
            stores={stores}
            sources={offerSources}
            tab={shoppingTab}
            t={t}
            onConfirmPreview={confirmOfferPreview}
            onDelete={(table, item) => deleteRow(table, item)}
            onPreviewChange={setOfferPreview}
            onSaveItem={saveShoppingItem}
            onSaveReceipt={saveReceipt}
            onSaveStore={saveStore}
            onTabChange={setShoppingTab}
          />
        )}
        {view === 'workAbsence' && (
          <WorkAbsence
            absences={workAbsences}
            currency={currency}
            editing={editing.workAbsence}
            formOpen={formOpen.workAbsence}
            language={language}
            locale={locale}
            schemaReady={workAbsenceSchemaReady}
            t={t}
            onCancel={() => setEditing((current) => ({ ...current, workAbsence: null }))}
            onDelete={(item) => deleteRow('kb_work_absences', item)}
            onEdit={(item) => {
              setEditing((current) => ({ ...current, workAbsence: item }))
              setFormOpen((current) => ({ ...current, workAbsence: true }))
            }}
            onExport={(scope) => exportWorkAbsenceCsv(workAbsences, scope, t)}
            onStart={startWorkAbsence}
            onStop={stopWorkAbsence}
            onSubmit={(payload) => saveWorkAbsence(payload, editing.workAbsence)}
            onToggleForm={() => setFormOpen((current) => ({ ...current, workAbsence: !current.workAbsence }))}
          />
        )}
        {view === 'accounts' && (
          <>
            <section className="section">
              <div className="section-title">
                <h2>{t('accounts')}</h2>
                <button type="button" onClick={() => setFormOpen((current) => ({ ...current, accounts: true }))}>{t('addAccount')}</button>
              </div>
              <div className="mini-stats">
                <span>{t('positiveBalanceTotal')}: <strong>{formatMoney(summary.accounts.positiveTotal, currency, locale)}</strong></span>
                <span>{t('overdraftUsed')}: <strong>{formatMoney(summary.accounts.overdraftUsed, currency, locale)}</strong></span>
                <span>{t('netBalance')}: <strong>{formatMoney(summary.accounts.netBalance, currency, locale)}</strong></span>
                <span>{t('safeAvailableReal')}: <strong>{formatMoney(summary.accounts.safeAvailable, currency, locale)}</strong> <small>{t('safeAvailableHint')}</small></span>
                <span>{t('overdraftAvailable')}: <strong>{formatMoney(summary.accounts.overdraftAvailable, currency, locale)}</strong> <small>{t('overdraftAvailableHint')}</small></span>
                <span>{t('minimumReserve')}: <strong>{formatMoney(summary.accounts.minimumReserve, currency, locale)}</strong></span>
              </div>
              {(summary.accounts.overdraftUsed > 0 || summary.accounts.netBalance < 0) && (
                <div className="notice danger">
                  <strong>{t('priorityNow')}</strong>
                  <span>{summary.accounts.overdraftUsed > 0 ? t('reduceOverdraftPriority') : t('accountsNegative')}</span>
                </div>
              )}
              {summary.accounts.positiveTotal <= 0 && <div className="notice">{t('noPositiveBalanceIncluded')}</div>}
              <div className="mini-stats">
                <span>{t('balanceToday')}: <strong>{formatMoney(summary.accounts.netBalance, currency, locale)}</strong></span>
                <span>{t('balance7DaysAgo')}: <strong>{summary.accounts.balances7DaysAgo === null ? '-' : formatMoney(summary.accounts.balances7DaysAgo, currency, locale)}</strong></span>
                <span>{t('balanceDifference')}: <strong>{summary.accounts.trendDifference === null ? '-' : formatMoney(summary.accounts.trendDifference, currency, locale)}</strong></span>
              </div>
              <div className="notice">{t('bankingLater')}</div>
              {hasPossibleOverdraftDuplicate(accounts, debts) && <div className="notice danger">{t('possibleOverdraftDuplicate')}</div>}
            </section>
            <section className="section">
              <div className="section-title">
                <h2>{t('financialSettings')}</h2>
                <button type="button" onClick={saveFinancialSettings}>{t('saveSettings')}</button>
              </div>
              <p className="muted">{t('salaryFromIncomesHint')}</p>
              <div className="controls">
                <label>
                  {t('minimumReserve')}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settingsDraft.minimum_reserve ?? 200}
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, minimum_reserve: Number(event.target.value || 0) }))}
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(settingsDraft.include_overdraft_in_debt_plan)}
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, include_overdraft_in_debt_plan: event.target.checked }))}
                  />
                  {t('includeOverdraftInDebtPlan')}
                </label>
              </div>
            </section>
            {(formOpen.accounts || editing.accounts) && (
              <AccountForm
                t={t}
                initialItem={editing.accounts}
                onCancel={() => {
                  setEditing((current) => ({ ...current, accounts: null }))
                  setFormOpen((current) => ({ ...current, accounts: false }))
                }}
                onSubmit={(payload) => saveAccount(payload, editing.accounts)}
              />
            )}
            <AccountLists
              accounts={accounts}
              currency={currency}
              language={language}
              locale={locale}
              t={t}
              onEdit={(item) => {
                setEditing({ incomes: null, expenses: null, debts: null, accounts: item })
                setFormOpen((current) => ({ ...current, accounts: true }))
              }}
              onDelete={(item) => deleteRow('kb_accounts', item)}
              onQuickBalance={async (item) => {
                const value = window.prompt(t('newBalance'), item.current_balance ?? 0)
                if (value === null) return
                await saveAccount({ ...item, current_balance: value }, item)
              }}
            />
          </>
        )}
        {view === 'incomes' && (
          <>
            <section className="section">
              <div className="section-title">
                <h2>{t('incomes')}</h2>
                <button type="button" onClick={() => setFormOpen((current) => ({ ...current, incomes: true }))}>{t('addIncome')}</button>
              </div>
              <div className="summary-line">{t('totalMonthlyIncome')}: <strong>{formatMoney(summary.incomeTotal, currency, locale)}</strong></div>
            </section>
            {(formOpen.incomes || editing.incomes) && (
              <IncomeForm
                t={t}
                initialItem={editing.incomes}
                onCancel={() => {
                  setEditing((current) => ({ ...current, incomes: null }))
                  setFormOpen((current) => ({ ...current, incomes: false }))
                }}
                onSubmit={(payload) => saveRow('kb_incomes', payload, editing.incomes)}
              />
            )}
            <EntityList
              title={t('incomes')}
              items={incomes}
              currency={currency}
              language={language}
              emptyText={t('noData')}
              editText={t('edit')}
              deleteText={t('delete')}
              renderMeta={(item) => `${t(item.frequency)} - ${item.active ? t('active') : t('inactive')}${item.occurrence_date ? ` - ${item.occurrence_date}` : ''}`}
              onEdit={(item) => {
                setEditing({ incomes: item, expenses: null, debts: null })
                setFormOpen((current) => ({ ...current, incomes: true }))
              }}
              onDelete={(item) => deleteRow('kb_incomes', item)}
            />
          </>
        )}
        {view === 'expenses' && (
          <>
            <section className="section">
              <div className="section-title">
                <h2>{t('expenses')}</h2>
                <button type="button" onClick={() => setFormOpen((current) => ({ ...current, expenses: true }))}>{t('addExpense')}</button>
              </div>
              <div className="mini-stats">
                <span>{t('totalFixedMonthly')}: <strong>{formatMoney(summary.fixedTotal, currency, locale)}</strong></span>
                <span>{t('totalVariableMonthly')}: <strong>{formatMoney(summary.variableTotal, currency, locale)}</strong></span>
                <span>{t('totalOnceThisMonth')}: <strong>{formatMoney(summary.onceThisMonth, currency, locale)}</strong></span>
              </div>
              <div className="filters">
                <input value={expenseFilters.search} onChange={(event) => setExpenseFilters((current) => ({ ...current, search: event.target.value }))} placeholder={t('searchExpense')} />
                <select value={expenseFilters.category} onChange={(event) => setExpenseFilters((current) => ({ ...current, category: event.target.value }))}>
                  <option value="all">{t('allCategories')}</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <select value={expenseFilters.type} onChange={(event) => setExpenseFilters((current) => ({ ...current, type: event.target.value }))}>
                  <option value="all">{t('allTypes')}</option>
                  <option value="fixed_payment">{t('fixed_payment')}</option>
                  <option value="variable_budget">{t('variable_budget')}</option>
                  <option value="one_time_expense">{t('one_time_expense')}</option>
                </select>
                <select value={expenseFilters.sort} onChange={(event) => setExpenseFilters((current) => ({ ...current, sort: event.target.value }))}>
                  <option value="date">{t('sortByDate')}</option>
                  <option value="amount">{t('sortByAmount')}</option>
                  <option value="category">{t('sortByCategory')}</option>
                  <option value="name">{t('sortByName')}</option>
                </select>
              </div>
            </section>
            {(formOpen.expenses || editing.expenses) && (
              <ExpenseForm
                t={t}
                initialItem={editing.expenses}
                onCancel={() => {
                  setEditing((current) => ({ ...current, expenses: null }))
                  setFormOpen((current) => ({ ...current, expenses: false }))
                }}
                onSubmit={(payload) => saveRow('kb_expenses', payload, editing.expenses)}
              />
            )}
            <ExpenseLists
              currency={currency}
              expenses={filteredExpenses}
              language={language}
              locale={locale}
              settings={settings}
              journalEntries={journalEntries}
              t={t}
              onDelete={(item) => deleteRow('kb_expenses', item)}
              onEdit={(item) => {
                setEditing({ incomes: null, expenses: item, debts: null })
                setFormOpen((current) => ({ ...current, expenses: true }))
              }}
              onPaymentStatus={setExpensePaymentStatus}
            />
          </>
        )}
        {view === 'debts' && (
          <>
            <section className="section">
              <div className="section-title">
                <h2>{t('debts')}</h2>
                <button type="button" onClick={() => setFormOpen((current) => ({ ...current, debts: true }))}>{t('addDebt')}</button>
              </div>
              <select value={debtSort} onChange={(event) => setDebtSort(event.target.value)}>
                <option value="priority">{t('priority')}</option>
                <option value="balance">{t('remainingBalance')}</option>
                <option value="interest">{t('interestRate')}</option>
                <option value="payment">{t('monthlyPayment')}</option>
                <option value="end">{t('estimatedEndDate')}</option>
              </select>
            </section>
            {(formOpen.debts || editing.debts) && (
              <DebtForm
                t={t}
                initialItem={editing.debts}
                onCancel={() => {
                  setEditing((current) => ({ ...current, debts: null }))
                  setFormOpen((current) => ({ ...current, debts: false }))
                }}
                onSubmit={(payload) => saveRow('kb_debts', payload, editing.debts)}
              />
            )}
            <EntityList
              title={t('debts')}
              items={sortedDebts}
              currency={currency}
              language={language}
              emptyText={t('noData')}
              editText={t('edit')}
              deleteText={t('delete')}
              renderMeta={(item) => {
                const category = debtCategories.find(([value]) => value === item.debt_category)?.[1] ?? item.debt_category ?? '-'
                const paidPercent = toNumber(item.initial_amount) > 0 ? Math.round(((toNumber(item.initial_amount) - toNumber(item.remaining_balance)) / toNumber(item.initial_amount)) * 100) : 0
                const finalPaymentText = toNumber(item.final_payment) > 0 ? ` - ${t('finalPayment')}: ${formatMoney(item.final_payment, currency, locale)} - ${t('totalToPay')}: ${formatMoney(debtRemainingTotal(item), currency, locale)}` : ''
                return `${category} - ${t(item.status)} - ${item.interest_rate || 0}% - ${t('monthlyPayment')}: ${item.monthly_payment || 0}${finalPaymentText} - ${Math.max(0, paidPercent)}%`
              }}
              onEdit={(item) => {
                setEditing({ incomes: null, expenses: null, debts: item })
                setFormOpen((current) => ({ ...current, debts: true }))
              }}
              onDelete={(item) => deleteRow('kb_debts', item)}
              renderActions={(item) => toNumber(item.monthly_payment) <= 0 ? <span className="badge danger">{t('noMonthlyPayment')}</span> : null}
            />
          </>
        )}
        {view === 'plan' && (
          <DebtPlan t={t} language={language} currency={currency} debts={debts} settings={settings} onSettingsChange={updateSettings} />
        )}
        {view === 'calendar' && (
          <PaymentCalendar t={t} language={language} currency={currency} expenses={expenses} settings={settings} paymentStatuses={paymentStatuses} onPaymentStatus={setExpensePaymentStatus} onEdit={(item) => {
            setView('expenses')
            setEditing({ incomes: null, expenses: item, debts: null })
            setFormOpen((current) => ({ ...current, expenses: true }))
          }} />
        )}
        {view === 'insights' && <Insights t={t} insights={insights} />}
        {view === 'aiActions' && (
          <AIActionPanel
            t={t}
            language={language}
            currency={currency}
            summary={summary}
            incomes={incomes}
            expenses={expenses}
            debts={debts}
            settings={settings}
            paymentStatuses={paymentStatuses}
            journalEntries={journalEntries}
          />
        )}
        {view === 'kids' && <FamilyTokenEconomy user={user} />}
      </main>
    </div>
  )
}

function ExpenseLists({ currency, expenses, journalEntries = [], language, locale, settings, t, onDelete, onEdit, onPaymentStatus }) {
  const fixed = expenses.filter((item) => expenseKind(item) === 'fixed_payment')
  const variable = expenses.filter((item) => expenseKind(item) === 'variable_budget')
  const once = expenses.filter((item) => expenseKind(item) === 'one_time_expense')

  return (
    <>
      <EntityList
        title={t('fixedPayments')}
        items={fixed}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => `${item.category} - ${t(item.frequency)}${item.due_date ? ` - ${t('payment')}: ${item.due_date}` : ''} - ${t(item.payment_mode || 'automatic_debit')}${toNumber(item.amount) >= toNumber(settings.large_payment_threshold) ? ` - ${t('largePayment')}` : ''}`}
        onEdit={onEdit}
        onDelete={onDelete}
        renderActions={(item) => (item.payment_mode === 'manual_payment'
          ? <button type="button" className="ghost" onClick={() => onPaymentStatus(item, 'paid')}>{t('markPaid')}</button>
          : null)}
      />
      <EntityList
        title={t('variableBudgets')}
        items={variable}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => {
          const stats = variableBudgetStats(item, new Date(), journalEntries)
          return `${item.category} - ${t('monthlyBudget')}: ${formatMoney(stats.budget, currency, locale)} - ${t('spentThisMonth')}: ${formatMoney(stats.spent, currency, locale)} - ${t('remainingBudget')}: ${formatMoney(stats.remaining, currency, locale)} - ${t('dailyBudget')}: ${formatMoney(stats.dailyRemaining, currency, locale)}/${t('day')}`
        }}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <EntityList
        title={t('oneTimeExpenses')}
        items={once}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => `${item.category}${item.due_date ? ` - ${item.due_date}` : ''}${toNumber(item.amount) >= toNumber(settings.large_payment_threshold) ? ` - ${t('largePayment')}` : ''}`}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </>
  )
}

function DailyJournal({ currency, dailyBudget, dailyClosures, editing, entries, formOpen, language, locale, schemaReady, t, onCancel, onCloseDay, onDelete, onEdit, onRepeat, onSubmit, onToggleForm }) {
  const today = isoDate(new Date())
  const todayEntries = entries.filter((item) => item.entry_date === today)
  const todayTotal = todayEntries.reduce((sum, item) => sum + toNumber(item.amount), 0)
  const closedToday = dailyClosures.find((item) => item.closure_date === today)
  const recentEntries = entries.slice(0, 30)
  const priceRows = buildPriceRows(entries, currency, locale, t)
  const remainingToday = toNumber(dailyBudget) - todayTotal
  const topCategory = topJournalCategory(todayEntries)

  return (
    <>
      <section className="section">
        <div className="section-title">
          <h2>{t('dailyJournal')}</h2>
          <button type="button" onClick={onToggleForm}>{formOpen ? t('hideForm') : t('addJournalEntry')}</button>
        </div>
        {!schemaReady && <div className="notice danger">{t('journalMigrationMissing')}</div>}
        <div className="mini-stats">
          <span>{t('todayTotal')}: <strong>{formatMoney(todayTotal, currency, locale)}</strong></span>
          <span>{t('entriesToday')}: <strong>{todayEntries.length}</strong></span>
          <span>{t('dayStatus')}: <strong>{closedToday ? t('dayClosedShort') : t('dayOpen')}</strong></span>
          <span>{t('recommendedBudgetToday')}: <strong>{formatMoney(dailyBudget, currency, locale)}</strong></span>
          <span>{t('remainingToday')}: <strong>{formatMoney(remainingToday, currency, locale)}</strong></span>
        </div>
        <div className={`notice ${remainingToday < 0 ? 'danger' : ''}`}>
          {remainingToday < 0
            ? t('dailyBudgetExceeded').replace('{amount}', formatMoney(Math.abs(remainingToday), currency, locale))
            : t('dailyBudgetLeft').replace('{amount}', formatMoney(remainingToday, currency, locale))}
        </div>
        {closedToday && (
          <div className="notice">
            <strong>{t('dayClosedSummary')}</strong>
            <span>{t('todayTotal')}: {formatMoney(todayTotal, currency, locale)}</span>
            <span>{t('entriesToday')}: {todayEntries.length}</span>
            <span>{t('mainCategory')}: {topCategory || '-'}</span>
            <span>{remainingToday >= 0
              ? t('underBudgetBy').replace('{amount}', formatMoney(remainingToday, currency, locale))
              : t('overBudgetBy').replace('{amount}', formatMoney(Math.abs(remainingToday), currency, locale))}</span>
          </div>
        )}
        <div className="form-actions">
          <button type="button" onClick={() => onCloseDay(today)}>{closedToday ? t('reopenDay') : t('closeDay')}</button>
        </div>
      </section>

      {formOpen && !closedToday && (
        <JournalEntryForm
          t={t}
          initialItem={editing}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}
      {formOpen && closedToday && <div className="notice danger">{t('journalDayClosedBlocked')}</div>}

      <EntityList
        title={t('todayEntries')}
        items={todayEntries}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => `${item.category} - ${item.store || t('noStore')} - ${t(item.person)}${item.product_name ? ` - ${t('productName')}: ${item.product_name}` : ''}`}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      <EntityList
        title={t('recentJournalEntries')}
        items={recentEntries}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => `${item.entry_date} - ${item.category} - ${item.store || t('noStore')}`}
        onEdit={onEdit}
        onDelete={onDelete}
        renderActions={(item) => <button type="button" className="ghost" onClick={() => onRepeat(item)}>{t('repeat')}</button>}
      />

      <section className="section">
        <h2>{t('priceHistory')}</h2>
        <div className="list">
          {priceRows.length === 0 ? <div className="empty">{t('noData')}</div> : priceRows.map((row) => (
            <article className="list-item" key={row.product}>
              <div>
                <strong>{row.product}</strong>
                <span>{row.summary}</span>
                <span>{row.unitComparison ? t('unitComparison') : t('totalPriceComparison')}</span>
              </div>
              <div className="list-value">
                <b>{row.change >= 0 ? '+' : ''}{row.change.toFixed(1)}%</b>
                <span>{row.bestStore || t('noStore')}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

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
  onImportOffer
}) {
  const activeOffers = offers.filter((offer) => !offer.valid_until || offer.valid_until >= isoDate(new Date()))
  const bestPrices = bestShoppingMatches(shoppingList, activeOffers, journalEntries)
  const storeRecommendations = buildStoreRecommendations(bestPrices, stores)
  const priceHistory = buildShoppingHistory(journalEntries)

  const searchableOffers = useMemo(() => {
    const combined = [...offerPreview, ...activeOffers]
    const seen = new Map()
    combined.forEach((item) => {
      const key = offerPreviewKey(item)
      if (!seen.has(key)) seen.set(key, item)
    })
    return [...seen.values()]
  }, [offerPreview, activeOffers])

  return (
    <>
      <section className="section">
        <div className="section-title">
          <div>
            <h2>{t('shopping')}</h2>
            <p className="muted">{t('shoppingHint')}</p>
          </div>
        </div>
        {!schemaReady && <div className="notice danger">{t('shoppingMigrationMissing')}</div>}
        <div className="tabbar inline-tabs">
          {['list', 'kaufda', 'receipts', 'import', 'offers', 'best', 'stores', 'history', 'sources', 'search'].map((item) => (
            <button type="button" key={item} className={tab === item ? 'active' : ''} onClick={() => onTabChange(item)}>{t(`shopping_${item}`)}</button>
          ))}
        </div>
      </section>

      {tab === 'list' && <ShoppingListTab currency={currency} language={language} items={shoppingList} t={t} getRecommendations={getProductRecommendations} getRoute={calculateOptimalRoute} notifications={priceNotifications} user={user} onDelete={(item) => onDelete('kb_shopping_list', item)} onSave={onSaveItem} />}
      {tab === 'kaufda' && <KaufdaFeedTab shoppingList={shoppingList} t={t} onImportOffer={onImportOffer} />}
      {tab === 'receipts' && <ReceiptsTab currency={currency} locale={locale} receiptItems={receiptItems} receipts={receipts} onSaveReceipt={onSaveReceipt} />}
      {tab === 'import' && <OfferImportTab preview={offerPreview} t={t} onPreviewChange={onPreviewChange} onSaveSource={onSaveStore} onConfirmPreview={onConfirmPreview} onTabChange={onTabChange} />}
      {tab === 'offers' && <OfferPreviewTab currency={currency} language={language} locale={locale} preview={offerPreview} savedOffers={offers} t={t} onConfirmPreview={onConfirmPreview} onDeleteOffer={(item) => onDelete('kb_weekly_offers', item)} onPreviewChange={onPreviewChange} />}
      {tab === 'best' && <BestPricesTab bestPrices={bestPrices} offers={activeOffers} currency={currency} locale={locale} t={t} />}
      {tab === 'stores' && <StoreRecommendationsTab currency={currency} locale={locale} recommendations={storeRecommendations} stores={stores} t={t} onSaveStore={onSaveStore} />}
      {tab === 'history' && <ShoppingHistoryTab currency={currency} history={priceHistory} locale={locale} analytics={getPriceAnalytics()} t={t} />}
      {tab === 'sources' && <OfferSourcesTab sources={sources} t={t} onDelete={(item) => onDelete('kb_offer_sources', item)} onSave={onSaveStore} />}
      {tab === 'search' && <SearchOffersTab offers={searchableOffers} currency={currency} locale={locale} t={t} />}
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

function SearchOffersTab({ offers, currency, locale, t }) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const results = trimmed
    ? offers
      .map((offer) => ({ offer, ...productMatch(query, offer.product_name) }))
      .filter((item) => item.match)
      .sort((a, b) => {
        const diff = offerCompareValue(a.offer) - offerCompareValue(b.offer)
        if (diff !== 0) return diff
        return toNumber(b.offer.confidence) - toNumber(a.offer.confidence)
      })
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

function BestPricesTab({ bestPrices, offers, currency, locale, t }) {
  const [query, setQuery] = useState('')

  const searchResults = query.trim()
    ? offers
      .map((offer) => ({ offer, ...productMatch(query, offer.product_name) }))
      .filter((item) => item.match)
      .sort((a, b) => offerCompareValue(a.offer) - offerCompareValue(b.offer))
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
            <div className="notice">{t('noSearchResults')}</div>
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

function WorkAbsence({ absences, currency, editing, formOpen, language, locale, schemaReady, t, onCancel, onDelete, onEdit, onExport, onStart, onStop, onSubmit, onToggleForm }) {
  const [, setTick] = useState(0)
  const active = absences.find((item) => item.is_active)
  const monthlyStats = workAbsenceStats(absences, 'month')
  const yearlyStats = workAbsenceStats(absences, 'year')
  const recentAbsences = absences.slice(0, 30).map((item) => ({
    ...item,
    name: item.work_date,
    amount: item.estimated_allowance,
  }))

  useEffect(() => {
    if (!active) return undefined
    const timer = window.setInterval(() => setTick((current) => current + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [active])

  return (
    <>
      <section className="section">
        <div className="section-title">
          <div>
            <h2>{t('workAbsence')}</h2>
            <p className="muted">{t('workAbsenceSubtitle')}</p>
          </div>
          <button type="button" onClick={onToggleForm}>{formOpen ? t('hideForm') : t('workAbsenceManualAdd')}</button>
        </div>
        {!schemaReady && <div className="notice danger">{t('workAbsenceMigrationMissing')}</div>}
        <div className="work-start-card">
          {active ? (
            <>
              <div>
                <strong>{t('workAbsenceActive')}</strong>
                <span>{active.work_date} · {active.start_time?.slice(0, 5)} · {formatDuration(minutesSinceStart(active.start_time))}</span>
              </div>
              <button type="button" className="danger-ghost" onClick={() => onStop(active)}>{t('stopWorkAbsence')}</button>
            </>
          ) : (
            <>
              <div>
                <strong>{t('noActiveWorkAbsence')}</strong>
                <span>{t('workAbsenceNoGps')}</span>
              </div>
              <button type="button" disabled={!schemaReady} onClick={onStart}>{t('startWorkAbsence')}</button>
            </>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>{t('workAbsenceReport')}</h2>
          <div className="button-pair">
            <button type="button" className="secondary" onClick={() => onExport('month')}>{t('exportCsvMonth')}</button>
            <button type="button" className="secondary" onClick={() => onExport('year')}>{t('exportCsvYear')}</button>
          </div>
        </div>
        <div className="metric-grid compact">
          <Metric t={t} label="workDaysRegisteredMonth" value={monthlyStats.registeredDays} />
          <Metric t={t} label="workDaysOver8Month" value={monthlyStats.eligibleDays} />
          <Metric t={t} label="workAllowanceMonth" value={formatMoney(monthlyStats.allowance, currency, locale)} />
          <Metric t={t} label="workHoursMonth" value={formatDuration(monthlyStats.durationMinutes)} />
          <Metric t={t} label="workDaysOver8Year" value={yearlyStats.eligibleDays} />
          <Metric t={t} label="workAllowanceYear" value={formatMoney(yearlyStats.allowance, currency, locale)} />
        </div>
        <div className="notice">{language === 'de' ? t('workTaxDisclaimerDe') : t('workTaxDisclaimer')}</div>
      </section>

      {formOpen && (
        <WorkAbsenceForm
          t={t}
          initialItem={editing}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}

      <EntityList
        title={t('workAbsenceRecent')}
        items={recentAbsences}
        currency={currency}
        language={language}
        emptyText={t('noData')}
        editText={t('edit')}
        deleteText={t('delete')}
        renderMeta={(item) => [
          item.object_name || item.location || '-',
          `${item.start_time?.slice(0, 5)} - ${item.end_time ? item.end_time.slice(0, 5) : t('active')}`,
          formatDuration(toNumber(item.duration_minutes)),
          item.eligible_over_8h ? t('estimatedAllowance14') : t('under8h'),
          item.confirmed ? t('confirmed') : t('notConfirmed'),
        ].filter(Boolean).join(' - ')}
        onEdit={onEdit}
        onDelete={onDelete}
        renderActions={(item) => (
          <div className="badge-row">
            <span className={`badge ${item.eligible_over_8h ? '' : 'danger'}`}>{item.eligible_over_8h ? t('over8h') : t('under8h')}</span>
            <span className="badge">{t(item.entry_source || 'manual')}</span>
          </div>
        )}
      />
    </>
  )
}

function Metric({ t, label, value }) {
  return (
    <article className="metric-card neutral">
      <span>{t(label)}</span>
      <strong>{value}</strong>
    </article>
  )
}

function AccountLists({ accounts, currency, language, locale, t, onDelete, onEdit, onQuickBalance }) {
  return (
    <EntityList
      title={t('accounts')}
      items={accounts}
      currency={currency}
      language={language}
      emptyText={t('noData')}
      editText={t('edit')}
      deleteText={t('delete')}
      renderMeta={(item) => {
        const balance = toNumber(item.current_balance)
        const overdraftUsed = Math.max(0, -balance)
        const negativeLabel = item.account_type === 'credit_card' ? 'cardCreditUsed' : 'inOverdraft'
        const overdraftAvailable = Math.max(0, toNumber(item.overdraft_limit) - overdraftUsed)
        return [
          t(item.account_type),
          balance < 0 ? `${t(negativeLabel)}: ${formatMoney(overdraftUsed, item.currency || currency, locale)}` : t('positiveBalance'),
          item.has_overdraft ? `${t('overdraftAvailable')}: ${formatMoney(overdraftAvailable, item.currency || currency, locale)}` : '',
          item.include_in_safe_balance === false ? t('excludedFromSafeBalance') : '',
          item.updated_at ? `${t('updatedAt')}: ${new Date(item.updated_at).toLocaleDateString(locale)}` : '',
        ].filter(Boolean).join(' - ')
      }}
      onEdit={onEdit}
      onDelete={onDelete}
      renderActions={(item) => (
        <>
          <button type="button" className="ghost" onClick={() => onQuickBalance(item)}>{t('quickBalanceUpdate')}</button>
          {toNumber(item.current_balance) < 0 && <span className="badge danger">{t(item.account_type === 'credit_card' ? 'cardCreditUsed' : 'inOverdraft')}</span>}
          {item.include_in_safe_balance === false && <span className="badge">{t('excludedFromSafeBalance')}</span>}
        </>
      )}
    />
  )
}

function preparePayload(payload) {
  const numberFields = ['amount', 'initial_amount', 'remaining_balance', 'final_payment', 'monthly_payment', 'interest_rate', 'current_balance', 'overdraft_limit', 'overdraft_interest', 'quantity', 'unit_price', 'desired_quantity', 'price', 'old_price', 'discount_percent', 'distance_km', 'fuel_cost_estimate']
  const dateFields = ['occurrence_date', 'due_date', 'estimated_end_date', 'entry_date', 'valid_from', 'valid_until']
  const result = { ...payload }

  if ('priority' in result) {
    const validPriorities = ['normal', 'important', 'offer_only']
    if (!result.priority || result.priority === '' || result.priority === null || !validPriorities.includes(result.priority)) {
      result.priority = 'normal'
    }
  } else if (payload.product_name !== undefined) {
    result.priority = 'normal'
  }

  numberFields.forEach((field) => {
    if (field in result) result[field] = result[field] === '' ? 0 : Number(result[field])
  })
  if ('unit_price' in payload && (payload.unit_price === '' || payload.unit_price === null || payload.unit_price === undefined)) {
    result.unit_price = null
  }
  dateFields.forEach((field) => {
    if (field in result && !result[field]) result[field] = null
  })

  if ('expense_kind' in result) {
    if (result.expense_kind === 'variable_budget') {
      result.frequency = 'monthly'
      result.expense_type = 'variable'
      result.payment_mode = 'variable_tracking'
      result.due_date = null
    }
    if (result.expense_kind === 'one_time_expense') {
      result.frequency = 'once'
      result.expense_type = 'variable'
      result.payment_mode = 'manual_payment'
    }
    if (result.expense_kind === 'fixed_payment') {
      result.expense_type = 'fixed'
      if (result.payment_mode === 'variable_tracking') result.payment_mode = 'automatic_debit'
    }
  }

  return result
}

function inferProductName(description = '') {
  return String(description)
    .replace(/\d+([.,]\d+)?\s*(eur|euro|€)/gi, '')
    .trim()
}

function buildPriceRows(entries, currency = 'EUR', locale = 'ro-RO', t = (key) => key) {
  const byProduct = new Map()
  entries
    .filter((item) => item.product_name && toNumber(item.amount) > 0)
    .forEach((item) => {
      const key = item.product_name.trim().toLowerCase()
      if (!byProduct.has(key)) byProduct.set(key, [])
      byProduct.get(key).push(item)
    })

  return [...byProduct.entries()].map(([product, rows]) => {
    const sorted = [...rows].sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)))
    const enriched = sorted.map((item) => ({ ...item, unitInfo: normalizedUnitPrice(item) }))
    const comparable = enriched.filter((item) => item.unitInfo)
    const sourceRows = comparable.length >= 2 ? comparable : enriched
    const valueOf = (item) => item.unitInfo?.price ?? toNumber(item.amount)
    const minRow = sourceRows.reduce((min, item) => valueOf(item) < valueOf(min) ? item : min, sourceRows[0])
    const maxRow = sourceRows.reduce((max, item) => valueOf(item) > valueOf(max) ? item : max, sourceRows[0])
    const first = valueOf(sourceRows[0])
    const lastRow = sourceRows[sourceRows.length - 1]
    const last = valueOf(lastRow)
    const unitComparison = comparable.length >= 2
    const unitLabel = lastRow.unitInfo?.unit
    return {
      product,
      min: valueOf(minRow),
      max: valueOf(maxRow),
      last,
      change: first > 0 ? ((last - first) / first) * 100 : 0,
      bestStore: lastRow.store || minRow.store,
      unitComparison,
      summary: unitComparison
        ? `${tMoney(t('lastObservedPrice'), last, currency, locale)}/${unitLabel} - ${tMoney(t('lowestObservedPrice'), valueOf(minRow), currency, locale)}/${unitLabel} - ${tMoney(t('highestObservedPrice'), valueOf(maxRow), currency, locale)}/${unitLabel}`
        : `${tMoney(t('lastObservedPrice'), last, currency, locale)} - ${tMoney(t('lowestObservedPrice'), valueOf(minRow), currency, locale)} - ${tMoney(t('highestObservedPrice'), valueOf(maxRow), currency, locale)}`,
    }
  }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 10)
}

function normalizedUnitPrice(item) {
  const amount = toNumber(item.amount)
  const quantity = toNumber(item.quantity)
  const unit = String(item.unit || '').trim().toLowerCase()
  if (!item.product_name || !amount || !quantity || !unit) return null
  if (unit === 'g') return { price: amount / (quantity / 1000), unit: 'kg' }
  if (unit === 'ml') return { price: amount / (quantity / 1000), unit: 'L' }
  return { price: toNumber(item.unit_price) || amount / quantity, unit }
}

function tMoney(label, value, currency, locale) {
  return `${label}: ${formatMoney(value, currency, locale)}`
}

function topJournalCategory(entries) {
  const totals = new Map()
  entries.forEach((item) => {
    totals.set(item.category, (totals.get(item.category) || 0) + toNumber(item.amount))
  })
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

function hasPossibleOverdraftDuplicate(accounts, debts) {
  const hasNegativeAccount = accounts.some((account) => toNumber(account.current_balance) < 0)
  const hasDispoDebt = debts.some((debt) => debt.status === 'active' && /dispo|overdraft/i.test(`${debt.name} ${debt.debt_category}`))
  return hasNegativeAccount && hasDispoDebt
}

function cleanAccountPayload(payload) {
  return {
    name: payload.name,
    account_type: payload.account_type,
    current_balance: payload.current_balance,
    currency: payload.currency,
    include_in_safe_balance: payload.include_in_safe_balance,
    has_overdraft: payload.has_overdraft,
    overdraft_limit: payload.overdraft_limit,
    overdraft_interest: payload.overdraft_interest,
    notes: payload.notes,
  }
}

function normalizeWorkAbsencePayload(payload) {
  const duration = payload.end_time ? calculateWorkDuration(payload.start_time, payload.end_time, payload.break_minutes) : null
  const eligible = duration !== null && duration > 8 * 60
  return {
    work_date: payload.work_date || isoDate(new Date()),
    start_time: payload.start_time,
    end_time: payload.end_time || null,
    duration_minutes: duration,
    location: payload.location || null,
    object_name: payload.object_name || null,
    work_reason: payload.work_reason || null,
    kilometers: payload.kilometers === '' || payload.kilometers === null || payload.kilometers === undefined ? null : Number(payload.kilometers),
    break_minutes: Number(payload.break_minutes || 0),
    entry_source: payload.entry_source || 'manual',
    is_active: Boolean(payload.is_active && !payload.end_time),
    eligible_over_8h: eligible,
    estimated_allowance: eligible ? 14 : 0,
    notes: payload.notes || null,
    confirmed: Boolean(payload.confirmed),
  }
}

function calculateWorkDuration(startTime, endTime, breakMinutes = 0) {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  if (start === null || end === null) return null
  const raw = end >= start ? end - start : end + 24 * 60 - start
  return Math.max(0, raw - Number(breakMinutes || 0))
}

function timeToMinutes(value) {
  if (!value) return null
  const [hours, minutes] = String(value).split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

function timeValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function minutesSinceStart(startTime) {
  const start = timeToMinutes(startTime)
  const now = timeToMinutes(timeValue(new Date()))
  if (start === null || now === null) return 0
  return now >= start ? now - start : now + 24 * 60 - start
}

function formatDuration(minutes = 0) {
  const clean = Math.max(0, Math.round(toNumber(minutes)))
  const hours = Math.floor(clean / 60)
  const rest = clean % 60
  return `${hours}h ${String(rest).padStart(2, '0')}m`
}

function workAbsenceStats(absences, scope) {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const year = String(now.getFullYear())
  const rows = absences.filter((item) => {
    if (scope === 'month') return String(item.work_date || '').startsWith(month)
    return String(item.work_date || '').startsWith(year)
  })
  const eligibleRows = rows.filter((item) => item.eligible_over_8h)
  return {
    registeredDays: rows.length,
    eligibleDays: eligibleRows.length,
    allowance: eligibleRows.reduce((sum, item) => sum + toNumber(item.estimated_allowance), 0),
    durationMinutes: rows.reduce((sum, item) => sum + toNumber(item.duration_minutes), 0),
    rows,
  }
}

function exportWorkAbsenceCsv(absences, scope, t) {
  const stats = workAbsenceStats(absences, scope)
  const rows = [
    ['Datum', 'Abfahrt Wohnung', 'Rueckkehr Wohnung', 'Abwesenheitsdauer', 'Einsatzort / Objekt', 'Anlass', 'Kilometer', '> 8 Stunden', 'Verpflegungspauschale geschaetzt', 'Erfassung', 'Bemerkung'],
    ...stats.rows.map((item) => [
      item.work_date,
      item.start_time?.slice(0, 5) || '',
      item.end_time?.slice(0, 5) || '',
      formatDuration(item.duration_minutes),
      [item.object_name, item.location].filter(Boolean).join(' / '),
      item.work_reason || '',
      item.kilometers ?? '',
      item.eligible_over_8h ? 'Ja' : 'Nein',
      toNumber(item.estimated_allowance).toFixed(2),
      item.entry_source === 'automatic' ? 'automatisch' : 'manuell',
      item.notes || '',
    ]),
    [],
    ['Summe Tage > 8h', stats.eligibleDays],
    ['Summe geschaetzte Pauschale', stats.allowance.toFixed(2)],
    [],
    [t('workTaxDisclaimerDe')],
  ]
  const csv = rows.map((row) => row.map(csvCell).join(';')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `klarbudget-arbeitsweg-${scope}-${isoDate(new Date())}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

const offerSearchSynonyms = {
  lapte: ['milch', 'h-milch', 'frische milch', 'h milch'],
  cafea: ['kaffee', 'kaffeebohnen', 'instantkaffee'],
  unt: ['butter', 'weidebutter', 'weide butter'],
  carne: ['fleisch', 'hackfleisch', 'hähnchen', 'hahnchen', 'pute', 'schwein'],
  detergent: ['waschmittel', 'spülmittel', 'reiniger'],
}

function normalizeSearchTerm(value = '') {
  return normalizeProduct(value)
}

function findProductSynonym(value = '') {
  const normalized = normalizeSearchTerm(value)
  return Object.entries(offerSearchSynonyms).find(([key, variants]) =>
    normalizeSearchTerm(key).includes(normalized) || normalized.includes(normalizeSearchTerm(key)) ||
    variants.some((term) => normalizeSearchTerm(term).includes(normalized) || normalized.includes(normalizeSearchTerm(term)))
  )?.[0] || ''
}

function productMatch(needle = '', haystack = '') {
  const a = findProductSynonym(needle) || normalizeSearchTerm(needle)
  const b = findProductSynonym(haystack) || normalizeSearchTerm(haystack)
  if (!a || !b) return { match: false, approx: false }
  if (a === b || b.includes(a) || a.includes(b)) return { match: true, approx: false }
  const tokensA = a.split(' ').filter((token) => token.length > 2)
  const tokensB = b.split(' ')
  const common = tokensA.filter((token) => tokensB.includes(token)).length
  return { match: common > 0, approx: common > 0 }
}

function parseOfferText(text, meta = {}) {
  const detectedStore = meta.store_name || detectStore(text)
  const validity = detectValidity(text)
  return splitOfferLines(normalizePdfText(text))
    .map((line, index) => parseOfferLine(line, {
      store_name: detectedStore,
      valid_from: meta.valid_from || validity.valid_from,
      valid_until: meta.valid_until || validity.valid_until,
      source: meta.source || 'manual_text',
      source_page: meta.source_page || 1,
      source_file_name: meta.source_file_name || '',
      index,
    }))
    .filter(Boolean)
}

function parseReceiptText(text = '') {
  return normalizePdfText(text)
    .split(/\r?\n/)
    .map((line) => parseReceiptLine(line.trim()))
    .filter(Boolean)
}

function parseReceiptLine(line = '') {
  if (!line || /summe|total|gesamt|bar|karte|mwst|ust|datum|beleg|bon/i.test(line)) return null
  const priceMatch = line.match(/(\d+(?:[,.]\d{1,2})?)\s*(?:eur|€)?\s*$/i)
  if (!priceMatch) return null
  const totalPrice = Number(String(priceMatch[1]).replace(',', '.'))
  if (!totalPrice || Number.isNaN(totalPrice)) return null
  const beforePrice = line.slice(0, priceMatch.index).trim()
  if (!beforePrice || beforePrice.length < 2) return null
  const quantityMatch = beforePrice.match(/(\d+(?:[,.]\d+)?)\s*(kg|g|l|liter|ml|stk|stück|buc|x)\s*$/i)
  const quantity = quantityMatch ? Number(String(quantityMatch[1]).replace(',', '.')) : null
  const unit = quantityMatch ? normalizeUnit(quantityMatch[2]) : null
  const productName = (quantityMatch ? beforePrice.slice(0, quantityMatch.index) : beforePrice)
    .replace(/^\d+\s*x\s*/i, '')
    .trim()
  const unitInfo = quantity && unit ? offerUnitPrice(totalPrice, quantity, unit) : null
  return {
    product_name: productName,
    category: inferOfferCategory(productName),
    quantity,
    unit,
    unit_price: unitInfo?.price ?? null,
    total_price: totalPrice,
  }
}

function splitOfferLines(text = '') {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.reduce((result, line) => {
    if (!result.length) return [line]
    const previous = result[result.length - 1]
    if (/^[\d.,\s€eEur\-–]+$/i.test(line) || /^[\d.,]+$/i.test(line)) {
      result[result.length - 1] = `${previous} ${line}`
    } else if (/^(kg|g|l|liter|ml|buc|stk|stück|role|rollen|pachet|pack|sticlă|sticla|fl|cutie)/i.test(line)) {
      result[result.length - 1] = `${previous} ${line}`
    } else if (/\d$/.test(previous) && /^[\d.,]/.test(line)) {
      result[result.length - 1] = `${previous} ${line}`
    } else {
      result.push(line)
    }
    return result
  }, [])
}

async function extractTextFromPdf(file) {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const pages = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      let lines = []
      let lastY = null
      content.items.forEach((item) => {
        const text = String(item.str || '')
        const y = item.transform?.[5] ? Math.round(item.transform[5]) : null
        if (lastY === null || y === null || Math.abs(y - lastY) > 5) {
          lines.push(text)
          lastY = y
        } else {
          lines[lines.length - 1] += ` ${text}`
        }
      })
      const pageText = normalizePdfText(lines.join('\n'))
      pages.push({ pageNumber, text: pageText })
    }

    const text = pages.map((page) => page.text).join('\n\n')
    const success = Boolean(text && text.length >= 500)
    const warning = success ? undefined : 'pdfTextInsufficient'
    return { success, pageCount: pdf.numPages, text, pages, warning }
  } catch {
    return {
      success: false,
      pageCount: 0,
      text: '',
      pages: [],
      warning: 'pdfExtractionFailed',
    }
  }
}

function normalizePdfText(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\n(?=\s*[0-9]+[.,]?\d*\s*(€|eur)?)/gi, ' ')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function offerPreviewKey(item) {
  return `${normalizeProduct(item.store_name)}||${normalizeProduct(item.product_name)}||${toNumber(item.price)}||${item.valid_from || ''}||${item.valid_until || ''}`
}

function mergePreviewRows(existing = [], incoming = []) {
  const seen = new Map()
  ;[...existing, ...incoming].forEach((item) => {
    const key = offerPreviewKey(item)
    if (!seen.has(key)) seen.set(key, item)
  })
  return [...seen.values()]
}

function parseOfferLine(line, meta) {
  if (storeNames.some((store) => line.toLowerCase() === store.toLowerCase())) return null
  if (/\b(valid|gültig|valabil|gültig vom|von|vom|bis|pana|până)\b/i.test(line)) return null
  const priceMatch = line.match(/(\d+(?:[.,]\d{1,2})?)(?:\s*[-.–])?\s*(€|eur)?$/i) || line.match(/(\d+)\s*[., ]\s*(\d{2})\s*(€|eur)?/i)
  if (!priceMatch) return null

  let rawPrice = String(priceMatch[1]).replace(',', '.')
  if (/^\d+\.$/.test(rawPrice)) rawPrice = `${rawPrice}00`
  if (/^\d+\.\d$/.test(rawPrice)) rawPrice = `${rawPrice}0`
  const price = Number(rawPrice)
  if (Number.isNaN(price)) return null

  const beforePrice = line.slice(0, priceMatch.index).trim()
  const quantityMatch = beforePrice.match(/(\d+(?:[,.]\d+)?)\s*(kg|g|l|liter|ml|buc|stk|stück|role|rollen|pachet|pack|sticlă|sticla|fl|cutie)$/i)
  const quantity = quantityMatch ? Number(quantityMatch[1].replace(',', '.')) : null
  const unit = quantityMatch ? normalizeUnit(quantityMatch[2]) : ''

  let product = (quantityMatch ? beforePrice.slice(0, quantityMatch.index) : beforePrice).trim()
  if (!product) {
    product = line.replace(priceMatch[0], '').trim()
  }

  const unitInfo = quantity && unit ? offerUnitPrice(price, quantity, unit) : null
  const appPrice = /app|card|karte|plus/i.test(line)
  const confidence = product && price ? (quantity ? 0.86 : 0.72) : 0.45

  return {
    store_name: meta.store_name || '',
    product_name: product,
    brand: '',
    category: inferOfferCategory(product),
    price,
    old_price: null,
    discount_percent: null,
    quantity,
    unit,
    unit_price: unitInfo?.price ?? null,
    valid_from: meta.valid_from || null,
    valid_until: meta.valid_until || null,
    source: meta.source,
    source_file_name: meta.source_file_name,
    source_page: meta.source_page,
    app_price: appPrice,
    confidence,
    status: confidence >= 0.75 ? 'ok' : 'needs_review',
    notes: confidence >= 0.75 ? '' : 'Verifica manual',
  }
}

function normalizeOfferPayload(item) {
  return {
    store_name: item.store_name || 'Unbekannt',
    product_name: item.product_name,
    brand: item.brand || null,
    category: item.category || null,
    price: toNumber(item.price),
    old_price: item.old_price ? toNumber(item.old_price) : null,
    discount_percent: item.discount_percent ? toNumber(item.discount_percent) : null,
    quantity: item.quantity ? toNumber(item.quantity) : null,
    unit: item.unit || null,
    unit_price: item.unit_price ? toNumber(item.unit_price) : null,
    valid_from: item.valid_from || null,
    valid_until: item.valid_until || null,
    source: item.source || 'manual_text',
    source_file_name: item.source_file_name || null,
    source_page: item.source_page ? Number(item.source_page) : null,
    app_price: Boolean(item.app_price),
    confidence: toNumber(item.confidence) || 0.7,
    status: item.status || 'confirmed',
    notes: item.notes || null,
  }
}

function detectStore(text = '') {
  const lower = String(text).toLowerCase()
  return storeNames.find((store) => lower.includes(store.toLowerCase())) || ''
}

function detectValidity(text = '') {
  const normalized = String(text).replace(/\s+/g, ' ')
  const match = normalized.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*(?:-|–|bis|to|pana la|până la|pana)\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/i)
  if (!match) return {}

  const parseYear = (value) => {
    if (!value) return new Date().getFullYear()
    const year = Number(value)
    return year < 100 ? 2000 + year : year
  }

  const fromYear = parseYear(match[3])
  const untilYear = parseYear(match[6])
  const valid_from = `${fromYear}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`
  const valid_until = `${untilYear}-${String(match[5]).padStart(2, '0')}-${String(match[4]).padStart(2, '0')}`
  return { valid_from, valid_until }
}

function normalizeUnit(unit = '') {
  const clean = String(unit).toLowerCase()
  if (['l', 'liter'].includes(clean)) return 'L'
  if (clean === 'ml') return 'ml'
  if (clean === 'kg') return 'kg'
  if (clean === 'g') return 'g'
  if (/stk|stück/.test(clean)) return 'buc'
  if (/rollen/.test(clean)) return 'role'
  return unit
}

function normalizedUnitLabel(unit = '') {
  if (unit === 'g') return 'kg'
  if (unit === 'ml') return 'L'
  return unit || 'unit'
}

function offerUnitPrice(price, quantity, unit) {
  if (!price || !quantity || !unit) return null
  if (unit === 'g') return { price: price / (quantity / 1000), unit: 'kg' }
  if (unit === 'ml') return { price: price / (quantity / 1000), unit: 'L' }
  return { price: price / quantity, unit }
}

function inferOfferCategory(product = '') {
  const text = product.toLowerCase()
  if (/milch|lapte|kaffee|cafea|butter|unt|brot|paine|pâine|ou|eier|carne|fleisch|fruct|obst|legume|gemüse/.test(text)) return 'mâncare'
  if (/detergent|wasch|hartie|hârtie|papier|dm|rossmann/.test(text)) return 'casă / reparații'
  return 'altele'
}

function normalizeProduct(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function offerCompareValue(offer) {
  return toNumber(offer.unit_price) || toNumber(offer.price)
}

// === RESTORED FUNCTIONS ===

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

function OfferPreviewTab({ currency, language, locale, preview, savedOffers, t, onConfirmPreview, onDeleteOffer, onPreviewChange }) {
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
        renderMeta={(item) => `${item.quantity || ''}${item.unit || ''} - ${item.valid_until || '-'} - ${item.status}${item.app_price ? ` - ${t('appPrice')}` : ''}`}
        onEdit={() => {}}
        onDelete={onDeleteOffer}
      />
    </>
  )
}

function buildShoppingHistory(journalEntries = []) {
  const rows = journalEntries
    .filter((item) => item.product_name && toNumber(item.amount) > 0)
    .map((item) => {
      const unitInfo = normalizedUnitPrice(item)
      return {
        product: item.product_name,
        value: unitInfo?.price ?? toNumber(item.amount),
        unit: unitInfo?.unit,
        store: item.store,
        date: item.entry_date,
      }
    })
  const byProduct = new Map()
  rows.forEach((row) => {
    const key = normalizeProduct(row.product)
    if (!byProduct.has(key)) byProduct.set(key, [])
    byProduct.get(key).push(row)
  })
  return [...byProduct.entries()].map(([key, items]) => {
    const sorted = [...items].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    return {
      key,
      product: sorted[sorted.length - 1].product,
      unit: sorted[sorted.length - 1].unit,
      last: sorted[sorted.length - 1],
      min: sorted.reduce((min, item) => item.value < min.value ? item : min, sorted[0]),
      max: sorted.reduce((max, item) => item.value > max.value ? item : max, sorted[0]),
    }
  })
}

function bestShoppingMatches(shoppingList = [], offers = [], journalEntries = []) {
  const history = buildShoppingHistory(journalEntries)
  return shoppingList.map((item) => {
    const matches = offers
      .map((offer) => ({ offer, ...productMatch(item.product_name, offer.product_name) }))
      .filter((row) => row.match)
      .sort((a, b) => offerCompareValue(a.offer) - offerCompareValue(b.offer))
    const best = matches[0]?.offer || null
    const hist = history.find((row) => productMatch(item.product_name, row.product).match)
    const bestValue = best ? offerCompareValue(best) : 0
    const lastValue = hist?.last?.value || 0
    const minValue = hist?.min?.value || 0
    return {
      product_name: item.product_name,
      best,
      history: hist,
      saving: best && lastValue ? lastValue - bestValue : 0,
      isBestObserved: Boolean(best && minValue && bestValue < minValue),
      approx: Boolean(matches[0]?.approx),
    }
  })
}

function buildStoreRecommendations(bestPrices = [], stores = []) {
  const byStore = new Map()
  bestPrices.filter((item) => item.best).forEach((item) => {
    const store = item.best.store_name
    if (!byStore.has(store)) byStore.set(store, { store, matches: 0, bestCount: 0, saving: 0, total: 0 })
    const row = byStore.get(store)
    row.matches += 1
    row.bestCount += 1
    row.saving += Math.max(0, item.saving)
    row.total += toNumber(item.best.price)
  })
  return [...byStore.values()].map((row) => {
    const storeSettings = stores.find((store) => store.name === row.store)
    const travelCost = storeSettings?.distance_km && storeSettings?.fuel_cost_estimate
      ? toNumber(storeSettings.distance_km) * 2 * toNumber(storeSettings.fuel_cost_estimate)
      : null
    const netSaving = travelCost === null ? null : row.saving - travelCost
    const recommendation = netSaving !== null
      ? (netSaving >= 2 ? 'worthIt' : storeSettings?.on_regular_route ? 'routeOnly' : 'noExtraTrip')
      : row.saving >= 2 ? 'worthIt' : 'routeOnly'
    return { ...row, netSaving, recommendation }
  }).sort((a, b) => b.saving - a.saving)
}

export default App
