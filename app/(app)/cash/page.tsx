'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { HelpModal } from '../components/HelpModal'

const HELP_ITEMS = [
  { label: 'Назначение', desc: 'Раздел фиксирует ручные доходы и расходы по каждому салону. Выручка из заказов и продаж подтягивается автоматически.' },
  { label: 'Период', desc: 'Выбери Сегодня, Вчера, конкретный Месяц или произвольный Период. Администратор может фильтровать по салону.' },
  { label: 'Операции', desc: 'Типы операций зависят от роли и направления (приход/расход). Если нужного типа нет в списке — выбери «Другое…» и введи свой.' },
  { label: 'Роли', desc: 'Администратор добавляет записи для любого салона. Менеджер — только в свой салон и с ограниченным набором типов.' },
  { label: 'Метод оплаты', desc: 'Наличные / Терминал / Перевод. Влияет только на отображение, не на расчёт итогов.' },
  { label: 'Результат', desc: 'Итог = Заказы + Продажи + ручные приходы − ручные расходы. Отображается по каждому салону и суммарно сверху.' },
]

interface Session { name: string; role: 'MANAGER' | 'ADMIN'; shopId: string | null }
interface Shop    { id: string; name: string }
interface CashEntry {
  id: number; date: string; type: string; payMethod: string
  isIncome: boolean; amount: number; comment: string | null
  authorName: string; authorRole: string | null; linkedName: string | null
  shopId: string; shop: { name: string }
  source?: 'MANUAL' | 'SALARY'
}
type Revenue = Record<string, { orders: number; sales: number }>

const PAY_METHODS = { CASH: 'Наличные', CARD: 'Терминал', TRANSFER: 'Перевод' }
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const YEARS  = [2024, 2025, 2026]

const ADMIN_TYPES_INCOME  = ['Прочий доход', 'Возврат от поставщика', '__custom__']
const ADMIN_TYPES_EXPENSE = [
  'Реклама', 'Интернет / Видеонаблюдение', 'Закупка товаров',
  'Займы и кредиты', 'Аренда', 'Комиссия банка / Эквайринг',
  'Ремонт и обслуживание', 'Транспортные расходы',
  'Штрафы / Налоги', 'Выплата зарплаты', 'Прочий расход', '__custom__',
]
const MANAGER_TYPES_INCOME  = ['Внесение в кассу', '__custom__']
const MANAGER_TYPES_EXPENSE = ['Расход из кассы', 'Инкассация', 'Выплата зарплаты', 'Прочий расход', '__custom__']

