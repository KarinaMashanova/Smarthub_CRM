'use client'

import { useState, useEffect, useCallback } from 'react'
import { HelpModal } from '../components/HelpModal'

const HELP_ITEMS = [
  { label: 'Назначение', desc: 'Сводная аналитика по заказам за выбранный месяц: выручка, маржа, ВМР, средний чек, статистика по менеджерам и салонам.' },
  { label: 'Источник', desc: 'Данные из локальной БД, которые попадают туда через синхронизацию LiveSklad каждые 15 минут.' },
  { label: 'Период', desc: 'Выбери год и месяц. Данные фильтруются по дате выдачи заказа (dateClose).' },
  { label: 'Маржа', desc: 'Маржа = выручка минус себестоимость позиций. Возвраты и удалённые заказы не участвуют.' },
  { label: 'ВМР', desc: 'Высокомаржинальный ремонт — заказ с маржей от 4 000 ₽. Считается отдельно в KPI.' },
  { label: 'Тепловая карта', desc: 'Таблица «По дням» показывает выручку или маржу каждого салона за каждый день. Цвет ячейки — интенсивность относительно максимума за период.' },
]
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

interface KPI {
  totalCount: number; totalRev: number; totalMargin: number; totalSalary: number
  vimrCount: number; avgCheck: number; withMarginCount: number
}
interface DayData    { day: number; revenue: number; margin: number; count: number; salesRevenue: number }
interface ManagerRow { name: string; count: number; revenue: number; margin: number; salary: number; vmr: number }
interface ShopRow    { name: string; count: number; revenue: number; margin: number }
interface ShopSummaryRow {
  name: string
  orders: { count: number; revenue: number; margin: number }
  sales:  { count: number; revenue: number; margin: number }
  totalRev: number
}
interface TypeRow    { name: string; revenue: number }
interface PayRow     { name: string; count: number }
interface ProductGroupRow { name: string; count: number; revenue: number; margin: number }
interface ShopDayRow { name: string; total: { revenue: number; margin: number }; days: { day: number; revenue: number; margin: number }[] }

const MONTH_SHORT     = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
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
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' млн'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + ' тыс'
  return String(Math.round(n))
}

function cellCls(value: number, max: number, metric: 'revenue' | 'margin') {
  if (value === 0 || max === 0) return 'bg-white text-gray-300'
  const r = value / max
  if (metric === 'revenue') {
    if (r > 0.8) return 'bg-blue-600 text-white font-medium'
    if (r > 0.5) return 'bg-blue-300 text-blue-900'
    if (r > 0.2) return 'bg-blue-100 text-blue-700'
    return 'bg-blue-50 text-blue-500'
  } else {
    if (r > 0.8) return 'bg-amber-600 text-white font-medium'
    if (r > 0.5) return 'bg-amber-300 text-amber-900'
    if (r > 0.2) return 'bg-amber-100 text-amber-700'
    return 'bg-amber-50 text-amber-600'
  }
}

