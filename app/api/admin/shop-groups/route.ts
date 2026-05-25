import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'
import { calcGangsterBonuses } from '@/lib/sync/gangster'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const [groups, shops] = await Promise.all([
    prisma.shopGroup.findMany({
      select: { id: true, name: true, threshold: true, shops: { select: { id: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.shop.findMany({
      where: { isVisible: true },
      select: { id: true, name: true, groupId: true, gangsterThreshold: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return NextResponse.json({ groups, shops })
}

// Сохраняет группы (upsert по id/name) + назначение салонов + индивидуальные пороги
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    groups: { id: number | null; name: string; threshold: number | null; shopIds: string[] }[]
    shops:  { id: string; gangsterThreshold: number | null }[]   // ungrouped shops
  }

  // Upsert групп
  const savedGroups: { id: number; name: string; shopIds: string[] }[] = []
  for (const g of body.groups) {
    if (!g.name.trim()) continue
    let record: { id: number }
    if (g.id) {
      record = await prisma.shopGroup.update({
        where: { id: g.id },
        data: { name: g.name.trim(), threshold: g.threshold },
        select: { id: true },
      })
    } else {
      record = await prisma.shopGroup.create({
        data: { name: g.name.trim(), threshold: g.threshold },
        select: { id: true },
      })
    }
    savedGroups.push({ id: record.id, name: g.name.trim(), shopIds: g.shopIds })
  }

  // Удаляем группы которых больше нет
  const keepIds = savedGroups.map(g => g.id)
  const toDelete = await prisma.shopGroup.findMany({
    where: keepIds.length ? { id: { notIn: keepIds } } : {},
    select: { id: true },
  })
  if (toDelete.length) {
    // Сначала отвязываем салоны
    await prisma.shop.updateMany({ where: { groupId: { in: toDelete.map(d => d.id) } }, data: { groupId: null } })
    await prisma.shopGroup.deleteMany({ where: { id: { in: toDelete.map(d => d.id) } } })
  }

  // Назначаем салоны в группы
  for (const g of savedGroups) {
    if (g.shopIds.length) {
      await prisma.shop.updateMany({ where: { id: { in: g.shopIds } }, data: { groupId: g.id } })
    }
  }

  // Отвязываем салоны которые убрали из всех групп
  const allAssigned = savedGroups.flatMap(g => g.shopIds)
  await prisma.shop.updateMany({
    where: { groupId: { not: null }, id: { notIn: allAssigned } },
    data: { groupId: null },
  })

  // Сохраняем индивидуальные пороги для салонов без группы
  for (const s of body.shops) {
    await prisma.shop.update({ where: { id: s.id }, data: { gangsterThreshold: s.gangsterThreshold } })
  }

  // Пересчитываем бонусы
  try {
    const result = await calcGangsterBonuses()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: true, created: 0, deleted: 0, warning: e?.message })
  }
}
