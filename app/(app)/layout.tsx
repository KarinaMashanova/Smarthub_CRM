import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ReactNode } from 'react'
import { NavLinks } from './components/NavLinks'

const NAV_ADMIN = [
  { href: '/orders',         label: 'Заказы',         icon: 'orders' },
  { href: '/sales',          label: 'Продажи',        icon: 'sales' },
  { href: '/cash',           label: 'Касса',           icon: 'wallet' },
  { href: '/schedule',       label: 'График смен',    icon: 'calendar' },
  { href: '/salary',         label: 'ЗП и бонусы',   icon: 'salary' },
  { href: '/reports',        label: 'Отчёты',         icon: 'chart' },
  { href: '/knowledge',      label: 'База знаний',    icon: 'book' },
  { href: '/admin/managers', label: 'Сотрудники',     icon: 'people' },
  { href: '/admin/sync',     label: 'Синхронизация',  icon: 'sync' },
]

const NAV_MANAGER = [
  { href: '/orders',    label: 'Заказы',       icon: 'orders' },
  { href: '/sales',     label: 'Продажи',      icon: 'sales' },
  { href: '/cash',      label: 'Касса',         icon: 'wallet' },
  { href: '/schedule',  label: 'График смен',  icon: 'calendar' },
  { href: '/salary',    label: 'ЗП и бонусы', icon: 'salary' },
  { href: '/knowledge', label: 'База знаний',  icon: 'book' },
]

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const nav = session.role === 'ADMIN' ? NAV_ADMIN : NAV_MANAGER

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-white border-r border-gray-100 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#FFD600] flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h8M2 12h5" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="font-semibold text-gray-900 text-sm">Smarthub</span>
          </div>
        </div>

        <NavLinks items={nav} />

        {/* User */}
        <div className="px-3 py-4 border-t border-gray-100">
          <div className="px-3 py-2.5 rounded-xl bg-gray-50 mb-1">
            <p className="text-xs font-medium text-gray-800 truncate">{session.name}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{session.role === 'ADMIN' ? 'Администратор' : 'Менеджер'}</p>
          </div>
          <Link
            href="/api/auth/logout"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 10l3-3-3-3M12 7H5M5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Выйти
          </Link>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