export default function ReportsPage() {
  const now = new Date()
  const [periodMode, setPeriodMode] = useState<'month' | 'today' | 'yesterday' | 'custom'>('month')
  const [selYear,    setSelYear]    = useState(now.getFullYear())
  const [selMonth,   setSelMonth]   = useState(now.getMonth())
  const [customFrom, setCustomFrom] = useState<string | null>(null)
  const [customTo,   setCustomTo]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [kpi,           setKpi]           = useState<KPI | null>(null)
  const [byDay,         setByDay]         = useState<DayData[]>([])
  const [byManager,     setByManager]     = useState<ManagerRow[]>([])
  const [byShopSummary, setByShopSummary] = useState<ShopSummaryRow[]>([])
  const [byType,        setByType]        = useState<TypeRow[]>([])
  const [byPayment,     setByPayment]     = useState<PayRow[]>([])
  const [byProductGroup, setByProductGroup] = useState<ProductGroupRow[]>([])
  const [byShopByDay,   setByShopByDay]   = useState<ShopDayRow[]>([])

  const [mainTab,     setMainTab]     = useState<'chart' | 'table'>('chart')
  const [chartMetric, setChartMetric] = useState<'revenue' | 'margin'>('revenue')
  const [pivotMetric, setPivotMetric] = useState<'revenue' | 'margin'>('revenue')
  const [shopView,    setShopView]    = useState<'combined' | 'orders' | 'sales'>('combined')
  const [showHelp,    setShowHelp]    = useState(false)

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

  useEffect(() => { load() }, [load])

  const pivotMax = byShopByDay.reduce((m, shop) =>
    Math.max(m, ...shop.days.map(d => pivotMetric === 'revenue' ? d.revenue : d.margin)), 0)

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)] overflow-hidden bg-white md:h-screen">
      {/* Шапка */}
      <div className="shrink-0 border-b border-gray-100 px-4 pt-2.5 pb-2">
        {/* Строка 1: заголовок + вкладки + справка */}
        <div className="flex items-center gap-2 pb-2 flex-wrap">
          <h1 className="font-semibold text-gray-900 text-sm shrink-0">Отчёты</h1>
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(['chart', 'table'] as const).map(t => (
              <button key={t} onClick={() => setMainTab(t)}
                className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${
                  mainTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t === 'chart' ? 'Дашборд' : 'Таблица'}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <button onClick={() => setShowHelp(true)} title="Справка"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M6 5.8C6 4.8 7.5 4.5 7.5 5.8c0 .8-1 1-1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="7.5" cy="10.5" r=".6" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
        {/* Строка 2: стандартный фильтр дат */}
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
                {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={selMonth} onChange={e => setSelMonth(+e.target.value)}
                className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
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
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Загрузка…</div>
      ) : !kpi ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Нет данных</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* KPI */}
          {(() => {
            const salesRev = byShopSummary.reduce((s, r) => s + r.sales.revenue, 0)
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <KpiCard label="Заказов"       value={kpi.totalCount.toLocaleString('ru-RU')} sub={`с маржой: ${kpi.withMarginCount}`} />
                <KpiCard label="Выр. заказы"   value={fmt(kpi.totalRev)} />
                <KpiCard label="Выр. продажи"  value={fmt(salesRev)} />
                <KpiCard label="Выручка итого" value={fmt(kpi.totalRev + salesRev)} accent />
                <KpiCard label="Маржа"         value={fmt(kpi.totalMargin)} />
                <KpiCard label="Ср. чек"       value={fmt(kpi.avgCheck)} />
                <KpiCard label="ВМР"           value={kpi.vimrCount.toLocaleString('ru-RU')} />
              </div>
            )
          })()}

          {mainTab === 'chart' && (
            <>
              {/* Дневной график */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">
                    Динамика по дням
                  </span>
                  <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                    {([['revenue','Выручка'],['margin','Маржа']] as const).map(([m, label]) => (
                      <button key={m} onClick={() => setChartMetric(m)}
                        className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${chartMetric === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byDay} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }}
                      tickFormatter={v => v >= 1_000_000 ? (v/1_000_000).toFixed(1)+'млн' : v >= 1000 ? Math.round(v/1000)+'тыс' : String(v)}
                      width={44} />
                    <Tooltip
                      formatter={(v, name) => [typeof v === 'number' ? fmt(v) : v, name === 'revenue' ? 'Заказы' : name === 'salesRevenue' ? 'Продажи' : 'Маржа']}
                      labelFormatter={l => `День ${l}`}
                    />
                    {chartMetric === 'revenue' ? (
                      <>
                        <Legend formatter={n => n === 'revenue' ? 'Заказы' : 'Продажи'} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="revenue"      name="revenue"      stackId="a" radius={[0,0,0,0]} fill="#3b82f6" />
                        <Bar dataKey="salesRevenue" name="salesRevenue" stackId="a" radius={[3,3,0,0]} fill="#93c5fd" />
                      </>
                    ) : (
                      <Bar dataKey="margin" name="margin" radius={[3,3,0,0]} fill="#f59e0b" />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Заказы и продажи по магазинам */}
              {(() => {
                const ordersTotal  = byShopSummary.reduce((s, r) => s + r.orders.revenue, 0)
                const salesTotal   = byShopSummary.reduce((s, r) => s + r.sales.revenue, 0)
                const combinedTotal = ordersTotal + salesTotal
                return (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                    <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-700 shrink-0">По магазинам</span>
                      <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                        {([['combined','Итого'],['orders','Заказы'],['sales','Продажи']] as const).map(([v, label]) => (
                          <button key={v} onClick={() => setShopView(v)}
                            className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${
                              shopView === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <span className="ml-auto text-xs text-gray-400 font-medium">
                        {shopView === 'orders'   ? fmt(ordersTotal)
                         : shopView === 'sales'  ? fmt(salesTotal)
                         : fmt(combinedTotal)}
                      </span>
                    </div>
                    <table className="w-full min-w-[480px] text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500">
                          <th className="text-left px-3 py-2 font-medium">Магазин</th>
                          {shopView !== 'sales'  && <th className="text-right px-3 py-2 font-medium">Заказов</th>}
                          {shopView !== 'sales'  && <th className="text-right px-3 py-2 font-medium">Выр. заказы</th>}
                          {shopView !== 'sales'  && <th className="text-right px-3 py-2 font-medium">Маржа</th>}
                          {shopView !== 'orders' && <th className="text-right px-3 py-2 font-medium">Продаж</th>}
                          {shopView !== 'orders' && <th className="text-right px-3 py-2 font-medium">Выр. продажи</th>}
                          {shopView !== 'orders' && <th className="text-right px-3 py-2 font-medium">Маржа прод.</th>}
                          {shopView === 'combined' && <th className="text-right px-3 py-2 font-medium bg-gray-50/80">Итого</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {byShopSummary.map(s => (
                          <tr key={s.name} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-800 font-medium truncate max-w-[140px]">{s.name}</td>
                            {shopView !== 'sales'  && <td className="px-3 py-1.5 text-right text-gray-500">{s.orders.count}</td>}
                            {shopView !== 'sales'  && <td className="px-3 py-1.5 text-right text-blue-600">{s.orders.revenue > 0 ? fmt(s.orders.revenue) : '—'}</td>}
                            {shopView !== 'sales'  && <td className="px-3 py-1.5 text-right text-amber-600">{s.orders.margin > 0 ? fmt(s.orders.margin) : '—'}</td>}
                            {shopView !== 'orders' && <td className="px-3 py-1.5 text-right text-gray-500">{s.sales.count}</td>}
                            {shopView !== 'orders' && <td className="px-3 py-1.5 text-right text-blue-500">{s.sales.revenue > 0 ? fmt(s.sales.revenue) : '—'}</td>}
                            {shopView !== 'orders' && <td className="px-3 py-1.5 text-right text-amber-500">{s.sales.margin > 0 ? fmt(s.sales.margin) : '—'}</td>}
                            {shopView === 'combined' && <td className="px-3 py-1.5 text-right font-semibold text-gray-800">{fmt(s.totalRev)}</td>}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                          <td className="px-3 py-1.5 text-gray-700">Итого</td>
                          {shopView !== 'sales'  && <td className="px-3 py-1.5 text-right text-gray-500">{byShopSummary.reduce((s,r)=>s+r.orders.count,0)}</td>}
                          {shopView !== 'sales'  && <td className="px-3 py-1.5 text-right text-blue-600">{fmt(ordersTotal)}</td>}
                          {shopView !== 'sales'  && <td className="px-3 py-1.5 text-right text-amber-600">{fmt(byShopSummary.reduce((s,r)=>s+r.orders.margin,0))}</td>}
                          {shopView !== 'orders' && <td className="px-3 py-1.5 text-right text-gray-500">{byShopSummary.reduce((s,r)=>s+r.sales.count,0)}</td>}
                          {shopView !== 'orders' && <td className="px-3 py-1.5 text-right text-blue-500">{fmt(salesTotal)}</td>}
                          {shopView !== 'orders' && <td className="px-3 py-1.5 text-right text-amber-500">{fmt(byShopSummary.reduce((s,r)=>s+r.sales.margin,0))}</td>}
                          {shopView === 'combined' && <td className="px-3 py-1.5 text-right text-gray-800">{fmt(combinedTotal)}</td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })()}

              {/* Менеджеры + типы/оплата */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50">
                    <span className="text-sm font-medium text-gray-700">Топ менеджеров</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500">
                          <th className="text-left px-3 py-2 font-medium">Менеджер</th>
                          <th className="text-right px-3 py-2 font-medium">Заказов</th>
                          <th className="text-right px-3 py-2 font-medium">Выручка</th>
                          <th className="text-right px-3 py-2 font-medium">Маржа</th>
                          <th className="text-right px-3 py-2 font-medium">ЗП</th>
                          <th className="text-right px-3 py-2 font-medium">ВМР</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {byManager.map(m => (
                          <tr key={m.name} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800 max-w-[140px] truncate">{m.name}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{m.count}</td>
                            <td className="px-3 py-2 text-right text-blue-600">{fmt(m.revenue)}</td>
                            <td className="px-3 py-2 text-right text-amber-600">{fmt(m.margin)}</td>
                            <td className="px-3 py-2 text-right text-violet-600">{fmt(m.salary)}</td>
                            <td className="px-3 py-2 text-right">
                              {m.vmr > 0 && (
                                <span className="inline-block bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                  {m.vmr}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {byManager.length === 0 && (
                          <tr><td colSpan={6} className="text-center py-6 text-gray-400">Нет данных</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <div className="text-sm font-medium text-gray-700 mb-3">Тип заказа</div>
                    <div className="space-y-2">
                      {byType.map(t => {
                        const pct = kpi.totalRev > 0 ? Math.round(t.revenue / kpi.totalRev * 100) : 0
                        return (
                          <div key={t.name}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-gray-600 truncate max-w-[120px]">{t.name}</span>
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

                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <div className="text-sm font-medium text-gray-700 mb-3">Оплата</div>
                    <div className="space-y-1.5">
                      {byPayment.map(p => {
                        const total = byPayment.reduce((s, x) => s + x.count, 0)
                        const pct   = total > 0 ? Math.round(p.count / total * 100) : 0
                        return (
                          <div key={p.name} className="flex justify-between items-center text-xs">
                            <span className="text-gray-600">{p.name}</span>
                            <span className="text-gray-700 font-medium">{p.count} ({pct}%)</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Продажи по группам товаров</span>
                    <span className="text-xs text-gray-400">
                      {byProductGroup.reduce((s, r) => s + r.count, 0).toLocaleString('ru-RU')} позиций
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500">
                          <th className="text-left px-3 py-2 font-medium">Группа</th>
                          <th className="text-right px-3 py-2 font-medium">Позиций</th>
                          <th className="text-right px-3 py-2 font-medium">Выручка</th>
                          <th className="text-right px-3 py-2 font-medium">Маржа</th>
                          <th className="text-right px-3 py-2 font-medium">Доля</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {byProductGroup.map(g => {
                          const totalGroupRev = byProductGroup.reduce((s, row) => s + row.revenue, 0)
                          const pct = totalGroupRev > 0 ? Math.round(g.revenue / totalGroupRev * 100) : 0
                          return (
                            <tr key={g.name} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-800 font-medium">{g.name}</td>
                              <td className="px-3 py-2 text-right text-gray-500">{g.count.toLocaleString('ru-RU')}</td>
                              <td className="px-3 py-2 text-right text-blue-600">{fmt(g.revenue)}</td>
                              <td className="px-3 py-2 text-right text-amber-600">{fmt(g.margin)}</td>
                              <td className="px-3 py-2 text-right text-gray-500">{pct}%</td>
                            </tr>
                          )
                        })}
                        {byProductGroup.length === 0 && (
                          <tr><td colSpan={5} className="text-center py-6 text-gray-400">Нет товарных позиций</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {mainTab === 'table' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <span className="text-sm font-medium text-gray-700">
                  Выручка по салонам × дням — {from} — {to}
                </span>
                <div className="flex gap-1">
                  {(['revenue','margin'] as const).map(m => (
                    <button key={m} onClick={() => setPivotMetric(m)}
                      className={`px-3 py-1 rounded text-xs ${pivotMetric === m
                        ? m === 'revenue' ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {m === 'revenue' ? 'Выручка' : 'Маржа'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="text-[11px] border-collapse w-max min-w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="sticky left-0 z-10 bg-gray-50 text-left px-3 py-2 font-medium text-gray-600 border-r border-gray-100 min-w-[140px]">
                        Салон
                      </th>
                      {byShopByDay[0]?.days.map(d => (
                        <th key={d.day} className="px-2 py-2 text-center font-medium text-gray-500 min-w-[38px] border-r border-gray-50">
                          {d.day}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-medium text-gray-600 border-l border-gray-100 min-w-[80px]">Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byShopByDay.map(shop => {
                      const totalVal = pivotMetric === 'revenue' ? shop.total.revenue : shop.total.margin
                      return (
                        <tr key={shop.name} className="border-t border-gray-50 hover:bg-gray-50/50">
                          <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-3 py-1.5 text-gray-700 font-medium border-r border-gray-100 truncate max-w-[140px]">
                            {shop.name}
                          </td>
                          {shop.days.map(d => {
                            const val = pivotMetric === 'revenue' ? d.revenue : d.margin
                            return (
                              <td key={d.day}
                                title={val > 0 ? fmt(val) : ''}
                                className={`px-1 py-1.5 text-center border-r border-gray-50 ${cellCls(val, pivotMax, pivotMetric)}`}>
                                {fmtCell(val)}
                              </td>
                            )
                          })}
                          <td className={`px-3 py-1.5 text-right font-medium border-l border-gray-100 ${pivotMetric === 'revenue' ? 'text-blue-600' : 'text-amber-600'}`}>
                            {fmt(totalVal)}
                          </td>
                        </tr>
                      )
                    })}
                    {byShopByDay.length === 0 && (
                      <tr>
                        <td colSpan={33} className="text-center py-8 text-gray-400">Нет данных</td>
                      </tr>
                    )}
                    {byShopByDay.length > 0 && (() => {
                      const daysCount = byShopByDay[0].days.length
                      const totals    = Array.from({ length: daysCount }, (_, i) =>
                        byShopByDay.reduce((s, shop) => {
                          const d = shop.days[i]
                          return s + (pivotMetric === 'revenue' ? d.revenue : d.margin)
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
                              className={`px-1 py-1.5 text-center border-r border-gray-50 ${cellCls(v, tMax, pivotMetric)}`}>
                              {fmtCell(v)}
                            </td>
                          ))}
                          <td className={`px-3 py-1.5 text-right border-l border-gray-100 ${pivotMetric === 'revenue' ? 'text-blue-700' : 'text-amber-700'}`}>
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
    <div className={`rounded-xl border p-3 ${accent ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'}`}>
      <div className={`text-[11px] font-medium mb-0.5 ${accent ? 'text-amber-600' : 'text-gray-500'}`}>{label}</div>
      <div className={`text-base font-semibold leading-tight ${accent ? 'text-amber-700' : 'text-gray-800'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}
