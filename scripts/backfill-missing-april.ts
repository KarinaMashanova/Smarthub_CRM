import 'dotenv/config'
import { prisma } from '@/lib/db'
import { fetchAllPages, liveskladFetch, sleep, RateLimitError } from '@/lib/livesklad/client'
import { syncOrderDetail } from '@/lib/sync/orders'
import { syncSaleDetail } from '@/lib/sync/sales'

const APRIL_FROM = new Date('2026-03-31T21:00:00.000Z')
const APRIL_TO = new Date('2026-04-30T21:00:00.000Z')
const PAGE_SIZE = 100

type SourceDoc = { id: string; shopId: string }

function dateFilter(from: Date, to: Date) {
  return encodeURIComponent(JSON.stringify([from.getTime(), to.getTime() - 1]))
}

async function createLog(entity: string) {
  return prisma.syncLog.create({ data: { entity, status: 'running' } })
}

async function finishLog(id: number, status: 'ok' | 'error', count: number, error?: string) {
  await prisma.syncLog.update({
    where: { id },
    data: { status, count, error, finishedAt: new Date() },
  })
}

async function loadSourceIds() {
  const shops = await prisma.shop.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
  const filter = dateFilter(APRIL_FROM, APRIL_TO)
  const orders: SourceDoc[] = []
  const sales: SourceDoc[] = []

  for (const shop of shops) {
    const shopOrders = await fetchAllPages<any>(
      (page) => `/shops/${shop.id}/orders?dateClose=${filter}&page=${page}&pageSize=${PAGE_SIZE}&sort=dateClose ASC`,
      PAGE_SIZE,
    )
    orders.push(...shopOrders.map((doc) => ({ id: String(doc.id), shopId: shop.id })))
    await sleep(500)

    const shopSales = await fetchAllPages<any>(
      (page) => `/shops/${shop.id}/sales?date=${filter}&page=${page}&pageSize=${PAGE_SIZE}&sort=date ASC`,
      PAGE_SIZE,
    )
    sales.push(...shopSales.map((doc) => ({ id: String(doc.id), shopId: shop.id })))
    await sleep(500)
  }

  return { orders, sales }
}

async function main() {
  const startedAt = new Date()
  console.log(`[april-backfill] started ${startedAt.toISOString()}`)

  const log = await createLog('april_missing_backfill')
  try {
    const source = await loadSourceIds()
    const [dbOrders, dbSales] = await Promise.all([
      prisma.order.findMany({
        where: { dateClose: { gte: APRIL_FROM, lt: APRIL_TO } },
        select: { id: true },
      }),
      prisma.sale.findMany({
        where: { date: { gte: APRIL_FROM, lt: APRIL_TO } },
        select: { id: true },
      }),
    ])

    const dbOrderIds = new Set(dbOrders.map((row) => row.id))
    const dbSaleIds = new Set(dbSales.map((row) => row.id))
    const missingOrders = source.orders.filter((doc) => !dbOrderIds.has(doc.id))
    const missingSales = source.sales.filter((doc) => !dbSaleIds.has(doc.id))

    console.log(`[april-backfill] source orders=${source.orders.length}, db=${dbOrderIds.size}, missing=${missingOrders.length}`)
    console.log(`[april-backfill] source sales=${source.sales.length}, db=${dbSaleIds.size}, missing=${missingSales.length}`)

    let synced = 0
    for (const order of missingOrders) {
      const detail = await liveskladFetch(`/orders/${order.id}`)
      await syncOrderDetail(detail.data)
      synced++
      console.log(`[april-backfill] synced order ${order.id} (${synced}/${missingOrders.length + missingSales.length})`)
      await sleep(700)
    }

    for (const sale of missingSales) {
      const detail = await liveskladFetch(`/documents/${sale.id}`)
      await syncSaleDetail(detail.data, sale.shopId)
      synced++
      console.log(`[april-backfill] synced sale ${sale.id} (${synced}/${missingOrders.length + missingSales.length})`)
      await sleep(700)
    }

    await finishLog(log.id, 'ok', synced)
    console.log(`[april-backfill] done synced=${synced}`)
  } catch (error: any) {
    const message = error instanceof RateLimitError
      ? `${error.message}; retryAfter=${error.resetAt.toISOString()}`
      : error?.message ?? String(error)
    await finishLog(log.id, 'error', 0, message)
    console.error(`[april-backfill] failed: ${message}`)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main()
