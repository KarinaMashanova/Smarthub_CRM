import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const now = new Date()
  let from: Date, to: Date
  const fromParam = searchParams.get('from')
  const toParam   = searchParams.get('to')
  if (fromParam && toParam) {
    from = new Date(fromParam + 'T00:00:00')
    to   = new Date(toParam   + 'T23:59:59')
  } else {
    const year  = parseInt(searchParams.get('year')  ?? String(now.getFullYear()))
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth()))
    from = new Date(year, month, 1)
    to   = new Date(year, month + 1, 0, 23, 59, 59)
  }

  const [orders, sales] = await Promise.all([
    prisma.order.findMany({
      where: { dateClose: { gte: from, lte: to }, isVisible: true, isReturn: false },
      select: {
        id: true, revenue: true, dateClose: true,
        managerName: true, shopId: true, shop: { select: { name: true } },
        orderTypeName: true, paymentType: true,
        positions: { select: { purchasePriceSumm: true } },
      },
    }),
    prisma.sale.findMany({
      where: { date: { gte: from, lte: to }, isReturn: false },
      select: {
        shopId: true,
        shop: { select: { name: true } },
        revenue: true,
        date: true,
        positions: {
          select: {
            name: true,
            isWork: true,
            soldPrice: true,
            count: true,
            purchasePriceSumm: true,
          },
        },
      },
    }),
  ])

  const catalog = await prisma.productCatalog.findMany({
    select: { name: true, group: true },
  })
  const catalogGroupByName = new Map(catalog.map(item => [item.name.toLowerCase(), item.group]))

  // Маржа / ЗП на каждый заказ
  const enriched = orders.map(o => {
    const costTotal    = o.positions.reduce((s, p) => s + p.purchasePriceSumm, 0)
    const hasPos       = o.positions.length > 0
    const margin       = hasPos ? o.revenue - costTotal : null
    const isHighMargin = margin !== null && margin >= 4000
    const salary       = margin === null ? null
      : isHighMargin ? margin * 0.20 : 0
    return { ...o, margin, isHighMargin, salary }
  })

  const withMargin  = enriched.filter(o => o.margin !== null)
  const totalCount  = enriched.length
  const totalRev    = enriched.reduce((s, o) => s + o.revenue, 0)
  const totalMargin = withMargin.reduce((s, o) => s + (o.margin ?? 0), 0)
  const totalSalary = enriched.reduce((s, o) => s + (o.salary ?? 0), 0)
  const vimrCount   = enriched.filter(o => o.isHighMargin).length
  const avgCheck    = totalCount > 0 ? totalRev / totalCount : 0

  // По дням (для графика)
  const daysInMonth = to.getDate()
  const byDay = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1, revenue: 0, margin: 0, count: 0, salesRevenue: 0,
  }))
  for (const o of enriched) {
    if (!o.dateClose) continue
    const d = new Date(o.dateClose).getDate() - 1
    if (d >= 0 && d < daysInMonth) {
      byDay[d].revenue += o.revenue
      byDay[d].margin  += o.margin ?? 0
      byDay[d].count   += 1
    }
  }
  for (const s of sales) {
    if (!s.date) continue
    const d = new Date(s.date).getDate() - 1
    if (d >= 0 && d < daysInMonth) {
      byDay[d].salesRevenue += s.revenue
    }
  }

  // По менеджерам
  const managerMap: Record<string, { name: string; count: number; revenue: number; margin: number; salary: number; vmr: number }> = {}
  for (const o of enriched) {
    const n = o.managerName ?? '—'
    if (!managerMap[n]) managerMap[n] = { name: n, count: 0, revenue: 0, margin: 0, salary: 0, vmr: 0 }
    managerMap[n].count   += 1
    managerMap[n].revenue += o.revenue
    managerMap[n].margin  += o.margin ?? 0
    managerMap[n].salary  += o.salary ?? 0
    if (o.isHighMargin) managerMap[n].vmr += 1
  }
  const byManager = Object.values(managerMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15)

  // По магазинам (заказы)
  const shopMap: Record<string, { name: string; count: number; revenue: number; margin: number }> = {}
  for (const o of enriched) {
    const n = o.shop.name
    if (!shopMap[n]) shopMap[n] = { name: n, count: 0, revenue: 0, margin: 0 }
    shopMap[n].count   += 1
    shopMap[n].revenue += o.revenue
    shopMap[n].margin  += o.margin ?? 0
  }
  const byShop = Object.values(shopMap).sort((a, b) => b.revenue - a.revenue)

  // По магазинам (продажи)
  const salesMap: Record<string, { count: number; revenue: number; margin: number }> = {}
  const productGroupMap: Record<string, { name: string; count: number; revenue: number; margin: number }> = {}
  for (const s of sales) {
    const n = s.shop.name
    if (!salesMap[n]) salesMap[n] = { count: 0, revenue: 0, margin: 0 }
    salesMap[n].count   += 1
    salesMap[n].revenue += s.revenue
    const saleMargin = s.positions.reduce((acc, p) => acc + (p.soldPrice * p.count - p.purchasePriceSumm), 0)
    salesMap[n].margin  += saleMargin

    for (const p of s.positions) {
      if (p.isWork) continue
      const group = catalogGroupByName.get(p.name.toLowerCase()) ?? 'Без группы'
      if (!productGroupMap[group]) productGroupMap[group] = { name: group, count: 0, revenue: 0, margin: 0 }
      const revenue = p.soldPrice * p.count
      productGroupMap[group].count += p.count
      productGroupMap[group].revenue += revenue
      productGroupMap[group].margin += revenue - p.purchasePriceSumm
    }
  }

  // Сводная таблица заказы + продажи по магазинам
  const allShopNames = new Set([...byShop.map(s => s.name), ...Object.keys(salesMap)])
  const byShopSummary = Array.from(allShopNames).map(name => {
    const ord = shopMap[name]  ?? { count: 0, revenue: 0, margin: 0 }
    const sal = salesMap[name] ?? { count: 0, revenue: 0, margin: 0 }
    return {
      name,
      orders:     { count: ord.count, revenue: ord.revenue, margin: ord.margin },
      sales:      { count: sal.count, revenue: sal.revenue, margin: sal.margin },
      totalRev:   ord.revenue + sal.revenue,
    }
  }).sort((a, b) => b.totalRev - a.totalRev)

  // Пивот: магазины × дни
  const pivotMap: Record<string, Record<number, { revenue: number; margin: number }>> = {}
  for (const o of enriched) {
    if (!o.dateClose) continue
    const n   = o.shop.name
    const day = new Date(o.dateClose).getDate()
    if (!pivotMap[n]) pivotMap[n] = {}
    if (!pivotMap[n][day]) pivotMap[n][day] = { revenue: 0, margin: 0 }
    pivotMap[n][day].revenue += o.revenue
    pivotMap[n][day].margin  += o.margin ?? 0
  }
  const byShopByDay = byShop.map(shop => ({
    name: shop.name,
    total: { revenue: shop.revenue, margin: shop.margin },
    days: Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      ...(pivotMap[shop.name]?.[i + 1] ?? { revenue: 0, margin: 0 }),
    })),
  }))

  // Тип заказа
  const typeMap: Record<string, number> = {}
  for (const o of enriched) {
    const t = o.orderTypeName ?? 'Другой'
    typeMap[t] = (typeMap[t] ?? 0) + o.revenue
  }

  // Оплата
  const payMap: Record<string, number> = {}
  for (const o of enriched) {
    const p = o.paymentType ?? 'Не указан'
    payMap[p] = (payMap[p] ?? 0) + 1
  }

  return NextResponse.json({
    kpi: { totalCount, totalRev, totalMargin, totalSalary, vimrCount, avgCheck, withMarginCount: withMargin.length },
    byDay,
    byManager,
    byShop,
    byShopSummary,
    byShopByDay,
    byProductGroup: Object.values(productGroupMap).sort((a, b) => b.revenue - a.revenue),
    byType:    Object.entries(typeMap).map(([name, revenue]) => ({ name, revenue })).sort((a,b) => b.revenue - a.revenue),
    byPayment: Object.entries(payMap).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count),
  })
}
