import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { createSession } from '@/lib/auth/session'

export async function POST(req: Request) {
  const { employeeId, password } = await req.json()

  if (!employeeId || !password || password.length < 6) {
    return NextResponse.json({ error: 'Пароль минимум 6 символов' }, { status: 400 })
  }

  const employee = await prisma.employee.findUnique({ where: { id: String(employeeId) } })
  if (!employee) return NextResponse.json({ error: 'Не найден' }, { status: 404 })
  if (!employee.appRole) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  if (employee.isPasswordSet) return NextResponse.json({ error: 'Пароль уже установлен' }, { status: 400 })

  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.employee.update({
    where: { id: employee.id },
    data: { passwordHash, isPasswordSet: true },
  })

  await createSession({
    employeeId: employee.id,
    name: employee.name,
    role: employee.appRole!,
    shopId: employee.shopId,
  })

  return NextResponse.json({ ok: true, role: employee.appRole })
}
