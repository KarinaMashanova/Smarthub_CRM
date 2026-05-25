'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface ShopRaw   { id: string; name: string; groupId: number | null; gangsterThreshold: number | null }
interface GroupRaw  { id: number; name: string; threshold: number | null; shops: { id: string }[] }

interface GroupState {
  id:        number | null
  name:      string
  threshold: string
  shopIds:   string[]
}
interface ShopState {
  id:        string
  name:      string
  threshold: string  // for ungrouped
}

export default function GangsterPage() {
  const [allShops,  setAllShops]  = useState<ShopRaw[]>([])
  const [groups,    setGroups]    = useState<GroupState[]>([])
  const [shopMeta,  setShopMeta]  = useState<Record<string, ShopState>>({})  // id → state
  const [running,   setRunning]   = useState(false)
  const [msg,       setMsg]       = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(() => {
    fetch('/api/admin/shop-groups')
      .then(r => r.json())
      .then(d => {
        const shops: ShopRaw[]  = d.shops  ?? []
        const grps:  GroupRaw[] = d.groups ?? []
        setAllShops(shops)
        setGroups(grps.map(g => ({
          id:        g.id,
          name:      g.name,
          threshold: g.threshold != null ? String(g.threshold) : '',
          shopIds:   g.shops.map(s => s.id),
        })))
        const meta: Record<string, ShopState> = {}
        for (const s of shops) meta[s.id] = { id: s.id, name: s.name, threshold: s.gangsterThreshold != null ? String(s.gangsterThreshold) : '' }
        setShopMeta(meta)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  function addGroup() {
    setGroups(g => [...g, { id: null, name: '', threshold: '', shopIds: [] }])
  }

  function removeGroup(idx: number) {
    setGroups(g => g.filter((_, i) => i !== idx))
  }

  function updateGroup(idx: number, patch: Partial<GroupState>) {
    setGroups(g => g.map((item, i) => i === idx ? { ...item, ...patch } : item))
  }

  function addShopToGroup(idx: number, shopId: string) {
    // Remove from any other group first
    setGroups(g => g.map((item, i) => {
      const filtered = item.shopIds.filter(id => id !== shopId)
      if (i === idx) return { ...item, shopIds: [...filtered, shopId] }
      return { ...item, shopIds: filtered }
    }))
  }

  function removeShopFromGroup(idx: number, shopId: string) {
    setGroups(g => g.map((item, i) => i === idx ? { ...item, shopIds: item.shopIds.filter(id => id !== shopId) } : item))
  }

  const assignedShopIds = new Set(groups.flatMap(g => g.shopIds))
  const ungroupedShops  = allShops.filter(s => !assignedShopIds.has(s.id))

  // Shops available to add to a given group (not assigned to any other group)
  function availableForGroup(idx: number) {
    const current = new Set(groups[idx].shopIds)
    return allShops.filter(s => current.has(s.id) || !assignedShopIds.has(s.id))
  }

  async function apply() {
    setRunning(true); setMsg(null)
    try {
      const payload = {
        groups: groups
          .filter(g => g.name.trim())
          .map(g => ({
            id:        g.id,
            name:      g.name.trim(),
            threshold: g.threshold ? parseFloat(g.threshold) : null,
            shopIds:   g.shopIds,
          })),
        shops: ungroupedShops.map(s => ({
          id:                s.id,
          gangsterThreshold: shopMeta[s.id]?.threshold ? parseFloat(shopMeta[s.id].threshold) : null,
        })),
      }
      const res  = await fetch('/api/admin/shop-groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) { setMsg({ text: data.error ?? `HTTP ${res.status}`, ok: false }); return }
      setMsg({ text: `Прописано: +${data.created ?? 0}, удалено: ${data.deleted ?? 0}${data.warning ? ` (${data.warning})` : ''}`, ok: true })
      load()
    } catch (e: any) {
      setMsg({ text: e?.message ?? 'Ошибка', ok: false })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin/sync" className="text-xs text-gray-400 hover:text-gray-600">← Назад</Link>
        <h1 className="font-semibold text-gray-900 mt-2">Бонус Гангстер</h1>
        <p className="text-xs text-gray-500 mt-1">
          Группы ТЦ: если суммарная маржа всех сотрудников группы за день ≥ порога — каждый получает 1 000 ₽.<br/>
          Одиночные салоны: порог на каждого сотрудника отдельно.
        </p>
      </div>

      {/* Группы */}
      <div className="space-y-3 mb-4">
        {groups.map((g, idx) => {
          const avail = availableForGroup(idx).filter(s => !g.shopIds.includes(s.id))
          return (
            <div key={idx} className="rounded-xl border border-gray-100 overflow-hidden">
              {/* Заголовок группы */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-100">
                <input
                  value={g.name}
                  onChange={e => updateGroup(idx, { name: e.target.value })}
                  placeholder="Название ТЦ"
                  className="flex-1 text-sm font-medium bg-transparent border-none outline-none text-gray-800 placeholder-gray-400"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number" min={0} step={1000}
                    value={g.threshold}
                    onChange={e => updateGroup(idx, { threshold: e.target.value })}
                    placeholder="порог ₽"
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-24 text-right focus:outline-none focus:ring-2 focus:ring-[#FFD600]"
                  />
                  <span className="text-xs text-gray-400">₽</span>
                  <button onClick={() => removeGroup(idx)} className="ml-1 text-gray-300 hover:text-red-400 text-sm leading-none px-1">×</button>
                </div>
              </div>

              {/* Салоны в группе */}
              <div className="px-3 py-2 space-y-1">
                {g.shopIds.map(sid => {
                  const shop = allShops.find(s => s.id === sid)
                  if (!shop) return null
                  return (
                    <div key={sid} className="flex items-center justify-between text-xs text-gray-700 py-0.5">
                      <span>{shop.name}</span>
                      <button onClick={() => removeShopFromGroup(idx, sid)} className="text-gray-300 hover:text-red-400 px-1">×</button>
                    </div>
                  )
                })}

                {/* Добавить салон */}
                {avail.length > 0 && (
                  <select
                    value=""
                    onChange={e => { if (e.target.value) addShopToGroup(idx, e.target.value) }}
                    className="mt-1 w-full text-xs border border-dashed border-gray-200 rounded-lg px-2 py-1.5 text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD600]"
                  >
                    <option value="">+ Добавить салон</option>
                    {avail.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                {avail.length === 0 && g.shopIds.length === 0 && (
                  <p className="text-xs text-gray-400 py-0.5">Все салоны уже распределены</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <button onClick={addGroup}
        className="w-full py-2 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors mb-6">
        + Добавить группу ТЦ
      </button>

      {/* Одиночные салоны */}
      {ungroupedShops.length > 0 && (
        <div className="rounded-xl border border-gray-100 divide-y divide-gray-100 mb-6">
          <div className="px-3 py-2 bg-gray-50">
            <p className="text-xs font-medium text-gray-500">Одиночные салоны</p>
          </div>
          {ungroupedShops.map(s => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-sm text-gray-700 flex-1 truncate">{s.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number" min={0} step={1000}
                  value={shopMeta[s.id]?.threshold ?? ''}
                  onChange={e => setShopMeta(m => ({ ...m, [s.id]: { ...m[s.id], threshold: e.target.value } }))}
                  placeholder="не задан"
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-24 text-right focus:outline-none focus:ring-2 focus:ring-[#FFD600]"
                />
                <span className="text-xs text-gray-400">₽</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={apply} disabled={running || allShops.length === 0}
        className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
        {running ? 'Прописываем...' : 'Прописать бонусы'}
      </button>

      {msg && (
        <div className={`mt-4 px-4 py-3 rounded-lg text-sm ${msg.ok ? 'bg-green-50 border border-green-100 text-green-800' : 'bg-red-50 border border-red-100 text-red-700'}`}>
          {msg.ok ? '✓ ' : ''}{msg.text}
        </div>
      )}

      <div className="mt-8 bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800 space-y-1">
        <p className="font-medium">Как работает</p>
        <p>Группа: суммируется маржа всех сотрудников группы за день. Если сумма ≥ порога — каждый получает 1 000 ₽.</p>
        <p>Одиночный салон: маржа конкретного сотрудника сравнивается с порогом салона.</p>
        <p>Бонусы пересчитываются автоматически при каждой синхронизации.</p>
      </div>
    </div>
  )
}
