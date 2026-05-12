'use client'

import { useState, useEffect, useCallback } from 'react'

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

const ENTITY_LABELS: Record<string, string> = {
  shops:          'Магазины',
  employees:      'Сотрудники',
  orders_delta:   'Заказы (дельта)',
  sales_delta:    'Продажи (дельта)',
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
  const [syncing, setSyncing]   = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/sync-logs')
      .then(r => r.json())
      .then(d => { setLogs(d.logs); setCounts(d.counts); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function runSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      setSyncResult(data.ok ? 'ok' : data.error ?? 'error')
    } catch (e: unknown) {
      setSyncResult(e instanceof Error ? e.message : 'error')
    } finally {
      setSyncing(false)
      load()
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
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

        {/* Manual sync */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500">Ручной запуск</p>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={runSync} disabled={syncing}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 transition-colors">
              {syncing ? 'Запускается...' : 'Запустить дельта-синк'}
            </button>
            <span className="text-xs text-gray-400">заказы и продажи за последний час</span>
            {syncResult && !syncing && (
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                syncResult === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {syncResult === 'ok' ? 'Успешно' : `Ошибка: ${syncResult}`}
              </span>
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
              Синхронизаций ещё не было. Запустите дельта-синк или полный синк выше.
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-xs">
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
