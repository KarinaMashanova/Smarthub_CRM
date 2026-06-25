'use client'

import { useState, useEffect, useCallback } from 'react'
import { HelpModal } from '../components/HelpModal'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

const HELP_ITEMS = [
  { label: 'Источник', desc: 'Заказы — сервисные заказы. Продажи — розничные продажи. Все — совместно.' },
  { label: 'Маржа', desc: 'Маржа = выручка минус себестоимость. Возвраты и удалённые записи не участвуют.' },
  { label: 'ВМР', desc: 'Высокомаржинальный ремонт — заказ с маржей от 5 000 ₽.' },
  { label: 'Тепловая карта', desc: 'Выручка или маржа каждого салона за каждый день. Цвет — интенсивность относительно максимума.' },
  { label: 'Группы', desc: 'Позиции из продаж, сгруппированные по каталогу и по названию. Настройки, гарантии и страховки идут обычными строками.' },
]

interface KPI {
  totalCount: number; totalRev: number; totalMargin: number; totalSalary: number
  vimrCount: number; avgCheck: number; withMarginCount: number
}
interface DayData    { day: number; revenue: number; margin: number; count: number; salesRevenue: number; salesMargin: number }
interface ManagerRow {
  name: string
  orders: { count: number; revenue: number; margin: number; salary: number; vmr: number }
  sales: { count: number; revenue: number; margin: number }
  totalRevenue: number
  totalMargin: number
}
interface ShopSummaryRow {
  name: string
  orders: { count: number; revenue: number; margin: number }
  sales:  { count: number; revenue: number; margin: number }
  totalRev: number
}
interface TypeRow     { name: string; revenue: number }
interface PayRow {
  name: string
  orders: { count: number; revenue: number }
  sales: { count: number; revenue: number }
  totalCount: number
  totalRevenue: number
}
interface ProductGroupRow { name: string; count: number; revenue: number; margin: number }
interface ShopDayRow  { name: string; total: { revenue: number; margin: number }; days: { day: number; revenue: number; margin: number }[] }

const MONTHS          = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const AVAILABLE_YEARS = [2025, 2026]

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmt(n: number) {
  if (n === 0) return '—'
  return n.toLocaleString('ru-RU') + ' ₽'
}
function fmtCell(n: number) {
  if (n === 0) return ''
  return Math.round(n).toLocaleString('ru-RU')
}
function cellCls(value: number, max: number, metric: 'revenue' | 'margin') {
  if (value === 0 || max === 0) return 'bg-white text-gray-300'
  const r = value / max
  if (metric === 'revenue') {
    if (r > 0.8) return 'bg-gray-200 text-gray-900 font-medium'
    if (r > 0.5) return 'bg-gray-100 text-gray-800'
    if (r > 0.2) return 'bg-gray-100 text-gray-700'
    return 'bg-gray-50 text-gray-500'
  } else {
    if (r > 0.8) return 'bg-gray-200 text-gray-900 font-medium'
    if (r > 0.5) return 'bg-gray-100 text-gray-800'
    if (r > 0.2) return 'bg-gray-100 text-gray-700'
    return 'bg-gray-50 text-gray-500'
  }
}

