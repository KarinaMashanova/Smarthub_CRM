import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth/session'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()

  const data: Record<string, unknown> = {}

  if ('appRole' in body) {
    data.appRole = body.appRole ?? null
    if (body.appRole === null) {
      data.passwordHash  = null
      data.isPasswordSet = false
    }
  }

  if (body.resetPassword) {
    data.passwordHash  = null
    data.isPasswordSet = false
  }

  await prisma.employee.update({ where: { id }, data })

  return NextResponse.json({ ok: true })
}
