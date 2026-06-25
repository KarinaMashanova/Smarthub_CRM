import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const items = await prisma.realCostItem.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { items: { name: string; realCost: number }[] }
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'items required' }, { status: 400 })
  }

  const valid = body.items.filter(i => i.name?.trim() && i.realCost >= 0)

  // Upsert all, delete removed
  const names = valid.map(i => i.name.trim())
  await prisma.$transaction([
    prisma.realCostItem.deleteMany({ where: { name: { notIn: names } } }),
    ...valid.map(i =>
      prisma.realCostItem.upsert({
        where: { name: i.name.trim() },
        update: { realCost: i.realCost, updatedBy: session.name },
        create: { name: i.name.trim(), realCost: i.realCost, updatedBy: session.name },
      })
    ),
  ])

  return NextResponse.json({ ok: true, count: valid.length })
}
