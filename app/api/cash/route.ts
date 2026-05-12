import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
    ? new Date(searchParams.get('from')!)
    : new Date(new Date().setHours(0, 0, 0, 0))
  const to = searchParams.get('to')
    ? new Date(searchParams.get('to')!)
    : new Date(new Date().setHours(23, 59, 59, 999))

  const isManager = session.role === 'MANAGER' && !!session.shopId
  const shopFilter: any = isManager ? { shopId: session.shopId } : {}

  const [entries, shops, orderRev, saleRev] = await Promise.all([
    prisma.cashEntry.findMany({
      where: { ...shopFilter, date: { gte: from, lte: to } },
      include: { shop: { select: { name: true } } },
      orderBy: { date: 'desc' },
    }),
    session.role === 'ADMIN'
      ? prisma.shop.findMany({ where: { isVisible: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
    // Выручка из заказов (по dateClose)
    prisma.order.groupBy({
      by: ['shopId'],
      where: { ...shopFilter, dateClose: { gte: from, lte: to }, isReturn: false },
      _sum: { revenue: true },
    }),
    // Выручка из продаж (по date) — нал и безнал отдельно
    prisma.sale.groupBy({
      by: ['shopId'],
      where: { ...shopFilter, date: { gte: from, lte: to }, isReturn: false },
      _sum: { cashMoney: true, cashBank: true, revenue: true },
    }),
  ])

  // revenue map: { [shopId]: { orders, salesNal, salesBeznal } }
  const revenue: Record<string, { orders: number; salesNal: number; salesBeznal: number }> = {}
  for (const r of orderRev) {
    if (!r.shopId) continue
    if (!revenue[r.shopId]) revenue[r.shopId] = { orders: 0, salesNal: 0, salesBeznal: 0 }
    revenue[r.shopId].orders += r._sum.revenue ?? 0
  }
  for (const r of saleRev) {
    if (!r.shopId) continue
    if (!revenue[r.shopId]) revenue[r.shopId] = { orders: 0, salesNal: 0, salesBeznal: 0 }
    revenue[r.shopId].salesNal    += r._sum.cashMoney ?? 0
    revenue[r.shopId].salesBeznal += r._sum.cashBank  ?? 0
  }

  return NextResponse.json({ entries, shops, revenue })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const amount = Number(body.amount)
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  if (!body.type)      return NextResponse.json({ error: 'Missing type' }, { status: 400 })
  if (!body.payMethod) return NextResponse.json({ error: 'Missing payMethod' }, { status: 400 })

  const shopId = session.role === 'MANAGER' ? (session.shopId ?? '') : (body.shopId ?? '')
  if (!shopId) return NextResponse.json({ error: 'Missing shopId' }, { status: 400 })

  const entry = await prisma.cashEntry.create({
    data: {
      date:       body.date ? new Date(body.date) : new Date(),
      shopId,
      type:       body.type,
      payMethod:  body.payMethod,
      isIncome:   Boolean(body.isIncome),
      amount,
      comment:    body.comment || null,
      authorName: session.name,
    },
    include: { shop: { select: { name: true } } },
  })

  return NextResponse.json(entry, { status: 201 })
}
