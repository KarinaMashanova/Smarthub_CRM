'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { Modal } from '../components/Modal'
import { HelpModal } from '../components/HelpModal'

const HELP_ADMIN = [
  { label: 'Как читать сетку', desc: 'Строки = позиции в салонах, столбцы = дни недели. Текущий день подсвечен жёлтым. Ячейки с именем = занятая смена, пустые = свободные слоты.' },
  { label: 'Редактирование', desc: 'Кликни на ячейку — появится поле ввода с автодополнением. Enter — сохранить, Esc — отмена. Очисти поле и нажми Enter — убрать сотрудника из смены.' },
  { label: 'Цвет имени в ячейке', desc: 'Синий — сотрудник в отпуске в этот день. Оранжевый — больничный. Обычный серый — стандартная смена.' },
  { label: 'Отпуск / Больничный', desc: 'Кнопка в шапке. Выбери сотрудника, тип (Отпуск / Больничный) и период. Записи хранятся в отдельной таблице, не зависят от наличия смен.' },
  { label: 'Удалить отпуск', desc: 'Статистика → вкладка «Отпуска и больничные» → кликни на строку сотрудника → появятся чипы с периодами → нажми × на периоде.' },
  { label: 'Навигация по неделям', desc: 'Стрелки < > — переключение на неделю вперёд/назад. Кнопка «Сегодня» — возврат к текущей неделе.' },
  { label: 'Статистика — Смены', desc: 'Количество смен за период с разбивкой по салонам. Период выбирается произвольно (поля «с / по»). Поиск по фамилии.' },
  { label: 'Статистика — Отпуска', desc: 'Дней отпуска и больничного по каждому сотруднику. Разверни строку — увидишь все периоды с датами и кнопками удаления.' },
  { label: 'Права доступа', desc: 'Редактирование смен и управление отпусками — только администраторы. Менеджер видит только свои смены в сетке и только свою статистику.' },
]
const HELP_MANAGER = [
  { label: 'Ваши смены', desc: 'В сетке выделены только ячейки с вашим именем. Остальные позиции скрыты.' },
  { label: 'Цвет имени', desc: 'Синий — отпуск в этот день. Оранжевый — больничный.' },
  { label: 'Статистика — Смены', desc: 'Количество ваших смен за выбранный период с разбивкой по салонам.' },
  { label: 'Статистика — Отпуска', desc: 'Ваши дни отпуска и больничного за период.' },
]

interface Slot { id: number; location: string; slotIndex: number; date: string; employeeName: string | null; leaveType: string | null }
interface Session { name: string; role: 'MANAGER' | 'ADMIN' }
interface ShiftStat { name: string; total: number; vacation: number; sick: number; locations: Record<string, number> }
interface LeaveRecord { id: number; employeeName: string; date: string; leaveType: string }
interface LeavePeriod { from: string; to: string; leaveType: string; days: number }

function groupIntoPeriods(records: LeaveRecord[]): LeavePeriod[] {
  if (!records.length) return []
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  const periods: LeavePeriod[] = []
  let cur = { from: sorted[0].date, to: sorted[0].date, leaveType: sorted[0].leaveType, days: 1 }
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i]
    const prev = new Date(cur.to)
    prev.setUTCDate(prev.getUTCDate() + 1)
    const isConsecutive = prev.toISOString().slice(0, 10) === r.date.slice(0, 10)
    if (isConsecutive && r.leaveType === cur.leaveType) {
      cur.to = r.date; cur.days++
    } else {
      periods.push(cur)
      cur = { from: r.date, to: r.date, leaveType: r.leaveType, days: 1 }
    }
  }
  periods.push(cur)
  return periods
}

function fmtD(iso: string) {
  const d = new Date(iso)
  return `${String(d.getUTCDate()).padStart(2,'0')}.${String(d.getUTCMonth()+1).padStart(2,'0')}`
}

