import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

function calcTier(margin: number, tiers: { minMargin: number; salary: number }[]) {
  const current = [...tiers].reverse().find(t => margin >= t.minMargin) ?? null
  const next    = tiers.find(t => t.minMargin > margin) ?? null
  return { current, next }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now   = new Date()
  const year  = parseInt(searchParams.get('year')  ?? String(now.getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
  const from  = new Date(year, month - 1, 1)
  const to    = new Date(year, month, 0, 23, 59, 59)

  const [tiers] = await Promise.all([
    prisma.salaryTier.findMany({ orderBy: { minMargin: 'asc' } }),
  ])
  const totalWorkingDays = 23

  // ── Режим: все сотрудники (только для ADMIN) ─────────────────────────────
  if (session.role === 'ADMIN' && searchParams.get('all') === 'true') {
    const [slots, orders, salePositions] = await Promise.all([
      prisma.scheduleSlot.findMany({
        where: { date: { gte: from, lte: to }, employeeName: { not: null } },
        select: { employeeName: true },
      }),
      prisma.order.findMany({
        where: { dateClose: { gte: from, lte: to }, isVisible: true, isReturn: false, managerName: { not: null } },
        select: { managerName: true, revenue: true, positions: { select: { purchasePriceSumm: true } } },
      }),
      prisma.salePosition.findMany({
        where: { sale: { date: { gte: from, lte: to }, isReturn: false, sellerName: { not: null } } },
        select: { soldPrice: true, count: true, purchasePriceSumm: true, sale: { select: { sellerName: true } } },
      }),
    ])

    // Смены по сотрудникам
    const shiftsMap = new Map<string, number>()
    for (const s of slots) {
      const n = s.employeeName!
      shiftsMap.set(n, (shiftsMap.get(n) ?? 0) + 1)
    }

    // Маржа по сотрудникам
    const marginMap = new Map<string, number>()
    for (const o of orders) {
      if (o.positions.length === 0) continue
      const n = o.managerName!
      const cost = o.positions.reduce((sum, p) => sum + p.purchasePriceSumm, 0)
      marginMap.set(n, (marginMap.get(n) ?? 0) + o.revenue - cost)
    }
    for (const p of salePositions) {
      const n = p.sale.sellerName!
      marginMap.set(n, (marginMap.get(n) ?? 0) + p.soldPrice * p.count - p.purchasePriceSumm)
    }

    // Только сотрудники из расписания — у них есть оклад по сменам
    const allNames = new Set([...shiftsMap.keys()])
    const rows = Array.from(allNames).map(name => {
      const margin       = Math.round(marginMap.get(name) ?? 0)
      const empShifts    = shiftsMap.get(name) ?? 0
      const { current, next } = calcTier(margin, tiers)
      const perShift     = current && totalWorkingDays > 0 ? current.salary / totalWorkingDays : 0
      const estimatedSalary = Math.round(perShift * empShifts)
      return { name, margin, empShifts, currentTier: current, nextTier: next, estimatedSalary }
    }).sort((a, b) => b.margin - a.margin)

    return NextResponse.json({ all: true, year, month, totalWorkingDays, tiersCount: tiers.length, rows })
  }

  // ── Режим: один сотрудник ─────────────────────────────────────────────────
  const employeeName = session.role === 'ADMIN'
    ? (searchParams.get('employee') || session.name)
    : session.name
  const employeeOrderFilter = session.role === 'MANAGER'
    ? { OR: [{ managerId: session.employeeId }, { managerName: employeeName }] }
    : { managerName: employeeName }
  const employeeSaleFilter = session.role === 'MANAGER'
    ? { OR: [{ sellerId: session.employeeId }, { sellerName: employeeName }] }
    : { sellerName: employeeName }

  const [orders, salePositions, empShifts] = await Promise.all([
    prisma.order.findMany({
      where: { dateClose: { gte: from, lte: to }, isVisible: true, isReturn: false, ...employeeOrderFilter },
      select: { revenue: true, positions: { select: { purchasePriceSumm: true } } },
    }),
    prisma.salePosition.findMany({
      where: { sale: { date: { gte: from, lte: to }, isReturn: false, ...employeeSaleFilter } },
      select: { soldPrice: true, count: true, purchasePriceSumm: true },
    }),
    prisma.scheduleSlot.count({
      where: { date: { gte: from, lte: to }, employeeName: employeeName },
    }),
  ])

  const margin = Math.round(
    orders.reduce((s, o) => {
      if (o.positions.length === 0) return s
      const cost = o.positions.reduce((sum, p) => sum + p.purchasePriceSumm, 0)
      return s + o.revenue - cost
    }, 0) +
    salePositions.reduce((s, p)  => s + p.soldPrice * p.count - p.purchasePriceSumm, 0)
  )
  const { current: currentTier, next: nextTier } = calcTier(margin, tiers)
  const perShift        = currentTier && totalWorkingDays > 0 ? currentTier.salary / totalWorkingDays : 0
  const estimatedSalary = Math.round(perShift * empShifts)

  return NextResponse.json({
    employeeName, year, month,
    margin, currentTier, nextTier,
    totalWorkingDays, employeeShifts: empShifts,
    perShift: Math.round(perShift), estimatedSalary,
    tiersCount: tiers.length,
  })
}
