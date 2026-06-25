import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

const PAGE_SIZE = 50
const PAYMENT_ORDER = ['Наличные', 'Безнал', 'Счёт']

function normalizePaymentType(value: string | null) {
  if (!value) return null
  const parts = Array.from(new Set(
    value.split(',')
      .map(p => p.trim())
      .filter(Boolean)
  ))
  parts.sort((a, b) => {
    const ai = PAYMENT_ORDER.indexOf(a)
    const bi = PAYMENT_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b, 'ru')
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
  return parts.join(', ')
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const search = searchParams.get('search')?.trim() ?? ''
  const status = searchParams.get('status') ?? ''
  const shopId = searchParams.get('shopId') ?? ''
  const manager = searchParams.get('manager') ?? ''
  const master = searchParams.get('master') ?? ''
  const paymentType = searchParams.get('paymentType') ?? ''
  const marginMode = searchParams.get('marginMode') ?? 'all'
  const positionMode = searchParams.get('positionMode') ?? 'all'
  const returnMode = searchParams.get('returnMode') ?? 'all'
  const visibility = searchParams.get('visibility') ?? 'visible'
  const workFeeMode = searchParams.get('workFeeMode') ?? 'all'

  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : defaultFrom
  const to   = searchParams.get('to')   ? new Date(searchParams.get('to')!)   : new Date(now.setHours(23,59,59,999))
  to.setHours(23, 59, 59, 999)

  const where: any = { dateClose: { gte: from, lte: to } }
  const and: any[] = []

  if (session.role === 'MANAGER') {
    and.push({ OR: [{ managerId: session.employeeId }, { managerName: session.name }] })
  }
  if (session.role === 'ADMIN' && shopId) where.shopId = shopId
  if (status) where.statusName = status
  if (session.role === 'ADMIN' && manager) where.managerName = manager
  if (master) where.masterName = master
  if (returnMode === 'only') where.isReturn = true
  if (returnMode === 'exclude') where.isReturn = false
  if (visibility === 'visible') where.isVisible = true
  if (visibility === 'hidden') where.isVisible = false
  if (search) {
    and.push({ OR: [
      { number:           { contains: search, mode: 'insensitive' } },
      { brand:            { contains: search, mode: 'insensitive' } },
      { model:            { contains: search, mode: 'insensitive' } },
      { masterName:       { contains: search, mode: 'insensitive' } },
      { managerName:      { contains: search, mode: 'insensitive' } },
      { counteragentPhone:{ contains: search } },
    ] })
  }
  if (and.length > 0) where.AND = and

  const baseWhere: any = session.role === 'MANAGER'
    ? { OR: [{ managerId: session.employeeId }, { managerName: session.name }] }
    : {}

  const [orders, statuses, shops, managers, masters, paymentTypes] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true, number: true, num: true, shopId: true,
        shop: { select: { name: true } },
        dateCreate: true, dateClose: true, lastAction: true,
        brand: true, model: true, typeDevice: true,
        managerName: true, masterName: true,
        statusName: true, statusColor: true, statusType: true,
        orderTypeName: true,
        paymentType: true,
        revenue: true, orderReturn: true,
        isReturn: true, isVisible: true,
        positions: { select: { purchasePriceSumm: true } },
      },
      orderBy: { dateClose: 'desc' },
    }),
    prisma.order.findMany({
      where: baseWhere,
      select: { statusName: true },
      distinct: ['statusName'],
      orderBy: { statusName: 'asc' },
    }),
    session.role === 'ADMIN'
      ? prisma.shop.findMany({ where: { isVisible: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
    prisma.order.findMany({
      where: baseWhere,
      select: { managerName: true },
      distinct: ['managerName'],
      orderBy: { managerName: 'asc' },
    }),
    prisma.order.findMany({
      where: baseWhere,
      select: { masterName: true },
      distinct: ['masterName'],
      orderBy: { masterName: 'asc' },
    }),
    prisma.order.findMany({
      where: baseWhere,
      select: { paymentType: true },
      distinct: ['paymentType'],
      orderBy: { paymentType: 'asc' },
    }),
  ])

  const ordersWithFinance = orders.map(o => {
    const isExcludedFromFinance = o.isReturn || !o.isVisible
    const hasPositions = o.positions.length > 0
    const costTotal = o.positions.reduce((s, p) => s + p.purchasePriceSumm, 0)
    const margin    = hasPositions && !isExcludedFromFinance ? o.revenue - costTotal : null
    const isHighMargin = margin !== null && margin >= 5000
    const { positions: _, ...rest } = o
    return {
      ...rest,
      paymentType: normalizePaymentType(o.paymentType),
      financeRevenue: isExcludedFromFinance ? 0 : o.revenue,
      costTotal: hasPositions && !isExcludedFromFinance ? costTotal : null,
      margin,
      isHighMargin,
      vmrBonus: isHighMargin && margin !== null ? Math.round(margin * 0.25) : 0,
      cashBonus: margin !== null && normalizePaymentType(o.paymentType) === 'Наличные' ? Math.round(margin * 0.025) : 0,
    }
  })
  const filteredOrders = ordersWithFinance.filter(o => {
    if (paymentType && o.paymentType !== paymentType) return false
    if (marginMode === 'only') return o.isHighMargin
    if (marginMode === 'exclude') return !o.isHighMargin
    if (positionMode === 'without') return o.margin === null && !o.isReturn && o.isVisible
    if (positionMode === 'with') return o.margin !== null
    if (workFeeMode === 'available') {
      return Boolean(o.managerName && o.masterName && o.managerName === o.masterName && o.isHighMargin && o.isVisible && !o.isReturn)
    }
    return true
  })
  const summary = filteredOrders.reduce((acc, o) => {
    acc.revenue += o.financeRevenue
    acc.margin += o.margin ?? 0
    if (o.margin !== null) acc.withMargin++
    if (o.margin === null && !o.isReturn && o.isVisible) acc.withoutPositions++
    if (o.isHighMargin) acc.highMargin++
    if (o.isReturn || o.orderReturn > 0) acc.returns++
    if (!o.isVisible) acc.deleted++
    if (o.financeRevenue > 0) acc.avgBase++
    return acc
  }, {
    revenue: 0,
    margin: 0,
    withMargin: 0,
    withoutPositions: 0,
    highMargin: 0,
    returns: 0,
    deleted: 0,
    avgBase: 0,
  })
  const avgCheck = summary.avgBase > 0 ? Math.round(summary.revenue / summary.avgBase) : 0
  const paginatedOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const workFeeOrderIds = paginatedOrders.length > 0
    ? await prisma.targetAction.findMany({
      where: {
        actionType: 'Работа по ремонту',
        orderId: { in: paginatedOrders.map(o => o.id) },
      },
      select: { orderId: true },
      distinct: ['orderId'],
    })
    : []
  const workFeeSet = new Set(workFeeOrderIds.map(w => w.orderId).filter(Boolean))
  const ordersResult = paginatedOrders.map(o => ({ ...o, hasWorkFee: workFeeSet.has(o.id) }))

  return NextResponse.json({
    orders: ordersResult,
    total: filteredOrders.length,
    pages: Math.ceil(filteredOrders.length / PAGE_SIZE),
    summary: { ...summary, avgCheck },
    statuses: statuses.map(s => s.statusName).filter(Boolean),
    shops,
    managers: managers.map(m => m.managerName).filter(Boolean),
    masters:  masters.map(m => m.masterName).filter(Boolean),
    paymentTypes: Array.from(new Set(paymentTypes.map(p => normalizePaymentType(p.paymentType)).filter(Boolean))),
  })
}
