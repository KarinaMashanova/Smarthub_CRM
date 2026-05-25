'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

interface NavItem { href: string; label: string; icon: string }

function NavIcon({ name }: { name: string }) {
  const cls = 'w-5 h-5'
  switch (name) {
    case 'orders': return <svg className={cls} viewBox="0 0 20 20" fill="none"><path d="M4 3h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'sales': return <svg className={cls} viewBox="0 0 20 20" fill="none"><path d="M3 10h14M10 3v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/></svg>
    case 'cash': return <svg className={cls} viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2 8h16" stroke="currentColor" strokeWidth="1.5"/><circle cx="6" cy="12" r="1" fill="currentColor"/></svg>
    case 'calendar': return <svg className={cls} viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2 8h16M7 2v4M13 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'chart': return <svg className={cls} viewBox="0 0 20 20" fill="none"><path d="M3 15l4-5 4 3 5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'people': return <svg className={cls} viewBox="0 0 20 20" fill="none"><circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M2 17c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M14 9c1.657 0 3 1.343 3 3M16 17c0-1.657-.895-3.122-2.238-3.888" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'salary': return <svg className={cls} viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M10 6v1.5M10 12.5V14M7.5 8.5c0-1.1.9-2 2.5-2s2.5.9 2.5 2-1 1.5-2.5 2-2.5 1-2.5 2 .9 2 2.5 2 2.5-.9 2.5-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
    case 'sync': return <svg className={cls} viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 016-6 6 6 0 014.24 1.76L16 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M16 10a6 6 0 01-6 6 6 6 0 01-4.24-1.76L4 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M13.5 7.5H16V5M4 15v-2.5H6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'book': return <svg className={cls} viewBox="0 0 20 20" fill="none"><path d="M4 3h9a2 2 0 012 2v11a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.5"/><path d="M7 3v13M10 7h3M10 10h3M10 13h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'wallet': return <svg className={cls} viewBox="0 0 20 20" fill="none"><path d="M3 6a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" stroke="currentColor" strokeWidth="1.5"/><path d="M13 10a1 1 0 100 2 1 1 0 000-2z" fill="currentColor"/><path d="M13 6H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    default: return <span className="w-5 h-5 block rounded bg-current opacity-30" />
  }
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement | null>(null)
  const activeRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    const nav = navRef.current
    const active = activeRef.current
    if (!nav || !active) return
    const left = active.offsetLeft - nav.clientWidth / 2 + active.clientWidth / 2
    const scroll = () => {
      nav.scrollLeft = Math.max(0, left)
    }
    scroll()
    const raf = requestAnimationFrame(scroll)
    const timer = window.setTimeout(scroll, 100)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [pathname])

  return (
    <nav ref={navRef} className="flex h-full items-center gap-1 overflow-x-auto px-3 py-1.5 md:block md:h-auto md:flex-1 md:space-y-0.5 md:overflow-y-auto md:overflow-x-hidden md:px-3 md:py-4">
      {items.map(item => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            ref={active ? activeRef : undefined}
            className={`flex h-10 min-w-max items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-center text-[11px] leading-tight transition-colors group md:h-auto md:min-w-0 md:flex-row md:justify-start md:gap-3 md:px-3 md:py-2.5 md:text-left md:text-sm ${
              active
                ? 'bg-[#FFD600] text-black font-medium'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <span className={`transition-colors ${active ? 'text-black' : 'text-gray-400 group-hover:text-gray-600'}`}>
              <NavIcon name={item.icon} />
            </span>
            <span className="whitespace-nowrap md:whitespace-normal">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
