import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'
import { RateLimitError } from '@/lib/livesklad/client'
import { syncShops } from '@/lib/sync/shops'
import { syncEmployees } from '@/lib/sync/employees'

export const maxDuration = 300

async function logSync(entity: string, fn: () => Promise<number>) {
  const log = await prisma.syncLog.create({ data: { entity, status: 'running' } })
  try {
    const count = await fn()
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'ok', count, finishedAt: new Date() },
    })
    return count
  } catch (error: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'error', error: error.message, finishedAt: new Date() },
    })
    throw error
  }
}

export async function POST() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const shops = await logSync('shops_directory_backfill', syncShops)
    const shopIds = (await prisma.shop.findMany({ select: { id: true } })).map((shop) => shop.id)
    const employees = await logSync('employees_directory_backfill', () => syncEmployees(shopIds))
    return NextResponse.json({ ok: true, shops, employees })
  } catch (error: any) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'rate_limit', retryAfter: error.resetAt.toISOString() },
        { status: 429 },
      )
    }
    return NextResponse.json({ error: error.message ?? String(error) }, { status: 500 })
  }
}
