'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Tier { id?: number; minMargin: string; salary: string }

function emptyTier(): Tier { return { minMargin: '', salary: '' } }

export default function SalaryTiersPage() {
  const [tiers,   setTiers]   = useState<Tier[]>([emptyTier()])
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(() => {
    fetch('/api/admin/salary-tiers')
      .then(r => r.json())
      .then(d => {
        if (d.tiers?.length) setTiers(d.tiers.map((t: any) => ({ id: t.id, minMargin: String(t.minMargin), salary: String(t.salary) })))
      })
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  function addTier() { setTiers(t => [...t, emptyTier()]) }
  function removeTier(i: number) { setTiers(t => t.filter((_, j) => j !== i)) }
  function updateTier(i: number, field: keyof Tier, val: string) {
    setTiers(t => t.map((item, j) => j === i ? { ...item, [field]: val } : item))
  }

  async function save() {
    setSaving(true); setMsg(null)
    const valid = tiers
      .filter(t => t.minMargin !== '' && t.salary !== '')
      .map(t => ({ minMargin: parseFloat(t.minMargin), salary: parseFloat(t.salary) }))
      .sort((a, b) => a.minMargin - b.minMargin)

    try {
      const res  = await fetch('/api/admin/salary-tiers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tiers: valid }) })
      const data = await res.json()
      if (!res.ok) { setMsg({ text: data.error ?? 'Ошибка', ok: false }); return }
      setMsg({ text: `Сохранено ${data.tiers.length} уровней`, ok: true })
      load()
    } catch (e: any) {
      setMsg({ text: e?.message ?? 'Ошибка', ok: false })
    } finally { setSaving(false) }
  }

  const sorted = [...tiers].map((t, i) => ({ ...t, _i: i })).sort((a, b) => {
    const am = parseFloat(a.minMargin) || 0
    const bm = parseFloat(b.minMargin) || 0
    return am - bm
  })

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin/sync" className="text-xs text-gray-400 hover:text-gray-600">← Назад</Link>
        <h1 className="font-semibold text-gray-900 mt-2">Уровни оклада</h1>
        <p className="text-xs text-gray-500 mt-1">
          Задайте пороги маржи за месяц и соответствующий оклад.<br/>
          Расчёт: оклад ÷ рабочих дней в месяце × смен сотрудника.
        </p>
      </div>

      {/* Таблица тиров */}
      <div className="rounded-xl border border-gray-100 overflow-hidden mb-4">
        <div className="grid grid-cols-[1fr_1fr_auto] bg-gray-50 border-b border-gray-100">
          <div className="px-3 py-2 text-xs font-medium text-gray-500">Маржа от, ₽</div>
          <div className="px-3 py-2 text-xs font-medium text-gray-500">Оклад, ₽</div>
          <div className="w-8"/>
        </div>
        {sorted.map(({ _i: i, ...t }) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] divide-x divide-gray-100 border-t border-gray-100">
            <input
              type="number" min={0} step={10000}
              value={t.minMargin}
              onChange={e => updateTier(i, 'minMargin', e.target.value)}
              placeholder="0"
              className="px-3 py-2 text-sm text-gray-700 focus:outline-none focus:bg-yellow-50/50"
            />
            <input
              type="number" min={0} step={5000}
              value={t.salary}
              onChange={e => updateTier(i, 'salary', e.target.value)}
              placeholder="0"
              className="px-3 py-2 text-sm text-gray-700 focus:outline-none focus:bg-yellow-50/50"
            />
            <button onClick={() => removeTier(i)} className="w-8 flex items-center justify-center text-gray-300 hover:text-red-400">
              ×
            </button>
          </div>
        ))}
      </div>

      <button onClick={addTier}
        className="w-full py-2 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors mb-6">
        + Добавить уровень
      </button>

      {/* Предпросмотр */}
      {sorted.filter(t => t.minMargin !== '' && t.salary !== '').length > 0 && (
        <div className="mb-6 bg-gray-50 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-gray-500 mb-2">Предпросмотр</p>
          {sorted
            .filter(t => t.minMargin !== '' && t.salary !== '')
            .map(({ _i: i, ...t }, idx, arr) => {
              const next = arr[idx + 1]
              const from = parseFloat(t.minMargin).toLocaleString('ru-RU')
              const to   = next ? (parseFloat(next.minMargin) - 1).toLocaleString('ru-RU') : '∞'
              return (
                <div key={i} className="flex justify-between text-xs text-gray-700">
                  <span>{from} — {to} ₽ маржи</span>
                  <span className="font-medium">{parseFloat(t.salary).toLocaleString('ru-RU')} ₽/мес</span>
                </div>
              )
            })}
        </div>
      )}

      <button onClick={save} disabled={saving}
        className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
        {saving ? 'Сохраняем...' : 'Сохранить'}
      </button>

      {msg && (
        <div className={`mt-4 px-4 py-3 rounded-lg text-sm ${msg.ok ? 'bg-green-50 border border-green-100 text-green-800' : 'bg-red-50 border border-red-100 text-red-700'}`}>
          {msg.ok ? '✓ ' : ''}{msg.text}
        </div>
      )}
    </div>
  )
}
