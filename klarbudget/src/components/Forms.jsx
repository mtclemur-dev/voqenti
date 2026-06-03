import { useEffect, useState } from 'react'
import { accountTypes, categories, debtCategories } from '../i18n'

const frequencyOptions = ['monthly', 'quarterly', 'semiannual', 'yearly', 'once']
const recurringFrequencyOptions = ['monthly', 'quarterly', 'semiannual', 'yearly']

const incomeDefaults = { name: '', amount: '', frequency: 'monthly', occurrence_date: '', active: true, notes: '' }
const expenseDefaults = { name: '', category: categories[0], amount: '', frequency: 'monthly', due_date: '', expense_type: 'fixed', expense_kind: 'fixed_payment', payment_mode: 'automatic_debit', active: true, notes: '' }
const debtDefaults = { name: '', debt_category: 'dispo', initial_amount: '', remaining_balance: '', final_payment: '', monthly_payment: '', interest_rate: '', estimated_end_date: '', priority: 3, status: 'active' }
const accountDefaults = { name: '', account_type: 'checking', current_balance: '0', currency: 'EUR', include_in_safe_balance: true, has_overdraft: false, overdraft_limit: '0', overdraft_interest: '', notes: '' }

export function IncomeForm({ t, initialItem, onSubmit, onCancel }) {
  return (
    <FormShell title={t('incomes')} defaults={incomeDefaults} initialItem={initialItem} submitLabel={initialItem ? t('save') : t('addIncome')} cancelLabel={t('cancel')} onSubmit={onSubmit} onCancel={onCancel}>
      {({ values, update }) => (
        <>
          <TextInput name="name" label={t('name')} value={values.name} onChange={update} required />
          <MoneyInput name="amount" label={t('amount')} value={values.amount} onChange={update} />
          <SelectInput name="frequency" label={t('frequency')} value={values.frequency} onChange={update} options={frequencyOptions.map((value) => [value, t(value)])} />
          <TextInput name="occurrence_date" label={t('occurrenceDate')} type="date" value={values.occurrence_date} onChange={update} />
          <CheckboxInput name="active" label={t('active')} checked={values.active} onChange={update} />
          <TextInput name="notes" label={t('notes')} value={values.notes} onChange={update} />
        </>
      )}
    </FormShell>
  )
}

export function ExpenseForm({ t, initialItem, onSubmit, onCancel }) {
  return (
    <FormShell title={t('expenses')} defaults={expenseDefaults} initialItem={initialItem} submitLabel={initialItem ? t('save') : t('addExpense')} cancelLabel={t('cancel')} onSubmit={onSubmit} onCancel={onCancel}>
      {({ values, update }) => (
        <>
          <TextInput name="name" label={t('name')} value={values.name} onChange={update} required />
          <SelectInput name="category" label={t('category')} value={values.category} onChange={update} options={categories.map((value) => [value, value])} />
          <SelectInput name="expense_kind" label={t('expenseKind')} value={values.expense_kind} onChange={update} options={[['fixed_payment', t('fixed_payment')], ['variable_budget', t('variable_budget')], ['one_time_expense', t('one_time_expense')]]} />
          <MoneyInput name="amount" label={values.expense_kind === 'variable_budget' ? t('monthlyBudget') : t('amount')} value={values.amount} onChange={update} />
          {values.expense_kind === 'fixed_payment' && (
            <>
              <SelectInput name="frequency" label={t('frequency')} value={values.frequency} onChange={update} options={recurringFrequencyOptions.map((value) => [value, t(value)])} />
              <TextInput name="due_date" label={t('paymentDate')} type="date" value={values.due_date} onChange={update} required />
              <SelectInput name="payment_mode" label={t('paymentMode')} value={values.payment_mode} onChange={update} options={[['automatic_debit', t('automatic_debit')], ['manual_payment', t('manual_payment')]]} />
            </>
          )}
          {values.expense_kind === 'one_time_expense' && (
            <TextInput name="due_date" label={t('expenseDate')} type="date" value={values.due_date} onChange={update} required />
          )}
          <CheckboxInput name="active" label={t('active')} checked={values.active} onChange={update} />
          <TextInput name="notes" label={t('notes')} value={values.notes} onChange={update} />
        </>
      )}
    </FormShell>
  )
}

export function DebtForm({ t, initialItem, onSubmit, onCancel }) {
  return (
    <FormShell title={t('debts')} defaults={debtDefaults} initialItem={initialItem} submitLabel={initialItem ? t('save') : t('addDebt')} cancelLabel={t('cancel')} onSubmit={onSubmit} onCancel={onCancel}>
      {({ values, update }) => (
        <>
          <TextInput name="name" label={t('name')} value={values.name} onChange={update} required />
          <SelectInput name="debt_category" label={t('debtCategory')} value={values.debt_category} onChange={update} options={debtCategories} />
          <MoneyInput name="initial_amount" label={t('initialAmount')} value={values.initial_amount} onChange={update} />
          <MoneyInput name="remaining_balance" label={t('remainingBalance')} value={values.remaining_balance} onChange={update} />
          <TextInput name="final_payment" label={t('finalPayment')} type="number" min="0" step="0.01" value={values.final_payment} onChange={update} />
          <MoneyInput name="monthly_payment" label={t('monthlyPayment')} value={values.monthly_payment} onChange={update} />
          <TextInput name="interest_rate" label={t('interestRate')} type="number" step="0.001" value={values.interest_rate} onChange={update} />
          <TextInput name="estimated_end_date" label={t('estimatedEndDate')} type="date" value={values.estimated_end_date} onChange={update} />
          <TextInput name="priority" label={t('priority')} type="number" value={values.priority} onChange={update} />
          <SelectInput name="status" label={t('status')} value={values.status} onChange={update} options={[['active', t('active')], ['paid', t('paid')], ['paused', t('paused')]]} />
        </>
      )}
    </FormShell>
  )
}

