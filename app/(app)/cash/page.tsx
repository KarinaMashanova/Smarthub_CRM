'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

interface Session { name: string; role: 'MANAGER' | 'ADMIN'; shopId: string | null }
interface Shop    { id: string; name: string }
interface CashEntry {
  id: number; date: string; type: string; payMethod: string
  isIncome: boolean; amount: number; comment: string | null
  authorName: string; shopId: string; shop: { name: string }
}
type Revenue = Record<string, { orders: number; salesNal: number; salesBeznal: number }>

const PAY_METHODS = { CASH: 'Наличные', CARD: 'Терминал', TRANSFER: 'Перевод' }
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const YEARS  = [2024, 2025, 2026]

const ADMIN_TYPES_INCOME  = ['Прочий доход', 'Возврат от поставщика']
const ADMIN_TYPES_EXPENSE = [
  'Реклама', 'Интернет / Видеонаблюдение', 'Закупка товаров',
  'Займы и кредиты', 'Аренда', 'Комиссия банка / Эквайринг',
  'Ремонт и обслуживание', 'Транспортные расходы',
  'Штрафы / Налоги', 'Выплата зарплаты', 'Прочий расход',
]
const MANAGER_TYPES_INCOME  = ['Внесение в кассу']
const MANAGER_TYPES_EXPENSE = ['Расход из кассы', 'Инкассация', 'Выплата зарплаты', 'Прочий расход']

