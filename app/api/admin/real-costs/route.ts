import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [catalogItems, orderGroups, saleGroups] = await Promise.all([
    prisma.realCostItem.findMany({ orderBy: { name: 'asc' } }),
    prisma.orderPosition.groupBy({
      by: ['name'],
      _sum: { count: true, purchasePriceSumm: true },
      _count: { name: true },
    }),
    prisma.salePosition.groupBy({
      by: ['name'],
      where: { isWork: false },
      _sum: { count: true, purchasePriceSumm: true },
      _count: { name: true },
    }),
  ])

  const catalogNames = new Set(catalogItems.map(i => i.name))

  // Среднее LS-цена за единицу по всем заказам/продажам
  const posMap = new Map<string, { totalCost: number; totalCount: number; occurrences: number }>()
  for (const g of [...orderGroups, ...saleGroups]) {
    const cur = posMap.get(g.name) ?? { totalCost: 0, totalCount: 0, occurrences: 0 }
    posMap.set(g.name, {
      totalCost:   cur.totalCost   + (g._sum.purchasePriceSumm ?? 0),
      totalCount:  cur.totalCount  + (g._sum.count ?? 0),
      occurrences: cur.occurrences + g._count.name,
    })
  }

  const missing = Array.from(posMap.entries())
    .filter(([name]) => !catalogNames.has(name))
    .map(([name, s]) => ({
      name,
      lsAvgCost:   s.totalCount > 0 ? Math.round(s.totalCost / s.totalCount) : 0,
      occurrences: s.occurrences,
    }))
    .sort((a, b) => b.occurrences - a.occurrences)

  return NextResponse.json({ items: catalogItems, missing })
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
