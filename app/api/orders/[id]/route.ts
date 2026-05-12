import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      revenue: true,
      orderReturn: true,
      positions: {
        select: {
          id: true,
          name: true,
          isWork: true,
          soldPrice: true,
          price: true,
          count: true,
          purchasePriceSumm: true,
          guaranteeInDay: true,
        },
        orderBy: [{ isWork: 'desc' }, { soldPrice: 'desc' }],
      },
    },
  })

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Менеджер видит только заказы, где он указан менеджером.
  if (session.role === 'MANAGER') {
    const belongs = await prisma.order.count({ where: { id, shopId: session.shopId ?? '', managerName: session.name } })
    if (!belongs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(order)
}
