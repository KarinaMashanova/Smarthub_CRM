import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const from     = searchParams.get('from')
  const to       = searchParams.get('to')
  const employee = searchParams.get('employee') ?? ''

  const where: any = { actionType: 'Работа по ремонту' }

  if (session.role === 'MANAGER') {
    where.employeeName = session.name
  } else if (employee) {
    where.employeeName = { contains: employee, mode: 'insensitive' }
  }

  if (from || to) {
    where.date = {}
    if (from) where.date.gte = new Date(from)
    if (to)   where.date.lte = new Date(to + 'T23:59:59')
  }

  const works = await prisma.targetAction.findMany({
    where,
    orderBy: { date: 'desc' },
    select: {
      id: true, date: true, employeeName: true, shopId: true,
      amount: true, comment: true, isTaken: true, takenAt: true,
      paymentDate: true,
      orderId: true, createdAt: true,
    },
  })

  // Подтянуть номера заказов
  const orderIds = works.map(w => w.orderId).filter(Boolean) as string[]
  const orders   = orderIds.length > 0
    ? await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } })
    : []
  const orderMap = Object.fromEntries(orders.map(o => [o.id, o.number]))

  return NextResponse.json({
    works: works.map(w => ({ ...w, orderNumber: w.orderId ? orderMap[w.orderId] ?? null : null })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { orderId, amount, comment, isTaken, date, paymentDate } = body

  if (!amount || amount <= 0) return NextResponse.json({ error: 'amount required' }, { status: 400 })

  // Проверить orderId если указан
  let shopId: string | null = session.shopId ?? null
  let orderNumber: string | null = null
  if (orderId) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { shopId: true, number: true } })
    if (!order) return NextResponse.json({ error: 'order not found' }, { status: 404 })
    shopId      = order.shopId
    orderNumber = order.number
  }

  const entryDate = date ? new Date(date) : new Date()
  const payDate = paymentDate ? new Date(paymentDate) : entryDate
  const work = await prisma.targetAction.create({
    data: {
      actionType:  'Работа по ремонту',
      subType:     'Оплата Работы по ремонту',
      employeeName: session.name,
      shopId,
      amount:      Number(amount),
      comment:     comment ?? (orderNumber ? `Заказ ${orderNumber}` : null),
      orderId:     orderId ?? null,
      source:      'MANUAL',
      isTaken:     Boolean(isTaken),
      takenAt:     isTaken ? payDate : null,
      date:        entryDate,
      paymentDate: isTaken ? payDate : null,
    },
  })

  return NextResponse.json({ work })
}
