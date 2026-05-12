import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const period = searchParams.get('period') ?? 'week' // today | week | month

  const now = new Date()
  let from: Date

  if (period === 'today') {
    from = new Date(now); from.setHours(0, 0, 0, 0)
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1)
  } else {
    // week — пн текущей недели
    const day = now.getDay() || 7
    from = new Date(now); from.setDate(now.getDate() - day + 1); from.setHours(0, 0, 0, 0)
  }

  // Фильтр по магазину для менеджера
  const shopFilter = session.role === 'MANAGER' && session.shopId
    ? { shopId: session.shopId }
    : {}

  const dateFilter = { gte: from, lte: now }

  const [orders, sales, activeOrders] = await Promise.all([
    prisma.order.aggregate({
      where: { ...shopFilter, dateCreate: dateFilter, isVisible: true },
      _count: true,
      _sum: { revenue: true, orderReturn: true },
    }),
    prisma.sale.aggregate({
      where: { ...shopFilter, date: dateFilter, isReturn: false },
      _count: true,
      _sum: { revenue: true },
    }),
    prisma.order.count({
      where: { ...shopFilter, isVisible: true, statusType: { not: 'done' } },
    }),
  ])

  // Топ магазинов по выручке (только для админа)
  let shopStats: { shopId: string; revenue: number }[] = []
  if (session.role === 'ADMIN') {
    const byShop = await prisma.order.groupBy({
      by: ['shopId'],
      where: { dateCreate: dateFilter, isVisible: true },
      _sum: { revenue: true },
      orderBy: { _sum: { revenue: 'desc' } },
      take: 5,
    })
    shopStats = byShop.map(s => ({ shopId: s.shopId, revenue: s._sum.revenue ?? 0 }))
  }

  return NextResponse.json({
    period,
    orders: {
      count: orders._count,
      revenue: orders._sum.revenue ?? 0,
      returns: orders._sum.orderReturn ?? 0,
    },
    sales: {
      count: sales._count,
      revenue: sales._sum.revenue ?? 0,
    },
    activeOrders,
    shopStats,
  })
}
