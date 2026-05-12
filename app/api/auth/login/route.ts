import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { createSession } from '@/lib/auth/session'

export async function POST(req: Request) {
  const { name, password } = await req.json()

  if (!name || !password) {
    return NextResponse.json({ error: 'Заполните все поля' }, { status: 400 })
  }

  const employee = await prisma.employee.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' }, appRole: { not: null } },
  })

  if (!employee) {
    return NextResponse.json({ error: 'Менеджер не найден' }, { status: 401 })
  }

  if (!employee.isPasswordSet || !employee.passwordHash) {
    return NextResponse.json({ error: 'setup_required', employeeId: employee.id }, { status: 403 })
  }

  const valid = await bcrypt.compare(password, employee.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 })
  }

  await createSession({
    employeeId: employee.id,
    name: employee.name,
    role: employee.appRole!,
    shopId: employee.shopId,
  })

  return NextResponse.json({ ok: true, role: employee.appRole })
}