const TYPE_COLORS: Record<string, string> = {}

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmt(n: number) { return n.toLocaleString('ru-RU') + ' ₽' }
function fmtDt(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

export default function CashPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [entries, setEntries] = useState<CashEntry[]>([])
  const [shops,   setShops]   = useState<Shop[]>([])
  const [revenue, setRevenue] = useState<Revenue>({})
  const [loading, setLoading] = useState(true)

  // Дата
  const now = new Date()
  const [periodMode, setPeriodMode] = useState<'month' | 'today' | 'yesterday' | 'custom'>('today')
  const [selYear,    setSelYear]    = useState(() => new Date().getFullYear())
  const [selMonth,   setSelMonth]   = useState(() => new Date().getMonth())
  const [customFrom, setCustomFrom] = useState<string | null>(null)
  const [customTo,   setCustomTo]   = useState<string | null>(null)

  // Фильтр по салону (admin)
  const [filterShopId, setFilterShopId] = useState('')

  // Модал добавления
  const [showAdd,      setShowAdd]      = useState(false)
  const [isIncome,     setIsIncome]     = useState(false)
  const [entryType,    setEntryType]    = useState('')
  const [customType,   setCustomType]   = useState('')
  const [payMethod,    setPayMethod]    = useState<'CASH'|'CARD'|'TRANSFER'>('CASH')
  const [amount,       setAmount]       = useState('')
  const [comment,      setComment]      = useState('')
  const [modalShopId,  setModalShopId]  = useState('')
  const [entryDate,    setEntryDate]    = useState(() => toISO(new Date()))
  const [saving,         setSaving]       = useState(false)
  const [addError,       setAddError]     = useState('')
  const [showHelp,       setShowHelp]     = useState(false)
  const [showSalary,     setShowSalary]   = useState(true)
  const [collapsedShops, setCollapsedShops] = useState<Set<string>>(new Set())

  const todayISO     = toISO(new Date())
  const yesterdayISO = toISO(new Date(Date.now() - 86400000))
  const monthFrom    = toISO(new Date(selYear, selMonth, 1))
  const monthTo      = toISO(new Date(selYear, selMonth + 1, 0))
  const from = periodMode === 'today'     ? todayISO
             : periodMode === 'yesterday' ? yesterdayISO
             : periodMode === 'custom'    ? (customFrom ?? todayISO)
             : monthFrom
  const to   = periodMode === 'today'     ? todayISO
             : periodMode === 'yesterday' ? yesterdayISO
             : periodMode === 'custom'    ? (customTo ?? todayISO)
             : monthTo

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(setSession)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/cash?from=${from}&to=${to}T23:59:59`)
      if (res.ok) {
        const d = await res.json()
        setEntries(d.entries ?? [])
        setShops(d.shops ?? [])
        setRevenue(d.revenue ?? {})
      }
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])

  const isAdmin = session?.role === 'ADMIN'
  const currentTypes = (isIncome
    ? (isAdmin ? ADMIN_TYPES_INCOME  : MANAGER_TYPES_INCOME)
    : (isAdmin ? ADMIN_TYPES_EXPENSE : MANAGER_TYPES_EXPENSE))

  // Группировка записей по салону
  const byShop = useMemo(() => {
    const map: Record<string, { name: string; entries: CashEntry[] }> = {}
    for (const e of entries) {
      if (!map[e.shopId]) map[e.shopId] = { name: e.shop.name, entries: [] }
      map[e.shopId].entries.push(e)
    }
    return map
  }, [entries])

  // Все салоны с данными, отсортированные по списку магазинов
  const allShopIds = useMemo(() => {
    const ids = new Set([...Object.keys(byShop), ...Object.keys(revenue)])
    if (!isAdmin && session?.shopId) ids.add(session.shopId)
    const order = shops.map(s => s.id)
    return [...ids].sort((a, b) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b)
      if (ai === -1 && bi === -1) return 0
      if (ai === -1) return 1; if (bi === -1) return -1
      return ai - bi
    })
  }, [byShop, revenue, shops, isAdmin, session])

  const visibleShopIds = useMemo(
    () => filterShopId ? [filterShopId] : allShopIds,
    [filterShopId, allShopIds]
  )

  // Общие итоги
  const totals = useMemo(() => {
    let revOrders = 0, revSales = 0, expenses = 0, incManual = 0, salaryPaid = 0, fines = 0
    for (const sid of visibleShopIds) {
      const rev = revenue[sid]
      if (rev) { revOrders += rev.orders; revSales += rev.sales }
      for (const e of byShop[sid]?.entries ?? []) {
        if (e.source === 'SALARY') {
          if (e.isIncome) fines      += e.amount  // штраф = приход в кассу
          else            salaryPaid += e.amount  // выплата ЗП = расход
        } else {
          if (e.isIncome) incManual += e.amount
          else            expenses  += e.amount
        }
      }
    }
    const totalRev = revOrders + revSales + incManual + fines
    return { revOrders, revSales, incManual, expenses, salaryPaid, fines, totalRev, net: totalRev - expenses - salaryPaid }
  }, [visibleShopIds, revenue, byShop])

  async function submitEntry() {
    const finalType = entryType === '__custom__' ? customType.trim() : entryType
    if (!finalType || !amount) return
    setAddError('')
    setSaving(true)
    try {
      const sid = isAdmin ? modalShopId : (session?.shopId ?? '')
      const res = await fetch('/api/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: finalType, payMethod, isIncome, amount: parseFloat(amount), comment, shopId: sid, date: entryDate }),
      })
      if (res.ok) {
        setShowAdd(false); setAmount(''); setComment(''); setEntryType('')
        load()
      } else {
        const body = await res.json().catch(() => ({}))
        setAddError(body.error ?? `Ошибка ${res.status}`)
      }
    } catch (e) {
      setAddError('Нет соединения')
    } finally { setSaving(false) }
  }

  async function deleteEntry(id: number) {
    if (!confirm('Удалить запись?')) return
    await fetch(`/api/cash/${id}`, { method: 'DELETE' })
    load()
  }

  function openAdd(presetShopId?: string) {
    setIsIncome(false); setEntryType(''); setCustomType(''); setAmount(''); setComment(''); setAddError('')
    setModalShopId(presetShopId ?? (filterShopId || shops[0]?.id || ''))
    setEntryDate(toISO(new Date())); setShowAdd(true)
  }

  const endOfDay = new Date().getHours() >= 19

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] overflow-hidden bg-white md:h-screen">
      {/* Шапка */}
      <div className="shrink-0 border-b border-gray-100 px-4 pt-2.5 pb-2">
        <div className="flex items-center gap-2 pb-2 flex-wrap">
          <h1 className="font-semibold text-gray-900 text-sm shrink-0">Касса</h1>
          {endOfDay && (
            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              Не забудьте сверить кассу
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {isAdmin && shops.length > 0 && (
              <select value={filterShopId} onChange={e => setFilterShopId(e.target.value)}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                <option value="">Все салоны</option>
                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <button onClick={() => setShowSalary(v => !v)} title={showSalary ? 'Скрыть ЗП/штрафы' : 'Показать ЗП/штрафы'}
              className={`h-7 px-2.5 text-xs rounded-lg border transition-colors font-medium ${showSalary ? 'border-gray-200 text-gray-500 hover:bg-gray-50' : 'border-gray-300 bg-gray-100 text-gray-700'}`}>
              ЗП
            </button>
            <button onClick={() => setShowHelp(true)} title="Справка"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M6 5.8C6 4.8 7.5 4.5 7.5 5.8c0 .8-1 1-1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="7.5" cy="10.5" r=".6" fill="currentColor"/></svg>
            </button>
            <button onClick={() => openAdd()}
              className="h-7 px-3 text-xs rounded-lg bg-[#FFD600] text-black hover:bg-[#FFCA00] font-medium whitespace-nowrap">
              + Добавить
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {([['month','Месяц'],['today','Сегодня'],['yesterday','Вчера'],['custom','Период']] as const).map(([mode, label]) => (
              <button key={mode} onClick={() => {
                if (mode === 'custom') { setPeriodMode('custom'); setCustomFrom(from); setCustomTo(to) }
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
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={selMonth} onChange={e => setSelMonth(+e.target.value)}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </>
          ) : periodMode === 'custom' ? (
            <>
              <input type="date" value={customFrom ?? todayISO} onChange={e => { setPeriodMode('custom'); setCustomFrom(e.target.value) }}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
              <span className="text-xs text-gray-400">—</span>
              <input type="date" value={customTo ?? todayISO} onChange={e => { setPeriodMode('custom'); setCustomTo(e.target.value) }}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
            </>
          ) : (
            <span className="px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-500">
              {periodMode === 'today' ? todayISO : yesterdayISO}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Загрузка…</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Общие итоги */}
          <div className="bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs">
            {[
              { label: 'Заказы',    val: totals.revOrders,  plus: true  },
              { label: 'Продажи',   val: totals.revSales,   plus: true  },
              { label: 'Расходы',   val: totals.expenses,   plus: false },
              ...(totals.salaryPaid > 0 ? [{ label: 'ЗП',      val: totals.salaryPaid, plus: false }] : []),
              ...(totals.fines      > 0 ? [{ label: 'Штрафы',  val: totals.fines,      plus: true  }] : []),
            ].map(({ label, val, plus }) => val > 0 ? (
              <span key={label} className="text-gray-500">
                {label} <span className={`font-semibold ${plus ? 'text-green-600' : 'text-red-500'}`}>
                  {plus ? '+' : '−'}{fmt(val)}
                </span>
              </span>
            ) : null)}
            <span className="ml-auto pl-3 border-l border-gray-200 text-gray-500">
              Прибыль{' '}
              <span className={`font-bold text-sm ${totals.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {totals.net >= 0 ? '+' : '−'}{fmt(Math.abs(totals.net))}
              </span>
            </span>
          </div>

          {/* Секции по салонам */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {visibleShopIds.map(sid => {
            const shopName = byShop[sid]?.name ?? shops.find(s => s.id === sid)?.name ?? sid
            const rev = revenue[sid] ?? { orders: 0, sales: 0 }
            const shopEntries    = byShop[sid]?.entries ?? []
            const visibleEntries = showSalary ? shopEntries : shopEntries.filter(e => e.source !== 'SALARY')
            const shopExpenses  = shopEntries.filter(e => !e.isIncome).reduce((s, e) => s + e.amount, 0)
            const shopIncManual = shopEntries.filter(e =>  e.isIncome).reduce((s, e) => s + e.amount, 0)
            const shopRevTotal  = rev.orders + rev.sales
            const shopNet       = shopRevTotal + shopIncManual - shopExpenses
            const isCollapsed   = collapsedShops.has(sid)
            const toggleCollapse = () => setCollapsedShops(prev => {
              const next = new Set(prev); next.has(sid) ? next.delete(sid) : next.add(sid); return next
            })

            // Расходы по категориям
            const expByType: Record<string, number> = {}
            for (const e of shopEntries) {
              if (!e.isIncome) expByType[e.type] = (expByType[e.type] ?? 0) + e.amount
            }
            const expTypes = Object.entries(expByType).sort((a, b) => b[1] - a[1])

            return (
              <div key={sid} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {/* Заголовок */}
                <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800">{shopName}</span>
                  </div>
                  <button onClick={() => openAdd(sid)}
                    className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                    + Операция
                  </button>
                </div>

                {/* Статы */}
                <div className="px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-xs border-b border-gray-50">
                  {rev.orders > 0 && <span className="text-gray-400">Заказы <span className="font-medium text-green-600">+{fmt(rev.orders)}</span></span>}
                  {rev.sales  > 0 && <span className="text-gray-400">Продажи <span className="font-medium text-green-600">+{fmt(rev.sales)}</span></span>}
                  {shopExpenses > 0 && <span className="text-gray-400">Расходы <span className="font-medium text-red-500">−{fmt(shopExpenses)}</span></span>}
                  <span className="text-gray-400 ml-auto">Итого <span className={`font-semibold ${shopNet >= 0 ? 'text-green-600' : 'text-red-500'}`}>{shopNet >= 0 ? '+' : '−'}{fmt(Math.abs(shopNet))}</span></span>
                </div>

                {/* Расходы по категориям */}
                {expTypes.length > 0 && (
                  <div className="px-3 py-2 flex flex-wrap gap-2">
                    {expTypes.map(([type, val]) => (
                      <div key={type} className="flex items-center gap-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-600">{type}</span>
                        <span className="text-[10px] font-semibold text-red-500">−{fmt(val)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Операции: заголовок с тогглом */}
                {visibleEntries.length > 0 && (
                  <div className="border-t border-gray-100 px-3 py-1 flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">Операции · {visibleEntries.length}</span>
                    <button onClick={toggleCollapse} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                      {isCollapsed ? '▸ Раскрыть' : '▾ Свернуть'}
                    </button>
                  </div>
                )}

                {/* Таблица операций */}
                {visibleEntries.length > 0 && !isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-xs font-sans">
                      <thead>
                        <tr className="bg-gray-50 text-gray-400">
                          <th className="text-left px-2 py-1 font-medium w-16">Дата</th>
                          <th className="text-left px-2 py-1 font-medium">Тип</th>
                          <th className="text-left px-2 py-1 font-medium w-20">Метод</th>
                          <th className="text-right px-2 py-1 font-medium w-24">Сумма</th>
                          <th className="text-left px-2 py-1 font-medium">Комментарий</th>
                          <th className="text-left px-2 py-1 font-medium w-28">Сотрудник</th>
                          {isAdmin && <th className="w-6" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {visibleEntries.map(e => (
                          <tr key={e.id} className="hover:bg-gray-50">
                            <td className="px-2 py-1 text-gray-400 whitespace-nowrap">{fmtDt(e.date)}</td>
                            <td className="px-2 py-1">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_COLORS[e.type] ?? (e.isIncome ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600')}`}>
                                {e.type}
                              </span>
                              {e.source === 'SALARY' && (
                                <span className="ml-1 text-[10px] text-gray-400 italic">авто</span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-gray-400">{PAY_METHODS[e.payMethod as keyof typeof PAY_METHODS] ?? e.payMethod}</td>
                            <td className={`px-2 py-1 text-right font-semibold whitespace-nowrap ${e.isIncome ? 'text-green-600' : 'text-red-500'}`}>
                              {e.isIncome ? '+' : '−'}{fmt(e.amount)}
                            </td>
                            <td className="px-2 py-1 text-gray-400 truncate max-w-[140px]">
                              {e.comment || '—'}
                              {e.source === 'SALARY' && e.linkedName && <span className="text-gray-500 font-medium">{e.comment ? ` · ${e.linkedName}` : e.linkedName}</span>}
                            </td>
                            <td className="px-2 py-1 text-gray-500 text-[11px] whitespace-nowrap">{e.authorName}</td>
                            {isAdmin && (
                              <td className="px-2 py-1 text-center">
                                {e.source !== 'SALARY' && (
                                  <button onClick={() => deleteEntry(e.id)} className="text-gray-300 hover:text-red-400 transition-colors">✕</button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {visibleEntries.length === 0 && rev.orders === 0 && rev.sales === 0 && (
                  <p className="text-center py-5 text-gray-400 text-xs">Нет операций за период</p>
                )}
              </div>
            )
          })}

          </div>

          {visibleShopIds.length === 0 && !loading && (
            <div className="text-center py-16 text-gray-400 text-sm">Нет данных за период</div>
          )}
        </div>
      )}

      {/* Модал: добавить операцию */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm sm:mx-4 flex flex-col max-h-[92dvh]">

            {/* Заголовок (фиксированный) */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">Новая операция</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            {/* Прокручиваемое содержимое */}
            <div className="overflow-y-auto px-6 py-4 flex-1">
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button onClick={() => { setIsIncome(true); setEntryType('') }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${isIncome ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    Приход
                  </button>
                  <button onClick={() => { setIsIncome(false); setEntryType('') }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${!isIncome ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    Расход
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Тип операции</label>
                  <select value={entryType} onChange={e => { setEntryType(e.target.value); setCustomType('') }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                    <option value="">Выберите тип</option>
                    {currentTypes.map(t => <option key={t} value={t}>{t === '__custom__' ? 'Другое...' : t}</option>)}
                  </select>
                </div>
                {entryType === '__custom__' && (
                  <div>
                    <input value={customType} onChange={e => setCustomType(e.target.value)}
                      placeholder="Введите тип операции" autoFocus
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD600]" />
                  </div>
                )}

                {isAdmin && shops.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Магазин</label>
                    <select value={modalShopId} onChange={e => setModalShopId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                      {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Метод</label>
                  <div className="flex gap-2">
                    {(['CASH','CARD','TRANSFER'] as const).map(m => (
                      <button key={m} onClick={() => setPayMethod(m)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${payMethod === m ? 'bg-[#FFD600] text-black' : 'bg-gray-100 text-gray-600'}`}>
                        {PAY_METHODS[m]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Сумма, ₽</label>
                  <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD600]" />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Дата</label>
                  <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD600]" />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Комментарий (необязательно)</label>
                  <input type="text" value={comment} onChange={e => setComment(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD600]" />
                </div>

                {addError && (
                  <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{addError}</p>
                )}
                <button onClick={submitEntry} disabled={saving || !entryType || (entryType === '__custom__' && !customType.trim()) || !amount}
                  className="w-full py-2.5 rounded-xl bg-[#FFD600] text-black text-sm font-medium hover:bg-[#FFCA00] disabled:opacity-40 transition-colors">
                  {saving ? 'Сохраняем...' : 'Добавить'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {showHelp && (
        <HelpModal
          title="Касса — справка"
          color="bg-gray-50 border-gray-100"
          dot="bg-gray-400"
          items={HELP_ITEMS}
          onClose={() => setShowHelp(false)}
        />
      )}
    </div>
  )
}
