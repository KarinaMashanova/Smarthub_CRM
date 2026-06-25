'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Item { id?: number; name: string; realCost: string }

function emptyItem(): Item { return { name: '', realCost: '' } }

export default function RealCostsPage() {
  const [items,   setItems]   = useState<Item[]>([emptyItem()])
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null)
  const [search,  setSearch]  = useState('')

  const load = useCallback(() => {
    fetch('/api/admin/real-costs')
      .then(r => r.json())
      .then(d => {
        if (d.items?.length) {
          setItems(d.items.map((i: any) => ({ id: i.id, name: i.name, realCost: String(i.realCost) })))
        }
      })
  }, [])

  useEffect(() => { load() }, [load])

  function addItem() { setItems(i => [...i, emptyItem()]) }
  function removeItem(idx: number) { setItems(i => i.filter((_, j) => j !== idx)) }
  function update(idx: number, field: keyof Item, val: string) {
    setItems(i => i.map((item, j) => j === idx ? { ...item, [field]: val } : item))
  }

  async function save() {
    setSaving(true); setMsg(null)
    const valid = items
      .filter(i => i.name.trim() && i.realCost !== '')
      .map(i => ({ name: i.name.trim(), realCost: parseFloat(i.realCost) }))

    try {
      const res  = await fetch('/api/admin/real-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: valid }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ text: data.error ?? 'Ошибка', ok: false }); return }
      setMsg({ text: `Сохранено ${data.count} позиций`, ok: true })
      load()
    } catch (e: any) {
      setMsg({ text: e?.message ?? 'Ошибка', ok: false })
    } finally { setSaving(false) }
  }

  const filledCount  = items.filter(i => i.name.trim() && i.realCost !== '').length
  // Сохраняем оригинальный индекс при фильтрации, чтобы update/removeItem работали корректно
  const visibleItems = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => !search || item.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin/sync" className="text-xs text-gray-400 hover:text-gray-600">← Назад</Link>
        <h1 className="font-semibold text-gray-900 mt-2">Реальные цены закупа</h1>
        <p className="text-xs text-gray-500 mt-1">
          Справочник реальных себестоимостей — виден только администратору.<br/>
          Используется для расчёта чистой прибыли в отчёте. Совпадение по точному названию позиции.
        </p>
      </div>

      {/* Поиск + счётчик */}
      <div className="flex items-center gap-3 mb-3">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию..."
          className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFD600]"
        />
        <span className="text-xs text-gray-400 shrink-0">
          {search ? `${visibleItems.length} из ${filledCount}` : `${filledCount} позиций`}
        </span>
      </div>

      {/* Таблица */}
      <div className="rounded-xl border border-gray-100 overflow-hidden mb-4">
        <div className="grid grid-cols-[1fr_140px_32px] bg-gray-50 border-b border-gray-100">
          <div className="px-3 py-2 text-xs font-medium text-gray-500">Название позиции</div>
          <div className="px-3 py-2 text-xs font-medium text-gray-500 text-right">Реальная себест., ₽</div>
          <div />
        </div>

        {visibleItems.map(({ item, idx }) => (
          <div key={idx} className="grid grid-cols-[1fr_140px_32px] divide-x divide-gray-100 border-t border-gray-100">
            <input
              value={item.name}
              onChange={e => update(idx, 'name', e.target.value)}
              placeholder="iPhone 13 экран"
              className="px-3 py-2 text-xs text-gray-700 focus:outline-none focus:bg-yellow-50/50"
            />
            <input
              type="number" min={0} step={100}
              value={item.realCost}
              onChange={e => update(idx, 'realCost', e.target.value)}
              placeholder="0"
              className="px-3 py-2 text-xs text-gray-700 text-right focus:outline-none focus:bg-yellow-50/50"
            />
            <button onClick={() => removeItem(idx)} className="flex items-center justify-center text-gray-300 hover:text-red-400 text-sm">
              ×
            </button>
          </div>
        ))}
      </div>

      {!search && (
        <button onClick={addItem}
          className="w-full py-2 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors mb-6">
          + Добавить позицию
        </button>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {saving ? 'Сохраняем...' : 'Сохранить'}
        </button>
        <Link href="/admin/profit"
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap">
          Отчёт →
        </Link>
      </div>

      {msg && (
        <div className={`mt-4 px-4 py-3 rounded-lg text-sm ${msg.ok ? 'bg-green-50 border border-green-100 text-green-800' : 'bg-red-50 border border-red-100 text-red-700'}`}>
          {msg.ok ? '✓ ' : ''}{msg.text}
        </div>
      )}

      <div className="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 space-y-1">
        <p className="font-medium">Как работает</p>
        <p>Каждая позиция из заказов и продаж ищется по точному совпадению названия.</p>
        <p>Если нашли — считаем реальную маржу по твоей цене. Если нет — берём цену из LiveSklad и подсвечиваем.</p>
        <p>Разница между реальной и LiveSklad маржой = скрытая дополнительная прибыль.</p>
      </div>
    </div>
  )
}
