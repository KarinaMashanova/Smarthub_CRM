import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { liveskladFetch } from '@/lib/livesklad/client'
import { sleep } from '@/lib/livesklad/client'
import { getSession } from '@/lib/auth/session'

export const maxDuration = 300

export async function POST(_req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const remaining = await prisma.sale.count({ where: { sellerName: null } })

  const sales = await prisma.sale.findMany({
    where: { sellerName: null },
    select: { id: true },
    take: 100,
  })

  let updated = 0
  let failed = 0

  for (const sale of sales) {
    try {
      const detail = await liveskladFetch(`/documents/${sale.id}`)
      const name = detail?.data?.customer?.name ?? null
      if (name) {
        await prisma.sale.update({ where: { id: sale.id }, data: { sellerName: name } })
        updated++
      } else {
        // нет продавца — помечаем чтобы не зависать на них повторно
        await prisma.sale.update({ where: { id: sale.id }, data: { sellerName: 'unknown' } })
      }
      await sleep(100)
    } catch {
      failed++
    }
  }

  return NextResponse.json({
    batch: sales.length,
    updated,
    failed,
    remainingBefore: remaining,
    remainingAfter: await prisma.sale.count({ where: { sellerName: null } }),
  })
}
