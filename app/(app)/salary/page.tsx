'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { Modal } from '../components/Modal'
import { HelpModal } from '../components/HelpModal'

const HELP_ITEMS = [
  { label: 'Типы записей', desc: 'Выплата Зарплаты (синий) — факт выплаты. Доначисление Оклада (голубой) — добавление фиксированной части к ЗП. Бонус (янтарный) — разовые премии. Штраф (красный) — удержания.' },
  { label: 'Бонус за ВМР', desc: 'Авторасчёт: при марже заказа от 4 000 ₽ создаётся бонус 20% от маржи. Помечается тегом «Высокомаржинальный».' },
  { label: 'Ремонты', desc: 'Сотрудник добавляет оплату ремонта вручную, привязывая к заказу. Статус «Забрал» означает, что деньги взяты наличными — сумма вычитается из итоговой ЗП. «Не забрал» — числится как долг компании.' },
  { label: 'Формула Итого', desc: 'Итого = Выплата ЗП + Доначисление + Бонусы − Штрафы − Работа по ремонту (только «Забрал»).' },
  { label: 'Источник', desc: '«Вручную» — создано через UI. «Импорт» — загружено скриптом. «Авто» — создано синком заказов.' },
  { label: 'Права доступа', desc: 'Менеджер видит только свои записи и может добавлять ремонты. Добавлять другие типы — только администратор.' },
]

interface TargetAction {
  id: number; date: string; actionType: string; subType: string | null
  employeeName: string; amount: number; comment: string | null
  source: string; responsibleName: string | null; paymentDate: string | null
  isHighMargin?: boolean; orderId?: string | null
}
interface RepairWork {
  id: number; date: string; employeeName: string; amount: number
  comment: string | null; isTaken: boolean; takenAt: string | null
  paymentDate: string | null
  orderId: string | null; orderNumber: string | null; createdAt: string
}
interface StatDetail { actionType: string; subType: string | null; count: number; amount: number }
interface StatRow {
  name: string
  bonus: number; addon: number
  ndfl: number; fine: number; totalRepair: number; repairEarned: number; repairTaken: number
  paidSalary: number; accrued: number; остаток: number
  details: StatDetail[]
}
interface Session { name: string; role: 'MANAGER' | 'ADMIN'; shopId?: string | null }
interface AdminEmployee { id: string; name: string; appRole: string | null }

