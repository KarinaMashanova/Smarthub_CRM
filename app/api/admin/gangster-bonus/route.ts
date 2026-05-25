import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const fromDate = body.from ? new Date(body.from) : undefined
  const toDate   = body.to   ? new Date(body.to + 'T23:59:59') : undefined

  // ── Справочник салонов с порогами ────────────────────────────────────────
  const shops = await prisma.shop.findMany({
    where: { isVisible: true, gangsterThreshold: { not: null } },
    select: { id: true, name: true, gangsterThreshold: true },
  })
  if (shops.length === 0) {
    return NextResponse.json({ error: 'Нет салонов с настроенным порогом' }, { status: 400 })
  }
  const shopByName = new Map(shops.map(s => [s.name, s]))
  const shopById   = new Map(shops.map(s => [s.id,   s]))

  // ── Расписание за период ──────────────────────────────────────────────────
  const slotWhere: any = { employeeName: { not: null } }
  if (fromDate || toDate) slotWhere.date = {}
  if (fromDate) slotWhere.date.gte = fromDate
  if (toDate)   slotWhere.date.lte = toDate

  const slots = await prisma.scheduleSlot.findMany({
    where: slotWhere,
    select: { date: true, employeeName: true, location: true },
  })

  // Строим: { 'YYYY-MM-DD_ИмяСотрудника' → shopName }
  // Один сотрудник может иметь несколько слотов в день — берём первый попавшийся салон
  const dayEmployeeShop = new Map<string, string>()
  for (const slot of slots) {
    const day = slot.date.toISOString().slice(0, 10)
    const key = `${day}__${slot.employeeName}`
    if (!dayEmployeeShop.has(key)) {
      dayEmployeeShop.set(key, slot.location)
    }
  }

  if (dayEmployeeShop.size === 0) {
    return NextResponse.json({ qualified: [], created: [], skipped: [] })
  }

  // ── Маржа из заказов по менеджеру за день ────────────────────────────────
  const orderDateFilter: any = {}
  if (fromDate) orderDateFilter.gte = fromDate
  if (toDate)   orderDateFilter.lte = toDate

  const orderPositions = await prisma.orderPosition.findMany({
    where: {
      order: {
        ...(Object.keys(orderDateFilter).length ? { dateClose: orderDateFilter } : {}),
        isVisible: true,
        isReturn:  false,
        managerName: { not: null },
      },
    },
    select: {
      soldPrice: true, count: true, purchasePriceSumm: true,
      order: { select: { managerName: true, dateClose: true, shopId: true } },
    },
  })

  // marginByDayEmployee: { 'YYYY-MM-DD__name' → margin }
  const marginByDayEmployee = new Map<string, number>()
  for (const pos of orderPositions) {
    const { managerName, dateClose, shopId } = pos.order
    if (!managerName || !dateClose) continue
    const day = dateClose.toISOString().slice(0, 10)
    const key = `${day}__${managerName}`
    const m   = pos.soldPrice * pos.count - pos.purchasePriceSumm
    marginByDayEmployee.set(key, (marginByDayEmployee.get(key) ?? 0) + m)
  }

  // ── Маржа из продаж по продавцу за день ──────────────────────────────────
  const saleDateFilter: any = {}
  if (fromDate) saleDateFilter.gte = fromDate
  if (toDate)   saleDateFilter.lte = toDate

  const salePositions = await prisma.salePosition.findMany({
    where: {
      isWork: false,
      sale: {
        ...(Object.keys(saleDateFilter).length ? { date: saleDateFilter } : {}),
        isReturn:   false,
        sellerName: { not: null },
      },
    },
    select: {
      soldPrice: true, count: true, purchasePriceSumm: true,
      sale: { select: { sellerName: true, date: true } },
    },
  })

  for (const pos of salePositions) {
    const { sellerName, date } = pos.sale
    if (!sellerName || !date) continue
    const day = date.toISOString().slice(0, 10)
    const key = `${day}__${sellerName}`
    const m   = pos.soldPrice * pos.count - pos.purchasePriceSumm
    marginByDayEmployee.set(key, (marginByDayEmployee.get(key) ?? 0) + m)
  }

  // ── Начисляем бонусы ──────────────────────────────────────────────────────
  type Result = { name: string; day: string; shopName: string; margin: number; status: 'created' | 'skipped' | 'no_margin' }
  const results: Result[] = []

  for (const [key, shopName] of dayEmployeeShop.entries()) {
    const [day, empName] = key.split('__')
    const shop = shopByName.get(shopName)
    if (!shop || shop.gangsterThreshold === null) continue

    const margin = marginByDayEmployee.get(key) ?? 0
    if (margin < shop.gangsterThreshold!) {
      continue // не дотянул — не включаем в результат
    }

    // Проверяем дубль
    const dayStart = new Date(day)
    const dayEnd   = new Date(day + 'T23:59:59')
    const existing = await prisma.targetAction.findFirst({
      where: {
        employeeName: empName,
        actionType:   'Бонус',
        subType:      'За Гангстера',
        date:         { gte: dayStart, lte: dayEnd },
      },
    })

    if (existing) {
      results.push({ name: empName, day, shopName, margin: Math.round(margin), status: 'skipped' })
      continue
    }

    await prisma.targetAction.create({
      data: {
        date:         dayStart,
        actionType:   'Бонус',
        subType:      'За Гангстера',
        employeeName: empName,
        amount:       1000,
        source:       'AUTO',
        comment:      `${shopName} · маржа за день: ${Math.round(margin).toLocaleString('ru-RU')} ₽`,
      },
    })
    results.push({ name: empName, day, shopName, margin: Math.round(margin), status: 'created' })
  }

  results.sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name, 'ru'))

  return NextResponse.json({
    results,
    created: results.filter(r => r.status === 'created').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  })
}
