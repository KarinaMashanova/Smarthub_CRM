'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Manager {
  id: number
  name: string
  isPasswordSet: boolean
}

export default function LoginPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [managers, setManagers] = useState<Manager[]>([])
  const [filtered, setFiltered] = useState<Manager[]>([])
  const [selected, setSelected] = useState<Manager | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'name' | 'password'>('name')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/managers').then(r => r.json()).then(setManagers)
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setFiltered([])
      setShowDropdown(false)
      return
    }
    const q = query.toLowerCase()
    const matches = managers.filter(m => m.name.toLowerCase().includes(q))
    setFiltered(matches)
    setShowDropdown(matches.length > 0)
  }, [query, managers])

  // закрыть дропдаун при клике вне
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function selectManager(m: Manager) {
    setSelected(m)
    setQuery(m.name)
    setShowDropdown(false)
    setError('')

    if (!m.isPasswordSet) {
      router.push(`/setup-password?employeeId=${m.id}`)
      return
    }
    setStep('password')
    setTimeout(() => document.getElementById('password-input')?.focus(), 50)
  }

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selected) {
      selectManager(selected)
      return
    }
    // если ничего не выбрали из списка — ищем точное совпадение
    const exact = managers.find(m => m.name.toLowerCase() === query.toLowerCase().trim())
    if (exact) {
      selectManager(exact)
    } else {
      setError('Выберите имя из списка')
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selected.name, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Ошибка входа')
        setLoading(false)
        return
      }

      window.location.href = '/orders'
    } catch {
      setError('Ошибка соединения')
      setLoading(false)
    }
  }

  function goBack() {
    setStep('name')
    setPassword('')
    setError('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#FFD600] mb-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M4 8h20M4 14h14M4 20h8" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Smarthub</h1>
          <p className="text-sm text-gray-400 mt-1">Система управления магазинами</p>
        </div>

        {/* Card */}
        <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">

          {step === 'name' ? (
            <form onSubmit={handleNameSubmit} className="space-y-5">
              <div className="relative">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Ваше имя
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
                  onFocus={() => filtered.length > 0 && setShowDropdown(true)}
                  placeholder="Начните вводить имя..."
                  autoFocus
                  autoComplete="off"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD600] focus:border-transparent transition"
                />

                {showDropdown && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-10 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden"
                  >
                    {filtered.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onMouseDown={() => selectManager(m)}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm text-left hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-gray-900">{m.name}</span>
                        {!m.isPasswordSet && (
                          <span className="text-xs text-amber-500 font-medium">первый вход</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-red-500 text-center">{error}</p>}

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#FFD600] hover:bg-[#FFCA00] text-black font-medium text-sm transition-colors"
              >
                Продолжить
              </button>
            </form>

          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="flex items-center gap-2 mb-6">
                <button
                  type="button"
                  onClick={goBack}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M11 14L6 9l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span className="text-sm text-gray-700 font-medium">{selected?.name}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Пароль
                </label>
                <input
                  id="password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD600] focus:border-transparent transition"
                />
              </div>

              {error && <p className="text-xs text-red-500 text-center">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#FFD600] hover:bg-[#FFCA00] disabled:opacity-60 text-black font-medium text-sm transition-colors"
              >
                {loading ? 'Вход...' : 'Войти'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-300 mt-6">© 2026 Smarthub</p>
      </div>
    </div>
  )
}