const LEAVE_LABELS: Record<string, string> = { VACATION: 'Отпуск', SICK: 'Больничный' }
const LEAVE_COLORS: Record<string, string> = { VACATION: 'bg-blue-100 text-blue-700', SICK: 'bg-orange-100 text-orange-700' }

const DAY_SHORT   = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTH_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

function getMondayOf(d: Date) {
  const day = d.getDay() || 7; const m = new Date(d)
  m.setDate(d.getDate() - day + 1); m.setHours(0,0,0,0); return m
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate()+n); return r }
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function SchedulePage() {
  const [session, setSession]     = useState<Session|null>(null)
  const [tab, setTab]             = useState<'grid'|'stats'>('grid')
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(new Date()))
  const [slots, setSlots]         = useState<Slot[]>([])
  const [loadingGrid, setLoadingGrid] = useState(true)
  const [editing, setEditing]     = useState<number|null>(null)
  const [editValue, setEditValue] = useState('')
  const [empList, setEmpList]     = useState<string[]>([])
  const [showHelp, setShowHelp]   = useState(false)
  const editRef = useRef<HTMLInputElement>(null)

  // Leave form
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [leaveEmployee, setLeaveEmployee] = useState('')
  const [leaveFrom, setLeaveFrom] = useState('')
  const [leaveTo, setLeaveTo]     = useState('')
  const [leaveSaving, setLeaveSaving] = useState(false)
  const [leaveDays, setLeaveDays]     = useState<number | null>(null)

  const now = new Date()
  const [statsMonth, setStatsMonth]   = useState(now.getMonth())
  const [statsYear, setStatsYear]     = useState(now.getFullYear())
  const [filterMode, setFilterMode]   = useState<'month'|'custom'>('month')
  const [customFrom, setCustomFrom]   = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [customTo, setCustomTo]       = useState(toISO(now))
  const [statsLoc, setStatsLoc]       = useState('')
  const [stats, setStats]             = useState<ShiftStat[]>([])
  const [allLocs, setAllLocs]         = useState<string[]>([])
  const [loadingStats, setLoadingStats] = useState(false)
  const [expandedRow, setExpandedRow]   = useState<string|null>(null)
  const [statsView, setStatsView]       = useState<'shifts'|'leave'>('shifts')
  const [statsSearch, setStatsSearch]   = useState('')
  const [leaveExpanded, setLeaveExpanded] = useState<string|null>(null)
  const [leaveRecords, setLeaveRecords]   = useState<Record<string, LeaveRecord[]>>({})
  const [leaveDeleting, setLeaveDeleting] = useState(false)

  const weekDays = Array.from({length:7}, (_,i) => addDays(weekStart, i))
  const statsFrom = filterMode === 'month'
    ? new Date(statsYear, statsMonth, 1)
    : new Date(customFrom)
  const statsTo = filterMode === 'month'
    ? new Date(statsYear, statsMonth+1, 0)
    : new Date(customTo)
  const todayISO  = toISO(now)

  const availableYears = [2026, 2027]

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(setSession)
    fetch('/api/schedule/employees').then(r => r.json()).then(setEmpList).catch(()=>{})
  }, [])

  function loadGrid() {
    setLoadingGrid(true)
    fetch(`/api/schedule?from=${toISO(weekDays[0])}&to=${toISO(weekDays[6])}`)
      .then(r => r.json()).then(d => { setSlots(d); setLoadingGrid(false) })
  }

  useEffect(() => { loadGrid() }, [weekStart])

  useEffect(() => {
    if (tab !== 'stats') return
    setLoadingStats(true)
    const p = new URLSearchParams({ from: toISO(statsFrom), to: toISO(statsTo) })
    if (statsLoc) p.set('location', statsLoc)
    fetch(`/api/schedule/stats?${p}`).then(r => r.json()).then(d => {
      setStats(d.stats); setAllLocs(d.locations); setLoadingStats(false)
    })
  }, [tab, statsMonth, statsYear, filterMode, customFrom, customTo, statsLoc])

  // Pre-fill leave dates when opening the form
  useEffect(() => {
    if (showLeaveForm) {
      setLeaveFrom(toISO(weekDays[0]))
      setLeaveTo(toISO(weekDays[6]))
      setLeaveEmployee('')
      setLeaveDays(null)
    }
  }, [showLeaveForm])

  const isAdmin = session?.role === 'ADMIN'

  const visible = isAdmin ? slots : slots.filter(s => s.employeeName === session?.name)
  const grid: Record<string, Record<number, Record<string, Slot>>> = {}
  const locSlots: Record<string, Set<number>> = {}
  for (const s of visible) {
    if (!grid[s.location]) grid[s.location] = {}
    if (!grid[s.location][s.slotIndex]) grid[s.location][s.slotIndex] = {}
    grid[s.location][s.slotIndex][s.date.slice(0,10)] = s
    if (!locSlots[s.location]) locSlots[s.location] = new Set()
    locSlots[s.location].add(s.slotIndex)
  }

  const locations = Object.keys(locSlots).sort().filter(loc =>
    isAdmin || Array.from(locSlots[loc]).some(si =>
      weekDays.some(d => grid[loc]?.[si]?.[toISO(d)]?.employeeName === session?.name)
    )
  )

  async function saveEdit(slotId: number, value: string) {
    setEditing(null)
    const employeeName = value.trim() || null
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, employeeName } : s))
    await fetch(`/api/schedule/${slotId}`, {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ employeeName }),
    })
  }

  async function saveLeave(leaveType: 'VACATION' | 'SICK') {
    if (!leaveEmployee.trim() || !leaveFrom || !leaveTo) return
    setLeaveSaving(true)
    const res = await fetch('/api/schedule/leave', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ employeeName: leaveEmployee.trim(), from: leaveFrom, to: leaveTo, leaveType }),
    })
    const data = await res.json()
    setLeaveSaving(false)
    setLeaveDays(data.count)
    loadGrid()
    setTimeout(() => { setShowLeaveForm(false); setLeaveDays(null) }, 1500)
  }

  async function loadLeaveRecords(name: string) {
    if (leaveRecords[name]) return
    const p = new URLSearchParams({ employee: name, from: toISO(statsFrom), to: toISO(statsTo) })
    const data = await fetch(`/api/schedule/leave?${p}`).then(r => r.json())
    setLeaveRecords(prev => ({ ...prev, [name]: data }))
  }

  function toggleLeaveExpand(name: string) {
    if (leaveExpanded === name) {
      setLeaveExpanded(null)
    } else {
      setLeaveExpanded(name)
      loadLeaveRecords(name)
    }
  }

  async function deletePeriod(employeeName: string, from: string, to: string) {
    if (!confirm(`Удалить записи ${employeeName} с ${fmtD(from)} по ${fmtD(to)}?`)) return
    setLeaveDeleting(true)
    await fetch(`/api/schedule/leave?employee=${encodeURIComponent(employeeName)}&from=${from}&to=${to}`, { method: 'DELETE' })
    setLeaveRecords(prev => {
      const updated = { ...prev }
      delete updated[employeeName]
      return updated
    })
    setLeaveDeleting(false)
    // Reload stats
    setLoadingStats(true)
    const p = new URLSearchParams({ from: toISO(statsFrom), to: toISO(statsTo) })
    if (statsLoc) p.set('location', statsLoc)
    fetch(`/api/schedule/stats?${p}`).then(r => r.json()).then(d => {
      setStats(d.stats); setAllLocs(d.locations); setLoadingStats(false)
    })
    loadGrid()
  }

  function startEdit(slot: Slot) {
    if (!isAdmin) return
    setEditing(slot.id); setEditValue(slot.employeeName ?? '')
    setTimeout(() => editRef.current?.focus(), 20)
  }

  const filteredEmps = editValue
    ? empList.filter(e => e.toLowerCase().includes(editValue.toLowerCase())).slice(0,8)
    : empList.slice(0,8)

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] overflow-hidden bg-white md:h-screen">

      {/* Top bar */}
      <div className="shrink-0 border-b border-gray-100 px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <h1 className="font-semibold text-gray-900 text-sm shrink-0">График смен</h1>

        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {(['grid','stats'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${tab===t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {t==='grid' ? 'Расписание' : 'Статистика'}
            </button>
          ))}
        </div>

        {tab === 'grid' && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => setWeekStart(w => addDays(w,-7))} className="p-1 rounded hover:bg-gray-100 text-gray-400">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <span className="text-xs text-gray-500 w-36 text-center">
              {weekDays[0].getDate()} {MONTH_SHORT[weekDays[0].getMonth()]} — {weekDays[6].getDate()} {MONTH_SHORT[weekDays[6].getMonth()]} {weekDays[6].getFullYear()}
            </span>
            <button onClick={() => setWeekStart(w => addDays(w,7))} className="p-1 rounded hover:bg-gray-100 text-gray-400">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 11l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button onClick={() => setWeekStart(getMondayOf(new Date()))} className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 text-gray-500 ml-1">Сегодня</button>
          </div>
        )}

        {tab === 'grid' && isAdmin && (
          <button onClick={() => setShowLeaveForm(v => !v)}
            className={`ml-1 px-3 py-1.5 text-xs font-medium rounded-xl transition-colors ${
              showLeaveForm ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 hover:bg-blue-100 text-blue-600'
            }`}>
            Отпуск / Больничный
          </button>
        )}

        <button onClick={() => setShowHelp(v => !v)} title="Помощь"
          className={`ml-auto p-1.5 rounded-lg transition-colors ${showHelp ? 'bg-amber-100 text-amber-600' : 'hover:bg-gray-100 text-gray-400'}`}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M6 5.8C6 4.8 7.5 4.5 7.5 5.8c0 .8-1 1-1 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="7.5" cy="10.5" r=".6" fill="currentColor"/></svg>
        </button>
      </div>

      {/* Leave modal */}
      {showLeaveForm && isAdmin && (
        <Modal title="Отпуск / Больничный" onClose={() => setShowLeaveForm(false)}>
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700">Сотрудник</label>
              <input
                list="leave-emp-list"
                value={leaveEmployee}
                onChange={e => setLeaveEmployee(e.target.value)}
                placeholder="Фамилия Имя"
                autoFocus
                className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 w-full"
              />
              <datalist id="leave-emp-list">{empList.map(e => <option key={e} value={e}/>)}</datalist>
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-xs font-medium text-gray-700">С</label>
                <input type="date" value={leaveFrom} onChange={e => setLeaveFrom(e.target.value)}
                  className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 w-full"/>
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-xs font-medium text-gray-700">По</label>
                <input type="date" value={leaveTo} onChange={e => setLeaveTo(e.target.value)}
                  className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 w-full"/>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">Обновит все смены сотрудника за выбранный период</p>

            {leaveDays !== null && (
              <div className="px-3 py-2 rounded-xl bg-green-50 text-green-700 text-xs font-medium">
                Сохранено {leaveDays} {leaveDays === 1 ? 'день' : leaveDays < 5 ? 'дня' : 'дней'}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => saveLeave('VACATION')}
                disabled={leaveSaving || !leaveEmployee.trim() || !leaveFrom || !leaveTo}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-700 disabled:opacity-40 transition-colors">
                {leaveSaving ? 'Сохранение...' : 'Отпуск'}
              </button>
              <button
                onClick={() => saveLeave('SICK')}
                disabled={leaveSaving || !leaveEmployee.trim() || !leaveFrom || !leaveTo}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-700 disabled:opacity-40 transition-colors">
                {leaveSaving ? 'Сохранение...' : 'Больничный'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Help panel */}
      {showHelp && (
        <HelpModal
          title="График смен — справка"
          color="bg-amber-50 border-amber-100"
          dot="bg-amber-400"
          items={isAdmin ? HELP_ADMIN : HELP_MANAGER}
          onClose={() => setShowHelp(false)}
        />
      )}

      {/* GRID */}
      {tab === 'grid' && (
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[680px] text-xs border-collapse" style={{tableLayout:'fixed'}}>
            <colgroup>
              <col style={{width:'200px', minWidth:'200px'}}/>
              {weekDays.map((_,i) => <col key={i}/>)}
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50">
                <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 border-b border-r border-gray-200 whitespace-nowrap">Салон</th>
                {weekDays.map((d,i) => {
                  const isToday = toISO(d) === todayISO
                  return (
                    <th key={i} className={`py-2 text-center border-b border-gray-200 ${isToday?'bg-amber-50':'bg-gray-50'}`}>
                      <span className={`block text-[10px] ${isToday?'text-amber-500':'text-gray-400'}`}>{DAY_SHORT[i]}</span>
                      <span className={`text-sm font-bold ${isToday?'text-amber-600':'text-gray-800'}`}>{d.getDate()}</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {loadingGrid ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Загрузка...</td></tr>
              ) : locations.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">
                  {isAdmin ? 'Нет данных за эту неделю' : 'Нет смен на этой неделе'}
                </td></tr>
              ) : locations.map(loc => {
                const sis = Array.from(locSlots[loc]).sort((a,b) => a-b)
                // Hide secondary slots (si > 0) if completely empty this week
                const visSis = isAdmin
                  ? sis.filter(si => si === 0 || weekDays.some(d => {
                      const s = grid[loc]?.[si]?.[toISO(d)]
                      return s?.employeeName || s?.leaveType
                    }))
                  : sis.filter(si =>
                      weekDays.some(d => grid[loc]?.[si]?.[toISO(d)]?.employeeName === session?.name)
                    )
                if (!visSis.length) return null
                return visSis.map((si, sii) => (
                  <tr key={`${loc}-${si}`} className={`${sii===0?'border-t-2 border-gray-200':'border-t border-gray-100'} hover:bg-gray-50/40`}>
                    <td className="px-3 py-1 border-r border-gray-200 bg-white whitespace-nowrap">
                      {sii===0
                        ? <span className="font-medium text-gray-700 block leading-tight">{loc}</span>
                        : <span className="text-gray-300 pl-2 text-[10px]">↳</span>}
                    </td>
                    {weekDays.map(d => {
                      const key = toISO(d)
                      const slot = grid[loc]?.[si]?.[key]
                      const isToday = key === todayISO
                      const isMe = slot?.employeeName === session?.name
                      const isEditing = slot && editing === slot.id

                      return (
                        <td key={key} onClick={() => slot && !isEditing && startEdit(slot)}
                          className={`py-0.5 px-1 text-center border-l border-gray-100 relative
                            ${isToday?'bg-amber-50/30':''}
                            ${isAdmin&&slot?'cursor-pointer hover:bg-yellow-50':''}`}>
                          {isEditing && slot ? (
                            <div className="relative z-30">
                              <input ref={editRef} value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => saveEdit(slot.id, editValue)}
                                onKeyDown={e => { if(e.key==='Enter') saveEdit(slot.id,editValue); if(e.key==='Escape') setEditing(null) }}
                                className="w-full text-xs px-1.5 py-0.5 rounded border border-[#FFD600] outline-none bg-white shadow-sm"
                                autoComplete="off"
                              />
                              <div className="absolute top-full left-0 mt-0.5 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-40 max-h-44 overflow-y-auto">
                                <button type="button" onMouseDown={() => saveEdit(slot.id,'')}
                                  className="w-full px-3 py-1.5 text-left text-[11px] text-gray-400 hover:bg-gray-50 border-b border-gray-100">
                                  — очистить
                                </button>
                                {filteredEmps.map(emp => (
                                  <button key={emp} type="button" onMouseDown={() => saveEdit(slot.id, emp)}
                                    className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-gray-50 text-gray-800">{emp}</button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className={`text-[11px] leading-tight truncate block ${
                              slot?.leaveType === 'VACATION' ? 'font-medium text-blue-600' :
                              slot?.leaveType === 'SICK'     ? 'font-medium text-orange-500' :
                              isMe ? 'font-semibold text-gray-900' :
                              slot?.employeeName ? 'text-gray-600' : 'text-gray-200'
                            }`}>
                              {slot?.employeeName ?? '—'}
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* STATS */}
      {tab === 'stats' && (
        <div className="flex-1 overflow-auto px-4 py-4">

          {/* Controls row */}
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {availableYears.map(y => (
              <button key={y} onClick={() => setStatsYear(y)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  statsYear===y ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>{y}</button>
            ))}
            <div className="ml-auto flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {(['month','custom'] as const).map(m => (
                <button key={m} onClick={() => setFilterMode(m)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    filterMode===m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}>{m==='month' ? 'По месяцу' : 'Период'}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {filterMode === 'month' ? (
              MONTH_SHORT.map((m,i) => (
                <button key={i} onClick={() => setStatsMonth(i)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    statsMonth===i ? 'bg-[#FFD600] text-black' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>{m}</button>
              ))
            ) : (
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
                <span className="text-xs text-gray-400">—</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]"/>
              </div>
            )}
            {isAdmin && statsView === 'shifts' && (
              <select value={statsLoc} onChange={e => setStatsLoc(e.target.value)}
                className="ml-auto px-2 py-1 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600]">
                <option value="">Все салоны</option>
                {allLocs.filter(l => !l.includes('(2)')).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
          </div>

          {/* Search + view toggle */}
          <div className="flex items-center gap-2 mb-3">
            <input
              value={statsSearch}
              onChange={e => setStatsSearch(e.target.value)}
              placeholder="Поиск по фамилии..."
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FFD600] w-48"
            />
          </div>
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 w-fit mb-3">
            {(['shifts', 'leave'] as const).map(v => (
              <button key={v} onClick={() => setStatsView(v)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  statsView===v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {v === 'shifts' ? 'Смены' : 'Отпуска и больничные'}
              </button>
            ))}
          </div>

          {loadingStats ? (
            <div className="text-center py-10 text-gray-400 text-sm">Загрузка...</div>
          ) : stats.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">Нет данных</div>
          ) : statsView === 'shifts' ? (
            /* ── Shifts view ── */
            (() => {
              const filtered = statsSearch.trim()
                ? stats.filter(s => s.name.toLowerCase().includes(statsSearch.toLowerCase()))
                : stats
              return (
            <>
              <p className="text-xs text-gray-400 mb-3">
                {filterMode === 'month' ? `${MONTH_NAMES[statsMonth]} ${statsYear}` : `${customFrom} — ${customTo}`}
                {' · '}{filtered.reduce((s,r) => s+r.total, 0)} смен
                {statsSearch && ` · найдено ${filtered.length}`}
              </p>
              <div className="space-y-1">
                {filtered.map(s => (
                  <div key={s.name} className="bg-gray-50 rounded-xl overflow-hidden">
                    <button onClick={() => setExpandedRow(expandedRow===s.name ? null : s.name)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#FFD600] flex items-center justify-center text-[10px] font-bold text-black shrink-0">
                          {s.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                        </div>
                        <span className="font-medium text-gray-800 text-sm">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xl font-bold text-gray-900">{s.total}</span>
                        <span className="text-xs text-gray-400">смен</span>
                        {s.vacation > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{s.vacation} отп.</span>}
                        {s.sick > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">{s.sick} бол.</span>}
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
                          className={`text-gray-400 transition-transform ml-1 ${expandedRow===s.name?'rotate-180':''}`}>
                          <path d="M3 5l3.5 3.5L10 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </button>
                    {expandedRow===s.name && (
                      <div className="px-4 pb-3 grid grid-cols-3 gap-1.5">
                        {Object.entries(s.locations).sort(([,a],[,b]) => b-a).map(([loc,cnt]) => (
                          <div key={loc} className="flex justify-between items-center bg-white rounded-lg px-2.5 py-1.5">
                            <span className="text-xs text-gray-500 truncate mr-1">{loc}</span>
                            <span className="text-xs font-semibold text-gray-800 shrink-0">{cnt}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
              )
            })()
          ) : (
            /* ── Leave view ── */
            (() => {
              const leaveStats = stats
                .filter(s => (s.vacation > 0 || s.sick > 0) &&
                  (!statsSearch.trim() || s.name.toLowerCase().includes(statsSearch.toLowerCase())))
                .sort((a, b) => (b.vacation + b.sick) - (a.vacation + a.sick))
              const totalVacation = leaveStats.reduce((s, r) => s + r.vacation, 0)
              const totalSick     = leaveStats.reduce((s, r) => s + r.sick, 0)

              return leaveStats.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  Нет отпусков и больничных за выбранный период
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="flex gap-3 mb-4">
                    <div className="bg-blue-50 rounded-xl px-4 py-3 flex-1">
                      <p className="text-2xl font-bold text-blue-700">{totalVacation}</p>
                      <p className="text-xs text-blue-500 mt-0.5">дней отпуска</p>
                    </div>
                    <div className="bg-orange-50 rounded-xl px-4 py-3 flex-1">
                      <p className="text-2xl font-bold text-orange-600">{totalSick}</p>
                      <p className="text-xs text-orange-400 mt-0.5">дней больничного</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-4 py-3 flex-1">
                      <p className="text-2xl font-bold text-gray-700">{leaveStats.length}</p>
                      <p className="text-xs text-gray-400 mt-0.5">сотрудников</p>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full min-w-[680px] text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-left">
                          <th className="px-4 py-2.5 font-medium text-gray-500">Сотрудник</th>
                          <th className="px-4 py-2.5 font-medium text-blue-500 text-center w-28">Отпуск, дн.</th>
                          <th className="px-4 py-2.5 font-medium text-orange-500 text-center w-28">Больничный, дн.</th>
                          <th className="px-4 py-2.5 font-medium text-gray-400 text-center w-20">Итого</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {leaveStats.map(s => (
                          <Fragment key={s.name}>
                            <tr className="hover:bg-gray-50/60">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-[#FFD600] flex items-center justify-center text-[9px] font-bold text-black shrink-0">
                                    {s.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                                  </div>
                                  <span className="font-medium text-gray-800">{s.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {s.vacation > 0
                                  ? <span className="inline-block px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{s.vacation}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {s.sick > 0
                                  ? <span className="inline-block px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-semibold">{s.sick}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-center font-semibold text-gray-600">
                                {s.vacation + s.sick}
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                <button onClick={() => toggleLeaveExpand(s.name)}
                                  className="text-gray-400 hover:text-gray-700 transition-colors text-xs px-1.5 py-0.5 rounded hover:bg-gray-100">
                                  {leaveExpanded === s.name ? '−' : '...'}
                                </button>
                              </td>
                            </tr>
                            {leaveExpanded === s.name && (
                              <tr>
                                <td colSpan={5} className="px-4 pb-3 pt-1 bg-gray-50/50">
                                  {!leaveRecords[s.name] ? (
                                    <span className="text-xs text-gray-400">Загрузка...</span>
                                  ) : leaveRecords[s.name].length === 0 ? (
                                    <span className="text-xs text-gray-400">Нет записей</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      {groupIntoPeriods(leaveRecords[s.name]).map((p, i) => (
                                        <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${
                                          p.leaveType === 'VACATION' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
                                        }`}>
                                          <span>{fmtD(p.from)} — {fmtD(p.to)}</span>
                                          <span className="text-[10px] opacity-60">({p.days} дн.)</span>
                                          <span className="opacity-50 text-[10px]">{LEAVE_LABELS[p.leaveType]}</span>
                                          {isAdmin && (
                                            <button
                                              onClick={() => deletePeriod(s.name, p.from.slice(0,10), p.to.slice(0,10))}
                                              disabled={leaveDeleting}
                                              className="ml-0.5 opacity-40 hover:opacity-100 transition-opacity text-sm leading-none disabled:opacity-20">
                                              ×
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            })()
          )}
        </div>
      )}
    </div>
  )
}
