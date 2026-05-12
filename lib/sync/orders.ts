import { prisma } from '@/lib/db'
import { liveskladFetch, fetchAllPages, sleep } from '@/lib/livesklad/client'

const PAYMENT_ORDER = ['Наличные', 'Безнал', 'Счёт']
const DELTA_LOOKBACK_MS = 60 * 60 * 1000

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

function buildOrderRow(data: any) {
  const paymentTypes = [...new Set(
    (data.cash?.elements ?? []).map((e: any) => e.isBankTransfer ? 'Безнал' : 'Наличные')
  )]

  return {
    id:                 data.id,
    number:             data.number          ?? null,
    num:                data.num             ?? null,
    shopId:             data.shop?.id,
    counteragentRating: data.counteragent?.rating ?? null,
    counteragentPhone:  (data.counteragent?.phones ?? [])[0] ?? null,

    dateCreate:         data.dateCreate  ? new Date(data.dateCreate)  : null,
    dateFinish:         data.dateFinish  ? new Date(data.dateFinish)  : null,
    dateClose:          data.dateClose   ? new Date(data.dateClose)   : null,
    lastAction:         data.lastAction  ? new Date(data.lastAction)  : null,

    typeDevice:         data.typeDevice     ?? null,
    typeDeviceId:       data.typeDeviceId   ?? null,
    brand:              data.brand          ?? null,
    model:              data.model          ?? null,
    sn:                 data.sn             ?? null,
    device:             data.device         ?? null,
    problem:            (data.problem ?? []).join(', ')     || null,
    completeSet:        (data.completeSet ?? []).join(', ') || null,
    appearance:         (data.appearance ?? []).join(', ')  || null,
    approximatePrice:   data.approximatePrice ?? null,
    orderNode:          data.orderNode        ?? null,
    color:              data.color            ?? null,

    managerName:        data.manager?.name       ?? null,
    managerId:          data.manager?.id         ?? null,
    createdByName:      data.createManager?.name ?? null,
    createdById:        data.createManager?.id   ?? null,
    masterName:         data.master?.name        ?? null,
    masterId:           data.master?.id          ?? null,
    closeManagerName:   data.closeManager?.name  ?? null,
    counteragentName:   data.counteragent?.name  ?? null,

    statusId:           data.status?.id    ?? null,
    statusName:         data.status?.name  ?? null,
    statusColor:        data.status?.color ?? null,
    statusType:         data.status?.type  ?? null,

    orderTypeName:      data.typeOrder?.name ?? null,
    orderTypeId:        data.typeOrder?.id   ?? null,

    isUrgent:           data.isUrgent  ?? false,
    isVisible:          data.isVisible ?? true,
    howKnowName:        data.howKnow?.name ?? null,

    revenue:            data.cash?.order      ?? 0,
    orderReturn:        data.cash?.orderReturn ?? 0,
    paymentType:        normalizePaymentType(paymentTypes.join(', ') || null),
    isReturn:           (data.cash?.orderReturn ?? 0) > 0,
  }
}

function buildPositions(data: any) {
  return (data.positions ?? []).map((p: any) => ({
    id:                String(p.positionId ?? p.id),
    orderId:           String(data.id),
    name:              p.name ?? '',
    isWork:            Boolean(p.isWork),
    price:             p.price        ?? 0,
    soldPrice:         p.soldPrice    ?? p.price ?? 0,
    count:             p.count        ?? 1,
    purchasePriceSumm: p.purchasePriceSumm ?? (p.purchasePrice ?? 0) * (p.count ?? 1),
    guaranteeInDay:    p.guaranteeInDay ?? null,
    code:              p.code ?? null,
  }))
}

async function upsertOrderBonus(row: ReturnType<typeof buildOrderRow>, positions: ReturnType<typeof buildPositions>) {
  const existing = await prisma.targetAction.findMany({
    where: { orderId: String(row.id), source: 'AUTO', actionType: 'Бонус' },
    select: { id: true, subType: true },
  })
  const findExisting = (subTypes: string[]) => existing.find(a => subTypes.includes(a.subType ?? ''))
  const deleteMissing = async (keepSubTypes: string[]) => {
    const toDelete = existing.filter(a => !keepSubTypes.includes(a.subType ?? ''))
    for (const action of toDelete) await prisma.targetAction.delete({ where: { id: action.id } })
  }

  if (!row.managerName || row.isReturn || !row.isVisible || positions.length === 0) {
    await deleteMissing([])
    return
  }

  const totalCost = positions.reduce((s: number, p: { purchasePriceSumm: number }) => s + p.purchasePriceSumm, 0)
  const margin    = row.revenue - totalCost
  const date         = row.dateClose ?? row.dateFinish ?? new Date()
  const orderRef     = row.number ?? row.id
  const keepSubTypes: string[] = []

  async function upsertBonus(subType: string, legacySubTypes: string[], amount: number, isHighMargin: boolean, comment: string) {
    keepSubTypes.push(subType)
    const current = findExisting([subType, ...legacySubTypes])
    const data = { amount, subType, isHighMargin, date, employeeName: row.managerName!, shopId: row.shopId, comment }
    if (current) {
      await prisma.targetAction.update({ where: { id: current.id }, data })
    } else {
      await prisma.targetAction.create({
        data: {
          actionType: 'Бонус',
          subType,
          employeeName: row.managerName!,
          shopId: row.shopId,
          amount,
          isHighMargin,
          orderId: String(row.id),
          source: 'AUTO',
          date,
          comment,
        },
      })
    }
  }

  if (margin >= 4000) {
    await upsertBonus(
      'За ВМР',
      ['Зарплата за Заказ'],
      Math.round(margin * 0.20),
      true,
      `ВМР ${orderRef} | Маржа ${Math.round(margin).toLocaleString('ru-RU')} ₽`,
    )
  }

  if (normalizePaymentType(row.paymentType) === 'Наличные') {
    await upsertBonus(
      'За наличность',
      [],
      Math.round(margin * 0.025),
      false,
      `Наличная оплата ${orderRef} | Маржа ${Math.round(margin).toLocaleString('ru-RU')} ₽`,
    )
  }

  await deleteMissing(keepSubTypes)
}

async function syncOrderDetail(data: any) {
  const row       = buildOrderRow(data)
  const positions = buildPositions(data)

  await prisma.order.upsert({ where: { id: row.id }, update: row, create: row })

  await prisma.orderPosition.deleteMany({ where: { orderId: row.id } })
  if (positions.length > 0) {
    await prisma.orderPosition.createMany({ data: positions, skipDuplicates: true })
  }
  await upsertOrderBonus(row, positions)
}

async function syncOrderList(orders: any[]) {
  let count = 0
  for (const order of orders) {
    const detail = await liveskladFetch(`/orders/${order.id}`)
    await syncOrderDetail(detail.data)
    count++
    await sleep(200)
  }
  return count
}

export async function syncOrdersDelta(shopIds: string[]) {
  const now = Date.now()
  const dateFilter = encodeURIComponent(JSON.stringify([now - DELTA_LOOKBACK_MS, now]))

  let total = 0
  for (const shopId of shopIds) {
    const orders = await fetchAllPages<any>(
      (page) => `/shops/${shopId}/orders?lastAction=${dateFilter}&page=${page}&pageSize=50&sort=lastAction ASC`
    )
    total += await syncOrderList(orders)
  }
  return total
}
