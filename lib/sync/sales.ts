import { prisma } from '@/lib/db'
import { liveskladFetch, fetchAllPages, sleep } from '@/lib/livesklad/client'

const DELTA_LOOKBACK_MS = 4 * 60 * 60 * 1000
const PAYMENT_ORDER = ['Наличные', 'Безнал', 'Счёт']

function normalizePaymentType(value: string | null) {
  if (!value) return null
  const parts = Array.from(new Set(value.split(',').map(p => p.trim()).filter(Boolean)))
  parts.sort((a, b) => {
    const ai = PAYMENT_ORDER.indexOf(a)
    const bi = PAYMENT_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b, 'ru')
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
  return parts.join(', ')
}

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
    sellerName:  data.responsible?.name ?? data.employee?.name ?? data.customer?.name ?? data.createdBy?.name ?? null,
    cashMoney,
    cashBank,
    cashInvoice,
    revenue,
    refund,
    paymentType: normalizePaymentType(paymentTypes.join(', ') || null),
    isReturn,
  }
}

function buildPositions(data: any): Array<{
  saleId: string
  name: string
  isWork: boolean
  price: number
  soldPrice: number
  count: number
  purchasePriceSumm: number
  code: number | null
}> {
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

async function upsertSaleBonus(row: ReturnType<typeof buildSaleRow>, positions: ReturnType<typeof buildPositions>) {
  const existing = await prisma.targetAction.findMany({
    where: { saleId: String(row.id), source: 'AUTO', actionType: 'Бонус' },
    select: { id: true, subType: true },
  })
  const keepSubTypes: string[] = []
  const findExisting = (subTypes: string[]) => existing.find(a => subTypes.includes(a.subType ?? ''))
  const deleteMissing = async (keep: string[]) => {
    const toDelete = existing.filter(a => !keep.includes(a.subType ?? ''))
    for (const action of toDelete) await prisma.targetAction.delete({ where: { id: action.id } })
  }

  if (!row.sellerName || row.isReturn || positions.length === 0) {
    await deleteMissing([])
    return
  }

  const costTotal = positions.reduce((s: number, p) => s + p.purchasePriceSumm, 0)
  const margin = row.revenue - costTotal
  const saleRef = row.number ?? row.id

  async function upsertBonus(subType: string, amount: number, comment: string) {
    keepSubTypes.push(subType)
    const current = findExisting([subType])
    const data = { amount, subType, isHighMargin: false, date: row.date ?? new Date(), employeeName: row.sellerName!, shopId: row.shopId, comment }
    if (current) {
      await prisma.targetAction.update({ where: { id: current.id }, data })
    } else {
      await prisma.targetAction.create({
        data: {
          ...data,
          actionType: 'Бонус',
          saleId: String(row.id),
          source: 'AUTO',
        },
      })
    }
  }

  if (margin > 0 && normalizePaymentType(row.paymentType) === 'Наличные') {
    await upsertBonus(
      'За наличность',
      Math.round(margin * 0.025),
      `Наличная продажа ${saleRef} | Маржа ${Math.round(margin).toLocaleString('ru-RU')} ₽`,
    )
  }

  await deleteMissing(keepSubTypes)
}

export async function syncSaleDetail(detail: any, shopId: string) {
  const row       = buildSaleRow(detail, shopId)
  const positions = buildPositions(detail)

  await prisma.sale.upsert({ where: { id: row.id }, update: row, create: row })

  if (positions.length > 0) {
    await prisma.salePosition.deleteMany({ where: { saleId: row.id } })
    await prisma.salePosition.createMany({ data: positions })
  }
  await upsertSaleBonus(row, positions)
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

export async function syncSalesRange(shopIds: string[], from: Date, to: Date) {
  const dateFilter = encodeURIComponent(JSON.stringify([from.getTime(), to.getTime()]))
  let count = 0

  for (const shopId of shopIds) {
    const sales = await fetchAllPages<any>(
      (page) => `/shops/${shopId}/sales?date=${dateFilter}&page=${page}&pageSize=50&sort=date ASC`
    )
    count += await syncSaleList(sales, shopId)
  }
  return count
}
