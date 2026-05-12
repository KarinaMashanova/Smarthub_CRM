import { prisma } from '@/lib/db'
import { liveskladFetch, fetchAllPages, sleep } from '@/lib/livesklad/client'

const DELTA_LOOKBACK_MS = 60 * 60 * 1000

function buildSaleRow(data: any, shopId: string) {
  const cashMoney   = data.cash?.money   ?? 0
  const cashBank    = data.cash?.bank    ?? 0
  const cashInvoice = data.cash?.invoice ?? 0
  const revenue     = cashMoney + cashBank + cashInvoice
  const refund      = data.cash?.orderReturn ?? 0
  const isReturn    = (data.positions ?? []).some((p: any) => (p.returnCount ?? 0) > 0)

  const paymentTypes = [...new Set(
    (data.cash?.elements ?? []).map((e: any) => e.isBankTransfer ? 'Безнал' : 'Наличные')
  )]

  return {
    id:          data.id,
    number:      data.number     ?? null,
    shopId:      data.shop?.id   ?? shopId,
    date:        data.date       ? new Date(data.date)       : null,
    dateChange:  data.dateChange ? new Date(data.dateChange) : null,
    sellerName:  data.responsible?.name ?? data.createdBy?.name ?? null,
    cashMoney,
    cashBank,
    cashInvoice,
    revenue,
    refund,
    paymentType: paymentTypes.join(', ') || null,
    isReturn,
  }
}

function buildPositions(data: any) {
  return (data.positions ?? []).map((p: any) => ({
    saleId:            String(data.id),
    name:              p.name ?? '',
    isWork:            Boolean(p.isWork),
    price:             p.price        ?? 0,
    soldPrice:         p.soldPrice    ?? p.price ?? 0,
    count:             p.count        ?? 1,
    purchasePriceSumm: p.purchasePriceSumm ?? (p.purchasePrice ?? 0) * (p.count ?? 1),
    code:              p.code         ?? null,
  }))
}

async function syncSaleDetail(detail: any, shopId: string) {
  const row       = buildSaleRow(detail, shopId)
  const positions = buildPositions(detail)

  await prisma.sale.upsert({ where: { id: row.id }, update: row, create: row })

  if (positions.length > 0) {
    await prisma.salePosition.deleteMany({ where: { saleId: row.id } })
    await prisma.salePosition.createMany({ data: positions })
  }
}

async function syncSaleList(sales: any[], shopId: string) {
  let count = 0
  for (const sale of sales) {
    const detail = await liveskladFetch(`/documents/${sale.id}`)
    await syncSaleDetail(detail.data, shopId)
    count++
    await sleep(200)
  }
  return count
}

export async function syncSalesDelta(shopIds: string[]) {
  const now        = Date.now()
  const dateFilter = encodeURIComponent(JSON.stringify([now - DELTA_LOOKBACK_MS, now]))
  let count = 0

  for (const shopId of shopIds) {
    const sales = await fetchAllPages<any>(
      (page) => `/shops/${shopId}/sales?date=${dateFilter}&page=${page}&pageSize=50&sort=date ASC`
    )
    count += await syncSaleList(sales, shopId)
  }
  return count
}
