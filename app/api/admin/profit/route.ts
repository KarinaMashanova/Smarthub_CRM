import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const fromStr = searchParams.get('from')
  const toStr   = searchParams.get('to')
  if (!fromStr || !toStr) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

  const from = new Date(fromStr)
  const to   = new Date(toStr + 'T23:59:59.999Z')
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
  }

  // Загружаем всё одним batch
  const [shops, realCostItems, orderPositions, salePositions] = await Promise.all([
    prisma.shop.findMany({
      where: { isVisible: true },
      select: { id: true, name: true, taxSystem: true, taxRate: true },
    }),
    prisma.realCostItem.findMany({ select: { name: true, realCost: true } }),
    prisma.orderPosition.findMany({
      where: {
        order: {
          isReturn: false,
          isVisible: true,
          dateClose: { gte: from, lte: to },
        },
      },
      select: {
        name: true, soldPrice: true, count: true, purchasePriceSumm: true,
        order: { select: { id: true, shopId: true, revenue: true, paymentType: true } },
      },
    }),
    prisma.salePosition.findMany({
      where: {
        sale: {
          isReturn: false,
          date: { gte: from, lte: to },
        },
      },
      select: {
        name: true, soldPrice: true, count: true, purchasePriceSumm: true, isWork: true,
        sale: { select: { id: true, shopId: true, cashMoney: true, cashBank: true, cashInvoice: true } },
      },
    }),
  ])

  // Справочник реальных цен: name → realCost
  const realCostMap = new Map<string, number>(realCostItems.map(i => [i.name, i.realCost]))

  // Инициализация данных по магазинам
  const shopMap = new Map(shops.map(s => [s.id, {
    shopId:          s.id,
    shopName:        s.name,
    taxSystem:       s.taxSystem,
    taxRate:         s.taxRate ?? 0,
    revenue:         0,   // вся выручка
    taxableRevenue:  0,   // безнал+карта (подлежит налогу)
    realMargin:      0,   // маржа по реальным ценам
    liveSkladMargin: 0,   // маржа по ценам из LiveSklad
    positionsTotal:      0,
    positionsWithCost:   0,
    missingNames:    new Set<string>(),
  }]))

  function isCashOnly(paymentType: string | null): boolean {
    if (!paymentType) return false
    // Наличные и Кредит не облагаются налогом; Безнал/Счёт/ККМ — облагаются
    return paymentType === 'Наличные' || paymentType === 'Кредит'
  }

  // Обрабатываем позиции заказов
  for (const pos of orderPositions) {
    const shop = shopMap.get(pos.order.shopId)
    if (!shop) continue

    const posRevenue = pos.soldPrice * pos.count
    const lsCost     = pos.purchasePriceSumm                      // себест. из LiveSklad
    const lsMargin   = posRevenue - lsCost

    const realCost   = realCostMap.has(pos.name)
      ? realCostMap.get(pos.name)! * pos.count
      : lsCost                                                      // fallback → LiveSklad

    const realMargin = posRevenue - realCost

    shop.liveSkladMargin += lsMargin
    shop.realMargin      += realMargin
    shop.positionsTotal  += 1

    if (realCostMap.has(pos.name)) {
      shop.positionsWithCost += 1
    } else {
      shop.missingNames.add(pos.name)
    }
  }

  // Обрабатываем позиции продаж
  for (const pos of salePositions) {
    const shop = shopMap.get(pos.sale.shopId)
    if (!shop) continue

    const posRevenue = pos.soldPrice * pos.count
    const lsCost     = pos.purchasePriceSumm
    const lsMargin   = posRevenue - lsCost

    // Для работ (isWork=true) реальной закупочной цены нет — считаем как в LS
    if (pos.isWork) {
      shop.liveSkladMargin += lsMargin
      shop.realMargin      += lsMargin
      continue
    }

    const realCost   = realCostMap.has(pos.name)
      ? realCostMap.get(pos.name)! * pos.count
      : lsCost

    const realMargin = posRevenue - realCost

    shop.liveSkladMargin += lsMargin
    shop.realMargin      += realMargin
    shop.positionsTotal  += 1

    if (realCostMap.has(pos.name)) {
      shop.positionsWithCost += 1
    } else {
      shop.missingNames.add(pos.name)
    }
  }

  // Выручка из заказов (по уникальным заказам)
  const seenOrders = new Set<string>()
  for (const pos of orderPositions) {
    if (seenOrders.has(pos.order.id)) continue
    seenOrders.add(pos.order.id)
    const shop = shopMap.get(pos.order.shopId)
    if (!shop) continue
    shop.revenue += pos.order.revenue
    if (!isCashOnly(pos.order.paymentType)) {
      shop.taxableRevenue += pos.order.revenue
    }
  }

  // Выручка из продаж
  const seenSales = new Set<string>()
  for (const pos of salePositions) {
    if (seenSales.has(pos.sale.id)) continue
    seenSales.add(pos.sale.id)
    const shop = shopMap.get(pos.sale.shopId)
    if (!shop) continue
    const total = pos.sale.cashMoney + pos.sale.cashBank + pos.sale.cashInvoice
    shop.revenue        += total
    shop.taxableRevenue += pos.sale.cashBank + pos.sale.cashInvoice  // наличные не облагаются
  }

  // Финализируем результаты
  const result = Array.from(shopMap.values())
    .filter(s => s.positionsTotal > 0 || s.revenue > 0)
    .map(s => {
      const tax       = s.taxableRevenue * s.taxRate
      const extraProfit = s.realMargin - s.liveSkladMargin  // доп. прибыль от реальных цен
      return {
        shopId:            s.shopId,
        shopName:          s.shopName,
        taxSystem:         s.taxSystem,
        taxRate:           s.taxRate,
        revenue:           Math.round(s.revenue),
        taxableRevenue:    Math.round(s.taxableRevenue),
        liveSkladMargin:   Math.round(s.liveSkladMargin),
        realMargin:        Math.round(s.realMargin),
        extraProfit:       Math.round(extraProfit),
        tax:               Math.round(tax),
        netProfit:         Math.round(s.realMargin - tax),
        positionsTotal:    s.positionsTotal,
        positionsWithCost: s.positionsWithCost,
        missingNames:      Array.from(s.missingNames).sort(),
      }
    })
    .sort((a, b) => b.realMargin - a.realMargin)

  const allMissing = Array.from(new Set(result.flatMap(s => s.missingNames))).sort()

  const totals = result.reduce((acc, s) => ({
    revenue:           acc.revenue           + s.revenue,
    taxableRevenue:    acc.taxableRevenue    + s.taxableRevenue,
    liveSkladMargin:   acc.liveSkladMargin   + s.liveSkladMargin,
    realMargin:        acc.realMargin        + s.realMargin,
    extraProfit:       acc.extraProfit       + s.extraProfit,
    tax:               acc.tax               + s.tax,
    netProfit:         acc.netProfit         + s.netProfit,
    positionsTotal:    acc.positionsTotal    + s.positionsTotal,
    positionsWithCost: acc.positionsWithCost + s.positionsWithCost,
  }), { revenue: 0, taxableRevenue: 0, liveSkladMargin: 0, realMargin: 0, extraProfit: 0, tax: 0, netProfit: 0, positionsTotal: 0, positionsWithCost: 0 })

  return NextResponse.json({ shops: result, totals, allMissing, catalogSize: realCostItems.length })
}
