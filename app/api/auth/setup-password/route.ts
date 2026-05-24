import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { prisma } from '@/lib/db'

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'smarthub-dev-secret-change-in-prod')
const COOKIE = 'smarthub_session'

export async function POST(req: Request) {
  try {
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
