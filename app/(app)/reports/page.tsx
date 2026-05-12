'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface KPI {
  totalCount: number; totalRev: number; totalMargin: number; totalSalary: number
  vimrCount: number; avgCheck: number; withMarginCount: number
}
interface DayData    { day: number; revenue: number; margin: number; count: number }
interface ManagerRow { name: string; count: number; revenue: number; margin: number; salary: number; vmr: number }
interface ShopRow    { name: string; count: number; revenue: number; margin: number }
interface ShopSummaryRow {
  name: string
  orders: { count: number; revenue: number; margin: number }
  sales:  { count: number; revenue: number }
  totalRev: number
}
interface TypeRow    { name: string; revenue: number }
interface PayRow     { name: string; count: number }
interface ShopDayRow { name: string; total: { revenue: number; margin: number }; days: { day: number; revenue: number; margin: number }[] }

const MONTH_SHORT     = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
const AVAILABLE_YEARS = [2026, 2027]

function fmt(n: number) {
  if (n === 0) return '—'
  return n.toLocaleString('ru-RU') + ' ₽'
}

function fmtCell(n: number) {
  if (n === 0) return ''
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'М'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'к'
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
    if (r > 0.8) return 'bg-emerald-600 text-white font-medium'
    if (r > 0.5) return 'bg-emerald-300 text-emerald-900'
    if (r > 0.2) return 'bg-emerald-100 text-emerald-700'
    return 'bg-emerald-50 text-emerald-500'
  }
}