export function AccountForm({ t, initialItem, onSubmit, onCancel }) {
  return (
    <FormShell title={t('accounts')} defaults={accountDefaults} initialItem={initialItem} submitLabel={initialItem ? t('save') : t('addAccount')} cancelLabel={t('cancel')} onSubmit={onSubmit} onCancel={onCancel}>
      {({ values, update }) => (
        <>
          <TextInput name="name" label={t('accountName')} value={values.name} onChange={update} required />
          <SelectInput name="account_type" label={t('accountType')} value={values.account_type} onChange={update} options={accountTypes.map(([value, labelKey]) => [value, t(labelKey)])} />
          <TextInput name="current_balance" label={t('currentBalance')} type="number" step="0.01" value={values.current_balance} onChange={update} required />
          <TextInput name="currency" label={t('currency')} value={values.currency} onChange={update} required />
          <CheckboxInput name="include_in_safe_balance" label={t('includeInSafeBalance')} checked={values.include_in_safe_balance} onChange={update} />
          <CheckboxInput name="has_overdraft" label={t('hasOverdraft')} checked={values.has_overdraft} onChange={update} />
          {values.has_overdraft && (
            <>
              <MoneyInput name="overdraft_limit" label={t('overdraftLimit')} value={values.overdraft_limit} onChange={update} />
              <TextInput name="overdraft_interest" label={t('overdraftInterest')} type="number" min="0" step="0.001" value={values.overdraft_interest} onChange={update} />
            </>
          )}
          <TextInput name="notes" label={t('notes')} value={values.notes} onChange={update} />
        </>
      )}
    </FormShell>
  )
}

function FormShell({ title, defaults, initialItem, submitLabel, cancelLabel, onSubmit, onCancel, children }) {
  const [values, setValues] = useState(() => normalizeInitial(defaults, initialItem))

  useEffect(() => {
    setValues(normalizeInitial(defaults, initialItem))
  }, [defaults, initialItem])

  const update = (event) => {
    const { checked, name, type, value } = event.target
    setValues((current) => normalizeExpenseKindChange({ ...current, [name]: type === 'checkbox' ? checked : value }, name, value, current))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit(normalizeSubmit(values))
    if (!initialItem) setValues(defaults)
  }

  return (
    <section className="section form-section">
      <div className="section-title">
        <h2>{title}</h2>
        {initialItem && <span>{submitLabel}</span>}
      </div>
      <form onSubmit={handleSubmit} className="form-grid">
        {children({ values, update })}
        <div className="form-actions">
          {initialItem && <button type="button" className="secondary" onClick={onCancel}>{cancelLabel}</button>}
          <button type="submit">{submitLabel}</button>
        </div>
      </form>
    </section>
  )
}

function normalizeExpenseKindChange(next, name, value, previous) {
  if (name !== 'expense_kind') return next
  if (value === 'variable_budget') {
    return { ...next, frequency: 'monthly', expense_type: 'variable', payment_mode: 'variable_tracking', due_date: '' }
  }
  if (value === 'one_time_expense') {
    return { ...next, frequency: 'once', expense_type: 'variable', payment_mode: 'manual_payment' }
  }
  return {
    ...next,
    frequency: previous.frequency === 'once' ? 'monthly' : previous.frequency,
    expense_type: 'fixed',
    payment_mode: previous.payment_mode === 'variable_tracking' ? 'automatic_debit' : previous.payment_mode,
  }
}

function normalizeSubmit(values) {
  if (!('expense_kind' in values)) return values
  if (values.expense_kind === 'variable_budget') {
    return { ...values, frequency: 'monthly', expense_type: 'variable', payment_mode: 'variable_tracking', due_date: '' }
  }
  if (values.expense_kind === 'one_time_expense') {
    return { ...values, frequency: 'once', expense_type: 'variable', payment_mode: 'manual_payment' }
  }
  return { ...values, expense_type: 'fixed', payment_mode: values.payment_mode === 'variable_tracking' ? 'automatic_debit' : values.payment_mode }
}

function normalizeInitial(defaults, item) {
  if (!item) return defaults
  const normalized = Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [key, item[key] ?? value]),
  )
  if (!item.expense_kind && 'expense_kind' in defaults) {
    if (item.frequency === 'once') normalized.expense_kind = 'one_time_expense'
    else if (item.payment_mode === 'variable_tracking' || item.expense_type === 'variable') normalized.expense_kind = 'variable_budget'
    else normalized.expense_kind = 'fixed_payment'
  }
  return normalizeSubmit(normalized)
}

function TextInput({ name, label, type = 'text', value, onChange, ...props }) {
  return (
    <label>
      {label}
      <input name={name} type={type} value={value ?? ''} onChange={onChange} {...props} />
    </label>
  )
}

function MoneyInput(props) {
  return <TextInput {...props} type="number" min="0" step="0.01" required />
}

function SelectInput({ name, label, value, onChange, options }) {
  return (
    <label>
      {label}
      <select name={name} value={value} onChange={onChange}>
        {options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}
      </select>
    </label>
  )
}

function CheckboxInput({ name, label, checked, onChange }) {
  return (
    <label className="checkbox">
      <input name={name} type="checkbox" checked={Boolean(checked)} onChange={onChange} />
      {label}
    </label>
  )
}
