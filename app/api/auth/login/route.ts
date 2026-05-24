import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { prisma } from '@/lib/db'

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'smarthub-dev-secret-change-in-prod')
const COOKIE = 'smarthub_session'

export async function POST(req: Request) {
  try {
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

    const token = await new SignJWT({
      employeeId: employee.id,
      name: employee.name,
      role: employee.appRole,
      shopId: employee.shopId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(SECRET)

    const response = NextResponse.json({ ok: true, role: employee.appRole })
    response.cookies.set(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
    return response
  } catch (e: any) {
    return NextResponse.json({ error: 'internal', detail: e?.message ?? String(e) }, { status: 500 })
  }
}
