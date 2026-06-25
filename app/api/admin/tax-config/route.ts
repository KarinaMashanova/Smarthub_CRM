import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const shops = await prisma.shop.findMany({
    where: { isVisible: true },
    select: { id: true, name: true, taxSystem: true, taxRate: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ shops })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { shops: { id: string; taxSystem: string; taxRate: number | null }[] }
  if (!Array.isArray(body.shops)) {
    return NextResponse.json({ error: 'shops required' }, { status: 400 })
  }

  await prisma.$transaction(
    body.shops.map(s =>
      prisma.shop.update({
        where: { id: s.id },
        data: { taxSystem: s.taxSystem, taxRate: s.taxRate },
      })
    )
  )

  return NextResponse.json({ ok: true })
}
