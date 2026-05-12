'use client'

import { useEffect } from 'react'

interface HelpItem { label: string; desc: string }

interface HelpModalProps {
  title: string
  color?: string       // bg + border classes for header accent
  dot?: string         // dot color class
  items: HelpItem[]
  onClose: () => void
}

export function HelpModal({ title, color = 'bg-gray-50 border-gray-200', dot = 'bg-gray-400', items, onClose }: HelpModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border shadow-xl overflow-hidden bg-white"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={`shrink-0 px-5 py-3.5 border-b flex items-center justify-between ${color}`}>
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
            <span className="font-semibold text-gray-800 text-sm">{title}</span>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-black/10 text-gray-500 hover:text-gray-700 transition-colors text-lg leading-none">
            ×
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-auto divide-y divide-gray-100">
          {items.map((item, i) => (
            <div key={i} className="px-5 py-3 flex gap-4 hover:bg-gray-50/60">
              <span className="text-xs font-medium text-gray-700 w-44 shrink-0 pt-0.5 leading-relaxed">{item.label}</span>
              <span className="text-xs text-gray-500 leading-relaxed">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
