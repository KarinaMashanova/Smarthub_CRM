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

  // ── 2. ЗП за продажи — считаем динамически из Sale + SalePosition ─────────
  const saleWhere: any = {
    date: { gte: from, lte: to },
    isReturn: false,
    sellerName: { not: null },
    positions: { some: {} },
  }
  if (nameFilter) saleWhere.sellerName = session.role === 'MANAGER'
    ? nameFilter
    : { contains: nameFilter, mode: 'insensitive' }

  const sales = await prisma.sale.findMany({
    where: saleWhere,
    select: {
      sellerName: true,
      revenue: true,
      positions: { select: { purchasePriceSumm: true } },
    },
  })

  // ── Аккумулятор ───────────────────────────────────────────────────────────
  type Detail = { actionType: string; subType: string | null; count: number; amount: number }
  type Acc = {
    orderSalary: number; salesSalary: number
    bonus: number; addon: number
    ndfl: number; fine: number
    repairEarned: number; repairTaken: number
    paidSalary: number
    detailMap: Record<string, Detail>
  }
  const empty = (): Acc => ({
    orderSalary: 0, salesSalary: 0, bonus: 0, addon: 0,
    ndfl: 0, fine: 0, repairEarned: 0, repairTaken: 0, paidSalary: 0,
    detailMap: {},
  })

  const map: Record<string, Acc> = {}
  const get = (name: string) => { if (!map[name]) map[name] = empty(); return map[name] }

  // Продажи → ЗП продавцу
  for (const s of sales) {
    const name = s.sellerName!
    const cost   = s.positions.reduce((acc, p) => acc + p.purchasePriceSumm, 0)
    const margin = s.revenue - cost
    if (margin <= 0) continue
    const rate = margin >= 5000 ? 0.30 : 0.15
    get(name).salesSalary += Math.round(margin * rate)
  }

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
      const accrued = d.orderSalary + d.salesSalary + d.bonus + d.addon - d.ndfl - d.fine - totalRepair
      return {
        name,
        orderSalary: d.orderSalary, salesSalary: d.salesSalary,
        bonus: d.bonus, addon: d.addon,
        ndfl: d.ndfl, fine: d.fine,
        repairEarned: d.repairEarned, repairTaken: d.repairTaken, totalRepair,
        paidSalary: d.paidSalary, accrued,
        details: Object.values(d.detailMap).sort((a, b) => {
          const ti = TYPE_ORDER.indexOf(a.actionType) - TYPE_ORDER.indexOf(b.actionType)
          return ti !== 0 ? ti : b.amount - a.amount
        }),
      }
    })
    .filter(s => s.orderSalary + s.salesSalary + s.bonus + s.addon + s.ndfl + s.fine + s.totalRepair + s.paidSalary > 0)
    .sort((a, b) => b.accrued - a.accrued)

  return NextResponse.json({ stats })
}
