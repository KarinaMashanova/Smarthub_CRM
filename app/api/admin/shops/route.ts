import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'
import { calcGangsterBonuses } from '@/lib/sync/gangster'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const shops = await prisma.shop.findMany({
      where: { isVisible: true },
      select: { id: true, name: true, gangsterThreshold: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ shops })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { thresholds } = await req.json() as { thresholds: { id: string; gangsterThreshold: number | null }[] }
  await Promise.all(
    thresholds.map(({ id, gangsterThreshold }) =>
      prisma.shop.update({ where: { id }, data: { gangsterThreshold } })
    )
  )
  const result = await calcGangsterBonuses()
  return NextResponse.json({ ok: true, ...result })
}
