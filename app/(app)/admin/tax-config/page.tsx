'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface ShopTax {
  id:        string
  name:      string
  taxSystem: string   // "AUSN" | "PATENT" | "NONE"
  taxRate:   string   // процент в виде числа, напр. "8" для 8%
}

const TAX_LABELS: Record<string, string> = {
  AUSN:    'АУСН',
  PATENT:  'Патент',
  NONE:    'Без налога',
}

export default function TaxConfigPage() {
  const [shops,   setShops]   = useState<ShopTax[]>([])
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(() => {
    fetch('/api/admin/tax-config')
      .then(r => r.json())
      .then(d => {
        setShops((d.shops ?? []).map((s: any) => ({
          id:        s.id,
          name:      s.name,
          taxSystem: s.taxSystem ?? 'NONE',
          taxRate:   s.taxRate != null ? String(Math.round(s.taxRate * 100)) : '',
        })))
      })
  }, [])

  useEffect(() => { load() }, [load])

  function updateShop(id: string, field: keyof ShopTax, val: string) {
    setShops(s => s.map(shop => shop.id === id ? { ...shop, [field]: val } : shop))
  }

  async function save() {
    setSaving(true); setMsg(null)
    const payload = shops.map(s => ({
      id:        s.id,
      taxSystem: s.taxSystem,
      taxRate:   s.taxRate !== '' ? parseFloat(s.taxRate) / 100 : null,
    }))
    try {
      const res  = await fetch('/api/admin/tax-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shops: payload }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ text: data.error ?? 'Ошибка', ok: false }); return }
      setMsg({ text: 'Сохранено', ok: true })
    } catch (e: any) {
      setMsg({ text: e?.message ?? 'Ошибка', ok: false })
    } finally { setSaving(false) }
  }

  const ausnCount   = shops.filter(s => s.taxSystem === 'AUSN').length
  const patentCount = shops.filter(s => s.taxSystem === 'PATENT').length

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin/sync" className="text-xs text-gray-400 hover:text-gray-600">← Назад</Link>
        <h1 className="font-semibold text-gray-900 mt-2">Налоговая система точек</h1>
        <p className="text-xs text-gray-500 mt-1">
          Укажи систему налогообложения каждой точки и ставку.<br/>
          Налог начисляется только на выручку по карте/ккм/кредиту — наличные не облагаются.
        </p>
      </div>

      {/* Счётчики */}
      {shops.length > 0 && (
        <div className="flex gap-2 mb-4">
          {[
            { label: 'АУСН', count: ausnCount, color: 'bg-blue-50 text-blue-700' },
            { label: 'Патент', count: patentCount, color: 'bg-amber-50 text-amber-700' },
            { label: 'Без налога', count: shops.length - ausnCount - patentCount, color: 'bg-gray-50 text-gray-500' },
          ].map(t => (
            <div key={t.label} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${t.color}`}>
              {t.label}: {t.count}
            </div>
          ))}
        </div>
      )}

      {/* Таблица */}
      <div className="rounded-xl border border-gray-100 overflow-hidden mb-6">
        <div className="grid grid-cols-[1fr_140px_100px] bg-gray-50 border-b border-gray-100">
          <div className="px-3 py-2 text-xs font-medium text-gray-500">Точка</div>
          <div className="px-3 py-2 text-xs font-medium text-gray-500">Система</div>
          <div className="px-3 py-2 text-xs font-medium text-gray-500 text-right">Ставка, %</div>
        </div>

        {shops.map(shop => (
          <div key={shop.id} className="grid grid-cols-[1fr_140px_100px] divide-x divide-gray-100 border-t border-gray-100">
            <div className="px-3 py-2.5 text-sm text-gray-700 truncate">{shop.name}</div>
            <select
              value={shop.taxSystem}
              onChange={e => {
                updateShop(shop.id, 'taxSystem', e.target.value)
                if (e.target.value === 'AUSN') updateShop(shop.id, 'taxRate', '8')
                if (e.target.value === 'NONE') updateShop(shop.id, 'taxRate', '')
              }}
              className="px-2 py-2 text-xs text-gray-700 focus:outline-none focus:bg-yellow-50/50 bg-transparent"
            >
              <option value="NONE">Без налога</option>
              <option value="AUSN">АУСН</option>
              <option value="PATENT">Патент</option>
            </select>
            <input
              type="number" min={0} max={100} step={0.1}
              value={shop.taxRate}
              onChange={e => updateShop(shop.id, 'taxRate', e.target.value)}
              disabled={shop.taxSystem === 'NONE'}
              placeholder={shop.taxSystem === 'AUSN' ? '8' : shop.taxSystem === 'PATENT' ? '%' : '—'}
              className="px-3 py-2 text-xs text-gray-700 text-right focus:outline-none focus:bg-yellow-50/50 disabled:text-gray-300 disabled:bg-gray-50"
            />
          </div>
        ))}
      </div>

      <button onClick={save} disabled={saving || shops.length === 0}
        className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
        {saving ? 'Сохраняем...' : 'Сохранить'}
      </button>

      {msg && (
        <div className={`mt-4 px-4 py-3 rounded-lg text-sm ${msg.ok ? 'bg-green-50 border border-green-100 text-green-800' : 'bg-red-50 border border-red-100 text-red-700'}`}>
          {msg.ok ? '✓ ' : ''}{msg.text}
        </div>
      )}

      <div className="mt-8 bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800 space-y-1">
        <p className="font-medium">Как считается налог</p>
        <p>Налоговая база = выручка по карте + ккм + кредит (наличные не входят).</p>
        <p>АУСН: стандартная ставка 8% от выручки. Патент: введи свою ставку в %.</p>
        <p>Налог вычитается из реальной маржи → получаем чистую прибыль точки.</p>
      </div>
    </div>
  )
}