export default function ReportsPage() {
  const [now] = useState(() => new Date())
  const [periodMode, setPeriodMode] = useState<'month' | 'today' | 'yesterday' | 'custom'>('month')
  const [selYear,    setSelYear]    = useState(now.getFullYear())
  const [selMonth,   setSelMonth]   = useState(now.getMonth())
  const [customFrom, setCustomFrom] = useState<string | null>(null)
  const [customTo,   setCustomTo]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [view,          setView]          = useState<'dashboard' | 'heatmap' | 'managers' | 'payments' | 'products' | 'vmr'>('dashboard')
  const [source,        setSource]        = useState<'all' | 'orders' | 'sales'>('all')
  const [metric,        setMetric]        = useState<'revenue' | 'margin'>('revenue')
  const [showHelp,      setShowHelp]      = useState(false)

  const [kpi,            setKpi]            = useState<KPI | null>(null)
  const [byDay,          setByDay]          = useState<DayData[]>([])
  const [byManager,      setByManager]      = useState<ManagerRow[]>([])
  const [byShopSummary,  setByShopSummary]  = useState<ShopSummaryRow[]>([])
  const [byType,         setByType]         = useState<TypeRow[]>([])
  const [byPayment,      setByPayment]      = useState<PayRow[]>([])
  const [byProductGroup, setByProductGroup] = useState<ProductGroupRow[]>([])
  const [byShopByDay,    setByShopByDay]    = useState<ShopDayRow[]>([])

  const todayISO     = toISO(new Date())
  const yesterdayISO = toISO(new Date(now.getTime() - 86400000))
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/orders?from=${from}&to=${to}`)
      if (res.ok) {
        const d = await res.json()
        setKpi(d.kpi)
        setByDay(d.byDay ?? [])
        setByManager(d.byManager ?? [])
        setByShopSummary(d.byShopSummary ?? [])
        setByType(d.byType ?? [])
        setByPayment(d.byPayment ?? [])
        setByProductGroup(d.byProductGroup ?? [])
        setByShopByDay(d.byShopByDay ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [from, to])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  if (!kpi && !loading) return (
    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Нет данных</div>
  )

  // Compute source-filtered aggregates
  const salesRev    = byShopSummary.reduce((s, r) => s + r.sales.revenue, 0)
  const salesMargin = byShopSummary.reduce((s, r) => s + r.sales.margin, 0)
  const salesCount  = byShopSummary.reduce((s, r) => s + r.sales.count, 0)

  const kpiRev    = source === 'orders' ? (kpi?.totalRev ?? 0)    : source === 'sales' ? salesRev    : (kpi?.totalRev ?? 0) + salesRev
  const kpiMargin = source === 'orders' ? (kpi?.totalMargin ?? 0) : source === 'sales' ? salesMargin : (kpi?.totalMargin ?? 0) + salesMargin
  // Chart data keyed by source+metric
  const chartData = byDay.map(d => ({
    day: d.day,
    orders:    metric === 'revenue' ? d.revenue      : d.margin,
    sales:     metric === 'revenue' ? d.salesRevenue : (d.salesMargin ?? 0),
    combined:  metric === 'revenue' ? d.revenue + d.salesRevenue : d.margin + (d.salesMargin ?? 0),
  }))

  const pivotMax = byShopByDay.reduce((m, shop) =>
    Math.max(m, ...shop.days.map(d => metric === 'revenue' ? d.revenue : d.margin)), 0)

  const visibleProducts = byProductGroup
  const vmrManagers = byManager.filter(m => m.orders.vmr > 0).sort((a, b) => b.orders.vmr - a.orders.vmr || b.orders.margin - a.orders.margin)
  const currentDay = todayISO >= from && todayISO <= to ? now.getDate() : null

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)] overflow-hidden bg-white md:h-screen">
      {/* Шапка */}
      <div className="shrink-0 border-b border-gray-100 px-3 pt-2 pb-1.5 space-y-1.5">
        {/* Строка 1: заголовок + вкладки + источник + метрика + справка */}
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-semibold text-gray-900 text-sm shrink-0">Отчёты</h1>

          {/* Вкладки */}
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-wrap">
            {([
              ['dashboard','Дашборд'],
              ['heatmap','Карта'],
              ['managers','Менеджеры'],
              ['payments','Оплата'],
              ['products','Группы'],
              ['vmr','ВМР'],
            ] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Источник */}
          {view === 'dashboard' && (
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {([['all','Все'],['orders','Заказы'],['sales','Продажи']] as const).map(([s, label]) => (
                <button key={s} onClick={() => setSource(s)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                    source === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Метрика */}
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {([['revenue','Выручка'],['margin','Маржа']] as const).map(([m, label]) => (
              <button key={m} onClick={() => setMetric(m)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  metric === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <button onClick={() => setShowHelp(true)} title="Справка"
            className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M6 5.8C6 4.8 7.5 4.5 7.5 5.8c0 .8-1 1-1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="7.5" cy="10.5" r=".6" fill="currentColor"/></svg>
          </button>
        </div>

        {/* Строка 2: период */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {([['month','Месяц'],['today','Сегодня'],['yesterday','Вчера'],['custom','Период']] as const).map(([mode, label]) => (
              <button key={mode} onClick={() => {
                if (mode === 'custom') { setPeriodMode('custom'); setCustomFrom(from); setCustomTo(to) }
                else setPeriodMode(mode)
              }}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  periodMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {periodMode === 'month' ? (
            <>
              <select value={selYear} onChange={e => setSelYear(+e.target.value)}
                className="h-6 px-2 text-[11px] rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={selMonth} onChange={e => setSelMonth(+e.target.value)}
                className="h-6 px-2 text-[11px] rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </>
          ) : periodMode === 'custom' ? (
            <>
              <input type="date" value={customFrom ?? todayISO} onChange={e => setCustomFrom(e.target.value)}
                className="h-6 px-2 text-[11px] rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
              <span className="text-xs text-gray-400">—</span>
              <input type="date" value={customTo ?? todayISO} onChange={e => setCustomTo(e.target.value)}
                className="h-6 px-2 text-[11px] rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
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
        <div className="flex-1 overflow-y-auto p-3 space-y-3">

          {/* ── ДАШБОРД ── */}
          {view === 'dashboard' && (
            <>
              {/* KPI */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {source !== 'sales'  && <KpiCard label="Заказов"          value={kpi!.totalCount.toLocaleString('ru-RU')} sub={`ВМР: ${kpi!.vimrCount}`} />}
                {source !== 'orders' && <KpiCard label="Продаж"           value={salesCount.toLocaleString('ru-RU')} />}
                {source !== 'sales'  && <KpiCard label={metric === 'revenue' ? 'Выручка заказов' : 'Маржа заказов'}  value={metric === 'revenue' ? fmt(kpi!.totalRev)    : fmt(kpi!.totalMargin)} accent={true} />}
                {source !== 'orders' && <KpiCard label={metric === 'revenue' ? 'Выручка продаж'  : 'Маржа продаж'}   value={metric === 'revenue' ? fmt(salesRev)         : fmt(salesMargin)}      accent={true} />}
                {source === 'all'    && <KpiCard label={metric === 'revenue' ? 'Выручка итого'   : 'Маржа итого'}    value={metric === 'revenue' ? fmt(kpiRev)           : fmt(kpiMargin)}        accent={false} />}
                {source !== 'sales'  && <KpiCard label="Ср. чек"          value={fmt(kpi!.avgCheck)} />}
              </div>

              {/* График по дням */}
              <div className="bg-white rounded-lg border border-gray-100 p-3">
                <div className="text-xs font-medium text-gray-700 mb-2">Динамика по дням</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }}
                      tickFormatter={v => v >= 1_000_000 ? (v/1_000_000).toFixed(1)+'млн' : v >= 1000 ? Math.round(v/1000)+'тыс' : String(v)}
                      width={44} />
                    <Tooltip
                      formatter={(v, name) => [typeof v === 'number' ? fmt(v) : v, name === 'orders' ? 'Заказы' : name === 'sales' ? 'Продажи' : String(name)]}
                      labelFormatter={l => `День ${l}`}
                    />
                    {source === 'all' ? (
                      <>
                        <Legend formatter={n => n === 'orders' ? 'Заказы' : 'Продажи'} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="orders" name="orders" stackId="a" radius={[0,0,0,0]} fill={metric === 'revenue' ? '#3b82f6' : '#f59e0b'} />
                        <Bar dataKey="sales"  name="sales"  stackId="a" radius={[3,3,0,0]} fill={metric === 'revenue' ? '#93c5fd' : '#fcd34d'} />
                      </>
                    ) : source === 'orders' ? (
                      <Bar dataKey="orders" name="orders" radius={[3,3,0,0]} fill={metric === 'revenue' ? '#3b82f6' : '#f59e0b'} />
                    ) : (
                      <Bar dataKey="sales" name="sales" radius={[3,3,0,0]} fill={metric === 'revenue' ? '#93c5fd' : '#fcd34d'} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* По магазинам */}
              {(() => {
                const rows = byShopSummary
                const metricLabel = metric === 'revenue' ? 'Выручка' : 'Маржа'
                const ordVal = (r: ShopSummaryRow) => metric === 'revenue' ? r.orders.revenue : r.orders.margin
                const salVal = (r: ShopSummaryRow) => metric === 'revenue' ? r.sales.revenue  : r.sales.margin
                const totVal = (r: ShopSummaryRow) => ordVal(r) + salVal(r)
                const grandTotal = rows.reduce((s, r) =>
                  source === 'orders' ? s + ordVal(r) : source === 'sales' ? s + salVal(r) : s + totVal(r), 0)
                return (
                  <div className="bg-white rounded-lg border border-gray-100 overflow-x-auto">
                    <div className="px-2 py-1.5 border-b border-gray-50 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700">По магазинам</span>
                      <span className="text-xs text-gray-400 font-medium">{fmt(grandTotal)}</span>
                    </div>
                    <table className="w-full min-w-[360px] text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500">
                          <th className="text-left px-2 py-1.5 font-medium">Магазин</th>
                          {source !== 'sales'  && <th className="text-right px-2 py-1.5 font-medium">Заказов</th>}
                          {source !== 'sales'  && <th className="text-right px-2 py-1.5 font-medium">{metricLabel} заказов</th>}
                          {source !== 'orders' && <th className="text-right px-2 py-1.5 font-medium">Продаж</th>}
                          {source !== 'orders' && <th className="text-right px-2 py-1.5 font-medium">{metricLabel} продаж</th>}
                          {source === 'all'    && <th className="text-right px-2 py-1.5 font-medium bg-gray-50/80">Итого</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {rows.map(r => (
                          <tr key={r.name} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-800 font-medium truncate max-w-[160px]">{r.name}</td>
                            {source !== 'sales'  && <td className="px-3 py-1.5 text-right text-gray-400">{r.orders.count}</td>}
                            {source !== 'sales'  && <td className={`px-3 py-1.5 text-right ${metric === 'revenue' ? 'text-blue-600' : 'text-amber-600'}`}>{fmt(ordVal(r))}</td>}
                            {source !== 'orders' && <td className="px-3 py-1.5 text-right text-gray-400">{r.sales.count}</td>}
                            {source !== 'orders' && <td className={`px-3 py-1.5 text-right ${metric === 'revenue' ? 'text-blue-500' : 'text-amber-500'}`}>{fmt(salVal(r))}</td>}
                            {source === 'all'    && <td className={`px-3 py-1.5 text-right font-semibold ${metric === 'revenue' ? 'text-blue-700' : 'text-amber-700'}`}>{fmt(totVal(r))}</td>}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                          <td className="px-3 py-1.5 text-gray-700">Итого</td>
                          {source !== 'sales'  && <td className="px-3 py-1.5 text-right text-gray-400">{rows.reduce((s,r)=>s+r.orders.count,0)}</td>}
                          {source !== 'sales'  && <td className={`px-3 py-1.5 text-right ${metric === 'revenue' ? 'text-blue-600' : 'text-amber-600'}`}>{fmt(rows.reduce((s,r)=>s+ordVal(r),0))}</td>}
                          {source !== 'orders' && <td className="px-3 py-1.5 text-right text-gray-400">{rows.reduce((s,r)=>s+r.sales.count,0)}</td>}
                          {source !== 'orders' && <td className={`px-3 py-1.5 text-right ${metric === 'revenue' ? 'text-blue-500' : 'text-amber-500'}`}>{fmt(rows.reduce((s,r)=>s+salVal(r),0))}</td>}
                          {source === 'all'    && <td className={`px-3 py-1.5 text-right ${metric === 'revenue' ? 'text-blue-700' : 'text-amber-700'}`}>{fmt(grandTotal)}</td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })()}

              {/* Менеджеры + тип/оплата */}
              <div className="grid grid-cols-1 gap-3">
                  <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                    <div className="px-2 py-1.5 border-b border-gray-50">
                      <span className="text-xs font-medium text-gray-700">По менеджерам</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[840px] text-xs">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500">
                            <th className="text-left px-2 py-1.5 font-medium">Менеджер</th>
                            <th className="text-right px-2 py-1.5 font-medium">Заказы</th>
                            <th className="text-right px-2 py-1.5 font-medium">Выр. заказов</th>
                            <th className="text-right px-2 py-1.5 font-medium">Маржа заказов</th>
                            <th className="text-right px-2 py-1.5 font-medium">ВМР</th>
                            <th className="text-right px-2 py-1.5 font-medium">Продажи</th>
                            <th className="text-right px-2 py-1.5 font-medium">Выр. продаж</th>
                            <th className="text-right px-2 py-1.5 font-medium">Маржа продаж</th>
                            <th className="text-right px-2 py-1.5 font-medium">Итого выр.</th>
                            <th className="text-right px-2 py-1.5 font-medium">Итого маржа</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {byManager.map(m => (
                            <tr key={m.name} className="hover:bg-gray-50">
                              <td className="px-2 py-1.5 text-gray-800 max-w-[160px] truncate">{m.name}</td>
                              <td className="px-2 py-1.5 text-right text-gray-500">{m.orders.count}</td>
                              <td className="px-2 py-1.5 text-right text-blue-600">{fmt(m.orders.revenue)}</td>
                              <td className="px-2 py-1.5 text-right text-amber-600">{fmt(m.orders.margin)}</td>
                              <td className="px-2 py-1.5 text-right">
                                {m.orders.vmr > 0 && (
                                  <span className="inline-block bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                    {m.orders.vmr}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right text-gray-500">{m.sales.count}</td>
                              <td className="px-2 py-1.5 text-right text-blue-500">{fmt(m.sales.revenue)}</td>
                              <td className="px-2 py-1.5 text-right text-amber-500">{fmt(m.sales.margin)}</td>
                              <td className="px-2 py-1.5 text-right text-blue-700 font-semibold">{fmt(m.totalRevenue)}</td>
                              <td className="px-2 py-1.5 text-right text-amber-700 font-semibold">{fmt(m.totalMargin)}</td>
                            </tr>
                          ))}
                          {byManager.length === 0 && (
                            <tr><td colSpan={10} className="text-center py-6 text-gray-400">Нет данных</td></tr>
                          )}
                        </tbody>
                        {byManager.length > 0 && (
                          <tfoot>
                            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                              <td className="px-3 py-1.5 text-gray-700">Итого</td>
                              <td className="px-3 py-1.5 text-right text-gray-500">{byManager.reduce((s,m)=>s+m.orders.count,0)}</td>
                              <td className="px-3 py-1.5 text-right text-blue-600">{fmt(byManager.reduce((s,m)=>s+m.orders.revenue,0))}</td>
                              <td className="px-3 py-1.5 text-right text-amber-600">{fmt(byManager.reduce((s,m)=>s+m.orders.margin,0))}</td>
                              <td className="px-3 py-1.5 text-right text-amber-700">{byManager.reduce((s,m)=>s+m.orders.vmr,0)}</td>
                              <td className="px-3 py-1.5 text-right text-gray-500">{byManager.reduce((s,m)=>s+m.sales.count,0)}</td>
                              <td className="px-3 py-1.5 text-right text-blue-500">{fmt(byManager.reduce((s,m)=>s+m.sales.revenue,0))}</td>
                              <td className="px-3 py-1.5 text-right text-amber-500">{fmt(byManager.reduce((s,m)=>s+m.sales.margin,0))}</td>
                              <td className="px-3 py-1.5 text-right text-blue-700">{fmt(byManager.reduce((s,m)=>s+m.totalRevenue,0))}</td>
                              <td className="px-3 py-1.5 text-right text-amber-700">{fmt(byManager.reduce((s,m)=>s+m.totalMargin,0))}</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="bg-white rounded-lg border border-gray-100 p-3">
                      <div className="text-xs font-medium text-gray-700 mb-3">Тип заказа</div>
                      <div className="space-y-2">
                        {byType.map(t => {
                          const pct = kpi!.totalRev > 0 ? Math.round(t.revenue / kpi!.totalRev * 100) : 0
                          return (
                            <div key={t.name}>
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className="text-gray-600 truncate max-w-[130px]">{t.name}</span>
                                <span className="text-gray-700 font-medium ml-2">{pct}%</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                      <div className="px-2 py-1.5 border-b border-gray-50">
                        <span className="text-xs font-medium text-gray-700">Оплата</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[620px] text-xs">
                          <thead>
                            <tr className="bg-gray-50 text-gray-500">
                              <th className="text-left px-2 py-1.5 font-medium">Тип</th>
                              <th className="text-right px-2 py-1.5 font-medium">Заказы</th>
                              <th className="text-right px-2 py-1.5 font-medium">Сумма заказов</th>
                              <th className="text-right px-2 py-1.5 font-medium">Продажи</th>
                              <th className="text-right px-2 py-1.5 font-medium">Сумма продаж</th>
                              <th className="text-right px-2 py-1.5 font-medium">Итого</th>
                              <th className="text-right px-2 py-1.5 font-medium">Доля</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {byPayment.map(p => {
                              const total = byPayment.reduce((s, x) => s + x.totalRevenue, 0)
                              const pct = total > 0 ? Math.round(p.totalRevenue / total * 100) : 0
                              return (
                                <tr key={p.name} className="hover:bg-gray-50">
                                  <td className="px-3 py-1.5 text-gray-800 font-medium">{p.name}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-500">{p.orders.count}</td>
                                  <td className="px-3 py-1.5 text-right text-blue-600">{fmt(p.orders.revenue)}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-500">{p.sales.count}</td>
                                  <td className="px-3 py-1.5 text-right text-blue-500">{fmt(p.sales.revenue)}</td>
                                  <td className="px-3 py-1.5 text-right text-blue-700 font-semibold">{fmt(p.totalRevenue)}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-500">{pct}%</td>
                                </tr>
                              )
                            })}
                            {byPayment.length === 0 && (
                              <tr><td colSpan={7} className="text-center py-6 text-gray-400">Нет данных</td></tr>
                            )}
                          </tbody>
                          {byPayment.length > 0 && (
                            <tfoot>
                              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                                <td className="px-3 py-1.5 text-gray-700">Итого</td>
                                <td className="px-3 py-1.5 text-right text-gray-500">{byPayment.reduce((s,p)=>s+p.orders.count,0)}</td>
                                <td className="px-3 py-1.5 text-right text-blue-600">{fmt(byPayment.reduce((s,p)=>s+p.orders.revenue,0))}</td>
                                <td className="px-3 py-1.5 text-right text-gray-500">{byPayment.reduce((s,p)=>s+p.sales.count,0)}</td>
                                <td className="px-3 py-1.5 text-right text-blue-500">{fmt(byPayment.reduce((s,p)=>s+p.sales.revenue,0))}</td>
                                <td className="px-3 py-1.5 text-right text-blue-700">{fmt(byPayment.reduce((s,p)=>s+p.totalRevenue,0))}</td>
                                <td className="px-3 py-1.5 text-right text-gray-500">100%</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
            </>
          )}

          {/* ── ТЕПЛОВАЯ КАРТА ── */}
          {view === 'heatmap' && (
            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-50">
                <span className="text-xs font-medium text-gray-700">
                  {metric === 'revenue' ? 'Выручка' : 'Маржа'} по салонам × дням
                </span>
                <span className="text-xs text-gray-400">{from} — {to}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="text-[11px] border-collapse w-max min-w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="sticky left-0 z-10 bg-gray-50 text-left px-2 py-1.5 font-medium text-gray-600 border-r border-gray-100 min-w-[140px]">
                        Салон
                      </th>
                      {byShopByDay[0]?.days.map(d => (
                        <th key={d.day}
                          className={`px-1.5 py-1.5 text-center font-medium min-w-[58px] border-r border-gray-50 ${
                            currentDay === d.day ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200' : 'text-gray-500'
                          }`}>
                          {d.day}
                        </th>
                      ))}
                      <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-l border-gray-100 min-w-[80px]">Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byShopByDay.map(shop => {
                      const totalVal = metric === 'revenue' ? shop.total.revenue : shop.total.margin
                      return (
                        <tr key={shop.name} className="border-t border-gray-50 hover:bg-gray-50/50">
                          <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-3 py-1.5 text-gray-700 font-medium border-r border-gray-100 truncate max-w-[140px]">
                            {shop.name}
                          </td>
                          {shop.days.map(d => {
                            const val = metric === 'revenue' ? d.revenue : d.margin
                            return (
                              <td key={d.day}
                                title={val > 0 ? fmt(val) : ''}
                                className={`px-1 py-1.5 text-center border-r border-gray-50 tabular-nums ${
                                  currentDay === d.day ? 'ring-1 ring-inset ring-amber-200' : ''
                                } ${cellCls(val, pivotMax, metric)}`}>
                                {fmtCell(val)}
                              </td>
                            )
                          })}
                          <td className={`px-3 py-1.5 text-right font-medium border-l border-gray-100 ${metric === 'revenue' ? 'text-blue-600' : 'text-amber-600'}`}>
                            {fmt(totalVal)}
                          </td>
                        </tr>
                      )
                    })}
                    {byShopByDay.length === 0 && (
                      <tr><td colSpan={33} className="text-center py-8 text-gray-400">Нет данных</td></tr>
                    )}
                    {byShopByDay.length > 0 && (() => {
                      const daysCount = byShopByDay[0].days.length
                      const totals    = Array.from({ length: daysCount }, (_, i) =>
                        byShopByDay.reduce((s, shop) => {
                          const d = shop.days[i]
                          return s + (metric === 'revenue' ? d.revenue : d.margin)
                        }, 0)
                      )
                      const grandTotal = totals.reduce((s, v) => s + v, 0)
                      const tMax = Math.max(...totals)
                      return (
                        <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                          <td className="sticky left-0 z-10 bg-gray-50 px-3 py-1.5 text-gray-700 border-r border-gray-100">Итого</td>
                          {totals.map((v, i) => (
                            <td key={i}
                              title={v > 0 ? fmt(v) : ''}
                              className={`px-1 py-1.5 text-center border-r border-gray-50 tabular-nums ${
                                currentDay === i + 1 ? 'ring-1 ring-inset ring-amber-200' : ''
                              } ${cellCls(v, tMax, metric)}`}>
                              {fmtCell(v)}
                            </td>
                          ))}
                          <td className={`px-3 py-1.5 text-right border-l border-gray-100 ${metric === 'revenue' ? 'text-blue-700' : 'text-amber-700'}`}>
                            {fmt(grandTotal)}
                          </td>
                        </tr>
                      )
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── МЕНЕДЖЕРЫ ── */}
          {view === 'managers' && (
            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
              <div className="px-2 py-1.5 border-b border-gray-50 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-gray-700">Отчет по менеджерам</span>
                <span className="text-xs text-gray-400">{byManager.length} строк</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px] text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="text-left px-2 py-1.5 font-medium">Менеджер</th>
                      <th className="text-right px-2 py-1.5 font-medium">Заказы</th>
                      <th className="text-right px-2 py-1.5 font-medium">Выр. заказов</th>
                      <th className="text-right px-2 py-1.5 font-medium">Маржа заказов</th>
                      <th className="text-right px-2 py-1.5 font-medium">ВМР</th>
                      <th className="text-right px-2 py-1.5 font-medium">Продажи</th>
                      <th className="text-right px-2 py-1.5 font-medium">Выр. продаж</th>
                      <th className="text-right px-2 py-1.5 font-medium">Маржа продаж</th>
                      <th className="text-right px-2 py-1.5 font-medium">Итого выр.</th>
                      <th className="text-right px-2 py-1.5 font-medium">Итого маржа</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {byManager.map(m => (
                      <tr key={m.name} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-gray-800 max-w-[160px] truncate">{m.name}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{m.orders.count}</td>
                        <td className="px-2 py-1.5 text-right text-blue-600">{fmt(m.orders.revenue)}</td>
                        <td className="px-2 py-1.5 text-right text-amber-600">{fmt(m.orders.margin)}</td>
                        <td className="px-2 py-1.5 text-right text-amber-700">{m.orders.vmr || ''}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{m.sales.count}</td>
                        <td className="px-2 py-1.5 text-right text-blue-500">{fmt(m.sales.revenue)}</td>
                        <td className="px-2 py-1.5 text-right text-amber-500">{fmt(m.sales.margin)}</td>
                        <td className="px-2 py-1.5 text-right text-blue-700 font-semibold">{fmt(m.totalRevenue)}</td>
                        <td className="px-2 py-1.5 text-right text-amber-700 font-semibold">{fmt(m.totalMargin)}</td>
                      </tr>
                    ))}
                    {byManager.length === 0 && (
                      <tr><td colSpan={10} className="text-center py-8 text-gray-400">Нет данных</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ОПЛАТА ── */}
          {view === 'payments' && (
            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
              <div className="px-2 py-1.5 border-b border-gray-50 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-gray-700">Отчет по оплате</span>
                <span className="text-xs text-gray-400">{fmt(byPayment.reduce((s, p) => s + p.totalRevenue, 0))}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="text-left px-2 py-1.5 font-medium">Тип</th>
                      <th className="text-right px-2 py-1.5 font-medium">Заказы</th>
                      <th className="text-right px-2 py-1.5 font-medium">Сумма заказов</th>
                      <th className="text-right px-2 py-1.5 font-medium">Продажи</th>
                      <th className="text-right px-2 py-1.5 font-medium">Сумма продаж</th>
                      <th className="text-right px-2 py-1.5 font-medium">Итого</th>
                      <th className="text-right px-2 py-1.5 font-medium">Доля</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {byPayment.map(p => {
                      const total = byPayment.reduce((s, x) => s + x.totalRevenue, 0)
                      const pct = total > 0 ? Math.round(p.totalRevenue / total * 100) : 0
                      return (
                        <tr key={p.name} className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 text-gray-800 font-medium">{p.name}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{p.orders.count}</td>
                          <td className="px-2 py-1.5 text-right text-blue-600">{fmt(p.orders.revenue)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{p.sales.count}</td>
                          <td className="px-2 py-1.5 text-right text-blue-500">{fmt(p.sales.revenue)}</td>
                          <td className="px-2 py-1.5 text-right text-blue-700 font-semibold">{fmt(p.totalRevenue)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{pct}%</td>
                        </tr>
                      )
                    })}
                    {byPayment.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-gray-400">Нет данных</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ВМР ── */}
          {view === 'vmr' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <KpiCard label="ВМР заказов" value={kpi!.vimrCount.toLocaleString('ru-RU')} />
                <KpiCard label="Менеджеров с ВМР" value={vmrManagers.length.toLocaleString('ru-RU')} />
                <KpiCard label="Маржа заказов" value={fmt(kpi!.totalMargin)} accent />
              </div>
              <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                <div className="px-2 py-1.5 border-b border-gray-50">
                  <span className="text-xs font-medium text-gray-700">ВМР по менеджерам</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[580px] text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-2 py-1.5 font-medium">Менеджер</th>
                        <th className="text-right px-2 py-1.5 font-medium">ВМР</th>
                        <th className="text-right px-2 py-1.5 font-medium">Заказы</th>
                        <th className="text-right px-2 py-1.5 font-medium">Выручка заказов</th>
                        <th className="text-right px-2 py-1.5 font-medium">Маржа заказов</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {vmrManagers.map(m => (
                        <tr key={m.name} className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 text-gray-800 font-medium">{m.name}</td>
                          <td className="px-2 py-1.5 text-right text-amber-700 font-semibold">{m.orders.vmr}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{m.orders.count}</td>
                          <td className="px-2 py-1.5 text-right text-blue-600">{fmt(m.orders.revenue)}</td>
                          <td className="px-2 py-1.5 text-right text-amber-600">{fmt(m.orders.margin)}</td>
                        </tr>
                      ))}
                      {vmrManagers.length === 0 && (
                        <tr><td colSpan={5} className="text-center py-8 text-gray-400">Нет данных</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── ТОВАРЫ ── */}
          {view === 'products' && (
            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
              <div className="px-2 py-1.5 border-b border-gray-50 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs font-medium text-gray-700 shrink-0">Продажи по группам товаров и услуг</span>
                <span className="ml-auto text-xs text-gray-400">
                  {visibleProducts.reduce((s, r) => s + r.count, 0).toLocaleString('ru-RU')} позиций
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="text-left px-2 py-1.5 font-medium">Группа</th>
                      <th className="text-right px-2 py-1.5 font-medium">Позиций</th>
                      <th className="text-right px-2 py-1.5 font-medium">Выручка</th>
                      <th className="text-right px-2 py-1.5 font-medium">Маржа</th>
                      <th className="text-right px-2 py-1.5 font-medium">Доля выр.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visibleProducts.map(g => {
                      const totalGroupRev = byProductGroup.reduce((s, row) => s + row.revenue, 0)
                      const pct = totalGroupRev > 0 ? Math.round(g.revenue / totalGroupRev * 100) : 0
                      return (
                        <tr key={g.name} className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 text-gray-800 font-medium">{g.name}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{g.count.toLocaleString('ru-RU')}</td>
                          <td className="px-2 py-1.5 text-right text-blue-600">{fmt(g.revenue)}</td>
                          <td className="px-2 py-1.5 text-right text-amber-600">{fmt(g.margin)}</td>
                          <td className="px-2 py-1.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-gray-500 w-7 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {visibleProducts.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-8 text-gray-400">Нет данных</td></tr>
                    )}
                  </tbody>
                  {visibleProducts.length > 1 && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                        <td className="px-3 py-1.5 text-gray-700">Итого</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{visibleProducts.reduce((s,r)=>s+r.count,0).toLocaleString('ru-RU')}</td>
                        <td className="px-3 py-1.5 text-right text-blue-600">{fmt(visibleProducts.reduce((s,r)=>s+r.revenue,0))}</td>
                        <td className="px-3 py-1.5 text-right text-amber-600">{fmt(visibleProducts.reduce((s,r)=>s+r.margin,0))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {showHelp && (
        <HelpModal
          title="Отчёты — справка"
          color="bg-indigo-50 border-indigo-100"
          dot="bg-indigo-400"
          items={HELP_ITEMS}
          onClose={() => setShowHelp(false)}
        />
      )}
    </div>
  )
}

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'}`}>
      <div className={`text-[11px] font-medium mb-0.5 ${accent ? 'text-amber-600' : 'text-gray-500'}`}>{label}</div>
      <div className={`text-base font-semibold leading-tight ${accent ? 'text-amber-700' : 'text-gray-800'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}