const ACTION_TYPES = ['Выплата Зарплаты', 'Доначисление Оклада', 'Бонус', 'Штраф']
const ACTION_COLORS: Record<string, string> = {
  'Выплата Зарплаты':    'bg-orange-100 text-orange-700',
  'Доначисление Оклада': 'bg-blue-100 text-blue-700',
  'Бонус':               'bg-green-100 text-green-700',
  'Штраф':               'bg-red-100 text-red-700',
  'Работа по ремонту':   'bg-orange-100 text-orange-700',
}
const AMOUNT_COLORS: Record<string, string> = {
  'Выплата Зарплаты':    'text-orange-600',
  'Доначисление Оклада': 'text-blue-600',
  'Бонус':               'text-green-600',
  'Штраф':               'text-red-600',
  'Работа по ремонту':   'text-orange-600',
}
const SUB_TYPES: Record<string, string[]> = {
  'Выплата Зарплаты':    ['Зарплата', 'НДФЛ', 'Оклад'],
  'Доначисление Оклада': ['Оклад', 'Доплата'],
  'Бонус':               ['За ВМР', 'За наличность', 'Оклад', 'Зарплата', 'Отзыв', 'Отпускные', 'Работа без выходных', 'Выход в выходной', 'Выполнение плана'],
  'Штраф':               ['Опоздание', 'Списание за товар', 'Ревизия', 'Левак', 'Отзыв', 'Невыход', 'Работа не на потоке / курение / поведение', 'Неправильно заполненная продажа/заказ'],
}
const MONTH_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`
}
function fmt(n: number) { return Math.abs(n).toLocaleString('ru-RU') + ' ₽' }

function makeEmpty() {
  const today = toISO(new Date())
  return { date: today, actionType: 'Выплата Зарплаты', subType: '', employeeName: '', amount: '', comment: '', responsibleName: '', paymentDate: today }
}
function makeEmptyRepair() {
  const today = toISO(new Date())
  return { orderId: '', amount: '', comment: '', isTaken: false, date: today, paymentDate: today }
}

export default function SalaryPage() {
  const now = new Date()
  const [session, setSession]     = useState<Session | null>(null)
  const [actions, setActions]     = useState<TargetAction[]>([])
  const [repairs, setRepairs]     = useState<RepairWork[]>([])
  const [stats, setStats]         = useState<StatRow[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [employees, setEmployees] = useState<string[]>([])
  const [subTypes, setSubTypes]   = useState<string[]>([])
  const [admins, setAdmins]       = useState<AdminEmployee[]>([])
  const [view, setView]           = useState<'list' | 'stats' | 'repairs'>('list')
  const [filterVmr, setFilterVmr] = useState(false)

  const [periodMode,     setPeriodMode]    = useState<'month' | 'today' | 'yesterday' | 'custom'>('month')
  const [selYear,        setSelYear]       = useState(now.getFullYear())
  const [selMonth,       setSelMonth]      = useState(now.getMonth())
  const [customFrom,     setCustomFrom]    = useState<string | null>(null)
  const [customTo,       setCustomTo]      = useState<string | null>(null)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterType,     setFilterType]    = useState('')
  const [filterSubType,  setFilterSubType] = useState('')
  const [expandedStats,  setExpandedStats] = useState<Set<string>>(new Set())

  // Add action modal
  const [showModal, setShowModal]   = useState(false)
  const [showHelp, setShowHelp]     = useState(false)
  const [form, setForm]             = useState(makeEmpty)
  const [saving, setSaving]         = useState(false)

  // Add repair modal
  const [showRepairModal, setShowRepairModal] = useState(false)
  const [repairForm, setRepairForm]           = useState(makeEmptyRepair)
  const [orderSearch, setOrderSearch]         = useState('')
  const [orderSearchResults, setOrderSearchResults] = useState<{ id: string; number: string | null }[]>([])
  const [savingRepair, setSavingRepair]       = useState(false)

  // Inline "Забрал" date picker in repair row
  const [takenPickerId, setTakenPickerId]   = useState<number | null>(null)
  const [takenPickerDate, setTakenPickerDate] = useState(toISO(new Date()))

  const todayISO     = toISO(new Date())
  const yesterdayISO = toISO(new Date(Date.now() - 86400000))
  const monthFrom    = toISO(new Date(selYear, selMonth, 1))
  const monthTo      = toISO(new Date(selYear, selMonth + 1, 0))
  const listFrom = periodMode === 'today'     ? todayISO
                 : periodMode === 'yesterday' ? yesterdayISO
                 : periodMode === 'custom'    ? (customFrom ?? todayISO)
                 : monthFrom
  const listTo   = periodMode === 'today'     ? todayISO
                 : periodMode === 'yesterday' ? yesterdayISO
                 : periodMode === 'custom'    ? (customTo ?? todayISO)
                 : monthTo

  function toggleExpandStats(name: string) {
    setExpandedStats(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(setSession)
    fetch('/api/admin/employees')
      .then(r => r.ok ? r.json() : [])
      .then((list: AdminEmployee[]) => setAdmins(list.filter(e => e.appRole === 'ADMIN')))
      .catch(() => {})
  }, [])

  const loadList = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ from: listFrom, to: listTo })
    if (filterEmployee) p.set('employee', filterEmployee)
    if (filterType)     p.set('actionType', filterType)
    if (filterSubType)  p.set('subType', filterSubType)
    fetch(`/api/target-actions?${p}`)
      .then(r => r.json())
      .then(d => {
        setActions(d.actions); setTotal(d.total)
        if (d.employees.length) setEmployees(d.employees)
        if (d.subTypes?.length) setSubTypes(d.subTypes)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [listFrom, listTo, filterEmployee, filterType, filterSubType])

  const loadStats = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ from: listFrom, to: listTo })
    if (filterEmployee) p.set('employee', filterEmployee)
    fetch(`/api/target-actions/stats?${p}`)
      .then(r => r.json())
      .then(d => { setStats(d.stats ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [listFrom, listTo, filterEmployee])

  const loadRepairs = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ from: listFrom, to: listTo })
    if (filterEmployee) p.set('employee', filterEmployee)
    fetch(`/api/repair-works?${p}`)
      .then(r => r.json())
      .then(d => { setRepairs(d.works ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [listFrom, listTo, filterEmployee])

  useEffect(() => {
    if (view === 'list') loadList()
    else if (view === 'stats') loadStats()
    else loadRepairs()
  }, [view, loadList, loadStats, loadRepairs])

  // Поиск заказа по номеру
  useEffect(() => {
    if (!orderSearch || orderSearch.length < 2) { setOrderSearchResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/orders?search=${encodeURIComponent(orderSearch)}&page=1`)
        .then(r => r.json())
        .then(d => setOrderSearchResults((d.orders ?? []).slice(0, 8).map((o: any) => ({ id: o.id, number: o.number }))))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [orderSearch])

  const isAdmin = session?.role === 'ADMIN'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/target-actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setShowModal(false); setSaving(false); loadList()
  }

  async function deleteAction(id: number) {
    if (!confirm('Удалить запись?')) return
    await fetch(`/api/target-actions/${id}`, { method: 'DELETE' })
    loadList()
  }

  async function submitRepair(e: React.FormEvent) {
    e.preventDefault()
    setSavingRepair(true)
    await fetch('/api/repair-works', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(repairForm),
    })
    setShowRepairModal(false); setSavingRepair(false)
    setRepairForm(makeEmptyRepair()); setOrderSearch('')
    loadRepairs()
  }

  async function confirmTaken(work: RepairWork, payDate: string) {
    await fetch(`/api/repair-works/${work.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTaken: true, paymentDate: payDate }),
    })
    setTakenPickerId(null)
    loadRepairs()
  }

  async function unmarkTaken(work: RepairWork) {
    await fetch(`/api/repair-works/${work.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTaken: false }),
    })
    loadRepairs()
  }

  async function deleteRepair(id: number) {
    if (!confirm('Удалить запись о ремонте?')) return
    await fetch(`/api/repair-works/${id}`, { method: 'DELETE' })
    loadRepairs()
  }

  const filteredActions = filterVmr ? actions.filter(a => a.isHighMargin) : actions

  const totals = filteredActions.reduce((acc, a) => {
    if (a.actionType === 'Штраф') acc.fines += a.amount
    else acc.income += a.amount
    return acc
  }, { income: 0, fines: 0 })

  const repairTotals = repairs.reduce((acc, r) => {
    acc.total += r.amount
    if (r.isTaken) acc.taken += r.amount
    else acc.pending += r.amount
    return acc
  }, { total: 0, taken: 0, pending: 0 })



  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)] overflow-hidden bg-white md:h-screen">
      {/* Шапка */}
      <div className="shrink-0 border-b border-gray-100 px-4 pt-2.5 pb-2">
        {/* Строка 1: заголовок + вкладки + действия */}
        <div className="flex items-center gap-2 pb-2 flex-wrap">
          <h1 className="font-semibold text-gray-900 text-sm shrink-0">Целевые действия</h1>
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(['list', 'stats', 'repairs'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${
                  view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {v === 'list' ? 'Список' : v === 'stats' ? 'Статистика' : 'Ремонты'}
              </button>
            ))}
          </div>
          <div className="flex w-full items-center justify-end gap-2 md:ml-auto md:w-auto">
            {isAdmin && view === 'list' && (
              <button onClick={() => { setForm(makeEmpty()); setShowModal(true) }}
                className="h-7 px-3 text-xs rounded-lg bg-[#FFD600] text-black hover:bg-[#FFCA00] font-medium whitespace-nowrap">
                + Добавить
              </button>
            )}
            {view === 'repairs' && (
              <button onClick={() => { setRepairForm(makeEmptyRepair()); setOrderSearch(''); setShowRepairModal(true) }}
                className="h-7 px-3 text-xs rounded-lg bg-[#FFD600] text-black hover:bg-[#FFCA00] font-medium whitespace-nowrap">
                + Добавить ремонт
              </button>
            )}
            <button onClick={() => setShowHelp(true)} title="Справка"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M6 5.8C6 4.8 7.5 4.5 7.5 5.8c0 .8-1 1-1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="7.5" cy="10.5" r=".6" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
        {/* Строка 2: стандартный фильтр дат + дополнительные фильтры */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {([['month','Месяц'],['today','Сегодня'],['yesterday','Вчера'],['custom','Период']] as const).map(([mode, label]) => (
              <button key={mode} onClick={() => {
                if (mode === 'custom') { setPeriodMode('custom'); setCustomFrom(listFrom); setCustomTo(listTo) }
                else setPeriodMode(mode)
              }}
                className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${
                  periodMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {periodMode === 'month' ? (
            <>
              <select value={selYear} onChange={e => setSelYear(+e.target.value)}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={selMonth} onChange={e => setSelMonth(+e.target.value)}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                {MONTH_SHORT.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </>
          ) : periodMode === 'custom' ? (
            <>
              <input type="date" value={customFrom ?? todayISO} onChange={e => setCustomFrom(e.target.value)}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
              <span className="text-xs text-gray-400">—</span>
              <input type="date" value={customTo ?? todayISO} onChange={e => setCustomTo(e.target.value)}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
            </>
          ) : (
            <span className="px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-500">
              {periodMode === 'today' ? todayISO : yesterdayISO}
            </span>
          )}
          {isAdmin && (
            <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}
              className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] max-w-[160px]">
              <option value="">Все сотрудники</option>
              {employees.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
          {view === 'list' && (
            <>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                <option value="">Все типы</option>
                {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filterSubType} onChange={e => setFilterSubType(e.target.value)}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] max-w-[160px]">
                <option value="">Все виды</option>
                {subTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={() => setFilterVmr(v => !v)}
                className={`h-7 px-2 text-xs rounded-lg border font-medium transition-colors ${
                  filterVmr ? 'bg-amber-100 border-amber-300 text-amber-800' : 'border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}>
                ВМР
              </button>
            </>
          )}
        </div>
      </div>

      {/* Add TargetAction modal */}
      {showModal && isAdmin && (
        <Modal title="Добавить запись" onClose={() => setShowModal(false)}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-700">Дата начисления</label>
                <input type="date" required value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value, paymentDate: f.paymentDate === f.date ? e.target.value : f.paymentDate }))}
                  className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-700">Дата выплаты</label>
                <input type="date" value={form.paymentDate}
                  onChange={e => setForm(f => ({...f, paymentDate: e.target.value}))}
                  className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-700">Тип</label>
                <select required value={form.actionType}
                  onChange={e => setForm(f => ({...f, actionType: e.target.value, subType: ''}))}
                  className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                  {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-700">Вид</label>
                <select value={form.subType}
                  onChange={e => setForm(f => ({...f, subType: e.target.value}))}
                  className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                  <option value="">— не указан —</option>
                  {(SUB_TYPES[form.actionType] ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">Сотрудник</label>
              <input required list="emp-list" value={form.employeeName}
                onChange={e => setForm(f => ({...f, employeeName: e.target.value}))}
                placeholder="Фамилия Имя"
                className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
              <datalist id="emp-list">{employees.map(e => <option key={e} value={e}/>)}</datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">Сумма ₽</label>
              <input type="number" required min="0" value={form.amount}
                onChange={e => setForm(f => ({...f, amount: e.target.value}))}
                placeholder="0"
                className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">Комментарий</label>
              <input value={form.comment}
                onChange={e => setForm(f => ({...f, comment: e.target.value}))}
                placeholder="необязательно"
                className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">Ответственный</label>
              <select value={form.responsibleName}
                onChange={e => setForm(f => ({...f, responsibleName: e.target.value}))}
                className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                <option value="">— не указан —</option>
                {admins.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-[#FFD600] hover:bg-[#e6c200] text-black disabled:opacity-50 transition-colors">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button type="button" onClick={() => setShowModal(false)}
                className="px-5 py-2.5 text-sm font-medium rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
                Отмена
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add repair modal */}
      {showRepairModal && (
        <Modal title="Добавить оплату ремонта" onClose={() => setShowRepairModal(false)}>
          <form onSubmit={submitRepair} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">Заказ (номер)</label>
              <div className="relative">
                <input value={orderSearch}
                  onChange={e => {
                    setOrderSearch(e.target.value)
                    if (!e.target.value) setRepairForm(f => ({...f, orderId: ''}))
                  }}
                  placeholder="Введите номер заказа..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
                {orderSearchResults.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {orderSearchResults.map(o => (
                      <button key={o.id} type="button"
                        onClick={() => {
                          setRepairForm(f => ({...f, orderId: o.id}))
                          setOrderSearch(o.number ?? o.id)
                          setOrderSearchResults([])
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0">
                        {o.number ?? o.id}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {repairForm.orderId && (
                <span className="text-[11px] text-blue-600">✓ Заказ привязан</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">Сумма за ремонт ₽</label>
              <input type="number" required min="1" value={repairForm.amount}
                onChange={e => setRepairForm(f => ({...f, amount: e.target.value}))}
                placeholder="0"
                className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">Описание (необязательно)</label>
              <input value={repairForm.comment}
                onChange={e => setRepairForm(f => ({...f, comment: e.target.value}))}
                placeholder="Что сделал..."
                className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">Дата начисления</label>
              <input type="date" value={repairForm.date}
                onChange={e => setRepairForm(f => ({...f, date: e.target.value}))}
                className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
            </div>

            {repairForm.isTaken && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-700">Дата выплаты</label>
                <input type="date" value={repairForm.paymentDate}
                  onChange={e => setRepairForm(f => ({...f, paymentDate: e.target.value}))}
                  className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
              <button type="button"
                onClick={() => setRepairForm(f => ({...f, isTaken: !f.isTaken}))}
                className={`relative w-10 h-5 rounded-full transition-colors ${repairForm.isTaken ? 'bg-blue-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${repairForm.isTaken ? 'translate-x-5' : 'translate-x-0.5'}`}/>
              </button>
              <div>
                <div className="text-xs font-medium text-gray-700">
                  {repairForm.isTaken ? 'Забрал деньги' : 'Не забрал деньги'}
                </div>
                <div className="text-[11px] text-gray-400">
                  {repairForm.isTaken ? 'Вычтется из итоговой ЗП' : 'Числится как долг компании'}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={savingRepair}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-[#FFD600] hover:bg-[#e6c200] text-black disabled:opacity-50 transition-colors">
                {savingRepair ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button type="button" onClick={() => setShowRepairModal(false)}
                className="px-5 py-2.5 text-sm font-medium rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
                Отмена
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Загрузка...</div>
        ) : view === 'repairs' ? (
          // ---- РЕМОНТЫ ----
          repairs.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">Нет ремонтов за выбранный период</div>
          ) : (
            <table className="w-full min-w-[880px] text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-3 py-1.5 font-medium text-gray-500 w-[100px]">Дата начисл.</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500 w-[100px]">Дата выплаты</th>
                  {isAdmin && <th className="px-3 py-1.5 font-medium text-gray-500">Сотрудник</th>}
                  <th className="px-3 py-1.5 font-medium text-gray-500 w-24">Заказ</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500">Описание</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500 w-28 text-right">Сумма</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500 w-32 text-center">Статус</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {repairs.map((r, i) => (
                  <tr key={r.id} className={`border-b border-gray-100 hover:bg-gray-50/60 ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                    <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{fmtDate(r.paymentDate)}</td>
                    {isAdmin && <td className="px-3 py-1.5 font-medium text-gray-800">{r.employeeName}</td>}
                    <td className="px-3 py-2">
                      {r.orderNumber
                        ? <span className="text-blue-600 font-mono">{r.orderNumber}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{r.comment ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-orange-600">
                      {fmt(r.amount)}
                    </td>
                    <td className="px-3 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                      {r.isTaken ? (
                        <div>
                          <button onClick={() => unmarkTaken(r)}
                            className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors">
                            ✓ Забрал
                          </button>
                          {r.takenAt && <div className="text-[10px] text-gray-400 mt-0.5">{fmtDate(r.takenAt)}</div>}
                        </div>
                      ) : takenPickerId === r.id ? (
                        <div className="flex flex-col items-center gap-1">
                          <input type="date" value={takenPickerDate}
                            onChange={e => setTakenPickerDate(e.target.value)}
                            className="px-1.5 py-0.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"/>
                          <div className="flex gap-1">
                            <button onClick={() => confirmTaken(r, takenPickerDate)}
                              className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500 text-white hover:bg-blue-600 font-medium">
                              ОК
                            </button>
                            <button onClick={() => setTakenPickerId(null)}
                              className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setTakenPickerId(r.id); setTakenPickerDate(toISO(new Date())) }}
                          className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                          Не забрал
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => deleteRepair(r.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors text-base leading-none">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td colSpan={isAdmin ? 5 : 4} className="px-3 py-2 text-gray-700">Итого</td>
                  <td className="px-3 py-1.5 text-right text-orange-600">{fmt(repairTotals.total)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className="text-[11px] text-blue-700">−{fmt(repairTotals.taken)} (забрали)</span>
                    {repairTotals.pending > 0 && (
                      <div className="text-[11px] text-gray-400">ожидает {fmt(repairTotals.pending)}</div>
                    )}
                  </td>
                  <td/>
                </tr>
              </tfoot>
            </table>
          )
        ) : view === 'stats' ? (
          // ---- СТАТИСТИКА ----
          stats.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">Нет данных за выбранный период</div>
          ) : (
            <table className="w-full min-w-[880px] text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-3 py-1.5 font-medium text-gray-500">Сотрудник</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500 text-right w-24">Бонусы</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500 text-right w-28">Доначисл.</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500 text-right w-20">НДФЛ</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500 text-right w-24">Штрафы</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500 text-right w-28" title="Авансы по ремонтам (забрал)">Ремонты</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500 text-right w-32 bg-yellow-50/60">Итого ЗП</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500 text-right w-28 bg-blue-50/60">Выплачено</th>
                  <th className="px-3 py-1.5 font-medium text-gray-500 text-right w-32 bg-green-50/60">Остаток</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, i) => {
                  const expanded = expandedStats.has(s.name)
                  return (
                    <Fragment key={s.name}>
                      <tr onClick={() => toggleExpandStats(s.name)}
                        className={`border-b border-gray-100 cursor-pointer select-none ${
                          expanded ? 'bg-gray-50' : i % 2 === 1 ? 'bg-gray-50/30 hover:bg-gray-50/60' : 'hover:bg-gray-50/60'
                        }`}>
                        <td className="px-3 py-1.5 font-medium text-gray-800 flex items-center gap-1.5">
                          <span className={`text-gray-300 transition-transform text-[10px] ${expanded ? 'rotate-90' : ''}`}>▶</span>
                          {s.name}
                        </td>
                        <td className="px-3 py-1.5 text-right text-green-600">{s.bonus > 0 ? fmt(s.bonus) : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-blue-600">{s.addon > 0 ? fmt(s.addon) : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-red-400">{s.ndfl > 0 ? fmt(s.ndfl) : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-red-600">{s.fine > 0 ? fmt(s.fine) : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-orange-500">
                          {s.repairTaken > 0
                            ? <span title={`Всего ремонтов: ${fmt(s.totalRepair)}`}>{fmt(s.repairTaken)}</span>
                            : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold bg-yellow-50/40 ${s.accrued >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                          {fmt(s.accrued)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-orange-600 bg-blue-50/30">
                          {s.paidSalary > 0 ? fmt(s.paidSalary) : '—'}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-semibold bg-green-50/30 ${s.остаток > 0 ? 'text-green-700' : s.остаток < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {s.остаток !== 0 ? fmt(s.остаток) : '—'}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          <td colSpan={10} className="px-6 py-2.5">
                            <table className="w-full min-w-[620px] text-[11px]">
                              <thead>
                                <tr className="text-gray-400 border-b border-gray-200">
                                  <th className="text-left pb-1.5 font-medium">Тип</th>
                                  <th className="text-left pb-1.5 font-medium">Вид</th>
                                  <th className="text-right pb-1.5 font-medium w-12">Шт.</th>
                                  <th className="text-right pb-1.5 font-medium w-32">Сумма</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {s.details.map((d, di) => {
                                  const isDeduct = d.actionType === 'Штраф' || d.actionType === 'Работа по ремонту'
                                  return (
                                    <tr key={di} className="hover:bg-white/60">
                                      <td className="py-1.5 pr-3">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ACTION_COLORS[d.actionType] ?? 'bg-gray-100 text-gray-500'}`}>
                                          {d.actionType}
                                        </span>
                                      </td>
                                      <td className="py-1.5 pr-3 text-gray-500">{d.subType ?? <span className="text-gray-300">—</span>}</td>
                                      <td className="py-1.5 text-right text-gray-400">{d.count}</td>
                                      <td className={`py-1.5 text-right font-medium ${isDeduct ? 'text-red-500' : 'text-gray-700'}`}>
                                        {isDeduct ? `−${fmt(d.amount)}` : fmt(d.amount)}
                                      </td>
                                    </tr>
                                  )
                                })}
                                {s.paidSalary > 0 && (
                                  <tr className="border-t border-gray-200 bg-blue-50/30">
                                    <td colSpan={3} className="py-1.5 pr-3 text-gray-400">Уже выплачено</td>
                                    <td className="py-1.5 text-right font-semibold text-blue-700">{fmt(s.paidSalary)}</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-xs">
                  <td className="px-3 py-1.5 text-gray-700">Итого</td>
                  <td className="px-3 py-1.5 text-right text-green-600">{fmt(stats.reduce((s, r) => s + r.bonus, 0))}</td>
                  <td className="px-3 py-1.5 text-right text-blue-600">{fmt(stats.reduce((s, r) => s + r.addon, 0))}</td>
                  <td className="px-3 py-1.5 text-right text-red-400">{fmt(stats.reduce((s, r) => s + r.ndfl, 0))}</td>
                  <td className="px-3 py-1.5 text-right text-red-600">{fmt(stats.reduce((s, r) => s + r.fine, 0))}</td>
                  <td className="px-3 py-1.5 text-right text-orange-500">{fmt(stats.reduce((s, r) => s + r.repairTaken, 0))}</td>
                  <td className="px-3 py-1.5 text-right text-gray-800 bg-yellow-50/40">{fmt(stats.reduce((s, r) => s + r.accrued, 0))}</td>
                  <td className="px-3 py-1.5 text-right text-orange-600 bg-blue-50/30">{fmt(stats.reduce((s, r) => s + r.paidSalary, 0))}</td>
                  <td className="px-3 py-1.5 text-right text-green-700 bg-green-50/30">{fmt(stats.reduce((s, r) => s + r.остаток, 0))}</td>
                </tr>
              </tfoot>
            </table>
          )
        ) : (
          // ---- СПИСОК ----
          filteredActions.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              {filterVmr ? 'Нет ВМР-заказов за выбранный период' : 'Нет данных за выбранный период'}
            </div>
          ) : (() => {
            // Группировка по дням
            const groups: { date: string; items: TargetAction[] }[] = []
            for (const a of filteredActions) {
              const day = (a.date ?? '').slice(0, 10)
              const last = groups[groups.length - 1]
              if (last && last.date === day) last.items.push(a)
              else groups.push({ date: day, items: [a] })
            }
            const colCount = 6 + (isAdmin ? 3 : 0)
            return (
              <table className="w-full min-w-[760px] text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="px-3 py-1.5 font-medium text-gray-500 w-40">Тип</th>
                    <th className="px-3 py-1.5 font-medium text-gray-500 w-36">Вид</th>
                    {isAdmin && <th className="px-3 py-1.5 font-medium text-gray-500">Сотрудник</th>}
                    <th className="px-3 py-1.5 font-medium text-gray-500 w-28 text-right">Сумма</th>
                    <th className="px-3 py-1.5 font-medium text-gray-500">Комментарий</th>
                    {isAdmin && <th className="px-3 py-1.5 font-medium text-gray-500 w-28">Ответственный</th>}
                    {isAdmin && <th className="px-3 py-1.5 font-medium text-gray-500 w-14">Источник</th>}
                    {isAdmin && <th className="px-3 py-1.5 font-medium text-gray-500 w-8"></th>}
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <Fragment key={g.date}>
                      <tr className="bg-gray-50/70 border-b border-gray-200">
                        <td colSpan={colCount} className="px-3 py-1 text-[11px] font-semibold text-gray-500">
                          {fmtDate(g.date)}
                          <span className="ml-2 font-normal text-gray-400">{g.items.length} {g.items.length === 1 ? 'запись' : g.items.length < 5 ? 'записи' : 'записей'}</span>
                        </td>
                      </tr>
                      {g.items.map(a => (
                        <tr key={a.id}
                          className={`border-b border-gray-100 hover:bg-gray-50/60 ${a.isHighMargin ? 'bg-amber-50/40' : ''}`}>
                          <td className="px-3 py-1.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ACTION_COLORS[a.actionType] ?? 'bg-gray-100 text-gray-600'}`}>
                              {a.actionType}
                            </span>
                            {a.isHighMargin && (
                              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">ВМР</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-gray-500">{a.subType ?? <span className="text-gray-300">—</span>}</td>
                          {isAdmin && <td className="px-3 py-1.5 font-medium text-gray-800">{a.employeeName}</td>}
                          <td className={`px-3 py-2 text-right font-semibold ${AMOUNT_COLORS[a.actionType] ?? 'text-gray-700'}`}>
                            {fmt(a.amount)}
                          </td>
                          <td className="px-3 py-1.5 text-gray-500">{a.comment ?? '—'}</td>
                          {isAdmin && <td className="px-3 py-1.5 text-gray-400">{a.responsibleName ?? '—'}</td>}
                          {isAdmin && (
                            <td className="px-3 py-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                a.source === 'IMPORT' ? 'bg-blue-50 text-blue-500'
                                : a.source === 'AUTO' ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-gray-100 text-gray-400'
                              }`}>
                                {a.source === 'IMPORT' ? 'Импорт' : a.source === 'AUTO' ? 'Авто' : 'Вручную'}
                              </span>
                            </td>
                          )}
                          {isAdmin && (
                            <td className="px-3 py-2">
                              <button onClick={() => deleteAction(a.id)}
                                className="text-gray-300 hover:text-red-400 transition-colors text-base leading-none">×</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )
          })()
        )}
      </div>

      {view === 'list' && (
        <div className="shrink-0 border-t border-gray-100 px-4 py-2 flex items-center justify-between text-xs text-gray-400">
          <span>{filterVmr ? `${filteredActions.length} из ${total}` : total} записей</span>
          <span className="font-medium text-gray-600">
            Итого: +{totals.income.toLocaleString('ru-RU')} ₽
            {totals.fines > 0 && ` / штрафы: −${totals.fines.toLocaleString('ru-RU')} ₽`}
            {` / чистыми: ${(totals.income - totals.fines).toLocaleString('ru-RU')} ₽`}
          </span>
        </div>
      )}

      {showHelp && (
        <HelpModal
          title="Целевые действия — справка"
          color="bg-blue-50 border-blue-100"
          dot="bg-blue-400"
          items={HELP_ITEMS}
          onClose={() => setShowHelp(false)}
        />
      )}
    </div>
  )
}
