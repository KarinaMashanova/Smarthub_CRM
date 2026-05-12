'use client'

import { useState, useEffect, useCallback } from 'react'

interface Employee {
  id: string
  name: string
  role: string
  shopId: string
  shopName: string
  appRole: 'ADMIN' | 'MANAGER' | null
  isPasswordSet: boolean
}

function Avatar({ name, active }: { name: string; active: boolean }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2)
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
      active ? 'bg-[#FFD600] text-black' : 'bg-gray-100 text-gray-400'
    }`}>
      {initials}
    </div>
  )
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/admin/employees')
      .then(r => r.json())
      .then(d => { setEmployees(d); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  async function patch(id: string, body: object) {
    setPendingId(id)
    await fetch(`/api/admin/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    load()
    setPendingId(null)
  }

  const q = search.toLowerCase()
  const filtered = employees.filter(e => e.name.toLowerCase().includes(q))
  const users  = filtered.filter(e => e.appRole !== null)
  const others = filtered.filter(e => e.appRole === null)

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      <div className="shrink-0 border-b border-gray-100 px-6 py-3 flex items-center gap-3">
        <h1 className="font-semibold text-gray-900 text-sm">Сотрудники</h1>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по имени или магазину..."
          className="ml-auto px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] w-56"
        />
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 space-y-6">

        {/* Users with access */}
        <section>
          <p className="text-xs font-medium text-gray-500 mb-2">
            Пользователи системы{!loading && ` — ${users.length}`}
          </p>

          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Загрузка...</div>
          ) : users.length === 0 ? (
            <div className="bg-gray-50 rounded-xl px-4 py-8 text-center text-sm text-gray-400">
              Нет пользователей с доступом
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Сотрудник</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Роль</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((emp, i) => (
                    <tr key={emp.id} className={`border-t border-gray-100 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={emp.name} active />
                          <div>
                            <span className="font-medium text-gray-800 text-xs block">{emp.name}</span>
                            {emp.isPasswordSet && (
                              <span className="text-[10px] text-green-600">пароль задан</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={emp.appRole ?? ''}
                          onChange={e => patch(emp.id, { appRole: e.target.value })}
                          disabled={pendingId === emp.id}
                          className="text-xs px-2 py-1 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] disabled:opacity-50"
                        >
                          <option value="MANAGER">Менеджер</option>
                          <option value="ADMIN">Администратор</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1.5">
                          {emp.isPasswordSet && (
                            <button
                              disabled={pendingId === emp.id}
                              onClick={() => {
                                if (confirm(`Сбросить пароль ${emp.name}?\nПри следующем входе потребуется задать новый.`))
                                  patch(emp.id, { resetPassword: true })
                              }}
                              className="px-2.5 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 disabled:opacity-50 transition-colors"
                            >
                              Сброс пароля
                            </button>
                          )}
                          <button
                            disabled={pendingId === emp.id}
                            onClick={() => {
                              if (confirm(`Отозвать доступ у ${emp.name}?\nПароль будет удалён.`))
                                patch(emp.id, { appRole: null })
                            }}
                            className="px-2.5 py-1 text-xs rounded-lg bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50 transition-colors"
                          >
                            Отозвать
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Employees without access */}
        {!loading && others.length > 0 && (
          <section>
            <p className="text-xs font-medium text-gray-500 mb-2">
              Без доступа — можно выдать{` — ${others.length}`}
            </p>
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Сотрудник</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Выдать как</th>
                  </tr>
                </thead>
                <tbody>
                  {others.map((emp, i) => (
                    <tr key={emp.id} className={`border-t border-gray-100 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={emp.name} active={false} />
                          <span className="text-gray-700 text-xs">{emp.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1.5">
                          <button
                            disabled={pendingId === emp.id}
                            onClick={() => patch(emp.id, { appRole: 'MANAGER' })}
                            className="px-3 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 transition-colors"
                          >
                            Менеджер
                          </button>
                          <button
                            disabled={pendingId === emp.id}
                            onClick={() => patch(emp.id, { appRole: 'ADMIN' })}
                            className="px-3 py-1 text-xs rounded-lg bg-[#FFD600] hover:bg-[#e6c200] text-black disabled:opacity-50 transition-colors"
                          >
                            Администратор
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
