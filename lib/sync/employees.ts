import { prisma } from '@/lib/db'
import { fetchAllPages } from '@/lib/livesklad/client'

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
      fetchAllPages<any>((page) => `/shops/${shopId}/customers?page=${page}&pageSize=100`, 100),
      fetchAllPages<any>((page) => `/shops/${shopId}/customers/masters?page=${page}&pageSize=100`, 100),
      fetchAllPages<any>((page) => `/shops/${shopId}/customers/managers?page=${page}&pageSize=100`, 100),
    ])

    const masterIds  = new Set(mastersData.map((e: any) => e.id))
    const managerIds = new Set(managersData.map((e: any) => e.id))

    for (const emp of allData) {
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
