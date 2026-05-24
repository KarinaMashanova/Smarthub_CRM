'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { HelpModal } from '../components/HelpModal'

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

const HELP_ITEMS = [
  { label: 'Синхронизация', desc: 'Продажи обновляются из LiveSklad по расписанию каждые 15 минут.' },
  { label: 'Период', desc: 'Фильтрация ведётся по дате продажи.' },
  { label: 'Маржа', desc: 'Маржа = выручка − себестоимость позиций. Считается только по продажам с загруженными позициями.' },
  { label: 'Бонус за наличность', desc: 'Создаётся авто-бонус 2,5% от маржи, если продажа оплачена только наличными.' },
  { label: 'По РЦ', desc: 'Продажа по розничной цене — продажа без скидки относительно прайса.' },
]

export default function SalesPage() {
  const now = new Date()
  const emptySummary: Summary = { revenue: 0, cashMoney: 0, cashBank: 0, refund: 0, margin: 0, cashBonus: 0, withMargin: 0, withoutPositions: 0, retailPriceSold: 0, returns: 0, count: 0 }

  const [session,      setSession]      = useState<Session | null>(null)
  const [sales,        setSales]        = useState<Sale[]>([])
  const [summary,      setSummary]      = useState<Summary>(emptySummary)
  const [sellers,      setSellers]      = useState<string[]>([])
  const [shops,        setShops]        = useState<Shop[]>([])
  const [paymentTypes, setPaymentTypes] = useState<string[]>([])
  const [total,        setTotal]        = useState(0)
  const [pages,        setPages]        = useState(1)
  const [loading,      setLoading]      = useState(true)
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())
  const [view,         setView]         = useState<'list' | 'stats'>('list')
  const [showHelp,     setShowHelp]     = useState(false)

  const year = now.getFullYear()
  const [selMonth,    setSelMonth]    = useState(now.getMonth())
  const [periodMode,  setPeriodMode]  = useState<'month' | 'today' | 'yesterday' | 'custom'>('month')
  const [customFrom,  setCustomFrom]  = useState<string | null>(null)
  const [customTo,    setCustomTo]    = useState<string | null>(null)
  const [page,        setPage]        = useState(1)
  const [search,      setSearch]      = useState('')
  const [seller,      setSeller]      = useState('')
  const [shop,        setShop]        = useState('')
  const [paymentType, setPaymentType] = useState('')
  const [positionMode, setPositionMode] = useState<'all' | 'with' | 'without'>('all')

  const todayISO     = toISO(new Date())
  const yesterdayISO = toISO(new Date(Date.now() - 86400000))
  const monthFrom = toISO(new Date(year, selMonth, 1))
  const monthTo   = toISO(new Date(year, selMonth + 1, 0))
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
      const params = new URLSearchParams({
        from, to: `${to}T23:59:59`,
        page: String(page),
        ...(search      && { search }),
        ...(seller      && { seller }),
        ...(shop        && { shop }),
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

  function selectQuickPeriod(mode: 'month' | 'today' | 'yesterday') {
    setPeriodMode(mode); setCustomFrom(null); setCustomTo(null); setPage(1)
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const isAdmin  = session?.role === 'ADMIN'
  const avgCheck = summary.count > 0 ? Math.round(summary.revenue / summary.count) : 0

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] overflow-hidden bg-white md:h-screen">

      {/* Top bar */}
      <div className="shrink-0 border-b border-gray-100 px-4 pt-2.5 pb-2">

        {/* Ряд 1: заголовок + переключатель + поиск + справка */}
        <div className="flex items-center gap-2 pb-2 flex-wrap">
          <h1 className="font-semibold text-gray-900 text-sm shrink-0">Продажи</h1>

          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(['list', 'stats'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${
                  view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {v === 'list' ? 'Список' : 'Статистика'}
              </button>
            ))}
          </div>

          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Номер, продавец..."
            className="order-last w-full px-2.5 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] md:order-none md:ml-auto md:w-56"/>

          {loading && <span className="text-xs text-gray-400 shrink-0">Загрузка...</span>}

          <button onClick={() => setShowHelp(true)} title="Справка"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M6 5.8C6 4.8 7.5 4.5 7.5 5.8c0 .8-1 1-1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="7.5" cy="10.5" r=".6" fill="currentColor"/></svg>
          </button>
        </div>

        {/* Ряд 2: период */}
        <div className="flex items-center gap-1.5 pb-2 flex-wrap">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {([
              ['month',     'Месяц'],
              ['today',     'Сегодня'],
              ['yesterday', 'Вчера'],
              ['custom',    'Период'],
            ] as const).map(([mode, label]) => (
              <button key={mode} onClick={() => {
                if (mode === 'custom') { setPeriodMode('custom'); setCustomFrom(from); setCustomTo(to) }
                else selectQuickPeriod(mode)
              }}
                className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${
                  periodMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {periodMode === 'month' ? (
            <select value={selMonth} onChange={e => { setSelMonth(Number(e.target.value)); selectQuickPeriod('month') }}
              className="px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
              {MONTH_SHORT.map((m, i) => <option key={m} value={i}>{m} {year}</option>)}
            </select>
          ) : periodMode === 'custom' ? (
            <>
              <input type="date" value={customFrom ?? todayISO} onChange={e => { setPeriodMode('custom'); setCustomFrom(e.target.value) }}
                className="px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
              <span className="text-xs text-gray-400">—</span>
              <input type="date" value={customTo ?? todayISO} onChange={e => { setPeriodMode('custom'); setCustomTo(e.target.value) }}
                className="px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
            </>
          ) : (
            <span className="px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-500">
              {periodMode === 'today' ? todayISO : yesterdayISO}
            </span>
          )}

          <span className="ml-auto text-xs text-gray-400 self-center">{total.toLocaleString('ru-RU')} продаж</span>
        </div>

        {/* Ряд 3: фильтры */}
        <div className="bg-gray-50 rounded-lg px-2 py-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={seller} onChange={e => { setSeller(e.target.value); setPage(1) }}
              className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] max-w-[140px]">
              <option value="">Продавец</option>
              {sellers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {isAdmin && (
              <select value={shop} onChange={e => { setShop(e.target.value); setPage(1) }}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] max-w-[140px]">
                <option value="">Салон</option>
                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}

            <select value={paymentType} onChange={e => { setPaymentType(e.target.value); setPage(1) }}
              className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] max-w-[130px]">
              <option value="">Оплата</option>
              {paymentTypes.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            <select value={positionMode} onChange={e => { setPositionMode(e.target.value as typeof positionMode); setPage(1) }}
              className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] max-w-[130px]">
              <option value="all">Позиции</option>
              <option value="with">С позициями</option>
              <option value="without">Без позиций</option>
            </select>
          </div>
        </div>
      </div>

      {/* Статистика */}
      {view === 'stats' && (
        <div className="shrink-0 border-b border-gray-100 px-4 py-3 bg-gray-50">
          <div className="grid grid-cols-4 xl:grid-cols-8 gap-2">
            {[
              { label: 'Продаж',      value: String(summary.count),               color: 'text-gray-800' },
              { label: 'Выручка',     value: fmtMoney(summary.revenue),           color: 'text-green-700' },
              { label: 'Маржа',       value: fmtMoney(summary.margin),            color: 'text-blue-700' },
              { label: 'Средний чек', value: fmtMoney(avgCheck),                  color: 'text-sky-700' },
              { label: 'Нал',         value: fmtMoney(summary.cashMoney),         color: 'text-gray-700' },
              { label: 'Безнал',      value: fmtMoney(summary.cashBank),          color: 'text-gray-700' },
              { label: 'Бонус нал',   value: fmtMoney(summary.cashBonus),         color: 'text-emerald-700' },
              { label: 'По РЦ',       value: String(summary.retailPriceSold),     color: 'text-amber-600' },
            ].map(k => (
              <div key={k.label} className="bg-white border border-gray-100 rounded-lg px-2.5 py-2 shadow-sm">
                <p className="text-[10px] text-gray-400">{k.label}</p>
                <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Таблица */}
      <div className="flex-1 overflow-auto">
        {loading && sales.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">Загрузка...</div>
        ) : sales.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Продаж за период не найдено</div>
        ) : (
          <table className="w-full min-w-[860px] text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-2 py-2.5 font-medium text-gray-500 w-6"></th>
                <th className="px-2 py-2.5 font-medium text-gray-500 w-16">Дата</th>
                <th className="px-2 py-2.5 font-medium text-gray-500 w-24">Номер</th>
                <th className="px-2 py-1.5 font-medium text-gray-500">
                  {isAdmin ? (
                    <select value={seller} onChange={e => { setSeller(e.target.value); setPage(1) }}
                      onClick={e => e.stopPropagation()}
                      className="w-full h-6 px-1.5 text-[11px] rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#FFD600]">
                      <option value="">Продавец</option>
                      {sellers.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : 'Продавец'}
                </th>
                {isAdmin && (
                  <th className="px-2 py-1.5 font-medium text-gray-500 w-28">
                    <select value={shop} onChange={e => { setShop(e.target.value); setPage(1) }}
                      onClick={e => e.stopPropagation()}
                      className="w-full h-6 px-1.5 text-[11px] rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#FFD600]">
                      <option value="">Салон</option>
                      {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </th>
                )}
                <th className="px-2 py-1.5 font-medium text-gray-500 w-24">
                  <select value={paymentType} onChange={e => { setPaymentType(e.target.value); setPage(1) }}
                    onClick={e => e.stopPropagation()}
                    className="w-full h-6 px-1.5 text-[11px] rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#FFD600]">
                    <option value="">Оплата</option>
                    {paymentTypes.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </th>
                <th className="px-2 py-2.5 font-medium text-gray-500 w-24 text-right">Итого</th>
                <th className="px-2 py-2.5 font-medium text-gray-500 w-24 text-right">Маржа</th>
                <th className="px-2 py-2.5 font-medium text-gray-500 w-24 text-right">Бонусы</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s, i) => {
                const isOpen    = expanded.has(s.id)
                const costTotal = s.costTotal ?? s.positions.reduce((sum, p) => sum + p.purchasePriceSumm, 0)
                const margin    = s.margin
                return (
                  <Fragment key={s.id}>
                    <tr
                      onClick={() => toggleExpand(s.id)}
                      className={`border-b border-gray-100 cursor-pointer transition-colors ${
                        isOpen ? 'bg-yellow-50/60' : i % 2 === 1 ? 'bg-gray-50/30 hover:bg-yellow-50/30' : 'hover:bg-yellow-50/30'
                      }`}>

                      <td className="px-2 py-2 text-gray-300 text-center select-none">
                        {isOpen ? '▾' : '▸'}
                      </td>
                      <td className="px-2 py-2 text-gray-400">{fmtDate(s.date)}</td>
                      <td className="px-2 py-2 text-gray-500 font-mono">{s.number ?? '—'}</td>
                      <td className="px-2 py-2 text-gray-600">
                        {s.sellerName
                          ? <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium">{s.sellerName}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      {isAdmin && <td className="px-2 py-2 text-gray-500 max-w-[112px] truncate">{s.shop.name}</td>}
                      <td className="px-2 py-2 text-gray-500">
                        {s.paymentType ?? '—'}
                        <div className="text-[10px] text-gray-300">
                          {s.cashMoney > 0 && <span>Нал {fmtMoney(s.cashMoney)}</span>}
                          {s.cashMoney > 0 && s.cashBank > 0 && <span> · </span>}
                          {s.cashBank > 0 && <span>Безнал {fmtMoney(s.cashBank)}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-gray-800">
                        {fmtMoney(s.revenue)}
                        {s.refund > 0 && <div className="text-[10px] text-rose-600 font-medium">−{fmtMoney(s.refund)}</div>}
                      </td>
                      <td className={`px-2 py-2 text-right font-semibold ${margin === null ? 'text-gray-300' : margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {margin === null ? '—' : fmtMoney(margin)}
                        {s.retailPriceSold && <div className="text-[10px] text-amber-600 font-normal">РЦ</div>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {s.cashBonus > 0
                          ? <span className="text-[10px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 whitespace-nowrap">Нал +{fmtMoney(s.cashBonus)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-yellow-50/40 border-b border-yellow-100">
                        <td colSpan={isAdmin ? 9 : 8} className="px-8 py-3">
                          {s.positions.length === 0 ? (
                            <p className="text-xs text-gray-400">Позиции не загружены</p>
                          ) : (
                            <div className="max-w-xl">
                              <table className="w-full min-w-[620px] text-xs mb-2">
                                <thead>
                                  <tr className="text-gray-400 border-b border-gray-200">
                                    <th className="text-left py-1 font-medium">Наименование</th>
                                    <th className="text-left py-1 font-medium w-16">Тип</th>
                                    <th className="text-right py-1 font-medium w-8">Кол.</th>
                                    <th className="text-right py-1 font-medium w-24">РЦ</th>
                                    <th className="text-right py-1 font-medium w-24">Продано</th>
                                    <th className="text-right py-1 font-medium w-24">Себест.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.positions.map(p => (
                                    <tr key={p.id} className="border-b border-gray-100">
                                      <td className="py-1.5 text-gray-800">{p.name}</td>
                                      <td className="py-1.5">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${p.isWork ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                          {p.isWork ? 'Услуга' : 'Товар'}
                                        </span>
                                      </td>
                                      <td className="py-1.5 text-right text-gray-500">{p.count}</td>
                                      <td className="py-1.5 text-right text-gray-400">{fmtMoney(p.price * p.count)}</td>
                                      <td className="py-1.5 text-right text-gray-700">{fmtMoney(p.soldPrice * p.count)}</td>
                                      <td className="py-1.5 text-right text-gray-400">{p.purchasePriceSumm > 0 ? fmtMoney(p.purchasePriceSumm) : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                {margin !== null && (
                                  <tfoot>
                                    <tr className="border-t border-gray-200">
                                      <td colSpan={4} className="pt-1.5 text-gray-500 font-medium">Итого</td>
                                      <td className="pt-1.5 text-right text-gray-500">{fmtMoney(costTotal)}</td>
                                      <td className={`pt-1.5 text-right font-bold ${margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {fmtMoney(margin)}
                                      </td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          )}
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

      {showHelp && (
        <HelpModal
          title="Продажи — справка"
          color="bg-blue-50 border-blue-100"
          dot="bg-blue-400"
          items={HELP_ITEMS}
          onClose={() => setShowHelp(false)}
        />
      )}

      {/* Пагинация */}
      {pages > 1 && (
        <div className="shrink-0 border-t border-gray-100 px-4 py-2 flex items-center justify-between">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40">← Назад</button>
          <span className="text-xs text-gray-400">Стр. {page} из {pages} · {total.toLocaleString('ru-RU')} продаж</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
            className="px-3 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40">Вперёд →</button>
        </div>
      )}
    </div>
  )
}
