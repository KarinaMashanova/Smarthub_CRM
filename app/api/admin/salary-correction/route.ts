import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

// POST: установить корректировку оклада для сотрудника за период.
// Удаляет существующие корректировки за период и создаёт новую с delta-суммой.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    employeeName: string
    from: string     // ISO date — начало периода
    to: string       // ISO date — конец периода
    estimatedSalary: number  // рассчитанный оклад (для вычисления дельты)
    correctedSalary: number  // скорректированный оклад (что должно быть)
  }

  const { employeeName, from, to, estimatedSalary, correctedSalary } = body
  if (!employeeName || correctedSalary === undefined) {
    return NextResponse.json({ error: 'employeeName and correctedSalary required' }, { status: 400 })
  }

  const fromDate = new Date(from)
  const toDate   = new Date(to + 'T23:59:59')
  const delta    = Math.round(correctedSalary - estimatedSalary)

  // Удаляем предыдущие корректировки за период
  await prisma.targetAction.deleteMany({
    where: {
      employeeName,
      actionType: 'Доначисление Оклада',
      subType: 'Корректировка оклада',
      date: { gte: fromDate, lte: toDate },
    },
  })

  // Если дельта нулевая — просто удалили, ничего не создаём
  if (delta === 0) {
    return NextResponse.json({ ok: true, delta: 0 })
  }

  const action = await prisma.targetAction.create({
    data: {
      date:         fromDate,
      actionType:   'Доначисление Оклада',
      subType:      'Корректировка оклада',
      employeeName,
      amount:       delta,
      comment:      `Корректировка: ${estimatedSalary.toLocaleString('ru-RU')} → ${correctedSalary.toLocaleString('ru-RU')} ₽`,
      source:       'MANUAL',
      responsibleName: session.name,
    },
  })

  return NextResponse.json({ ok: true, delta, action })
}
