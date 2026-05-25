'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface CatalogInfo {
  total: number
  eligible: number
  lastUpload: string | null
}

export default function CatalogPage() {
  const [info, setInfo]         = useState<CatalogInfo | null>(null)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function loadInfo() {
    fetch('/api/admin/catalog').then(r => r.ok ? r.json() : null).then(setInfo)
  }
  useEffect(() => { loadInfo() }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true); setResult(null); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/catalog', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Ошибка'); return }
      setResult(`Загружено ${d.total.toLocaleString('ru-RU')} товаров, из них ${d.eligible} eligible для бонуса РЦ`)
      loadInfo()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-600">← Назад</Link>
        <h1 className="font-semibold text-gray-900 mt-2">Справочник товаров</h1>
        <p className="text-xs text-gray-500 mt-1">Загружайте актуальный прайс раз в неделю. Используется для расчёта бонуса за РЦ в продажах.</p>
      </div>

      {info && (
        <div className="bg-gray-50 rounded-xl p-4 mb-6 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Товаров в справочнике</span>
            <span className="font-medium">{info.total.toLocaleString('ru-RU')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Eligible для бонуса РЦ</span>
            <span className="font-medium text-amber-700">{info.eligible.toLocaleString('ru-RU')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Последняя загрузка</span>
            <span className="font-medium">
              {info.lastUpload
                ? new Date(info.lastUpload).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '—'}
            </span>
          </div>
        </div>
      )}

      <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${
        loading ? 'border-gray-200 bg-gray-50 cursor-not-allowed' : 'border-gray-200 hover:border-[#FFD600] hover:bg-yellow-50/30'
      }`}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleUpload} disabled={loading} className="hidden"/>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300">
          <path d="M9 12h6m-3-3v6M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round"/>
        </svg>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">{loading ? 'Загружаю...' : 'Нажмите чтобы выбрать файл'}</p>
          <p className="text-xs text-gray-400 mt-0.5">Excel (.xlsx) · Наименование, Остаток, Группа, Закупочная, Розничная</p>
        </div>
      </label>

      {result && (
        <div className="mt-4 px-4 py-3 bg-green-50 border border-green-100 rounded-lg text-sm text-green-800">
          ✓ {result}
        </div>
      )}
      {error && (
        <div className="mt-4 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-8 bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800 space-y-1">
        <p className="font-medium">Бонус за РЦ — формула</p>
        <p>Группы: Аксы, Защитное стекло, Игрушки, Чехлы</p>
        <p>delta = Σ (цена продажи − РЦ) × кол-во для eligible позиций</p>
        <p>Если delta ≥ 1 000 ₽ → бонус = delta × 50%</p>
      </div>
    </div>
  )
}
