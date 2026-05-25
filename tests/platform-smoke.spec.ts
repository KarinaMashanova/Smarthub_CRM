import 'dotenv/config'
import { expect, test, type BrowserContext } from '@playwright/test'
import { SignJWT } from 'jose'
import pg from 'pg'
import { SESSION_COOKIE_NAME } from '../lib/auth/session'

type AppRole = 'ADMIN' | 'MANAGER'
interface TestEmployee {
  id: string
  name: string
  appRole: AppRole
  shopId: string
}

const COMMON_PAGES = ['/orders', '/sales', '/cash', '/schedule', '/salary', '/knowledge']
const ADMIN_PAGES = ['/admin', '/admin/managers', '/admin/sync', '/reports']
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000'
const pool = new pg.Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL })

async function buildSessionCookie(employee: TestEmployee) {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'smarthub-dev-secret-change-in-prod')
  const token = await new SignJWT({
      employeeId: employee.id,
      name: employee.name,
      role: employee.appRole,
      shopId: employee.shopId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('2h')
    .sign(secret)

  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    domain: new URL(BASE_URL).hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax' as const,
  }
}

async function getEmployeeByRole(role: AppRole) {
  const { rows } = await pool.query<TestEmployee>(
    'select id, name, "appRole", "shopId" from "Employee" where "appRole" = $1 and "isPasswordSet" = true order by name asc limit 1',
    [role],
  )
  const employee = rows[0]
  if (!employee) throw new Error(`No ${role} employee with password found`)
  return employee
}

async function sessionCookie(role: AppRole) {
  return buildSessionCookie(await getEmployeeByRole(role))
}

async function loginAs(context: BrowserContext, role: AppRole) {
  await context.addCookies([await sessionCookie(role)])
}

async function loginEmployee(context: BrowserContext, employee: TestEmployee) {
  await context.addCookies([await buildSessionCookie(employee)])
}

async function expectHealthyPage(page: import('@playwright/test').Page, path: string) {
  const response = await page.goto(path)
  expect(response?.status(), path).toBeLessThan(400)
  await expect(page.locator('body')).not.toContainText('Сессия истекла')
  await expect(page.locator('body')).not.toContainText('Application error')
  await expect(page.locator('body')).not.toContainText('Internal Server Error')
}

test.afterAll(async () => {
  await pool.end()
})

test.describe('admin mode', () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, 'ADMIN')
  })

  test('opens platform pages and admin-only reports', async ({ page }) => {
    for (const path of [...COMMON_PAGES, ...ADMIN_PAGES]) {
      await expectHealthyPage(page, path)
    }

    await expect(page.getByRole('link', { name: 'Отчёты', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Синхронизация', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Сотрудники', exact: true })).toBeVisible()
  })

  test('reports api returns symmetric datasets', async ({ page }) => {
    const res = await page.request.get('/api/reports/orders?from=2026-05-01&to=2026-05-25')
    expect(res.status()).toBe(200)
    const data = await res.json()

    expect(Array.isArray(data.byManager)).toBe(true)
    expect(Array.isArray(data.byPayment)).toBe(true)
    expect(Array.isArray(data.byProductGroup)).toBe(true)
    expect(Array.isArray(data.byShopByDay)).toBe(true)

    for (const row of data.byManager) {
      expect(row).toHaveProperty('orders')
      expect(row).toHaveProperty('sales')
      expect(row).toHaveProperty('totalRevenue')
      expect(row).toHaveProperty('totalMargin')
    }

    for (const row of data.byPayment) {
      expect(row).toHaveProperty('orders')
      expect(row).toHaveProperty('sales')
      expect(row).toHaveProperty('totalRevenue')
    }
  })
})

test.describe('manager mode', () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, 'MANAGER')
  })

  test('opens manager pages without admin navigation', async ({ page }) => {
    for (const path of COMMON_PAGES) {
      await expectHealthyPage(page, path)
    }

    await expect(page.getByRole('link', { name: 'Сотрудники', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Синхронизация', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Отчёты', exact: true })).toHaveCount(0)
  })

  test('does not expose admin reports api', async ({ page }) => {
    const res = await page.request.get('/api/reports/orders?from=2026-05-01&to=2026-05-25')
    expect(res.status()).toBe(403)
  })

  test('cash shops come from schedule', async ({ context, page }) => {
    const { rows } = await pool.query<TestEmployee & { location: string }>(
      `select e.id, e.name, e."appRole", e."shopId", s.location
       from "ScheduleSlot" s
       join "Shop" sh on sh.name = s.location
       join "Employee" e on e.name = s."employeeName"
       where e."appRole" = 'MANAGER'
         and s.date >= $1::date
         and s.date <= $2::date
       order by s.date asc, e.name asc
       limit 1`,
      ['2026-05-01', '2026-05-25'],
    )
    const employee = rows[0]
    if (!employee) {
      test.skip(true, 'no scheduled manager found')
      return
    }

    await context.clearCookies()
    await loginEmployee(context, employee)

    const res = await page.request.get('/api/cash?from=2026-05-01&to=2026-05-25T23:59:59')
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.shops.map((shop: { name: string }) => shop.name)).toContain(employee.location)
  })
})

test.describe('mobile layout', () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, 'ADMIN')
  })

  test('key pages fit mobile viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only check')

    for (const path of ['/orders', '/sales', '/cash', '/schedule', '/salary', '/reports']) {
      await expectHealthyPage(page, path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(8)
    }
  })
})
