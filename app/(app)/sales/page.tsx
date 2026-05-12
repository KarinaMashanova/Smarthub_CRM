'use client'

import { useState, useEffect, useCallback } from 'react'

interface SalePosition {
  id: string; name: string; isWork: boolean
  soldPrice: number; count: number; purchasePriceSumm: number
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
  positions: SalePosition[]
}
interface Summary { revenue: number; cashMoney: number; cashBank: number; refund: number; count: number }
interface Shop    { id: string; name: string }
interface Session { name: string; role: 'MANAGER' | 'ADMIN'; shopId: string | null }

const MONTH_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
const MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const AVAILABLE_YEARS = [2024, 2025, 2026]

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
  const [session,  setSession]  = useState<Session | null>(null)
  const [sales,    setSales]    = useState<Sale[]>([])
  const [summary,  setSummary]  = useState<Summary>({ revenue: 0, cashMoney: 0, cashBank: 0, refund: 0, count: 0 })
  const [sellers,  setSellers]  = useState<string[]>([])
  const [shops,    setShops]    = useState<Shop[]>([])
  const [total,    setTotal]    = useState(0)
  const [pages,    setPages]    = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [selYear,  setSelYear]  = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth())
  const [page,     setPage]     = useState(1)
  const [search,   setSearch]   = useState('')
  const [seller,   setSeller]   = useState('')
  const [shop,     setShop]     = useState('')

  const from = toISO(new Date(selYear, selMonth, 1))
  const to   = toISO(new Date(selYear, selMonth + 1, 0))

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
        ...(shop   && { shop }),
      })
      const res = await fetch(`/api/sales?${params}`)
      if (res.ok) {
        const d = await res.json()
        setSales(d.sales ?? [])
        setSummary(d.summary ?? { revenue: 0, cashMoney: 0, cashBank: 0, refund: 0, count: 0 })
        setSellers(d.sellers ?? [])
        setShops(d.shops ?? [])
        setTotal(d.total ?? 0)
        setPages(d.pages ?? 1)
      }
    } finally {
      setLoading(false)
    }
  }, [from, to, page, search, seller, shop])

  useEffect(() => { load() }, [load])

  const isAdmin = session?.role === 'ADMIN'
  const avgCheck = summary.count > 0 ? Math.round(summary.revenue / summary.count) : 0

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function changeMonth(delta: number) {
    const d = new Date(selYear, selMonth + delta, 1)
    setSelYear(d.getFullYear()); setSelMonth(d.getMonth()); setPage(1)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Шапка */}
      <div className="flex-none px-4 py-3 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Навигация по месяцам */}
          <div className="flex items-center gap-1">
            <button onClick={() => changeMonth(-1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <select value={selMonth} onChange={e => { setSelMonth(+e.target.value); setPage(1) }}
              className="text-sm font-semibold text-gray-800 border-none outline-none bg-transparent cursor-pointer">
              {MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={selYear} onChange={e => { setSelYear(+e.target.value); setPage(1) }}
              className="text-sm font-semibold text-gray-800 border-none outline-none bg-transparent cursor-pointer">
              {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => changeMonth(1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>

          {/* Быстрые месяцы */}
          <div className="hidden sm:flex gap-1">
            {MONTH_SHORT.map((m, i) => (
              <button key={i} onClick={() => { setSelMonth(i); setPage(1) }}
                className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                  selMonth === i && selYear === now.getFullYear()
                    ? 'bg-[#FFD600] text-black'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}>{m}</button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Поиск..."
                className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300 w-40" />
            </div>

            {sellers.length > 0 && (
              <select value={seller} onChange={e => { setSeller(e.target.value); setPage(1) }}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                <option value="">Все продавцы</option>
                {sellers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}

            {isAdmin && shops.length > 0 && (
              <select value={shop} onChange={e => { setShop(e.target.value); setPage(1) }}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                <option value="">Все салоны</option>
                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="flex-none px-4 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3 border-b border-gray-100 bg-white">
        <KpiCard label="Выручка"     value={fmtMoney(summary.revenue)}   accent />
        <KpiCard label="Нал"         value={fmtMoney(summary.cashMoney)} />
        <KpiCard label="Безнал"      value={fmtMoney(summary.cashBank)}  />
        <KpiCard label="Продаж"      value={String(summary.count)} />
        <KpiCard label="Средний чек" value={fmtMoney(avgCheck)} />
      </div>

      {/* Таблица */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Загрузка…</div>
        ) : sales.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Продаж за период не найдено</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="text-gray-400 text-left">
                <th className="px-4 py-2.5 font-medium w-16">Дата</th>
                <th className="px-4 py-2.5 font-medium w-24">Номер</th>
                <th className="px-4 py-2.5 font-medium">Продавец</th>
                {isAdmin && <th className="px-4 py-2.5 font-medium">Салон</th>}
                <th className="px-4 py-2.5 font-medium w-20">Нал</th>
                <th className="px-4 py-2.5 font-medium w-20">Безнал</th>
                <th className="px-4 py-2.5 font-medium text-right w-24">Итого</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {sales.map(s => {
                const isOpen = expanded.has(s.id)
                const costTotal = s.positions.reduce((sum, p) => sum + p.purchasePriceSumm, 0)
                const margin    = s.positions.length > 0 ? s.revenue - costTotal : null
                return (
                  <>
                    <tr key={s.id}
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
                      <td className="px-4 py-2.5 text-emerald-600 font-medium">{s.cashMoney > 0 ? fmtMoney(s.cashMoney) : <span className="text-gray-200">—</span>}</td>
                      <td className="px-4 py-2.5 text-blue-600 font-medium">{s.cashBank > 0 ? fmtMoney(s.cashBank) : <span className="text-gray-200">—</span>}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                        {fmtMoney(s.revenue)}
                        {s.refund > 0 && <div className="text-[10px] text-red-400 font-normal">−{fmtMoney(s.refund)}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-300">
                        {s.positions.length > 0 && (
                          <span className="text-[10px]">{isOpen ? '▲' : '▼'}</span>
                        )}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={`${s.id}-detail`} className="bg-blue-50/30">
                        <td colSpan={isAdmin ? 8 : 7} className="px-6 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400">
                                <th className="text-left py-1 font-medium">Наименование</th>
                                <th className="text-right py-1 font-medium w-16">Кол-во</th>
                                <th className="text-right py-1 font-medium w-24">Цена</th>
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
                                  <td colSpan={3} className="pt-1.5 text-gray-500 font-medium">Итого</td>
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
                  </>
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
