import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const employees = await prisma.employee.findMany({
    include: { shop: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(
    employees.map(e => ({
      id: e.id,
      name: e.name,
      role: e.role,
      shopId: e.shopId,
      shopName: e.shop.name,
      appRole: e.appRole,
      isPasswordSet: e.isPasswordSet,
    }))
  )
}
