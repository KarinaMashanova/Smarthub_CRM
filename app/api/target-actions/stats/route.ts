import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const now      = new Date()
  const from     = new Date(searchParams.get('from') ?? new Date(now.getFullYear(), 0, 1))
  const to       = new Date(searchParams.get('to')   ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59))
  const employee = searchParams.get('employee') ?? ''

  const nameFilter = session.role === 'MANAGER' ? session.name : employee || null

  // ── 1. TargetAction записи за период ─────────────────────────────────────
  const taWhere: any = { date: { gte: from, lte: to } }
  if (nameFilter) taWhere.employeeName = session.role === 'MANAGER'
    ? nameFilter
    : { contains: nameFilter, mode: 'insensitive' }

  const rows = await prisma.targetAction.findMany({
    where: taWhere,
    select: { employeeName: true, actionType: true, subType: true, source: true, amount: true, isTaken: true },
  })

  // ── Аккумулятор ───────────────────────────────────────────────────────────
  type Detail = { actionType: string; subType: string | null; count: number; amount: number }
  type Acc = {
    bonus: number; addon: number
    ndfl: number; fine: number
    repairEarned: number; repairTaken: number
    paidSalary: number
    detailMap: Record<string, Detail>
  }
  const empty = (): Acc => ({
    bonus: 0, addon: 0,
    ndfl: 0, fine: 0, repairEarned: 0, repairTaken: 0, paidSalary: 0,
    detailMap: {},
  })

  const map: Record<string, Acc> = {}
  const get = (name: string) => { if (!map[name]) map[name] = empty(); return map[name] }

  // TargetAction
  for (const r of rows) {
    const e = get(r.employeeName)
    if (r.actionType === 'Бонус') {
      e.bonus += r.amount
    } else if (r.actionType === 'Доначисление Оклада') {
      e.addon += r.amount
    } else if (r.actionType === 'Штраф') {
      if (r.subType === 'НДФЛ') e.ndfl += r.amount
      else e.fine += r.amount
    } else if (r.actionType === 'Работа по ремонту') {
      if (r.isTaken) e.repairTaken += r.amount
      else e.repairEarned += r.amount
    } else if (r.actionType === 'Выплата Зарплаты') {
      e.paidSalary += r.amount
    }

    const key = `${r.actionType}__${r.subType ?? ''}`
    if (!e.detailMap[key]) e.detailMap[key] = { actionType: r.actionType, subType: r.subType, count: 0, amount: 0 }
    e.detailMap[key].count++
    e.detailMap[key].amount += r.amount
  }

  const TYPE_ORDER = ['Бонус', 'Доначисление Оклада', 'Штраф', 'Работа по ремонту', 'Выплата Зарплаты']

  const stats = Object.entries(map)
    .map(([name, d]) => {
      const totalRepair = d.repairEarned + d.repairTaken
      const accrued  = d.bonus + d.addon - d.ndfl - d.fine - d.repairTaken
      const остаток  = accrued - d.paidSalary
      return {
        name,
        bonus: d.bonus, addon: d.addon,
        ndfl: d.ndfl, fine: d.fine,
        repairEarned: d.repairEarned, repairTaken: d.repairTaken, totalRepair,
        paidSalary: d.paidSalary, accrued, остаток,
        details: Object.values(d.detailMap).sort((a, b) => {
          const ti = TYPE_ORDER.indexOf(a.actionType) - TYPE_ORDER.indexOf(b.actionType)
          return ti !== 0 ? ti : b.amount - a.amount
        }),
      }
    })
    .filter(s => s.bonus + s.addon + s.ndfl + s.fine + s.totalRepair + s.paidSalary > 0)
    .sort((a, b) => b.accrued - a.accrued)

  return NextResponse.json({ stats })
}
