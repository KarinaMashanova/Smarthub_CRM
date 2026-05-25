import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

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

const isManager = session.role === 'MANAGER' && !!session.shopId
  const shopFilter: any = isManager ? { shopId: session.shopId } : {}

  const [entries, allShops, orderRev, saleRev, employees, salaryActions] = await Promise.all([
    prisma.cashEntry.findMany({
      where: { ...shopFilter, date: { gte: from, lte: to } },
      include: { shop: { select: { name: true } } },
      orderBy: { date: 'desc' },
    }),
    prisma.shop.findMany({ where: { isVisible: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
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
      _sum: { cashMoney: true, cashBank: true, revenue: true },
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

  // revenue map: { [shopId]: { orders, sales } }
  const revenue: Record<string, { orders: number; sales: number }> = {}
  for (const r of orderRev) {
    if (!r.shopId) continue
    if (!revenue[r.shopId]) revenue[r.shopId] = { orders: 0, sales: 0 }
    revenue[r.shopId].orders += r._sum.revenue ?? 0
  }
  for (const r of saleRev) {
    if (!r.shopId) continue
    if (!revenue[r.shopId]) revenue[r.shopId] = { orders: 0, sales: 0 }
    revenue[r.shopId].sales += (r._sum.cashMoney ?? 0) + (r._sum.cashBank ?? 0)
  }

  const shopNameMap = new Map(allShops.map(s => [s.id, s.name]))
  const shops = session.role === 'ADMIN' ? allShops : []

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
    if (isManager && shopId !== session.shopId) return []
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

  const shopId = session.role === 'MANAGER' ? (session.shopId ?? '') : (body.shopId ?? '')
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
  } catch (e: any) {
    console.error('[cash POST]', e)
    return NextResponse.json({ error: e?.message ?? 'DB error' }, { status: 500 })
  }

  return NextResponse.json(entry, { status: 201 })
}
