import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const search = searchParams.get('search')?.trim() ?? ''
  const seller = searchParams.get('seller') ?? ''
  const shop   = searchParams.get('shop')   ?? ''

  const now = new Date()
  const from = searchParams.get('from')
    ? new Date(searchParams.get('from')!)
    : new Date(now.getFullYear(), now.getMonth(), 1)
  const to = searchParams.get('to')
    ? new Date(searchParams.get('to')!)
    : new Date(now.setHours(23, 59, 59, 999))

  const where: any = { date: { gte: from, lte: to }, isReturn: false }

  if (session.role === 'MANAGER' && session.shopId) {
    where.shopId = session.shopId
    where.OR = [{ sellerName: session.name }, { sellerName: null }]
  } else if (shop) {
    where.shopId = shop
  }

  if (seller) { delete where.OR; where.sellerName = seller }
  if (search) {
    where.OR = [
      { number:     { contains: search, mode: 'insensitive' } },
      { sellerName: { contains: search, mode: 'insensitive' } },
    ]
  }

  const baseWhere: any = session.role === 'MANAGER' && session.shopId
    ? { shopId: session.shopId }
    : {}

  const [sales, total, sellers, shops, totals] = await Promise.all([
    prisma.sale.findMany({
      where,
      select: {
        id: true, number: true,
        shopId: true, shop: { select: { name: true } },
        date: true,
        sellerName: true,
        cashMoney: true, cashBank: true,
        revenue: true, refund: true, paymentType: true,
        positions: {
          select: {
            id: true, name: true, isWork: true,
            soldPrice: true, count: true, purchasePriceSumm: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where: { ...baseWhere, sellerName: { not: null } },
      select: { sellerName: true },
      distinct: ['sellerName'],
      orderBy: { sellerName: 'asc' },
    }),
    session.role === 'ADMIN'
      ? prisma.shop.findMany({ where: { isVisible: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
    prisma.sale.aggregate({
      where,
      _sum: { revenue: true, refund: true, cashMoney: true, cashBank: true },
      _count: { id: true },
    }),
  ])

  return NextResponse.json({
    sales,
    total,
    pages: Math.ceil(total / PAGE_SIZE),
    sellers: sellers.map(s => s.sellerName).filter(Boolean),
    shops,
    summary: {
      revenue:   totals._sum.revenue   ?? 0,
      cashMoney: totals._sum.cashMoney ?? 0,
      cashBank:  totals._sum.cashBank  ?? 0,
      refund:    totals._sum.refund    ?? 0,
      count:     totals._count.id,
    },
  })
}
