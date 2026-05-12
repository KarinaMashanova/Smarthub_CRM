'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function SetupPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const employeeId = params.get('employeeId')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Пароль минимум 6 символов')
      return
    }
    if (password !== confirm) {
      setError('Пароли не совпадают')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Ошибка')
        setLoading(false)
        return
      }

      if (data.role === 'ADMIN') {
        router.push('/admin')
      } else {
        router.push('/dashboard')
      }
    } catch {
      setError('Ошибка соединения')
      setLoading(false)
    }
  }

  if (!employeeId) {
    return (
      <div className="text-center text-sm text-red-500">
        Некорректная ссылка. <a href="/login" className="underline">Вернуться ко входу</a>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Новый пароль
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Минимум 6 символов"
          autoFocus
          required
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD600] focus:border-transparent transition"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Повторите пароль
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Повторите пароль"
          required
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD600] focus:border-transparent transition"
        />
      </div>

      {error && (
        <p className="text-xs text-red-500 text-center">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl bg-[#FFD600] hover:bg-[#FFCA00] disabled:opacity-60 text-black font-medium text-sm transition-colors"
      >
        {loading ? 'Сохранение...' : 'Установить пароль'}
      </button>
    </form>
  )
}

export default function SetupPasswordPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#FFD600] mb-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 4v10m0 0l-4-4m4 4l4-4M6 20h16" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Добро пожаловать</h1>
          <p className="text-sm text-gray-400 mt-1">Установите пароль для входа</p>
        </div>

        {/* Card */}
        <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
          <Suspense fallback={<div className="text-center text-sm text-gray-400">Загрузка...</div>}>
            <SetupPasswordForm />
          </Suspense>
        </div>

        <p className="text-center text-xs text-gray-300 mt-6">© 2026 Smarthub</p>
      </div>
    </div>
  )
}
