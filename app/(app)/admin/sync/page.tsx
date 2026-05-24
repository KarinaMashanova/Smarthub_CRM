'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface SyncLog {
  id: number
  entity: string
  status: string
  count: number
  error: string | null
  startedAt: string
  finishedAt: string | null
}

interface Counts {
  shops: number
  employees: number
  orders: number
  sales: number
  scheduleSlots: number
}

interface WeekResult {
  from: string
  to: string
  orders: number
  sales: number
  error?: string
}

const ENTITY_LABELS: Record<string, string> = {
  shops:            'Магазины',
  employees:        'Сотрудники',
  orders_delta:     'Заказы (дельта)',
  sales_delta:      'Продажи (дельта)',
  orders_backfill:  'Заказы (бэкфилл)',
  sales_backfill:   'Продажи (бэкфилл)',
}

function splitIntoWeeks(from: Date, to: Date): { from: Date; to: Date }[] {
  const weeks: { from: Date; to: Date }[] = []
  let cursor = new Date(from)
  while (cursor < to) {
    const end = new Date(Math.min(cursor.getTime() + 7 * 24 * 60 * 60 * 1000, to.getTime()))
    weeks.push({ from: new Date(cursor), to: end })
    cursor = end
  }
  return weeks
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

function duration(start: string, end: string | null) {
  if (!end) return '...'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const COUNT_LABELS: [keyof Counts, string][] = [
  ['shops',         'Магазины'],
  ['employees',     'Сотрудники'],
  ['orders',        'Заказы'],
  ['sales',         'Продажи'],
  ['scheduleSlots', 'Смены'],
]

export default function SyncPage() {
  const [logs, setLogs]     = useState<SyncLog[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loading, setLoading]   = useState(true)

  const [backfillFrom, setBackfillFrom] = useState('2026-04-01')
  const [backfillTo,   setBackfillTo]   = useState('2026-05-24')
  const [backfillRunning, setBackfillRunning] = useState(false)
  const [backfillResults, setBackfillResults] = useState<WeekResult[]>([])
  const [backfillTotal,   setBackfillTotal]   = useState(0)
  const [backfillCurrent, setBackfillCurrent] = useState(0)
  const [rateLimitUntil,  setRateLimitUntil]  = useState<Date | null>(null)
  const [rateLimitSecsLeft, setRateLimitSecsLeft] = useState(0)
  const cancelRef = useRef(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/sync-logs')
      .then(r => r.json())
      .then(d => { setLogs(d.logs); setCounts(d.counts); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function waitForRateLimit(resetAt: Date) {
    const interval = setInterval(() => {
      const secsLeft = Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000))
      setRateLimitSecsLeft(secsLeft)
      if (secsLeft === 0) clearInterval(interval)
    }, 1000)
    setRateLimitUntil(resetAt)
    setRateLimitSecsLeft(Math.ceil((resetAt.getTime() - Date.now()) / 1000))
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (Date.now() >= resetAt.getTime() || cancelRef.current) {
          clearInterval(check)
          clearInterval(interval)
          resolve()
        }
      }, 500)
    })
    setRateLimitUntil(null)
    setRateLimitSecsLeft(0)
  }

  async function runWeek(wFrom: Date, wTo: Date): Promise<{ orders: number; sales: number }> {
    const res = await fetch('/api/admin/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: wFrom.toISOString(), to: wTo.toISOString() }),
    })
    const data = await res.json()
    if (res.status === 429 && data.retryAfter) {
      await waitForRateLimit(new Date(data.retryAfter))
      if (cancelRef.current) throw new Error('Отменено')
      return runWeek(wFrom, wTo)
    }
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
    return { orders: data.orders, sales: data.sales }
  }

  async function startBackfill() {
    const from = new Date(backfillFrom)
    const to   = new Date(backfillTo + 'T23:59:59')
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) return

    const weeks = splitIntoWeeks(from, to)
    cancelRef.current = false
    setBackfillRunning(true)
    setBackfillResults([])
    setBackfillTotal(weeks.length)
    setBackfillCurrent(0)

    for (let i = 0; i < weeks.length; i++) {
      if (cancelRef.current) break
      setBackfillCurrent(i + 1)
      const { from: wFrom, to: wTo } = weeks[i]
      try {
        const result = await runWeek(wFrom, wTo)
        setBackfillResults(prev => [...prev, {
          from: wFrom.toISOString(), to: wTo.toISOString(), ...result,
        }])
      } catch (e: any) {
        setBackfillResults(prev => [...prev, {
          from: wFrom.toISOString(), to: wTo.toISOString(),
          orders: 0, sales: 0, error: e.message,
        }])
        if (!cancelRef.current) break
      }
    }

    setBackfillRunning(false)
    load()
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] overflow-hidden bg-white md:h-screen">
      <div className="shrink-0 border-b border-gray-100 px-6 py-3 flex items-center gap-3">
        <h1 className="font-semibold text-gray-900 text-sm">Синхронизация</h1>
        <button onClick={load} className="ml-auto text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">
          Обновить
        </button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 space-y-6">

        {/* DB counts */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Данные в базе</p>
          <div className="grid grid-cols-4 gap-2">
            {COUNT_LABELS.map(([key, label]) => (
              <div key={key} className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xl font-bold text-gray-900">
                  {counts ? counts[key].toLocaleString('ru-RU') : '—'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Backfill */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Восстановление данных</p>
          <div className="bg-gray-50 rounded-xl px-4 py-4 space-y-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">С</label>
                <input
                  type="date"
                  value={backfillFrom}
                  onChange={e => setBackfillFrom(e.target.value)}
                  disabled={backfillRunning}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">По</label>
                <input
                  type="date"
                  value={backfillTo}
                  onChange={e => setBackfillTo(e.target.value)}
                  disabled={backfillRunning}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
                />
              </div>
              <button
                onClick={() => { setBackfillFrom('2026-04-01'); setBackfillTo('2026-05-24') }}
                disabled={backfillRunning}
                className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 disabled:opacity-50"
              >
                Апр–Май 2026
              </button>
              <div className="ml-auto flex gap-2">
                {backfillRunning ? (
                  <button
                    onClick={() => { cancelRef.current = true }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200"
                  >
                    Остановить
                  </button>
                ) : (
                  <button
                    onClick={startBackfill}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Запустить восстановление
                  </button>
                )}
              </div>
            </div>

            {(backfillRunning || backfillResults.length > 0) && (
              <div className="space-y-1">
                {backfillRunning && rateLimitUntil ? (
                  <p className="text-xs text-amber-600 font-medium">
                    Лимит API — ждём сброса: {rateLimitSecsLeft} сек
                    ({rateLimitUntil.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
                  </p>
                ) : backfillRunning ? (
                  <p className="text-xs text-gray-500">
                    Неделя {backfillCurrent} / {backfillTotal}...
                  </p>
                ) : null}
                {backfillResults.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1 rounded-lg ${r.error ? 'bg-red-50' : 'bg-white'}`}>
                    <span className={r.error ? 'text-red-500' : 'text-green-600'}>
                      {r.error ? '✗' : '✓'}
                    </span>
                    <span className="text-gray-600 w-24 shrink-0">
                      {fmtDate(r.from)} — {fmtDate(r.to)}
                    </span>
                    {r.error ? (
                      <span className="text-red-500 truncate">{r.error}</span>
                    ) : (
                      <span className="text-gray-400">
                        заказы: {r.orders}, продажи: {r.sales}
                      </span>
                    )}
                  </div>
                ))}
                {!backfillRunning && backfillResults.length > 0 && (
                  <p className="text-xs text-gray-400 pt-1">
                    Итого: заказов {backfillResults.reduce((s, r) => s + r.orders, 0)},
                    продаж {backfillResults.reduce((s, r) => s + r.sales, 0)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Logs table */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Последние запуски</p>
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Загрузка...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              Синхронизаций ещё не было.
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-2.5 font-medium text-gray-500 w-8">#</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Сущность</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Статус</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500 text-right">Записей</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500 text-right">Время</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Запущен</th>
                    <th className="px-4 py-2.5 font-medium text-gray-500">Ошибка</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={log.id} className={`border-t border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-2.5 text-gray-300">{log.id}</td>
                      <td className="px-4 py-2.5 text-gray-700 font-medium">
                        {ENTITY_LABELS[log.entity] ?? log.entity}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                          log.status === 'ok'      ? 'bg-green-100 text-green-700' :
                          log.status === 'error'   ? 'bg-red-100 text-red-700' :
                          log.status === 'running' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {log.status === 'ok' ? 'ok' : log.status === 'error' ? 'ошибка' : 'запущен'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {log.count > 0 ? log.count.toLocaleString('ru-RU') : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-400">
                        {duration(log.startedAt, log.finishedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400">{fmt(log.startedAt)}</td>
                      <td className="px-4 py-2.5 text-red-500 max-w-xs truncate" title={log.error ?? ''}>
                        {log.error ?? ''}
                      </td>
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
