import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

const PAGE_SIZE = 50
const PAYMENT_ORDER = ['Наличные', 'Безнал', 'Счёт']
const RC_ELIGIBLE_GROUPS    = ['Аксы', 'Защитное стекло', 'Игрушки', 'Чехлы']
const CREDIT_ELIGIBLE_GROUPS = ['Android', 'iPhone', 'iPhone б/у', 'Смартфоны']
const RC_THRESHOLD = 1000

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

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const search = searchParams.get('search')?.trim() ?? ''
  const seller = searchParams.get('seller') ?? ''
  const shop   = searchParams.get('shop')   ?? ''
  const paymentType = searchParams.get('paymentType') ?? ''
  const positionMode = searchParams.get('positionMode') ?? 'all'
  const rcBonusMode  = searchParams.get('rcBonusMode')  ?? 'all'
  const creditMode   = searchParams.get('creditMode')   ?? 'all'

  const now = new Date()
  const from = searchParams.get('from')
    ? new Date(searchParams.get('from')!)
    : new Date(now.getFullYear(), now.getMonth(), 1)
  const to = searchParams.get('to')
    ? new Date(searchParams.get('to')!)
    : new Date(now.setHours(23, 59, 59, 999))

  const where: any = { date: { gte: from, lte: to }, isReturn: false }

  if (session.role === 'MANAGER') {
    where.sellerName = session.name
  } else if (shop) {
    where.shopId = shop
  }

  if (seller) { delete where.OR; where.sellerName = seller }
  if (search) {
    where.OR = [
      { number:     { contains: search, mode: 'insensitive' } },
      { sellerName: { contains: search, mode: 'insensitive' } },
    ]
  }

  const baseWhere: any = session.role === 'MANAGER'
    ? { sellerName: session.name }
    : {}

  // Загружаем каталог: RC-бонус (аксессуары) + кредитные группы (смартфоны)
  const allCatalogEntries = await prisma.productCatalog.findMany({
    where: { group: { in: [...RC_ELIGIBLE_GROUPS, ...CREDIT_ELIGIBLE_GROUPS] } },
    select: { name: true, group: true, retailPrice: true },
  })
  // catalogMap: только RC-группы — для расчёта бонуса РЦ
  const catalogMap = new Map(
    allCatalogEntries.filter(e => RC_ELIGIBLE_GROUPS.includes(e.group)).map(e => [e.name.toLowerCase(), e.retailPrice])
  )
  // creditCatalogMap: смартфонные группы — { group, retailPrice } для маржи по кредиту
  const creditCatalogMap = new Map(
    allCatalogEntries.filter(e => CREDIT_ELIGIBLE_GROUPS.includes(e.group)).map(e => [e.name.toLowerCase(), { group: e.group, retailPrice: e.retailPrice }])
  )

  const [sales, sellers, shops] = await Promise.all([
    prisma.sale.findMany({
      where,
      select: {
        id: true, number: true,
        shopId: true, shop: { select: { name: true } },
        date: true,
        sellerName: true,
        cashMoney: true, cashBank: true,
        revenue: true, refund: true, paymentType: true,
        isReturn: true,
        positions: {
          select: {
            id: true, name: true, isWork: true,
            price: true, soldPrice: true, count: true, purchasePriceSumm: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    }),
    prisma.sale.findMany({
      where: { ...baseWhere, sellerName: { not: null } },
      select: { sellerName: true },
      distinct: ['sellerName'],
      orderBy: { sellerName: 'asc' },
    }),
    session.role === 'ADMIN'
      ? prisma.shop.findMany({ where: { isVisible: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
  ])
  const salesWithFinance = sales.map(s => {
    // Проход 1: базовые флаги
    const PHONE_BRANDS = ['iphone', 'apple', 'samsung', 'huawei', 'xiaomi', 'pixel', 'realme',
      'oppo', 'vivo', 'honor', 'galaxy', 'redmi', 'poco', 'oneplus',
      'meizu', 'tecno', 'itel', 'infinix', 'смартфон', 'телефон']
    const pass1 = s.positions.map(p => {
      const posRevenue  = p.soldPrice * p.count
      const creditEntry = creditCatalogMap.get(p.name.toLowerCase()) ?? null
      const posGroup    = creditEntry?.group ?? null
      const nameLow     = p.name.toLowerCase()
      const isLikelyPhone   = posGroup !== null || PHONE_BRANDS.some(b => nameLow.startsWith(b))
      // Бесплатная/отрицательная позиция (0 выручки + себест. или выручка < 0)
      const isMarginExcluded = posRevenue < 0 || (posRevenue === 0 && p.purchasePriceSumm > 0)
      return { p, posRevenue, posGroup, creditEntry, isLikelyPhone, isMarginExcluded }
    })

    // Кредит = в чеке есть смартфон (с ценой или без)
    const saleHasCredit = pass1.some(x => !x.p.isWork && x.isLikelyPhone)

    // Проход 2: финальное обогащение с учётом контекста продажи
    const enrichedPositions = pass1.map(({ p, posRevenue, posGroup, creditEntry, isLikelyPhone, isMarginExcluded }) => {
      // Плашку получают: смартфонные позиции + бесплатные позиции в кредитном чеке
      const isCredit = saleHasCredit && !p.isWork && (isLikelyPhone || isMarginExcluded)

      const rc = catalogMap.get(p.name.toLowerCase())
      const posDelta = !isCredit && !isMarginExcluded && rc !== undefined
        ? (p.soldPrice - rc) * p.count : null
      const posRcBonus = !s.isReturn && !isCredit && !isMarginExcluded
        && posDelta !== null && posDelta >= RC_THRESHOLD
        ? Math.round(posDelta * 0.5) : 0

      let posMargin: number | null = null
      if (isCredit) {
        if (isLikelyPhone && posRevenue > 0) {
          // Смартфон в кредитном чеке: маржа = soldPrice − каталог РЦ (или − себест. если не в каталоге)
          posMargin = creditEntry !== null
            ? Math.abs(Math.round((p.soldPrice - creditEntry.retailPrice) * p.count))
            : Math.round(p.soldPrice * p.count - p.purchasePriceSumm)
        } else if (isMarginExcluded) {
          // Бесплатный подарочный товар: маржа = |себест.| (берём по модулю)
          posMargin = Math.abs(Math.round(p.soldPrice * p.count - p.purchasePriceSumm))
        }
      } else if (!isMarginExcluded && p.purchasePriceSumm > 0) {
        posMargin = Math.round(p.soldPrice * p.count - p.purchasePriceSumm)
      }

      const catalogRcForDisplay = creditEntry?.retailPrice ?? rc ?? null
      return {
        ...p,
        isCredit,
        group: posGroup,
        catalogRc: catalogRcForDisplay,
        rcDelta: posDelta !== null ? Math.round(posDelta) : null,
        rcBonus: posRcBonus,
        margin: posMargin,
      }
    })

    const hasPositions = enrichedPositions.length > 0
    const hasCredit    = saleHasCredit
    const costTotal    = enrichedPositions.reduce((sum, p) => sum + p.purchasePriceSumm, 0)
    const retailTotal  = enrichedPositions.reduce((sum, p) => sum + p.price * p.count, 0)
    const soldTotal    = enrichedPositions.reduce((sum, p) => sum + p.soldPrice * p.count, 0)
    // Маржа продажи = сумма непустых posMargin (учитывает и обычные, и кредитные позиции)
    const marginFromPositions = enrichedPositions.reduce((sum, p) => sum + (p.margin ?? 0), 0)
    const hasAnyMargin = enrichedPositions.some(p => p.margin !== null)
    const margin = hasPositions && !s.isReturn && hasAnyMargin ? marginFromPositions : null
    const retailDelta = hasPositions ? retailTotal - soldTotal : null
    const normalizedPaymentType = normalizePaymentType(s.paymentType)

    let rcDelta = 0
    let rcBonus = 0
    for (const p of enrichedPositions) {
      if (p.rcDelta !== null) rcDelta += p.rcDelta
      rcBonus += p.rcBonus
    }

    return {
      ...s,
      positions: enrichedPositions,
      paymentType: normalizedPaymentType,
      hasCredit,
      costTotal: hasPositions && !s.isReturn ? costTotal : null,
      margin,
      retailTotal,
      retailDelta,
      rcDelta: rcDelta > 0 ? Math.round(rcDelta) : null,
      rcBonus,
      cashBonus: margin !== null && !hasCredit && s.cashMoney > 0 ? Math.round(margin * 0.025) : 0,
    }
  })
  const filteredSales = salesWithFinance.filter(s => {
    if (paymentType && s.paymentType !== paymentType) return false
    if (positionMode === 'without') return s.margin === null && !s.isReturn
    if (positionMode === 'with') return s.margin !== null
    if (rcBonusMode === 'only') return s.rcBonus > 0
    if (creditMode  === 'only') return s.hasCredit
    return true
  })
  const total = filteredSales.length
  const paginatedSales = filteredSales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const summary = filteredSales.reduce((acc, s) => {
    acc.revenue += s.isReturn ? 0 : s.revenue
    acc.cashMoney += s.isReturn ? 0 : s.cashMoney
    acc.cashBank += s.isReturn ? 0 : s.cashBank
    acc.refund += s.refund
    acc.margin += s.margin ?? 0
    acc.cashBonus += s.cashBonus
    acc.rcBonus += s.rcBonus
    if (s.margin !== null) acc.withMargin++
    if (s.margin === null && !s.isReturn) acc.withoutPositions++
    if (s.hasCredit) acc.withCredit++
    if (s.isReturn || s.refund > 0) acc.returns++
    acc.count++
    return acc
  }, {
    revenue: 0,
    cashMoney: 0,
    cashBank: 0,
    refund: 0,
    margin: 0,
    cashBonus: 0,
    rcBonus: 0,
    withMargin: 0,
    withoutPositions: 0,
    withCredit: 0,
    returns: 0,
    count: 0,
  })
  const paymentTypes = Array.from(new Set(salesWithFinance.map(s => s.paymentType).filter(Boolean)))

  return NextResponse.json({
    sales: paginatedSales,
    total,
    pages: Math.ceil(total / PAGE_SIZE),
    sellers: sellers.map(s => s.sellerName).filter(Boolean),
    shops,
    paymentTypes,
    summary,
  })
}
