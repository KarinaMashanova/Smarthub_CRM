import { prisma } from '@/lib/db'
import { syncShops } from './shops'
import { syncOrdersDelta, syncOrdersRange } from './orders'
import { syncSalesDelta, syncSalesRange } from './sales'
import { syncEmployees } from './employees'

async function logSync(entity: string, fn: () => Promise<number>) {
  const log = await prisma.syncLog.create({ data: { entity, status: 'running' } })
  try {
    const count = await fn()
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'ok', count, finishedAt: new Date() },
    })
    return count
  } catch (error: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'error', error: error.message, finishedAt: new Date() },
    })
    throw error
  }
}

async function allShopIds() {
  const shops = await prisma.shop.findMany({ select: { id: true } })
  return shops.map(s => s.id)
}

// Каждые 15 минут
export async function runDeltaSync() {
  const ids = await allShopIds()
  await logSync('orders_delta',   () => syncOrdersDelta(ids))
  await logSync('sales_delta',    () => syncSalesDelta(ids))
}

// Раз в неделю — магазины + сотрудники
export async function runWeeklySync() {
  await logSync('shops', syncShops)
  const ids = await allShopIds()
  await logSync('employees', () => syncEmployees(ids))
}

// Восстановление данных за произвольный период
export async function runBackfillSync(from: Date, to: Date): Promise<{ orders: number; sales: number }> {
  const ids = await allShopIds()
  const orders = await logSync('orders_backfill', () => syncOrdersRange(ids, from, to))
  const sales  = await logSync('sales_backfill',  () => syncSalesRange(ids, from, to))
  return { orders, sales }
}
