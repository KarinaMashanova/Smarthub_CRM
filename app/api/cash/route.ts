import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

type ShopFilter = { shopId?: string | { in: string[] } }

async function getManagerScheduleShopIds(employeeName: string, from: Date, to: Date) {
  const [shops, slots] = await Promise.all([
    prisma.shop.findMany({ where: { isVisible: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.scheduleSlot.findMany({
      where: {
        employeeName,
        date: { gte: from, lte: to },
        NOT: { location: { contains: '(2)' } },
      },
      select: { location: true },
      distinct: ['location'],
      orderBy: { location: 'asc' },
    }),
  ])

  const shopByName = new Map(shops.map(shop => [shop.name, shop]))
  const scheduledShops = slots
    .map(slot => shopByName.get(slot.location))
    .filter((shop): shop is { id: string; name: string } => Boolean(shop))

  return { shops, scheduledShops }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
    ? new Date(searchParams.get('from')!)
    : new Date(new Date().setHours(0, 0, 0, 0))
  const to = searchParams.get('to')
    ? new Date(searchParams.get('to')!)
    : new Date(new Date().setHours(23, 59, 59, 999))
  to.setHours(23, 59, 59, 999)

  const isManager = session.role === 'MANAGER'
  const { shops: allShops, scheduledShops } = isManager
    ? await getManagerScheduleShopIds(session.name, from, to)
    : { shops: await prisma.shop.findMany({ where: { isVisible: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }), scheduledShops: [] }
  const managerShopIds = scheduledShops.map(shop => shop.id)
  const shopFilter: ShopFilter = isManager ? { shopId: { in: managerShopIds } } : {}

  const [entries, orderRev, saleRev, employees, salaryActions] = await Promise.all([
    prisma.cashEntry.findMany({
      where: { ...shopFilter, date: { gte: from, lte: to } },
      include: { shop: { select: { name: true } } },
      orderBy: { date: 'desc' },
    }),
    // Выручка из заказов (по dateClose)
    prisma.order.groupBy({
      by: ['shopId'],
      where: { ...shopFilter, dateClose: { gte: from, lte: to }, isReturn: false },
      _sum: { revenue: true },
    }),
    // Выручка из продаж (по date) — нал и безнал отдельно
    prisma.sale.groupBy({
      by: ['shopId'],
      where: { ...shopFilter, date: { gte: from, lte: to }, isReturn: false },
      _sum: { cashMoney: true, cashBank: true, cashInvoice: true, revenue: true },
    }),
    prisma.employee.findMany({ select: { name: true, appRole: true, shopId: true } }),
    // Штрафы и выплаты зарплаты из ЗП-раздела
    prisma.targetAction.findMany({
      where: {
        date: { gte: from, lte: to },
        actionType: { in: ['Штраф', 'Выплата Зарплаты'] },
      },
      select: {
        id: true, date: true, actionType: true,
        employeeName: true, amount: true, comment: true,
        shopId: true, responsibleName: true,
      },
      orderBy: { date: 'desc' },
    }),
  ])

  // revenue map: { [shopId]: { orders, salesCash, salesBank, salesInvoice, salesTotal } }
  const revenue: Record<string, {
    orders: number
    salesCash: number
    salesBank: number
    salesInvoice: number
    salesTotal: number
  }> = {}
  const ensureRevenue = (shopId: string) => {
    if (!revenue[shopId]) {
      revenue[shopId] = { orders: 0, salesCash: 0, salesBank: 0, salesInvoice: 0, salesTotal: 0 }
    }
    return revenue[shopId]
  }
  for (const r of orderRev) {
    if (!r.shopId) continue
    ensureRevenue(r.shopId).orders += r._sum.revenue ?? 0
  }
  for (const r of saleRev) {
    if (!r.shopId) continue
    const row = ensureRevenue(r.shopId)
    row.salesCash += r._sum.cashMoney ?? 0
    row.salesBank += r._sum.cashBank ?? 0
    row.salesInvoice += r._sum.cashInvoice ?? 0
    row.salesTotal += r._sum.revenue ?? (r._sum.cashMoney ?? 0) + (r._sum.cashBank ?? 0) + (r._sum.cashInvoice ?? 0)
  }

  const shopNameMap = new Map(allShops.map(s => [s.id, s.name]))
  const shops = session.role === 'ADMIN' ? allShops : scheduledShops

  const roleMap   = new Map(employees.map(e => [e.name, e.appRole]))
  const empShopMap = new Map(employees.map(e => [e.name, e.shopId]))

  const cashEntries = entries.map(e => ({
    ...e,
    authorRole: roleMap.get(e.authorName) ?? null,
    source: 'MANUAL' as const,
  }))

  // Подмешиваем ЗП-записи как виртуальные кассовые операции
  // shopId берём из TargetAction (если заполнен) или из справочника сотрудников
  const salaryEntries = salaryActions.flatMap(ta => {
    const shopId = ta.shopId ?? empShopMap.get(ta.employeeName) ?? null
    if (!shopId) return []
    if (isManager && !managerShopIds.includes(shopId)) return []
    return [{
      id: -(ta.id),
      date: ta.date.toISOString(),
      shopId,
      shop: { name: shopNameMap.get(shopId) ?? shopId },
      type: ta.actionType,
      payMethod: 'CASH',
      isIncome: ta.actionType === 'Штраф',
      amount: ta.amount,
      comment: ta.comment,
      authorName: ta.responsibleName ?? '',
      authorRole: null as null,
      linkedName: ta.employeeName,
      source: 'SALARY' as const,
    }]
  })

  const allEntries = [...cashEntries, ...salaryEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  return NextResponse.json({ entries: allEntries, shops, revenue })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const amount = Number(body.amount)
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  if (!body.type)      return NextResponse.json({ error: 'Missing type' }, { status: 400 })
  if (!body.payMethod) return NextResponse.json({ error: 'Missing payMethod' }, { status: 400 })

  if (!body.type.trim()) {
    return NextResponse.json({ error: 'Empty type' }, { status: 400 })
  }

  let shopId = body.shopId ?? ''
  if (session.role === 'MANAGER') {
    const entryDate = body.date ? new Date(body.date) : new Date()
    const dayStart = new Date(entryDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(entryDate)
    dayEnd.setHours(23, 59, 59, 999)
    const { scheduledShops } = await getManagerScheduleShopIds(session.name, dayStart, dayEnd)
    shopId = scheduledShops[0]?.id ?? ''
    if (!shopId) {
      return NextResponse.json({ error: 'На эту дату нет смены в графике' }, { status: 400 })
    }
  }
  if (!shopId) return NextResponse.json({ error: 'Missing shopId' }, { status: 400 })

  let entry
  try {
    entry = await prisma.cashEntry.create({
      data: {
        date:       body.date ? new Date(body.date) : new Date(),
        shopId,
        type:       body.type,
        payMethod:  body.payMethod,
        isIncome:   Boolean(body.isIncome),
        amount,
        comment:    body.comment || null,
        authorName: session.name,
      },
      include: { shop: { select: { name: true } } },
    })
  } catch (e: unknown) {
    console.error('[cash POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'DB error' }, { status: 500 })
  }

  return NextResponse.json(entry, { status: 201 })
}