const TYPE_COLORS: Record<string, string> = {
  'Реклама':                    'bg-pink-50 text-pink-700',
  'Интернет / Видеонаблюдение': 'bg-blue-50 text-blue-700',
  'Закупка товаров':            'bg-orange-50 text-orange-700',
  'Займы и кредиты':            'bg-red-50 text-red-700',
  'Аренда':                     'bg-purple-50 text-purple-700',
  'Выплата зарплаты':           'bg-green-50 text-green-700',
  'Инкассация':                 'bg-indigo-50 text-indigo-700',
  'Внесение в кассу':           'bg-emerald-50 text-emerald-700',
}

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

  // Дата: сегодня или месяц
  const [mode,     setMode]     = useState<'today' | 'month'>('today')
  const [selYear,  setSelYear]  = useState(() => new Date().getFullYear())
  const [selMonth, setSelMonth] = useState(() => new Date().getMonth())

  // Фильтр по салону (admin)
  const [filterShopId, setFilterShopId] = useState('')

  // Модал добавления
  const [showAdd,      setShowAdd]      = useState(false)
  const [isIncome,     setIsIncome]     = useState(false)
  const [entryType,    setEntryType]    = useState('')
  const [payMethod,    setPayMethod]    = useState<'CASH'|'CARD'|'TRANSFER'>('CASH')
  const [amount,       setAmount]       = useState('')
  const [comment,      setComment]      = useState('')
  const [modalShopId,  setModalShopId]  = useState('')
  const [entryDate,    setEntryDate]    = useState(() => toISO(new Date()))
  const [saving,       setSaving]       = useState(false)

  const { from, to } = useMemo(() => {
    if (mode === 'today') {
      const d = toISO(new Date())
      return { from: d, to: d }
    }
    const f = new Date(selYear, selMonth, 1)
    const t = new Date(selYear, selMonth + 1, 0)
    return { from: toISO(f), to: toISO(t) }
  }, [mode, selYear, selMonth])

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
    let revOrders = 0, salesNal = 0, salesBeznal = 0, expenses = 0, incManual = 0
    for (const sid of visibleShopIds) {
      const rev = revenue[sid]
      if (rev) { revOrders += rev.orders; salesNal += rev.salesNal; salesBeznal += rev.salesBeznal }
      for (const e of byShop[sid]?.entries ?? []) {
        if (e.isIncome) incManual += e.amount
        else            expenses  += e.amount
      }
    }
    const totalRev = revOrders + salesNal + salesBeznal + incManual
    return { revOrders, salesNal, salesBeznal, incManual, expenses, totalRev, net: totalRev - expenses }
  }, [visibleShopIds, revenue, byShop])

  async function submitEntry() {
    if (!entryType || !amount) return
    setSaving(true)
    try {
      const sid = isAdmin ? modalShopId : (session?.shopId ?? '')
      const res = await fetch('/api/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: entryType, payMethod, isIncome, amount: parseFloat(amount), comment, shopId: sid, date: entryDate }),
      })
      if (res.ok) {
        setShowAdd(false); setAmount(''); setComment(''); setEntryType('')
        load()
      }
    } finally { setSaving(false) }
  }

  async function deleteEntry(id: number) {
    if (!confirm('Удалить запись?')) return
    await fetch(`/api/cash/${id}`, { method: 'DELETE' })
    load()
  }

  function openAdd(presetShopId?: string) {
    setIsIncome(false); setEntryType(''); setAmount(''); setComment('')
    setModalShopId(presetShopId ?? (filterShopId || shops[0]?.id || ''))
    setEntryDate(toISO(new Date())); setShowAdd(true)
  }

  const endOfDay = new Date().getHours() >= 19

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Шапка */}
      <div className="flex-none px-4 py-3 border-b border-gray-100 bg-white flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-800">Касса</span>

        {endOfDay && (
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            🔔 Не забудьте сверить кассу
          </span>
        )}

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {/* Переключатель сегодня / месяц */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setMode('today')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${mode === 'today' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Сегодня
            </button>
            <button onClick={() => setMode('month')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${mode === 'month' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Месяц
            </button>
          </div>

          {mode === 'month' && (
            <>
              <select value={selMonth} onChange={e => setSelMonth(+e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={selYear} onChange={e => setSelYear(+e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          )}

          {/* Фильтр по салону (admin) */}
          {isAdmin && shops.length > 0 && (
            <select value={filterShopId} onChange={e => setFilterShopId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
              <option value="">Все салоны</option>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          <button onClick={() => openAdd()}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium whitespace-nowrap">
            + Добавить
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Загрузка…</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Общие итоги */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <BalCard label="Заказы"         value={totals.revOrders}   color="text-emerald-600" />
            <BalCard label="Продажи нал"    value={totals.salesNal}    color="text-emerald-500" />
            <BalCard label="Продажи безнал" value={totals.salesBeznal} color="text-blue-600" />
            <BalCard label="Расходы"        value={totals.expenses}    color="text-red-500" />
            <BalCard label="Результат"      value={totals.net}         color={totals.net >= 0 ? 'text-gray-900' : 'text-red-600'} bold />
          </div>

          {/* Секции по салонам */}
          {visibleShopIds.map(sid => {
            const shopName = byShop[sid]?.name ?? shops.find(s => s.id === sid)?.name ?? sid
            const rev = revenue[sid] ?? { orders: 0, salesNal: 0, salesBeznal: 0 }
            const shopEntries = byShop[sid]?.entries ?? []
            const shopExpenses  = shopEntries.filter(e => !e.isIncome).reduce((s, e) => s + e.amount, 0)
            const shopIncManual = shopEntries.filter(e =>  e.isIncome).reduce((s, e) => s + e.amount, 0)
            const shopRevTotal  = rev.orders + rev.salesNal + rev.salesBeznal
            const shopNet       = shopRevTotal + shopIncManual - shopExpenses

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
                    <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800">{shopName}</span>
                  </div>
                  <button onClick={() => openAdd(sid)}
                    className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                    + Операция
                  </button>
                </div>

                {/* Мини-карточки */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3">
                  <MiniCard label="Заказы"         value={rev.orders}      color="text-emerald-600" />
                  <MiniCard label="Продажи нал"    value={rev.salesNal}    color="text-emerald-500" />
                  <MiniCard label="Продажи безнал" value={rev.salesBeznal} color="text-blue-600" />
                  <MiniCard label="Расходы"        value={shopExpenses}    color="text-red-500" />
                  <MiniCard label="Итого"          value={shopNet}         color={shopNet >= 0 ? 'text-gray-800' : 'text-red-600'} bold />
                </div>

                {/* Расходы по категориям */}
                {expTypes.length > 0 && (
                  <div className="px-3 pb-3 flex flex-wrap gap-2 border-t border-gray-50 pt-2.5">
                    {expTypes.map(([type, val]) => (
                      <div key={type} className="flex items-center gap-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-600'}`}>{type}</span>
                        <span className="text-[10px] font-semibold text-red-500">−{fmt(val)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Таблица операций */}
                {shopEntries.length > 0 && (
                  <div className="border-t border-gray-50 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-400">
                          <th className="text-left px-3 py-2 font-medium w-20">Дата</th>
                          <th className="text-left px-3 py-2 font-medium">Тип</th>
                          <th className="text-left px-3 py-2 font-medium w-20">Метод</th>
                          <th className="text-right px-3 py-2 font-medium w-24">Сумма</th>
                          <th className="text-left px-3 py-2 font-medium">Комментарий</th>
                          <th className="text-left px-3 py-2 font-medium w-24">Автор</th>
                          {isAdmin && <th className="w-7" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {shopEntries.map(e => (
                          <tr key={e.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{fmtDt(e.date)}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_COLORS[e.type] ?? (e.isIncome ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600')}`}>
                                {e.type}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-400">{PAY_METHODS[e.payMethod as keyof typeof PAY_METHODS] ?? e.payMethod}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${e.isIncome ? 'text-emerald-600' : 'text-red-500'}`}>
                              {e.isIncome ? '+' : '−'}{fmt(e.amount)}
                            </td>
                            <td className="px-3 py-2 text-gray-400 truncate max-w-[160px]">{e.comment ?? '—'}</td>
                            <td className="px-3 py-2 text-gray-400 truncate max-w-[100px]">{e.authorName}</td>
                            {isAdmin && (
                              <td className="px-3 py-2 text-center">
                                <button onClick={() => deleteEntry(e.id)} className="text-gray-300 hover:text-red-400 transition-colors">✕</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {shopEntries.length === 0 && rev.orders === 0 && rev.salesNal === 0 && rev.salesBeznal === 0 && (
                  <p className="text-center py-5 text-gray-400 text-xs">Нет операций за период</p>
                )}
              </div>
            )
          })}

          {visibleShopIds.length === 0 && !loading && (
            <div className="text-center py-16 text-gray-400 text-sm">Нет данных за период</div>
          )}
        </div>
      )}

      {/* Модал: добавить операцию */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">Новая операция</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <button onClick={() => { setIsIncome(true); setEntryType('') }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${isIncome ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  Приход
                </button>
                <button onClick={() => { setIsIncome(false); setEntryType('') }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${!isIncome ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  Расход
                </button>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Тип операции</label>
                <select value={entryType} onChange={e => setEntryType(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                  <option value="">Выберите тип</option>
                  {currentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {isAdmin && shops.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Магазин</label>
                  <select value={modalShopId} onChange={e => setModalShopId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">Метод</label>
                <div className="flex gap-2">
                  {(['CASH','CARD','TRANSFER'] as const).map(m => (
                    <button key={m} onClick={() => setPayMethod(m)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${payMethod === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {PAY_METHODS[m]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Сумма, ₽</label>
                <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Дата</label>
                <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Комментарий (необязательно)</label>
                <input type="text" value={comment} onChange={e => setComment(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>

              <button onClick={submitEntry} disabled={saving || !entryType || !amount}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors">
                {saving ? 'Сохраняем...' : 'Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BalCard({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  const isNeg = value < 0
  return (
    <div className={`rounded-xl border p-3 bg-white ${bold ? 'border-gray-200' : 'border-gray-100'}`}>
      <div className="text-[11px] font-medium text-gray-500 mb-0.5">{label}</div>
      <div className={`text-base ${bold ? 'font-bold' : 'font-semibold'} ${isNeg ? 'text-red-500' : color}`}>
        {isNeg ? '−' : ''}{Math.abs(value).toLocaleString('ru-RU')} ₽
      </div>
    </div>
  )
}

function MiniCard({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  const isNeg = value < 0
  return (
    <div className="bg-gray-50 rounded-lg p-2.5">
      <div className="text-[10px] text-gray-400 mb-0.5">{label}</div>
      <div className={`text-sm ${bold ? 'font-bold' : 'font-semibold'} ${isNeg ? 'text-red-500' : color}`}>
        {isNeg ? '−' : ''}{Math.abs(value).toLocaleString('ru-RU')} ₽
      </div>
    </div>
  )
}
