import { prisma } from '@/lib/db'

// Правила начисления бонуса за настройку
// Сравнение case-insensitive, по contains
const RULES: { contains: string; rate: number; minRevenue?: number; label: string }[] = [
  { contains: 'Комплексная настройка', rate: 0.5, minRevenue: 5000, label: 'Комплексная настройка (АС) · 50%' },
  { contains: 'Настройка стандартная', rate: 0.3, label: 'Настройка стандартная · 30%' },
  { contains: 'настройка бонус',       rate: 0.3, label: 'Настройка бонус · 30%' },
]

function matchRule(name: string) {
  const low = name.toLowerCase()
  return RULES.find(r => low.includes(r.contains.toLowerCase())) ?? null
}

export async function calcNastroykaBonus(opts?: { fromDate?: Date; toDate?: Date }) {
  const { fromDate, toDate } = opts ?? {}

  const where: any = {
    order: { isVisible: true, isReturn: false, managerName: { not: null } },
    isWork: true,
  }
  if (fromDate || toDate) {
    where.order.dateClose = {}
    if (fromDate) where.order.dateClose.gte = fromDate
    if (toDate)   where.order.dateClose.lte = toDate
  }

  const positions = await prisma.orderPosition.findMany({
    where,
    select: {
      id: true, name: true, soldPrice: true, count: true,
      order: { select: { id: true, managerName: true, dateClose: true } },
    },
  })

  // Какие позиции должны иметь бонус: positionId → { orderId, amount, date, empName, label }
  type BonusSpec = { orderId: string; positionId: string; amount: number; date: Date; empName: string; label: string }
  const should = new Map<string, BonusSpec>()

  for (const pos of positions) {
    const rule = matchRule(pos.name)
    if (!rule) continue
    const revenue = pos.soldPrice * pos.count
    if (rule.minRevenue && revenue < rule.minRevenue) continue
    const amount = Math.round(revenue * rule.rate)
    if (amount <= 0) continue
    should.set(pos.id, {
      orderId:    pos.order.id,
      positionId: pos.id,
      amount,
      date:    pos.order.dateClose!,
      empName: pos.order.managerName!,
      label:   `${rule.label} · выручка ${Math.round(revenue).toLocaleString('ru-RU')} ₽`,
    })
  }

  // Существующие авто-бонусы за настройку
  const existingWhere: any = { actionType: 'Бонус', subType: 'За настройку', source: 'AUTO' }
  if (fromDate || toDate) {
    existingWhere.date = {}
    if (fromDate) existingWhere.date.gte = fromDate
    if (toDate)   existingWhere.date.lte = toDate
  }
  const existing = await prisma.targetAction.findMany({
    where: existingWhere,
    select: { id: true, comment: true },
  })

  // Извлекаем positionId из comment (храним в конце как «pos:XXXX»)
  const existingByPosId = new Map<string, number>()
  for (const e of existing) {
    const m = e.comment?.match(/pos:(\S+)$/)
    if (m) existingByPosId.set(m[1], e.id)
  }

  let created = 0
  let deleted = 0

  // Создаём отсутствующие
  for (const [posId, spec] of should.entries()) {
    if (existingByPosId.has(posId)) continue
    await prisma.targetAction.create({
      data: {
        date:         spec.date,
        actionType:   'Бонус',
        subType:      'За настройку',
        employeeName: spec.empName,
        amount:       spec.amount,
        source:       'AUTO',
        orderId:      spec.orderId,
        comment:      `${spec.label} pos:${posId}`,
      },
    })
    created++
  }

  // Удаляем устаревшие
  for (const [posId, taId] of existingByPosId.entries()) {
    if (!should.has(posId)) {
      await prisma.targetAction.delete({ where: { id: taId } })
      deleted++
    }
  }

  return { created, deleted }
}
