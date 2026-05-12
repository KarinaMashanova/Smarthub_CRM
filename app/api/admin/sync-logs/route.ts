import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [logs, shops, employees, orders, sales, scheduleSlots] =
    await Promise.all([
      prisma.syncLog.findMany({ orderBy: { id: 'desc' }, take: 100 }),
      prisma.shop.count(),
      prisma.employee.count(),
      prisma.order.count(),
      prisma.sale.count(),
      prisma.scheduleSlot.count(),
    ])

  return NextResponse.json({
    logs,
    counts: { shops, employees, orders, sales, scheduleSlots },
  })
}
