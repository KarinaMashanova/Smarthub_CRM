import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role === 'MANAGER') return NextResponse.json([session.name])

  // Все уникальные имена из расписания (+ из Employee таблицы)
  const [fromSchedule, fromEmployees] = await Promise.all([
    prisma.scheduleSlot.findMany({
      where: { employeeName: { not: null } },
      select: { employeeName: true },
      distinct: ['employeeName'],
    }),
    prisma.employee.findMany({ select: { name: true } }),
  ])

  const names = new Set<string>()
  fromSchedule.forEach(s => s.employeeName && names.add(s.employeeName))
  fromEmployees.forEach(e => names.add(e.name))

  return NextResponse.json(Array.from(names).sort())
}
