'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

interface SyncLog {
  id: number; entity: string; status: string; count: number
  error: string | null; startedAt: string; finishedAt: string | null
}
interface Counts { shops: number; employees: number; orders: number; sales: number; scheduleSlots: number }
interface WeekResult { from: string; to: string; orders: number; sales: number; error?: string }

const ENTITY_LABELS: Record<string, string> = {
  shops:                        'Магазины',
  employees:                    'Сотрудники',
  shops_directory_backfill:     'Магазины (сверка)',
  employees_directory_backfill: 'Сотрудники (сверка)',
  orders_delta:                 'Заказы (дельта)',
  sales_delta:                  'Продажи (дельта)',
  orders_backfill:              'Заказы (бэкфилл)',
  sales_backfill:               'Продажи (бэкфилл)',
}

const COUNT_LABELS: [keyof Counts, string][] = [
  ['shops', 'Магазины'], ['employees', 'Сотрудники'],
  ['orders', 'Заказы'], ['sales', 'Продажи'], ['scheduleSlots', 'Смены'],
]

function splitIntoWeeks(from: Date, to: Date) {
  const weeks: { from: Date; to: Date }[] = []
  let cursor = new Date(from)
  while (cursor < to) {
    const end = new Date(Math.min(cursor.getTime() + 7 * 86400000, to.getTime()))
    weeks.push({ from: new Date(cursor), to: end })
    cursor = end
  }
  return weeks
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}
function fmtTs(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function duration(start: string, end: string | null) {
  if (!end) return '...'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export default function SyncPage() {
  const [logs,    setLogs]    = useState<SyncLog[]>([])
  const [counts,  setCounts]  = useState<Counts | null>(null)
  const [loading, setLoading] = useState(true)

  const [backfillFrom,    setBackfillFrom]    = useState('2026-04-01')
  const [backfillTo,      setBackfillTo]      = useState('2026-05-24')
  const [backfillRunning, setBackfillRunning] = useState(false)
  const [backfillResults, setBackfillResults] = useState<WeekResult[]>([])
  const [backfillTotal,   setBackfillTotal]   = useState(0)
  const [backfillCurrent, setBackfillCurrent] = useState(0)
  const [rateLimitUntil,  setRateLimitUntil]  = useState<Date | null>(null)
  const [rateLimitSecsLeft, setRateLimitSecsLeft] = useState(0)
  const cancelRef = useRef(false)

  const [directoryRunning, setDirectoryRunning] = useState(false)
  const [directoryMsg,     setDirectoryMsg]     = useState('')

  const [vmrRunning, setVmrRunning] = useState(false)
  const [vmrMsg,     setVmrMsg]     = useState('')

  const [nastroykaRunning, setNastroykaRunning] = useState(false)
  const [nastroykaMsg,     setNastroykaMsg]     = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/sync-logs')
      .then(r => r.json())
      .then(d => { setLogs(d.logs); setCounts(d.counts); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function waitForRateLimit(resetAt: Date) {
    const iv = setInterval(() => {
      const s = Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000))
      setRateLimitSecsLeft(s)
      if (s === 0) clearInterval(iv)
    }, 1000)
    setRateLimitUntil(resetAt)
    setRateLimitSecsLeft(Math.ceil((resetAt.getTime() - Date.now()) / 1000))
    await new Promise<void>(resolve => {
      const c = setInterval(() => {
        if (Date.now() >= resetAt.getTime() || cancelRef.current) { clearInterval(c); clearInterval(iv); resolve() }
      }, 500)
    })
    setRateLimitUntil(null); setRateLimitSecsLeft(0)
  }

  async function runWeek(wFrom: Date, wTo: Date): Promise<{ orders: number; sales: number }> {
    const res  = await fetch('/api/admin/backfill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: wFrom.toISOString(), to: wTo.toISOString() }) })
    const data = await res.json()
    if (res.status === 429 && data.retryAfter) { await waitForRateLimit(new Date(data.retryAfter)); if (cancelRef.current) throw new Error('Отменено'); return runWeek(wFrom, wTo) }
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
    return { orders: data.orders, sales: data.sales }
  }

  async function startBackfill() {
    const from = new Date(backfillFrom), to = new Date(backfillTo + 'T23:59:59')
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) return
    const weeks = splitIntoWeeks(from, to)
    cancelRef.current = false
    setBackfillRunning(true); setBackfillResults([]); setBackfillTotal(weeks.length); setBackfillCurrent(0)
    for (let i = 0; i < weeks.length; i++) {
      if (cancelRef.current) break
      setBackfillCurrent(i + 1)
      const { from: wFrom, to: wTo } = weeks[i]
      try {
        const r = await runWeek(wFrom, wTo)
        setBackfillResults(p => [...p, { from: wFrom.toISOString(), to: wTo.toISOString(), ...r }])
      } catch (e: any) {
        setBackfillResults(p => [...p, { from: wFrom.toISOString(), to: wTo.toISOString(), orders: 0, sales: 0, error: e.message }])
        if (!cancelRef.current) break
      }
    }
    setBackfillRunning(false); load()
  }

  async function startDirectory() {
    setDirectoryRunning(true); setDirectoryMsg('')
    try {
      const res  = await fetch('/api/admin/directory-backfill', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(res.status === 429 && data.retryAfter ? `Лимит API до ${new Date(data.retryAfter).toLocaleTimeString('ru-RU')}` : (data.error ?? `HTTP ${res.status}`))
      setDirectoryMsg(`Салоны: ${data.shops ?? 0}, сотрудники: ${data.employees ?? 0}`)
      load()
    } catch (e: any) { setDirectoryMsg(e.message ?? 'Ошибка') }
    finally { setDirectoryRunning(false) }
  }

  async function startVmrRecalc() {
    setVmrRunning(true); setVmrMsg('')
    try {
      const res  = await fetch('/api/admin/vmr-recalc', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setVmrMsg(`Пересчитано заказов: ${data.count ?? 0}`)
    } catch (e: any) { setVmrMsg(e.message ?? 'Ошибка') }
    finally { setVmrRunning(false) }
  }

  async function startNastroykaRecalc() {
    setNastroykaRunning(true); setNastroykaMsg('')
    try {
      const res  = await fetch('/api/admin/nastroyka-recalc', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setNastroykaMsg(`Создано: ${data.created ?? 0}, удалено: ${data.deleted ?? 0}`)
    } catch (e: any) { setNastroykaMsg(e.message ?? 'Ошибка') }
    finally { setNastroykaRunning(false) }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)] overflow-hidden bg-white md:h-screen">
      <div className="shrink-0 border-b border-gray-100 px-4 py-2.5 flex items-center gap-3 md:px-6">
        <h1 className="font-semibold text-gray-900 text-sm">Синхронизация</h1>
        <button onClick={load} className="ml-auto text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
          Обновить
        </button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-4 md:px-6">

        {/* Счётчики */}
        <div className="flex flex-wrap gap-2">
          {COUNT_LABELS.map(([key, label]) => (
            <div key={key} className="bg-gray-50 rounded-xl px-3 py-2 flex items-baseline gap-2">
              <span className="text-sm font-bold text-gray-900">{counts ? counts[key].toLocaleString('ru-RU') : '—'}</span>
              <span className="text-xs text-gray-400">{label}</span>
            </div>
          ))}
        </div>

        {/* Действия */}
        <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">

          {/* Сверка справочников */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800">Салоны и сотрудники</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Сверить с LiveSklad — добавить новых, обновить существующих</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {directoryMsg && <span className="text-[11px] text-gray-500">{directoryMsg}</span>}
              <button onClick={startDirectory} disabled={directoryRunning}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                {directoryRunning ? 'Сверяем...' : 'Сверить'}
              </button>
            </div>
          </div>

          {/* Справочник товаров */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800">Справочник товаров</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Прайс для бонуса РЦ — Аксы, Стекло, Игрушки, Чехлы</p>
            </div>
            <Link href="/admin/catalog"
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors whitespace-nowrap shrink-0">
              Обновить →
            </Link>
          </div>

          {/* Реальные цены */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800">Реальные цены закупа</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Справочник реальных себестоимостей — только для администратора</p>
            </div>
            <Link href="/admin/real-costs"
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors whitespace-nowrap shrink-0">
              Открыть →
            </Link>
          </div>

          {/* Налоги */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800">Налоговые системы точек</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Разметить точки: АУСН / Патент и ставки</p>
            </div>
            <Link href="/admin/tax-config"
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors whitespace-nowrap shrink-0">
              Настроить →
            </Link>
          </div>

          {/* Чистая прибыль */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800">Отчёт: Чистая прибыль</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Реальная маржа с учётом настоящих цен закупа и налогов</p>
            </div>
            <Link href="/admin/profit"
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors whitespace-nowrap shrink-0">
              Открыть →
            </Link>
          </div>

          {/* Бонус Гангстер */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800">Бонус Гангстер</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Пороги маржи по салонам — прописать и пересчитать бонусы</p>
            </div>
            <Link href="/admin/gangster"
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors whitespace-nowrap shrink-0">
              Настроить →
            </Link>
          </div>

          {/* Уровни оклада */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800">Уровни оклада</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Пороги маржи → размер оклада за месяц</p>
            </div>
            <Link href="/admin/salary-tiers"
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors whitespace-nowrap shrink-0">
              Настроить →
            </Link>
          </div>

          {/* Пересчёт ВМР */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800">Пересчёт бонусов ВМР</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Пересчитать «За ВМР» по новым правилам (от 5 000 ₽, 25%) для всех заказов в БД</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {vmrMsg && <span className="text-[11px] text-gray-500">{vmrMsg}</span>}
              <button onClick={startVmrRecalc} disabled={vmrRunning}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                {vmrRunning ? 'Пересчёт...' : 'Пересчитать'}
              </button>
            </div>
          </div>

          {/* Пересчёт Настройка */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800">Пересчёт бонусов Настройка</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Комплексная настройка ≥5000 → 50%, Стандартная / Настройка бонус → 30%</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {nastroykaMsg && <span className="text-[11px] text-gray-500">{nastroykaMsg}</span>}
              <button onClick={startNastroykaRecalc} disabled={nastroykaRunning}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                {nastroykaRunning ? 'Пересчёт...' : 'Пересчитать'}
              </button>
            </div>
          </div>

          {/* Восстановление */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-gray-800">Восстановление данных</p>
            <div className="flex flex-wrap gap-2 items-center">
              <input type="date" value={backfillFrom} onChange={e => setBackfillFrom(e.target.value)} disabled={backfillRunning}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#FFD600]" />
              <span className="text-xs text-gray-400">—</span>
              <input type="date" value={backfillTo} onChange={e => setBackfillTo(e.target.value)} disabled={backfillRunning}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#FFD600]" />
              <button onClick={() => { setBackfillFrom('2026-04-01'); setBackfillTo('2026-05-24') }} disabled={backfillRunning}
                className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 disabled:opacity-50">
                Апр–Май 2026
              </button>
              <div className="ml-auto">
                {backfillRunning ? (
                  <button onClick={() => { cancelRef.current = true }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200">
                    Остановить
                  </button>
                ) : (
                  <button onClick={startBackfill}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                    Запустить
                  </button>
                )}
              </div>
            </div>
            {(backfillRunning || backfillResults.length > 0) && (
              <div className="space-y-1 mt-1">
                {backfillRunning && rateLimitUntil
                  ? <p className="text-xs text-amber-600">Лимит API — ждём: {rateLimitSecsLeft}с</p>
                  : backfillRunning
                  ? <p className="text-xs text-gray-500">Неделя {backfillCurrent} / {backfillTotal}...</p>
                  : null}
                {backfillResults.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1 rounded-lg ${r.error ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <span className={r.error ? 'text-red-500' : 'text-green-600'}>{r.error ? '✗' : '✓'}</span>
                    <span className="text-gray-500 w-20 shrink-0">{fmtDate(r.from)} — {fmtDate(r.to)}</span>
                    <span className={r.error ? 'text-red-500 truncate' : 'text-gray-400'}>
                      {r.error ?? `заказы: ${r.orders}, продажи: ${r.sales}`}
                    </span>
                  </div>
                ))}
                {!backfillRunning && backfillResults.length > 0 && (
                  <p className="text-xs text-gray-400">
                    Итого: заказов {backfillResults.reduce((s, r) => s + r.orders, 0)}, продаж {backfillResults.reduce((s, r) => s + r.sales, 0)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Логи */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Последние запуски</p>
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Загрузка...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Синхронизаций ещё не было</div>
          ) : (
            <div className="rounded-xl border border-gray-100 overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="bg-gray-50 text-left border-b border-gray-100">
                    <th className="px-3 py-2 font-medium text-gray-500">Сущность</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Статус</th>
                    <th className="px-3 py-2 font-medium text-gray-500 text-right">Записей</th>
                    <th className="px-3 py-2 font-medium text-gray-500 text-right">Время</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Запущен</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Ошибка</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={log.id} className={`border-t border-gray-100 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-3 py-2 text-gray-700 font-medium">{ENTITY_LABELS[log.entity] ?? log.entity}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          log.status === 'ok'      ? 'bg-green-100 text-green-700' :
                          log.status === 'error'   ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {log.status === 'ok' ? 'ok' : log.status === 'error' ? 'ошибка' : 'запущен'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{log.count > 0 ? log.count.toLocaleString('ru-RU') : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-400">{duration(log.startedAt, log.finishedAt)}</td>
                      <td className="px-3 py-2 text-gray-400">{fmtTs(log.startedAt)}</td>
                      <td className="px-3 py-2 text-red-500 max-w-xs truncate" title={log.error ?? ''}>{log.error ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
