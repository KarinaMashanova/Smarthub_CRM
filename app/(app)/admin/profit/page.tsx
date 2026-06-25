'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'

interface ShopProfit {
  shopId:            string
  shopName:          string
  taxSystem:         string
  taxRate:           number
  revenue:           number
  taxableRevenue:    number
  liveSkladMargin:   number
  realMargin:        number
  extraProfit:       number
  tax:               number
  netProfit:         number
  positionsTotal:    number
  positionsWithCost: number
  missingNames:      string[]
}

interface Totals {
  revenue: number; taxableRevenue: number
  liveSkladMargin: number; realMargin: number
  extraProfit: number; tax: number; netProfit: number
  positionsTotal: number; positionsWithCost: number
}

interface ReportData {
  shops:       ShopProfit[]
  totals:      Totals
  allMissing:  string[]
  catalogSize: number
}

const MONTH_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtM(n: number) {
  if (n === 0) return '—'
  const s = Math.abs(n).toLocaleString('ru-RU') + ' ₽'
  return n < 0 ? '−' + s : s
}
function fmtPct(n: number) {
  return (n * 100).toFixed(1) + '%'
}

const TAX_BADGE: Record<string, string> = {
  AUSN:   'bg-blue-50 text-blue-700',
  PATENT: 'bg-amber-50 text-amber-700',
  NONE:   'bg-gray-50 text-gray-400',
}
const TAX_LABEL: Record<string, string> = { AUSN: 'АУСН', PATENT: 'Патент', NONE: '—' }

