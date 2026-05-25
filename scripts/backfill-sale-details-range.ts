import 'dotenv/config'
import { prisma } from '@/lib/db'
import { liveskladFetch, RateLimitError, sleep } from '@/lib/livesklad/client'
import { syncSaleDetail } from '@/lib/sync/sales'

const [, , fromArg, toArg] = process.argv

if (!fromArg || !toArg) {
  console.error('Usage: npx tsx scripts/backfill-sale-details-range.ts <from-iso> <to-iso>')
  process.exit(1)
}

const from = new Date(fromArg)
const to = new Date(toArg)

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function withRateLimitRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  while (true) {
    try {
      return await fn()
    } catch (error) {
      if (!(error instanceof RateLimitError)) throw error
      const waitMs = Math.max(1_000, error.resetAt.getTime() - Date.now() + 2_000)
      console.log(`[sale-detail-backfill] rate limit during ${label}; waiting until ${error.resetAt.toISOString()}`)
      await sleep(waitMs)
    }
  }
}

async function main() {
  console.log(`[sale-detail-backfill] started ${new Date().toISOString()}`)
  console.log(`[sale-detail-backfill] range ${from.toISOString()}..${to.toISOString()}`)

  const log = await prisma.syncLog.create({
    data: { entity: `sale_details_backfill:${fromArg}:${toArg}`, status: 'running' },
  })

  let synced = 0
  let skipped = 0
  let failed = 0

  try {
    const sales = await prisma.sale.findMany({
      where: {
        date: { gte: from, lte: to },
        positions: { none: {} },
      },
      select: { id: true, shopId: true, number: true, date: true },
      orderBy: { date: 'asc' },
    })

    console.log(`[sale-detail-backfill] sales without positions=${sales.length}`)

    for (let i = 0; i < sales.length; i++) {
      const sale = sales[i]
      try {
        const detail = await withRateLimitRetry(
          `sale detail ${sale.id}`,
          () => liveskladFetch(`/documents/${sale.id}`),
        )
        if (detail?.data) {
          await syncSaleDetail(detail.data, sale.shopId)
          synced++
        } else {
          skipped++
        }
      } catch (error: unknown) {
        failed++
        console.error(`[sale-detail-backfill] failed ${sale.id}: ${errorMessage(error)}`)
      }

      if ((i + 1) % 10 === 0 || i === sales.length - 1) {
        console.log(`[sale-detail-backfill] ${i + 1}/${sales.length} synced=${synced} skipped=${skipped} failed=${failed}`)
      }
      await sleep(700)
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'ok', count: synced, error: failed ? `failed=${failed}; skipped=${skipped}` : null, finishedAt: new Date() },
    })
    console.log(`[sale-detail-backfill] done synced=${synced} skipped=${skipped} failed=${failed}`)
  } catch (error: unknown) {
    const message = errorMessage(error)
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'error', count: synced, error: message, finishedAt: new Date() },
    })
    console.error(`[sale-detail-backfill] fatal: ${message}`)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main()