export default function ReportsPage() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [loading, setLoading] = useState(true)

  const [kpi,           setKpi]           = useState<KPI | null>(null)
  const [byDay,         setByDay]         = useState<DayData[]>([])
  const [byManager,     setByManager]     = useState<ManagerRow[]>([])
  const [byShop,        setByShop]        = useState<ShopRow[]>([])
  const [byShopSummary, setByShopSummary] = useState<ShopSummaryRow[]>([])
  const [byType,        setByType]        = useState<TypeRow[]>([])
  const [byPayment,     setByPayment]     = useState<PayRow[]>([])
  const [byShopByDay,   setByShopByDay]   = useState<ShopDayRow[]>([])

  const [mainTab,      setMainTab]      = useState<'chart' | 'table'>('chart')
  const [chartMetric,  setChartMetric]  = useState<'revenue' | 'margin'>('revenue')
  const [pivotMetric,  setPivotMetric]  = useState<'revenue' | 'margin'>('revenue')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/orders?year=${year}&month=${month}`)
      if (res.ok) {
        const d = await res.json()
        setKpi(d.kpi)
        setByDay(d.byDay ?? [])
        setByManager(d.byManager ?? [])
        setByShop(d.byShop ?? [])
        setByShopSummary(d.byShopSummary ?? [])
        setByType(d.byType ?? [])
        setByPayment(d.byPayment ?? [])
        setByShopByDay(d.byShopByDay ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { load() }, [load])

  const pivotMax = byShopByDay.reduce((m, shop) =>
    Math.max(m, ...shop.days.map(d => pivotMetric === 'revenue' ? d.revenue : d.margin)), 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Шапка */}
      <div className="flex-none flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white flex-wrap">
        <span className="text-sm font-medium text-gray-700">Отчёт по заказам</span>
        <div className="flex items-center gap-1 ml-auto">
          {AVAILABLE_YEARS.map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-3 py-1 rounded text-sm ${year === y ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {y}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {MONTH_SHORT.map((m, i) => (
            <button key={i} onClick={() => setMonth(i)}
              className={`px-2 py-1 rounded text-xs ${month === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Загрузка…</div>
      ) : !kpi ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Нет данных</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Заказов"     value={kpi.totalCount.toLocaleString('ru-RU')} sub={`с маржой: ${kpi.withMarginCount}`} />
            <KpiCard label="Выручка"     value={fmt(kpi.totalRev)} />
            <KpiCard label="Маржа"       value={fmt(kpi.totalMargin)} />
            <KpiCard label="ЗП (итого)"  value={fmt(kpi.totalSalary)} />
            <KpiCard label="Ср. чек"     value={fmt(kpi.avgCheck)} />
            <KpiCard label="ВМР заказов" value={kpi.vimrCount.toLocaleString('ru-RU')} accent />
          </div>

          {/* Табы */}
          <div className="flex gap-2">
            {(['chart','table'] as const).map(t => (
              <button key={t} onClick={() => setMainTab(t)}
                className={`px-4 py-1.5 rounded text-sm font-medium ${mainTab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t === 'chart' ? 'Дашборд' : 'Таблица'}
              </button>
            ))}
          </div>

          {mainTab === 'chart' && (
            <>
              {/* Дневной график */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">
                    Динамика по дням — {MONTH_SHORT[month]} {year}
                  </span>
                  <div className="flex gap-1">
                    {(['revenue','margin'] as const).map(m => (
                      <button key={m} onClick={() => setChartMetric(m)}
                        className={`px-3 py-1 rounded text-xs ${chartMetric === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {m === 'revenue' ? 'Выручка' : 'Маржа'}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={byDay} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }}
                      tickFormatter={v => v >= 1000 ? Math.round(v / 1000) + 'к' : String(v)}
                      width={40} />
                    <Tooltip
                      formatter={(v) => typeof v === 'number' ? fmt(v) : v}
                      labelFormatter={l => `День ${l}`}
                    />
                    <Bar
                      dataKey={chartMetric}
                      radius={[3, 3, 0, 0]}
                      fill={chartMetric === 'revenue' ? '#3b82f6' : '#10b981'}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Заказы и продажи — два отдельных блока */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Блок: Заказы по магазинам */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Заказы по магазинам</span>
                    <span className="text-xs text-blue-500 font-medium">
                      {byShopSummary.reduce((s, r) => s + r.orders.count, 0)} заказов
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-3 py-2 font-medium">Магазин</th>
                        <th className="text-right px-3 py-2 font-medium">Кол.</th>
                        <th className="text-right px-3 py-2 font-medium">Выручка</th>
                        <th className="text-right px-3 py-2 font-medium">Маржа</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {byShopSummary.filter(s => s.orders.count > 0).map(s => (
                        <tr key={s.name} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-800 font-medium truncate max-w-[130px]">{s.name}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{s.orders.count}</td>
                          <td className="px-3 py-2 text-right text-blue-600">{fmt(s.orders.revenue)}</td>
                          <td className="px-3 py-2 text-right text-emerald-600">{fmt(s.orders.margin)}</td>
                        </tr>
                      ))}
                      {byShopSummary.some(s => s.orders.count > 0) && (() => {
                        const rows = byShopSummary.filter(s => s.orders.count > 0)
                        return (
                          <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                            <td className="px-3 py-2 text-gray-700">Итого</td>
                            <td className="px-3 py-2 text-right text-gray-500">{rows.reduce((s, r) => s + r.orders.count, 0)}</td>
                            <td className="px-3 py-2 text-right text-blue-600">{fmt(rows.reduce((s, r) => s + r.orders.revenue, 0))}</td>
                            <td className="px-3 py-2 text-right text-emerald-600">{fmt(rows.reduce((s, r) => s + r.orders.margin, 0))}</td>
                          </tr>
                        )
                      })()}
                      {byShopSummary.every(s => s.orders.count === 0) && (
                        <tr><td colSpan={4} className="text-center py-6 text-gray-400">Нет заказов</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Блок: Продажи по магазинам */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Продажи по магазинам</span>
                    <span className="text-xs text-violet-500 font-medium">
                      {byShopSummary.reduce((s, r) => s + r.sales.count, 0)} продаж
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="text-left px-3 py-2 font-medium">Магазин</th>
                        <th className="text-right px-3 py-2 font-medium">Кол.</th>
                        <th className="text-right px-3 py-2 font-medium">Выручка</th>
                        <th className="text-right px-3 py-2 font-medium">Ср. чек</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {byShopSummary.filter(s => s.sales.count > 0).map(s => (
                        <tr key={s.name} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-800 font-medium truncate max-w-[130px]">{s.name}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{s.sales.count}</td>
                          <td className="px-3 py-2 text-right text-violet-600">{fmt(s.sales.revenue)}</td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {s.sales.count > 0 ? fmt(Math.round(s.sales.revenue / s.sales.count)) : '—'}
                          </td>
                        </tr>
                      ))}
                      {byShopSummary.some(s => s.sales.count > 0) && (() => {
                        const rows = byShopSummary.filter(s => s.sales.count > 0)
                        const totalSalesRev = rows.reduce((s, r) => s + r.sales.revenue, 0)
                        const totalSalesCnt = rows.reduce((s, r) => s + r.sales.count, 0)
                        return (
                          <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                            <td className="px-3 py-2 text-gray-700">Итого</td>
                            <td className="px-3 py-2 text-right text-gray-500">{totalSalesCnt}</td>
                            <td className="px-3 py-2 text-right text-violet-600">{fmt(totalSalesRev)}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{totalSalesCnt > 0 ? fmt(Math.round(totalSalesRev / totalSalesCnt)) : '—'}</td>
                          </tr>
                        )
                      })()}
                      {byShopSummary.every(s => s.sales.count === 0) && (
                        <tr><td colSpan={4} className="text-center py-6 text-gray-400">Нет продаж</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Менеджеры + типы/оплата */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50">
                    <span className="text-sm font-medium text-gray-700">Топ менеджеров</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
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
                            <td className="px-3 py-2 text-right text-emerald-600">{fmt(m.margin)}</td>
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
              </div>
            </>
          )}

          {mainTab === 'table' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <span className="text-sm font-medium text-gray-700">
                  Выручка по салонам × дням — {MONTH_SHORT[month]} {year}
                </span>
                <div className="flex gap-1">
                  {(['revenue','margin'] as const).map(m => (
                    <button key={m} onClick={() => setPivotMetric(m)}
                      className={`px-3 py-1 rounded text-xs ${pivotMetric === m
                        ? m === 'revenue' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
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
                          <td className={`px-3 py-1.5 text-right font-medium border-l border-gray-100 ${pivotMetric === 'revenue' ? 'text-blue-600' : 'text-emerald-600'}`}>
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
                          <td className={`px-3 py-1.5 text-right border-l border-gray-100 ${pivotMetric === 'revenue' ? 'text-blue-700' : 'text-emerald-700'}`}>
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
