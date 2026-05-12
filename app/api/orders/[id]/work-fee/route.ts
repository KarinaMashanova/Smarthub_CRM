import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const amount = Number(body.amount)
  const entryDate = body.date ? new Date(body.date) : new Date()
  const payDate = body.paymentDate ? new Date(body.paymentDate) : entryDate
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }

  // Проверяем, что заказ существует и менеджер имеет доступ
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      shopId: true,
      num: true,
      number: true,
      managerName: true,
      masterName: true,
      revenue: true,
      isReturn: true,
      isVisible: true,
      positions: { select: { purchasePriceSumm: true } },
    },
  })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.role === 'MANAGER' && order.shopId !== session.shopId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const margin = order.positions.length > 0 && !order.isReturn && order.isVisible
    ? order.revenue - order.positions.reduce((sum, p) => sum + p.purchasePriceSumm, 0)
    : null
  const canTakeSameDayWorkFee = Boolean(order.managerName && order.masterName && order.managerName === order.masterName && margin !== null && margin >= 4000)
  if (!canTakeSameDayWorkFee) {
    return NextResponse.json({ error: 'same_day_work_fee_not_allowed' }, { status: 403 })
  }

  const existing = await prisma.targetAction.findFirst({
    where: {
      orderId: id,
      actionType: 'Работа по ремонту',
    },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({ error: 'work_fee_exists' }, { status: 409 })
  }

  const employeeName = order.masterName ?? session.name
  const orderRef = order.num ? `Заказ #${order.num}` : order.number ? `Заказ ${order.number}` : `Заказ ${id}`

  const action = await prisma.targetAction.create({
    data: {
      date:            entryDate,
      actionType:      'Работа по ремонту',
      subType:         'Оплата Работы по ремонту',
      employeeName,
      shopId:          order.shopId,
      amount,
      comment:         `${orderRef} (${session.name})`,
      orderId:         id,
      source:          'MANUAL',
      responsibleName: session.name,
      paymentDate:     payDate,
      isTaken:         true,
      takenAt:         payDate,
    },
  })

  return NextResponse.json(action, { status: 201 })
}
