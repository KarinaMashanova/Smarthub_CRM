'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'

interface SalePosition {
  id: string; name: string; isWork: boolean
  price: number; soldPrice: number; count: number; purchasePriceSumm: number
}
interface Sale {
  id: string
  number: string | null
  shopId: string
  shop: { name: string }
  date: string | null
  sellerName: string | null
  cashMoney: number
  cashBank: number
  revenue: number
  refund: number
  paymentType: string | null
  costTotal: number | null
  margin: number | null
  retailTotal: number
  retailDelta: number | null
  retailPriceSold: boolean
  cashBonus: number
  positions: SalePosition[]
}
interface Summary {
  revenue: number
  cashMoney: number
  cashBank: number
  refund: number
  margin: number
  cashBonus: number
  withMargin: number
  withoutPositions: number
  retailPriceSold: number
  returns: number
  count: number
}
interface Shop    { id: string; name: string }
interface Session { name: string; role: 'MANAGER' | 'ADMIN'; shopId: string | null }

const MONTH_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
const MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`
}
function fmtMoney(n: number) {
  if (n === 0) return '—'
  return n.toLocaleString('ru-RU') + ' ₽'
}

export default function SalesPage() {
  const now = new Date()
  const emptySummary: Summary = { revenue: 0, cashMoney: 0, cashBank: 0, refund: 0, margin: 0, cashBonus: 0, withMargin: 0, withoutPositions: 0, retailPriceSold: 0, returns: 0, count: 0 }
  const [session,  setSession]  = useState<Session | null>(null)
  const [sales,    setSales]    = useState<Sale[]>([])
  const [summary,  setSummary]  = useState<Summary>(emptySummary)
  const [sellers,  setSellers]  = useState<string[]>([])
  const [shops,    setShops]    = useState<Shop[]>([])
  const [paymentTypes, setPaymentTypes] = useState<string[]>([])
  const [total,    setTotal]    = useState(0)
  const [pages,    setPages]    = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const year = now.getFullYear()
  const [selMonth, setSelMonth] = useState(now.getMonth())
  const [periodMode, setPeriodMode] = useState<'month' | 'today' | 'yesterday' | 'custom'>('month')
  const [customFrom, setCustomFrom] = useState<string | null>(null)
  const [customTo, setCustomTo] = useState<string | null>(null)
  const [page,     setPage]     = useState(1)
  const [search,   setSearch]   = useState('')
  const [seller,   setSeller]   = useState('')
  const [shop,     setShop]     = useState('')
  const [paymentType, setPaymentType] = useState('')
  const [positionMode, setPositionMode] = useState<'all' | 'with' | 'without'>('all')

  const todayISO     = toISO(new Date())
  const yesterdayISO = toISO(new Date(Date.now() - 86400000))
  const monthFrom = toISO(new Date(year, selMonth, 1))
  const monthTo = toISO(new Date(year, selMonth + 1, 0))
  const from = periodMode === 'today' ? todayISO
    : periodMode === 'yesterday' ? yesterdayISO
    : periodMode === 'custom' ? (customFrom ?? todayISO)
    : monthFrom
  const to = periodMode === 'today' ? todayISO
    : periodMode === 'yesterday' ? yesterdayISO
    : periodMode === 'custom' ? (customTo ?? todayISO)
    : monthTo

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(setSession)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        from, to: `${to}T23:59:59`,
        page: String(page),
        ...(search && { search }),
        ...(seller && { seller }),
        ...(shop && { shop }),
        ...(paymentType && { paymentType }),
        positionMode,
      })
      const res = await fetch(`/api/sales?${params}`)
      if (res.ok) {
        const d = await res.json()
        setSales(d.sales ?? [])
        setSummary(d.summary ?? emptySummary)
        setSellers(d.sellers ?? [])
        setShops(d.shops ?? [])
        setPaymentTypes(d.paymentTypes ?? [])
        setTotal(d.total ?? 0)
        setPages(d.pages ?? 1)
      }
    } finally {
      setLoading(false)
    }
  }, [from, to, page, search, seller, shop, paymentType, positionMode])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1); setExpanded(new Set()) }, [from, to, search, seller, shop, paymentType, positionMode])

  const isAdmin = session?.role === 'ADMIN'
  const avgCheck = summary.count > 0 ? Math.round(summary.revenue / summary.count) : 0
  const hasExtraFilters = search || seller || shop || paymentType || positionMode !== 'all'

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function changeMonth(delta: number) {
    const d = new Date(year, selMonth + delta, 1)
    setSelMonth(d.getMonth()); setPeriodMode('month'); setPage(1)
  }

  function selectQuickPeriod(mode: 'month' | 'today' | 'yesterday') {
    setPeriodMode(mode)
    setCustomFrom(null)
    setCustomTo(null)
    setPage(1)
  }

  function resetFilters() {
    setSearch('')
    setSeller('')
    setShop('')
    setPaymentType('')
    setPositionMode('all')
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] overflow-hidden bg-white md:h-screen">
      <div className="shrink-0 border-b border-gray-100 px-4 pt-2.5 pb-2">
        <div className="flex items-center gap-2 pb-2 flex-wrap">
          <h1 className="font-semibold text-gray-900 text-sm shrink-0">Продажи</h1>

          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Номер, продавец..."
            className="order-last w-full px-2.5 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] md:order-none md:ml-auto md:w-56"/>

          {loading && <span className="text-xs text-gray-400 shrink-0">Загрузка...</span>}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => changeMonth(-1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <select value={selMonth} onChange={e => { setSelMonth(+e.target.value); setPage(1) }}
              className="text-sm font-semibold text-gray-800 border-none outline-none bg-transparent cursor-pointer">
              {MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <span className="text-sm font-semibold text-gray-800">{year}</span>
            <button onClick={() => changeMonth(1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>

          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => selectQuickPeriod('month')}
              className={`px-2 py-0.5 rounded-md text-xs font-medium ${periodMode === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Месяц</button>
            <button onClick={() => selectQuickPeriod('today')}
              className={`px-2 py-0.5 rounded-md text-xs font-medium ${periodMode === 'today' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Сегодня</button>
            <button onClick={() => selectQuickPeriod('yesterday')}
              className={`px-2 py-0.5 rounded-md text-xs font-medium ${periodMode === 'yesterday' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Вчера</button>
          </div>

          {periodMode === 'custom' && (
            <div className="flex items-center gap-1">
              <input type="date" value={customFrom ?? todayISO} onChange={e => setCustomFrom(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg border border-gray-200"/>
              <input type="date" value={customTo ?? todayISO} onChange={e => setCustomTo(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg border border-gray-200"/>
            </div>
          )}
          <button onClick={() => setPeriodMode('custom')}
            className={`px-2 py-1 rounded-lg text-xs border ${periodMode === 'custom' ? 'border-[#FFD600] bg-yellow-50 text-gray-900' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            Период
          </button>

          <div className="hidden lg:flex gap-1">
            {MONTH_SHORT.map((m, i) => (
              <button key={i} onClick={() => { setSelMonth(i); setPeriodMode('month'); setPage(1) }}
                className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                  periodMode === 'month' && selMonth === i
                    ? 'bg-[#FFD600] text-black'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}>{m}</button>
            ))}
          </div>

          {sellers.length > 0 && (
            <select value={seller} onChange={e => { setSeller(e.target.value); setPage(1) }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
              <option value="">Продавец</option>
              {sellers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          {isAdmin && shops.length > 0 && (
            <select value={shop} onChange={e => { setShop(e.target.value); setPage(1) }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
              <option value="">Салон</option>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          {paymentTypes.length > 0 && (
            <select value={paymentType} onChange={e => { setPaymentType(e.target.value); setPage(1) }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
              <option value="">Оплата</option>
              {paymentTypes.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          <select value={positionMode} onChange={e => { setPositionMode(e.target.value as typeof positionMode); setPage(1) }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
            <option value="all">Позиции</option>
            <option value="with">С позициями</option>
            <option value="without">Без позиций</option>
          </select>

          {hasExtraFilters && (
            <button onClick={resetFilters} className="ml-auto text-xs text-gray-400 hover:text-gray-700 px-2 py-1">
              Сбросить
            </button>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="flex-none px-4 py-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 border-b border-gray-100 bg-white">
        <KpiCard label="Выручка"     value={fmtMoney(summary.revenue)}   accent />
        <KpiCard label="Маржа"       value={fmtMoney(summary.margin)} />
        <KpiCard label="Нал"         value={fmtMoney(summary.cashMoney)} />
        <KpiCard label="Безнал"      value={fmtMoney(summary.cashBank)}  />
        <KpiCard label="Продаж"      value={String(summary.count)} />
        <KpiCard label="Средний чек" value={fmtMoney(avgCheck)} />
        <KpiCard label="Бонус нал"   value={fmtMoney(summary.cashBonus)} />
        <KpiCard label="По РЦ"       value={String(summary.retailPriceSold)} />
      </div>

      {/* Таблица */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Загрузка…</div>
        ) : sales.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Продаж за период не найдено</div>
        ) : (
          <table className="w-full min-w-[860px] text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="text-gray-400 text-left">
                <th className="px-4 py-2.5 font-medium w-16">Дата</th>
                <th className="px-4 py-2.5 font-medium w-24">Номер</th>
                <th className="px-4 py-2.5 font-medium">Продавец</th>
                {isAdmin && <th className="px-4 py-2.5 font-medium">Салон</th>}
                <th className="px-4 py-2.5 font-medium w-24">Оплата</th>
                <th className="px-4 py-2.5 font-medium text-right w-24">Итого</th>
                <th className="px-4 py-2.5 font-medium text-right w-24">Маржа</th>
                <th className="px-4 py-2.5 font-medium text-right w-24">Бонусы</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {sales.map(s => {
                const isOpen = expanded.has(s.id)
                const costTotal = s.costTotal ?? s.positions.reduce((sum, p) => sum + p.purchasePriceSumm, 0)
                const margin    = s.margin
                return (
                  <Fragment key={s.id}>
                    <tr
                      onClick={() => s.positions.length > 0 && toggleExpand(s.id)}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${s.positions.length > 0 ? 'cursor-pointer' : ''}`}>
                      <td className="px-4 py-2.5 text-gray-400">{fmtDate(s.date)}</td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono">{s.number ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {s.sellerName
                          ? <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium">{s.sellerName}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      {isAdmin && <td className="px-4 py-2.5 text-gray-500 max-w-[120px] truncate">{s.shop.name}</td>}
                      <td className="px-4 py-2.5 text-gray-500">
                        {s.paymentType ?? '—'}
                        <div className="text-[10px] text-gray-300">
                          {s.cashMoney > 0 && <span>Нал {fmtMoney(s.cashMoney)}</span>}
                          {s.cashMoney > 0 && s.cashBank > 0 && <span> · </span>}
                          {s.cashBank > 0 && <span>Безнал {fmtMoney(s.cashBank)}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                        {fmtMoney(s.revenue)}
                        {s.refund > 0 && <div className="text-[10px] text-red-400 font-normal">−{fmtMoney(s.refund)}</div>}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${margin === null ? 'text-gray-300' : margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {margin === null ? '—' : fmtMoney(margin)}
                        {s.retailPriceSold && <div className="text-[10px] text-amber-600 font-normal">РЦ</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {s.cashBonus > 0 ? <div className="text-[10px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 inline-block">Нал {fmtMoney(s.cashBonus)}</div> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-300">
                        {s.positions.length > 0 && (
                          <span className="text-[10px]">{isOpen ? '▲' : '▼'}</span>
                        )}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={`${s.id}-detail`} className="bg-blue-50/30">
                        <td colSpan={isAdmin ? 9 : 8} className="px-6 py-3">
                          <table className="w-full min-w-[620px] text-xs">
                            <thead>
                              <tr className="text-gray-400">
                                <th className="text-left py-1 font-medium">Наименование</th>
                                <th className="text-right py-1 font-medium w-16">Кол-во</th>
                                <th className="text-right py-1 font-medium w-24">РЦ</th>
                                <th className="text-right py-1 font-medium w-24">Продано</th>
                                <th className="text-right py-1 font-medium w-24">Себест.</th>
                                <th className="text-right py-1 font-medium w-24">Маржа</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.positions.map(p => {
                                const posMargin = p.soldPrice * p.count - p.purchasePriceSumm
                                return (
                                  <tr key={p.id} className="border-t border-blue-100">
                                    <td className="py-1.5 text-gray-700">
                                      <span className={`mr-1.5 text-[9px] px-1 py-0.5 rounded font-medium ${p.isWork ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                                        {p.isWork ? 'Услуга' : 'Товар'}
                                      </span>
                                      {p.name}
                                    </td>
                                    <td className="py-1.5 text-right text-gray-500">{p.count}</td>
                                    <td className="py-1.5 text-right text-gray-400">{fmtMoney(p.price * p.count)}</td>
                                    <td className="py-1.5 text-right text-gray-700">{fmtMoney(p.soldPrice * p.count)}</td>
                                    <td className="py-1.5 text-right text-gray-400">{p.purchasePriceSumm > 0 ? fmtMoney(p.purchasePriceSumm) : '—'}</td>
                                    <td className={`py-1.5 text-right font-medium ${posMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                      {p.purchasePriceSumm > 0 ? fmtMoney(posMargin) : '—'}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            {margin !== null && (
                              <tfoot>
                                <tr className="border-t border-blue-200">
                                  <td colSpan={4} className="pt-1.5 text-gray-500 font-medium">Итого</td>
                                  <td className="pt-1.5 text-right text-gray-500">{fmtMoney(costTotal)}</td>
                                  <td className={`pt-1.5 text-right font-bold ${margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {fmtMoney(margin)}
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Пагинация */}
      {pages > 1 && (
        <div className="flex-none border-t border-gray-100 bg-white px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-gray-400">{total} продаж</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50">←</button>
            <span className="px-3 py-1 text-xs text-gray-600">{page} / {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
              className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50">→</button>
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, accent, red }: { label: string; value: string; accent?: boolean; red?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? 'bg-[#FFD600]' : 'bg-gray-50'}`}>
      <div className={`text-[11px] font-medium mb-0.5 ${accent ? 'text-black/60' : 'text-gray-500'}`}>{label}</div>
      <div className={`text-sm font-bold ${accent ? 'text-black' : red ? 'text-red-500' : 'text-gray-800'}`}>{value}</div>
    </div>
  )
}
