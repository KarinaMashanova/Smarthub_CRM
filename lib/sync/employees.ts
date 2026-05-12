import { prisma } from '@/lib/db'
import { liveskladFetch } from '@/lib/livesklad/client'

// Имена сотрудников которые получают роль ADMIN в Smarthub
const ADMIN_NAMES = [
  'Иванов Илья',
  'Осипов Андрей',
  'Иванов Денис',
  'Глаз Бога',
  'Кушев Олег',
  'Петрова Людмила',
  'Шмелева Татьяна',
]

export async function syncEmployees(shopIds: string[]) {
  let count = 0

  for (const shopId of shopIds) {
    const [allData, mastersData, managersData] = await Promise.all([
      liveskladFetch(`/shops/${shopId}/customers?pageSize=50`),
      liveskladFetch(`/shops/${shopId}/customers/masters?pageSize=50`),
      liveskladFetch(`/shops/${shopId}/customers/managers?pageSize=50`),
    ])

    const masterIds  = new Set((mastersData.data  ?? []).map((e: any) => e.id))
    const managerIds = new Set((managersData.data ?? []).map((e: any) => e.id))

    for (const emp of allData.data ?? []) {
      const isMaster  = masterIds.has(emp.id)
      const isManager = managerIds.has(emp.id)
      const role = isMaster && isManager ? 'all' : isMaster ? 'master' : 'manager'

      // Синк не трогает поля авторизации (appRole, passwordHash, isPasswordSet)
      await prisma.employee.upsert({
        where: { id: emp.id },
        update: { name: emp.name, role, shopId },
        create: {
          id: emp.id,
          name: emp.name,
          role,
          shopId,
          // Устанавливаем appRole только при создании
          appRole: (role === 'manager' || role === 'all')
            ? (ADMIN_NAMES.includes(emp.name) ? 'ADMIN' : 'MANAGER')
            : null,
        },
      })
      count++
    }
  }
  return count
}
