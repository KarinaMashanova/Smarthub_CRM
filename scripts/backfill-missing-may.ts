import 'dotenv/config'
import { prisma } from '@/lib/db'
import { fetchAllPages, liveskladFetch, sleep, RateLimitError } from '@/lib/livesklad/client'
import { syncOrderDetail } from '@/lib/sync/orders'
import { syncSaleDetail } from '@/lib/sync/sales'

const MAY_FROM = new Date('2026-04-30T21:00:00.000Z')
const MAY_TO = new Date('2026-05-24T21:00:00.000Z')
const PAGE_SIZE = 100

type SourceDoc = { id: string; shopId: string }

function uniqueById(docs: SourceDoc[]) {
  const map = new Map<string, SourceDoc>()
  for (const doc of docs) {
    if (!map.has(doc.id)) map.set(doc.id, doc)
  }
  return Array.from(map.values())
}

async function withRateLimitRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  while (true) {
    try {
      return await fn()
    } catch (error) {
      if (!(error instanceof RateLimitError)) throw error
      const waitMs = Math.max(1_000, error.resetAt.getTime() - Date.now() + 2_000)
      console.log(`[may-backfill] rate limit during ${label}; waiting until ${error.resetAt.toISOString()}`)
      await sleep(waitMs)
    }
  }
}

function dateFilter(from: Date, to: Date) {
  return encodeURIComponent(JSON.stringify([from.getTime(), to.getTime() - 1]))
}

async function finishLog(id: number, status: 'ok' | 'error', count: number, error?: string) {
  await prisma.syncLog.update({
    where: { id },
    data: { status, count, error, finishedAt: new Date() },
  })
}

async function loadSourceIds() {
  const shops = await prisma.shop.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
  const filter = dateFilter(MAY_FROM, MAY_TO)
  const orders: SourceDoc[] = []
  const sales: SourceDoc[] = []

  for (const shop of shops) {
    const shopOrders = await withRateLimitRetry(
      `orders list ${shop.name}`,
      () => fetchAllPages<any>(
        (page) => `/shops/${shop.id}/orders?dateClose=${filter}&page=${page}&pageSize=${PAGE_SIZE}&sort=dateClose ASC`,
        PAGE_SIZE,
      ),
    )
    orders.push(...shopOrders.map((doc) => ({ id: String(doc.id), shopId: shop.id })))
    await sleep(500)

    const shopSales = await withRateLimitRetry(
      `sales list ${shop.name}`,
      () => fetchAllPages<any>(
        (page) => `/shops/${shop.id}/sales?date=${filter}&page=${page}&pageSize=${PAGE_SIZE}&sort=date ASC`,
        PAGE_SIZE,
      ),
    )
    sales.push(...shopSales.map((doc) => ({ id: String(doc.id), shopId: shop.id })))
    await sleep(500)
  }

  return { orders, sales }
}

async function main() {
  console.log(`[may-backfill] started ${new Date().toISOString()}`)
  console.log(`[may-backfill] range ${MAY_FROM.toISOString()}..${MAY_TO.toISOString()}`)

  const log = await prisma.syncLog.create({ data: { entity: 'may_missing_backfill', status: 'running' } })
  try {
    const rawSource = await loadSourceIds()
    const source = {
      orders: uniqueById(rawSource.orders),
      sales: uniqueById(rawSource.sales),
    }
    console.log(`[may-backfill] deduped source orders ${rawSource.orders.length} -> ${source.orders.length}`)
    console.log(`[may-backfill] deduped source sales ${rawSource.sales.length} -> ${source.sales.length}`)
    const [dbOrders, dbSales] = await Promise.all([
      prisma.order.findMany({
        where: { dateClose: { gte: MAY_FROM, lt: MAY_TO } },
        select: { id: true },
      }),
      prisma.sale.findMany({
        where: { date: { gte: MAY_FROM, lt: MAY_TO } },
        select: { id: true },
      }),
    ])

    const dbOrderIds = new Set(dbOrders.map((row) => row.id))
    const dbSaleIds = new Set(dbSales.map((row) => row.id))
    const missingOrders = source.orders.filter((doc) => !dbOrderIds.has(doc.id))
    const missingSales = source.sales.filter((doc) => !dbSaleIds.has(doc.id))

    console.log(`[may-backfill] source orders=${source.orders.length}, db=${dbOrderIds.size}, missing=${missingOrders.length}`)
    console.log(`[may-backfill] source sales=${source.sales.length}, db=${dbSaleIds.size}, missing=${missingSales.length}`)

    let synced = 0
    for (const order of missingOrders) {
      const detail = await withRateLimitRetry(
        `order detail ${order.id}`,
        () => liveskladFetch(`/orders/${order.id}`),
      )
      await syncOrderDetail(detail.data)
      synced++
      console.log(`[may-backfill] synced order ${order.id} (${synced}/${missingOrders.length + missingSales.length})`)
      await sleep(700)
    }

    for (const sale of missingSales) {
      const detail = await withRateLimitRetry(
        `sale detail ${sale.id}`,
        () => liveskladFetch(`/documents/${sale.id}`),
      )
      await syncSaleDetail(detail.data, sale.shopId)
      synced++
      console.log(`[may-backfill] synced sale ${sale.id} (${synced}/${missingOrders.length + missingSales.length})`)
      await sleep(700)
    }

    await finishLog(log.id, 'ok', synced)
    console.log(`[may-backfill] done synced=${synced}`)
  } catch (error: any) {
    const message = error instanceof RateLimitError
      ? `${error.message}; retryAfter=${error.resetAt.toISOString()}`
      : error?.message ?? String(error)
    await finishLog(log.id, 'error', 0, message)
    console.error(`[may-backfill] failed: ${message}`)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main()