export default function ProfitPage() {
  const now = new Date()
  const [month,   setMonth]   = useState(now.getMonth())
  const [year]                = useState(now.getFullYear())
  const [mode,    setMode]    = useState<'month' | 'custom'>('month')
  const [cFrom,   setCFrom]   = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [cTo,     setCTo]     = useState(toISO(now))

  const [data,    setData]    = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [showMissing, setShowMissing] = useState(false)
  const [expandedShop, setExpandedShop] = useState<string | null>(null)

  const from = mode === 'month' ? toISO(new Date(year, month, 1)) : cFrom
  const to   = mode === 'month' ? toISO(new Date(year, month + 1, 0)) : cTo

  const load = useCallback(async () => {
    setLoading(true); setError(null); setData(null)
    try {
      const res = await fetch(`/api/admin/profit?from=${from}&to=${to}`)
      const d   = await res.json()
      if (!res.ok) { setError(d.error ?? 'Ошибка'); return }
      setData(d)
    } catch (e: any) {
      setError(e.message ?? 'Ошибка')
    } finally { setLoading(false) }
  }, [from, to])

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)] overflow-hidden bg-white md:h-screen">

      {/* Шапка */}
      <div className="shrink-0 border-b border-gray-100 px-4 pt-2.5 pb-2">
        <div className="flex items-center gap-2 pb-2 flex-wrap">
          <h1 className="font-semibold text-gray-900 text-sm shrink-0">Чистая прибыль</h1>
          <div className="flex gap-1 ml-auto flex-wrap items-center">
            <Link href="/admin/real-costs" className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">
              Цены закупа →
            </Link>
            <Link href="/admin/tax-config" className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">
              Налоги →
            </Link>
          </div>
        </div>

        {/* Период */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(['month', 'custom'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {m === 'month' ? 'Месяц' : 'Период'}
              </button>
            ))}
          </div>

          {mode === 'month' ? (
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
              {MONTH_SHORT.map((m, i) => <option key={m} value={i}>{m} {year}</option>)}
            </select>
          ) : (
            <>
              <input type="date" value={cFrom} onChange={e => setCFrom(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
              <span className="text-xs text-gray-400">—</span>
              <input type="date" value={cTo} onChange={e => setCTo(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
            </>
          )}

          <button onClick={load} disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {loading ? 'Считаем...' : 'Показать'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">{error}</div>
        )}

        {!data && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <p className="text-gray-400 text-sm">Выбери период и нажми «Показать»</p>
            <div className="flex gap-2 text-xs">
              <Link href="/admin/real-costs" className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                Настроить цены закупа →
              </Link>
              <Link href="/admin/tax-config" className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                Настроить налоги →
              </Link>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-16 text-gray-400 text-sm">Считаем прибыль...</div>
        )}

        {data && (
          <>
            {/* Итоговые карточки */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
              {[
                { label: 'Выручка',          value: fmtM(data.totals.revenue),         color: 'text-gray-800' },
                { label: 'Маржа (LiveSklad)', value: fmtM(data.totals.liveSkladMargin), color: 'text-gray-500' },
                { label: 'Реальная маржа',    value: fmtM(data.totals.realMargin),      color: 'text-blue-700' },
                { label: 'Доп. прибыль',      value: fmtM(data.totals.extraProfit),     color: 'text-green-700' },
                { label: 'Налог',             value: fmtM(data.totals.tax),             color: 'text-rose-600' },
                { label: 'Чистая прибыль',    value: fmtM(data.totals.netProfit),       color: 'text-emerald-700' },
              ].map(k => (
                <div key={k.label} className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 shadow-sm">
                  <p className="text-[10px] text-gray-400">{k.label}</p>
                  <p className={`text-sm font-bold ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Покрытие справочника */}
            {data.totals.positionsTotal > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl text-xs">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full"
                    style={{ width: `${(data.totals.positionsWithCost / data.totals.positionsTotal * 100).toFixed(0)}%` }}
                  />
                </div>
                <span className="text-gray-600 shrink-0">
                  Справочник покрывает {data.totals.positionsWithCost} из {data.totals.positionsTotal} позиций
                  ({Math.round(data.totals.positionsWithCost / data.totals.positionsTotal * 100)}%)
                </span>
              </div>
            )}

            {/* Предупреждение о незаполненных позициях */}
            {data.allMissing.length > 0 && (
              <div className="border border-amber-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowMissing(m => !m)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 text-left"
                >
                  <span className="text-xs font-medium text-amber-800">
                    ⚠ {data.allMissing.length} позиций без реальной цены — маржа по ним считается из LiveSklad
                  </span>
                  <span className="text-xs text-amber-600">{showMissing ? 'Скрыть ▲' : 'Показать ▼'}</span>
                </button>
                {showMissing && (
                  <div className="px-4 py-3 bg-white">
                    <p className="text-[10px] text-gray-400 mb-2">Добавь эти позиции в справочник реальных цен:</p>
                    <div className="flex flex-wrap gap-1">
                      {data.allMissing.map(name => (
                        <span key={name} className="text-xs px-2 py-0.5 bg-amber-50 border border-amber-100 rounded text-amber-800">
                          {name}
                        </span>
                      ))}
                    </div>
                    <Link href="/admin/real-costs"
                      className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700">
                      Открыть справочник →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Таблица по точкам */}
            <div className="rounded-xl border border-gray-100 overflow-x-auto">
              <table className="w-full min-w-[900px] text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left">
                    <th className="px-3 py-2.5 font-medium text-gray-500">Точка</th>
                    <th className="px-3 py-2.5 font-medium text-gray-500 text-center">Налог</th>
                    <th className="px-3 py-2.5 font-medium text-gray-500 text-right">Выручка</th>
                    <th className="px-3 py-2.5 font-medium text-gray-500 text-right">Маржа (LS)</th>
                    <th className="px-3 py-2.5 font-medium text-gray-500 text-right">Реальная маржа</th>
                    <th className="px-3 py-2.5 font-medium text-gray-500 text-right">Доп. прибыль</th>
                    <th className="px-3 py-2.5 font-medium text-gray-500 text-right">Налог</th>
                    <th className="px-3 py-2.5 font-medium text-gray-500 text-right">Чистая прибыль</th>
                    <th className="px-3 py-2.5 font-medium text-gray-500 text-right">Покрытие</th>
                  </tr>
                </thead>
                <tbody>
                  {data.shops.map((shop, i) => {
                    const isExpanded = expandedShop === shop.shopId
                    const coverage   = shop.positionsTotal > 0
                      ? Math.round(shop.positionsWithCost / shop.positionsTotal * 100)
                      : 0
                    return (
                      <>
                        <tr
                          key={shop.shopId}
                          onClick={() => setExpandedShop(isExpanded ? null : shop.shopId)}
                          className={`border-b border-gray-100 cursor-pointer transition-colors ${
                            isExpanded ? 'bg-yellow-50/60' : i % 2 === 1 ? 'bg-gray-50/30 hover:bg-yellow-50/30' : 'hover:bg-yellow-50/30'
                          }`}
                        >
                          <td className="px-3 py-2.5 font-medium text-gray-800">{shop.shopName}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TAX_BADGE[shop.taxSystem] ?? 'bg-gray-50 text-gray-400'}`}>
                              {TAX_LABEL[shop.taxSystem] ?? shop.taxSystem}
                              {shop.taxRate > 0 && ` ${fmtPct(shop.taxRate)}`}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{fmtM(shop.revenue)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-400">{fmtM(shop.liveSkladMargin)}</td>
                          <td className="px-3 py-2.5 text-right font-medium text-blue-700">{fmtM(shop.realMargin)}</td>
                          <td className="px-3 py-2.5 text-right font-medium text-green-600">
                            {shop.extraProfit > 0 ? `+${fmtM(shop.extraProfit)}` : fmtM(shop.extraProfit)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-rose-600">
                            {shop.tax > 0 ? `−${fmtM(shop.tax)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-emerald-700">{fmtM(shop.netProfit)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={`text-[10px] ${coverage < 50 ? 'text-amber-600' : coverage < 80 ? 'text-gray-500' : 'text-green-600'}`}>
                              {coverage}%
                            </span>
                          </td>
                        </tr>

                        {/* Раскрытые позиции без цены */}
                        {isExpanded && shop.missingNames.length > 0 && (
                          <tr key={shop.shopId + '_missing'} className="bg-yellow-50/40 border-b border-yellow-100">
                            <td colSpan={9} className="px-6 py-3">
                              <p className="text-[10px] text-amber-700 font-medium mb-1.5">
                                Позиции без реальной цены ({shop.missingNames.length}) — считаются по LiveSklad:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {shop.missingNames.map(name => (
                                  <span key={name} className="text-[10px] px-1.5 py-0.5 bg-amber-50 border border-amber-100 rounded text-amber-800">
                                    {name}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>

                {/* Итоги */}
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                    <td className="px-3 py-2.5 text-gray-800" colSpan={2}>Итого</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{fmtM(data.totals.revenue)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400">{fmtM(data.totals.liveSkladMargin)}</td>
                    <td className="px-3 py-2.5 text-right text-blue-700">{fmtM(data.totals.realMargin)}</td>
                    <td className="px-3 py-2.5 text-right text-green-600">
                      {data.totals.extraProfit > 0 ? `+${fmtM(data.totals.extraProfit)}` : fmtM(data.totals.extraProfit)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-rose-600">
                      {data.totals.tax > 0 ? `−${fmtM(data.totals.tax)}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-emerald-700">{fmtM(data.totals.netProfit)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400 text-[10px]">
                      {Math.round(data.totals.positionsWithCost / (data.totals.positionsTotal || 1) * 100)}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="text-[10px] text-gray-400">
              Доп. прибыль = разница между реальной маржой и маржой из LiveSklad (скрытая прибыль от реальных цен закупа).
              Налог считается только с выручки по карте/ккм/кредиту.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
