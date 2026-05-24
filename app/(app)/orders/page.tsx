'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import Link from 'next/link'
import { HelpModal } from '../components/HelpModal'

interface Order {
  id: string
  number: string | null
  num: number | null
  shopId: string
  shop: { name: string }
  dateCreate: string | null
  dateClose: string | null
  lastAction: string | null
  managerName: string | null
  masterName: string | null
  statusName: string | null
  statusColor: string | null
  statusType: string | null
  orderTypeName: string | null
  paymentType: string | null
  revenue: number
  financeRevenue: number
  orderReturn: number
  isReturn: boolean
  isVisible: boolean
  brand: string | null
  model: string | null
  typeDevice: string | null
  margin: number | null
  isHighMargin: boolean
  hasWorkFee: boolean
  vmrBonus: number
  cashBonus: number
}

interface Position {
  id: string; name: string; isWork: boolean
  soldPrice: number; count: number; purchasePriceSumm: number
}

interface OrderDetail { id: string; revenue: number; orderReturn: number; positions: Position[] }
interface Session { name: string; role: 'MANAGER' | 'ADMIN'; shopId: string | null }
interface ShopOption { id: string; name: string }
interface OrdersSummary {
  revenue: number
  margin: number
  withMargin: number
  withoutPositions: number
  highMargin: number
  returns: number
  deleted: number
  avgCheck: number
}

const MONTH_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

