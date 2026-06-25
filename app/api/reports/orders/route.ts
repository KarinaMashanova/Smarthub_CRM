import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

const PAYMENT_ORDER = ['Наличные', 'Безнал', 'Счёт']

function normalizePaymentType(value: string | null) {
  if (!value) return 'Не указан'
  const parts = Array.from(new Set(
    value.split(',')
      .map(p => p.trim())
      .filter(Boolean)
  ))
  parts.sort((a, b) => {
    const ai = PAYMENT_ORDER.indexOf(a)
    const bi = PAYMENT_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b, 'ru')
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
  return parts.join(', ') || 'Не указан'
}

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
      where: { dateClose: { gte: from, lte: to }, isVisible: true, isReturn: false, managerName: { not: null } },
      select: {
        id: true, revenue: true, dateClose: true,
        managerName: true, shopId: true, shop: { select: { name: true } },
        orderTypeName: true, paymentType: true,
        positions: { select: { purchasePriceSumm: true } },
      },
    }),
    prisma.sale.findMany({
      where: { date: { gte: from, lte: to }, isReturn: false, sellerName: { not: null } },
      select: {
        shopId: true,
        shop: { select: { name: true } },
        revenue: true,
        date: true,
        sellerName: true,
        paymentType: true,
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

  function classifyPositionGroup(name: string) {
    const lower = name.toLowerCase()
    const catalogGroup = catalogGroupByName.get(lower)

    if (lower.includes('настрой')) return 'Настройки'
    if (lower.includes('комплексная настройка')) return 'Настройки'

    if (lower.includes('дополнительная гарантия')) return 'Гарантии'
    if (lower.includes('гаранти') && !lower.includes('без гарантии')) return 'Гарантии'

    if (
      catalogGroup?.toLowerCase().includes('страх') ||
      lower.includes('страх') ||
      lower.includes('защита экрана') ||
      lower.includes('техника в безопасности') ||
      lower.includes('сверх возможности')
    ) return 'Страховки'

    return catalogGroup ?? 'Без группы'
  }

  // Маржа / ЗП на каждый заказ
  const enriched = orders.map(o => {
    const costTotal    = o.positions.reduce((s, p) => s + p.purchasePriceSumm, 0)
    const hasPos       = o.positions.length > 0
    const margin       = hasPos ? o.revenue - costTotal : null
    const isHighMargin = margin !== null && margin >= 5000
    const salary       = margin === null ? null
      : isHighMargin ? margin * 0.25 : 0
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
    day: i + 1, revenue: 0, margin: 0, count: 0, salesRevenue: 0, salesMargin: 0,
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
      byDay[d].salesMargin  += s.positions.reduce((acc, p) => acc + (p.soldPrice * p.count - p.purchasePriceSumm), 0)
    }
  }

  // По менеджерам: заказы + продажи в одной структуре
  const managerMap: Record<string, {
    name: string
    orders: { count: number; revenue: number; margin: number; salary: number; vmr: number }
    sales: { count: number; revenue: number; margin: number }
    totalRevenue: number
    totalMargin: number
  }> = {}
  const getManagerRow = (name: string) => {
    if (!managerMap[name]) {
      managerMap[name] = {
        name,
        orders: { count: 0, revenue: 0, margin: 0, salary: 0, vmr: 0 },
        sales: { count: 0, revenue: 0, margin: 0 },
        totalRevenue: 0,
        totalMargin: 0,
      }
    }
    return managerMap[name]
  }
  for (const o of enriched) {
    const row = getManagerRow(o.managerName ?? '—')
    row.orders.count   += 1
    row.orders.revenue += o.revenue
    row.orders.margin  += o.margin ?? 0
    row.orders.salary  += o.salary ?? 0
    row.totalRevenue   += o.revenue
    row.totalMargin    += o.margin ?? 0
    if (o.isHighMargin) row.orders.vmr += 1
  }
  for (const s of sales) {
    const row = getManagerRow(s.sellerName ?? '—')
    const saleMargin = s.positions.reduce((acc, p) => acc + (p.soldPrice * p.count - p.purchasePriceSumm), 0)
    row.sales.count   += 1
    row.sales.revenue += s.revenue
    row.sales.margin  += saleMargin
    row.totalRevenue  += s.revenue
    row.totalMargin   += saleMargin
  }
  const byManager = Object.values(managerMap)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)

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
      const group = classifyPositionGroup(p.name)
      if (p.isWork && group !== 'Настройки') continue
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
  for (const s of sales) {
    if (!s.date) continue
    const n   = s.shop.name
    const day = new Date(s.date).getDate()
    if (!pivotMap[n]) pivotMap[n] = {}
    if (!pivotMap[n][day]) pivotMap[n][day] = { revenue: 0, margin: 0 }
    const saleMargin = s.positions.reduce((acc, p) => acc + (p.soldPrice * p.count - p.purchasePriceSumm), 0)
    pivotMap[n][day].revenue += s.revenue
    pivotMap[n][day].margin  += saleMargin
  }
  const byShopByDay = byShopSummary.map(shop => ({
    name: shop.name,
    total: {
      revenue: shop.orders.revenue + shop.sales.revenue,
      margin: shop.orders.margin + shop.sales.margin,
    },
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

  // Оплата: заказы + продажи в одной структуре
  const payMap: Record<string, {
    name: string
    orders: { count: number; revenue: number }
    sales: { count: number; revenue: number }
    totalCount: number
    totalRevenue: number
  }> = {}
  const getPayRow = (name: string) => {
    if (!payMap[name]) {
      payMap[name] = {
        name,
        orders: { count: 0, revenue: 0 },
        sales: { count: 0, revenue: 0 },
        totalCount: 0,
        totalRevenue: 0,
      }
    }
    return payMap[name]
  }
  for (const o of enriched) {
    const row = getPayRow(normalizePaymentType(o.paymentType))
    row.orders.count += 1
    row.orders.revenue += o.revenue
    row.totalCount += 1
    row.totalRevenue += o.revenue
  }
  for (const s of sales) {
    const row = getPayRow(normalizePaymentType(s.paymentType))
    row.sales.count += 1
    row.sales.revenue += s.revenue
    row.totalCount += 1
    row.totalRevenue += s.revenue
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
    byPayment: Object.values(payMap).sort((a,b) => b.totalRevenue - a.totalRevenue),
  })
}
