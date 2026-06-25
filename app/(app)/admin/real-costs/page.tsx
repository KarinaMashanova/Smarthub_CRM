'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Item { id?: number; name: string; realCost: string }
interface MissingPos { name: string; lsAvgCost: number; occurrences: number }

function emptyItem(): Item { return { name: '', realCost: '' } }

export default function RealCostsPage() {
  const [items,    setItems]   = useState<Item[]>([emptyItem()])
  const [missing,  setMissing] = useState<MissingPos[]>([])
  // realCost, введённый для незаполненных позиций: name → строка
  const [fills,    setFills]   = useState<Record<string, string>>({})
  const [saving,   setSaving]  = useState(false)
  const [msg,      setMsg]     = useState<{ text: string; ok: boolean } | null>(null)
  const [search,   setSearch]  = useState('')
  const [showMiss, setShowMiss] = useState(true)

  const load = useCallback(() => {
    fetch('/api/admin/real-costs')
      .then(r => r.json())
      .then(d => {
        if (d.items?.length) {
          setItems(d.items.map((i: any) => ({ id: i.id, name: i.name, realCost: String(i.realCost) })))
        } else {
          setItems([emptyItem()])
        }
        setMissing(d.missing ?? [])
        setFills({})
      })
  }, [])

  useEffect(() => { load() }, [load])

  function addItem()                          { setItems(i => [...i, emptyItem()]) }
  function removeItem(idx: number)            { setItems(i => i.filter((_, j) => j !== idx)) }
  function update(idx: number, field: keyof Item, val: string) {
    setItems(i => i.map((item, j) => j === idx ? { ...item, [field]: val } : item))
  }

  async function save() {
    setSaving(true); setMsg(null)

    // Каталог + незаполненные, у которых указана реальная цена
    const catalogValid = items
      .filter(i => i.name.trim() && i.realCost !== '')
      .map(i => ({ name: i.name.trim(), realCost: parseFloat(i.realCost) }))

    const fillsValid = missing
      .filter(m => fills[m.name]?.trim() !== '' && fills[m.name] !== undefined)
      .map(m => ({ name: m.name, realCost: parseFloat(fills[m.name]) }))
      .filter(i => !isNaN(i.realCost) && i.realCost >= 0)

    const all = [...catalogValid, ...fillsValid]

    try {
      const res  = await fetch('/api/admin/real-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: all }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ text: data.error ?? 'Ошибка', ok: false }); return }
      setMsg({ text: `Сохранено ${data.count} позиций`, ok: true })
      load()
    } catch (e: any) {
      setMsg({ text: e?.message ?? 'Ошибка', ok: false })
    } finally { setSaving(false) }
  }

  const filledCount   = items.filter(i => i.name.trim() && i.realCost !== '').length
  const visibleItems  = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => !search || item.name.toLowerCase().includes(search.toLowerCase()))
  const visibleMissing = missing.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase())
  )
  const fillsFilledCount = Object.values(fills).filter(v => v.trim() !== '').length

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin/sync" className="text-xs text-gray-400 hover:text-gray-600">← Назад</Link>
        <h1 className="font-semibold text-gray-900 mt-2">Реальные цены закупа</h1>
        <p className="text-xs text-gray-500 mt-1">
          Справочник реальных себестоимостей — виден только администратору.
          Совпадение по точному названию позиции из LiveSklad.
        </p>
      </div>

      {/* Поиск */}
      <div className="flex items-center gap-3 mb-4">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию..."
          className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFD600]"
        />
        <span className="text-xs text-gray-400 shrink-0">
          {search ? `${visibleItems.length + visibleMissing.length} из ${filledCount + missing.length}` : `${filledCount} в справочнике`}
        </span>
      </div>

      {/* --- Раздел: Не заполнено --- */}
      {(visibleMissing.length > 0 || (search && missing.length > 0)) && (
        <div className="mb-6">
          <button
            onClick={() => setShowMiss(m => !m)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-t-xl bg-amber-50 border border-amber-200 text-left"
          >
            <span className="text-xs font-medium text-amber-800">
              Нет в справочнике — {missing.length} позиций из заказов/продаж
              {fillsFilledCount > 0 && (
                <span className="ml-2 text-green-700">({fillsFilledCount} заполнено)</span>
              )}
            </span>
            <span className="text-xs text-amber-600">{showMiss ? '▲' : '▼'}</span>
          </button>

          {showMiss && (
            <div className="rounded-b-xl border border-t-0 border-amber-200 overflow-hidden">
              <div className="grid grid-cols-[1fr_110px_140px] bg-amber-50/60 border-b border-amber-100">
                <div className="px-3 py-2 text-[11px] font-medium text-amber-700">Название</div>
                <div className="px-3 py-2 text-[11px] font-medium text-amber-700 text-right">Цена LS, ₽</div>
                <div className="px-3 py-2 text-[11px] font-medium text-amber-700 text-right">Реальная цена, ₽</div>
              </div>

              {visibleMissing.map(m => {
                const filled = fills[m.name] !== undefined && fills[m.name] !== ''
                return (
                  <div key={m.name}
                    className={`grid grid-cols-[1fr_110px_140px] divide-x divide-amber-100 border-t border-amber-100 ${
                      filled ? 'bg-green-50/40' : 'bg-white'
                    }`}
                  >
                    <div className="px-3 py-2 text-xs text-gray-700 truncate" title={m.name}>
                      {m.name}
                      <span className="ml-1.5 text-[10px] text-gray-400">×{m.occurrences}</span>
                    </div>
                    <div className="px-3 py-2 text-xs text-gray-400 text-right tabular-nums">
                      {m.lsAvgCost > 0 ? m.lsAvgCost.toLocaleString('ru-RU') : '—'}
                    </div>
                    <input
                      type="number" min={0} step={100}
                      value={fills[m.name] ?? ''}
                      onChange={e => setFills(f => ({ ...f, [m.name]: e.target.value }))}
                      placeholder="введи цену"
                      className={`px-3 py-2 text-xs text-right focus:outline-none focus:bg-yellow-50/50 ${
                        filled ? 'text-green-800 font-medium bg-green-50/20' : 'text-gray-700'
                      }`}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* --- Раздел: Справочник --- */}
      <div className="text-xs font-medium text-gray-500 mb-2">
        Справочник ({filledCount} позиций)
      </div>
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
          + Добавить позицию вручную
        </button>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {saving ? 'Сохраняем...' : `Сохранить${fillsFilledCount > 0 ? ` (+${fillsFilledCount} новых)` : ''}`}
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
        <p>Раздел «Нет в справочнике» показывает позиции из заказов/продаж, для которых ещё не проставлена реальная цена.</p>
        <p>«Цена LS» — средняя закупочная цена за единицу из LiveSklad (для ориентира).</p>
        <p>Заполни реальную цену и нажми «Сохранить» — позиции добавятся в справочник.</p>
      </div>
    </div>
  )
}