const HELP_ITEMS = [
  { label: 'Синхронизация', desc: 'Заказы обновляются из LiveSklad по расписанию каждые 15 минут. Дельта берёт изменения за последний час по lastAction и обновляет заказ через upsert.' },
  { label: 'Период', desc: 'По умолчанию показывается текущий год и выбранный период. Фильтрация идёт по дате выдачи заказа (dateClose).' },
  { label: 'Фильтры', desc: 'Доступны фильтры по салону, менеджеру, мастеру, статусу, оплате, марже, позициям, возвратам и удалённым заказам. Все фильтры комбинируются.' },
  { label: 'Маржа', desc: 'Маржа = выручка минус себестоимость позиций. Возвраты и удалённые заказы не входят в выручку, маржу, бонусы и ЗП.' },
  { label: 'Позиции', desc: 'Нажми на строку заказа — раскроется список позиций с ценой и себестоимостью. Если LiveSklad отдаёт заказ без позиций, он попадает в фильтр «Без позиций».' },
  { label: 'ВМР', desc: 'ВМР считается при марже от 4 000 ₽. Авто-бонус 20% от маржи сохраняется в БД как «Бонус / За ВМР» и пересчитывается при обновлении заказа.' },
  { label: 'Бонус за наличность', desc: 'Если заказ оплачен только наличными, создаётся авто-бонус 2,5% от маржи как «Бонус / За наличность».' },
  { label: 'ЗП день в день', desc: 'Плашка для оплаты работы появляется только если мастер совпадает с менеджером, заказ активный, не возврат, есть позиции и маржа не ниже 4 000 ₽. По одному заказу оплату за работу можно добавить только один раз.' },
]

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}`
}
function fmtMoney(n: number) {
  if (n === 0) return '—'
  return n.toLocaleString('ru-RU') + ' ₽'
}

const ORDER_TYPE_COLORS: Record<string, string> = {
  'Платный':    'bg-green-50 text-green-700',
  'Гарантия':   'bg-blue-50 text-blue-700',
  'Бесплатный': 'bg-gray-100 text-gray-500',
}

export default function OrdersPage() {
  const now = new Date()
  const [session, setSession]   = useState<Session | null>(null)
  const [orders, setOrders]     = useState<Order[]>([])
  const [total, setTotal]       = useState(0)
  const [pages, setPages]       = useState(1)
  const [page, setPage]         = useState(1)
  const [statuses, setStatuses] = useState<string[]>([])
  const [shops, setShops]       = useState<ShopOption[]>([])
  const [managers, setManagers] = useState<string[]>([])
  const [masters, setMasters]   = useState<string[]>([])
  const [paymentTypes, setPaymentTypes] = useState<string[]>([])
  const [summary, setSummary] = useState<OrdersSummary | null>(null)
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState<'list' | 'stats'>('list')
  const [showHelp, setShowHelp] = useState(false)

  // Фильтры
  const year = now.getFullYear()
  const [month, setMonth]         = useState(now.getMonth())
  const [periodMode, setPeriodMode] = useState<'month' | 'today' | 'yesterday' | 'custom'>('month')
  const [customFrom, setCustomFrom] = useState<string | null>(null)
  const [customTo, setCustomTo]     = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [status, setStatus]       = useState('')
  const [shopId, setShopId]       = useState('')
  const [manager, setManager]     = useState('')
  const [master, setMaster]       = useState('')
  const [paymentType, setPaymentType] = useState('')
  const [marginMode, setMarginMode] = useState<'all' | 'only' | 'exclude'>('all')
  const [positionMode, setPositionMode] = useState<'all' | 'with' | 'without'>('all')
  const [returnMode, setReturnMode] = useState<'all' | 'only' | 'exclude'>('all')
  const [visibility, setVisibility] = useState<'all' | 'visible' | 'hidden'>('visible')
  const [workFeeMode, setWorkFeeMode] = useState<'all' | 'available'>('all')

  // Детали строк
  const [expanded, setExpanded]         = useState<Set<string>>(new Set())
  const [details, setDetails]           = useState<Record<string, OrderDetail>>({})
  const [detailLoading, setDetailLoading] = useState<Set<string>>(new Set())

  // Оплата за работу
  const [workFeeInput,   setWorkFeeInput]   = useState<Record<string, string>>({})
  const [workFeeDate,    setWorkFeeDate]    = useState<Record<string, string>>({})
  const [workFeeLoading, setWorkFeeLoading] = useState<Set<string>>(new Set())
  const [workFeeOk,      setWorkFeeOk]      = useState<Set<string>>(new Set())

  const todayISO     = toISO(new Date())
  const yesterdayISO = toISO(new Date(Date.now() - 86400000))
  const monthFrom = toISO(new Date(year, month, 1))
  const monthTo = toISO(new Date(year, month + 1, 0))
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

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ from, to, page: String(page) })
    if (search) p.set('search', search)
    if (status) p.set('status', status)
    if (shopId) p.set('shopId', shopId)
    if (manager) p.set('manager', manager)
    if (master) p.set('master', master)
    if (paymentType) p.set('paymentType', paymentType)
    p.set('marginMode', marginMode)
    p.set('positionMode', positionMode)
    p.set('returnMode', returnMode)
    p.set('visibility', visibility)
    p.set('workFeeMode', workFeeMode)
    fetch(`/api/orders?${p}`)
      .then(r => r.json())
      .then(d => {
        setOrders(d.orders ?? [])
        setTotal(d.total)
        setPages(d.pages)
        if (d.statuses?.length) setStatuses(d.statuses)
        if (d.shops?.length) setShops(d.shops)
        if (d.managers?.length) setManagers(d.managers)
        if (d.masters?.length)  setMasters(d.masters)
        if (d.paymentTypes?.length) setPaymentTypes(d.paymentTypes)
        setSummary(d.summary ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [from, to, page, search, status, shopId, manager, master, paymentType, marginMode, positionMode, returnMode, visibility, workFeeMode])

  useEffect(() => { setPage(1); setExpanded(new Set()) }, [from, to, search, status, shopId, manager, master, paymentType, marginMode, positionMode, returnMode, visibility, workFeeMode])
  useEffect(() => { load() }, [load])

  function toggleRow(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); return next }
      next.add(id)
      if (!details[id]) {
        setDetailLoading(dl => new Set(dl).add(id))
        fetch(`/api/orders/${id}`)
          .then(r => r.json())
          .then(d => {
            setDetails(prev => ({ ...prev, [id]: d }))
            setDetailLoading(dl => { const s = new Set(dl); s.delete(id); return s })
          })
      }
      return next
    })
  }

  async function addWorkFee(orderId: string) {
    const raw = workFeeInput[orderId] ?? ''
    const amount = parseFloat(raw.replace(',', '.'))
    if (!amount || amount <= 0) return
    setWorkFeeLoading(prev => new Set([...prev, orderId]))
    try {
      const res = await fetch(`/api/orders/${orderId}/work-fee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, date: workFeeDate[orderId] ?? todayISO, paymentDate: workFeeDate[orderId] ?? todayISO }),
      })
      if (res.ok) {
        setWorkFeeOk(prev => new Set([...prev, orderId]))
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, hasWorkFee: true } : o))
        setWorkFeeInput(prev => ({ ...prev, [orderId]: '' }))
        setTimeout(() => setWorkFeeOk(prev => { const s = new Set(prev); s.delete(orderId); return s }), 3000)
      } else if (res.status === 409) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, hasWorkFee: true } : o))
      }
    } finally {
      setWorkFeeLoading(prev => { const s = new Set(prev); s.delete(orderId); return s })
    }
  }

  const isAdmin = session?.role === 'ADMIN'
  const colSpan = isAdmin ? 13 : 12
  const hasExtraFilters = search || status || shopId || manager || master || paymentType || marginMode !== 'all' || positionMode !== 'all' || returnMode !== 'all' || visibility !== 'visible'

  function resetFilters() {
    setSearch('')
    setStatus('')
    setShopId('')
    setManager('')
    setMaster('')
    setPaymentType('')
    setMarginMode('all')
    setPositionMode('all')
    setReturnMode('all')
    setVisibility('visible')
  }

  function selectQuickPeriod(mode: 'month' | 'today' | 'yesterday') {
    setPeriodMode(mode)
    setCustomFrom(null)
    setCustomTo(null)
  }

  const totalRevenue  = summary?.revenue ?? orders.reduce((s, o) => s + o.financeRevenue, 0)
  const totalMargin   = summary?.margin ?? orders.reduce((s, o) => s + (o.margin ?? 0), 0)
  const withPositions = summary?.withMargin ?? orders.filter(o => o.margin !== null).length
  const highMarginCnt = summary?.highMargin ?? orders.filter(o => o.isHighMargin).length

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] overflow-hidden bg-white md:h-screen">

      {/* Top bar */}
      <div className="shrink-0 border-b border-gray-100 px-4 pt-2.5 pb-2">
        <div className="flex items-center gap-2 pb-2 flex-wrap">
          <h1 className="font-semibold text-gray-900 text-sm shrink-0">Заказы</h1>

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

          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Номер, мастер, салон..."
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
            {[
              ['month', 'Месяц'],
              ['today', 'Сегодня'],
              ['yesterday', 'Вчера'],
              ['custom', 'Период'],
            ].map(([mode, label]) => (
              <button key={mode} onClick={() => {
                if (mode === 'custom') {
                  setPeriodMode('custom')
                  setCustomFrom(from)
                  setCustomTo(to)
                } else {
                  selectQuickPeriod(mode as 'month' | 'today' | 'yesterday')
                }
              }}
                className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${
                  periodMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {periodMode === 'month' ? (
            <select value={month} onChange={e => { setMonth(Number(e.target.value)); selectQuickPeriod('month') }}
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

          <span className="ml-auto text-xs text-gray-400 self-center">{total.toLocaleString('ru-RU')} заказов</span>
        </div>

        {/* Ряд 3: фильтры */}
        <div className="bg-gray-50 rounded-lg px-2 py-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={marginMode} onChange={e => setMarginMode(e.target.value as 'all' | 'only' | 'exclude')}
              className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] max-w-[120px]">
              <option value="all">Все по марже</option>
              <option value="only">Только ВМР</option>
              <option value="exclude">Без ВМР</option>
            </select>

            <select value={positionMode} onChange={e => setPositionMode(e.target.value as 'all' | 'with' | 'without')}
              className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] max-w-[130px]">
              <option value="all">Любые позиции</option>
              <option value="with">С позициями</option>
              <option value="without">Без позиций</option>
            </select>

            <select value={returnMode} onChange={e => setReturnMode(e.target.value as 'all' | 'only' | 'exclude')}
              className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] max-w-[130px]">
              <option value="all">Все заказы</option>
              <option value="only">Только возвраты</option>
              <option value="exclude">Без возвратов</option>
            </select>

            <select value={visibility} onChange={e => setVisibility(e.target.value as 'all' | 'visible' | 'hidden')}
              className="h-7 px-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] max-w-[150px]">
              <option value="visible">Активные</option>
              <option value="hidden">Удалённые</option>
              <option value="all">Активные и удалённые</option>
            </select>

            <button
              onClick={() => setWorkFeeMode(m => m === 'available' ? 'all' : 'available')}
              className={`h-7 px-2.5 text-xs rounded-lg border transition-colors ${
                workFeeMode === 'available'
                  ? 'bg-gray-700 border-gray-700 text-white'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100'
              }`}>
              ЗП день в день
            </button>
          </div>
        </div>
      </div>

      {/* Статистика */}
      {view === 'stats' && (
        <div className="shrink-0 border-b border-gray-100 px-4 py-3 bg-gray-50">
          <div className="grid grid-cols-4 xl:grid-cols-8 gap-2">
            {[
              { label: 'Заказов', value: total.toLocaleString('ru-RU'), color: 'text-gray-800' },
              { label: 'Выручка', value: fmtMoney(totalRevenue), color: 'text-green-700' },
              { label: 'Маржа', value: withPositions ? fmtMoney(totalMargin) : '—', color: 'text-blue-700' },
              { label: 'Средний чек', value: summary?.avgCheck ? fmtMoney(summary.avgCheck) : '—', color: 'text-sky-700' },
              { label: 'ВМР заказов', value: withPositions ? String(highMarginCnt) : '—', color: 'text-amber-600' },
              { label: 'Без позиций', value: summary ? String(summary.withoutPositions) : '—', color: 'text-gray-500' },
              { label: 'Возвраты', value: summary ? String(summary.returns) : '—', color: 'text-rose-600' },
              { label: 'Удалённые', value: summary ? String(summary.deleted) : '—', color: 'text-red-600' },
            ].map(k => (
              <div key={k.label} className="bg-white border border-gray-100 rounded-lg px-2.5 py-2 shadow-sm">
                <p className="text-[10px] text-gray-400">{k.label}</p>
                <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">* Маржа считается только по заказам с загруженными позициями ({withPositions} из {total})</p>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading && orders.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">Загрузка...</div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-gray-400 text-sm">Нет заказов за выбранный период</p>
            {isAdmin && (
              <Link href="/admin/sync"
                className="px-4 py-2 text-xs rounded-xl bg-[#FFD600] text-black font-medium hover:bg-[#e6c200]">
                Запустить синхронизацию →
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full min-w-[1080px] text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-2 py-2.5 font-medium text-gray-500 w-6"></th>
                <th className="px-2 py-2.5 font-medium text-gray-500 w-14">№</th>
                {isAdmin && (
                  <th className="px-2 py-1.5 font-medium text-gray-500 w-24">
                    <select value={shopId} onChange={e => setShopId(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="w-full h-6 px-1.5 text-[11px] rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#FFD600]">
                      <option value="">Магазин</option>
                      {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </th>
                )}
                <th className="px-2 py-2.5 font-medium text-gray-500 w-20">Тип</th>
                <th className="px-2 py-2.5 font-medium text-gray-500 w-10">Созд.</th>
                <th className="px-2 py-2.5 font-medium text-gray-500 w-10">Выд.</th>
                <th className="px-2 py-2.5 font-medium text-gray-500">Устройство</th>
                <th className="px-2 py-1.5 font-medium text-gray-500">
                  {isAdmin ? (
                    <select value={manager} onChange={e => setManager(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="w-full h-6 px-1.5 text-[11px] rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#FFD600]">
                      <option value="">Менеджер</option>
                      {managers.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : 'Менеджер'}
                </th>
                <th className="px-2 py-1.5 font-medium text-gray-500">
                  {isAdmin ? (
                    <select value={master} onChange={e => setMaster(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="w-full h-6 px-1.5 text-[11px] rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#FFD600]">
                      <option value="">Мастер</option>
                      {masters.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : 'Мастер'}
                </th>
                <th className="px-2 py-1.5 font-medium text-gray-500 w-24">
                  <select value={status} onChange={e => setStatus(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="w-full h-6 px-1.5 text-[11px] rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#FFD600]">
                    <option value="">Статус</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </th>
                <th className="px-2 py-1.5 font-medium text-gray-500 w-20">
                  <select value={paymentType} onChange={e => setPaymentType(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="w-full h-6 px-1.5 text-[11px] rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#FFD600]">
                    <option value="">Оплата</option>
                    {paymentTypes.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </th>
                <th className="px-2 py-2.5 font-medium text-gray-500 w-24 text-right">Сумма</th>
                <th className="px-2 py-2.5 font-medium text-gray-500 w-32 text-right">Маржа</th>
                <th className="px-2 py-2.5 font-medium text-gray-500 w-28 text-right">Бонусы</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => {
                const isOpen = expanded.has(o.id)
                const detail = details[o.id]
                const isLoading = detailLoading.has(o.id)
                const device = [o.typeDevice, o.brand, o.model].filter(Boolean).join(' ') || '—'
                const isReturn = o.isReturn || o.orderReturn > 0
                const canTakeSameDayWorkFee = Boolean(o.managerName && o.masterName && o.managerName === o.masterName && o.isHighMargin)

                return (
                  <Fragment key={o.id}>
                    <tr
                      onClick={() => toggleRow(o.id)}
                      className={`border-b border-gray-100 cursor-pointer transition-colors ${
                        !o.isVisible ? 'bg-red-50/40 text-gray-400' :
                        isReturn ? 'bg-rose-50/40' :
                        isOpen ? 'bg-yellow-50/60' : i % 2 === 1 ? 'bg-gray-50/30 hover:bg-yellow-50/30' : 'hover:bg-yellow-50/30'
                      }`}>

                      <td className="px-2 py-2 text-gray-300 text-center select-none">
                        {isOpen ? '▾' : '▸'}
                      </td>
                      <td className="px-2 py-2 font-medium text-gray-700">{o.num ?? o.number ?? '—'}</td>
                      {isAdmin && <td className="px-2 py-2 text-gray-500 truncate max-w-[112px]">{o.shop.name}</td>}

                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {o.orderTypeName ? (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${ORDER_TYPE_COLORS[o.orderTypeName] ?? 'bg-gray-100 text-gray-600'}`}>
                              {o.orderTypeName}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                          {isReturn && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-700">
                              Возврат
                            </span>
                          )}
                          {!o.isVisible && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                              Удалён
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-2 py-2 text-gray-400">{fmtDate(o.dateCreate)}</td>
                      <td className="px-2 py-2 text-gray-700 font-medium">{fmtDate(o.dateClose)}</td>
                      <td className="px-2 py-2 text-gray-700 truncate max-w-[130px]">{device}</td>
                      <td className="px-2 py-2 text-gray-500 truncate max-w-[110px]">{o.managerName ?? '—'}</td>
                      <td className="px-2 py-2 text-gray-700 truncate max-w-[110px]">{o.masterName ?? '—'}</td>

                      <td className="px-2 py-2">
                        {o.statusName ? (
                          <span className="inline-flex items-center gap-1">
                            {o.statusColor && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: o.statusColor }}/>}
                            <span className="text-gray-700 truncate">{o.statusName}</span>
                          </span>
                        ) : '—'}
                      </td>

                      <td className="px-2 py-2 text-gray-500 truncate max-w-[80px]">{o.paymentType ?? '—'}</td>

                      <td className="px-2 py-2 text-right font-semibold text-gray-800">
                        {fmtMoney(o.revenue)}
                        {o.orderReturn > 0 && (
                          <div className="text-[10px] text-rose-600 font-medium">−{fmtMoney(o.orderReturn)}</div>
                        )}
                      </td>

                      <td className="px-2 py-2 text-right align-top">
                        {o.margin === null
                          ? <span className="text-gray-300">—</span>
                          : (
                            <div className="flex flex-col items-end gap-1 min-w-28">
                              <span className={`font-semibold whitespace-nowrap ${o.margin >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {fmtMoney(o.margin)}
                              </span>
                            </div>
                          )}
                      </td>

                      <td className="px-2 py-2 text-right align-top">
                        {(o.vmrBonus > 0 || o.cashBonus > 0) ? (
                          <div className="flex flex-col items-end gap-0.5 text-[10px] leading-tight font-medium">
                            {o.vmrBonus > 0 && (
                              <span className="whitespace-nowrap rounded bg-amber-50 text-amber-700 px-1.5 py-0.5">
                                ВМР +{fmtMoney(o.vmrBonus)}
                              </span>
                            )}
                            {o.cashBonus > 0 && (
                              <span className="whitespace-nowrap rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5">
                                Нал +{fmtMoney(o.cashBonus)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                    </tr>

                    {/* Развёрнутые позиции */}
                    {isOpen && (
                      <tr className="bg-yellow-50/40 border-b border-yellow-100">
                        <td colSpan={colSpan + 1} className="px-8 py-3">
                          {isLoading ? (
                            <p className="text-xs text-gray-400">Загрузка позиций...</p>
                          ) : !detail || detail.positions.length === 0 ? (
                            <p className="text-xs text-gray-400">Позиции не загружены</p>
                          ) : (
                            <div className="max-w-xl">
                              <table className="w-full min-w-[620px] text-xs mb-2">
                                <thead>
                                  <tr className="text-gray-400 border-b border-gray-200">
                                    <th className="text-left py-1 font-medium">Позиция</th>
                                    <th className="text-left py-1 font-medium w-20">Тип</th>
                                    <th className="text-right py-1 font-medium w-8">Кол.</th>
                                    <th className="text-right py-1 font-medium w-24">Цена</th>
                                    <th className="text-right py-1 font-medium w-24">Себест.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.positions.map(p => (
                                    <tr key={p.id} className="border-b border-gray-100">
                                      <td className="py-1.5 text-gray-800">{p.name}</td>
                                      <td className="py-1.5">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${p.isWork ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                          {p.isWork ? '🔧 Работа' : '📦 Запчасть'}
                                        </span>
                                      </td>
                                      <td className="py-1.5 text-right text-gray-500">{p.count}</td>
                                      <td className="py-1.5 text-right text-gray-700">{p.soldPrice > 0 ? fmtMoney(p.soldPrice) : '—'}</td>
                                      <td className="py-1.5 text-right text-gray-400">{p.purchasePriceSumm > 0 ? fmtMoney(p.purchasePriceSumm) : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="text-xs text-gray-400 pt-0.5">
                                Себест. итого: <span className="text-gray-600 font-medium">
                                  {fmtMoney(detail.positions.reduce((s, p) => s + p.purchasePriceSumm, 0))}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Оплата за работу по ремонту */}
                          {canTakeSameDayWorkFee && (
                            <div
                              className="mt-3 pt-3 border-t border-yellow-100 flex items-center gap-2 flex-wrap"
                              onClick={e => e.stopPropagation()}>
                              {o.hasWorkFee ? (
                                <span className="text-[10px] font-medium text-green-700 bg-green-50 border border-green-100 rounded-full px-2 py-1">
                                  Оплата за работу уже добавлена
                                </span>
                              ) : (
                                <>
                                  <span className="text-[10px] font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-full px-2 py-1">
                                    Вы можете забрать ЗП за работу день в день
                                  </span>
                                  <span className="text-xs text-gray-500 shrink-0">Оплата за работу:</span>
                                  <input
                                    type="date"
                                    value={workFeeDate[o.id] ?? todayISO}
                                    onChange={e => setWorkFeeDate(prev => ({ ...prev, [o.id]: e.target.value }))}
                                    className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="Сумма"
                                    value={workFeeInput[o.id] ?? ''}
                                    onChange={e => setWorkFeeInput(prev => ({ ...prev, [o.id]: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && addWorkFee(o.id)}
                                    className="w-28 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
                                  />
                                  <span className="text-xs text-gray-400">₽</span>
                                  <button
                                    onClick={() => addWorkFee(o.id)}
                                    disabled={workFeeLoading.has(o.id) || !workFeeInput[o.id]}
                                    className="px-3 py-1 bg-gray-700 text-white rounded text-xs font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors">
                                    {workFeeLoading.has(o.id) ? '...' : 'Добавить'}
                                  </button>
                                </>
                              )}
                              {workFeeOk.has(o.id) && (
                                <span className="text-xs text-green-600 font-medium">✓ Записано</span>
                              )}
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
          title="Заказы — справка"
          color="bg-yellow-50 border-yellow-100"
          dot="bg-yellow-400"
          items={HELP_ITEMS}
          onClose={() => setShowHelp(false)}
        />
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="shrink-0 border-t border-gray-100 px-4 py-2 flex items-center justify-between">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40">← Назад</button>
          <span className="text-xs text-gray-400">Стр. {page} из {pages} · {total.toLocaleString('ru-RU')} заказов</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
            className="px-3 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40">Вперёд →</button>
        </div>
      )}
    </div>
  )
}
