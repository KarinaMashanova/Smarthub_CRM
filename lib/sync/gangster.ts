import { prisma } from '@/lib/db'

export async function calcGangsterBonuses(opts?: { fromDate?: Date; toDate?: Date }) {
  const { fromDate, toDate } = opts ?? {}

  // ── Салоны (с группами) ───────────────────────────────────────────────────
  const shops = await prisma.shop.findMany({
    where: { isVisible: true },
    select: { id: true, name: true, gangsterThreshold: true, groupId: true },
  })
  const shopByName = new Map(shops.map(s => [s.name, s]))

  // ── Группы ────────────────────────────────────────────────────────────────
  const groups = await prisma.shopGroup.findMany({
    where: { threshold: { not: null } },
    select: { id: true, name: true, threshold: true, shops: { select: { name: true } } },
  })
  // shopName → groupId
  const shopNameToGroupId = new Map<string, number>()
  for (const g of groups) {
    for (const s of g.shops) shopNameToGroupId.set(s.name, g.id)
  }

  // ── Расписание ────────────────────────────────────────────────────────────
  const slotWhere: any = { employeeName: { not: null } }
  if (fromDate || toDate) {
    slotWhere.date = {}
    if (fromDate) slotWhere.date.gte = fromDate
    if (toDate)   slotWhere.date.lte = toDate
  }
  const slots = await prisma.scheduleSlot.findMany({
    where: slotWhere,
    select: { date: true, employeeName: true, location: true },
  })

  // день__сотрудник → shopName
  const dayEmpShop = new Map<string, string>()
  for (const slot of slots) {
    const key = `${slot.date.toISOString().slice(0, 10)}__${slot.employeeName}`
    if (!dayEmpShop.has(key)) dayEmpShop.set(key, slot.location)
  }

  // ── Маржа из заказов ──────────────────────────────────────────────────────
  const orderFilter: any = { order: { isVisible: true, isReturn: false, managerName: { not: null } } }
  if (fromDate || toDate) {
    orderFilter.order.dateClose = {}
    if (fromDate) orderFilter.order.dateClose.gte = fromDate
    if (toDate)   orderFilter.order.dateClose.lte = toDate
  }
  const orderPositions = await prisma.orderPosition.findMany({
    where: orderFilter,
    select: { soldPrice: true, count: true, purchasePriceSumm: true, order: { select: { managerName: true, dateClose: true } } },
  })
  const marginByKey = new Map<string, number>()
  for (const pos of orderPositions) {
    const { managerName, dateClose } = pos.order
    if (!managerName || !dateClose) continue
    const key = `${dateClose.toISOString().slice(0, 10)}__${managerName}`
    marginByKey.set(key, (marginByKey.get(key) ?? 0) + pos.soldPrice * pos.count - pos.purchasePriceSumm)
  }

  // ── Маржа из продаж ───────────────────────────────────────────────────────
  const saleFilter: any = { isWork: false, sale: { isReturn: false, sellerName: { not: null } } }
  if (fromDate || toDate) {
    saleFilter.sale.date = {}
    if (fromDate) saleFilter.sale.date.gte = fromDate
    if (toDate)   saleFilter.sale.date.lte = toDate
  }
  const salePositions = await prisma.salePosition.findMany({
    where: saleFilter,
    select: { soldPrice: true, count: true, purchasePriceSumm: true, sale: { select: { sellerName: true, date: true } } },
  })
  for (const pos of salePositions) {
    const { sellerName, date } = pos.sale
    if (!sellerName || !date) continue
    const key = `${date.toISOString().slice(0, 10)}__${sellerName}`
    marginByKey.set(key, (marginByKey.get(key) ?? 0) + pos.soldPrice * pos.count - pos.purchasePriceSumm)
  }

  // ── Существующие бонусы Гангстер ──────────────────────────────────────────
  const existingWhere: any = { actionType: 'Бонус', subType: 'За Гангстера', source: 'AUTO' }
  if (fromDate || toDate) {
    existingWhere.date = {}
    if (fromDate) existingWhere.date.gte = fromDate
    if (toDate)   existingWhere.date.lte = toDate
  }
  const existingBonuses = await prisma.targetAction.findMany({
    where: existingWhere,
    select: { id: true, employeeName: true, date: true },
  })
  const existingMap = new Map<string, number>()
  for (const b of existingBonuses) {
    existingMap.set(`${b.date.toISOString().slice(0, 10)}__${b.employeeName}`, b.id)
  }

  // ── Вычисляем кто должен получить бонус ──────────────────────────────────
  let created = 0, deleted = 0
  const shouldHave = new Set<string>()

  // Логика для групп (ТЦ): суммируем маржу всех сотрудников группы за день
  for (const group of groups) {
    if (!group.threshold) continue
    const groupShopNames = new Set(group.shops.map(s => s.name))

    // Собираем: день → Set<сотрудников в этой группе>
    const dayToEmps = new Map<string, Set<string>>()
    for (const [key, shopName] of dayEmpShop.entries()) {
      if (!groupShopNames.has(shopName)) continue
      const day = key.split('__')[0]
      if (!dayToEmps.has(day)) dayToEmps.set(day, new Set())
      dayToEmps.get(day)!.add(key.split('__')[1])
    }

    for (const [day, emps] of dayToEmps.entries()) {
      // Суммируем маржу всех сотрудников группы за этот день
      let totalMargin = 0
      for (const emp of emps) totalMargin += marginByKey.get(`${day}__${emp}`) ?? 0

      if (totalMargin < group.threshold) continue

      // Всем сотрудникам начисляем бонус
      for (const empName of emps) {
        const key = `${day}__${empName}`
        shouldHave.add(key)
        if (existingMap.has(key)) continue

        await prisma.targetAction.create({
          data: {
            date:         new Date(day),
            actionType:   'Бонус',
            subType:      'За Гангстера',
            employeeName: empName,
            amount:       1000,
            source:       'AUTO',
            comment:      `${group.name} · суммарная маржа: ${Math.round(totalMargin).toLocaleString('ru-RU')} ₽`,
          },
        })
        created++
      }
    }
  }

  // Логика для одиночных салонов (без группы): маржа конкретного сотрудника
  for (const [key, shopName] of dayEmpShop.entries()) {
    const shop = shopByName.get(shopName)
    if (!shop?.gangsterThreshold) continue   // нет индивидуального порога
    if (shop.groupId !== null) continue       // в группе — пропускаем

    const margin = marginByKey.get(key) ?? 0
    if (margin < shop.gangsterThreshold) continue

    shouldHave.add(key)
    if (existingMap.has(key)) continue

    const [day, empName] = key.split('__')
    await prisma.targetAction.create({
      data: {
        date:         new Date(day),
        actionType:   'Бонус',
        subType:      'За Гангстера',
        employeeName: empName,
        amount:       1000,
        source:       'AUTO',
        comment:      `${shopName} · маржа за день: ${Math.round(margin).toLocaleString('ru-RU')} ₽`,
      },
    })
    created++
  }

  // Удаляем устаревшие бонусы
  for (const [key, id] of existingMap.entries()) {
    if (!shouldHave.has(key)) {
      await prisma.targetAction.delete({ where: { id } })
      deleted++
    }
  }

  return { created, deleted }
}
